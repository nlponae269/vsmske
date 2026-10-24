package ru.vsmske.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.VideoFile
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Comment
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.Video
import ru.vsmske.app.data.ago
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.data.plural
import ru.vsmske.app.music.FileSource
import ru.vsmske.app.music.Music

/* ВС Видео 3.0: главная (большой ролик, полка клипов, сетка), просмотр с комментариями, загрузка файла или ссылки. */

const val SITE = "https://nlponae269.github.io/vsmske/"

fun share(ctx: Context, text: String) {
    ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Поделиться"))
}

/** Живой список роликов (растёт при прокрутке) */
@Composable
fun rememberVideos(limit: Long): List<Video>? {
    var list by remember { mutableStateOf<List<Video>?>(null) }
    DisposableEffect(limit) {
        val reg: ListenerRegistration = Media.videosQuery(limit).addSnapshotListener { s, _ ->
            val l = s?.documents?.map(Video::from) ?: return@addSnapshotListener
            Store.need(l.map { it.ownerId }); list = l
        }
        onDispose { reg.remove() }
    }
    return list
}

fun Video.isClip() = source == "file" && duration in 0.5..90.0

/** Обложка ролика с длительностью */
@Composable
fun VideoThumb(v: Video, modifier: Modifier, big: Boolean = false) {
    val owner = Store.users.collectAsState().value[v.ownerId]
    Box(modifier.clip(RoundedCornerShape(if (big) 28.dp else 20.dp)).background(MaterialTheme.colorScheme.surfaceContainerHighest)) {
        when {
            owner?.banned == true -> Locked("Видео недоступно", Modifier.fillMaxSize())
            v.cover.isNotEmpty() -> DbImage(v.cover, Modifier.fillMaxSize())
            else -> Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary))), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.PlayArrow, null, tint = Color.White, modifier = Modifier.size(48.dp))
            }
        }
        if (v.duration > 0) Chip(fmtDur(v.duration), Color.Black.copy(alpha = 0.65f), Color.White, Modifier.align(Alignment.BottomEnd).padding(8.dp))
        else if (v.source == "link") Chip(when (v.provider) { "youtube" -> "YouTube"; "rutube" -> "Rutube"; "vk" -> "VK Видео"; else -> "Ссылка" },
            Color.Black.copy(alpha = 0.65f), Color.White, Modifier.align(Alignment.BottomEnd).padding(8.dp))
    }
}

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoHome() {
    val nav = LocalNav.current
    var limit by remember { mutableStateOf(60L) }
    val all = rememberVideos(limit)
    val users by Store.users.collectAsState()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var add by remember { mutableStateOf(false) }
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val list = all?.filter { users[it.ownerId]?.banned != true }
    Scaffold(
        modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
        contentWindowInsets = WindowInsets(0),
        topBar = { LargeTopAppBar(title = { Text("Видео") }, scrollBehavior = scroll, actions = {
            IconButton({ nav.navigate("live") }) { Icon(Icons.Rounded.Videocam, "Эфиры") }
        }) },
        floatingActionButton = { ExtendedFloatingActionButton(onClick = { add = true }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("Добавить") }) },
    ) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 100.dp)) {
            item {
                SecondaryTabRow(tab, containerColor = Color.Transparent) {
                    listOf("Главная", "Клипы", "Мои видео").forEachIndexed { i, l -> Tab(tab == i, { tab = i }, text = { Text(l) }) }
                }
            }
            val l = list
            if (l == null) { item { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { repeat(3) { Box(Modifier.fillMaxWidth().aspectRatio(16 / 9f).clip(RoundedCornerShape(24.dp)).shimmer()) } } }; return@LazyColumn }
            when (tab) {
                0 -> {
                    val clips = l.filter { it.isClip() }
                    val hero = l.firstOrNull()
                    if (hero == null) item { EmptyState("Здесь пока пусто", "Загрузите первый ролик — кнопка «Добавить»", "🎬") }
                    else {
                        item { HeroVideo(hero) { nav.navigate("video/${hero.id}") } }
                        if (clips.isNotEmpty()) {
                            item { SectionTitle("Клипы", more = "Смотреть", onMore = { nav.navigate("clips/${clips.first().id}") }) }
                            item {
                                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    items(clips.take(20), key = { it.id }) { c -> ClipCard(c) { nav.navigate("clips/${c.id}") } }
                                }
                            }
                        }
                        val month = System.currentTimeMillis() - 30L * 86_400_000
                        val top = l.filter { it.createdAt > month && it.views > 0 }.sortedByDescending { it.views + it.likes.size * 3 }.take(8)
                        if (top.size >= 2) {
                            item { SectionTitle("Популярное за месяц") }
                            item {
                                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    items(top, key = { "t" + it.id }) { v -> VideoCard(v, Modifier.width(260.dp)) { nav.navigate("video/${v.id}") } }
                                }
                            }
                        }
                        item { SectionTitle("Все видео") }
                        items(l.drop(1), key = { it.id }) { v -> VideoCard(v, Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) { nav.navigate("video/${v.id}") } }
                        if (l.size >= limit) item { LaunchedEffect(Unit) { limit += 60 }; Loading() }
                    }
                }
                1 -> {
                    val clips = l.filter { it.isClip() }
                    if (clips.isEmpty()) item { EmptyState("Клипов пока нет", "Клип — короткое видео до полутора минут", "📱") }
                    else clips.chunked(3).forEach { row ->
                        item {
                            Row(Modifier.padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                row.forEach { c -> VideoThumb(c, Modifier.weight(1f).aspectRatio(9 / 16f).clickable { nav.navigate("clips/${c.id}") }) }
                                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                            }
                        }
                    }
                }
                else -> {
                    val mine = l.filter { it.ownerId == Store.uid }
                    if (mine.isEmpty()) item { EmptyState("У вас пока нет видео", "Добавьте ролик с телефона (до 20 МБ) или ссылку на YouTube, Rutube, VK", "🎥") { Button({ add = true }) { Text("Добавить видео") } } }
                    else items(mine, key = { it.id }) { v -> VideoCard(v, Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) { nav.navigate("video/${v.id}") } }
                }
            }
        }
    }
    if (add) AddVideoSheet { id -> add = false; if (id != null) nav.navigate("video/$id") }
}

