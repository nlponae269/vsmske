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
 * ВС Клипы и ВС Видео: работа с файлами на телефоне (Media3 Transformer, без своих серверов).
 * — сильное сжатие перед загрузкой: короткая сторона 480, H.264 ~600 кбит/с, звук AAC 64 кбит/с (минута ≈ 5–6 МБ);
 *   при этом можно наложить звук (трек из библиотеки или звук другого клипа);
 * — сжатие треков: AAC 128 кбит/с;
 * — водяной знак при скачивании: значок и @ник поверх видео, в конце — общая заставка;
 * — вынуть звук из клипа в .m4a; сохранить файл в «Загрузки/ВС Клипы».
 */
object ClipMedia {
    const val FOLDER = "ВС Клипы"
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

    /** Звук клипа отдельным файлом .m4a (для «Скачать звук») */
    @OptIn(UnstableApi::class)
    suspend fun extractAudio(ctx: Context, video: File, progress: (Float) -> Unit = {}): File {
        val out = File(ctx.cacheDir, "clip_sound_${System.currentTimeMillis()}.m4a")
        val a = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(video))).setRemoveVideo(true).build()
        export(ctx, Composition.Builder(EditedMediaItemSequence(listOf(a))).build(), out, progress, VIDEO_BITRATE, TRACK_BITRATE)
        return out
    }

    /**
     * Видео для скачивания: в углу значок «ВС Клипы» и @ник автора, в конце — заставка 2,5 с (одна для всех).
     * logo — значок приложения.
     */
    @OptIn(UnstableApi::class)
    suspend fun watermark(ctx: Context, video: File, nick: String, logo: Bitmap, progress: (Float) -> Unit = {}): File {
        val uri = Uri.fromFile(video)
        val (sw, sh) = videoSize(ctx, uri)
        val (w, h) = target(sw, sh).takeIf { it.first > 0 } ?: (480 to 854)
        val out = File(ctx.cacheDir, "clip_wm_${System.currentTimeMillis()}.mp4")
        val mark = markBitmap(logo, nick, w)
        // NDC: (-1,-1) — левый нижний угол кадра, (1,1) — правый верхний; знак — слева сверху с отступом
        val settings = OverlaySettings.Builder().setBackgroundFrameAnchor(-0.92f, 0.94f).setOverlayFrameAnchor(-1f, 1f).build()
        val overlay = OverlayEffect(ImmutableList.of<androidx.media3.effect.TextureOverlay>(BitmapOverlay.createStaticBitmapOverlay(mark, settings)))
        val clip = EditedMediaItem.Builder(MediaItem.fromUri(uri)).setEffects(Effects(emptyList(), listOf(overlay))).build()
        val endPng = File(ctx.cacheDir, "clip_end_${w}x$h.png")
        if (!endPng.exists()) withContext(Dispatchers.IO) { endPng.outputStream().use { endCard(logo, w, h).compress(Bitmap.CompressFormat.PNG, 100, it) } }
        val end = EditedMediaItem.Builder(MediaItem.Builder().setUri(Uri.fromFile(endPng)).setImageDurationMs(2500).build()).setFrameRate(30).build()
        val comp = Composition.Builder(EditedMediaItemSequence(listOf(clip, end)))
            .setEffects(Effects(emptyList(), listOf(Presentation.createForWidthAndHeight(w, h, Presentation.LAYOUT_SCALE_TO_FIT))))
            .experimentalSetForceAudioTrack(true).build()
        export(ctx, comp, out, progress, VIDEO_BITRATE * 2, AUDIO_BITRATE * 2)
        return out
    }

    /** Знак поверх видео: значок + «ВС Клипы» и @ник, с тенью, ширина ≈ 38% кадра */
    private fun markBitmap(logo: Bitmap, nick: String, frameW: Int): Bitmap {
        val icon = (frameW * 0.085f).toInt().coerceAtLeast(24)
        val big = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE; textSize = icon * 0.52f; typeface = Typeface.DEFAULT_BOLD; setShadowLayer(icon * 0.12f, 0f, icon * 0.04f, 0x99000000.toInt()) }
        val small = Paint(big).apply { textSize = icon * 0.42f; typeface = Typeface.DEFAULT }
        val line2 = if (nick.isNotEmpty()) "@$nick" else ""
        val textW = maxOf(big.measureText("ВС Клипы"), small.measureText(line2))
        val pad = (icon * 0.18f).toInt()
        val bmp = Bitmap.createBitmap((icon + pad * 3 + textW).toInt(), icon + pad * 2, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { alpha = 230 }
        c.drawBitmap(logo, null, RectF(pad.toFloat(), pad.toFloat(), (pad + icon).toFloat(), (pad + icon).toFloat()), p)
        val x = (pad * 2 + icon).toFloat()
        if (line2.isEmpty()) c.drawText("ВС Клипы", x, pad + icon * 0.68f, big)
        else { c.drawText("ВС Клипы", x, pad + icon * 0.48f, big); c.drawText(line2, x, pad + icon * 0.95f, small) }
        return bmp
    }

    /** Заставка в конце: тёмный фон с фиолетовым свечением, большой значок и «ВС Клипы» */
    private fun endCard(logo: Bitmap, w: Int, h: Int): Bitmap {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawPaint(Paint().apply { shader = LinearGradient(0f, 0f, 0f, h.toFloat(), 0xFF120B1E.toInt(), 0xFF2A1240.toInt(), Shader.TileMode.CLAMP) })
        val s = minOf(w, h) * 0.34f
        val cx = w / 2f; val cy = h * 0.44f
        c.drawBitmap(logo, null, RectF(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
        val t = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE; textSize = s * 0.32f; typeface = Typeface.DEFAULT_BOLD; textAlign = Paint.Align.CENTER }
        c.drawText("ВС Клипы", cx, cy + s * 0.5f + t.textSize * 1.3f, t)
        val sub = Paint(t).apply { textSize = s * 0.15f; typeface = Typeface.DEFAULT; color = 0xCCFFFFFF.toInt() }
        c.drawText("Снимайте клипы в ВС Клипах", cx, cy + s * 0.5f + t.textSize * 1.3f + sub.textSize * 2f, sub)
        return bmp
    }

    /** Значок приложения картинкой (для водяного знака) */
    fun appIcon(ctx: Context): Bitmap =
        BitmapFactory.decodeResource(ctx.resources, ctx.applicationInfo.icon) ?: Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888)

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

    /** Положить файл в «Загрузки/ВС Клипы». На Android 8–9 нужно разрешение на память (его спрашивает экран). */
    suspend fun saveToDownloads(ctx: Context, src: File, name: String, mime: String): String = withContext(Dispatchers.IO) {
        val clean = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").take(100)
        if (Build.VERSION.SDK_INT >= 29) {
            val cv = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, clean)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val cr = ctx.contentResolver
            val uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv) ?: error("Не получилось создать файл в Загрузках")
            try {
                cr.openOutputStream(uri)?.use { o -> src.inputStream().use { it.copyTo(o) } } ?: error("Нет доступа к Загрузкам")
                cr.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
            } catch (e: Exception) { cr.delete(uri, null, null); throw e }
        } else {
            @Suppress("DEPRECATION")
            val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER).apply { mkdirs() }
            var f = File(dir, clean); var n = 1
            while (f.exists()) { f = File(dir, clean.substringBeforeLast('.') + " ($n)." + clean.substringAfterLast('.', "bin")); n++ }
            src.copyTo(f)
        }
        "Загрузки/$FOLDER/$clean"
    }

    /** Расширение файла по типу */
    fun ext(mime: String): String = when {
        mime.contains("webm") -> "webm"
        mime.contains("quicktime") -> "mov"
        mime.startsWith("video") -> "mp4"
        mime.contains("mpeg") || mime.contains("mp3") -> "mp3"
        mime.contains("mp4") || mime.contains("aac") || mime.contains("m4a") -> "m4a"
        mime.contains("ogg") -> "ogg"
        mime.contains("wav") -> "wav"
        mime.contains("flac") -> "flac"
        else -> "bin"
    }
}
