package ru.vsmske.app.data

import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.tasks.await

/**
 * Всё, что приложение пишет в базу. Документы — ровно в том виде, что у сайта (app.js),
 * иначе правила Firestore (firestore.rules) их не пропустят.
 */
object Api {
    private val db get() = Fire.db
    private val me get() = Fire.uid
    private val now get() = FieldValue.serverTimestamp()

    /* ---------- Вход и профиль ---------- */
    suspend fun signIn(email: String, pass: String) { Fire.auth.signInWithEmailAndPassword(email.trim(), pass).await() }
    suspend fun signUp(email: String, pass: String) { Fire.auth.createUserWithEmailAndPassword(email.trim(), pass).await() }
    suspend fun reset(email: String) { Fire.auth.sendPasswordResetEmail(email.trim()).await() }
    fun signOut() = Fire.auth.signOut()

    /** Новый профиль: ник и профиль — одной пачкой (так требуют правила) */
    suspend fun createProfile(name: String, nick: String, city: String) {
        val n = nick.trim().lowercase()
        require(NICK_RE.matches(n)) { "Короткое имя: от 4 до 30 символов — латиница, цифры, точка и _" }
        val taken = db.collection("usernames").document(n).get().await()
        if (taken.exists() && taken.getString("uid") != me) error("Короткое имя уже занято, выберите другое")
        val nm = name.trim().take(60); val ct = city.trim().take(40)
        db.runBatch { b ->
            b.set(db.collection("usernames").document(n), mapOf("uid" to me))
            b.set(db.collection("users").document(me), mapOf(
                "name" to nm, "nick" to n, "city" to ct, "status" to "", "about" to "", "photo" to "",
                "color" to COLORS.random(), "friends" to emptyList<String>(), "search" to buildSearch(nm, n, ct), "createdAt" to now,
            ))
        }.await()
    }

    suspend fun saveProfile(name: String, city: String, status: String, about: String, photo: String?) {
        val u = Store.me.value ?: return
        val nm = name.trim().take(60); val ct = city.trim().take(40)
        val patch = mutableMapOf<String, Any>("name" to nm, "city" to ct, "status" to status.trim().take(120), "about" to about.trim().take(600),
            "search" to buildSearch(nm, u.nick, ct))
        if (photo != null) patch["photo"] = photo
        db.collection("users").document(me).update(patch).await()
    }

    suspend fun markNotifsSeen() { db.collection("users").document(me).update("notifSeenAt", now).await() }

    /** Уведомление «по возможности»: если не вышло — не страшно */
    fun notify(to: String, type: String, postId: String = "", text: String = "", id: String? = null) {
        if (to.isEmpty() || to == me) return
        val data = mapOf("to" to to, "from" to me, "type" to type, "postId" to postId, "text" to text.take(120), "createdAt" to now)
        (if (id != null) db.collection("notifs").document(id) else db.collection("notifs").document()).set(data)
    }

    /* ---------- Записи ---------- */
    fun feedQuery(ids: List<String>, limit: Long): Query =
        db.collection("posts").whereIn("authorId", ids.take(30)).orderBy("createdAt", Query.Direction.DESCENDING).limit(limit)
    fun allQuery(limit: Long): Query = db.collection("posts").orderBy("createdAt", Query.Direction.DESCENDING).limit(limit)
    fun wallQuery(uid: String, limit: Long): Query =
        db.collection("posts").whereEqualTo("wallId", uid).orderBy("createdAt", Query.Direction.DESCENDING).limit(limit)

    suspend fun createPost(wall: String, text: String, images: List<String>, poll: Pair<String, List<String>>?) {
        val t = text.trim().take(4000)
        val data = mutableMapOf<String, Any>("authorId" to me, "wallId" to wall, "text" to t, "image" to (if (images.size == 1) images[0] else ""),
            "likes" to emptyList<String>(), "commentCount" to 0, "createdAt" to now)
        if (images.size > 1) data["images"] = images.take(4)
        val tags = extractTags(t); if (tags.isNotEmpty()) data["tags"] = tags
        if (poll != null) data["poll"] = mapOf("q" to poll.first.take(200), "options" to poll.second.take(6), "votes" to emptyMap<String, Int>())
        val ref = db.collection("posts").add(data).await()
        if (wall != me) notify(wall, "wall", ref.id, t.ifEmpty { poll?.first ?: "Фото" })
    }

