package ru.vsmske.app.data

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Состояние входа и «глобальные» подписки — как startSession() на сайте */
object Session {
    sealed interface Phase {
        data object Loading : Phase
        data object SignedOut : Phase
        data object NeedProfile : Phase
        data object Ready : Phase
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var jobs = mutableListOf<Job>()

    val phase = MutableStateFlow<Phase>(Phase.Loading)
    val me = MutableStateFlow<User?>(null)
    val chats = MutableStateFlow<List<Chat>>(emptyList())
    val incoming = MutableStateFlow<List<FriendRequest>>(emptyList())
    val outgoing = MutableStateFlow<List<FriendRequest>>(emptyList())
    val notifs = MutableStateFlow<List<Notif>>(emptyList())
    val error = MutableStateFlow<String?>(null)
    /** Регистрация: профиль создаём сами, слушатель входа не должен уходить на экран «заполните профиль» */
    @Volatile var creating = false

    private var started = false

    fun init() {
        if (started) return
        started = true
        Fb.auth.addAuthStateListener(FirebaseAuth.AuthStateListener { a -> onAuth(a.currentUser?.uid) })
    }

    private fun onAuth(uid: String?) {
        stop()
        if (uid == null) { phase.value = Phase.SignedOut; return }
        phase.value = Phase.Loading
        jobs += scope.launch {
            Repo.userFlow(uid).catch { error.value = it.message }.collect { u ->
                if (u.deleted) { if (!creating) phase.value = Phase.NeedProfile; return@collect }
                creating = false
                me.value = u; Repo.putUser(u)
                if (phase.value != Phase.Ready) { phase.value = Phase.Ready; startLists() }
            }
        }
    }

    private fun startLists() {
        jobs += scope.launch {
            Repo.chats().catch { error.value = it.message }.collect { list ->
                chats.value = list
                val my = Fb.uid
                Repo.ensureUsers(list.flatMap { c -> if (c.group) listOf(c.lastFrom) else listOf(c.key(my)) })
            }
        }
        jobs += scope.launch { Repo.incoming().catch { }.collect { incoming.value = it; Repo.ensureUsers(it.map { r -> r.from }) } }
        jobs += scope.launch { Repo.outgoing().catch { }.collect { outgoing.value = it; Repo.ensureUsers(it.map { r -> r.to }) } }
        jobs += scope.launch {
            Repo.notifs().catch { }.collect { list ->
                notifs.value = list.sortedByDescending { it.createdAt }
                Repo.ensureUsers(list.map { it.from })
            }
        }
        jobs += scope.launch { while (isActive) { Repo.touchSeen(); delay(60_000) } }
    }

    fun stop() {
        jobs.forEach { it.cancel() }; jobs.clear()
        me.value = null; chats.value = emptyList(); incoming.value = emptyList(); outgoing.value = emptyList(); notifs.value = emptyList()
    }

    fun unseenNotifs(): Int {
        val seen = me.value?.notifSeenAt ?: 0
        return notifs.value.count { it.from != Fb.uid && it.createdAt > seen }
    }

    fun signOut() { Fb.auth.signOut() }

    val meFlow: StateFlow<User?> get() = me
}
