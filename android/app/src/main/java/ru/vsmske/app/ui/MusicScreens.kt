package ru.vsmske.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.Upload
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.Track
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.music.Music
import ru.vsmske.app.music.Upload

@Composable
fun TrackCover(t: Track?, size: Dp, radius: Dp = 12.dp) {
    val cs = MaterialTheme.colorScheme
    val hidden = t != null && Store.user(t.ownerId)?.banned == true
    Box(Modifier.size(size).clip(RoundedCornerShape(radius)).background(cs.primaryContainer), contentAlignment = Alignment.Center) {
        when {
            hidden -> Icon(Icons.Rounded.Lock, null, tint = cs.onPrimaryContainer, modifier = Modifier.size(size * 0.4f))
            !t?.cover.isNullOrEmpty() -> DbImage(t!!.cover, Modifier.fillMaxSize())
            else -> Icon(Icons.Rounded.MusicNote, null, tint = cs.onPrimaryContainer, modifier = Modifier.size(size * 0.45f))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MusicScreen(onOpenPlayer: () -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val me by Store.me.collectAsState()
    val users by Store.users.collectAsState()
    val ms by Music.state.collectAsState()
    var tab by rememberSaveable { mutableStateOf(0) }
    var list by remember { mutableStateOf<List<Track>?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var draft by remember { mutableStateOf<Upload.Draft?>(null) }
    var progress by remember { mutableStateOf<Float?>(null) }
    var upTitle by remember { mutableStateOf("") }
    LaunchedEffect(tab, reload) {
        list = null
        list = runCatching { if (tab == 1) Api.tracksAll() else Api.tracksMine(me?.tracks ?: emptyList()) }
            .onSuccess { l -> Store.need(l.map { it.ownerId }) }.getOrElse { toast(errText(it)); emptyList() }
    }
    LaunchedEffect(ms.error) { ms.error?.let { toast(it); Music.clearError() } }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.safe(toast) { draft = Upload.read(ctx, uri) }
    }
    val playable = list?.filter { users[it.ownerId]?.banned != true } ?: emptyList()

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = { TopAppBar(title = { Text("Музыка") }, actions = { IconButton({ pick.launch("audio/*") }, enabled = progress == null) { Icon(Icons.Rounded.Upload, "Загрузить трек") } }) },
    ) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            item {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                    listOf("Мои треки", "Все треки").forEachIndexed { i, l -> SegmentedButton(tab == i, { tab = i }, SegmentedButtonDefaults.itemShape(i, 2)) { Text(l) } }
                }
            }
            progress?.let { p ->
                item {
                    Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                        Column(Modifier.padding(16.dp)) {
                            Text("Загружаем «$upTitle»", style = MaterialTheme.typography.titleSmall)
                            LinearProgressIndicator({ p }, Modifier.fillMaxWidth().padding(top = 10.dp))
                            Text("Не закрывайте приложение до конца загрузки", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
                        }
                    }
                }
            }
            if (playable.size > 1) item {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton({ Music.play(ctx, playable, 0) }) { Icon(Icons.Rounded.PlayArrow, null); Text(" Слушать") }
                    FilledTonalButton({ Music.play(ctx, playable.shuffled(), 0) }) { Icon(Icons.Rounded.Shuffle, null); Text(" Перемешать") }
                }
            }
            val l = list
            when {
                l == null -> item { Loading() }
                l.isEmpty() -> item { EmptyState(if (tab == 0) "Здесь будут ваши треки" else "Пока никто ничего не загрузил", if (tab == 0) "Загрузите MP3 кнопкой вверху или добавьте ♡ чужие треки из «Все треки»" else "") }
                else -> itemsIndexed(l, key = { _, t -> t.id }) { _, t ->
                    val cur = ms.track?.id == t.id
                    TrackRow(t, cur, cur && ms.playing, saved = t.id in (me?.tracks ?: emptyList()), hidden = users[t.ownerId]?.banned == true,
                        onPlay = { if (cur) onOpenPlayer() else Music.play(ctx, playable, playable.indexOfFirst { it.id == t.id }.coerceAtLeast(0)) },
                        onSave = { scope.safe(toast) { Api.toggleSaved(t) } },
                        onDelete = { scope.safe(toast) { Api.deleteTrack(t); toast("Трек удалён"); reload++ } })
                }
            }
        }
    }

    draft?.let { d ->
        var title by remember(d) { mutableStateOf(d.title) }
        var artist by remember(d) { mutableStateOf(d.artist) }
        AlertDialog(
            onDismissRequest = { draft = null },
            title = { Text("Новый трек") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(72.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
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
                        try { Upload.upload(d, title.trim(), artist.trim()) { progress = it }; toast("Трек загружен"); tab = 0; reload++ }
                        catch (e: Exception) { toast(errText(e)) } finally { progress = null }
                    }
                }) { Text("Загрузить") }
            },
            dismissButton = { TextButton({ draft = null }) { Text("Отмена") } },
        )
    }
}

@Composable
private fun TrackRow(t: Track, current: Boolean, playing: Boolean, saved: Boolean, hidden: Boolean, onPlay: () -> Unit, onSave: () -> Unit, onDelete: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    val mine = t.ownerId == Store.uid
    var menu by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf(false) }
    ListItem(
        headlineContent = { Text(if (hidden) "Трек недоступен" else t.title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (current) cs.primary else cs.onSurface) },
        supportingContent = { Text(if (hidden) "Deleted Account" else t.artist.ifEmpty { "Неизвестный исполнитель" }, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent = {
            Box {
                TrackCover(t, 52.dp)
                if (current) Box(Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)).background(Color(0x66000000)), contentAlignment = Alignment.Center) {
                    Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, tint = Color.White)
                }
            }
        },
        trailingContent = {
            if (!hidden) Row(verticalAlignment = Alignment.CenterVertically) {
                Text(fmtDur(t.duration), style = MaterialTheme.typography.labelMedium, color = cs.onSurfaceVariant)
                if (!mine) IconButton(onSave) { Icon(if (saved) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, if (saved) "Убрать из моих" else "В мои треки", tint = if (saved) cs.primary else cs.onSurfaceVariant) }
                if (mine) Box {
                    IconButton({ menu = true }) { Icon(Icons.Rounded.MoreVert, "Ещё") }
                    DropdownMenu(menu, { menu = false }) { DropdownMenuItem({ Text("Удалить трек") }, leadingIcon = { Icon(Icons.Rounded.Delete, null) }, onClick = { menu = false; ask = true }) }
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = if (current) cs.secondaryContainer.copy(alpha = 0.6f) else Color.Transparent),
        modifier = Modifier.clickable(enabled = !hidden, onClick = onPlay),
    )
    if (ask) AlertDialog({ ask = false }, title = { Text("Удалить «${t.title}»?") },
        confirmButton = { TextButton({ ask = false; onDelete() }) { Text("Удалить") } }, dismissButton = { TextButton({ ask = false }) { Text("Отмена") } })
}