    suspend fun toggleLike(p: Post) {
        val had = me in p.likes
        db.collection("posts").document(p.id).update("likes", if (had) FieldValue.arrayRemove(me) else FieldValue.arrayUnion(me)).await()
        val nid = "like_${p.id}_$me"
        if (p.authorId != me) {
            if (had) db.collection("notifs").document(nid).delete()
            else notify(p.authorId, "like", p.id, p.text.ifEmpty { p.poll?.q ?: "Фото" }, nid)
        }
    }

    suspend fun vote(p: Post, i: Int) { db.collection("posts").document(p.id).update(FieldPath.of("poll", "votes", me), i).await() }

    suspend fun deletePost(p: Post) { db.collection("posts").document(p.id).delete().await() }

    suspend fun addComment(p: Post, text: String) {
        val t = text.trim().take(1000); if (t.isEmpty()) return
        db.runBatch { b ->
            b.set(db.collection("posts").document(p.id).collection("comments").document(), mapOf("authorId" to me, "text" to t, "createdAt" to now))
            b.update(db.collection("posts").document(p.id), "commentCount", FieldValue.increment(1))
        }.await()
        notify(p.authorId, "comment", p.id, t)
    }

    suspend fun deleteComment(p: Post, c: Comment) {
        db.runBatch { b ->
            b.delete(db.collection("posts").document(p.id).collection("comments").document(c.id))
            b.update(db.collection("posts").document(p.id), "commentCount", FieldValue.increment(-1))
        }.await()
    }

    suspend fun toggleCommentLike(p: Post, c: Comment) {
        db.collection("posts").document(p.id).collection("comments").document(c.id)
            .update("likes", if (me in c.likes) FieldValue.arrayRemove(me) else FieldValue.arrayUnion(me)).await()
    }

    /* ---------- Друзья ---------- */
    suspend fun friendAdd(to: String) {
        if (Store.incoming.value.any { it.from == to }) return friendAccept(to)
        db.collection("friendRequests").document("${me}_$to").set(mapOf("from" to me, "to" to to, "createdAt" to now)).await()
    }
    suspend fun friendCancel(to: String) { db.collection("friendRequests").document("${me}_$to").delete().await() }
    suspend fun friendAccept(from: String) {
        db.runBatch { b ->
            b.update(db.collection("users").document(me), "friends", FieldValue.arrayUnion(from))
            b.update(db.collection("users").document(from), "friends", FieldValue.arrayUnion(me))
            b.delete(db.collection("friendRequests").document("${from}_$me"))
            if (Store.outgoing.value.any { it.to == from }) b.delete(db.collection("friendRequests").document("${me}_$from"))
        }.await()
        notify(from, "friend")
    }
    suspend fun friendDecline(from: String) { db.collection("friendRequests").document("${from}_$me").delete().await() }
    suspend fun friendRemove(id: String) {
        db.runBatch { b ->
            b.update(db.collection("users").document(me), "friends", FieldValue.arrayRemove(id))
            b.update(db.collection("users").document(id), "friends", FieldValue.arrayRemove(me))
        }.await()
    }

    suspend fun searchPeople(q: String): List<User> {
        val words = q.lowercase().replace('ё', 'е').trim().removePrefix("@").split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return emptyList()
        val s = db.collection("users").whereArrayContains("search", words[0].take(15)).limit(30).get().await()
        return s.documents.map(User::from).filter { u -> words.drop(1).all { w -> buildSearch(u.name, u.nick, u.city).contains(w.take(15)) } }
            .onEach(Store::put).map { Store.user(it.id) ?: it }
    }

    suspend fun recentPeople(): List<User> =
        db.collection("users").orderBy("createdAt", Query.Direction.DESCENDING).limit(40).get().await()
            .documents.map(User::from).onEach(Store::put).map { Store.user(it.id) ?: it }

