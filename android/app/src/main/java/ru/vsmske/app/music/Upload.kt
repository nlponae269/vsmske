package ru.vsmske.app.music

import android.content.Context
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Images
import java.nio.charset.Charset

/**
 * Загрузка трека как на сайте: название, исполнитель и обложка — из тегов MP3 (ID3v2, старые русские — cp1251)
 * или из имени файла «Исполнитель - Песня»; файл — кусками base64 по 700 000 символов в files/{id}/chunks.
 */
object Upload {
    /** Исходный файл — до 60 МБ: перед загрузкой он всё равно сжимается (AAC 128 кбит/с ≈ 1 МБ в минуту) */
    const val MAX = 60 * 1024 * 1024
    private const val CHUNK = 700_000

    class Draft(val uri: Uri, val name: String, val size: Long, val type: String, val bytes: ByteArray,
                val title: String, val artist: String, val cover: String, val duration: Double)

    suspend fun read(ctx: Context, uri: Uri): Draft = withContext(Dispatchers.IO) {
        val cr = ctx.contentResolver
        var name = "track.mp3"; var size = 0L
        cr.query(uri, null, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                c.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { name = c.getString(it) ?: name }
                c.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 }?.let { size = c.getLong(it) }
            }
        }
        if (size > MAX) error("Файл больше 60 МБ")
        val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: error("Не удалось открыть файл")
        if (bytes.size > MAX) error("Файл больше 60 МБ")
        val tags = runCatching { id3(bytes) }.getOrDefault(Tags(null, null, null))   // битый тег — не повод не загрузить трек
        val base = name.substringBeforeLast('.').replace('_', ' ').trim()
        val m = Regex("^(.+?)\\s+[-–—]\\s+(.+)$").find(base)
        val duration = runCatching {
            MediaMetadataRetriever().run { setDataSource(ctx, uri); val d = extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLong() ?: 0L; release(); d / 1000.0 }
        }.getOrDefault(0.0)
        val cover = tags.pic?.let { p -> runCatching { BitmapFactory.decodeByteArray(p, 0, p.size)?.let { Images.fromBitmap(it, 600, 250_000, true) } }.getOrNull() } ?: ""
        Draft(uri, name, bytes.size.toLong(), cr.getType(uri) ?: "audio/mpeg", bytes,
            (tags.title ?: m?.groupValues?.get(2) ?: base).take(120).ifEmpty { "Без названия" },
            (tags.artist ?: m?.groupValues?.get(1) ?: "").take(120), cover, duration)
    }

    suspend fun upload(ctx: Context, src: Draft, title: String, artist: String, progress: (Float) -> Unit) {
        val db = Fire.db; val me = Fire.uid
        // сильное сжатие: AAC 128 кбит/с; если телефон не справился — грузим как есть (но в базу больше 20 МБ не влезет)
        val d = runCatching {
            val f = ClipMedia.compressAudio(ctx, src.uri) { progress(it * 0.3f) }
            try {
                val b = f.readBytes()
                if (b.isEmpty() || b.size >= src.bytes.size) src
                else Draft(src.uri, src.name.substringBeforeLast('.') + ".m4a", b.size.toLong(), "audio/mp4", b, src.title, src.artist, src.cover, src.duration)
            } finally { f.delete() }
        }.getOrDefault(src)
        if (d.size > 20L * 1024 * 1024) error("Даже после сжатия трек больше 20 МБ")
        val b64 = withContext(Dispatchers.Default) { Base64.encodeToString(d.bytes, Base64.NO_WRAP) }
        val n = maxOf(1, (b64.length + CHUNK - 1) / CHUNK)
        val ref = db.collection("files").document()
        ref.set(mapOf("ownerId" to me, "kind" to "music", "name" to d.name.take(200), "size" to d.size, "type" to d.type,
            "chunks" to n, "status" to "uploading", "createdAt" to FieldValue.serverTimestamp())).await()
        for (i in 0 until n) {
            ref.collection("chunks").document(i.toString().padStart(4, '0'))
                .set(mapOf("i" to i, "data" to b64.substring(i * CHUNK, minOf(b64.length, (i + 1) * CHUNK)))).await()
            progress(0.3f + 0.7f * (i + 1f) / n)
        }
        ref.update("status", "ready").await()
        val t = db.collection("tracks").add(mapOf("ownerId" to me, "title" to title.take(120), "artist" to artist.take(120), "fileId" to ref.id,
            "type" to d.type, "duration" to d.duration, "size" to d.size, "createdAt" to FieldValue.serverTimestamp())).await()
        if (d.cover.isNotEmpty()) runCatching { t.update("cover", d.cover).await() }   // обложку правила разрешают только правкой
    }

    private class Tags(val title: String?, val artist: String?, val pic: ByteArray?)

    private fun id3(b: ByteArray): Tags {
        if (b.size < 10 || b[0] != 'I'.code.toByte() || b[1] != 'D'.code.toByte() || b[2] != '3'.code.toByte()) return Tags(null, null, null)
        val ver = b[3].toInt()
        val syn = { i: Int -> ((b[i].toInt() and 0x7f) shl 21) or ((b[i + 1].toInt() and 0x7f) shl 14) or ((b[i + 2].toInt() and 0x7f) shl 7) or (b[i + 3].toInt() and 0x7f) }
        val end = minOf(b.size, 10 + syn(6))
        var p = 10; var title: String? = null; var artist: String? = null; var pic: ByteArray? = null
        while (p + 10 <= end) {
            val id = String(b, p, 4, Charsets.ISO_8859_1)
            if (!id.all { it.isLetterOrDigit() }) break
            val sz = if (ver >= 4) syn(p + 4) else ((b[p + 4].toInt() and 0xff) shl 24) or ((b[p + 5].toInt() and 0xff) shl 16) or ((b[p + 6].toInt() and 0xff) shl 8) or (b[p + 7].toInt() and 0xff)
            if (sz <= 0 || p + 10 + sz > end) break
            val body = b.copyOfRange(p + 10, p + 10 + sz)
            when (id) {
                "TIT2" -> title = text(body)
                "TPE1" -> artist = text(body)
                "APIC" -> if (pic == null) pic = apic(body)
            }
            p += 10 + sz
        }
        return Tags(title?.ifBlank { null }, artist?.ifBlank { null }, pic)
    }

    private fun cs(enc: Int): Charset = when (enc) { 1 -> Charsets.UTF_16; 2 -> Charsets.UTF_16BE; 3 -> Charsets.UTF_8; else -> Charset.forName("windows-1251") }
    private fun text(body: ByteArray): String? = if (body.isEmpty()) null else String(body, 1, body.size - 1, cs(body[0].toInt())).replace("\u0000", "").trim()

    private fun apic(body: ByteArray): ByteArray? {
        if (body.isEmpty()) return null
        val enc = body[0].toInt()
        var q = 1
        while (q < body.size && body[q] != 0.toByte()) q++   // MIME
        q += 2                                                // ноль + тип картинки
        if (enc == 1 || enc == 2) { while (q + 1 < body.size && (body[q] != 0.toByte() || body[q + 1] != 0.toByte())) q += 2; q += 2 }
        else { while (q < body.size && body[q] != 0.toByte()) q++; q++ }
        return if (q < body.size) body.copyOfRange(q, body.size) else null
    }
}
