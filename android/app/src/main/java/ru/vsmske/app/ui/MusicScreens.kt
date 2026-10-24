package ru.vsmske.app.ui

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.Upload
import androidx.compose.material.icons.rounded.Waves
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Playlist
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.Track
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.data.plural
import ru.vsmske.app.music.Music
import ru.vsmske.app.music.Upload
import java.util.Calendar

/* ВС Музыка 3.0: главная как на сайте (приветствие, плитки, «Поток», полки), списки треков, плейлисты, загрузка. */

@Composable
fun TrackCover(t: Track?, size: Dp, radius: Dp = 12.dp) {
    val cs = MaterialTheme.colorScheme
    val hidden = t != null && Store.user(t.ownerId)?.banned == true
    Box(Modifier.size(size).clip(RoundedCornerShape(radius)).background(Brush.linearGradient(listOf(cs.primaryContainer, cs.tertiaryContainer))), contentAlignment = Alignment.Center) {
        when {
            hidden -> Icon(Icons.Rounded.Lock, null, tint = cs.onPrimaryContainer, modifier = Modifier.size(size * 0.4f))
            !t?.cover.isNullOrEmpty() -> DbImage(t!!.cover, Modifier.fillMaxSize())
            else -> Icon(Icons.Rounded.MusicNote, null, tint = cs.onPrimaryContainer, modifier = Modifier.size(size * 0.45f))
        }
    }
}

private fun recentIds(ctx: Context): List<String> = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE).getString("recent", "")!!.split(',').filter { it.isNotEmpty() }
fun rememberRecent(ctx: Context, t: Track) {
    val p = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE)
    val l = (listOf(t.id) + recentIds(ctx).filter { it != t.id }).take(20)
    p.edit().putString("recent", l.joinToString(",")).apply()
}