    /* ---------- Сообщения ---------- */
    fun messagesQuery(cid: String): Query =
        db.collection("chats").document(cid).collection("messages").orderBy("createdAt", Query.Direction.ASCENDING).limitToLast(200)

    suspend fun sendMessage(key: String, text: String, image: String = "", replyTo: Message? = null) {
        val cid = chatKeyId(me, key)
        val msg = mutableMapOf<String, Any>("from" to me, "text" to text.take(2000), "createdAt" to now)
        if (image.isNotEmpty()) msg["image"] = image
        if (replyTo != null) msg["replyTo"] = mapOf("id" to replyTo.id, "from" to replyTo.from, "text" to replyTo.text.ifEmpty { if (replyTo.image.isNotEmpty()) "📷 Фото" else "🎤 Голосовое" }.take(120))
        val last = mutableMapOf<String, Any>("lastText" to text.ifEmpty { "📷 Фото" }.take(200), "lastFrom" to me, "lastAt" to now, "read" to mapOf(me to now))
        if (!isRoom(key)) last["members"] = listOf(me, key).sorted()
        db.runBatch { b ->
            b.set(db.collection("chats").document(cid).collection("messages").document(), msg)
            b.set(db.collection("chats").document(cid), last, SetOptions.merge())
        }.await()
    }

    fun markRead(c: Chat) {
        if (!c.unread(me)) return
        db.collection("chats").document(c.id).update(FieldPath.of("read", me), now)
    }

    suspend fun deleteMessage(key: String, m: Message) { db.collection("chats").document(chatKeyId(me, key)).collection("messages").document(m.id).delete().await() }

    suspend fun editMessage(key: String, m: Message, text: String) {
        db.collection("chats").document(chatKeyId(me, key)).collection("messages").document(m.id)
            .update(mapOf("text" to text.take(2000), "edited" to now)).await()
    }

    suspend fun react(key: String, m: Message, emoji: String) {
        val ref = db.collection("chats").document(chatKeyId(me, key)).collection("messages").document(m.id)
        ref.update(FieldPath.of("reacts", me), if (m.reacts[me] == emoji) FieldValue.delete() else emoji).await()
    }

    /* ---------- Музыка ---------- */
    suspend fun tracksAll(): List<Track> =
        db.collection("tracks").orderBy("createdAt", Query.Direction.DESCENDING).limit(100).get().await().documents.map(Track::from)

    /** Мои треки: сохранённые чужие (новые сверху) и свои загрузки */
    suspend fun tracksMine(saved: List<String>): List<Track> {
        val own = db.collection("tracks").whereEqualTo("ownerId", me).limit(300).get().await().documents.map(Track::from).sortedByDescending { it.createdAt }
        val ids = saved.reversed().filter { id -> own.none { it.id == id } }.take(300)
        val got = ids.chunked(10).flatMap { part -> db.collection("tracks").whereIn(FieldPath.documentId(), part).get().await().documents.map(Track::from) }
        return ids.mapNotNull { id -> got.firstOrNull { it.id == id } } + own
    }

    suspend fun toggleSaved(t: Track) {
        val has = t.id in (Store.me.value?.tracks ?: emptyList())
        db.collection("users").document(me).update("tracks", if (has) FieldValue.arrayRemove(t.id) else FieldValue.arrayUnion(t.id)).await()
    }

    suspend fun deleteTrack(t: Track) {
        db.collection("tracks").document(t.id).delete().await()
        runCatching {
            val chunks = db.collection("files").document(t.fileId).collection("chunks").get().await()
            db.runBatch { b -> chunks.documents.forEach { b.delete(it.reference) }; b.delete(db.collection("files").document(t.fileId)) }.await()
        }
    }

    /** «Сейчас слушает» в профиле (как пишет сайт) */
    fun setListening(t: Track?) {
        if (me.isEmpty()) return
        db.collection("users").document(me).update("listening",
            if (t == null) null else mapOf("title" to t.title.take(120), "artist" to t.artist.take(120), "at" to now))
    }
}
