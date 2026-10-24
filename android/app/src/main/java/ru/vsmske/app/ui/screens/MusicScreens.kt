package ru.vsmske.app.ui.screens

import android.graphics.Bitmap
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Lyrics
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.Upload
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Fb
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Session
import ru.vsmske.app.data.Track
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.data.parseLyrics
import ru.vsmske.app.music.MusicPlayer
import ru.vsmske.app.music.TrackUpload
import ru.vsmske.app.ui.Card
import ru.vsmske.app.ui.DbImage
import ru.vsmske.app.ui.Empty
import ru.vsmske.app.ui.Field
import ru.vsmske.app.ui.GradButton
import ru.vsmske.app.ui.IconBtn
import ru.vsmske.app.ui.Loading
import ru.vsmske.app.ui.LocalPad
import ru.vsmske.app.ui.LocalToast
import ru.vsmske.app.ui.ScreenTitle
import ru.vsmske.app.ui.Tabs
import ru.vsmske.app.ui.Vs
import ru.vsmske.app.ui.errText
import ru.vsmske.app.ui.glassCard
import ru.vsmske.app.ui.safe

@Composable
fun Cover(t: Track?, size: androidx.compose.ui.unit.Dp, radius: androidx.compose.ui.unit.Dp = 12.dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(radius)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
        if (!t?.cover.isNullOrEmpty()) DbImage(t!!.cover, Modifier.fillMaxSize())
        else Icon(Icons.Rounded.MusicNote, null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(size * 0.45f))
    }
}

@Composable
fun MusicScreen(onOpenPlayer: () -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val me by Session.me.collectAsState()
    val ps by MusicPlayer.state.collectAsState()
    var tab by rememberSaveable { mutableStateOf("my") }
    var list by remember { mutableStateOf<List<Track>?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var draft by remember { mutableStateOf<TrackUpload.Draft?>(null) }
    var progress by remember { mutableStateOf<Float?>(null) }
    var uploadTitle by remember { mutableStateOf("") }

    LaunchedEffect(tab, reload) {
        list = null
        list = runCatching { if (tab == "all") Repo.tracksAll() else Repo.tracksOf(Fb.uid, me?.tracks ?: emptyList()) }
            .onFailure { toast(errText(it)) }.getOrElse { emptyList() }
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.safe(toast) { draft = TrackUpload.read(ctx, uri) }
    }
    LaunchedEffect(ps.error) { ps.error?.let { toast(it); MusicPlayer.clearError() } }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPad(LocalPad.current), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            ScreenTitle("Музыка") {
                GradButton("Загрузить", icon = Icons.Rounded.Upload, enabled = progress == null) { pick.launch("audio/*") }
            }
        }
        progress?.let { p ->
            item {
                Card {
                    Text("Загружаем «$uploadTitle»", style = MaterialTheme.typography.titleSmall)
                    LinearProgressIndicator({ p }, Modifier.fillMaxWidth().padding(top = 10.dp))
                    Text("Не закрывайте приложение до конца загрузки", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
        item { Tabs(listOf("my" to "Мои треки", "all" to "Все треки"), tab, { tab = it }) }
        val l = list
        when {
            l == null -> item { Loading() }
            l.isEmpty() -> item { Empty(if (tab == "my") "Здесь будут ваши треки" else "Пока никто ничего не загрузил", if (tab == "my") "Загрузите mp3 или добавьте чужие треки из «Все треки»" else "") }
            else -> itemsIndexed(l, key = { _, t -> t.id }) { i, t ->
                val playing = ps.track?.id == t.id
                TrackRow(t, playing, playing && ps.playing, saved = t.id in (me?.tracks ?: emptyList()),
                    onPlay = { if (playing) onOpenPlayer() else MusicPlayer.play(ctx, l, i) },
                    onSave = { s -> scope.safe(toast) { Repo.toggleSaved(t, s); toast(if (s) "Убрано из ваших треков" else "Добавлено в ваши треки") } },
                    onDelete = { scope.safe(toast) { Repo.deleteTrack(t); toast("Трек удалён"); reload++ } })
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
                            if (d.cover.isNotEmpty()) DbImage(d.cover, Modifier.fillMaxSize()) else Icon(Icons.Rounded.MusicNote, null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                        Text(
                            if (d.cover.isNotEmpty()) "Обложка взята из файла" else "Обложки в файле нет — её можно добавить потом на сайте",
                            style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 12.dp),
                        )
                    }
                    Field(title, { title = it.take(120) }, "Название")
                    Field(artist, { artist = it.take(120) }, "Исполнитель")
                }
            },
            confirmButton = {
                TextButton(enabled = title.isNotBlank(), onClick = {
                    draft = null; uploadTitle = title.trim(); progress = 0f
                    scope.launch {
                        try { TrackUpload.upload(d, title.trim(), artist.trim()) { progress = it }; toast("Трек загружен"); tab = "my"; reload++ }
                        catch (e: Exception) { toast(errText(e)) }
                        finally { progress = null }
                    }
                }) { Text("Загрузить") }
            },
            dismissButton = { TextButton({ draft = null }) { Text("Отмена") } },
        )
    }
}

@Composable
private fun TrackRow(t: Track, current: Boolean, playing: Boolean, saved: Boolean, onPlay: () -> Unit, onSave: (Boolean) -> Unit, onDelete: () -> Unit) {
    val me = Fb.uid
    val cs = MaterialTheme.colorScheme
    var menu by remember { mutableStateOf(false) }
    val bg by animateColorAsState(if (current) cs.secondaryContainer else Color.Transparent, label = "row")
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(bg).clickable(onClick = onPlay).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Cover(t, 52.dp)
            if (current) Box(Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)).background(Color(0x66000000)), contentAlignment = Alignment.Center) {
                Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, tint = Color.White)
            }
        }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (current) cs.onSecondaryContainer else cs.onSurface)
            Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(fmtDur(t.duration), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
        Box {
            IconBtn(Icons.Rounded.MoreVert, "Ещё") { menu = true }
            DropdownMenu(menu, { menu = false }) {
                if (t.ownerId != me) DropdownMenuItem(
                    { Text(if (saved) "Убрать из моих треков" else "Добавить к себе") },
                    leadingIcon = { Icon(if (saved) Icons.Rounded.Check else Icons.Rounded.Add, null) }, onClick = { menu = false; onSave(saved) },
                )
                if (t.ownerId == me) DropdownMenuItem({ Text("Удалить трек") }, leadingIcon = { Icon(Icons.Rounded.Delete, null) }, onClick = { menu = false; onDelete() })
            }
        }
    }
}
