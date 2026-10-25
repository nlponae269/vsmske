package ru.vsmske.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Sms
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.Query
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.Video
import ru.vsmske.app.data.plural
import ru.vsmske.app.music.Music

/** Ленты «ВС Клипов» живут дольше экрана: вернулись на Главную — тот же список и то же место */
object ClipsData {
    val forYou = mutableStateListOf<Video>()
    val friends = mutableStateListOf<Video>()
    /** Список для просмотра из профиля (сетка → лента) */
    val watch = mutableStateListOf<Video>()
    val comments = mutableStateMapOf<String, Int>()
    var friendsLoaded by mutableStateOf(false)
    var forYouEnd by mutableStateOf(false)
    private var last: DocumentSnapshot? = null
    private var busy = false

    /** Следующая страница «Для вас»: свежие ролики, только клипы (до 90 секунд); пустые страницы пролистываем */
    suspend fun more() {
        if (busy || forYouEnd) return
        busy = true
        try {
            repeat(4) {
                var q = Fire.db.collection("videos").orderBy("createdAt", Query.Direction.DESCENDING).limit(30)
                last?.let { q = q.startAfter(it) }
                val s = q.get().await()
                if (s.documents.size < 30) forYouEnd = true
                s.documents.lastOrNull()?.let { last = it }
                val have = forYou.map { it.id }.toMutableSet()
                val add = s.documents.map(Video::from).filter { it.isClip() && have.add(it.id) }
                Store.need(add.map { it.ownerId }); forYou.addAll(add)
                if (add.isNotEmpty() || forYouEnd) return
            }
        } finally { busy = false }
    }

    /** Вышли из аккаунта — всё забываем */
    fun reset() { forYou.clear(); friends.clear(); watch.clear(); comments.clear(); last = null; forYouEnd = false; friendsLoaded = false }

    suspend fun loadFriends() {
        val ids = Store.me.value?.friends ?: emptyList()
        val l = if (ids.isEmpty()) emptyList() else Media.videosOfMany(ids).filter { it.isClip() }
        Store.need(l.map { it.ownerId })
        friends.clear(); friends.addAll(l); friendsLoaded = true
    }

    /** Свежая копия клипа (лайки, просмотры) — во всех списках сразу */
    fun update(v: Video) { listOf(forYou, friends, watch).forEach { l -> val i = l.indexOfFirst { it.id == v.id }; if (i >= 0) l[i] = v } }
    fun remove(id: String) { listOf(forYou, friends, watch).forEach { l -> l.removeAll { it.id == id } } }
}

/** Главная («Для вас») и «Друзья» */
@Composable
fun ClipsFeedTab(friends: Boolean) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val list = if (friends) ClipsData.friends else ClipsData.forYou
    var loading by remember { mutableStateOf(list.isEmpty()) }
    LaunchedEffect(friends) {
        runCatching { if (friends) ClipsData.loadFriends() else if (ClipsData.forYou.isEmpty()) ClipsData.more() }.onFailure { toast(errText(it)) }
        loading = false
    }
    DarkSystemBars()
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when {
            list.isEmpty() && loading -> ExpressiveLoader(modifier = Modifier.align(Alignment.Center), color = Color.White)
            list.isEmpty() && friends -> FeedEmpty("👯", if (Store.me.value?.friends.isNullOrEmpty()) "Здесь будут клипы друзей" else "Друзья пока ничего не сняли",
                "Добавляйте друзей — их клипы появятся в этой ленте", "Найти друзей") { nav.navigate("search") }
            list.isEmpty() -> FeedEmpty("🎬", "Клипов пока нет", "Снимите первый — нажмите «＋» внизу", "Снять клип") { nav.navigate("upload") }
            else -> ClipsPager(list, 0, onNearEnd = { if (!friends) scope.launch { runCatching { ClipsData.more() } } })
        }
        // шапка как в ТикТоке: по центру название ленты, справа поиск
        Box(Modifier.fillMaxWidth().statusBarsPadding().height(52.dp)) {
            Row(Modifier.align(Alignment.Center), verticalAlignment = Alignment.CenterVertically) {
                FeedTabTitle("Друзья", friends) { if (!friends) nav.navigate("friends") { popUpTo("home") { saveState = true }; launchSingleTop = true; restoreState = true } }
                Text("|", color = Color.White.copy(alpha = 0.35f), modifier = Modifier.padding(horizontal = 10.dp))
                FeedTabTitle("Для вас", !friends) { if (friends) nav.navigate("home") { popUpTo("home"); launchSingleTop = true } }
            }
            IconButton({ nav.navigate("search") }, Modifier.align(Alignment.CenterEnd).padding(end = 4.dp)) { Icon(Icons.Rounded.Search, "Поиск", tint = Color.White, modifier = Modifier.size(28.dp)) }
        }
    }
}

