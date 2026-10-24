package ru.vsmske.app.rtc

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import org.webrtc.PeerConnection
import org.webrtc.VideoTrack
import ru.vsmske.app.MainActivity
import ru.vsmske.app.R
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Notif
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.music.Music

/*
 * Звонки один на один — тот же протокол, что у сайта (8.0):
 * звонок = streams {mode:'call', to}; позвать — уведомление type 'call' (postId = id звонка);
 * трубку берёт тот, кому звонят: заявка peers с offer (его звук/видео и канал «call»), звонящий отвечает answer;
 * «Отклонить» — заявка с offer 'no'; конец — {t:'end'} по каналу; «Слушать вместе» — {t:'tog'} и {t:'mus', id, pos, paused}.
 */
object Call {
    data class Ui(
        val sid: String = "",
        val host: Boolean = false,
        val peer: String = "",
        val video: Boolean = false,
        val state: String = "",       // ring | incoming | connecting | live
        val t0: Long = 0,
        val mic: Boolean = true,
        val cam: Boolean = true,
        val speaker: Boolean = false,
        val min: Boolean = false,
        val together: Boolean = false,
        val lead: Boolean = false,
        val local: VideoTrack? = null,
        val remote: VideoTrack? = null,
    ) { val active get() = sid.isNotEmpty() }

    val ui = MutableStateFlow(Ui())
    val toast = MutableStateFlow<String?>(null)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var app: Context? = null
    private var peer: Peer? = null
    private var chan: Chan? = null
    private var media: LocalMedia? = null
    private var subs = mutableListOf<ListenerRegistration>()
    private var jobs = mutableListOf<Job>()
    private var nid = ""
    private var peerRef: com.google.firebase.firestore.DocumentReference? = null
    private val seen = mutableSetOf<String>()
    private var tone: ToneGenerator? = null
    private var ring: android.media.Ringtone? = null
    private val db get() = Fire.db
    private val me get() = Fire.uid

    /** Следить за входящими: вызывается один раз из MainActivity */
    fun watch(ctx: Context) {
        if (app != null) return
        app = ctx.applicationContext
        scope.launch { Store.notifs.collect { list -> check(list) } }
    }

    private fun check(list: List<Notif>) {
        for (n in list) {
            if (n.type != "call" || n.from == me || !seen.add(n.id)) continue
            if (System.currentTimeMillis() - n.createdAt < 45_000) scope.launch { incoming(n) }
        }
    }

    private suspend fun incoming(n: Notif) {
        if (ui.value.active || Live.ui.value.host) return
        val s = runCatching { db.collection("streams").document(n.postId).get().await() }.getOrNull() ?: return
        if (!s.exists() || s.getBoolean("live") != true || s.getString("mode") != "call" || s.getString("to") != me || s.getString("ownerId") != n.from || ui.value.active) return
        Store.need(listOf(n.from))
        nid = n.id
        ui.value = Ui(n.postId, false, n.from, s.getString("title") == "Видеозвонок", "incoming", cam = false)
        subs += db.collection("streams").document(n.postId).addSnapshotListener { d, _ ->
            if (ui.value.sid == n.postId && (d == null || !d.exists() || d.getBoolean("live") != true)) end(if (ui.value.state == "live") "hangup" else "cancelled", remote = true)
        }
        jobs += scope.launch { delay(45_000); if (ui.value.sid == n.postId && ui.value.state == "incoming") end("missed", remote = true) }
        ringIn(true)
        notifyIncoming()
    }

