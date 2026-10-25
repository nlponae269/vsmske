package ru.vsmske.app.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot

/* Модели читаются из документов Firestore вручную (поля — как у сайта). */

private fun DocumentSnapshot.str(k: String) = getString(k) ?: ""
private fun DocumentSnapshot.ms(k: String): Long = (get(k) as? Timestamp)?.toDate()?.time ?: 0L
@Suppress("UNCHECKED_CAST")
private fun DocumentSnapshot.strs(k: String): List<String> = (get(k) as? List<*>)?.filterIsInstance<String>() ?: emptyList()
private fun Any?.tsMs(): Long = (this as? Timestamp)?.toDate()?.time ?: 0L

data class User(
    val id: String,
    val name: String,
    val nick: String = "",
    val city: String = "",
    val status: String = "",
    val about: String = "",
    val photo: String = "",
    val color: String = "",
    val friends: List<String> = emptyList(),
    val tracks: List<String> = emptyList(),
    val blocked: List<String> = emptyList(),
    val saved: List<String> = emptyList(),
    val groups: List<String> = emptyList(),
    val lastSeen: Long = 0,
    val notifSeenAt: Long = 0,
    val createdAt: Long = 0,
    val emoji: String = "",
    val admin: Boolean = false,
    val banUntil: Long? = null,      // null — нет бана; 0 — навсегда; иначе до этого времени
    val banReason: String = "",
    val banned: Boolean = false,     // маска «Deleted Account» (для всех, кроме самого человека и админов)
    val wallPrivacy: String = "friends",   // кто пишет на стене: friends | me
    val listening: String = "",
    val cover: String = "blue",          // ключ обложки профиля (COVERS на сайте)
    val missing: Boolean = false,
) {
    val online get() = lastSeen > 0 && System.currentTimeMillis() - lastSeen < 5 * 60_000
    val isBanned get() = banUntil != null && (banUntil == 0L || banUntil > System.currentTimeMillis())

    companion object {
        fun from(d: DocumentSnapshot): User {
            if (!d.exists()) return User(d.id, "Удалённая страница", missing = true)
            val ban = d.get("ban") as? Map<*, *>
            return User(
                id = d.id, name = d.str("name"), nick = d.str("nick"), city = d.str("city"), status = d.str("status"),
                about = d.str("about"), photo = d.str("photo"), color = d.str("color"), friends = d.strs("friends"),
                tracks = d.strs("tracks"), blocked = d.strs("blocked"), saved = d.strs("saved"), groups = d.strs("groups"), lastSeen = d.ms("lastSeen"), notifSeenAt = d.ms("notifSeenAt"),
                createdAt = d.ms("createdAt"), emoji = d.str("emoji"), admin = d.get("admin").let { it == true || it == "true" },
                banUntil = ban?.let { b -> b["until"]?.tsMs() ?: 0L }, banReason = ban?.get("reason") as? String ?: "",
                cover = d.str("cover").ifEmpty { "blue" },
                wallPrivacy = (d.get("privacy") as? Map<*, *>)?.get("wall") as? String ?: "friends",
                listening = (d.get("listening") as? Map<*, *>)?.let { l -> listOf(l["title"], l["artist"]).filterIsInstance<String>().filter { it.isNotEmpty() }.joinToString(" — ") } ?: "",
            )
        }
    }
}

/** Забаненный для других — «Deleted Account»: без фото, ника и сведений (как на сайте) */
fun User.masked(viewer: String, viewerAdmin: Boolean): User =
    if (!isBanned || id == viewer || viewerAdmin) this
    else User(id, "Deleted Account", banned = true, banUntil = banUntil, createdAt = createdAt, color = "#8E8A96")

data class Poll(val q: String, val options: List<String>, val votes: Map<String, Int>)

