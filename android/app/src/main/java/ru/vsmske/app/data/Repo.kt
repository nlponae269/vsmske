package ru.vsmske.app.data

import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Всё общение с Firestore. Каждая запись повторяет то, что делает сайт (app.js), —
 * правила (firestore.rules) пропускают только такие документы, лишнее поле = permission-denied.
 */
object Repo {
    private val db get() = Fb.db
    private val me get() = Fb.uid
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /* ---------- слушатели ---------- */

    private fun <T> Query.flow(map: (DocumentSnapshot) -> T): Flow<List<T>> = callbackFlow {
        val reg = addSnapshotListener { s, e ->
            if (e != null) { close(e); return@addSnapshotListener }
            if (s != null) trySend(s.documents.map(map))
        }
        awaitClose { reg.remove() }
    }

    private fun <T> DocumentReference.flow(map: (DocumentSnapshot) -> T): Flow<T> = callbackFlow {
        val reg = addSnapshotListener { s, e ->
            if (e != null) { close(e); return@addSnapshotListener }
            if (s != null) trySend(map(s))
        }
        awaitClose { reg.remove() }
    }

    /* ---------- люди (кэш, как ensureUsers на сайте) ---------- */

    private val _users = MutableStateFlow<Map<String, User>>(emptyMap())
    val users: StateFlow<Map<String, User>> = _users
    private val pending = mutableSetOf<String>()

    fun ensureUsers(ids: Collection<String>) {
        val miss = ids.filter { it.isNotEmpty() && it !in _users.value && it !in pending }.toSet()
        if (miss.isEmpty()) return
        pending.addAll(miss)
        miss.forEach { id ->
            scope.launch {
                val u = runCatching { User.from(db.collection("users").document(id).get().await()) }.getOrNull()
                if (u != null) _users.update { it + (id to u) }
                pending.remove(id)
            }
        }
    }

    fun putUser(u: User) = _users.update { it + (u.id to u) }

    fun userFlow(id: String): Flow<User> = db.collection("users").document(id).flow { User.from(it) }

    /* ---------- вход и профиль ---------- */

    suspend fun nickTaken(nick: String) = db.collection("usernames").document(nick).get().await().exists()

    suspend fun login(email: String, pass: String) { Fb.auth.signInWithEmailAndPassword(email, pass).await() }

    suspend fun register(email: String, pass: String, name: String, nick: String) {
        Fb.auth.createUserWithEmailAndPassword(email, pass).await()
        createProfile(name, nick)
    }

    /** createProfile() с сайта: ник и профиль одной пачкой */
    suspend fun createProfile(name: String, nick: String, city: String = "", photo: String = "") {
        val id = me
        val taken = db.collection("usernames").document(nick).get().await()
        if (taken.exists() && taken.getString("uid") != id) throw IllegalStateException("Короткое имя уже занято, выберите другое.")
        val n = name.take(60); val c = city.take(40)
        db.batch()
            .set(db.collection("usernames").document(nick), mapOf("uid" to id))
            .set(db.collection("users").document(id), mapOf(
                "name" to n, "nick" to nick, "city" to c, "status" to "", "about" to "", "photo" to photo,
                "color" to COLORS.random(), "friends" to emptyList<String>(), "search" to buildSearch(n, nick, c),
                "createdAt" to FieldValue.serverTimestamp(),
            ))
            .commit().await()
    }

    suspend fun profileExists(id: String) = db.collection("users").document(id).get().await().exists()

    suspend fun updateProfile(u: User, name: String, status: String, city: String, about: String, photo: String) {
        db.collection("users").document(u.id).update(mapOf(
            "name" to name.take(60), "status" to status.take(120), "city" to city.take(40), "about" to about.take(600),
            "photo" to photo, "search" to buildSearch(name, u.nick, city),
        )).await()
    }

    private var seenAt = 0L
    /** «в сети» — не чаще раза в 4 минуты, как на сайте */
    fun touchSeen() {
        if (me.isEmpty() || System.currentTimeMillis() - seenAt < 4 * 60_000) return
        seenAt = System.currentTimeMillis()
        db.collection("users").document(me).update("lastSeen", FieldValue.serverTimestamp())
    }

