package ru.vsmske.app.music

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.FileDataSource
import kotlinx.coroutines.runBlocking
import ru.vsmske.app.data.Repo
import java.io.File
import java.io.IOException

/**
 * Треки лежат в Firestore кусками base64 (files/{id}/chunks). Адрес vsmske://file/<id>:
 * при первом проигрывании скачиваем куски, склеиваем в файл в кэше и дальше играем его как обычный файл.
 * Остальные адреса (http) — обычным способом.
 */
@UnstableApi
class FirestoreDataSource(private val ctx: Context) : BaseDataSource(false) {
    private var inner: DataSource? = null
    private var uri: Uri? = null

    override fun open(dataSpec: DataSpec): Long {
        uri = dataSpec.uri
        val (ds, spec) = if (dataSpec.uri.scheme == "vsmske") {
            val f = cached(ctx, dataSpec.uri.lastPathSegment ?: throw IOException("нет id"))
            FileDataSource() to dataSpec.buildUpon().setUri(Uri.fromFile(f)).build()
        } else DefaultDataSource.Factory(ctx).createDataSource() to dataSpec
        inner = ds
        return ds.open(spec)
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int = inner?.read(buffer, offset, length) ?: C.RESULT_END_OF_INPUT
    override fun getUri(): Uri? = uri
    override fun close() { inner?.close(); inner = null }

    class Factory(private val ctx: Context) : DataSource.Factory {
        override fun createDataSource(): DataSource = FirestoreDataSource(ctx)
    }

    companion object {
        private val locks = HashMap<String, Any>()

        fun dir(ctx: Context) = File(ctx.cacheDir, "music").apply { mkdirs() }

        /** Файл трека в кэше (скачивает, если ещё нет). Кэш держим не больше ~300 МБ. */
        fun cached(ctx: Context, fileId: String): File {
            val lock = synchronized(locks) { locks.getOrPut(fileId) { Any() } }
            synchronized(lock) {
                val f = File(dir(ctx), fileId)
                if (f.exists() && f.length() > 0) { f.setLastModified(System.currentTimeMillis()); return f }
                val parts = runBlocking { Repo.fileChunks(fileId) }
                if (parts.isEmpty()) throw IOException("Трек не найден")
                val tmp = File(dir(ctx), "$fileId.part")
                tmp.outputStream().use { out -> parts.forEach { out.write(Base64.decode(it, Base64.DEFAULT)) } }
                tmp.renameTo(f)
                trim(ctx)
                return f
            }
        }

        private fun trim(ctx: Context) {
            val files = dir(ctx).listFiles()?.filter { !it.name.endsWith(".part") }?.sortedByDescending { it.lastModified() } ?: return
            var total = 0L
            files.forEach { total += it.length(); if (total > 300L * 1024 * 1024) it.delete() }
        }
    }
}