@Composable
private fun FeedTabTitle(text: String, sel: Boolean, onClick: () -> Unit) =
    Column(Modifier.clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text, color = if (sel) Color.White else Color.White.copy(alpha = 0.6f), fontWeight = FontWeight.Bold, fontSize = 17.sp, style = TextStyle(shadow = TextShade))
        Box(Modifier.padding(top = 4.dp).size(if (sel) 28.dp else 0.dp, 3.dp).clip(CircleShape).background(Color.White))
    }

@Composable
private fun FeedEmpty(emoji: String, title: String, hint: String, button: String, onClick: () -> Unit) =
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(emoji, fontSize = 56.sp)
        Text(title, color = Color.White, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 14.dp))
        Text(hint, color = Color.White.copy(alpha = 0.65f), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
        PurpleButton(button, Modifier.padding(top = 22.dp).width(220.dp), onClick)
    }

/** Клип по ссылке или из VСмске: он первым, дальше — «Для вас» */
@Composable
fun ClipLinkScreen(id: String) {
    val toast = LocalToast.current
    var ready by remember { mutableStateOf(false) }
    LaunchedEffect(id) {
        ClipsData.watch.clear()
        val first = if (id.isEmpty()) null else runCatching { Fire.db.collection("videos").document(id).get().await() }.getOrNull()?.takeIf { it.exists() }?.let(Video::from)
        if (id.isNotEmpty() && first == null) toast("Клип не найден — возможно, его удалили")
        if (ClipsData.forYou.isEmpty()) runCatching { ClipsData.more() }
        first?.let { Store.need(listOf(it.ownerId)); ClipsData.watch.add(it) }
        ClipsData.watch.addAll(ClipsData.forYou.filter { it.id != first?.id })
        ready = true
    }
    if (ready) ClipsWatch(0) else Box(Modifier.fillMaxSize().background(Color.Black)) { DarkSystemBars(); ExpressiveLoader(modifier = Modifier.align(Alignment.Center), color = Color.White) }
}

/** Лента из сетки профиля (или по ссылке) — с кнопкой «Назад» */
@Composable
fun ClipsWatch(start: Int) {
    val nav = LocalNav.current
    DarkSystemBars()
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (ClipsData.watch.isEmpty()) FeedEmpty("🫥", "Клипов нет", "Здесь пока пусто", "Назад") { nav.popBackStack() }
        else ClipsPager(ClipsData.watch, start.coerceIn(0, ClipsData.watch.lastIndex))
        IconButton({ nav.popBackStack() }, Modifier.statusBarsPadding().padding(4.dp)) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад", tint = Color.White) }
    }
}