    /** Позвонить */
    suspend fun start(ctx: Context, to: String, video: Boolean) {
        if (ui.value.active) { toast.value = "Вы уже в звонке"; return }
        if (Live.ui.value.host) { toast.value = "Сначала завершите эфир"; return }
        Rtc.init(ctx); app = ctx.applicationContext
        val m = LocalMedia(ctx, video)
        val title = if (video) "Видеозвонок" else "Звонок"
        val ref = try {
            db.collection("streams").add(mapOf("ownerId" to me, "title" to title, "mode" to "call", "to" to to, "live" to true,
                "beat" to FieldValue.serverTimestamp(), "createdAt" to FieldValue.serverTimestamp(), "endedAt" to null)).await()
        } catch (e: Exception) { m.stop(); throw e }
        media = m
        ui.value = Ui(ref.id, true, to, video, "ring", local = m.video, speaker = video)
        audioMode(true, video)
        Api.notify(to, "call", ref.id, title)
        subs += ref.collection("peers").whereEqualTo("to", me).addSnapshotListener { s, _ ->
            s?.documentChanges?.forEach { ch -> if (ch.type == com.google.firebase.firestore.DocumentChange.Type.ADDED) answer(ch.document) }
        }
        jobs += scope.launch { delay(45_000); if (ui.value.sid == ref.id && ui.value.state == "ring") end("noanswer") }
        jobs += scope.launch { while (isActive) { delay(60_000); ref.update("beat", FieldValue.serverTimestamp()) } }
        ringOut(true)
    }

    private fun answer(d: com.google.firebase.firestore.DocumentSnapshot) {
        val u = ui.value
        if (!u.host || d.getString("uid") != u.peer || peer != null) return
        val offer = d.getString("offer") ?: return
        if (offer == "no") { end("declined"); return }
        ringOut(false)
        ui.value = u.copy(state = "connecting")
        val p = wire(Peer(onTrack = ::onTrack, onChannel = { dc -> scope.launch { channel(dc) } }))
        scope.launch {
            try {
                val ans = p.answer(offer) { media?.let(p::addLocal) }
                d.reference.update("answer", ans).await()
                jobs += scope.launch { delay(25_000); if (ui.value.sid == u.sid && ui.value.state != "live") end("failed") }
            } catch (e: Exception) { end("failed") }
        }
    }

    /** Ответить на входящий */
    fun pick(ctx: Context) {
        val u = ui.value
        if (u.host || u.state != "incoming") return
        ringIn(false); cancelNotif()
        ui.value = u.copy(state = "connecting")
        runCatching { db.collection("notifs").document(nid).delete() }
        scope.launch {
            Rtc.init(ctx)
            val m = try { LocalMedia(ctx, u.video) } catch (e: Exception) { toast.value = "Нет доступа к микрофону или камере"; decline(); return@launch }
            if (ui.value.sid != u.sid) { m.stop(); return@launch }
            media = m
            ui.value = ui.value.copy(local = m.video, cam = u.video, speaker = u.video)
            audioMode(true, u.video)
            val p = wire(Peer(onTrack = ::onTrack))
            channel(p.channel("call"))
            p.addLocal(m)
            try {
                val offer = p.offer()
                val ref = db.collection("streams").document(u.sid).collection("peers").add(mapOf("uid" to me, "to" to u.peer, "offer" to offer, "createdAt" to FieldValue.serverTimestamp())).await()
                peerRef = ref
                subs += ref.addSnapshotListener { s, _ -> s?.getString("answer")?.let { a -> if (!p.hasRemote) scope.launch { runCatching { p.accept(a) }.onFailure { end("failed") } } } }
                jobs += scope.launch { delay(25_000); if (ui.value.sid == u.sid && ui.value.state != "live") end("failed") }
            } catch (e: Exception) { end("failed") }
        }
    }

    fun decline() {
        val u = ui.value
        if (!u.active || u.host) return
        db.collection("streams").document(u.sid).collection("peers").add(mapOf("uid" to me, "to" to u.peer, "offer" to "no", "createdAt" to FieldValue.serverTimestamp()))
        runCatching { db.collection("notifs").document(nid).delete() }
        end("", remote = true)
    }