data class Post(
    val id: String,
    val authorId: String,
    val wallId: String,
    val groupId: String,
    val text: String,
    val images: List<String>,
    val poll: Poll?,
    val repostOf: String,
    val likes: List<String>,
    val commentCount: Int,
    val createdAt: Long,
    val editedAt: Long,
    val reposts: Int = 0,
) {
    companion object {
        fun from(d: DocumentSnapshot): Post {
            val img = d.str("image")
            val imgs = d.strs("images").ifEmpty { if (img.isNotEmpty()) listOf(img) else emptyList() }
            val p = d.get("poll") as? Map<*, *>
            val poll = p?.let {
                Poll(
                    it["q"] as? String ?: "", (it["options"] as? List<*>)?.map { o -> o.toString() } ?: emptyList(),
                    (it["votes"] as? Map<*, *>)?.mapNotNull { (k, v) -> (k as? String)?.let { kk -> (v as? Number)?.let { n -> kk to n.toInt() } } }?.toMap() ?: emptyMap(),
                )
            }
            return Post(d.id, d.str("authorId"), d.str("wallId"), d.str("groupId"), d.str("text"), imgs, poll, d.str("repostOf"),
                d.strs("likes"), (d.getLong("commentCount") ?: 0).toInt(), d.ms("createdAt"), d.ms("editedAt"), (d.getLong("reposts") ?: 0).toInt())
        }
    }
}

data class Comment(val id: String, val authorId: String, val text: String, val likes: List<String>, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = Comment(d.id, d.str("authorId"), d.str("text"), d.strs("likes"), d.ms("createdAt"))
    }
}

data class Chat(
    val id: String,
    val members: List<String>,
    val group: Boolean,
    val name: String,
    val ownerId: String,
    val lastText: String,
    val lastFrom: String,
    val lastAt: Long,
    val read: Map<String, Long>,
) {
    /** Ключ для экрана: uid собеседника или id беседы */
    fun key(me: String) = if (group) id else members.firstOrNull { it != me } ?: me
    fun unread(me: String) = lastFrom.isNotEmpty() && lastFrom != me && (read[me] ?: 0L) < lastAt

    companion object {
        fun from(d: DocumentSnapshot) = Chat(
            d.id, d.strs("members"), d.getBoolean("group") == true, d.str("name"), d.str("ownerId"),
            d.str("lastText"), d.str("lastFrom"), d.ms("lastAt"),
            (d.get("read") as? Map<*, *>)?.mapNotNull { (k, v) -> (k as? String)?.let { it to v.tsMs() } }?.toMap() ?: emptyMap(),
        )
    }
}

data class Message(
    val id: String,
    val from: String,
    val text: String,
    val image: String,
    val audio: String,
    val dur: Double,
    val replyText: String,
    val fwdName: String,
    val fwdText: String,
    val reacts: Map<String, String>,
    val edited: Boolean,
    val createdAt: Long,
    val pending: Boolean,
) {
    companion object {
        fun from(d: DocumentSnapshot): Message {
            val reply = d.get("replyTo") as? Map<*, *>
            val fwd = d.get("fwd") as? Map<*, *>
            return Message(
                d.id, d.str("from"), d.str("text"), d.str("image"), d.str("audio"), d.getDouble("dur") ?: 0.0,
                reply?.get("text") as? String ?: "", fwd?.get("name") as? String ?: "", fwd?.get("text") as? String ?: "",
                (d.get("reacts") as? Map<*, *>)?.mapNotNull { (k, v) -> (k as? String)?.let { it to v.toString() } }?.toMap() ?: emptyMap(),
                d.get("edited") != null, d.ms("createdAt").takeIf { it > 0 } ?: System.currentTimeMillis(), d.metadata.hasPendingWrites(),
            )
        }
    }
}

data class Track(
    val id: String,
    val ownerId: String,
    val title: String,
    val artist: String,
    val fileId: String,
    val type: String,
    val duration: Double,
    val cover: String,
    val lyrics: String,
    val createdAt: Long,
) {
    companion object {
        fun from(d: DocumentSnapshot) = Track(
            d.id, d.str("ownerId"), d.str("title"), d.str("artist"), d.str("fileId"), d.str("type").ifEmpty { "audio/mpeg" },
            d.getDouble("duration") ?: 0.0, d.str("cover"), d.str("lyrics"), d.ms("createdAt"),
        )
    }
}