/** Играть список (без треков забаненных), запомнить в «Недавно» */
fun playList(ctx: Context, list: List<Track>, t: Track) {
    val ok = list.filter { Store.user(it.ownerId)?.banned != true }
    Music.play(ctx, ok, ok.indexOfFirst { it.id == t.id }.coerceAtLeast(0)); rememberRecent(ctx, t)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MusicScreen(onOpenPlayer: () -> Unit) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val me by Store.me.collectAsState()
    val users by Store.users.collectAsState()
    val ms by Music.state.collectAsState()
    var stream by remember { mutableStateOf<List<Track>?>(null) }
    var mine by remember { mutableStateOf<List<Track>?>(null) }
    var playlists by remember { mutableStateOf<List<Playlist>>(emptyList()) }
    var recent by remember { mutableStateOf<List<Track>>(emptyList()) }
    var q by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }
    val upload = rememberUploader { mine = null }
    var top by remember { mutableStateOf<List<Track>>(emptyList()) }
    LaunchedEffect(Unit) { top = runCatching { Media.tracksByIds(Music.topPlayed(12).map { it.first }) }.getOrDefault(emptyList()) }
    LaunchedEffect(Unit) {
        stream = runCatching { Media.streamPage(null, 60) }.getOrElse { toast(errText(it)); emptyList() }
        Store.need(stream!!.map { it.ownerId })
        playlists = runCatching { Media.playlistsMine() }.getOrDefault(emptyList())
        recent = runCatching { Media.tracksByIds(recentIds(ctx)) }.getOrDefault(emptyList())
    }
    // «Мои треки» грузим один раз (и после загрузки нового трека): каждое ♡ не должно заново читать сотни документов из бесплатной квоты
    LaunchedEffect(mine == null) { if (mine == null) mine = runCatching { Api.tracksMine(Store.me.value?.tracks ?: emptyList()) }.getOrDefault(emptyList()) }
    LaunchedEffect(ms.error) { ms.error?.let { toast(it); Music.clearError() } }
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val hello = when (hour) { in 5..11 -> "Доброе утро"; in 12..17 -> "Добрый день"; in 18..22 -> "Добрый вечер"; else -> "Доброй ночи" }
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val mix = remember(mine, top, stream) { dayMix(mine.orEmpty(), top, stream.orEmpty(), Store.users.value) }
    val friends = remember(users, me?.friends) { (me?.friends ?: emptyList()).mapNotNull { users[it] }.filter { it.listening.isNotEmpty() && !it.banned } }
    Scaffold(
        modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
        contentWindowInsets = WindowInsets(0),
        topBar = { LargeTopAppBar(title = { Column { Text(hello + ", " + (me?.name?.substringBefore(' ') ?: ""), maxLines = 1, overflow = TextOverflow.Ellipsis) } }, scrollBehavior = scroll,
            actions = {
                IconButton({ searching = !searching }) { Icon(Icons.Rounded.Search, "Поиск") }
                IconButton(upload.launch, enabled = !upload.busy) { Icon(Icons.Rounded.Upload, "Загрузить трек") }
            }) },
    ) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            upload.progressItem(this)
            if (searching) {
                item {
                    OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), placeholder = { Text("Трек или исполнитель") },
                        leadingIcon = { Icon(Icons.Rounded.Search, null) }, singleLine = true, shape = CircleShape)
                }
                val all = ((mine ?: emptyList()) + (stream ?: emptyList())).distinctBy { it.id }
                val found = if (q.isBlank()) emptyList() else all.filter { (it.title + " " + it.artist).contains(q.trim(), ignoreCase = true) }
                if (q.isNotBlank() && found.isEmpty()) item { EmptyState("Ничего не нашли", "Поиск идёт по вашим трекам и свежим в Потоке", "🔎") }
                itemsIndexed(found, key = { _, t -> "s" + t.id }) { _, t -> TrackRow(t, found, ms, onOpenPlayer) }
                return@LazyColumn
            }
            item {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    QuickMusic("Мои треки", "${maxOf(mine?.size ?: 0, me?.tracks?.size ?: 0)}", Icons.Rounded.Favorite, listOf(Color(0xFF7C3AED), Color(0xFFC026D3)), Modifier.weight(1f),
                        onPlay = { mine?.takeIf { it.isNotEmpty() }?.let { playList(ctx, it, it[0]) } }) { nav.navigate("music/liked") }
                    QuickMusic("Плейлисты", "${playlists.size}", Icons.AutoMirrored.Rounded.QueueMusic, listOf(Color(0xFF1F8A5B), Color(0xFF2B8BB5)), Modifier.weight(1f)) { nav.navigate("music/playlists") }
                }
            }
            item {
                Box(Modifier.padding(16.dp).fillMaxWidth().height(150.dp).clip(RoundedCornerShape(32.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFFFF6B6B), Color(0xFFC026D3), Color(0xFF4F46E5))))
                    .clickable { stream?.takeIf { it.isNotEmpty() }?.let { playList(ctx, it, it[0]) } }) {
                    Icon(Icons.Rounded.Waves, null, tint = Color.White.copy(alpha = 0.18f), modifier = Modifier.align(Alignment.CenterEnd).size(170.dp))
                    Column(Modifier.align(Alignment.BottomStart).padding(20.dp)) {
                        Text("Поток", style = MaterialTheme.typography.headlineMedium, color = Color.White)
                        Text("Все треки VСмске подряд — от новых к старым", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
                    }
                    Box(Modifier.align(Alignment.TopEnd).padding(16.dp).size(52.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.PlayArrow, "Слушать Поток", tint = Color.Black, modifier = Modifier.size(32.dp))
                    }
                }
            }
            if (mix.size >= 3) item {
                Box(Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(110.dp).clip(RoundedCornerShape(28.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF1F8A5B), Color(0xFF2B8BB5), Color(0xFF6A47C9))))
                    .clickable { playList(ctx, mix, mix[0]) }) {
                    Column(Modifier.align(Alignment.CenterStart).padding(20.dp)) {
                        Text("Микс дня", style = MaterialTheme.typography.headlineSmall, color = Color.White)
                        Text("${mix.size} ${plural(mix.size, "трек", "трека", "треков")} · ваше любимое, каждый день по-новому", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f))
                    }
                    Box(Modifier.align(Alignment.CenterEnd).padding(16.dp).size(48.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.PlayArrow, "Слушать Микс дня", tint = Color.Black, modifier = Modifier.size(30.dp))
                    }
                }
            }
            val topOk = top.filter { users[it.ownerId]?.banned != true }
            if (topOk.isNotEmpty()) {
                item { SectionTitle("Чаще всего слушаю") }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(topOk, key = { "top" + it.id }) { t -> CoverCard(t) { playList(ctx, topOk, t) } }
                    }
                }
            }
            if (playlists.isNotEmpty()) {
                item { SectionTitle("Твои плейлисты", more = "Все", onMore = { nav.navigate("music/playlists") }) }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(playlists, key = { it.id }) { p -> PlaylistTile(p) { nav.navigate("music/pl/${p.id}") } }
                    }
                }
            }
            if (friends.isNotEmpty()) {
                item { SectionTitle("Друзья слушают") }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(friends, key = { it.id }) { f ->
                            Row(Modifier.width(240.dp).clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).clickable { nav.navigate("music/user/${f.id}") }.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically) {
                                Avatar(f, 44.dp)
                                Column(Modifier.padding(start = 10.dp)) {
                                    Text(f.name, style = MaterialTheme.typography.titleSmall, maxLines = 1)
                                    Text("🎵 " + f.listening, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                }
            }
            if (recent.isNotEmpty()) {
                item { SectionTitle("Недавно играло") }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(recent, key = { "r" + it.id }) { t -> CoverCard(t) { playList(ctx, recent, t) } }
                    }
                }
            }
            val s = stream
            item { SectionTitle("Новое в Потоке", more = "Весь Поток", onMore = { nav.navigate("music/stream") }) }
            when {
                s == null -> items(5) { SkeletonRow() }
                s.isEmpty() -> item { EmptyState("Пока никто ничего не загрузил", "Загрузите первый трек кнопкой вверху", "🎧") }
                else -> itemsIndexed(s.take(15), key = { _, t -> "n" + t.id }) { _, t -> TrackRow(t, s, ms, onOpenPlayer) }
            }
        }
    }
    upload.dialog()
}

