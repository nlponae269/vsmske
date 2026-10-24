package ru.vsmske.app.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/** Файлы в Firestore кусками base64 по 700 000 символов (files/{id}/chunks/0000…) — как putFile() на сайте. */
object Files {
    private const val CHUNK = 700_000
    const val DISK_MAX = 10L * 1024 * 1024
    const val VIDEO_MAX = 20L * 1024 * 1024

    class Picked(val bytes: ByteArray, val name: String, val type: String, val size: Long)

    suspend fun read(ctx: Context, uri: Uri, max: Long): Picked = withContext(Dispatchers.IO) {
        val cr = ctx.contentResolver
        var name = "file"; var size = -1L
        cr.query(uri, null, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                c.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { name = c.getString(it) ?: name }
                c.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 }?.let { size = c.getLong(it) }
            }
        }
        if (size > max) error("Файл больше ${max / 1024 / 1024} МБ")
        val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: error("Не удалось открыть файл")
        if (bytes.size > max) error("Файл больше ${max / 1024 / 1024} МБ")
        Picked(bytes, name, cr.getType(uri) ?: "application/octet-stream", bytes.size.toLong())
    }

    /** Загрузить файл; вернуть его id. kind: disk | video | music */
    suspend fun put(p: Picked, kind: String, progress: (Float) -> Unit): String {
        val db = Fire.db
        val b64 = withContext(Dispatchers.Default) { Base64.encodeToString(p.bytes, Base64.NO_WRAP) }
        val n = maxOf(1, (b64.length + CHUNK - 1) / CHUNK)
        val ref = db.collection("files").document()
        ref.set(mapOf("ownerId" to Fire.uid, "kind" to kind, "name" to p.name.take(200), "size" to p.size, "type" to p.type.take(100),
            "chunks" to n, "status" to "uploading", "createdAt" to FieldValue.serverTimestamp())).await()
        for (i in 0 until n) {
            ref.collection("chunks").document(i.toString().padStart(4, '0'))
                .set(mapOf("i" to i, "data" to b64.substring(i * CHUNK, minOf(b64.length, (i + 1) * CHUNK)))).await()
            progress((i + 1f) / n)
        }
        ref.update("status", "ready").await()
        return ref.id
    }

    suspend fun delete(id: String) {
        if (id.isEmpty()) return
        val db = Fire.db
        val chunks = db.collection("files").document(id).collection("chunks").get().await()
        db.runBatch { b -> chunks.documents.forEach { b.delete(it.reference) }; b.delete(db.collection("files").document(id)) }.await()
    }
}