    /* ---------- записи ---------- */

    fun allFeed(): Flow<List<Post>> =
        db.collection("posts").orderBy("createdAt", Query.Direction.DESCENDING).limit(50).flow { Post.from(it) }

    /** Лента друзей: authorId in [я + друзья] пачками по 30 (индекс authorId + createdAt есть) */
    fun friendsFeed(ids: List<String>): Flow<List<Post>> {
        val flows = ids.distinct().chunked(30).map { c ->
            db.collection("posts").whereIn("authorId", c).orderBy("createdAt", Query.Direction.DESCENDING).limit(50).flow { Post.from(it) }
        }
        if (flows.isEmpty()) return flowOf(emptyList())
        return combine(flows) { arr -> arr.toList().flatten().distinctBy { it.id }.sortedByDescending { it.createdAt } }
    }

    fun wall(uid: String): Flow<List<Post>> =
        db.collection("posts").whereEqualTo("wallId", uid).orderBy("createdAt", Query.Direction.DESCENDING).limit(50).flow { Post.from(it) }

    fun post(id: String): Flow<Post?> = db.collection("posts").document(id).flow { if (it.exists()) Post.from(it) else null }

    suspend fun getPost(id: String): Post? = runCatching { db.collection("posts").document(id).get().await() }.getOrNull()?.takeIf { it.exists() }?.let { Post.from(it) }

    suspend fun createPost(wall: String, text: String, images: List<String>) {
        val post = hashMapOf<String, Any>(
            "authorId" to me, "wallId" to wall, "text" to text, "image" to (if (images.size == 1) images[0] else ""),
            "likes" to emptyList<String>(), "commentCount" to 0, "createdAt" to FieldValue.serverTimestamp(),
        )
        if (images.size > 1) post["images"] = images
        extractTags(text).takeIf { it.isNotEmpty() }?.let { post["tags"] = it }
        val ref = db.collection("posts").add(post).await()
        if (wall != me) notify(wall, "wall", ref.id, text.ifEmpty { "Фото" })
    }

    suspend fun toggleLike(p: Post) {
        val had = me in p.likes
        val nid = "like_${p.id}_$me"
        db.collection("posts").document(p.id).update("likes", if (had) FieldValue.arrayRemove(me) else FieldValue.arrayUnion(me)).await()
        if (p.authorId != me) {
            if (had) db.collection("notifs").document(nid).delete()
            else notify(p.authorId, "like", p.id, p.text.ifEmpty { p.poll?.q ?: "Фото" }, nid)
        }
    }

    suspend fun vote(p: Post, i: Int) { db.collection("posts").document(p.id).update("poll.votes.$me", i).await() }

    suspend fun deletePost(id: String) {
        val cs = db.collection("posts").document(id).collection("comments").get().await()
        val b = db.batch()
        cs.documents.take(480).forEach { b.delete(it.reference) }
        b.delete(db.collection("posts").document(id))
        b.commit().await()
    }

    fun comments(postId: String): Flow<List<Comment>> =
        db.collection("posts").document(postId).collection("comments").orderBy("createdAt").limit(300).flow { Comment.from(it) }

    suspend fun addComment(p: Post, text: String) {
        val post = db.collection("posts").document(p.id)
        db.batch()
            .set(post.collection("comments").document(), mapOf("authorId" to me, "text" to text.take(1000), "createdAt" to FieldValue.serverTimestamp()))
            .update(post, "commentCount", FieldValue.increment(1))
            .commit().await()
        notify(p.authorId, "comment", p.id, text)
    }

    suspend fun deleteComment(postId: String, id: String) {
        val post = db.collection("posts").document(postId)
        db.batch().delete(post.collection("comments").document(id)).update(post, "commentCount", FieldValue.increment(-1)).commit().await()
    }

    suspend fun toggleCommentLike(postId: String, c: Comment) {
        db.collection("posts").document(postId).collection("comments").document(c.id)
            .update("likes", if (me in c.likes) FieldValue.arrayRemove(me) else FieldValue.arrayUnion(me)).await()
    }

    /* ---------- уведомления ---------- */

