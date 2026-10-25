package ru.vsmske.app.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.CallEnd
import androidx.compose.material.icons.rounded.Cameraswitch
import androidx.compose.material.icons.rounded.Headphones
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MicOff
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.VideocamOff
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import androidx.compose.ui.draw.blur
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.Stream
import ru.vsmske.app.data.ago
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.data.plural
import ru.vsmske.app.rtc.Call
import ru.vsmske.app.rtc.Live
import ru.vsmske.app.rtc.Rtc

/* Экраны эфиров и звонков. Видео WebRTC рисует SurfaceViewRenderer внутри Compose. */

@Composable
fun RtcVideo(track: VideoTrack?, modifier: Modifier, mirror: Boolean = false, fill: Boolean = true, onTop: Boolean = false) {
    val ctx = LocalContext.current
    val view = remember {
        Rtc.init(ctx)
        SurfaceViewRenderer(ctx).apply {
            init(Rtc.egl.eglBaseContext, null); setEnableHardwareScaler(true)
            setScalingType(if (fill) RendererCommon.ScalingType.SCALE_ASPECT_FILL else RendererCommon.ScalingType.SCALE_ASPECT_FIT)
            if (onTop) setZOrderMediaOverlay(true)
        }
    }
    DisposableEffect(track) {
        val t = track
        runCatching { t?.addSink(view) }
        onDispose { runCatching { t?.removeSink(view) } }
    }
    DisposableEffect(Unit) { onDispose { view.release() } }
    AndroidView({ view }, modifier, update = { it.setMirror(mirror) })
}

/** Запросить камеру и микрофон, потом выполнить */
@Composable
fun rememberAvPermission(onGranted: () -> Unit): (Boolean) -> Unit {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    var pending by remember { mutableStateOf<(() -> Unit)?>(null) }
    val req = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        if (r.values.all { it }) pending?.invoke() else toast("Разрешите доступ к камере и микрофону в настройках телефона")
        pending = null
    }
    return { video ->
        val perms = listOfNotNull(Manifest.permission.RECORD_AUDIO, if (video) Manifest.permission.CAMERA else null)
        if (perms.all { ContextCompat.checkSelfPermission(ctx, it) == PackageManager.PERMISSION_GRANTED }) onGranted()
        else { pending = onGranted; req.launch(perms.toTypedArray()) }
    }
}

