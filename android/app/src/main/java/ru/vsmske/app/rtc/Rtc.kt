package ru.vsmske.app.rtc

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule
import java.nio.ByteBuffer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/*
 * WebRTC для эфиров и звонков — тот же протокол, что у сайта (app.js 6.8 / 8.0):
 * SDP без trickle (ждём сбора кандидатов до 2,5 с), те же STUN и открытый TURN, обмен через Firestore.
 */
object Rtc {
    lateinit var egl: EglBase; private set
    lateinit var factory: PeerConnectionFactory; private set
    private var ready = false

    val ICE: List<PeerConnection.IceServer> = listOf(
        PeerConnection.IceServer.builder(listOf("stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302")).createIceServer(),
        PeerConnection.IceServer.builder(listOf("turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443?transport=tcp"))
            .setUsername("openrelayproject").setPassword("openrelayproject").createIceServer(),
    )

    fun init(ctx: Context) {
        if (ready) return
        val app = ctx.applicationContext
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(app).createInitializationOptions())
        egl = EglBase.create()
        factory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(JavaAudioDeviceModule.builder(app).setUseHardwareAcousticEchoCanceler(true).setUseHardwareNoiseSuppressor(true).createAudioDeviceModule())
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext))
            .createPeerConnectionFactory()
        ready = true
    }

    fun rid(): String = (1..8).map { "abcdefghijklmnopqrstuvwxyz0123456789".random() }.joinToString("")

    /** Правила принимают SDP до 16 000 символов — если вышло длиннее, убираем лишние кандидаты (TCP, IPv6) */
    fun trim(sdp: String): String {
        if (sdp.length <= 15_900) return sdp
        val lines = sdp.split("\r\n").toMutableList()
        fun drop(p: (String) -> Boolean) { val it = lines.listIterator(); while (it.hasNext() && lines.joinToString("\r\n").length > 15_900) if (p(it.next())) it.remove() }
        drop { it.startsWith("a=candidate") && " tcp " in it }
        drop { it.startsWith("a=candidate") && Regex(" [0-9a-f]*:[0-9a-f:]+ \\d+ typ").containsMatchIn(it) }
        drop { it.startsWith("a=candidate") && "typ host" in it }
        return lines.joinToString("\r\n")
    }
}

/** Камера и микрофон этого телефона */
class LocalMedia(ctx: Context, video: Boolean, front: Boolean = true) {
    private val f = Rtc.factory
    val audioSource: AudioSource = f.createAudioSource(MediaConstraints().apply {
        mandatory += MediaConstraints.KeyValuePair("googEchoCancellation", "true"); mandatory += MediaConstraints.KeyValuePair("googNoiseSuppression", "true")
    })
    val audio: AudioTrack = f.createAudioTrack("a" + Rtc.rid(), audioSource)
    private var capturer: CameraVideoCapturer? = null
    private var helper: SurfaceTextureHelper? = null
    private var source: VideoSource? = null
    var video: VideoTrack? = null; private set
    var front = front; private set

    init {
        if (video) {
            val en = Camera2Enumerator(ctx)
            val name = en.deviceNames.firstOrNull { en.isFrontFacing(it) == front } ?: en.deviceNames.firstOrNull()
            if (name != null) {
                val cap = en.createCapturer(name, null)
                val h = SurfaceTextureHelper.create("cam", Rtc.egl.eglBaseContext)
                val src = f.createVideoSource(false)
                cap.initialize(h, ctx.applicationContext, src.capturerObserver)
                cap.startCapture(1280, 720, 30)
                capturer = cap; helper = h; source = src
                this.video = f.createVideoTrack("v" + Rtc.rid(), src)
            }
        }
    }

    fun switchCamera() { capturer?.switchCamera(null); front = !front }
    fun setMic(on: Boolean) { audio.setEnabled(on) }
    fun setCam(on: Boolean) { video?.setEnabled(on) }

    private var stopped = false
    @Synchronized fun stop() {
        if (stopped) return; stopped = true
        runCatching { capturer?.stopCapture() }; runCatching { capturer?.dispose() }
        runCatching { video?.dispose() }; runCatching { source?.dispose() }; runCatching { helper?.dispose() }
        runCatching { audio.dispose() }; runCatching { audioSource.dispose() }
        capturer = null; video = null
    }
}

