package ru.vsmske.app.music

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock
import android.util.Base64
import java.io.File
import kotlin.math.roundToInt

/**
 * Голосовое сообщение: AAC 32 кбит/с, моно, до 60 секунд (как на сайте) → dataURL `data:audio/mp4;base64,…`
 * (минута ≈ 320 000 символов — правила пускают до 700 000). Сайт такие голосовые проигрывает.
 */
class VoiceRec(ctx: Context, private val onMax: () -> Unit) {
    private val file = File(ctx.cacheDir, "voice-${System.nanoTime()}.m4a")
    private var r: MediaRecorder? = null
    private val t0 = SystemClock.elapsedRealtime()
    @Volatile private var maxReached = false

    init {
        @Suppress("DEPRECATION")
        val m = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(ctx) else MediaRecorder()
        try {
            m.setAudioSource(MediaRecorder.AudioSource.MIC)
            m.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            m.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            m.setAudioChannels(1)
            m.setAudioSamplingRate(22_050)
            m.setAudioEncodingBitRate(32_000)
            m.setMaxDuration(MAX_MS)
            m.setOnInfoListener { _, what, _ -> if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) { maxReached = true; onMax() } }
            m.setOutputFile(file.absolutePath)
            m.prepare()
            m.start()
            r = m
        } catch (e: Exception) { m.release(); file.delete(); throw IllegalStateException("Не получилось включить микрофон") }
    }

    fun elapsed(): Long = (SystemClock.elapsedRealtime() - t0).coerceAtMost(MAX_MS.toLong())
    /** Громкость 0..1 — для индикатора */
    fun level(): Float = runCatching { (r?.maxAmplitude ?: 0) / 32767f }.getOrDefault(0f).coerceIn(0f, 1f)

    /** Закончить запись: dataURL и длительность в секундах; null — слишком коротко или не записалось */
    fun finish(): Pair<String, Double>? {
        val sec = elapsed() / 1000.0
        val stopped = runCatching { r?.stop() }.isSuccess || maxReached   // после 60 с запись уже закрыта сама
        runCatching { r?.release() }; r = null
        try {
            if (!stopped || sec < 0.7 || !file.exists() || file.length() < 512) return null
            val url = "data:audio/mp4;base64," + Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
            if (url.length > 690_000) return null
            return url to ((minOf(sec, 60.0) * 10).roundToInt() / 10.0)
        } finally { file.delete() }
    }

    fun cancel() { runCatching { r?.stop() }; runCatching { r?.release() }; r = null; file.delete() }

    companion object { const val MAX_MS = 60_000 }
}
