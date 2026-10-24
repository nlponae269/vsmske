package ru.vsmske.app.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import ru.vsmske.app.data.Comment
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.Video
import ru.vsmske.app.music.Music

/*
 * ВС Клипы: короткие ролики на весь экран, листаются вверх-вниз. Играет только видимый, двойной тап — «нравится»
 * с большим сердцем, справа — лайк, комментарии, поделиться, звук. Просмотр засчитывается через 2 секунды.
 */

@Composable
fun ClipsScreen(startId: String) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    val clips = remember { mutableStateListOf<Video>() }
    var limit by remember { mutableStateOf(40L) }
    var muted by remember { mutableStateOf(false) }
    var comments by remember { mutableStateOf<Video?>(null) }
    // первый — клип из адреса, дальше — остальные клипы по свежести
    LaunchedEffect(limit) {
        val first = if (clips.isEmpty() && startId.isNotEmpty()) runCatching { Fire.db.collection("videos").document(startId).get().await() }.getOrNull()
            ?.takeIf { it.exists() }?.let(Video::from) else null
        val rest = runCatching { Media.videosQuery(limit).get().await().documents.map(Video::from) }.getOrDefault(emptyList()).filter { it.isClip() }
        Store.need((listOfNotNull(first) + rest).map { it.ownerId })
        val have = clips.map { it.id }.toMutableSet()
        if (first != null && have.add(first.id)) clips.add(first)
        rest.forEach { if (have.add(it.id)) clips.add(it) }
    }
    // живые лайки у видимых клипов
    val pager = rememberPagerState { clips.size }
    val player = rememberVideoPlayer()
    LaunchedEffect(muted) { player.volume = if (muted) 0f else 1f }
    // играем только при смене клипа (догрузка новых клипов в конец не перезапускает текущий)
    val curId = clips.getOrNull(pager.settledPage)?.id
    LaunchedEffect(curId) {
        val v = clips.firstOrNull { it.id == curId } ?: return@LaunchedEffect
        if (Music.state.value.playing) Music.toggle()
        if (Store.user(v.ownerId)?.banned == true) { player.stop(); return@LaunchedEffect }
        player.setMediaItem(MediaItem.fromUri(v.mediaUri())); player.repeatMode = Player.REPEAT_MODE_ONE; player.prepare(); player.playWhenReady = true
        delay(2000); Media.countView(v)
    }
    LaunchedEffect(pager.settledPage) { if (clips.isNotEmpty() && pager.settledPage >= clips.size - 4) limit += 30 }
    DisposableEffect(pager.settledPage) {
        val v = clips.getOrNull(pager.settledPage)
        val reg = v?.let { c -> Fire.db.collection("videos").document(c.id).addSnapshotListener { s, _ ->
            if (s != null && s.exists()) { val i = clips.indexOfFirst { it.id == c.id }; if (i >= 0) clips[i] = Video.from(s) } } }
        onDispose { reg?.remove() }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (clips.isEmpty()) ExpressiveLoader(modifier = Modifier.align(Alignment.Center), color = Color.White)
        else VerticalPager(pager, Modifier.fillMaxSize(), beyondViewportPageCount = 1, key = { clips[it].id }) { page ->
            val v = clips[page]
            ClipPage(v, page == pager.settledPage, player, users[v.ownerId]?.banned == true,
                onLike = { force -> scope.safe(toast) { if (force) Media.likeVideo(v) else Media.toggleVideoLike(v) } },
                onComments = { comments = v },
                onShare = { share(ctx, v.title + "\n" + SITE + "clips/" + v.id) })
        }
        Row(Modifier.statusBarsPadding().padding(8.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад", tint = Color.White) }
            Text("Клипы", style = MaterialTheme.typography.titleLarge, color = Color.White, modifier = Modifier.weight(1f))
            IconButton({ muted = !muted }) { Icon(if (muted) Icons.AutoMirrored.Rounded.VolumeOff else Icons.AutoMirrored.Rounded.VolumeUp, "Звук", tint = Color.White) }
        }
    }
    comments?.let { v -> VideoCommentsSheet(v) { comments = null } }
}