@Composable
private fun QuickMusic(title: String, sub: String, icon: androidx.compose.ui.graphics.vector.ImageVector, colors: List<Color>, modifier: Modifier, onPlay: (() -> Unit)? = null, onClick: () -> Unit) =
    Box(modifier.height(96.dp).clip(RoundedCornerShape(26.dp)).background(Brush.linearGradient(colors)).clickable(onClick = onClick)) {
        Icon(icon, null, tint = Color.White.copy(alpha = 0.22f), modifier = Modifier.align(Alignment.TopEnd).padding(10.dp).size(54.dp))
        Column(Modifier.align(Alignment.BottomStart).padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = Color.White)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f))
        }
        if (onPlay != null) Box(Modifier.align(Alignment.BottomEnd).padding(10.dp).size(36.dp).clip(CircleShape).background(Color.White).clickable(onClick = onPlay), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.PlayArrow, "Играть", tint = Color.Black)
        }
    }

@Composable
private fun PlaylistTile(p: Playlist, onClick: () -> Unit) {
    val c = parseColor(p.color, MaterialTheme.colorScheme.tertiary)
    Column(Modifier.width(150.dp).clickable(onClick = onClick)) {
        Box(Modifier.size(150.dp).clip(RoundedCornerShape(26.dp)).background(Brush.linearGradient(listOf(c, c.copy(alpha = 0.55f)))), contentAlignment = Alignment.Center) {
            Icon(Icons.AutoMirrored.Rounded.QueueMusic, null, tint = Color.White, modifier = Modifier.size(56.dp))
        }
        Text(p.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        Text("${p.tracks.size} ${plural(p.tracks.size, "трек", "трека", "треков")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CoverCard(t: Track, onClick: () -> Unit) =
    Column(Modifier.width(140.dp).clickable(onClick = onClick)) {
        TrackCover(t, 140.dp, 24.dp)
        Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }

/** Строка трека: обложка (на текущем — столбики), название, ♡ и «⋯» (следующим, в плейлист, удалить) */
@Composable
fun TrackRow(t: Track, list: List<Track>, ms: Music.State, onOpenPlayer: () -> Unit, playlist: Playlist? = null, onChanged: () -> Unit = {}) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val cs = MaterialTheme.colorScheme
    val me by Store.me.collectAsState()
    val hidden = Store.users.collectAsState().value[t.ownerId]?.banned == true
    val cur = ms.track?.id == t.id
    val saved = t.id in (me?.tracks ?: emptyList())
    val mine = t.ownerId == Store.uid
    var menu by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf(false) }
    var pick by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp).clip(RoundedCornerShape(20.dp)).background(if (cur) cs.secondaryContainer else Color.Transparent)
        .clickable(enabled = !hidden) { if (cur) onOpenPlayer() else playList(ctx, list, t) }.padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(contentAlignment = Alignment.Center) {
            TrackCover(t, 52.dp, 14.dp)
            if (cur) Box(Modifier.size(52.dp).clip(RoundedCornerShape(14.dp)).background(Color.Black.copy(alpha = 0.4f)), contentAlignment = Alignment.Center) { Bars(ms.playing, Color.White) }
        }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(if (hidden) "Трек недоступен" else t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (cur) cs.onSecondaryContainer else cs.onSurface)
            Text(if (hidden) "Deleted Account" else t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = cs.onSurfaceVariant)
        }
        if (!hidden) {
            Text(fmtDur(t.duration), style = MaterialTheme.typography.labelMedium, color = cs.onSurfaceVariant)
            if (!mine) IconButton({ scope.safe(toast) { Api.toggleSaved(t) } }) { Icon(if (saved) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, if (saved) "Убрать из моих" else "В мои треки", tint = if (saved) cs.primary else cs.onSurfaceVariant) }
            Box {
                IconButton({ menu = true }) { Icon(Icons.Rounded.MoreVert, "Ещё") }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem({ Text("Играть следующим") }, { menu = false; Music.playNext(ctx, t); toast("Сыграет следующим") }, leadingIcon = { Icon(Icons.Rounded.SkipNext, null) })
                    DropdownMenuItem({ Text("В плейлист") }, { menu = false; pick = true }, leadingIcon = { Icon(Icons.AutoMirrored.Rounded.PlaylistAdd, null) })
                    if (playlist != null && playlist.ownerId == Store.uid) DropdownMenuItem({ Text("Убрать из плейлиста") }, {
                        menu = false; scope.safe(toast) { Media.savePlaylist(playlist.id, playlist.title, playlist.tracks - t.id, playlist.color); onChanged() } }, leadingIcon = { Icon(Icons.Rounded.Delete, null) })
                    if (mine) DropdownMenuItem({ Text("Изменить: название, обложка, текст") }, { menu = false; editing = true }, leadingIcon = { Icon(Icons.Rounded.MusicNote, null) })
                    if (mine) DropdownMenuItem({ Text("Удалить трек") }, { menu = false; ask = true }, leadingIcon = { Icon(Icons.Rounded.Delete, null) })
                }
            }
        }
    }
    if (pick) PlaylistPickSheet(t) { pick = false }
    if (editing) TrackEditSheet(t) { editing = false; onChanged() }
    if (ask) AlertDialog({ ask = false }, title = { Text("Удалить «${t.title}»?") },
        confirmButton = { TextButton({ ask = false; scope.safe(toast) { Api.deleteTrack(t); toast("Трек удалён"); onChanged() } }) { Text("Удалить") } }, dismissButton = { TextButton({ ask = false }) { Text("Отмена") } })
}