/* ---------- ВС Эфир: список ---------- */
@Composable
fun LiveListScreen() {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    var list by remember { mutableStateOf<List<Stream>?>(null) }
    var form by remember { mutableStateOf(false) }
    var title by remember { mutableStateOf("") }
    var front by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    DisposableEffect(Unit) {
        val r = Media.liveQuery().addSnapshotListener { s, _ ->
            val l = s?.documents?.map(Stream::from)?.filter { it.fresh && it.mode != "call" }?.sortedByDescending { it.createdAt } ?: return@addSnapshotListener
            Store.need(l.map { it.ownerId }); list = l
        }
        onDispose { r.remove() }
    }
    val ask = rememberAvPermission {
        busy = true
        scope.safe({ busy = false; toast(it) }) { Live.start(ctx, title, front); busy = false; form = false; nav.navigate("live/${Live.ui.value.sid}") }
    }
    BackScaffold("Эфиры", fab = {
        androidx.compose.material3.ExtendedFloatingActionButton(onClick = { form = true }, icon = { Icon(Icons.Rounded.Sensors, null) }, text = { Text("Начать эфир") },
            containerColor = Color(0xFFE53935), contentColor = Color.White)
    }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 100.dp)) {
            item {
                Column(Modifier.padding(16.dp).fillMaxWidth().clip(RoundedCornerShape(28.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFFE53935), Color(0xFF8E24AA)))).padding(20.dp)) {
                    Text("📡 Прямые эфиры", style = MaterialTheme.typography.titleLarge, color = Color.White)
                    Text("Видео идёт напрямую между телефонами — без сторонних платформ. Смотрят и с сайта, и из приложения.",
                        style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.9f), modifier = Modifier.padding(top = 6.dp))
                }
            }
            val l = list
            when {
                l == null -> item { Loading() }
                l.isEmpty() -> item { EmptyState("Сейчас никто не в эфире", "Начните первым — кнопка внизу", "📺") }
                else -> items(l, key = { it.id }) { s ->
                    val u = users[s.ownerId]
                    Row(Modifier.fillMaxWidth().clickable { if (s.ownerId == Store.uid && Live.ui.value.sid != s.id) toast("Это ваш прошлый эфир — он завершится сам") else nav.navigate("live/${s.id}") }
                        .padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box {
                            Avatar(u, 60.dp, showOnline = false)
                            LiveBadge(Modifier.align(Alignment.BottomCenter))
                        }
                        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                            Text(s.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${u?.name ?: "…"} · начался ${ago(s.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
    if (form) VsSheet({ if (!busy) form = false }) {
        Text("Новый эфир", style = MaterialTheme.typography.headlineSmall)
        Text("Камера телефона. Смотреть смогут все, кто вошёл в VСмске", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(title, { title = it.take(100) }, Modifier.fillMaxWidth().padding(top = 12.dp), label = { Text("Название эфира") }, singleLine = true)
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(front, { front = true }, { Text("Фронтальная") }, shape = CircleShape)
            FilterChip(!front, { front = false }, { Text("Основная") }, shape = CircleShape)
        }
        Button({ ask(true) }, Modifier.fillMaxWidth().padding(top = 16.dp).height(52.dp), enabled = title.trim().length >= 2 && !busy) {
            if (busy) ExpressiveLoader(24.dp, MaterialTheme.colorScheme.onPrimary) else Text("В эфир")
        }
    }
}

@Composable
fun LiveBadge(modifier: Modifier = Modifier) {
    val a by rememberInfiniteTransition(label = "live").animateFloat(0.6f, 1f, infiniteRepeatable(tween(700, easing = LinearEasing), RepeatMode.Reverse), label = "a")
    Chip("LIVE", Color(0xFFE53935).copy(alpha = a), Color.White, modifier)
}

/* ---------- Комната эфира ---------- */
@Composable
fun LiveRoomScreen(sid: String) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val users by Store.users.collectAsState()
    val u by Live.ui.collectAsState()
    var stream by remember { mutableStateOf<Stream?>(null) }
    var text by remember { mutableStateOf("") }
    DarkSystemBars()
    LaunchedEffect(sid) {
        val s = runCatching { Stream.from(ru.vsmske.app.data.Fire.db.collection("streams").document(sid).get().await()) }.getOrNull()
        stream = s
        if (s != null) { Store.need(listOf(s.ownerId)); if (s.ownerId != Store.uid && s.fresh) Live.join(ctx, sid, s.title) }
    }
    val mine = u.sid == sid
    val owner = users[stream?.ownerId ?: ""]
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(1000); now = System.currentTimeMillis() } }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when {
            mine && u.video != null -> RtcVideo(u.video, Modifier.fillMaxSize(), mirror = u.host && u.front)
            else -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                val st = if (mine) u.status else if (stream?.fresh == false) "ended" else "connecting"
                if (st == "connecting") ExpressiveLoader(56.dp, Color.White)
                Text(when (st) { "failed" -> "Не получилось подключиться"; "ended" -> "Эфир закончился"; else -> "Подключаемся к эфиру…" },
                    color = Color.White, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
            }
        }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.5f), 0.25f to Color.Transparent, 0.55f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.8f))))
        Row(Modifier.statusBarsPadding().padding(8.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад", tint = Color.White) }
            Avatar(owner, 36.dp, showOnline = false)
            Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                Text(stream?.title ?: u.title, color = Color.White, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(owner?.name ?: "", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelSmall)
            }
            if (mine && u.status == "live") {
                LiveBadge()
                Spacer(Modifier.width(6.dp))
                Chip("👁 ${u.count}", Color.Black.copy(alpha = 0.45f), Color.White)
                if (u.host) { Spacer(Modifier.width(6.dp)); Chip(fmtDur((now - u.t0) / 1000.0), Color.Black.copy(alpha = 0.45f), Color.White) }
            }
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().imePadding().padding(12.dp)) {
            val state = rememberLazyListState()
            LaunchedEffect(u.chat.size) { if (u.chat.isNotEmpty()) state.animateScrollToItem(u.chat.size - 1) }
            LazyColumn(Modifier.fillMaxWidth(0.85f).heightIn(max = 260.dp), state = state, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(if (mine) u.chat else emptyList(), key = { it.id }) { m ->
                    val a = users[m.u]
                    Row(Modifier.clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(alpha = 0.35f)).padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(a, 22.dp, showOnline = false)
                        Text("  ${a?.name?.substringBefore(' ') ?: "Гость"}  ", color = Color(0xFFFFD54F), style = MaterialTheme.typography.labelLarge)
                        Text(m.x, color = Color.White, style = MaterialTheme.typography.bodyMedium)
                        if (u.host && m.u != Store.uid) Text("  🔇", modifier = Modifier.clickable { Live.mute(m.u); toast("Заглушён в этом эфире") })
                    }
                }
            }
            if (mine && u.status == "live") Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                TextField(text, { text = it.take(200) }, placeholder = { Text("Написать в чат…", color = Color.White.copy(alpha = 0.6f)) }, singleLine = true, shape = CircleShape, modifier = Modifier.weight(1f),
                    colors = TextFieldDefaults.colors(focusedContainerColor = Color.White.copy(alpha = 0.15f), unfocusedContainerColor = Color.White.copy(alpha = 0.15f),
                        focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, focusedTextColor = Color.White, unfocusedTextColor = Color.White))
                IconButton({ if (Live.say(text)) text = "" else toast("Не так быстро — подождите секунду") }, enabled = text.isNotBlank()) { Icon(Icons.AutoMirrored.Rounded.Send, "Отправить", tint = Color.White) }
                if (u.host) {
                    RoundBtn(if (u.mic) Icons.Rounded.Mic else Icons.Rounded.MicOff, "Микрофон", Color.White.copy(alpha = 0.18f)) { Live.toggleMic() }
                    Spacer(Modifier.width(6.dp))
                    RoundBtn(Icons.Rounded.Cameraswitch, "Сменить камеру", Color.White.copy(alpha = 0.18f)) { Live.switchCamera() }
                    Spacer(Modifier.width(6.dp))
                    RoundBtn(Icons.Rounded.CallEnd, "Завершить эфир", Color(0xFFE53935)) { Live.stopAsync(); toast("Эфир завершён"); nav.popBackStack() }
                } else RoundBtn(Icons.Rounded.CallEnd, "Выйти", Color.White.copy(alpha = 0.18f)) { Live.stopAsync(); nav.popBackStack() }
            }
        }
    }
}

