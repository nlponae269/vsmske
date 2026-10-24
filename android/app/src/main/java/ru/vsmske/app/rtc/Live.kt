package ru.vsmske.app.rtc

import android.content.Context
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.PeerConnection
import org.webrtc.VideoTrack
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Store

/*
 * ВС Эфир в приложении — совместим с сайтом:
 * стример (камера телефона) отдаёт видео до 3 зрителям напрямую; зрители с сайта передают его дальше по цепочке.
 * Зритель в приложении берёт видео у ближайшего узла (nodes) с местами. Сам приложение-зритель дальше не передаёт
 * (cap = 0 — так сайт тоже поступает с последним уровнем цепочки), поэтому в nodes не пишет.
 * Чат и счётчик — по каналу данных: {t:'m'} вверх к стримеру, {t:'b'} вниз всем, {t:'h'} история, {t:'c'} число зрителей, {t:'p'} присутствие.
 */
object Live {
    data class Msg(val id: String, val u: String, val x: String, val ts: Long)
    data class Ui(
        val sid: String = "",
        val host: Boolean = false,
        val title: String = "",
        val status: String = "",          // connecting | live | failed | ended
        val count: Int = 0,
        val chat: List<Msg> = emptyList(),
        val video: VideoTrack? = null,
        val front: Boolean = true,
        val mic: Boolean = true,
        val t0: Long = 0,
    ) { val active get() = sid.isNotEmpty() && status != "ended" }

    val ui = MutableStateFlow(Ui())
    private const val ROOT = 3
    private const val STALE = 150_000L
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var jobs = mutableListOf<Job>()
    private var subs = mutableListOf<ListenerRegistration>()
    private var local: LocalMedia? = null
    private val kids = linkedMapOf<String, Kid>()
    private val seenPeers = mutableSetOf<String>()
    private val seenMsg = LinkedHashSet<String>()
    private val last = mutableMapOf<String, Long>()
    private val muted = mutableSetOf<String>()
    private var up: Peer? = null
    private var upChan: Chan? = null
    private var mine = 0L
    private val db get() = Fire.db
    private val me get() = Fire.uid

    private class Kid(val peer: Peer, val uid: String) { var chan: Chan? = null; var pres: List<String> = emptyList(); var presAt = 0L }

    /* ---------- стример ---------- */
    suspend fun start(ctx: Context, title: String, front: Boolean) {
        if (ui.value.active) stop()
        Rtc.init(ctx)
        val m = LocalMedia(ctx, video = true, front = front)
        if (m.video == null) { m.stop(); error("Не нашли камеру") }
        val ref = try {
            db.collection("streams").add(mapOf("ownerId" to me, "title" to title.trim().take(100), "mode" to "camera", "live" to true,
                "beat" to FieldValue.serverTimestamp(), "createdAt" to FieldValue.serverTimestamp(), "endedAt" to null)).await()
        } catch (e: Exception) { m.stop(); throw e }
        local = m
        ui.value = Ui(ref.id, true, title.trim(), "live", video = m.video, front = front, t0 = System.currentTimeMillis())
        listenPeers(ref.id)
        nodePut()
        jobs += scope.launch { while (isActive) { delay(60_000); db.collection("streams").document(ref.id).update("beat", FieldValue.serverTimestamp()); nodePut() } }
        jobs += scope.launch { while (isActive) { delay(4000); tick() } }
    }

    fun switchCamera() { local?.switchCamera(); ui.value = ui.value.copy(front = local?.front ?: true) }
    fun toggleMic() { val on = !ui.value.mic; local?.setMic(on); ui.value = ui.value.copy(mic = on) }
    fun mute(u: String) { muted += u }

    private fun listenPeers(sid: String) {
        subs += db.collection("streams").document(sid).collection("peers").whereEqualTo("to", me).addSnapshotListener { s, _ ->
            s?.documentChanges?.forEach { ch -> if (ch.type == com.google.firebase.firestore.DocumentChange.Type.ADDED) accept(ch.document) }
        }
    }

    private fun accept(d: com.google.firebase.firestore.DocumentSnapshot) {
        if (d.contains("answer") || d.contains("rej") || !seenPeers.add(d.id)) return
        val from = d.getString("uid") ?: ""; val offer = d.getString("offer") ?: ""
        val m = local
        if (!ui.value.host || m == null || kids.size >= ROOT || from == me || offer.isEmpty() || offer == "no") { d.reference.update("rej", true); return }
        lateinit var kid: Kid
        val peer = Peer(onChannel = { dc -> scope.launch { kidChannel(kid, dc) } })
        kid = Kid(peer, from); kids[d.id] = kid
        scope.launch {
            try {
                val ans = peer.answer(offer) { peer.addLocal(m); peer.limitVideo(1_500_000) }
                d.reference.update("answer", ans).await()
                nodePut()
                val ok = withTimeoutOrNull(20_000) { peer.state.first { it == PeerConnection.PeerConnectionState.CONNECTED } }
                if (ok == null) drop(d.id)
                else scope.launch {
                    peer.state.first { it == PeerConnection.PeerConnectionState.FAILED || it == PeerConnection.PeerConnectionState.CLOSED || it == PeerConnection.PeerConnectionState.DISCONNECTED }
                    if (peer.state.value == PeerConnection.PeerConnectionState.DISCONNECTED) { delay(7000); if (peer.state.value == PeerConnection.PeerConnectionState.CONNECTED) return@launch }
                    drop(d.id)
                }
            } catch (e: Exception) { drop(d.id) }
        }
    }

