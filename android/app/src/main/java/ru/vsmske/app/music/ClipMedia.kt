package ru.vsmske.app.music

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.OptIn
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.OverlaySettings
import androidx.media3.effect.Presentation
import androidx.media3.transformer.AudioEncoderSettings
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import com.google.common.collect.ImmutableList
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.coroutineScope
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * ВС Видео и ВС Музыка: сильное сжатие на телефоне перед загрузкой (Media3 Transformer, без своих серверов).
 * — видео: короткая сторона 480, H.264 ~600 кбит/с, звук AAC 64 кбит/с (минута ≈ 5–6 МБ);
 * — треки: AAC 128 кбит/с.
 */
object ClipMedia {
    private const val SHORT_SIDE = 480
    private const val VIDEO_BITRATE = 600_000
    private const val AUDIO_BITRATE = 64_000
    private const val TRACK_BITRATE = 128_000

    /** Размер кадра на экране (с учётом поворота) */
    fun videoSize(ctx: Context, uri: Uri): Pair<Int, Int> = runCatching {
        val r = MediaMetadataRetriever(); r.setDataSource(ctx, uri)
        val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toInt() ?: 0
        val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toInt() ?: 0
        val rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toInt() ?: 0
        r.release()
        if (rot == 90 || rot == 270) h to w else w to h
    }.getOrDefault(0 to 0)

    /** Выходной размер: короткая сторона не больше 480, обе стороны чётные */
    private fun target(w: Int, h: Int): Pair<Int, Int> {
        if (w <= 0 || h <= 0) return 0 to 0
        val k = minOf(1f, SHORT_SIDE.toFloat() / minOf(w, h))
        fun even(x: Float) = (Math.round(x) / 2 * 2).coerceAtLeast(2)
        return even(w * k) to even(h * k)
    }

    /**
     * Сжать видео перед загрузкой: не длиннее maxSec, 480p, ~600 кбит/с.
     * sound — свой звук вместо звука видео (играет по кругу, если короче).
     */
    @OptIn(UnstableApi::class)
    suspend fun compressVideo(ctx: Context, video: Uri, maxSec: Int, sound: File? = null, progress: (Float) -> Unit = {}): File {
        val out = File(ctx.cacheDir, "vs_up_${System.currentTimeMillis()}.mp4")
        val (w, h) = target(videoSize(ctx, video).first, videoSize(ctx, video).second)
        val item = MediaItem.Builder().setUri(video)
            .setClippingConfiguration(MediaItem.ClippingConfiguration.Builder().setEndPositionMs(maxSec * 1000L).build()).build()
        val fx: List<Effect> = if (w > 0) listOf(Presentation.createForWidthAndHeight(w, h, Presentation.LAYOUT_SCALE_TO_FIT)) else emptyList()
        val v = EditedMediaItem.Builder(item).setRemoveAudio(sound != null).setEffects(Effects(emptyList(), fx)).build()
        val seqs = mutableListOf(EditedMediaItemSequence(listOf(v)))
        if (sound != null) seqs += EditedMediaItemSequence(listOf(EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(sound))).setRemoveVideo(true).build()), true)
        export(ctx, Composition.Builder(seqs).build(), out, progress, VIDEO_BITRATE, AUDIO_BITRATE)
        return out
    }

    /** Сжать трек: AAC 128 кбит/с в .m4a (на слух почти как MP3 320, а весит втрое меньше) */
    @OptIn(UnstableApi::class)
    suspend fun compressAudio(ctx: Context, audio: Uri, progress: (Float) -> Unit = {}): File {
        val out = File(ctx.cacheDir, "vs_track_${System.currentTimeMillis()}.m4a")
        val a = EditedMediaItem.Builder(MediaItem.fromUri(audio)).setRemoveVideo(true).build()
        export(ctx, Composition.Builder(EditedMediaItemSequence(listOf(a))).build(), out, progress, VIDEO_BITRATE, TRACK_BITRATE)
        return out
    }

    @OptIn(UnstableApi::class)
    private suspend fun export(ctx: Context, comp: Composition, out: File, progress: (Float) -> Unit, videoBitrate: Int, audioBitrate: Int) = withContext(Dispatchers.Main) {
        coroutineScope {
            var t: Transformer? = null
            val ticker = launch {
                val h = ProgressHolder()
                while (true) { delay(250); if (t?.getProgress(h) == Transformer.PROGRESS_STATE_AVAILABLE) progress(h.progress / 100f) }
            }
            try {
                suspendCancellableCoroutine { cont ->
                    val enc = DefaultEncoderFactory.Builder(ctx).setEnableFallback(true)
                        .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(videoBitrate).build())
                        .setRequestedAudioEncoderSettings(AudioEncoderSettings.Builder().setBitrate(audioBitrate).build()).build()
                    val tr = Transformer.Builder(ctx).setEncoderFactory(enc).setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC)
                        .addListener(object : Transformer.Listener {
                            override fun onCompleted(composition: Composition, exportResult: ExportResult) { if (cont.isActive) cont.resume(Unit) }
                            override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                                out.delete(); if (cont.isActive) cont.resumeWithException(IllegalStateException("Не получилось обработать видео: ${exportException.errorCodeName}"))
                            }
                        }).build()
                    t = tr
                    cont.invokeOnCancellation { tr.cancel(); out.delete() }
                    tr.start(comp, out.absolutePath)
                }
            } finally { ticker.cancel() }
        }
    }

}
