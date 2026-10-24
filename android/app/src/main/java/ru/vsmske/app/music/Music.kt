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
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Track

/** Плеер для экранов: очередь, текущий трек, позиция. Само воспроизведение — в PlaybackService. */
object Music {
    data class State(
        val queue: List<Track> = emptyList(),
        val index: Int = -1,
        val playing: Boolean = false,
        val buffering: Boolean = false,
        val position: Long = 0,
        val duration: Long = 0,
        val repeat: Int = Player.REPEAT_MODE_OFF,
        val shuffle: Boolean = false,
        val error: String? = null,
    ) { val track: Track? get() = queue.getOrNull(index) }

    val state = MutableStateFlow(State())
    private var ctl: MediaController? = null
    private var pending: ((MediaController) -> Unit)? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var shared = ""

    fun connect(ctx: Context) {
        if (ctl != null) return
        val f = MediaController.Builder(ctx, SessionToken(ctx, ComponentName(ctx, PlaybackService::class.java))).buildAsync()
        f.addListener({
            val c = runCatching { f.get() }.getOrNull() ?: return@addListener
            ctl = c
            c.addListener(object : Player.Listener {
                override fun onEvents(player: Player, events: Player.Events) = sync()
                override fun onPlayerError(error: PlaybackException) { state.value = state.value.copy(error = "Не получилось включить трек", buffering = false) }
            })
            pending?.invoke(c); pending = null
            sync()
        }, MoreExecutors.directExecutor())
        scope.launch { while (true) { if (state.value.playing) sync(); delay(250) } }
    }

    private fun sync() {
        val c = ctl ?: return
        val s = state.value
        state.value = s.copy(
            index = if (s.queue.isEmpty() || c.mediaItemCount == 0) -1 else c.currentMediaItemIndex,
            playing = c.isPlaying, buffering = c.playbackState == Player.STATE_BUFFERING,
            position = c.currentPosition.coerceAtLeast(0),
            duration = c.duration.takeIf { it > 0 } ?: ((s.track?.duration ?: 0.0) * 1000).toLong(),
            repeat = c.repeatMode, shuffle = c.shuffleModeEnabled,
        )
        val t = state.value.track
        val key = if (t != null && c.isPlaying) t.id else ""
        if (key != shared) { shared = key; Api.setListening(if (key.isEmpty()) null else t) }
    }

    private fun item(t: Track): MediaItem {
        val meta = MediaMetadata.Builder().setTitle(t.title).setArtist(t.artist.ifEmpty { "Неизвестный исполнитель" }).setAlbumTitle("ВС Музыка")
        if (t.cover.startsWith("data:image/")) runCatching { meta.setArtworkData(Base64.decode(t.cover.substringAfter(','), Base64.DEFAULT), MediaMetadata.PICTURE_TYPE_FRONT_COVER) }
        return MediaItem.Builder().setMediaId(t.id).setUri("vsmske://file/${t.fileId}".toUri()).setMediaMetadata(meta.build()).build()
    }

    private fun with(ctx: Context, a: (MediaController) -> Unit) { val c = ctl; if (c != null) a(c) else { pending = a; connect(ctx) } }

    fun play(ctx: Context, list: List<Track>, start: Int) {
        val s = state.value
        if (s.track?.id == list.getOrNull(start)?.id && s.queue.map { it.id } == list.map { it.id }) { toggle(); return }
        state.value = s.copy(queue = list, index = start, buffering = true, error = null, position = 0)
        with(ctx) { c -> c.setMediaItems(list.map(::item), start, 0); c.prepare(); c.play() }
    }

    fun toggle() { ctl?.let { if (it.isPlaying) it.pause() else it.play() } }
    fun next() { ctl?.let { if (it.hasNextMediaItem()) it.seekToNextMediaItem() } }
    fun prev() { ctl?.let { if (it.currentPosition > 3000 || !it.hasPreviousMediaItem()) it.seekTo(0) else it.seekToPreviousMediaItem() } }
    fun seek(ms: Long) { ctl?.seekTo(ms); state.value = state.value.copy(position = ms) }
    fun jump(i: Int) { ctl?.let { it.seekTo(i, 0); it.play() } }
    fun cycleRepeat() { ctl?.let { it.repeatMode = when (it.repeatMode) { Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL; Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE; else -> Player.REPEAT_MODE_OFF } } }
    fun toggleShuffle() { ctl?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled } }
    fun stop() { ctl?.let { it.stop(); it.clearMediaItems() }; state.value = State() }
    fun clearError() { state.value = state.value.copy(error = null) }
}
