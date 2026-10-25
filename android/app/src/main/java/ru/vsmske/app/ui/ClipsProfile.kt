package ru.vsmske.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.User
import ru.vsmske.app.data.Video

/** Профиль в духе ТикТока: имя крупно слева, аватар справа, «Друзья · Клипы · Лайки», сетка 3×N */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClipsProfile(id: String) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val own = id == Store.uid
    val me by Store.me.collectAsState()
    val users by Store.users.collectAsState()
    val incoming by Store.incoming.collectAsState()
    val outgoing by Store.outgoing.collectAsState()
    LaunchedEffect(id) { if (!own) runCatching { Store.fetchUser(id) } }
    val u: User? = if (own) me else users[id]
    var tab by rememberSaveable(id) { mutableStateOf(0) }
    var clips by remember(id) { mutableStateOf<List<Video>?>(null) }
    var liked by remember(id) { mutableStateOf<List<Video>?>(null) }
    var saved by remember(id) { mutableStateOf<List<Video>?>(null) }
    var menu by remember { mutableStateOf(false) }
    var askRemove by remember { mutableStateOf(false) }
    LaunchedEffect(id) { clips = runCatching { Media.videosOf(id).filter { it.isClip() } }.getOrElse { toast(errText(it)); emptyList() } }
    val savedIds = me?.saved?.filter { it.startsWith(Media.CLIP_SAVE) }?.map { it.removePrefix(Media.CLIP_SAVE) }?.reversed() ?: emptyList()
    LaunchedEffect(tab, own) {
        if (!own) return@LaunchedEffect
        if (tab == 1 && saved == null) saved = runCatching { Media.videosByIds(savedIds).also { l -> Store.need(l.map { it.ownerId }) } }.getOrElse { toast(errText(it)); emptyList() }
        if (tab == 2 && liked == null) liked = runCatching { Media.likedVideos(id).filter { it.isClip() }.also { l -> Store.need(l.map { it.ownerId }) } }.getOrElse { toast(errText(it)); emptyList() }
    }
    // убрали из сохранённого в ленте — убираем и тут, без нового чтения
    LaunchedEffect(savedIds) { saved = saved?.filter { it.id in savedIds } }
    val shown = when (tab) { 1 -> saved; 2 -> liked; else -> clips }
    val totalLikes = clips?.sumOf { it.likes.size } ?: 0
    val profileLink = SITE + (u?.nick?.takeIf { it.isNotEmpty() }?.let { "@$it" } ?: "id/$id")

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = {
            TopAppBar(title = {},
                navigationIcon = {
                    if (own) IconButton({ nav.navigate("edit") }) { Icon(Icons.Rounded.Edit, "Изменить профиль") }
                    else IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") }
                },
                actions = {
                    if (own) IconButton({ nav.navigate("search") }) { Icon(Icons.Rounded.PersonAdd, "Найти друзей") }
                    IconButton({ share(ctx, "${u?.name ?: ""} в ВС Клипах\n$profileLink") }) {
                        Icon(Icons.AutoMirrored.Rounded.Reply, "Поделиться профилем", Modifier.graphicsLayer { scaleX = -1f })
                    }
                    if (own) IconButton({ menu = true }) { Icon(Icons.Rounded.Menu, "Меню") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface))
        },
    ) { pad ->
        when {
            u == null -> Loading(Modifier.padding(top = 160.dp))
            u.missing -> EmptyState("Страница удалена", emoji = "🫥", modifier = Modifier.padding(top = 160.dp))
            u.banned && !own -> Locked("Deleted Account", Modifier.fillMaxSize().padding(top = pad.calculateTopPadding()))
            else -> LazyVerticalGrid(GridCells.Fixed(3), Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(1.5.dp), verticalArrangement = Arrangement.spacedBy(1.5.dp)) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Column(Modifier.padding(horizontal = 18.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(u.name + (if (u.emoji.isNotEmpty()) " ${u.emoji}" else ""), fontSize = 32.sp, lineHeight = 36.sp, fontWeight = FontWeight.Black,
                                    maxLines = 3, overflow = TextOverflow.Ellipsis)
                                if (u.nick.isNotEmpty()) Text("@${u.nick}", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Box(Modifier.padding(start = 12.dp)) {
                                Avatar(u, 104.dp, showOnline = false)
                                if (own) Box(Modifier.align(Alignment.BottomEnd).size(30.dp).clip(CircleShape).background(Color(0xFF20D5EC))
                                    .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape).clickable { nav.navigate("edit") }, contentAlignment = Alignment.Center) {
                                    Icon(Icons.Rounded.Add, "Сменить фото", tint = Color.White, modifier = Modifier.size(20.dp))
                                }
                            }
                        }
                        Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                            Stat(u.friends.size, "Друзья")
                            Stat(clips?.size ?: 0, ru.vsmske.app.data.plural(clips?.size ?: 0, "Клип", "Клипа", "Клипов"))
                            Stat(totalLikes, "Лайки")
                        }
                        Row(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (own) {
                                GrayButton("Изменить профиль", Modifier.weight(1f)) { nav.navigate("edit") }
                                GrayButton("Поделиться профилем", Modifier.weight(1f)) { share(ctx, "${u.name} в ВС Клипах\n$profileLink") }
                            } else {
                                val friend = me?.friends?.contains(id) == true
                                val sent = outgoing.any { it.to == id }
                                val asks = incoming.any { it.from == id }
                                when {
                                    friend -> GrayButton("Друзья ✓", Modifier.weight(1f)) { askRemove = true }
                                    asks -> PurpleButton("Принять заявку", Modifier.weight(1f)) { scope.safe(toast) { Api.friendAccept(id); toast("Теперь вы друзья") } }
                                    sent -> GrayButton("Заявка отправлена", Modifier.weight(1f)) { scope.safe(toast) { Api.friendCancel(id); toast("Заявка отменена") } }
                                    else -> PurpleButton("Добавить в друзья", Modifier.weight(1f)) { scope.safe(toast) { Api.friendAdd(id); toast("Заявка отправлена") } }
                                }
                                GrayButton("Сообщение", Modifier.weight(1f)) { nav.navigate("chat/$id") }
                            }
                        }
                        val bio = listOf(u.status, u.about).filter { it.isNotBlank() }.joinToString("\n")
                        if (bio.isNotEmpty()) Text(bio, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 14.dp), maxLines = 6, overflow = TextOverflow.Ellipsis)
                    }
                }
                item(span = { GridItemSpan(maxLineSpan) }) {
                    PrimaryTabRow(tab, Modifier.padding(top = 14.dp), containerColor = MaterialTheme.colorScheme.surface,
                        indicator = { TabRowDefaults.PrimaryIndicator(Modifier.tabIndicatorOffset(tab, matchContentSize = true), width = 44.dp, color = MaterialTheme.colorScheme.onSurface) }) {
                        Tab(tab == 0, { tab = 0 }, icon = { Icon(Icons.Rounded.GridView, "Клипы") })
                        Tab(tab == 1, { tab = 1 }, icon = { Icon(if (own) Icons.Outlined.BookmarkBorder else Icons.Rounded.Lock, "Сохранённое") })
                        Tab(tab == 2, { tab = 2 }, icon = { Icon(if (own) Icons.Outlined.FavoriteBorder else Icons.Rounded.Lock, "Понравилось") })
                    }
                }
                val l = shown
                when {
                    tab != 0 && !own -> item(span = { GridItemSpan(maxLineSpan) }) {
                        EmptyState(if (tab == 1) "Сохранённое скрыто" else "Понравившееся скрыто", "${u.name.substringBefore(' ')} видит это только сам", "🔒")
                    }
                    l == null -> item(span = { GridItemSpan(maxLineSpan) }) { Loading() }
                    l.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                        when (tab) {
                            1 -> EmptyState("Сохранённых клипов нет", "Нажмите 🔖 справа на клипе — он появится здесь", "🔖")
                            2 -> EmptyState("Понравившихся клипов нет", "Ставьте ❤️ — клипы соберутся здесь", "❤️")
                            else -> EmptyState(if (own) "Снимите первый клип" else "Клипов пока нет", if (own) "Нажмите «＋» внизу" else "", "🎬",
                                action = if (own) ({ PurpleButton("Снять клип", Modifier.width(200.dp)) { nav.navigate("upload") } }) else null)
                        }
                    }
                    else -> itemsIndexed(l, key = { _, v -> v.id }) { i, v ->
                        GridClip(v) { ClipsData.watch.clear(); ClipsData.watch.addAll(l); nav.navigate("watch/$i") }
                    }
                }
            }
        }
    }
    if (menu) ClipsMenu { menu = false }
    if (askRemove) AlertDialog({ askRemove = false }, title = { Text("Убрать из друзей?") }, text = { Text("${u?.name ?: ""} пропадёт из ваших друзей, а клипы этого человека — из ленты «Друзья».") },
        confirmButton = { TextButton({ askRemove = false; scope.safe(toast) { Api.friendRemove(id); toast("Убрано из друзей") } }) { Text("Убрать") } },
        dismissButton = { TextButton({ askRemove = false }) { Text("Отмена") } })
}