/** Вертикальная лента: играет только видимый клип, звук — сразу, пауза — тап, «нравится» — двойной тап */
@Composable
fun ClipsPager(list: List<Video>, start: Int, onNearEnd: () -> Unit = {}) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    val me by Store.me.collectAsState()
    val pager = rememberPagerState(start) { list.size }
    val player = rememberVideoPlayer()
    var paused by remember { mutableStateOf(false) }
    var comments by remember { mutableStateOf<Video?>(null) }
    var sharing by remember { mutableStateOf<Video?>(null) }
    val curId = list.getOrNull(pager.settledPage)?.id
    // свернули приложение — пауза; вернулись — играем дальше (если не ставили паузу сами)
    val life = LocalLifecycleOwner.current
    DisposableEffect(life) {
        val o = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_PAUSE) player.pause()
            if (e == Lifecycle.Event.ON_RESUME && !paused) player.play()
        }
        life.lifecycle.addObserver(o); onDispose { life.lifecycle.removeObserver(o) }
    }
    LaunchedEffect(curId) {
        val v = list.firstOrNull { it.id == curId } ?: return@LaunchedEffect
        paused = false
        if (Music.state.value.playing) Music.toggle()
        if (Store.user(v.ownerId)?.banned == true) { player.stop(); return@LaunchedEffect }
        player.setMediaItem(MediaItem.fromUri(v.mediaUri())); player.repeatMode = Player.REPEAT_MODE_ONE; player.prepare(); player.playWhenReady = true
        if (v.id !in ClipsData.comments) runCatching { ClipsData.comments[v.id] = Media.commentCount(v.id) }
        delay(2000); Media.countView(v)
    }
    LaunchedEffect(pager.settledPage, list.size) { if (list.isNotEmpty() && pager.settledPage >= list.size - 4) onNearEnd() }
    // живые лайки у видимого клипа
    DisposableEffect(curId) {
        val reg = curId?.let { id -> Fire.db.collection("videos").document(id).addSnapshotListener { s, _ ->
            if (s == null) return@addSnapshotListener
            if (s.exists()) ClipsData.update(Video.from(s)) else ClipsData.remove(id)
        } }
        onDispose { reg?.remove() }
    }
    VerticalPager(pager, Modifier.fillMaxSize(), beyondViewportPageCount = 1, key = { list[it].id }) { page ->
        val v = list[page]
        val active = page == pager.settledPage
        ClipItem(v, active, player, users[v.ownerId]?.banned == true, active && paused,
            saved = me?.saved?.contains(Media.CLIP_SAVE + v.id) == true,
            onTap = { paused = !paused; player.playWhenReady = !paused },
            onLike = { force -> scope.safe(toast) { if (force) Media.likeVideo(v) else Media.toggleVideoLike(v) } },
            onComments = { comments = v },
            onSave = { scope.safe(toast) { val was = me?.saved?.contains(Media.CLIP_SAVE + v.id) == true; Media.toggleClipSave(v); toast(if (was) "Убрано из сохранённого" else "Сохранено — смотрите в профиле") } },
            onShare = { sharing = v })
    }
    sharing?.let { v -> ClipShareSheet(v) { sharing = null } }
    comments?.let { v ->
        VideoCommentsSheet(v) { comments = null; scope.launch { runCatching { ClipsData.comments[v.id] = Media.commentCount(v.id) } } }
    }
}