    private fun wire(p: Peer): Peer {
        peer = p
        val sid = ui.value.sid
        scope.launch {
            p.state.collect { st ->
                if (ui.value.sid != sid) return@collect
                when (st) {
                    PeerConnection.PeerConnectionState.CONNECTED -> if (ui.value.state != "live") ui.value = ui.value.copy(state = "live", t0 = System.currentTimeMillis())
                    PeerConnection.PeerConnectionState.FAILED -> end("failed")
                    PeerConnection.PeerConnectionState.DISCONNECTED -> scope.launch { delay(8000); if (ui.value.sid == sid && p.state.value != PeerConnection.PeerConnectionState.CONNECTED) end("lost") }
                    else -> {}
                }
            }
        }
        return p
    }

    private fun onTrack(t: org.webrtc.MediaStreamTrack) { if (t is VideoTrack) scope.launch { ui.value = ui.value.copy(remote = t) } }

    private fun channel(dc: org.webrtc.DataChannel) {
        chan = Chan(dc, onMsg = { m ->
            scope.launch {
                when (m.optString("t")) {
                    "end" -> end("hangup", remote = true)
                    "tog" -> { val on = m.optBoolean("on"); ui.value = ui.value.copy(together = on, lead = false); toast.value = if (on) "🎧 Собеседник включает музыку для вас двоих" else "🎧 «Слушать вместе» выключено" }
                    "mus" -> if (ui.value.together && !ui.value.lead) recv(m)
                }
            }
        })
    }

    fun toggleMic() { val on = !ui.value.mic; media?.setMic(on); ui.value = ui.value.copy(mic = on) }
    fun toggleCam() { val on = !ui.value.cam; media?.setCam(on); ui.value = ui.value.copy(cam = on) }
    fun switchCamera() { media?.switchCamera() }
    fun toggleSpeaker() { val on = !ui.value.speaker; ui.value = ui.value.copy(speaker = on); speaker(on) }
    fun setMin(v: Boolean) { ui.value = ui.value.copy(min = v) }

    /* ---------- «Слушать вместе» ---------- */
    fun toggleTogether() {
        val u = ui.value; if (u.state != "live") return
        val (on, lead) = if (u.together && !u.lead) true to true else !u.together to !u.together
        ui.value = u.copy(together = on, lead = lead)
        chan?.send(JSONObject().put("t", "tog").put("on", on))
        if (on) {
            toast.value = if (Music.state.value.track != null) "🎧 Собеседник слышит то же, что и вы" else "🎧 Включите трек в ВС Музыке — он заиграет у обоих"
            jobs += scope.launch { while (isActive && ui.value.together && ui.value.lead) { sendMus(); delay(1500) } }
        }
    }
    private fun sendMus() {
        val s = Music.state.value; val t = s.track
        chan?.send(if (t == null) JSONObject().put("t", "mus").put("id", JSONObject.NULL) else JSONObject().put("t", "mus").put("id", t.id).put("pos", s.smooth() / 1000.0).put("paused", !s.playing))
    }
    private var loading: String? = null
    private suspend fun recv(m: JSONObject) {
        val id = m.optString("id").takeIf { it.isNotEmpty() && it != "null" } ?: return
        val ctx = app ?: return
        if (Music.state.value.track?.id != id) {
            if (loading == id) return
            loading = id
            val t = runCatching { Media.tracksByIds(listOf(id)).firstOrNull() }.getOrNull(); loading = null
            if (t == null || !ui.value.together) return
            Music.play(ctx, listOf(t), 0); delay(600)
        }
        val pos = (m.optDouble("pos", 0.0) * 1000).toLong()
        if (kotlin.math.abs(Music.state.value.smooth() - pos) > 2000) Music.seek(pos)
        Music.setPlaying(!m.optBoolean("paused"))
    }

    /* ---------- конец ---------- */
    fun hang() = end("hangup")

