package ru.vsmske.app.music

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.FileDataSource
import androidx.media3.datasource.TransferListener
import com.google.android.gms.tasks.Tasks
import com.google.firebase.firestore.Query
import ru.vsmske.app.data.Fire
import java.io.File

/**
 * Файлы треков лежат в Firestore кусками base64 (files/{id}/chunks/0000…), как их кладёт сайт.
 * Адрес vsmske://file/<id>: при первом открытии куски склеиваются в файл в кэше, дальше играет обычный файл.
 */
@UnstableApi
class FileSource(private val ctx: Context) : DataSource {
    private val files = FileDataSource()
    private val other = DefaultDataSource.Factory(ctx).createDataSource()
    private var cur: DataSource? = null

    override fun addTransferListener(l: TransferListener) { files.addTransferListener(l); other.addTransferListener(l) }

    override fun open(spec: DataSpec): Long {
        val u = spec.uri
        if (u.scheme != "vsmske") { cur = other; return other.open(spec) }
        val f = local(ctx, u.lastPathSegment ?: error("нет файла"))
        cur = files
        return files.open(spec.buildUpon().setUri(Uri.fromFile(f)).build())
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int = cur?.read(buffer, offset, length) ?: C.RESULT_END_OF_INPUT
    override fun getUri(): Uri? = cur?.uri
    override fun close() { cur?.close(); cur = null }

    class Factory(private val ctx: Context) : DataSource.Factory { override fun createDataSource() = FileSource(ctx) }

    companion object {
        /** Скачать файл в кэш (один раз). Вызывается не из главного потока. */
        fun local(ctx: Context, id: String): File {
            val dir = File(ctx.cacheDir, "tracks").apply { mkdirs() }
            val f = File(dir, id)
            if (f.exists() && f.length() > 0) return f
            val snap = Tasks.await(Fire.db.collection("files").document(id).collection("chunks").orderBy("i", Query.Direction.ASCENDING).get())
            val b64 = snap.documents.joinToString("") { it.getString("data") ?: "" }
            if (b64.isEmpty()) error("Файл трека не найден")
            val tmp = File(dir, "$id.part")
            tmp.writeBytes(Base64.decode(b64, Base64.DEFAULT))
            tmp.renameTo(f)
            // кэш не больше ~300 МБ: старые файлы удаляем
            val all = dir.listFiles()?.sortedBy { it.lastModified() } ?: return f
            var total = all.sumOf { it.length() }
            for (x in all) { if (total < 300L * 1024 * 1024) break; if (x != f) { total -= x.length(); x.delete() } }
            return f
        }
    }
}