/** Список треков: liked | stream | uploads | user/<uid> | pl/<id> */
@Composable
fun TrackListScreen(kind: String, arg: String, onOpenPlayer: () -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val me by Store.me.collectAsState()
    val ms by Music.state.collectAsState()
    val users by Store.users.collectAsState()
    var list by remember { mutableStateOf<List<Track>?>(null) }
    var pl by remember { mutableStateOf<Playlist?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var more by remember { mutableStateOf(true) }
    var rename by remember { mutableStateOf(false) }
    var askDel by remember { mutableStateOf(false) }
    LaunchedEffect(kind, arg, reload) {
        list = runCatching {
            when (kind) {
                "liked" -> Api.tracksMine(me?.tracks ?: emptyList())
                "stream" -> Media.streamPage(null)
                "user" -> Media.tracksOf(arg)
                else -> { val p = Media.playlist(arg); pl = p; if (p == null) emptyList() else Media.tracksByIds(p.tracks) }
            }
        }.getOrElse { toast(errText(it)); emptyList() }
        Store.need(list!!.map { it.ownerId } + listOfNotNull(pl?.ownerId))
    }
    val title = when (kind) {
        "liked" -> "Мои треки"; "stream" -> "Поток"
        "user" -> if (arg == Store.uid) "Мои загрузки" else "Музыка · ${users[arg]?.name ?: ""}"
        else -> pl?.title ?: "Плейлист"
    }
    val ownPl = kind == "pl" && pl?.ownerId == Store.uid
    BackScaffold(title, actions = {
        if (ownPl) {
            IconButton({ rename = true }) { Icon(Icons.Rounded.MusicNote, "Переименовать") }
            IconButton({ askDel = true }) { Icon(Icons.Rounded.Delete, "Удалить плейлист") }
        } else if (kind == "pl" && pl != null) TextButton({ scope.safe(toast) { val p = pl!!; Media.savePlaylist(null, p.title, p.tracks, p.color); toast("Сохранено в ваши плейлисты") } }) { Text("Сохранить себе") }
    }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            val l = list?.filter { users[it.ownerId]?.banned != true }
            if (!l.isNullOrEmpty()) item {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button({ playList(ctx, l, l[0]) }, Modifier.weight(1f).height(52.dp)) { Icon(Icons.Rounded.PlayArrow, null); Text(" Слушать") }
                    FilledTonalButton({ val sh = l.shuffled(); playList(ctx, sh, sh[0]) }, Modifier.weight(1f).height(52.dp)) { Icon(Icons.Rounded.Shuffle, null); Text(" Перемешать") }
                }
                Text("${l.size} ${plural(l.size, "трек", "трека", "треков")} · ${fmtDur(l.sumOf { it.duration })}", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            }
            val all = list
            when {
                all == null -> items(8) { SkeletonRow() }
                all.isEmpty() -> item { EmptyState(when (kind) { "liked" -> "Здесь будут ваши треки"; "pl" -> "Плейлист пуст"; else -> "Треков нет" },
                    if (kind == "liked") "Жмите ♡ у треков в Потоке — они появятся здесь" else "", "🎵") }
                else -> {
                    itemsIndexed(all, key = { _, t -> t.id }) { _, t -> TrackRow(t, all, ms, onOpenPlayer, pl) { reload++ } }
                    if (kind == "stream" && more && all.size >= 50) item {
                        LaunchedEffect(all.size) {
                            val next = runCatching { Media.streamPage(all.last().createdAt) }.getOrDefault(emptyList())
                            if (next.isEmpty()) more = false else { list = all + next.filter { n -> all.none { it.id == n.id } }; Store.need(next.map { it.ownerId }) }
                        }
                        Loading()
                    }
                }
            }
        }
    }
    if (rename && pl != null) NameDialog("Переименовать", pl!!.title, "Сохранить", { rename = false }) { t -> rename = false; scope.safe(toast) { val p = pl!!; Media.savePlaylist(p.id, t, p.tracks, p.color); reload++ } }
    if (askDel && pl != null) AlertDialog({ askDel = false }, title = { Text("Удалить плейлист?") },
        confirmButton = { TextButton({ askDel = false; scope.safe(toast) { Media.deletePlaylist(pl!!.id); nav.popBackStack() } }) { Text("Удалить") } },
        dismissButton = { TextButton({ askDel = false }) { Text("Отмена") } })
}