@Composable
private fun ClipPage(v: Video, active: Boolean, player: Player, banned: Boolean, onLike: (Boolean) -> Unit, onComments: () -> Unit, onShare: () -> Unit) {
    val nav = LocalNav.current
    val owner = Store.users.collectAsState().value[v.ownerId]
    var paused by remember { mutableStateOf(false) }
    val hearts = remember { mutableStateListOf<Pair<Long, Offset>>() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(active) { paused = false }
    // жесты живут дольше одной перерисовки — берём свежие значения, а не те, что были при первом показе
    val isActive by rememberUpdatedState(active)
    val like by rememberUpdatedState(onLike)
    Box(Modifier.fillMaxSize().pointerInput(v.id) {
        detectTapGestures(
            onDoubleTap = { o -> like(true); val k = System.nanoTime(); hearts += k to o; scope.launch { delay(900); hearts.removeAll { it.first == k } } },
            onTap = { if (isActive) { paused = !paused; player.playWhenReady = !paused } },
        )
    }) {
        when {
            banned -> Locked("Клип недоступен", Modifier.fillMaxSize())
            active -> ExoView(player as androidx.media3.exoplayer.ExoPlayer, Modifier.fillMaxSize(), controls = false, fill = true)
            v.cover.isNotEmpty() -> DbImage(v.cover, Modifier.fillMaxSize())
        }
        if (paused && active) Icon(Icons.Rounded.PlayArrow, "Играть", tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.align(Alignment.Center).size(96.dp))
        hearts.forEach { (k, o) -> BigHeart(k, o) }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.6f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.75f))))
        Column(Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(end = 10.dp, bottom = 90.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp)) {
            val liked = Store.uid in v.likes
            val k by animateFloatAsState(if (liked) 1.15f else 1f, spring(dampingRatio = 0.3f, stiffness = 600f), label = "lk")
            SideBtn({ Icon(Icons.Rounded.Favorite, "Нравится", tint = if (liked) Color(0xFFFF4D6D) else Color.White, modifier = Modifier.size(34.dp).graphicsLayer { scaleX = k; scaleY = k }) },
                if (v.likes.isEmpty()) "" else fmtNum(v.likes.size)) { onLike(false) }
            SideBtn({ Icon(Icons.Rounded.ChatBubble, "Комментарии", tint = Color.White, modifier = Modifier.size(30.dp)) }, "") { onComments() }
            SideBtn({ Icon(Icons.Rounded.Share, "Поделиться", tint = Color.White, modifier = Modifier.size(30.dp)) }, "") { onShare() }
        }
        Column(Modifier.align(Alignment.BottomStart).navigationBarsPadding().padding(start = 16.dp, end = 80.dp, bottom = 24.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { nav.openProfile(v.ownerId) }) {
                Avatar(owner, 38.dp)
                UserName(owner, MaterialTheme.typography.titleSmall, Modifier.padding(start = 10.dp), color = Color.White)
            }
            if (v.title.isNotEmpty()) Text(v.title, color = Color.White, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
            Text("${fmtNum(v.views)} ${ru.vsmske.app.data.plural(v.views, "просмотр", "просмотра", "просмотров")}", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun SideBtn(icon: @Composable () -> Unit, label: String, onClick: () -> Unit) =
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(52.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.25f)).clickable(onClick = onClick), contentAlignment = Alignment.Center) { icon() }
        if (label.isNotEmpty()) Text(label, color = Color.White, style = MaterialTheme.typography.labelMedium)
    }

/** Большое сердце от двойного тапа: прыгает, поворачивается и улетает вверх */
@Composable
private fun BigHeart(key: Long, at: Offset) {
    val a = remember(key) { Animatable(0f) }
    LaunchedEffect(key) { a.animateTo(1f, tween(850)) }
    val d = LocalDensity.current
    val sz = with(d) { 110.dp.toPx() }
    val t = a.value
    val scale = if (t < 0.25f) t / 0.25f * 1.2f else 1.2f - (t - 0.25f) * 0.3f
    Icon(Icons.Rounded.Favorite, null, tint = Color(0xFFFF4D6D), modifier = Modifier
        .graphicsLayer { translationX = at.x - sz / 2; translationY = at.y - sz / 2 - t * sz * 0.8f; scaleX = scale; scaleY = scale; alpha = 1f - maxOf(0f, (t - 0.6f) / 0.4f); rotationZ = (key % 30 - 15).toFloat() }
        .size(110.dp))
}

/** Комментарии к видео или клипу — шторка */
@Composable
fun VideoCommentsSheet(v: Video, onClose: () -> Unit) {
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<List<Comment>?>(null) }
    var text by remember { mutableStateOf("") }
    DisposableEffect(v.id) {
        val r = Media.videoComments(v.id).addSnapshotListener { s, _ -> val l = s?.documents?.map(Comment::from) ?: return@addSnapshotListener; list = l; Store.need(l.map { it.authorId }) }
        onDispose { r.remove() }
    }
    VsSheet(onClose) {
        Text("Комментарии · ${list?.size ?: 0}", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 8.dp))
        val l = list
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
            when {
                l == null -> item { Loading() }
                l.isEmpty() -> item { EmptyState("Пока тихо", "Напишите первым", "💬") }
                else -> items(l, key = { it.id }) { c -> CommentBubble(c, c.authorId == Store.uid || v.ownerId == Store.uid) { scope.safe(toast) { Media.deleteVideoComment(v, c) } } }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.imePadding(), verticalAlignment = Alignment.CenterVertically) {
            TextField(text, { text = it.take(1000) }, placeholder = { Text("Комментарий…") }, modifier = Modifier.weight(1f), shape = CircleShape, maxLines = 3,
                colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
            IconButton({ val t = text; text = ""; scope.safe(toast) { Media.addVideoComment(v, t) } }, enabled = text.isNotBlank()) {
                Icon(Icons.AutoMirrored.Rounded.Send, "Отправить", tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}