data class Notif(val id: String, val from: String, val type: String, val postId: String, val text: String, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = Notif(d.id, d.str("from"), d.str("type"), d.str("postId"), d.str("text"), d.ms("createdAt"))
    }
}

data class FriendRequest(val from: String, val to: String, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = FriendRequest(d.str("from"), d.str("to"), d.ms("createdAt"))
    }
}

data class Video(
    val id: String,
    val ownerId: String,
    val title: String,
    val description: String,
    val source: String,      // file | link
    val provider: String,    // youtube | rutube | vk | direct
    val vid: String,
    val fileId: String,
    val type: String,
    val thumb: String,
    val duration: Double,
    val likes: List<String>,
    val views: Int,
    val createdAt: Long,
) {
    /** Обложка: своя (dataURL) или превью YouTube */
    val cover: String get() = thumb.ifEmpty { if (provider == "youtube" && Regex("^[\\w-]{11}$").matches(vid)) "https://i.ytimg.com/vi/$vid/hqdefault.jpg" else "" }
    /**
     * ВС Клипы: звук клипа. У роликов-файлов поле vid не используется — в нём лежит ссылка на звук:
     * «t:<трек>» — звук из библиотеки (ВС Музыка), «v:<клип>» — оригинальный звук другого клипа. Пусто — свой оригинальный звук.
     */
    val soundRef: String get() = if (source == "file" && (vid.startsWith("t:") || vid.startsWith("v:"))) vid else "v:$id"
    /** Адрес встроенного плеера для ссылок YouTube / Rutube / VK */
    val embed: String get() = when {
        provider == "youtube" && Regex("^[\\w-]{11}$").matches(vid) -> "https://www.youtube.com/embed/$vid?playsinline=1&autoplay=1"
        provider == "rutube" && Regex("^[a-f0-9]{32}$").matches(vid) -> "https://rutube.ru/play/embed/$vid"
        provider == "vk" && Regex("^-?\\d+_\\d+$").matches(vid) -> vid.split("_").let { "https://vk.com/video_ext.php?oid=${it[0]}&id=${it[1]}&hd=2&autoplay=1" }
        else -> ""
    }
    companion object {
        fun from(d: DocumentSnapshot) = Video(
            d.id, d.str("ownerId"), d.str("title"), d.str("description"), d.str("source"), d.str("provider"), d.str("vid"), d.str("fileId"),
            d.str("type").ifEmpty { "video/mp4" }, d.str("thumb"), d.getDouble("duration") ?: 0.0, d.strs("likes"), (d.getLong("views") ?: 0).toInt(), d.ms("createdAt"),
        )
    }
}

data class Album(val id: String, val ownerId: String, val title: String, val count: Int, val cover: String, val coverId: String, val updatedAt: Long) {
    companion object { fun from(d: DocumentSnapshot) = Album(d.id, d.str("ownerId"), d.str("title"), (d.getLong("count") ?: 0).toInt(), d.str("cover"), d.str("coverId"), d.ms("updatedAt")) }
}

data class Photo(val id: String, val ownerId: String, val albumId: String, val thumb: String, val createdAt: Long) {
    companion object { fun from(d: DocumentSnapshot) = Photo(d.id, d.str("ownerId"), d.str("albumId"), d.str("thumb"), d.ms("createdAt")) }
}

data class DiskFile(val id: String, val name: String, val size: Long, val type: String, val status: String, val createdAt: Long) {
    companion object { fun from(d: DocumentSnapshot) = DiskFile(d.id, d.str("name"), d.getLong("size") ?: 0, d.str("type"), d.str("status"), d.ms("createdAt")) }
}

data class Story(val id: String, val ownerId: String, val image: String, val text: String, val views: Map<String, Long>, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = Story(d.id, d.str("ownerId"), d.str("image"), d.str("text"),
            (d.get("views") as? Map<*, *>)?.mapNotNull { (k, v) -> (k as? String)?.let { it to v.tsMs() } }?.toMap() ?: emptyMap(), d.ms("createdAt"))
    }
}