@Composable
fun PlaylistsScreen() {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<List<Playlist>?>(null) }
    var create by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(reload) { list = runCatching { Media.playlistsMine() }.getOrElse { toast(errText(it)); emptyList() } }
    BackScaffold("Плейлисты", fab = { androidx.compose.material3.ExtendedFloatingActionButton(onClick = { create = true }, icon = { Icon(Icons.AutoMirrored.Rounded.PlaylistAdd, null) }, text = { Text("Новый") }) }) { pad ->
        val l = list
        androidx.compose.foundation.lazy.grid.LazyVerticalGrid(androidx.compose.foundation.lazy.grid.GridCells.Adaptive(150.dp), Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding(), bottom = 100.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            when {
                l == null -> items(4) { Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(26.dp)).shimmer()) }
                l.isEmpty() -> item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) { EmptyState("Плейлистов пока нет", "Создайте свой — и добавляйте треки через «⋯»", "📀") }
                else -> items(l.size, key = { l[it].id }) { i -> PlaylistTile(l[i]) { nav.navigate("music/pl/${l[i].id}") } }
            }
        }
    }
    if (create) NameDialog("Новый плейлист", "", "Создать", { create = false }) { t -> create = false; scope.safe(toast) { val id = Media.savePlaylist(null, t, emptyList()); nav.navigate("music/pl/$id"); reload++ } }
}

