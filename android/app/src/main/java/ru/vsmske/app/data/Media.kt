package ru.vsmske.app.data

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Видео, клипы, альбомы, Диск, истории, плейлисты, подарки, эфиры — те же документы, что пишет сайт.
 */
object Media {
    private val db get() = Fire.db
    private val me get() = Fire.uid
    private val now get() = FieldValue.serverTimestamp()

    /* ---------- Видео и клипы ---------- */
    fun videosQuery(limit: Long): Query = db.collection("videos").orderBy("createdAt", Query.Direction.DESCENDING).limit(limit)
    suspend fun videosOf(uid: String): List<Video> =
        db.collection("videos").whereEqualTo("ownerId", uid).limit(200).get().await().documents.map(Video::from).sortedByDescending { it.createdAt }

    suspend fun toggleVideoLike(v: Video) {
        db.collection("videos").document(v.id).update("likes", if (me in v.likes) FieldValue.arrayRemove(me) else FieldValue.arrayUnion(me)).await()
    }
    /** Двойной тап: только поставить «нравится» (повторный тап не снимает) */
    suspend fun likeVideo(v: Video) { db.collection("videos").document(v.id).update("likes", FieldValue.arrayUnion(me)).await() }
    private val viewed = mutableSetOf<String>()
    /** Просмотр: +1 один раз за заход */
    fun countView(v: Video) {
        if (!viewed.add(v.id)) return
        db.collection("videos").document(v.id).update("views", FieldValue.increment(1))
    }
    fun videoComments(id: String): Query = db.collection("videos").document(id).collection("comments").orderBy("createdAt").limit(300)
    suspend fun addVideoComment(v: Video, text: String) {
        val t = text.trim().take(1000); if (t.isEmpty()) return
        db.collection("videos").document(v.id).collection("comments").add(mapOf("authorId" to me, "text" to t, "createdAt" to now)).await()
    }
    suspend fun deleteVideoComment(v: Video, c: Comment) { db.collection("videos").document(v.id).collection("comments").document(c.id).delete().await() }
    suspend fun deleteVideo(v: Video) { db.collection("videos").document(v.id).delete().await(); runCatching { Files.delete(v.fileId) } }

    /** Ссылка YouTube / Rutube / VK / .mp4 → (provider, vid) — как parseLink() на сайте */
    fun parseLink(u: String): Pair<String, String>? {
        Regex("(?:youtu\\.be/|youtube\\.com/(?:watch\\?(?:.*&)?v=|shorts/|embed/|live/))([\\w-]{11})").find(u)?.let { return "youtube" to it.groupValues[1] }
        Regex("rutube\\.ru/(?:video|play/embed|shorts)/([a-f0-9]{32})").find(u)?.let { return "rutube" to it.groupValues[1] }
        Regex("(?:vk\\.com|vkvideo\\.ru)/(?:.*[?&]z=)?video(-?\\d+_\\d+)").find(u)?.let { return "vk" to it.groupValues[1] }
        if (Regex("^https://\\S+\\.(mp4|webm|mov|m4v)(\\?\\S*)?$", RegexOption.IGNORE_CASE).matches(u.trim())) return "direct" to u.trim()
        return null
    }

    suspend fun addVideoLink(url: String, title: String, description: String): String {
        val (prov, vid) = parseLink(url) ?: error("Не узнали ссылку — нужна ссылка на YouTube, Rutube, VK Видео или файл .mp4")
        return db.collection("videos").add(mapOf("ownerId" to me, "title" to title.trim().take(120), "description" to description.trim().take(2000),
            "source" to "link", "provider" to prov, "vid" to vid, "thumb" to "", "likes" to emptyList<String>(), "createdAt" to now)).await().id
    }