@Composable
private fun HeroVideo(v: Video, onClick: () -> Unit) {
    val owner = Store.users.collectAsState().value[v.ownerId]
    Box(Modifier.padding(16.dp).fillMaxWidth().aspectRatio(16 / 10f).clickable(onClick = onClick)) {
        VideoThumb(v, Modifier.fillMaxSize(), big = true)
        Box(Modifier.fillMaxSize().clip(RoundedCornerShape(28.dp)).background(Brush.verticalGradient(0.45f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.8f))))
        Column(Modifier.align(Alignment.BottomStart).padding(18.dp)) {
            Chip("Новое", MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.onPrimary)
            Spacer(Modifier.height(8.dp))
            Text(v.title.ifEmpty { "Без названия" }, style = MaterialTheme.typography.headlineSmall, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text("${owner?.name ?: ""} · ${v.views} ${plural(v.views, "просмотр", "просмотра", "просмотров")}", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.8f))
        }
        Box(Modifier.align(Alignment.Center).size(64.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.92f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.PlayArrow, "Смотреть", tint = Color.Black, modifier = Modifier.size(38.dp))
        }
    }
}

@Composable
private fun ClipCard(v: Video, onClick: () -> Unit) {
    Box(Modifier.width(130.dp).aspectRatio(9 / 16f).clickable(onClick = onClick)) {
        VideoThumb(v, Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().clip(RoundedCornerShape(20.dp)).background(Brush.verticalGradient(0.6f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.7f))))
        Text(v.title, color = Color.White, style = MaterialTheme.typography.labelMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.align(Alignment.BottomStart).padding(10.dp))
    }
}