    fun end(why: String, remote: Boolean = false) {
        val u = ui.value; if (!u.active) return
        if (!remote) chan?.send(JSONObject().put("t", "end"))
        ringIn(false); ringOut(false); cancelNotif(); audioMode(false, false)
        jobs.forEach { it.cancel() }; jobs.clear(); subs.forEach { it.remove() }; subs.clear()
        val p = peer; val c = chan; val m = media
        peer = null; chan = null; media = null
        ui.value = Ui()
        scope.launch { delay(300); c?.close(); p?.close(); m?.stop() }
        val msg = mapOf("noanswer" to "Не отвечает", "declined" to "Звонок отклонён", "failed" to "Не получилось соединиться", "lost" to "Связь пропала",
            "hangup" to "Звонок завершён", "cancelled" to "Звонок отменён", "missed" to "Пропущенный звонок")[why]
        if (msg != null) toast.value = "📞 $msg"
        val dur = if (u.t0 > 0) ((System.currentTimeMillis() - u.t0) / 1000.0) else 0.0
        if (u.host) scope.launch {
            runCatching {
                db.collection("streams").document(u.sid).update(mapOf("live" to false, "endedAt" to FieldValue.serverTimestamp())).await()
                val s = db.collection("streams").document(u.sid).collection("peers").get().await()
                if (!s.isEmpty) db.runBatch { b -> s.documents.forEach { b.delete(it.reference) } }.await()
            }
            runCatching {
                Api.sendMessage(u.peer, if (dur >= 1) "📞 ${if (u.video) "Видеозвонок" else "Звонок"} · ${fmtDur(dur)}" else "📞 ${if (why == "declined") "Звонок отклонён" else "Пропущенный звонок"}")
            }
        } else peerRef?.delete()
        peerRef = null
    }

    /* ---------- звук ---------- */
    private fun audioMode(on: Boolean, speakerOn: Boolean) {
        val am = app?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        runCatching {
            am.mode = if (on) AudioManager.MODE_IN_COMMUNICATION else AudioManager.MODE_NORMAL
            speaker(on && speakerOn)
        }
    }
    @Suppress("DEPRECATION")
    private fun speaker(on: Boolean) {
        val am = app?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        runCatching {
            if (Build.VERSION.SDK_INT >= 31) {
                if (on) am.availableCommunicationDevices.firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }?.let { am.setCommunicationDevice(it) }
                else am.clearCommunicationDevice()
            } else am.isSpeakerphoneOn = on
        }
    }
    private fun ringOut(on: Boolean) {
        runCatching { tone?.stopTone(); tone?.release() }; tone = null
        if (on) runCatching { tone = ToneGenerator(AudioManager.STREAM_VOICE_CALL, 70).also { it.startTone(ToneGenerator.TONE_SUP_RINGTONE) } }
    }
    @Suppress("DEPRECATION")
    private fun ringIn(on: Boolean) {
        val ctx = app ?: return
        runCatching { ring?.stop() }; ring = null
        val vib = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        if (!on) { runCatching { vib?.cancel() }; return }
        runCatching { ring = RingtoneManager.getRingtone(ctx, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))?.also { if (Build.VERSION.SDK_INT >= 28) it.isLooping = true; it.play() } }
        runCatching { vib?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 600, 400, 600, 400), 0)) }
    }

    /* ---------- уведомление о входящем (если приложение свёрнуто) ---------- */
    private fun notifyIncoming() {
        val ctx = app ?: return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("calls", "Звонки", NotificationManager.IMPORTANCE_HIGH))
        val name = Store.user(ui.value.peer)?.name ?: "Вам"
        val open = PendingIntent.getActivity(ctx, 7, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(ctx, "calls").setSmallIcon(R.mipmap.ic_launcher).setContentTitle("$name звонит")
            .setContentText(if (ui.value.video) "Видеозвонок в VСмске" else "Звонок в VСмске").setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX).setFullScreenIntent(open, true).setContentIntent(open).setAutoCancel(true).setOngoing(true).build()
        runCatching { nm.notify(4242, n) }
    }
    private fun cancelNotif() { runCatching { app?.getSystemService(NotificationManager::class.java)?.cancel(4242) } }
}
