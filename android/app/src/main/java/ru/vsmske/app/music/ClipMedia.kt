package ru.vsmske.app.music

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
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
 * ВС Клипы: работа с файлами на телефоне.
 * — наложить звук (трек из библиотеки или звук другого клипа) на снятое видео — Media3 Transformer;
 * — вынуть звук из клипа в .m4a;
 * — сохранить файл в «Загрузки/ВС Клипы».
 */
object ClipMedia {
    const val FOLDER = "ВС Клипы"

    /** Видео без своего звука + звук (по кругу, если короче видео). Готовый файл — в кэше. */
    @OptIn(UnstableApi::class)
    suspend fun replaceAudio(ctx: Context, video: Uri, sound: File, progress: (Float) -> Unit = {}): File {
        val out = File(ctx.cacheDir, "clip_mix_${System.currentTimeMillis()}.mp4")
        val v = EditedMediaItem.Builder(MediaItem.fromUri(video)).setRemoveAudio(true).build()
        val a = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(sound))).setRemoveVideo(true).build()
        val comp = Composition.Builder(EditedMediaItemSequence(listOf(v)), EditedMediaItemSequence(listOf(a), true)).build()
        export(ctx, comp, out, progress)
        return out
    }

    /** Звук клипа отдельным файлом .m4a (для «Скачать звук») */
    @OptIn(UnstableApi::class)
    suspend fun extractAudio(ctx: Context, video: File, progress: (Float) -> Unit = {}): File {
        val out = File(ctx.cacheDir, "clip_sound_${System.currentTimeMillis()}.m4a")
        val a = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(video))).setRemoveVideo(true).build()
        export(ctx, Composition.Builder(EditedMediaItemSequence(listOf(a))).build(), out, progress)
        return out
    }

    @OptIn(UnstableApi::class)
    private suspend fun export(ctx: Context, comp: Composition, out: File, progress: (Float) -> Unit) = withContext(Dispatchers.Main) {
        coroutineScope {
            var t: Transformer? = null
            val ticker = launch {
                val h = ProgressHolder()
                while (true) { delay(250); if (t?.getProgress(h) == Transformer.PROGRESS_STATE_AVAILABLE) progress(h.progress / 100f) }
            }
            try {
                suspendCancellableCoroutine { cont ->
                    val tr = Transformer.Builder(ctx).setAudioMimeType(MimeTypes.AUDIO_AAC)
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