@Composable
fun VideoCard(v: Video, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val owner = Store.users.collectAsState().value[v.ownerId]
    Column(modifier.clickable(onClick = onClick)) {
        VideoThumb(v, Modifier.fillMaxWidth().aspectRatio(16 / 9f))
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.Top) {
            Avatar(owner, 36.dp)
            Column(Modifier.padding(start = 10.dp)) {
                Text(v.title.ifEmpty { "Без названия" }, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${owner?.name ?: "…"} · ${v.views} ${plural(v.views, "просмотр", "просмотра", "просмотров")} · ${ago(v.createdAt)}",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** ExoPlayer для роликов из базы (vsmske://file/<id>) и прямых ссылок; звук забирает фокус — музыка встаёт на паузу */
@OptIn(UnstableApi::class)
@Composable
fun rememberVideoPlayer(): ExoPlayer {
    val ctx = LocalContext.current
    val p = remember {
        ExoPlayer.Builder(ctx).setMediaSourceFactory(DefaultMediaSourceFactory(FileSource.Factory(ctx)))
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true).build()
    }
    DisposableEffect(Unit) { onDispose { p.release() } }
    return p
}

fun Video.mediaUri(): Uri = if (source == "file") Uri.parse("vsmske://file/$fileId") else Uri.parse(vid)

@OptIn(UnstableApi::class)
@Composable
fun ExoView(player: ExoPlayer, modifier: Modifier, controls: Boolean = true, fill: Boolean = false) {
    AndroidView({ c ->
        PlayerView(c).apply {
            this.player = player; useController = controls; setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
            resizeMode = if (fill) androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_ZOOM else androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT
            setBackgroundColor(android.graphics.Color.BLACK)
        }
    }, modifier, update = { it.player = player })
}

/** Встроенный плеер YouTube / Rutube / VK */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun EmbedView(url: String, modifier: Modifier) {
    AndroidView({ c ->
        WebView(c).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            settings.javaScriptEnabled = true; settings.domStorageEnabled = true; settings.mediaPlaybackRequiresUserGesture = false
            webChromeClient = WebChromeClient(); setBackgroundColor(android.graphics.Color.BLACK)
            loadDataWithBaseURL("https://nlponae269.github.io/", "<html><body style='margin:0;background:#000'><iframe src='$url' style='border:0;width:100vw;height:100vh' allow='autoplay; fullscreen; encrypted-media' allowfullscreen></iframe></body></html>", "text/html", "utf-8", null)
        }
    }, modifier, onRelease = { it.destroy() })
}

/** Просмотр ролика */
@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchScreen(id: String) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    var v by remember { mutableStateOf<Video?>(null) }
    var gone by remember { mutableStateOf(false) }
    var comments by remember { mutableStateOf<List<Comment>?>(null) }
    var text by rememberSaveable { mutableStateOf("") }
    var descOpen by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf(false) }
    val more = rememberVideos(30)
    DarkSystemBars()   // сверху чёрный плеер
    DisposableEffect(id) {
        val a = Fire.db.collection("videos").document(id).addSnapshotListener { s, _ ->
            if (s == null) return@addSnapshotListener
            if (!s.exists()) { gone = true; return@addSnapshotListener }
            v = Video.from(s); Store.need(listOf(v!!.ownerId))
        }
        val b = Media.videoComments(id).addSnapshotListener { s, _ -> val l = s?.documents?.map(Comment::from) ?: return@addSnapshotListener; comments = l; Store.need(l.map { it.authorId }) }
        onDispose { a.remove(); b.remove() }
    }
    val player = rememberVideoPlayer()
    val cur = v
    val owner = cur?.let { users[it.ownerId] }
    val ownerBanned = owner?.banned == true   // null (ещё грузится) и false — одно и то же, чтобы ролик не перезапускался
    LaunchedEffect(cur?.id, ownerBanned) {
        val x = cur ?: return@LaunchedEffect
        if (ownerBanned) { player.stop(); return@LaunchedEffect }
        Media.countView(x)
        if (x.embed.isEmpty()) { if (Music.state.value.playing) Music.toggle(); player.setMediaItem(MediaItem.fromUri(x.mediaUri())); player.prepare(); player.playWhenReady = true }
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
        Box(Modifier.fillMaxWidth().background(Color.Black).statusBarsPadding().aspectRatio(16 / 9f)) {
            when {
                gone -> Text("Видео удалено", color = Color.White, modifier = Modifier.align(Alignment.Center))
                cur == null -> ExpressiveLoader(modifier = Modifier.align(Alignment.Center))
                owner?.banned == true -> Locked("Видео недоступно", Modifier.fillMaxSize())
                cur.embed.isNotEmpty() -> EmbedView(cur.embed, Modifier.fillMaxSize())
                else -> ExoView(player, Modifier.fillMaxSize())
            }
            IconButton({ nav.popBackStack() }, Modifier.padding(4.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f))) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад", tint = Color.White) }
        }
        if (cur == null) { if (!gone) Loading(); return@Column }
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = 16.dp)) {
            item {
                Column(Modifier.padding(16.dp).animateContentSize().clickable { descOpen = !descOpen }) {
                    Text(cur.title.ifEmpty { "Без названия" }, style = MaterialTheme.typography.titleLarge)
                    Text("${cur.views} ${plural(cur.views, "просмотр", "просмотра", "просмотров")} · ${ago(cur.createdAt)}" + if (cur.description.isNotEmpty() && !descOpen) "  ещё" else "",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    AnimatedVisibility(descOpen && cur.description.isNotEmpty()) {
                        Text(cur.description, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 10.dp).clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(12.dp).fillMaxWidth())
                    }
                }
            }
            item {
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(owner, 40.dp) { nav.openProfile(cur.ownerId) }
                    UserName(owner, modifier = Modifier.weight(1f).padding(horizontal = 10.dp).clickable { nav.openProfile(cur.ownerId) })
                    if (cur.ownerId == Store.uid || Store.me.value?.admin == true) IconButton({ ask = true }) { Icon(Icons.Rounded.Delete, "Удалить") }
                }
            }
            item {
                val liked = Store.uid in cur.likes
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { FilterChip(liked, { scope.safe(toast) { Media.toggleVideoLike(cur) } }, { Text(if (cur.likes.isEmpty()) "Нравится" else "${cur.likes.size}") },
                        leadingIcon = { Icon(if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, null, Modifier.size(18.dp)) }, shape = CircleShape) }
                    item { FilterChip(false, { share(ctx, cur.title + "\n" + SITE + "video/" + cur.id) }, { Text("Поделиться") }, leadingIcon = { Icon(Icons.Rounded.Share, null, Modifier.size(18.dp)) }, shape = CircleShape) }
                    if (cur.isClip()) item { FilterChip(false, { nav.navigate("clips/${cur.id}") }, { Text("В клипах") }, shape = CircleShape) }
                }
            }
            item { SectionTitle("Комментарии · ${comments?.size ?: 0}") }
            item {
                Row(Modifier.padding(horizontal = 16.dp).imePadding(), verticalAlignment = Alignment.CenterVertically) {
                    TextField(text, { text = it.take(1000) }, placeholder = { Text("Написать комментарий…") }, modifier = Modifier.weight(1f), shape = CircleShape, maxLines = 4,
                        colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
                    IconButton({ val t = text; text = ""; scope.safe(toast) { Media.addVideoComment(cur, t) } }, enabled = text.isNotBlank()) { Icon(Icons.AutoMirrored.Rounded.Send, "Отправить", tint = MaterialTheme.colorScheme.primary) }
                }
            }
            val cs = comments
            if (cs != null) items(cs, key = { "c" + it.id }) { c ->
                CommentBubble(c, canDelete = c.authorId == Store.uid || cur.ownerId == Store.uid) { scope.safe(toast) { Media.deleteVideoComment(cur, c) } }
            }
            val next = more?.filter { it.id != cur.id && users[it.ownerId]?.banned != true }?.take(10) ?: emptyList()
            if (next.isNotEmpty()) {
                item { SectionTitle("Дальше") }
                items(next, key = { "n" + it.id }) { n -> VideoCard(n, Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) { nav.navigate("video/${n.id}") { popUpTo("video/{id}") { inclusive = true } } } }
            }
        }
    }
    if (ask && cur != null) AlertDialog({ ask = false }, title = { Text("Удалить видео?") },
        confirmButton = { TextButton({ ask = false; scope.safe(toast) { Media.deleteVideo(cur); toast("Видео удалено"); nav.popBackStack() } }) { Text("Удалить") } },
        dismissButton = { TextButton({ ask = false }) { Text("Отмена") } })
}