@Composable
private fun RoundBtn(icon: ImageVector, desc: String, bg: Color, size: Int = 48, onClick: () -> Unit) =
    Box(Modifier.size(size.dp).clip(CircleShape).background(bg).clickable(onClick = onClick), contentAlignment = Alignment.Center) { Icon(icon, desc, tint = Color.White) }

/** Плашка «Вы в эфире» / «Смотрите эфир» поверх приложения */
@Composable
fun LiveBar(modifier: Modifier = Modifier, route: String?) {
    val u by Live.ui.collectAsState()
    val nav = LocalNav.current
    if (!u.active || route == "live/{id}") return
    Surface(onClick = { nav.navigate("live/${u.sid}") }, modifier = modifier, shape = CircleShape, color = Color(0xFFE53935), shadowElevation = 8.dp) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Sensors, null, tint = Color.White, modifier = Modifier.size(18.dp))
            Text(if (u.host) "  Вы в эфире · ${u.count} ${plural(u.count, "зритель", "зрителя", "зрителей")}" else "  Смотрите эфир", color = Color.White, style = MaterialTheme.typography.labelLarge)
        }
    }
}

/* ---------- Звонок ---------- */
@Composable
fun CallOverlay() {
    val c by Call.ui.collectAsState()
    val toastMsg by Call.toast.collectAsState()
    val toast = LocalToast.current
    val ctx = LocalContext.current
    LaunchedEffect(toastMsg) { toastMsg?.let { toast(it); Call.toast.value = null } }
    if (!c.active) return
    val peer = Store.users.collectAsState().value[c.peer]
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(c.state) { while (true) { delay(1000); now = System.currentTimeMillis() } }
    val ask = rememberAvPermission { Call.pick(ctx) }
    val status = when (c.state) { "ring" -> "Вызываем…"; "incoming" -> if (c.video) "Видеозвонок" else "Звонок"; "connecting" -> "Соединяем…"; else -> fmtDur((now - c.t0) / 1000.0) + if (c.together) " · 🎧 вместе" else "" }
    if (c.min) {
        Box(Modifier.fillMaxSize().statusBarsPadding().padding(top = 8.dp), contentAlignment = Alignment.TopCenter) {
            Surface(onClick = { Call.setMin(false) }, shape = CircleShape, color = Color(0xFF1B5E20), shadowElevation = 10.dp) {
                Row(Modifier.padding(start = 6.dp, end = 6.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(peer, 32.dp, showOnline = false)
                    Text("  ${peer?.name ?: "…"} · $status  ", color = Color.White, style = MaterialTheme.typography.labelLarge)
                    RoundBtn(Icons.Rounded.CallEnd, "Завершить", Color(0xFFE53935), 36) { Call.hang() }
                }
            }
        }
        return
    }
    androidx.activity.compose.BackHandler(c.state != "incoming") { Call.setMin(true) }
    DarkSystemBars()
    val pulse by rememberInfiniteTransition(label = "ring").animateFloat(1f, 1.18f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "p")
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF1A237E), Color(0xFF4A148C), Color(0xFF000000)))).clickable(enabled = false) {}) {
        if (c.video && c.remote != null && c.state == "live") RtcVideo(c.remote, Modifier.fillMaxSize())
        if (peer?.photo?.isNotEmpty() == true && !(c.video && c.remote != null)) DbImage(peer.photo, Modifier.fillMaxSize().graphicsLayer { alpha = 0.3f }.blur(60.dp))
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(Modifier.fillMaxWidth()) {
                if (c.state != "incoming") IconButton({ Call.setMin(true) }) { Icon(Icons.Rounded.KeyboardArrowDown, "Свернуть", tint = Color.White) }
            }
            if (!(c.video && c.remote != null && c.state == "live")) {
                Spacer(Modifier.height(40.dp))
                Box(contentAlignment = Alignment.Center) {
                    if (c.state == "ring" || c.state == "incoming") Box(Modifier.size(150.dp).graphicsLayer { scaleX = pulse; scaleY = pulse }.clip(CookieShape).background(Color.White.copy(alpha = 0.12f)))
                    Avatar(peer, 124.dp, shape = CookieShape, showOnline = false)
                }
                Text(peer?.name ?: "…", color = Color.White, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 20.dp))
            }
            Text(status, color = Color.White.copy(alpha = 0.8f), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 6.dp))
            Spacer(Modifier.weight(1f))
            if (c.video && c.local != null && c.state != "incoming") Box(Modifier.align(Alignment.End).padding(bottom = 16.dp).width(110.dp).aspectRatio(3 / 4f).clip(RoundedCornerShape(20.dp))) {
                RtcVideo(c.local, Modifier.fillMaxSize(), mirror = true, onTop = true)
            }
            if (c.state == "incoming") Row(Modifier.fillMaxWidth().padding(bottom = 24.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                CallBtn(Icons.Rounded.CallEnd, "Отклонить", Color(0xFFE53935)) { Call.decline() }
                CallBtn(if (c.video) Icons.Rounded.Videocam else Icons.Rounded.Call, "Ответить", Color(0xFF43A047)) { ask(c.video) }
            } else Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(36.dp)).background(Color.White.copy(alpha = 0.1f)).padding(vertical = 14.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                CallBtn(if (c.mic) Icons.Rounded.Mic else Icons.Rounded.MicOff, if (c.mic) "Микрофон" else "Без звука", if (c.mic) Color.White.copy(alpha = 0.18f) else Color.White, small = true, dark = !c.mic) { Call.toggleMic() }
                if (c.video) CallBtn(if (c.cam) Icons.Rounded.Videocam else Icons.Rounded.VideocamOff, "Камера", if (c.cam) Color.White.copy(alpha = 0.18f) else Color.White, small = true, dark = !c.cam) { Call.toggleCam() }
                if (c.video) CallBtn(Icons.Rounded.Cameraswitch, "Сменить", Color.White.copy(alpha = 0.18f), small = true) { Call.switchCamera() }
                CallBtn(Icons.AutoMirrored.Rounded.VolumeUp, "Динамик", if (c.speaker) Color.White else Color.White.copy(alpha = 0.18f), small = true, dark = c.speaker) { Call.toggleSpeaker() }
                if (c.state == "live") CallBtn(Icons.Rounded.Headphones, "Вместе", if (c.together) Color.White else Color.White.copy(alpha = 0.18f), small = true, dark = c.together) { Call.toggleTogether() }
                CallBtn(Icons.Rounded.CallEnd, "Завершить", Color(0xFFE53935), small = true) { Call.hang() }
            }
        }
    }
}

