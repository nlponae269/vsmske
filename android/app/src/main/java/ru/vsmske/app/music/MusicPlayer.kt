package ru.vsmske.app.music

import android.content.ComponentName
import android.content.Context
import android.util.Base64
import androidx.core.net.toUri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.MoreExecutors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Track

/** Плеер для экранов: очередь треков, что играет, позиция. Само воспроизведение — в PlaybackService. */
object MusicPlayer {
    data class State(
        val queue: List<Track> = emptyList(),
        val index: Int = -1,
        val playing: Boolean = false,
        val loading: Boolean = false,
        val position: Long = 0,
        val duration: Long = 0,
        val repeat: Int = Player.REPEAT_MODE_OFF,
        val shuffle: Boolean = false,
        val error: String? = null,
    ) {
        val track: Track? get() = queue.getOrNull(index)
    }

    val state = MutableStateFlow(State())
    private var controller: MediaController? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var pendingAction: ((MediaController) -> Unit)? = null
    private var lastShared = ""

    fun connect(ctx: Context) {
        if (controller != null) return
        val token = SessionToken(ctx, ComponentName(ctx, PlaybackService::class.java))
        val f = MediaController.Builder(ctx, token).buildAsync()
        f.addListener({
            val c = runCatching { f.get() }.getOrNull() ?: return@addListener
            controller = c
            c.addListener(object : Player.Listener {
                override fun onEvents(player: Player, events: Player.Events) = sync()
                override fun onPlayerError(error: PlaybackException) {
                    state.value = state.value.copy(error = "Не удалось включить трек", loading = false)
                }
            })
            pendingAction?.invoke(c); pendingAction = null
            sync()
        }, MoreExecutors.directExecutor())
        scope.launch { while (isActive) { if (state.value.playing) sync(); delay(500) } }
    }

    private fun sync() {
        val c = controller ?: return
        val s = state.value
        val idx = if (c.mediaItemCount == 0) -1 else c.currentMediaItemIndex
        state.value = s.copy(
            index = if (s.queue.isEmpty()) -1 else idx,
            playing = c.isPlaying, loading = c.playbackState == Player.STATE_BUFFERING,
            position = c.currentPosition.coerceAtLeast(0), duration = c.duration.takeIf { it > 0 } ?: ((s.track?.duration ?: 0.0) * 1000).toLong(),
            repeat = c.repeatMode, shuffle = c.shuffleModeEnabled,
        )
        // «сейчас слушает» в профиле, как на сайте
        val t = state.value.track
        val key = if (t != null && c.isPlaying) t.id else ""
        if (key != lastShared && (key.isNotEmpty() || lastShared.isNotEmpty())) {
            lastShared = key
            Repo.setListening(t?.title?.takeIf { key.isNotEmpty() }, t?.artist)
        }
    }

    private fun item(t: Track): MediaItem {
        val meta = MediaMetadata.Builder().setTitle(t.title).setArtist(t.artist.ifEmpty { "Неизвестный исполнитель" })
        if (t.cover.startsWith("data:image/")) runCatching {
            meta.setArtworkData(Base64.decode(t.cover.substringAfter(","), Base64.DEFAULT), MediaMetadata.PICTURE_TYPE_FRONT_COVER)
        }
        return MediaItem.Builder().setMediaId(t.id).setUri("vsmske://file/${t.fileId}".toUri()).setMediaMetadata(meta.build()).build()
    }

    private fun withController(ctx: Context, a: (MediaController) -> Unit) {
        val c = controller
        if (c != null) a(c) else { pendingAction = a; connect(ctx) }
    }

    fun play(ctx: Context, list: List<Track>, start: Int) {
        val cur = state.value
        if (cur.queue.map { it.id } == list.map { it.id } && cur.index == start) { toggle(); return }
        state.value = cur.copy(queue = list, index = start, loading = true, error = null)
        withController(ctx) { c ->
            c.setMediaItems(list.map(::item), start, 0)
            c.prepare(); c.play()
        }
    }

    fun toggle() { controller?.let { if (it.isPlaying) it.pause() else it.play() } }
    fun next() { controller?.let { if (it.hasNextMediaItem()) it.seekToNextMediaItem() } }
    fun prev() { controller?.let { if (it.currentPosition > 3000 || !it.hasPreviousMediaItem()) it.seekTo(0) else it.seekToPreviousMediaItem() } }
    fun seek(ms: Long) { controller?.seekTo(ms); state.value = state.value.copy(position = ms) }
    fun jump(i: Int) { controller?.let { it.seekTo(i, 0); it.play() } }
    fun cycleRepeat() {
        controller?.let { it.repeatMode = when (it.repeatMode) { Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL; Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE; else -> Player.REPEAT_MODE_OFF } }
    }
    fun toggleShuffle() { controller?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled } }
    fun close() {
        controller?.let { it.stop(); it.clearMediaItems() }
        state.value = State()
    }
    fun clearError() { state.value = state.value.copy(error = null) }
}