    /** notify() сайта: «по возможности», основное действие от него не зависит */
    fun notify(to: String, type: String, postId: String = "", text: String = "", id: String? = null) {
        if (to.isEmpty() || to == me) return
        val n = mapOf("to" to to, "from" to me, "type" to type, "postId" to postId, "text" to text.take(120), "createdAt" to FieldValue.serverTimestamp())
        (if (id != null) db.collection("notifs").document(id) else db.collection("notifs").document()).set(n)
    }

    fun notifs(): Flow<List<Notif>> =
        db.collection("notifs").whereEqualTo("to", me).limit(150).flow { Notif.from(it) }

    fun markNotifsSeen() { db.collection("users").document(me).update("notifSeenAt", FieldValue.serverTimestamp()) }

    /* ---------- друзья ---------- */

    fun incoming(): Flow<List<FriendRequest>> = db.collection("friendRequests").whereEqualTo("to", me).flow { FriendRequest.from(it) }
    fun outgoing(): Flow<List<FriendRequest>> = db.collection("friendRequests").whereEqualTo("from", me).flow { FriendRequest.from(it) }

    suspend fun friendAdd(to: String) {
        db.collection("friendRequests").document("${me}_$to").set(mapOf("from" to me, "to" to to, "createdAt" to FieldValue.serverTimestamp())).await()
    }

    suspend fun friendCancel(to: String) { db.collection("friendRequests").document("${me}_$to").delete().await() }

    suspend fun friendAccept(from: String, alsoMine: Boolean) {
        val b = db.batch()
            .update(db.collection("users").document(me), "friends", FieldValue.arrayUnion(from))
            .update(db.collection("users").document(from), "friends", FieldValue.arrayUnion(me))
            .delete(db.collection("friendRequests").document("${from}_$me"))
        if (alsoMine) b.delete(db.collection("friendRequests").document("${me}_$from"))
        b.commit().await()
        _users.update { it - from }
        notify(from, "friend")
    }

    suspend fun friendDecline(from: String) { db.collection("friendRequests").document("${from}_$me").delete().await() }

    suspend fun friendRemove(id: String) {
        db.batch()
            .update(db.collection("users").document(me), "friends", FieldValue.arrayRemove(id))
            .update(db.collection("users").document(id), "friends", FieldValue.arrayRemove(me))
            .commit().await()
        _users.update { it - id }
    }

    suspend fun searchPeople(q: String): List<User> {
        val words = q.trim().lowercase().replace('ё', 'е').split(Regex("\\s+")).filter { it.isNotEmpty() }
        val s = if (words.isEmpty()) db.collection("users").orderBy("createdAt", Query.Direction.DESCENDING).limit(40).get().await()
        else db.collection("users").whereArrayContains("search", words[0].take(15)).limit(40).get().await()
        return s.documents.filter { d ->
            val search = (d.get("search") as? List<*>) ?: emptyList<Any>()
            words.drop(1).all { w -> w.take(15) in search }
        }.map { User.from(it).also(::putUser) }
    }

    suspend fun friendsOf(ids: List<String>): List<User> = ids.chunked(30).flatMap { c ->
        db.collection("users").whereIn(com.google.firebase.firestore.FieldPath.documentId(), c).get().await().documents.map { User.from(it).also(::putUser) }
    }

    /* ---------- сообщения ---------- */

    fun chats(): Flow<List<Chat>> =
        db.collection("chats").whereArrayContains("members", me).orderBy("lastAt", Query.Direction.DESCENDING).limit(100).flow { Chat.from(it) }

    fun messages(key: String): Flow<List<Message>> =
        db.collection("chats").document(chatKeyId(me, key)).collection("messages")
            .orderBy("createdAt").limitToLast(200).flow { Message.from(it) }

    /** sendMessage() сайта: сообщение и «последнее» в диалоге одной пачкой */
    suspend fun sendMessage(key: String, text: String, image: String = "") {
        val cid = chatKeyId(me, key)
        val msg = hashMapOf<String, Any>("from" to me, "text" to text.take(2000), "createdAt" to FieldValue.serverTimestamp())
        if (image.isNotEmpty()) msg["image"] = image
        val last = hashMapOf<String, Any>(
            "lastText" to text.ifEmpty { "📷 Фото" }.take(200), "lastFrom" to me, "lastAt" to FieldValue.serverTimestamp(),
            "read" to mapOf(me to FieldValue.serverTimestamp()),
        )
        if (!isRoom(key)) last["members"] = listOf(me, key).sorted()
        val chat = db.collection("chats").document(cid)
        db.batch().set(chat.collection("messages").document(), msg).set(chat, last, SetOptions.merge()).commit().await()
    }