/** Канал данных: JSON-сообщения как у сайта */
class Chan(val dc: DataChannel, private val onMsg: (JSONObject) -> Unit, private val onOpen: () -> Unit = {}) {
    init {
        dc.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(p0: Long) {}
            override fun onStateChange() { if (dc.state() == DataChannel.State.OPEN) onOpen() }
            override fun onMessage(b: DataChannel.Buffer) {
                val bytes = ByteArray(b.data.remaining()); b.data.get(bytes)
                runCatching { JSONObject(String(bytes, Charsets.UTF_8)) }.getOrNull()?.let(onMsg)
            }
        })
    }
    val open get() = runCatching { dc.state() == DataChannel.State.OPEN }.getOrDefault(false)
    fun send(m: JSONObject) = sendRaw(m.toString())
    fun sendRaw(s: String) { if (open) runCatching { dc.send(DataChannel.Buffer(ByteBuffer.wrap(s.toByteArray(Charsets.UTF_8)), false)) } }
    fun close() { runCatching { dc.unregisterObserver(); dc.close() } }
}

/** Одно соединение с удалённым устройством */
class Peer(
    private val onTrack: (MediaStreamTrack) -> Unit = {},
    private val onChannel: (DataChannel) -> Unit = {},
) {
    val ice = MutableStateFlow(PeerConnection.IceGatheringState.NEW)
    val state = MutableStateFlow(PeerConnection.PeerConnectionState.NEW)
    val pc: PeerConnection

    init {
        val cfg = PeerConnection.RTCConfiguration(Rtc.ICE).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }
        pc = Rtc.factory.createPeerConnection(cfg, object : PeerConnection.Observer {
            override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(p0: PeerConnection.IceConnectionState?) {}
            override fun onIceConnectionReceivingChange(p0: Boolean) {}
            override fun onIceGatheringChange(s: PeerConnection.IceGatheringState) { ice.value = s }
            override fun onIceCandidate(p0: IceCandidate?) {}
            override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>?) {}
            override fun onAddStream(p0: MediaStream?) {}
            override fun onRemoveStream(p0: MediaStream?) {}
            override fun onDataChannel(dc: DataChannel) { onChannel(dc) }
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(r: RtpReceiver?, s: Array<out MediaStream>?) {}
            override fun onTrack(t: RtpTransceiver) { t.receiver.track()?.let(onTrack) }
            override fun onConnectionChange(s: PeerConnection.PeerConnectionState) { state.value = s }
        }) ?: error("WebRTC недоступен")
    }

    private suspend fun create(offer: Boolean): SessionDescription = suspendCancellableCoroutine { c ->
        val o = object : SdpObserver {
            override fun onCreateSuccess(d: SessionDescription) { c.resume(d) }
            override fun onSetSuccess() {}
            override fun onCreateFailure(e: String?) { c.resumeWithException(IllegalStateException(e)) }
            override fun onSetFailure(e: String?) {}
        }
        if (offer) pc.createOffer(o, MediaConstraints()) else pc.createAnswer(o, MediaConstraints())
    }
    private suspend fun set(local: Boolean, d: SessionDescription) = suspendCancellableCoroutine { c ->
        val o = object : SdpObserver {
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onSetSuccess() { c.resume(Unit) }
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(e: String?) { c.resumeWithException(IllegalStateException(e)) }
        }
        if (local) pc.setLocalDescription(o, d) else pc.setRemoteDescription(o, d)
    }
    private suspend fun gathered(): String {
        withTimeoutOrNull(2500) { ice.first { it == PeerConnection.IceGatheringState.COMPLETE } }
        return Rtc.trim(pc.localDescription.description)
    }

    suspend fun offer(): String { set(true, create(true)); return gathered() }
    suspend fun answer(offer: String, beforeAnswer: () -> Unit = {}): String {
        set(false, SessionDescription(SessionDescription.Type.OFFER, offer)); beforeAnswer()
        set(true, create(false)); return gathered()
    }
    suspend fun accept(answer: String) = set(false, SessionDescription(SessionDescription.Type.ANSWER, answer))
    val hasRemote get() = pc.remoteDescription != null

    fun addLocal(m: LocalMedia) { pc.addTrack(m.audio, listOf("s")); m.video?.let { pc.addTrack(it, listOf("s")) } }
    fun recvOnly() {
        pc.addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO, RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY))
        pc.addTransceiver(MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO, RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY))
    }
    fun limitVideo(bps: Int) {
        pc.senders.filter { it.track()?.kind() == "video" }.forEach { s -> runCatching { val p = s.parameters; p.encodings.firstOrNull()?.maxBitrateBps = bps; s.parameters = p } }
    }
    fun channel(label: String): DataChannel = pc.createDataChannel(label, DataChannel.Init())
    private var closed = false
    @Synchronized fun close() { if (closed) return; closed = true; runCatching { pc.dispose() } }
}