@Composable
fun CommentBubble(c: Comment, canDelete: Boolean, onDelete: () -> Unit) {
    val nav = LocalNav.current
    val a = Store.users.collectAsState().value[c.authorId]
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        Avatar(a, 36.dp) { nav.openProfile(c.authorId) }
        Column(Modifier.padding(start = 10.dp).weight(1f).clip(RoundedCornerShape(4.dp, 20.dp, 20.dp, 20.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(horizontal = 14.dp, vertical = 9.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                UserName(a, MaterialTheme.typography.labelLarge, Modifier.weight(1f))
                Text(ago(c.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            RichText(c.text, style = MaterialTheme.typography.bodyMedium)
            if (canDelete) Text("удалить", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error, modifier = Modifier.clickable(onClick = onDelete).padding(top = 4.dp))
        }
    }
}

/** Добавить видео: файл с телефона (до 20 МБ) или ссылка */
@Composable
fun AddVideoSheet(onDone: (String?) -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf("file") }
    var uri by remember { mutableStateOf<Uri?>(null) }
    var link by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var progress by remember { mutableStateOf<Float?>(null) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { u -> if (u != null) { uri = u; if (title.isBlank()) title = "Моё видео" } }
    VsSheet({ if (progress == null) onDone(null) }) {
        Text("Новое видео", style = MaterialTheme.typography.headlineSmall)
        Row(Modifier.padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(mode == "file", { mode = "file" }, { Text("Файл с телефона") }, leadingIcon = { Icon(Icons.Rounded.VideoFile, null, Modifier.size(18.dp)) }, shape = CircleShape)
            FilterChip(mode == "link", { mode = "link" }, { Text("Ссылка") }, leadingIcon = { Icon(Icons.Rounded.Link, null, Modifier.size(18.dp)) }, shape = CircleShape)
        }
        if (mode == "file") {
            Box(Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.secondaryContainer).clickable { pick.launch("video/*") },
                contentAlignment = Alignment.Center) {
                Text(if (uri == null) "Выбрать видео (до 20 МБ)" else "Видео выбрано ✓ — нажмите, чтобы заменить", color = MaterialTheme.colorScheme.onSecondaryContainer, style = MaterialTheme.typography.titleSmall)
            }
        } else OutlinedTextField(link, { link = it.trim() }, Modifier.fillMaxWidth(), label = { Text("YouTube, Rutube, VK Видео или .mp4") }, singleLine = true,
            isError = link.isNotEmpty() && Media.parseLink(link) == null)
        OutlinedTextField(title, { title = it.take(120) }, Modifier.fillMaxWidth().padding(top = 8.dp), label = { Text("Название") }, singleLine = true)
        OutlinedTextField(desc, { desc = it.take(2000) }, Modifier.fillMaxWidth().padding(top = 8.dp), label = { Text("Описание") }, minLines = 2, maxLines = 5)
        progress?.let { LinearProgressIndicator({ it }, Modifier.fillMaxWidth().padding(top = 12.dp)); Text("Загружаем… не закрывайте приложение", style = MaterialTheme.typography.bodySmall) }
        val ready = progress == null && title.isNotBlank() && (if (mode == "file") uri != null else Media.parseLink(link) != null)
        Button({
            progress = 0f
            scope.launch {
                try {
                    val id = if (mode == "file") Media.addVideoFile(ctx, uri!!, title, desc) { progress = it } else Media.addVideoLink(link, title, desc)
                    toast("Видео добавлено"); onDone(id)
                } catch (e: Exception) { toast(errText(e)); progress = null }
            }
        }, Modifier.fillMaxWidth().padding(top = 16.dp).height(52.dp), enabled = ready) { Text("Опубликовать") }
    }
}

/** Видео человека (с профиля) */
@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserVideosScreen(uid: String) {
    val nav = LocalNav.current
    var list by remember { mutableStateOf<List<Video>?>(null) }
    LaunchedEffect(uid) { list = runCatching { Media.videosOf(uid) }.getOrDefault(emptyList()) }
    val u = Store.users.collectAsState().value[uid]
    BackScaffold(if (uid == Store.uid) "Мои видео" else "Видео · ${u?.name ?: ""}") { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            val l = list
            when {
                l == null -> item { Loading() }
                l.isEmpty() || u?.banned == true -> item { EmptyState("Видео нет", emoji = "🎬") }
                else -> items(l, key = { it.id }) { v -> VideoCard(v, Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) { nav.navigate("video/${v.id}") } }
            }
        }
    }
}

/** Экран с кнопкой «назад» и большим заголовком */
@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BackScaffold(title: String, actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {}, fab: @Composable () -> Unit = {},
                 content: @Composable (PaddingValues) -> Unit) {
    val nav = LocalNav.current
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    Scaffold(
        modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
        contentWindowInsets = WindowInsets(0),
        topBar = { LargeTopAppBar(title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) }, scrollBehavior = scroll, actions = actions,
            navigationIcon = { IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } }) },
        floatingActionButton = fab,
        content = content,
    )
}