    private fun drop(id: String) { val k = kids.remove(id) ?: return; k.chan?.close(); k.peer.close(); nodePut() }

    private fun kidChannel(kid: Kid, dc: org.webrtc.DataChannel) {
        kid.chan = Chan(dc, onOpen = {
            scope.launch {
                kid.chan?.send(JSONObject().put("t", "h").put("list", JSONArray(ui.value.chat.takeLast(30).map { it.json() })))
                kid.chan?.send(JSONObject().put("t", "c").put("n", ui.value.count))
            }
        }, onMsg = { m ->
            scope.launch {
                when (m.optString("t")) {
                    "p" -> { kid.pres = m.optJSONArray("u")?.let { a -> (0 until minOf(400, a.length())).map { a.optString(it) } } ?: emptyList(); kid.presAt = System.currentTimeMillis() }
                    "m" -> {
                        val x = m.optString("x").trim().take(200)
                        if (x.isNotEmpty()) route(Msg(m.optString("id").ifEmpty { Rtc.rid() }.take(16), m.optString("u").ifEmpty { kid.uid }.take(40), x, System.currentTimeMillis()))
                    }
                }
            }
        })
    }

    private fun Msg.json() = JSONObject().put("id", id).put("u", u).put("x", x).put("ts", ts)

    private fun route(msg: Msg) {
        if (ui.value.host) {
            if (msg.u in muted || System.currentTimeMillis() - (last[msg.u] ?: 0) < 1200) return
            last[msg.u] = System.currentTimeMillis(); broadcast(msg)
        } else upChan?.send(JSONObject().put("t", "m").put("id", msg.id).put("u", msg.u).put("x", msg.x))
    }
    private fun broadcast(msg: Msg) {
        show(msg)
        val j = msg.json().put("t", "b")
        kids.values.forEach { it.chan?.send(j) }
    }
    private fun show(msg: Msg) {
        if (!seenMsg.add(msg.id)) return
        if (seenMsg.size > 400) seenMsg.remove(seenMsg.first())
        Store.need(listOf(msg.u))
        ui.value = ui.value.copy(chat = (ui.value.chat + msg).takeLast(100))
    }

    /** Сообщение в чат эфира (медленный режим 1,2 с) */
    fun say(text: String): Boolean {
        val x = text.trim().take(200); if (x.isEmpty() || !ui.value.active) return false
        if (System.currentTimeMillis() - mine < 1200) return false
        mine = System.currentTimeMillis()
        val msg = Msg(Rtc.rid(), me, x, System.currentTimeMillis())
        if (ui.value.host) { last[me] = 0; broadcast(msg) } else { show(msg); route(msg) }
        return true
    }

    private fun tick() {
        val set = mutableSetOf(me); val now = System.currentTimeMillis()
        kids.values.forEach { k -> if (now - k.presAt < 12_000) set += k.pres }
        if (ui.value.host) {
            ui.value = ui.value.copy(count = set.size - 1)
            val j = JSONObject().put("t", "c").put("n", set.size - 1); kids.values.forEach { it.chan?.send(j) }
        } else upChan?.send(JSONObject().put("t", "p").put("u", JSONArray(set.take(400))))
    }

    private fun nodePut() {
        val u = ui.value
        if (!u.host || u.sid.isEmpty()) return
        db.collection("streams").document(u.sid).collection("nodes").document(me)
            .set(mapOf("uid" to me, "depth" to 0, "free" to (ROOT - kids.size).coerceIn(0, 8), "up" to "", "at" to FieldValue.serverTimestamp()))
    }

    /* ---------- зритель ---------- */
    fun join(ctx: Context, sid: String, title: String) {
        if (ui.value.sid == sid && ui.value.active) return
        scope.launch {
            if (ui.value.active) stop()
            Rtc.init(ctx)
            ui.value = Ui(sid, false, title, "connecting", t0 = System.currentTimeMillis())
            subs += db.collection("streams").document(sid).addSnapshotListener { s, _ ->
                if (s != null && (!s.exists() || s.getBoolean("live") != true) && ui.value.sid == sid && !ui.value.host) scope.launch { stop(ended = true) }
            }
            jobs += scope.launch { while (isActive) { delay(4000); tick() } }
            connect(sid)
        }
    }