internal val TextShade = Shadow(Color.Black.copy(alpha = 0.45f), Offset(0f, 2f), 6f)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ClipItem(
    v: Video, active: Boolean, player: ExoPlayer, banned: Boolean, paused: Boolean, saved: Boolean,
    onTap: () -> Unit, onLike: (Boolean) -> Unit, onComments: () -> Unit, onSave: () -> Unit, onShare: () -> Unit,
) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val owner = Store.users.collectAsState().value[v.ownerId]
    val me by Store.me.collectAsState()
    val outgoing by Store.outgoing.collectAsState()
    val hearts = remember { mutableStateListOf<Pair<Long, Offset>>() }
    val isActive by rememberUpdatedState(active)
    val like by rememberUpdatedState(onLike)
    val tap by rememberUpdatedState(onTap)
    var more by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().pointerInput(v.id) {
        detectTapGestures(
            onDoubleTap = { o -> like(true); val k = System.nanoTime(); hearts += k to o; scope.launch { delay(900); hearts.removeAll { it.first == k } } },
            onTap = { if (isActive) tap() },
        )
    }) {
        when {
            banned -> Locked("Клип недоступен", Modifier.fillMaxSize())
            active -> ExoView(player, Modifier.fillMaxSize(), controls = false, fill = true)
            v.cover.isNotEmpty() -> DbImage(v.cover, Modifier.fillMaxSize())
        }
        if (paused) Icon(Icons.Rounded.PlayArrow, "Играть", tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.align(Alignment.Center).size(110.dp))
        hearts.forEach { (k, o) -> BigHeart(k, o) }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.25f), 0.15f to Color.Transparent, 0.65f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.6f))))

        // справа: автор с «＋», нравится, комментарии, сохранить, поделиться, пластинка
        Column(Modifier.align(Alignment.BottomEnd).padding(end = 8.dp, bottom = 20.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            val canAdd = v.ownerId != Store.uid && me?.friends?.contains(v.ownerId) != true && outgoing.none { it.to == v.ownerId } && owner?.banned != true
            Box(Modifier.padding(bottom = 6.dp)) {
                Avatar(owner, 50.dp, Modifier.border(1.5.dp, Color.White, CircleShape), showOnline = false) { nav.openProfile(v.ownerId) }
                if (canAdd) Box(Modifier.align(Alignment.BottomCenter).offset(y = 10.dp).size(22.dp).clip(CircleShape).background(ClipPink)
                    .clickable { scope.safe(toast) { Api.friendAdd(v.ownerId); toast("Заявка в друзья отправлена") } }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.Add, "Добавить в друзья", tint = Color.White, modifier = Modifier.size(16.dp))
                }
                else if (v.ownerId != Store.uid && me?.friends?.contains(v.ownerId) == true) Box(Modifier.align(Alignment.BottomCenter).offset(y = 10.dp).size(22.dp)
                    .clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.Check, "В друзьях", tint = ClipPink, modifier = Modifier.size(15.dp))
                }
            }
            val liked = Store.uid in v.likes
            val k by animateFloatAsState(if (liked) 1.18f else 1f, spring(dampingRatio = 0.3f, stiffness = 600f), label = "lk")
            SideAction({ Icon(Icons.Rounded.Favorite, "Нравится", tint = if (liked) ClipPink else Color.White, modifier = Modifier.size(38.dp).graphicsLayer { scaleX = k; scaleY = k }) },
                fmtNum(v.likes.size)) { onLike(false) }
            SideAction({ Icon(Icons.Rounded.Sms, "Комментарии", tint = Color.White, modifier = Modifier.size(34.dp)) }, fmtNum(ClipsData.comments[v.id] ?: 0), onComments)
            SideAction({ Icon(Icons.Rounded.Bookmark, "Сохранить", tint = if (saved) Color(0xFFFACE15) else Color.White, modifier = Modifier.size(34.dp)) },
                if (saved) "Сохранено" else "Сохранить", onSave)
            SideAction({ Icon(Icons.AutoMirrored.Rounded.Reply, "Поделиться", tint = Color.White, modifier = Modifier.size(36.dp).graphicsLayer { scaleX = -1f }) }, "Поделиться", onShare)
            Disc(owner, active && !paused)
        }

        // слева внизу: автор, подпись, «звук»
        Column(Modifier.align(Alignment.BottomStart).padding(start = 14.dp, end = 92.dp, bottom = 18.dp)) {
            val shade = TextStyle(shadow = TextShade)
            Text(owner?.name ?: "…", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp, style = shade, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable { nav.openProfile(v.ownerId) })
            if (v.title.isNotBlank() && v.title != Media.CLIP_NO_TITLE) Text(v.title, color = Color.White, fontSize = 15.sp, style = shade, maxLines = if (more) 8 else 2, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 6.dp).clickable { more = !more })
            Text("${fmtNum(v.views)} ${plural(v.views, "просмотр", "просмотра", "просмотров")}", color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp, style = shade,
                modifier = Modifier.padding(top = 4.dp))
            // звук: из библиотеки или оригинальный; нажатие — страница звука
            Row(Modifier.padding(top = 8.dp).clip(CircleShape).clickable { nav.navigate("sound/" + android.net.Uri.encode(v.soundRef)) }.padding(vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.MusicNote, null, tint = Color.White, modifier = Modifier.size(16.dp))
                Text(soundLabel(v),
                    color = Color.White, fontSize = 14.sp, style = shade, maxLines = 1, modifier = Modifier.padding(start = 6.dp).basicMarquee(Int.MAX_VALUE))
            }
        }
        if (active) ClipProgress(player, Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
private fun SideAction(icon: @Composable () -> Unit, label: String, onClick: () -> Unit) =
    Column(Modifier.clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        icon()
        Text(label, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, style = TextStyle(shadow = TextShade), modifier = Modifier.padding(top = 2.dp))
    }

/** Крутящаяся пластинка с аватаркой автора */
@Composable
private fun Disc(owner: ru.vsmske.app.data.User?, spin: Boolean) {
    val t = rememberInfiniteTransition(label = "disc")
    val a by t.animateFloat(0f, 360f, infiniteRepeatable(tween(5000, easing = LinearEasing), RepeatMode.Restart), label = "a")
    Box(Modifier.size(46.dp).rotate(if (spin) a else 0f).clip(CircleShape)
        .background(Brush.radialGradient(listOf(Color(0xFF444444), Color(0xFF111111)))), contentAlignment = Alignment.Center) {
        Avatar(owner, 26.dp, showOnline = false)
    }
}

/** Тонкая полоска прогресса внизу клипа */
@Composable
private fun ClipProgress(player: Player, modifier: Modifier) {
    var f by remember { mutableStateOf(0f) }
    LaunchedEffect(player) { while (true) { val d = player.duration; f = if (d > 0) (player.currentPosition.toFloat() / d).coerceIn(0f, 1f) else 0f; delay(120) } }
    Box(modifier.fillMaxWidth().height(2.dp).background(Color.White.copy(alpha = 0.25f))) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(f).background(Color.White.copy(alpha = 0.9f)))
    }
}