/** Загрузка MP3: чтение тегов, окно правки, прогресс */
class Uploader(val launch: () -> Unit, val busy: Boolean, val progressItem: (LazyListScope) -> Unit, val dialog: @Composable () -> Unit)

@Composable
fun rememberUploader(onDone: () -> Unit): Uploader {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf<Upload.Draft?>(null) }
    var progress by remember { mutableStateOf<Float?>(null) }
    var upTitle by remember { mutableStateOf("") }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> if (uri != null) scope.safe(toast) { draft = Upload.read(ctx, uri) } }
    return Uploader({ pick.launch("audio/*") }, progress != null, { scope2 ->
        progress?.let { p ->
            scope2.item {
                Column(Modifier.fillMaxWidth().padding(16.dp, 8.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.secondaryContainer).padding(16.dp)) {
                    Text("Загружаем «$upTitle»", style = MaterialTheme.typography.titleSmall)
                    LinearProgressIndicator({ p }, Modifier.fillMaxWidth().padding(top = 10.dp))
                    Text("Не закрывайте приложение до конца загрузки", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
    }) {
        draft?.let { d ->
            var title by remember(d) { mutableStateOf(d.title) }
            var artist by remember(d) { mutableStateOf(d.artist) }
            AlertDialog(
                onDismissRequest = { draft = null },
                title = { Text("Новый трек") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(72.dp).clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                                if (d.cover.isNotEmpty()) DbImage(d.cover, Modifier.fillMaxSize()) else Icon(Icons.Rounded.MusicNote, null)
                            }
                            Text(if (d.cover.isNotEmpty()) "Обложка взята из файла" else "Обложки в файле нет — её можно добавить на сайте",
                                style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 12.dp))
                        }
                        OutlinedTextField(title, { title = it.take(120) }, label = { Text("Название") }, singleLine = true)
                        OutlinedTextField(artist, { artist = it.take(120) }, label = { Text("Исполнитель") }, singleLine = true)
                    }
                },
                confirmButton = {
                    TextButton(enabled = title.isNotBlank(), onClick = {
                        draft = null; upTitle = title.trim(); progress = 0f
                        scope.launch {
                            try { Upload.upload(d, title.trim(), artist.trim()) { progress = it }; toast("Трек загружен"); onDone() }
                            catch (e: Exception) { toast(errText(e)) } finally { progress = null }
                        }
                    }) { Text("Загрузить") }
                },
                dismissButton = { TextButton({ draft = null }) { Text("Отмена") } },
            )
        }
    }
}


/** «Микс дня» (как buildMix() на сайте): мои треки, самые слушаемые и треки тех же исполнителей из Потока, перемешаны от даты — весь день один и тот же */
fun dayMix(mine: List<Track>, top: List<Track>, stream: List<Track>, users: Map<String, ru.vsmske.app.data.User>): List<Track> {
    val artists = (mine + top).map { it.artist.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
    val pool = (top + mine + stream.filter { it.artist.trim().lowercase() in artists })
        .distinctBy { it.id }.filter { users[it.ownerId]?.banned != true }
    val day = java.text.SimpleDateFormat("yyyyMMdd", java.util.Locale.US).format(java.util.Date())
    return pool.shuffled(kotlin.random.Random((day + Store.uid).hashCode())).take(40)
}
