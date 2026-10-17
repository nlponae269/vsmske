package ru.vsmske.app.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.DocumentSnapshot.ServerTimestampBehavior

/* Модели — ровно те поля, что пишет сайт (см. firestore.rules). Читаем «мягко»: старые документы могут быть без части полей. */

private fun DocumentSnapshot.ts(f: String): Long =
    (get(f, ServerTimestampBehavior.ESTIMATE) as? Timestamp)?.toDate()?.time ?: 0L

private fun DocumentSnapshot.str(f: String) = getString(f) ?: ""

@Suppress("UNCHECKED_CAST")
private fun DocumentSnapshot.strList(f: String): List<String> = (get(f) as? List<*>)?.filterIsInstance<String>() ?: emptyList()

data class User(
    val id: String,
    val name: String = "",
    val nick: String = "",
    val city: String = "",
    val status: String = "",
    val about: String = "",
    val photo: String = "",
    val color: String = "",
    val friends: List<String> = emptyList(),
    val createdAt: Long = 0,
    val lastSeen: Long = 0,
    val notifSeenAt: Long = 0,
    val cover: String = "blue",
    val bday: String = "",
    val emoji: String = "",
    val tracks: List<String> = emptyList(),
    val admin: Boolean = false,
    val privacyMessages: String = "all",
    val privacyWall: String = "friends",
    val listening: String = "",
    val deleted: Boolean = false,
) {
    val online get() = lastSeen > 0 && System.currentTimeMillis() - lastSeen < 5 * 60_000

    companion object {
        fun from(d: DocumentSnapshot): User {
            if (!d.exists()) return User(d.id, name = "Удалённая страница", deleted = true)
            val privacy = d.get("privacy") as? Map<*, *>
            val lis = d.get("listening") as? Map<*, *>
            return User(
                id = d.id, name = d.str("name"), nick = d.str("nick"), city = d.str("city"), status = d.str("status"),
                about = d.str("about"), photo = d.str("photo"), color = d.str("color"), friends = d.strList("friends"),
                createdAt = d.ts("createdAt"), lastSeen = d.ts("lastSeen"), notifSeenAt = d.ts("notifSeenAt"),
                cover = d.getString("cover") ?: "blue", bday = d.str("bday"), emoji = d.str("emoji"), tracks = d.strList("tracks"),
                admin = d.get("admin").let { it == true || it == "true" },
                privacyMessages = privacy?.get("messages") as? String ?: "all",
                privacyWall = privacy?.get("wall") as? String ?: "friends",
                listening = lis?.takeIf { (it["at"] as? Timestamp)?.toDate()?.time?.let { t -> System.currentTimeMillis() - t < 20 * 60_000 } == true }?.let { listOf(it["artist"] as? String, it["title"] as? String).filter { s -> !s.isNullOrBlank() }.joinToString(" — ") } ?: "",
            )
        }
    }
}

data class Poll(val q: String, val options: List<String>, val votes: Map<String, Int>)

data class Post(
    val id: String,
    val authorId: String,
    val wallId: String,
    val groupId: String = "",
    val text: String = "",
    val images: List<String> = emptyList(),
    val likes: List<String> = emptyList(),
    val commentCount: Int = 0,
    val reposts: Int = 0,
    val repostOf: String = "",
    val poll: Poll? = null,
    val createdAt: Long = 0,
    val edited: Boolean = false,
) {
    companion object {
        fun from(d: DocumentSnapshot): Post {
            val img = d.str("image")
            val imgs = d.strList("images").ifEmpty { if (img.isNotEmpty()) listOf(img) else emptyList() }
            val pm = d.get("poll") as? Map<*, *>
            val poll = pm?.let {
                Poll(
                    q = it["q"] as? String ?: "",
                    options = (it["options"] as? List<*>)?.map { o -> o.toString() } ?: emptyList(),
                    votes = (it["votes"] as? Map<*, *>)?.entries?.associate { e -> e.key.toString() to ((e.value as? Number)?.toInt() ?: 0) } ?: emptyMap(),
                )
            }
            return Post(
                id = d.id, authorId = d.str("authorId"), wallId = d.str("wallId"), groupId = d.str("groupId"),
                text = d.str("text"), images = imgs, likes = d.strList("likes"),
                commentCount = (d.getLong("commentCount") ?: 0).toInt(), reposts = (d.getLong("reposts") ?: 0).toInt(),
                repostOf = d.str("repostOf"), poll = poll, createdAt = d.ts("createdAt"), edited = d.contains("editedAt"),
            )
        }
    }
}

data class Comment(val id: String, val authorId: String, val text: String, val likes: List<String>, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = Comment(d.id, d.str("authorId"), d.str("text"), d.strList("likes"), d.ts("createdAt"))
    }
}

data class FriendRequest(val id: String, val from: String, val to: String, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = FriendRequest(d.id, d.str("from"), d.str("to"), d.ts("createdAt"))
    }
}

data class Chat(
    val id: String,
    val members: List<String>,
    val group: Boolean,
    val name: String,
    val lastText: String,
    val lastFrom: String,
    val lastAt: Long,
    val read: Map<String, Long>,
) {
    /** uid собеседника в личном диалоге или id беседы — так диалог задаётся и на сайте */
    fun key(me: String) = if (group) id else members.firstOrNull { it != me } ?: me
    fun unread(me: String) = lastFrom != me && (read[me] ?: 0) < lastAt

    companion object {
        fun from(d: DocumentSnapshot): Chat {
            val r = (d.get("read", ServerTimestampBehavior.ESTIMATE) as? Map<*, *>)?.entries?.associate { e ->
                e.key.toString() to ((e.value as? Timestamp)?.toDate()?.time ?: Long.MAX_VALUE)
            } ?: emptyMap()
            return Chat(d.id, d.strList("members"), d.getBoolean("group") == true, d.str("name"),
                d.str("lastText"), d.str("lastFrom"), d.ts("lastAt"), r)
        }
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
    val reacts: Map<String, String>,
    val createdAt: Long,
    val edited: Boolean,
) {
    companion object {
        fun from(d: DocumentSnapshot): Message {
            val rep = d.get("replyTo") as? Map<*, *>
            val fwd = d.get("fwd") as? Map<*, *>
            return Message(
                d.id, d.str("from"), d.str("text").ifEmpty { fwd?.get("text") as? String ?: "" }, d.str("image"), d.str("audio"),
                d.getDouble("dur") ?: 0.0, rep?.get("text") as? String ?: "", fwd?.get("name") as? String ?: "",
                (d.get("reacts") as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value.toString() } ?: emptyMap(),
                d.ts("createdAt"), d.contains("edited"),
            )
        }
    }
}

data class Notif(val id: String, val from: String, val type: String, val postId: String, val text: String, val createdAt: Long) {
    companion object {
        fun from(d: DocumentSnapshot) = Notif(d.id, d.str("from"), d.str("type"), d.str("postId"), d.str("text"), d.ts("createdAt"))
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
            d.id, d.str("ownerId"), d.str("title"), d.str("artist"), d.str("fileId"), d.str("type"),
            d.getDouble("duration") ?: 0.0, d.str("cover"), d.str("lyrics"), d.ts("createdAt"),
        )
    }
}