@Composable
private fun Stat(n: Int, label: String) = Column {
    Text(fmtNum(n), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** Клетка сетки: обложка 9:16 и просмотры внизу */
@Composable
fun GridClip(v: Video, onClick: () -> Unit) {
    val banned = Store.users.collectAsState().value[v.ownerId]?.banned == true
    Box(Modifier.aspectRatio(9 / 16f).background(MaterialTheme.colorScheme.surfaceContainerHigh).clickable(onClick = onClick)) {
        if (banned) Locked("", Modifier.fillMaxSize()) else if (v.cover.isNotEmpty()) DbImage(v.cover, Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.7f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.55f))))
        Row(Modifier.align(Alignment.BottomStart).padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.PlayArrow, null, tint = Color.White, modifier = Modifier.size(18.dp))
            Text(fmtNum(v.views), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, style = TextStyle(shadow = TextShade))
        }
    }
}

/** Меню профиля: тема, VСмске, выход */
@Composable
private fun ClipsMenu(onClose: () -> Unit) {
    val ctx = LocalContext.current
    val mode by ThemePref.mode.collectAsState()
    var askOut by remember { mutableStateOf(false) }
    VsSheet(onClose) {
        Text("Настройки", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 12.dp))
        Text("Тема", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 16.dp)) {
            listOf("system" to "Как в системе", "light" to "Светлая", "dark" to "Тёмная").forEachIndexed { i, (k, l) ->
                SegmentedButton(mode == k, { ThemePref.set(ctx, k) }, SegmentedButtonDefaults.itemShape(i, 3)) { Text(l, maxLines = 1) }
            }
        }
        ListItem(headlineContent = { Text("Открыть VСмске") }, supportingContent = { Text("Лента, музыка, видео и всё остальное") },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.clip(MaterialTheme.shapes.medium).clickable {
                val i = ctx.packageManager.getLaunchIntentForPackage("ru.vsmske.app")
                runCatching { ctx.startActivity(i ?: Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/nlponae269/vsmske/releases/download/android/VSmske.apk"))) }
                onClose()
            })
        ListItem(headlineContent = { Text("Выйти из аккаунта", color = MaterialTheme.colorScheme.error) }, colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.clip(MaterialTheme.shapes.medium).clickable { askOut = true })
        Text("ВС Клипы ${ru.vsmske.app.BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp, start = 16.dp))
    }
    if (askOut) AlertDialog({ askOut = false }, title = { Text("Выйти из аккаунта?") },
        confirmButton = { TextButton({ askOut = false; onClose(); ClipsData.reset(); Api.signOut() }) { Text("Выйти") } },
        dismissButton = { TextButton({ askOut = false }) { Text("Отмена") } })
}