data class Stream(val id: String, val ownerId: String, val title: String, val mode: String, val live: Boolean, val beat: Long, val to: String, val createdAt: Long) {
    /** Живой — если «пульс» свежее 150 секунд (как liveFresh() на сайте) */
    val fresh get() = live && System.currentTimeMillis() - beat < 150_000
    companion object { fun from(d: DocumentSnapshot) = Stream(d.id, d.str("ownerId"), d.str("title"), d.str("mode"), d.getBoolean("live") == true, d.ms("beat"), d.str("to"), d.ms("createdAt")) }
}

data class Playlist(val id: String, val ownerId: String, val title: String, val tracks: List<String>, val color: String, val updatedAt: Long) {
    companion object { fun from(d: DocumentSnapshot) = Playlist(d.id, d.str("ownerId"), d.str("title"), d.strs("tracks"), d.str("color"), d.ms("updatedAt")) }
}

data class Gift(val id: String, val from: String, val gift: String, val text: String, val createdAt: Long) {
    companion object { fun from(d: DocumentSnapshot) = Gift(d.id, d.str("from"), d.str("gift"), d.str("text"), d.ms("createdAt")) }
}

/** Сообщество (groups): записи — posts с wallId = groupId и полем groupId, пишут только админы */
data class Group(val id: String, val name: String, val about: String, val photo: String, val cover: String, val ownerId: String,
                 val admins: List<String>, val membersCount: Int, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = Group(d.id, d.str("name").ifEmpty { "Сообщество" }, d.str("about"), d.str("photo"), d.str("cover").ifEmpty { "blue" },
            d.str("ownerId"), d.strs("admins"), (d.getLong("membersCount") ?: 0).toInt().coerceAtLeast(0), d.ms("createdAt"))
    }
}

data class Note(val id: String, val title: String, val text: String, val color: String, val pinned: Boolean, val updatedAt: Long) {
    companion object { fun from(d: DocumentSnapshot) = Note(d.id, d.str("title"), d.str("text"), d.str("color"), d.getBoolean("pinned") == true, d.ms("updatedAt")) }
}

/** ВС Маркет: объявление */
data class Lot(val id: String, val ownerId: String, val title: String, val price: Long, val category: String, val city: String, val text: String,
               val image: String, val sold: Boolean, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = Lot(d.id, d.str("ownerId"), d.str("title"), d.getLong("price") ?: 0, d.str("category").ifEmpty { "other" }, d.str("city"),
            d.str("text"), d.str("image"), d.getBoolean("sold") == true, d.ms("createdAt"))
    }
}

/** ВС События */
data class Event(val id: String, val ownerId: String, val title: String, val text: String, val place: String, val at: Long, val cover: String,
                 val going: List<String>, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = Event(d.id, d.str("ownerId"), d.str("title"), d.str("text"), d.str("place"), d.ms("at"), d.str("cover"), d.strs("going"), d.ms("createdAt"))
    }
}

/** ВС Ответы: вопрос и ответ */
data class Question(val id: String, val authorId: String, val title: String, val text: String, val category: String, val answersCount: Long,
                    val bestId: String, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = Question(d.id, d.str("authorId"), d.str("title"), d.str("text"), d.str("category").ifEmpty { "other" },
            d.getLong("answersCount") ?: 0, d.str("bestId"), d.ms("createdAt"))
    }
}

data class Answer(val id: String, val authorId: String, val text: String, val likes: List<String>, val createdAt: Long) {
    companion object { fun from(d: DocumentSnapshot) = Answer(d.id, d.str("authorId"), d.str("text"), d.strs("likes"), d.ms("createdAt")) }
}

/** ВС Почта: письмо с темой; каждый «удаляет» у себя */
data class Mail(val id: String, val from: String, val to: String, val subject: String, val text: String, val read: Boolean,
                val delFrom: Boolean, val delTo: Boolean, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = Mail(d.id, d.str("from"), d.str("to"), d.str("subject"), d.str("text"), d.getBoolean("read") == true,
            d.getBoolean("delFrom") == true, d.getBoolean("delTo") == true, d.ms("createdAt"))
    }
}
