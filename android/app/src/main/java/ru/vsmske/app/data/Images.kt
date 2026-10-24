package ru.vsmske.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.util.Base64
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/** Фото в базе — dataURL JPEG прямо в документах (Storage на бесплатном тарифе нет). */
object Images {
    private val IMG_RE = Regex("^data:image/(jpeg|png|webp|gif);base64,")
    private val cache = object : LruCache<String, ImageBitmap>(48 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
    }

    /** Только загруженные фото и фото Google — как safePhoto() на сайте */
    fun safe(src: String?): String {
        val s = src ?: return ""
        return if (IMG_RE.containsMatchIn(s) || Regex("^https://[a-z0-9-]+\\.googleusercontent\\.com/").containsMatchIn(s)) s else ""
    }

    fun cached(src: String): ImageBitmap? = cache.get(src.hashCode().toString() + src.length)

    suspend fun decode(src: String): ImageBitmap? = withContext(Dispatchers.Default) {
        if (!IMG_RE.containsMatchIn(src)) return@withContext null
        val key = src.hashCode().toString() + src.length
        cache.get(key) ?: runCatching {
            val bytes = Base64.decode(src.substringAfter(','), Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()?.also { cache.put(key, it) }
        }.getOrNull()
    }

    fun bitmapOf(src: String): Bitmap? = runCatching {
        if (!IMG_RE.containsMatchIn(src)) return null
        val bytes = Base64.decode(src.substringAfter(','), Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }.getOrNull()

    /** Сжать картинку в dataURL JPEG: сторона не больше maxSide, длина строки не больше maxChars */
    suspend fun compress(ctx: Context, uri: Uri, maxSide: Int, maxChars: Int, square: Boolean = false): String = withContext(Dispatchers.IO) {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
        var bmp = ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
            ?: error("Не удалось открыть картинку")
        val rot = runCatching { ctx.contentResolver.openInputStream(uri)?.use { ExifInterface(it).rotationDegrees } ?: 0 }.getOrDefault(0)
        if (rot != 0) bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rot.toFloat()) }, true)
        fromBitmap(bmp, maxSide, maxChars, square)
    }

    fun fromBitmap(src: Bitmap, maxSide: Int, maxChars: Int, square: Boolean = false): String {
        var bmp = src
        if (square) { val s = minOf(bmp.width, bmp.height); bmp = Bitmap.createBitmap(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s) }
        var side = maxSide
        while (true) {
            val k = minOf(1f, side.toFloat() / maxOf(bmp.width, bmp.height))
            val scaled = if (k < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * k).toInt().coerceAtLeast(1), (bmp.height * k).toInt().coerceAtLeast(1), true) else bmp
            for (q in intArrayOf(85, 75, 65, 55, 45)) {
                val out = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, q, out)
                val s = "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
                if (s.length <= maxChars) return s
            }
            side = (side * 0.75f).toInt()
            if (side < 120) error("Картинка слишком большая")
        }
    }
}
