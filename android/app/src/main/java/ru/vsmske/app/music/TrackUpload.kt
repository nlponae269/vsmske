package ru.vsmske.app.music

import android.content.Context
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Repo

/** Загрузка трека: название, исполнитель и обложка — из тегов файла, иначе из имени «Исполнитель - Песня» (как на сайте) */
object TrackUpload {
    const val LIMIT = 12 * 1024 * 1024

    class Draft(val bytes: ByteArray, val name: String, val type: String, val title: String, val artist: String, val duration: Double, val cover: String)

    suspend fun read(ctx: Context, uri: Uri): Draft = withContext(Dispatchers.IO) {
        val cr = ctx.contentResolver
        var name = "track.mp3"
        cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) name = c.getString(0) ?: name }
        val bytes = cr.openInputStream(uri)!!.use { inp ->
            val out = java.io.ByteArrayOutputStream(); val buf = ByteArray(64 * 1024); var total = 0
            while (true) {
                val n = inp.read(buf); if (n < 0) break
                total += n; if (total > LIMIT) throw IllegalStateException("Трек слишком большой: можно до 12 МБ")
                out.write(buf, 0, n)
            }
            out.toByteArray()
        }
        val type = cr.getType(uri)?.takeIf { it.startsWith("audio/") } ?: "audio/mpeg"
        val r = MediaMetadataRetriever()
        var title = ""; var artist = ""; var dur = 0.0; var cover = ""
        runCatching {
            r.setDataSource(ctx, uri)
            title = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE).orEmpty().trim()
            artist = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST).orEmpty().trim()
            dur = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0) / 1000.0
            r.embeddedPicture?.let { p -> BitmapFactory.decodeByteArray(p, 0, p.size)?.let { b -> cover = runCatching { Images.compressBitmap(b, 600, 250_000, true) }.getOrDefault("") } }
        }
        runCatching { r.release() }
        val base = name.substringBeforeLast('.').replace('_', ' ').trim()
        val m = Regex("^(.+?)\\s+[-–—]\\s+(.+)$").find(base)
        Draft(bytes, name, type, title.ifEmpty { m?.groupValues?.get(2) ?: base }.take(120), artist.ifEmpty { m?.groupValues?.get(1) ?: "" }.take(120), dur, cover)
    }

    suspend fun upload(d: Draft, title: String, artist: String, progress: (Float) -> Unit) {
        val fileId = Repo.putFile(d.bytes, d.name, d.type, "music", progress)
        Repo.addTrack(fileId, title, artist, d.type, d.duration, d.bytes.size.toLong(), d.cover)
    }
}