    /** Свой ролик: кадр-обложка и длительность считаются на телефоне, файл — кусками */
    suspend fun addVideoFile(ctx: Context, uri: Uri, title: String, description: String, progress: (Float) -> Unit): String {
        val p = Files.read(ctx, uri, Files.VIDEO_MAX)
        val (thumb, dur) = withContext(Dispatchers.IO) {
            runCatching {
                val r = MediaMetadataRetriever(); r.setDataSource(ctx, uri)
                val d = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLong() ?: 0L) / 1000.0
                val frame: Bitmap? = r.getFrameAtTime(minOf(1_000_000L, (d * 333_000).toLong()))
                r.release()
                (frame?.let { Images.fromBitmap(it, 640, 290_000) } ?: "") to d
            }.getOrDefault("" to 0.0)
        }
        val fileId = Files.put(p, "video", progress)
        return db.collection("videos").add(mapOf("ownerId" to me, "title" to title.trim().take(120), "description" to description.trim().take(2000),
            "source" to "file", "fileId" to fileId, "type" to p.type.take(60), "thumb" to thumb, "duration" to Math.round(dur).toDouble(), "size" to p.size,
            "likes" to emptyList<String>(), "createdAt" to now)).await().id
    }

    /* ---------- Альбомы ---------- */
    suspend fun albumsOf(uid: String): List<Album> =
        db.collection("albums").whereEqualTo("ownerId", uid).limit(200).get().await().documents.map(Album::from).sortedByDescending { it.updatedAt }
    fun photosQuery(albumId: String): Query = db.collection("photos").whereEqualTo("albumId", albumId).limit(500)
    suspend fun createAlbum(title: String): String =
        db.collection("albums").add(mapOf("ownerId" to me, "title" to title.trim().take(80), "count" to 0, "cover" to "", "coverId" to "", "createdAt" to now, "updatedAt" to now)).await().id
    suspend fun renameAlbum(a: Album, title: String) { db.collection("albums").document(a.id).update(mapOf("title" to title.trim().take(80), "updatedAt" to now)).await() }

    /** Фото в альбом: миниатюра (photos) и полное (photoFull) одной пачкой, счётчик +1, первая — обложка */
    suspend fun addPhoto(ctx: Context, a: Album, uri: Uri, setCover: Boolean) {
        val thumb = Images.compress(ctx, uri, 400, 60_000, square = true)
        val full = Images.compress(ctx, uri, 1600, 700_000)
        val ref = db.collection("photos").document()
        db.runBatch { b ->
            b.set(ref, mapOf("ownerId" to me, "albumId" to a.id, "thumb" to thumb, "createdAt" to now))
            b.set(db.collection("photoFull").document(ref.id), mapOf("ownerId" to me, "image" to full))
            val patch = mutableMapOf<String, Any>("count" to FieldValue.increment(1), "updatedAt" to now)
            if (setCover) { patch["cover"] = thumb; patch["coverId"] = ref.id }
            b.update(db.collection("albums").document(a.id), patch)
        }.await()
    }
    suspend fun fullPhoto(id: String): String = db.collection("photoFull").document(id).get().await().getString("image") ?: ""
    suspend fun deletePhoto(a: Album, p: Photo, next: Photo?) {
        db.runBatch { b ->
            b.delete(db.collection("photos").document(p.id)); b.delete(db.collection("photoFull").document(p.id))
            val patch = mutableMapOf<String, Any>("count" to FieldValue.increment(-1), "updatedAt" to now)
            if (a.coverId == p.id) { patch["cover"] = next?.thumb ?: ""; patch["coverId"] = next?.id ?: "" }
            b.update(db.collection("albums").document(a.id), patch)
        }.await()
    }
    suspend fun deleteAlbum(a: Album) {
        val ps = db.collection("photos").whereEqualTo("albumId", a.id).get().await()
        val refs = ps.documents.flatMap { listOf(it.reference, db.collection("photoFull").document(it.id)) }
        refs.chunked(400).forEach { part -> db.runBatch { b -> part.forEach { b.delete(it) } }.await() }
        db.collection("albums").document(a.id).delete().await()
    }

    /* ---------- Диск (видит только хозяин) ---------- */
    fun diskQuery(): Query = db.collection("files").whereEqualTo("ownerId", me).whereEqualTo("kind", "disk").limit(500)
    suspend fun uploadDisk(ctx: Context, uri: Uri, progress: (Float) -> Unit) { Files.put(Files.read(ctx, uri, Files.DISK_MAX), "disk", progress) }
    /** Скачать файл Диска в кэш под его именем — чтобы открыть в другом приложении */
    suspend fun diskLocal(ctx: Context, f: DiskFile): File = withContext(Dispatchers.IO) {
        val raw = ru.vsmske.app.music.FileSource.local(ctx, f.id)
        val dir = File(ctx.cacheDir, "disk").apply { mkdirs() }
        val out = File(dir, f.name.replace(Regex("[/\\\\:*?\"<>|]"), "_").ifEmpty { f.id })
        if (!out.exists() || out.length() != raw.length()) raw.copyTo(out, overwrite = true)
        out
    }

    /* ---------- Истории на 24 часа ---------- */
    suspend fun stories(ids: List<String>): List<Story> {
        val since = System.currentTimeMillis() - 24 * 3600_000L
        return ids.distinct().take(150).chunked(10).flatMap { part ->
            runCatching { db.collection("stories").whereIn("ownerId", part).get().await().documents.map(Story::from) }.getOrDefault(emptyList())
        }.filter { it.createdAt == 0L || it.createdAt > since }.sortedBy { it.createdAt }
    }
    suspend fun postStory(ctx: Context, uri: Uri, text: String) {
        val image = Images.compress(ctx, uri, 1080, 420_000)
        db.collection("stories").add(mapOf("ownerId" to me, "image" to image, "text" to text.trim().take(200), "views" to emptyMap<String, Any>(), "createdAt" to now)).await()
    }
    fun viewStory(s: Story) { if (s.ownerId != me && me !in s.views) db.collection("stories").document(s.id).update(FieldPath.of("views", me), now) }
    suspend fun deleteStory(s: Story) { db.collection("stories").document(s.id).delete().await() }

    /* ---------- Плейлисты ---------- */
    suspend fun playlistsMine(): List<Playlist> =
        db.collection("playlists").whereEqualTo("ownerId", me).limit(100).get().await().documents.map(Playlist::from).sortedByDescending { it.updatedAt }
    suspend fun playlist(id: String): Playlist? = db.collection("playlists").document(id).get().await().takeIf { it.exists() }?.let(Playlist::from)
    suspend fun savePlaylist(id: String?, title: String, tracks: List<String>, color: String = ""): String {
        val ref = if (id == null) db.collection("playlists").document() else db.collection("playlists").document(id)
        ref.set(mapOf("ownerId" to me, "title" to title.trim().take(60).ifEmpty { "Плейлист" }, "tracks" to tracks.take(500), "color" to color, "updatedAt" to now)).await()
        return ref.id
    }
    suspend fun deletePlaylist(id: String) { db.collection("playlists").document(id).delete().await() }
    suspend fun tracksByIds(ids: List<String>): List<Track> {
        val got = ids.distinct().chunked(10).flatMap { part -> db.collection("tracks").whereIn(FieldPath.documentId(), part).get().await().documents.map(Track::from) }
        return ids.mapNotNull { id -> got.firstOrNull { it.id == id } }
    }
    /** Поток: все треки платформы по очереди, страницами по 50 */
    suspend fun streamPage(after: Long?, limit: Long = 50): List<Track> {
        var q = db.collection("tracks").orderBy("createdAt", Query.Direction.DESCENDING)
        if (after != null) q = q.startAfter(com.google.firebase.Timestamp(java.util.Date(after)))
        return q.limit(limit).get().await().documents.map(Track::from)
    }
    suspend fun tracksOf(uid: String): List<Track> =
        db.collection("tracks").whereEqualTo("ownerId", uid).limit(300).get().await().documents.map(Track::from).sortedByDescending { it.createdAt }
    /** Правка своего трека: название, исполнитель, текст (правило update пускает только автора) */
    suspend fun updateTrack(t: Track, title: String, artist: String, lyrics: String) {
        db.collection("tracks").document(t.id).update(mapOf("title" to title.trim().take(120).ifEmpty { t.title }, "artist" to artist.trim().take(120), "lyrics" to lyrics.take(20000))).await()
    }
    suspend fun setTrackCover(ctx: Context, t: Track, uri: Uri): String {
        val cover = Images.compress(ctx, uri, 600, 290_000, square = true)
        db.collection("tracks").document(t.id).update("cover", cover).await()
        return cover
    }

    /** Найденный текст песни в открытой базе LRCLIB (бесплатно, без ключа — как findLyrics() на сайте) */
    data class LrcHit(val title: String, val artist: String, val duration: Double, val synced: String, val plain: String) {
        val text get() = synced.ifEmpty { plain }
    }
    suspend fun searchLyrics(title: String, artist: String): List<LrcHit> = withContext(Dispatchers.IO) {
        fun get(q: String): List<LrcHit> {
            val c = java.net.URL("https://lrclib.net/api/search?$q").openConnection() as java.net.HttpURLConnection
            c.connectTimeout = 10_000; c.readTimeout = 15_000
            c.setRequestProperty("User-Agent", "VSmske Android (https://nlponae269.github.io/vsmske/)")
            try {
                if (c.responseCode != 200) return emptyList()
                val arr = org.json.JSONArray(c.inputStream.bufferedReader().use { it.readText() })
                return (0 until minOf(arr.length(), 20)).mapNotNull { i ->
                    val o = arr.optJSONObject(i) ?: return@mapNotNull null
                    LrcHit(o.optString("trackName"), o.optString("artistName"), o.optDouble("duration", 0.0),
                        o.optString("syncedLyrics").takeIf { it != "null" } ?: "", o.optString("plainLyrics").takeIf { it != "null" } ?: "")
                }.filter { it.text.isNotBlank() }
            } finally { c.disconnect() }
        }
        val enc = { s: String -> java.net.URLEncoder.encode(s.trim(), "UTF-8") }
        val first = if (artist.isNotBlank()) get("track_name=${enc(title)}&artist_name=${enc(artist)}") else emptyList()
        first.ifEmpty { get("q=${enc((artist + " " + title).trim())}") }
    }

    suspend fun saveLyrics(t: Track, lyrics: String) { db.collection("tracks").document(t.id).update("lyrics", lyrics.take(20000)).await() }

    /* ---------- Подарки ---------- */
    val GIFTS = linkedMapOf("gift" to ("🎁" to "Подарок"), "rose" to ("🌹" to "Роза"), "bear" to ("🧸" to "Мишка"), "cake" to ("🎂" to "Торт"),
        "heart" to ("❤️" to "Сердце"), "clover" to ("🍀" to "На удачу"), "cup" to ("🏆" to "Кубок"), "star" to ("🌟" to "Звезда"), "coffee" to ("☕" to "Кофе"),
        "cat" to ("🐱" to "Котик"), "pizza" to ("🍕" to "Пицца"), "car" to ("🏎️" to "Машина"), "crown" to ("👑" to "Корона"), "balloon" to ("🎈" to "Шарик"),
        "diamond" to ("💎" to "Бриллиант"), "rocket" to ("🚀" to "Ракета"))
    suspend fun giftsOf(uid: String): List<Gift> =
        db.collection("gifts").whereEqualTo("to", uid).limit(100).get().await().documents.map(Gift::from).sortedByDescending { it.createdAt }
    suspend fun sendGift(to: String, gift: String, text: String) {
        db.collection("gifts").add(mapOf("from" to me, "to" to to, "gift" to gift, "text" to text.trim().take(200), "createdAt" to now)).await()
        val g = GIFTS[gift]; Api.notify(to, "gift", "", "${g?.first ?: "🎁"} ${g?.second ?: ""}" + if (text.isNotBlank()) ": ${text.trim()}" else "")
    }

    /* ---------- Репост ---------- */
    suspend fun repost(p: Post) {
        val orig = if (p.repostOf.isNotEmpty()) p.repostOf else p.id
        db.runBatch { b ->
            b.set(db.collection("posts").document(), mapOf("authorId" to me, "wallId" to me, "text" to "", "image" to "", "repostOf" to orig,
                "likes" to emptyList<String>(), "commentCount" to 0, "createdAt" to now))
            b.update(db.collection("posts").document(orig), "reposts", FieldValue.increment(1))
        }.await()
        Api.notify(p.authorId, "repost", orig, p.text)
    }

    /* ---------- Сообщества (как на сайте: подписка — users.groups и membersCount ±1 одной пачкой) ---------- */
    fun groupsQuery(): Query = db.collection("groups").orderBy("createdAt", Query.Direction.DESCENDING).limit(100)
    suspend fun groupsByIds(ids: List<String>): List<Group> {
        val got = ids.distinct().take(100).chunked(10).flatMap { part -> db.collection("groups").whereIn(FieldPath.documentId(), part).get().await().documents.map(Group::from) }
        return ids.mapNotNull { id -> got.firstOrNull { it.id == id } }
    }
    suspend fun setSubscribed(g: Group, on: Boolean) {
        val mine = g.id in (Store.me.value?.groups ?: emptyList())
        if (on == mine) return
        if (on && (Store.me.value?.groups?.size ?: 0) >= 500) error("Подписок уже 500 — отпишитесь от старых")
        db.runBatch { b ->
            b.update(db.collection("users").document(me), "groups", if (on) FieldValue.arrayUnion(g.id) else FieldValue.arrayRemove(g.id))
            b.update(db.collection("groups").document(g.id), "membersCount", FieldValue.increment(if (on) 1L else -1L))
        }.await()
    }
    suspend fun createGroup(name: String, about: String): String {
        val ref = db.collection("groups").document()
        db.runBatch { b ->
            b.set(ref, mapOf("name" to name.trim().take(60), "about" to about.trim().take(600), "photo" to "", "cover" to listOf("blue", "sunset", "sea", "night", "rose", "gold").random(),
                "ownerId" to me, "admins" to listOf(me), "membersCount" to 1, "createdAt" to now))
            b.update(db.collection("users").document(me), "groups", FieldValue.arrayUnion(ref.id))
        }.await()
        return ref.id
    }

    /* ---------- ВС Маркет (как на сайте) ---------- */
    val MKT_CATS = linkedMapOf("electronics" to "Электроника", "clothes" to "Одежда", "home" to "Для дома", "auto" to "Авто",
        "hobby" to "Хобби и спорт", "kids" to "Детям", "services" to "Услуги", "other" to "Другое")
    fun marketQuery(cat: String): Query = when (cat) {
        "mine" -> db.collection("market").whereEqualTo("ownerId", me).limit(100)
        "all" -> db.collection("market").orderBy("createdAt", Query.Direction.DESCENDING).limit(60)
        else -> db.collection("market").whereEqualTo("category", cat).limit(100)
    }
    suspend fun createLot(ctx: Context, title: String, price: Long, cat: String, city: String, text: String, photo: Uri?): String {
        val image = if (photo != null) Images.compress(ctx, photo, 1080, 440_000) else ""
        return db.collection("market").add(mapOf("ownerId" to me, "title" to title.trim().take(100), "price" to price.coerceIn(0, 1_000_000_000),
            "category" to (cat.takeIf { it in MKT_CATS } ?: "other"), "city" to city.trim().take(40), "text" to text.trim().take(3000),
            "image" to image, "sold" to false, "createdAt" to now)).await().id
    }
    suspend fun setSold(l: Lot, sold: Boolean) { db.collection("market").document(l.id).update("sold", sold).await() }
    suspend fun deleteLot(l: Lot) { db.collection("market").document(l.id).delete().await() }

    /* ---------- ВС События ---------- */
    fun eventsQuery(): Query = db.collection("events").limit(200)
    suspend fun createEvent(ctx: Context, title: String, text: String, place: String, at: Long, cover: Uri?): String {
        val img = if (cover != null) Images.compress(ctx, cover, 1280, 440_000) else ""
        return db.collection("events").add(mapOf("ownerId" to me, "title" to title.trim().take(100), "text" to text.trim().take(2000), "place" to place.trim().take(120),
            "at" to com.google.firebase.Timestamp(java.util.Date(at)), "cover" to img, "going" to listOf(me), "createdAt" to now)).await().id
    }
    suspend fun toggleGoing(e: Event) {
        db.collection("events").document(e.id).update("going", if (me in e.going) FieldValue.arrayRemove(me) else FieldValue.arrayUnion(me)).await()
    }
    suspend fun deleteEvent(e: Event) { db.collection("events").document(e.id).delete().await() }

    /* ---------- Эфиры ---------- */
    fun liveQuery(): Query = db.collection("streams").whereEqualTo("live", true).limit(30)
}
