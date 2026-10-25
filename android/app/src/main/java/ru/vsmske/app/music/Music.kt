package ru.vsmske.app.music

import android.content.ComponentName
import android.content.Context
import android.os.SystemClock
import android.util.Base64
import androidx.media3.common.PlaybackParameters
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
        val at: Long = 0,            // когда снята позиция (elapsedRealtime) — для плавного текста песни
        val speed: Float = 1f,
        val pitch: Boolean = true,   // сохранять тон при смене скорости
        val sleepAt: Long = 0,       // таймер сна: когда выключить (elapsedRealtime), 0 — нет
        val sleepEnd: Boolean = false, // выключить в конце трека
    ) {
        val track: Track? get() = queue.getOrNull(index)
        /** Позиция «сейчас» с поправкой на время с последнего опроса */
        fun smooth(): Long = if (!playing) position else (position + ((SystemClock.elapsedRealtime() - at) * speed).toLong()).coerceAtMost(duration.takeIf { it > 0 } ?: Long.MAX_VALUE)
    }

    val state = MutableStateFlow(State())
    private var ctl: MediaController? = null
    private var pending: ((MediaController) -> Unit)? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var shared = ""

    private var prefs: android.content.SharedPreferences? = null

    fun connect(ctx: Context) {
        if (prefs == null) {
            val p = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE); prefs = p
            state.value = state.value.copy(speed = p.getFloat("rate", 1f), pitch = p.getBoolean("pitch", true))
            Eq.load(ctx)
        }
        if (ctl != null) return
        val f = MediaController.Builder(ctx, SessionToken(ctx, ComponentName(ctx, PlaybackService::class.java))).buildAsync()
        f.addListener({
            val c = runCatching { f.get() }.getOrNull() ?: return@addListener
            ctl = c
            c.addListener(object : Player.Listener {
                override fun onEvents(player: Player, events: Player.Events) = sync()
                override fun onPlayerError(error: PlaybackException) { state.value = state.value.copy(error = "Не получилось включить трек", buffering = false) }
            })
            applySpeed()
            pending?.invoke(c); pending = null
            sync()
        }, MoreExecutors.directExecutor())
        scope.launch { while (true) { if (state.value.playing) { sync(); sleepTick(); statTick() }; delay(250) } }
    }

    /* ---------- Скорость (как vs_rate / vs_pitch на сайте) ---------- */
    fun setSpeed(r: Float, keepPitch: Boolean = state.value.pitch) {
        val v = r.coerceIn(0.5f, 2f)
        state.value = state.value.copy(speed = v, pitch = keepPitch)
        prefs?.edit()?.putFloat("rate", v)?.putBoolean("pitch", keepPitch)?.apply()
        applySpeed()
    }
    private fun applySpeed() {
        val s = state.value
        ctl?.playbackParameters = PlaybackParameters(s.speed, if (s.pitch) 1f else s.speed)
    }

    /* ---------- Таймер сна: последние 10 секунд — плавное затухание ---------- */
    fun sleepIn(min: Int) { state.value = state.value.copy(sleepAt = if (min > 0) SystemClock.elapsedRealtime() + min * 60_000L else 0, sleepEnd = false); ctl?.volume = 1f }
    fun sleepAtEnd() { state.value = state.value.copy(sleepAt = 0, sleepEnd = true); ctl?.volume = 1f }
    fun sleepLeft(): Long = state.value.sleepAt.let { if (it == 0L) 0 else (it - SystemClock.elapsedRealtime()).coerceAtLeast(0) }
    private var sleepIdx = -1
    private fun sleepTick() {
        val c = ctl ?: return
        val s = state.value
        if (s.sleepAt > 0) {
            val left = s.sleepAt - SystemClock.elapsedRealtime()
            if (left <= 0) { c.pause(); c.volume = 1f; state.value = state.value.copy(sleepAt = 0); return }
            c.volume = if (left < 10_000) (left / 10_000f).coerceIn(0f, 1f) else 1f
        } else if (s.sleepEnd) {
            if (sleepIdx == -1) sleepIdx = s.index
            val left = s.duration - s.position
            c.volume = if (s.duration > 0 && left < 8_000) (left / 8_000f).coerceIn(0.05f, 1f) else 1f
            if (s.index != sleepIdx || (s.duration > 0 && left < 300)) { c.pause(); c.volume = 1f; sleepIdx = -1; state.value = state.value.copy(sleepEnd = false) }
        } else sleepIdx = -1
    }

    private fun sync() {
        val c = ctl ?: return
        val s = state.value
        state.value = s.copy(
            index = if (s.queue.isEmpty() || c.mediaItemCount == 0) -1 else c.currentMediaItemIndex,
            playing = c.isPlaying, buffering = c.playbackState == Player.STATE_BUFFERING,
            position = c.currentPosition.coerceAtLeast(0),
            duration = c.duration.takeIf { it > 0 } ?: ((s.track?.duration ?: 0.0) * 1000).toLong(),
            repeat = c.repeatMode, shuffle = c.shuffleModeEnabled, at = SystemClock.elapsedRealtime(),
        )
        val t = state.value.track
        val key = if (t != null && c.isPlaying) t.id else ""
        if (key != shared && prefs?.getBoolean("listen", true) != false) { shared = key; Api.setListening(if (key.isEmpty()) null else t) }
    }

    private fun item(t: Track): MediaItem {
        val meta = MediaMetadata.Builder().setTitle(t.title).setArtist(t.artist.ifEmpty { "Неизвестный исполнитель" }).setAlbumTitle("ВС Музыка")
        if (t.cover.startsWith("data:image/")) runCatching { meta.setArtworkData(Base64.decode(t.cover.substringAfter(','), Base64.DEFAULT), MediaMetadata.PICTURE_TYPE_FRONT_COVER) }
        val uri = if (t.type == "radio") t.fileId else "vsmske://file/${t.fileId}"   // радио — прямой поток с сервера станции
        return MediaItem.Builder().setMediaId(t.id).setUri(uri.toUri()).setMediaMetadata(meta.build()).build()
    }

    private fun with(ctx: Context, a: (MediaController) -> Unit) { val c = ctl; if (c != null) a(c) else { pending = a; connect(ctx) } }

    fun play(ctx: Context, list: List<Track>, start: Int) {
        val s = state.value
        if (s.track?.id == list.getOrNull(start)?.id && s.queue.map { it.id } == list.map { it.id }) { toggle(); return }
        state.value = s.copy(queue = list, index = start, buffering = true, error = null, position = 0)
        with(ctx) { c -> c.setMediaItems(list.map(::item), start, 0); c.prepare(); c.play() }
    }

    fun setPlaying(on: Boolean) { ctl?.let { if (on && !it.isPlaying) it.play() else if (!on && it.isPlaying) it.pause() } }
    /* ---------- Статистика на телефоне (как vs_plays на сайте): трек засчитан после 30 с или половины ---------- */
    private var statId = ""; private var statMs = 0L; private var statDone = false; private var statLast = 0L
    private fun statTick() {
        val s = state.value; val t = s.track ?: return
        val now = SystemClock.elapsedRealtime()
        if (t.id != statId) { statId = t.id; statMs = 0; statDone = false; statLast = now; return }
        val d = now - statLast; statLast = now
        if (d in 1..1000) statMs += (d * s.speed).toLong()   // большой разрыв — была пауза, её не считаем
        if (t.type == "radio") return   // радио в статистику не считаем
        if (!statDone && (statMs >= 30_000 || (s.duration > 0 && statMs >= s.duration / 2))) { statDone = true; countPlay(t.id) }
    }
    private fun countPlay(id: String) {
        val p = prefs ?: return
        val o = runCatching { org.json.JSONObject(p.getString("plays", "{}")!!) }.getOrDefault(org.json.JSONObject())
        val e = o.optJSONObject(id) ?: org.json.JSONObject()
        e.put("n", e.optInt("n") + 1).put("at", System.currentTimeMillis())
        o.put(id, e)
        if (o.length() > 500) {   // храним не больше 500 треков: выбрасываем самые давние
            val old = o.keys().asSequence().toList().sortedBy { o.optJSONObject(it)?.optLong("at") ?: 0 }.take(o.length() - 500)
            old.forEach { o.remove(it) }
        }
        p.edit().putString("plays", o.toString()).putLong("listen_total", p.getLong("listen_total", 0) + 1).apply()
    }
    /** Самые слушаемые: (id трека, сколько раз) */
    fun topPlayed(n: Int = 30): List<Pair<String, Int>> {
        val o = runCatching { org.json.JSONObject(prefs?.getString("plays", "{}") ?: "{}") }.getOrDefault(org.json.JSONObject())
        return o.keys().asSequence().map { it to (o.optJSONObject(it)?.optInt("n") ?: 0) }.filter { it.second > 0 }.sortedByDescending { it.second }.take(n).toList()
    }

    /** Трек изменили (название, обложка, текст) — обновить в очереди, не прерывая игру */
    fun updateTrack(t: Track) {
        val s = state.value
        val i = s.queue.indexOfFirst { it.id == t.id }; if (i < 0) return
        val old = s.queue[i]
        state.value = s.copy(queue = s.queue.toMutableList().also { it[i] = t })
        if (old.title != t.title || old.artist != t.artist || old.cover != t.cover) runCatching { ctl?.replaceMediaItem(i, item(t)) }
    }

    fun toggle() { ctl?.let { if (it.isPlaying) it.pause() else it.play() } }
    fun next() { ctl?.let { if (it.hasNextMediaItem()) it.seekToNextMediaItem() } }
    fun prev() { ctl?.let { if (it.currentPosition > 3000 || !it.hasPreviousMediaItem()) it.seekTo(0) else it.seekToPreviousMediaItem() } }
    fun seek(ms: Long) { ctl?.seekTo(ms); state.value = state.value.copy(position = ms) }
    fun jump(i: Int) { ctl?.let { it.seekTo(i, 0); it.play() } }
    /** Сыграть следующим (после текущего) */
    fun playNext(ctx: Context, t: Track) {
        val s = state.value
        if (s.track == null) { play(ctx, listOf(t), 0); return }
        val at = s.index + 1
        state.value = s.copy(queue = s.queue.toMutableList().also { it.add(at, t) })
        ctl?.addMediaItem(at, item(t))
    }
    fun removeAt(i: Int) {
        val s = state.value
        if (i == s.index || i !in s.queue.indices) return
        state.value = s.copy(queue = s.queue.toMutableList().also { it.removeAt(i) }, index = if (i < s.index) s.index - 1 else s.index)
        ctl?.removeMediaItem(i)
    }
    fun cycleRepeat() { ctl?.let { it.repeatMode = when (it.repeatMode) { Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL; Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE; else -> Player.REPEAT_MODE_OFF } } }
    fun toggleShuffle() { ctl?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled } }
    fun stop() { ctl?.let { it.stop(); it.clearMediaItems() }; state.value = State(speed = state.value.speed, pitch = state.value.pitch) }
    fun clearError() { state.value = state.value.copy(error = null) }
}