    fun markRead(chat: Chat) {
        if (chat.unread(me)) db.collection("chats").document(chat.id).update("read.$me", FieldValue.serverTimestamp())
    }

    suspend fun deleteMessage(key: String, id: String) {
        db.collection("chats").document(chatKeyId(me, key)).collection("messages").document(id).delete().await()
    }

    /* ---------- музыка ---------- */

    suspend fun tracksAll(): List<Track> =
        db.collection("tracks").orderBy("createdAt", Query.Direction.DESCENDING).limit(60).get().await().documents.map { Track.from(it) }

    suspend fun tracksOf(owner: String, saved: List<String> = emptyList()): List<Track> {
        val list = db.collection("tracks").whereEqualTo("ownerId", owner).limit(200).get().await().documents.map { Track.from(it) }.toMutableList()
        saved.filter { id -> list.none { it.id == id } }.take(100).forEach { id ->
            runCatching { db.collection("tracks").document(id).get().await() }.getOrNull()?.takeIf { it.exists() }?.let { list.add(Track.from(it)) }
        }
        return list.sortedByDescending { it.createdAt }
    }

    suspend fun toggleSaved(t: Track, saved: Boolean) {
        db.collection("users").document(me).update("tracks", if (saved) FieldValue.arrayRemove(t.id) else FieldValue.arrayUnion(t.id)).await()
    }

    suspend fun deleteTrack(t: Track) {
        db.collection("tracks").document(t.id).delete().await()
        runCatching {
            val cs = db.collection("files").document(t.fileId).collection("chunks").get().await()
            val b = db.batch(); cs.documents.forEach { b.delete(it.reference) }; b.delete(db.collection("files").document(t.fileId)); b.commit().await()
        }
    }

    const val CHUNK = 700_000

    /** putFile() сайта: файл режется на куски base64 по 700 000 символов */
    suspend fun putFile(bytes: ByteArray, name: String, type: String, kind: String, progress: (Float) -> Unit): String {
        val b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        val n = maxOf(1, (b64.length + CHUNK - 1) / CHUNK)
        val ref = db.collection("files").document()
        ref.set(mapOf(
            "ownerId" to me, "kind" to kind, "name" to name.take(200), "size" to bytes.size.toLong(), "type" to type,
            "chunks" to n.toLong(), "status" to "uploading", "createdAt" to FieldValue.serverTimestamp(),
        )).await()
        for (i in 0 until n) {
            ref.collection("chunks").document(i.toString().padStart(4, '0'))
                .set(mapOf("i" to i.toLong(), "data" to b64.substring(i * CHUNK, minOf(b64.length, (i + 1) * CHUNK)))).await()
            progress((i + 1f) / n)
        }
        ref.update("status", "ready").await()
        return ref.id
    }

    suspend fun addTrack(fileId: String, title: String, artist: String, type: String, duration: Double, size: Long, cover: String) {
        val ref = db.collection("tracks").add(mapOf(
            "ownerId" to me, "title" to title.take(120), "artist" to artist.take(120), "fileId" to fileId, "type" to type,
            "duration" to duration, "size" to size, "createdAt" to FieldValue.serverTimestamp(),
        )).await()
        // обложку правила разрешают ставить только правкой трека (как на сайте)
        if (cover.isNotEmpty()) runCatching { ref.update("cover", cover).await() }
    }

    suspend fun fileChunks(fileId: String): List<String> =
        db.collection("files").document(fileId).collection("chunks").orderBy("i").get().await().documents.map { it.getString("data") ?: "" }

    fun setListening(title: String?, artist: String?) {
        if (me.isEmpty()) return
        val v: Any? = if (title == null) null else mapOf("title" to title.take(120), "artist" to (artist ?: "").take(120), "at" to FieldValue.serverTimestamp())
        db.collection("users").document(me).update("listening", v)
    }
}
