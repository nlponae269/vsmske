package ru.vsmske.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.util.Base64
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/* Фото хранятся прямо в Firestore как dataURL JPEG (Storage на бесплатном тарифе нет) — как на сайте. */
object Images {
    const val MAX_AVATAR = 120_000
    const val MAX_POST_IMG = 700_000
    const val MAX_MSG_IMG = 380_000

    class TooBig : Exception("Фото слишком большое даже после сжатия")

    private fun load(ctx: Context, uri: Uri): Bitmap =
        if (Build.VERSION.SDK_INT >= 28) ImageDecoder.decodeBitmap(ImageDecoder.createSource(ctx.contentResolver, uri)) { d, info, _ ->
            d.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val s = max(info.size.width, info.size.height)
            if (s > 2560) d.setTargetSampleSize(s / 2560 + 1)
        } else ctx.contentResolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it) }

    /** Как compress() на сайте: уменьшаем сторону и качество, пока dataURL не влезет в maxLen */
    suspend fun compress(ctx: Context, uri: Uri, maxSide: Int, maxLen: Int, square: Boolean = false): String = withContext(Dispatchers.Default) {
        compressBitmap(load(ctx, uri), maxSide, maxLen, square)
    }

    fun compressBitmap(img: Bitmap, maxSide: Int, maxLen: Int, square: Boolean = false): String {
        var side = maxSide; var q = 80; var out = ""
        repeat(8) {
            val bmp = if (square) {
                val s = min(img.width, img.height)
                val crop = Bitmap.createBitmap(img, (img.width - s) / 2, (img.height - s) / 2, s, s)
                val t = min(side, s); Bitmap.createScaledBitmap(crop, t, t, true)
            } else {
                val k = min(1f, side.toFloat() / max(img.width, img.height))
                Bitmap.createScaledBitmap(img, max(1, (img.width * k).roundToInt()), max(1, (img.height * k).roundToInt()), true)
            }
            val bos = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, q, bos)
            out = "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
            if (out.length <= maxLen) return out
            q = max(50, q - 10); side = (side * 0.85).roundToInt()
        }
        throw TooBig()
    }

    private val cache = object : LruCache<String, ImageBitmap>(48 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
    }

    fun cached(src: String): ImageBitmap? = cache.get(key(src))
    private fun key(src: String) = src.length.toString() + ":" + src.hashCode() + ":" + src.takeLast(32)

    /** dataURL → картинка (с кэшем). Ссылки https (фото Google) грузит Coil, сюда они не попадают. */
    suspend fun decode(src: String): ImageBitmap? {
        if (!src.startsWith("data:image/")) return null
        cached(src)?.let { return it }
        return withContext(Dispatchers.Default) {
            runCatching {
                val bytes = Base64.decode(src.substringAfter(","), Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()?.also { cache.put(key(src), it) }
            }.getOrNull()
        }
    }

    fun safe(src: String?): String {
        val s = src ?: return ""
        return if (Regex("^data:image/(jpeg|png|webp|gif);base64,").containsMatchIn(s) ||
            Regex("^https://[a-z0-9-]+[.]googleusercontent[.]com/").containsMatchIn(s)) s else ""
    }
}
