package ru.vsmske.app.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Сессия и «живые» данные: мой профиль, диалоги, сигналы, заявки в друзья, кэш людей.
 * Всё через слушатели Firestore — экраны просто собирают StateFlow.
 */
object Store {
    enum class Phase { Loading, SignedOut, NeedProfile, Ready }

    val phase = MutableStateFlow(Phase.Loading)
    val me = MutableStateFlow<User?>(null)
    val chats = MutableStateFlow<List<Chat>>(emptyList())
    val notifs = MutableStateFlow<List<Notif>>(emptyList())
    val incoming = MutableStateFlow<List<FriendRequest>>(emptyList())
    val outgoing = MutableStateFlow<List<FriendRequest>>(emptyList())
    val mailIn = MutableStateFlow<List<Mail>>(emptyList())   // входящие письма ВС Почты (как cache.mailIn на сайте)
    private val _users = MutableStateFlow<Map<String, User>>(emptyMap())
    val users: StateFlow<Map<String, User>> = _users

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val subs = mutableListOf<ListenerRegistration>()
    private val loading = mutableSetOf<String>()
    private var started = false

    val uid get() = Fire.uid
    val iAmAdmin get() = me.value?.admin == true

    fun start() {
        if (started) return
        started = true
        Fire.auth.addAuthStateListener { a ->
            stop()
            val u = a.currentUser
            if (u == null) { phase.value = Phase.SignedOut; me.value = null; return@addAuthStateListener }
            phase.value = Phase.Loading
            listen(u.uid)
        }
    }

    private fun listen(id: String) {
        val db = Fire.db
        subs += db.collection("users").document(id).addSnapshotListener { s, e ->
            if (e != null) return@addSnapshotListener
            if (s == null || !s.exists()) { me.value = null; phase.value = Phase.NeedProfile; return@addSnapshotListener }
            val u = User.from(s)
            me.value = u; put(u)
            if (phase.value != Phase.Ready) { phase.value = Phase.Ready; startLive(id); touchSeen() }
        }
    }

    private fun startLive(id: String) {
        val db = Fire.db
        subs += db.collection("chats").whereArrayContains("members", id).orderBy("lastAt", Query.Direction.DESCENDING).limit(100)
            .addSnapshotListener { s, _ -> s ?: return@addSnapshotListener
                val list = s.documents.map(Chat::from); chats.value = list; need(list.flatMap { it.members }) }
        subs += db.collection("notifs").whereEqualTo("to", id).limit(150)
            .addSnapshotListener { s, _ -> s ?: return@addSnapshotListener
                val list = s.documents.map(Notif::from).sortedByDescending { it.createdAt }; notifs.value = list; need(list.map { it.from }) }
        subs += db.collection("friendRequests").whereEqualTo("to", id)
            .addSnapshotListener { s, _ -> s ?: return@addSnapshotListener
                val list = s.documents.map(FriendRequest::from); incoming.value = list; need(list.map { it.from }) }
        subs += db.collection("friendRequests").whereEqualTo("from", id)
            .addSnapshotListener { s, _ -> s ?: return@addSnapshotListener; outgoing.value = s.documents.map(FriendRequest::from) }
        subs += db.collection("mail").whereEqualTo("to", id).limit(300)
            .addSnapshotListener { s, _ -> s ?: return@addSnapshotListener
                val list = s.documents.map(Mail::from).filter { !it.delTo }.sortedByDescending { it.createdAt }; mailIn.value = list; need(list.map { it.from }) }
    }

    private fun stop() {
        subs.forEach { it.remove() }; subs.clear()
        chats.value = emptyList(); notifs.value = emptyList(); incoming.value = emptyList(); outgoing.value = emptyList(); mailIn.value = emptyList()
        _users.value = emptyMap(); loading.clear()
    }

    /** Положить человека в кэш (с маской для забаненных) */
    fun put(u: User) { _users.value = _users.value + (u.id to u.masked(uid, iAmAdmin)) }

    fun user(id: String): User? = _users.value[id]

    /** Догрузить людей, которых ещё нет в кэше */
    fun need(ids: Collection<String>) {
        val miss = ids.filter { it.isNotEmpty() && it !in _users.value && it !in loading }.distinct()
        if (miss.isEmpty()) return
        loading += miss
        miss.chunked(10).forEach { part ->
            scope.launch {
                runCatching { Fire.db.collection("users").whereIn(com.google.firebase.firestore.FieldPath.documentId(), part).get().await() }
                    .onSuccess { s ->
                        val got = s.documents.associate { it.id to User.from(it).masked(uid, iAmAdmin) }
                        val gone = part.filter { it !in got }.associateWith { User(it, "Удалённая страница", missing = true) }
                        _users.value = _users.value + got + gone
                    }
                loading -= part.toSet()
            }
        }
    }

    /** Свежая копия человека (например, при открытии профиля) */
    suspend fun fetchUser(id: String): User {
        val u = User.from(Fire.db.collection("users").document(id).get().await())
        put(u); return user(id) ?: u
    }

    fun unseenNotifs(): Int { val seen = me.value?.notifSeenAt ?: 0; return notifs.value.count { it.from != uid && it.createdAt > seen } }

    /** «В сети»: не чаще раза в 4 минуты */
    private var seenAt = 0L
    fun touchSeen() {
        if (uid.isEmpty() || phase.value != Phase.Ready || System.currentTimeMillis() - seenAt < 4 * 60_000) return
        seenAt = System.currentTimeMillis()
        Fire.db.collection("users").document(uid).update("lastSeen", FieldValue.serverTimestamp())
    }
}