    private suspend fun connect(sid: String) {
        val tried = mutableSetOf<String>()
        for (round in 0..5) {
            if (ui.value.sid != sid) return
            ui.value = ui.value.copy(status = "connecting", video = null)
            val nodes = runCatching { db.collection("streams").document(sid).collection("nodes").get().await().documents }.getOrDefault(emptyList())
            val now = System.currentTimeMillis()
            val cands = nodes.filter { n ->
                val at = n.getTimestamp("at")?.toDate()?.time ?: 0
                n.id != me && (n.getLong("free") ?: 0) > 0 && now - at < STALE && n.id !in tried
            }.sortedWith(compareBy<com.google.firebase.firestore.DocumentSnapshot> { it.getLong("depth") ?: 9 }.thenBy { Math.random() }).take(6)
            for (n in cands) { tried += n.id; if (tryNode(sid, n.id)) return; if (ui.value.sid != sid) return }
            tried.clear()
            delay(2500L + round * 1500)
        }
        if (ui.value.sid == sid) ui.value = ui.value.copy(status = "failed")
    }

    private suspend fun tryNode(sid: String, node: String): Boolean {
        var track: VideoTrack? = null
        val peer = Peer(onTrack = { t -> if (t is VideoTrack) { track = t; scope.launch { if (up != null) ui.value = ui.value.copy(video = t) } } })
        val chan = Chan(peer.channel("chat"), onMsg = { m -> scope.launch { upMsg(m) } })
        peer.recvOnly()
        val ref = try {
            val offer = peer.offer()
            db.collection("streams").document(sid).collection("peers").add(mapOf("uid" to me, "to" to node, "offer" to offer, "createdAt" to FieldValue.serverTimestamp())).await()
        } catch (e: Exception) { chan.close(); peer.close(); return false }
        val result = MutableStateFlow<Boolean?>(null)
        val reg = ref.addSnapshotListener { s, _ ->
            if (s == null || !s.exists()) return@addSnapshotListener
            if (s.getBoolean("rej") == true) result.value = false
            else s.getString("answer")?.let { a -> if (!peer.hasRemote) scope.launch { runCatching { peer.accept(a) }.onFailure { result.value = false } } }
        }
        val st = scope.launch { peer.state.collect { if (it == PeerConnection.PeerConnectionState.CONNECTED) result.value = true else if (it == PeerConnection.PeerConnectionState.FAILED) result.value = false } }
        val ok = withTimeoutOrNull(14_000) { result.first { it != null } } == true
        reg.remove(); st.cancel(); ref.delete()
        if (!ok || ui.value.sid != sid) { chan.close(); peer.close(); return false }
        up = peer; upChan = chan
        ui.value = ui.value.copy(status = "live", video = track)
        scope.launch {
            peer.state.first { it == PeerConnection.PeerConnectionState.FAILED || it == PeerConnection.PeerConnectionState.CLOSED || it == PeerConnection.PeerConnectionState.DISCONNECTED }
            if (peer.state.value == PeerConnection.PeerConnectionState.DISCONNECTED) { delay(6000); if (peer.state.value == PeerConnection.PeerConnectionState.CONNECTED) return@launch }
            if (up === peer && ui.value.sid == sid) { up = null; upChan = null; chan.close(); peer.close(); connect(sid) }
        }
        return true
    }

    private fun upMsg(m: JSONObject) {
        when (m.optString("t")) {
            "b" -> show(Msg(m.optString("id").take(16), m.optString("u").take(40), m.optString("x").take(200), m.optLong("ts", System.currentTimeMillis())))
            "h" -> m.optJSONArray("list")?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { x -> show(Msg(x.optString("id").take(16), x.optString("u").take(40), x.optString("x").take(200), x.optLong("ts"))) } }
            "c" -> ui.value = ui.value.copy(count = m.optInt("n"))
        }
    }

    /* ---------- конец ---------- */
    suspend fun stop(ended: Boolean = false) {
        val u = ui.value
        if (u.sid.isEmpty()) return
        jobs.forEach { it.cancel() }; jobs.clear()
        subs.forEach { it.remove() }; subs.clear()
        kids.values.forEach { it.chan?.close(); it.peer.close() }; kids.clear()
        upChan?.close(); up?.close(); up = null; upChan = null
        local?.stop(); local = null
        seenPeers.clear(); seenMsg.clear(); last.clear(); muted.clear()
        ui.value = if (ended) u.copy(status = "ended", video = null) else Ui()
        if (u.host) runCatching {
            db.collection("streams").document(u.sid).update(mapOf("live" to false, "endedAt" to FieldValue.serverTimestamp())).await()
            for (sub in listOf("peers", "nodes")) {
                val s = db.collection("streams").document(u.sid).collection(sub).get().await()
                if (!s.isEmpty) db.runBatch { b -> s.documents.take(450).forEach { b.delete(it.reference) } }.await()
            }
        }
    }
    fun stopAsync() { scope.launch { stop() } }
    fun clearEnded() { if (ui.value.status == "ended") ui.value = Ui() }
}