@Composable
private fun CallBtn(icon: ImageVector, label: String, bg: Color, small: Boolean = false, dark: Boolean = false, onClick: () -> Unit) =
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(if (small) 52.dp else 72.dp).clip(CircleShape).background(bg).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
            Icon(icon, label, tint = if (dark) Color.Black else Color.White, modifier = Modifier.size(if (small) 24.dp else 32.dp))
        }
        Text(label, color = Color.White, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 6.dp))
    }

/** Карточка «Сейчас в эфире» в ленте (как liveNowCard() на сайте) */
@Composable
fun LiveNowCard() {
    val nav = LocalNav.current
    val users by Store.users.collectAsState()
    var list by remember { mutableStateOf<List<Stream>>(emptyList()) }
    DisposableEffect(Unit) {
        val r = Media.liveQuery().addSnapshotListener { s, _ ->
            list = s?.documents?.map(Stream::from)?.filter { it.fresh && it.mode != "call" && it.ownerId != Store.uid } ?: return@addSnapshotListener
            Store.need(list.map { it.ownerId })
        }
        onDispose { r.remove() }
    }
    val s = list.firstOrNull() ?: return
    val u = users[s.ownerId]
    if (u?.banned == true) return
    Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp))
        .background(Brush.linearGradient(listOf(Color(0xFFE53935), Color(0xFF8E24AA)))).clickable { nav.navigate("live/${s.id}") }.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Avatar(u, 44.dp, showOnline = false)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text("${u?.name ?: "…"} в эфире", color = Color.White, style = MaterialTheme.typography.titleSmall, maxLines = 1)
            Text(s.title + if (list.size > 1) " · ещё ${list.size - 1}" else "", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        LiveBadge()
    }
}
