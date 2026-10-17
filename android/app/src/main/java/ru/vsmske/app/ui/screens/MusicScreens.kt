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
    Box(Modifier.size(size).clip(RoundedCornerShape(radius)).background(Vs.grad), contentAlignment = Alignment.Center) {
        if (!t?.cover.isNullOrEmpty()) DbImage(t!!.cover, Modifier.fillMaxSize())
        else Icon(Icons.Rounded.MusicNote, null, tint = Color.White, modifier = Modifier.size(size * 0.45f))
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
                    LinearProgressIndicator({ p }, Modifier.fillMaxWidth().padding(top = 10.dp).clip(CircleShape), color = Vs.accent, trackColor = Color(0x22FFFFFF))
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
            onDismissRequest = { draft = null }, containerColor = Color(0xFF1E1236),
            title = { Text("Новый трек") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(72.dp).clip(RoundedCornerShape(16.dp)).background(Vs.grad), contentAlignment = Alignment.Center) {
                            if (d.cover.isNotEmpty()) DbImage(d.cover, Modifier.fillMaxSize()) else Icon(Icons.Rounded.MusicNote, null, tint = Color.White)
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
    var menu by remember { mutableStateOf(false) }
    val bg by animateColorAsState(if (current) Color(0x33A78BFA) else Color.Transparent, label = "row")
    Row(
        Modifier.fillMaxWidth().glassCard(18.dp).background(bg).clickable(onClick = onPlay).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Cover(t, 52.dp)
            if (current) Box(Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)).background(Color(0x88000000)), contentAlignment = Alignment.Center) {
                Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, tint = Color.White)
            }
        }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (current) Vs.accent else Vs.fg)
            Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(fmtDur(t.duration), style = MaterialTheme.typography.bodySmall)
        Box {
            IconBtn(Icons.Rounded.MoreVert, "Ещё", tint = Vs.muted) { menu = true }
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

/** Цвета фона плеера — из обложки (как coverPalette() на сайте) */
private fun palette(b: Bitmap?): List<Color> {
    if (b == null) return listOf(Vs.p1, Vs.p3, Vs.p4)
    val s = Bitmap.createScaledBitmap(b.copy(Bitmap.Config.ARGB_8888, false), 6, 6, true)
    val px = (0 until 36).map { s.getPixel(it % 6, it / 6) }.map { Color(it) }
    val vivid = px.sortedByDescending { c -> maxOf(c.red, c.green, c.blue) - minOf(c.red, c.green, c.blue) + (c.red + c.green + c.blue) / 6 }
    return listOf(vivid[0], vivid[min(5, vivid.size - 1)], vivid[min(12, vivid.size - 1)])
}

private fun min(a: Int, b: Int) = if (a < b) a else b

@Composable
fun FullPlayer(onClose: () -> Unit) {
    val s by MusicPlayer.state.collectAsState()
    val t = s.track ?: return
    var showLyrics by rememberSaveable { mutableStateOf(false) }
    var showQueue by rememberSaveable { mutableStateOf(false) }
    var colors by remember { mutableStateOf(listOf(Vs.p1, Vs.p3, Vs.p4)) }
    LaunchedEffect(t.cover) { colors = palette(Images.decode(t.cover)?.asAndroidBitmap()) }
    val c0 by animateColorAsState(colors[0], tween(800), label = "c0")
    val c1 by animateColorAsState(colors[1], tween(800), label = "c1")
    val scale by animateFloatAsState(if (s.playing) 1f else 0.86f, tween(400), label = "cover")
    var drag by remember { mutableStateOf<Float?>(null) }

    Box(Modifier.fillMaxSize().background(Color(0xFF0A0612)).clickable(enabled = false) {}) {
        // размытая обложка и пятна цвета на фоне
        if (t.cover.isNotEmpty() && Build.VERSION.SDK_INT >= 31) DbImage(t.cover, Modifier.fillMaxSize().blur(80.dp).graphicsLayer { alpha = 0.55f; scaleX = 1.3f; scaleY = 1.3f })
        Box(Modifier.fillMaxSize().background(Brush.radialGradient(listOf(c0.copy(alpha = 0.55f), Color.Transparent), radius = 1400f)))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x33000000), c1.copy(alpha = 0.25f), Color(0xCC0A0612)))))

        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconBtn(Icons.Rounded.KeyboardArrowDown, "Свернуть", tint = Color.White, onClick = onClose)
                Text(if (showQueue) "Очередь" else if (showLyrics) "Текст песни" else "Сейчас играет", style = MaterialTheme.typography.labelLarge, color = Color(0xCCFFFFFF), textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                Spacer(Modifier.size(40.dp))
            }
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                when {
                    showQueue -> QueueList(s)
                    showLyrics && t.lyrics.isNotEmpty() -> LyricsView(t.lyrics, s.position / 1000.0)
                    else -> Box(Modifier.widthIn(max = 420.dp).fillMaxWidth().aspectRatio(1f).graphicsLayer { scaleX = scale; scaleY = scale }) {
                        Box(Modifier.fillMaxSize().clip(RoundedCornerShape(28.dp)).background(Vs.grad), contentAlignment = Alignment.Center) {
                            if (t.cover.isNotEmpty()) DbImage(t.cover, Modifier.fillMaxSize())
                            else Icon(Icons.Rounded.MusicNote, null, tint = Color.White, modifier = Modifier.size(120.dp))
                        }
                    }
                }
            }
            Column(Modifier.fillMaxWidth().padding(top = 18.dp)) {
                Text(t.title, style = MaterialTheme.typography.headlineSmall, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodyLarge, color = Color(0xB3FFFFFF), maxLines = 1)
            }
            val dur = s.duration.coerceAtLeast(1)
            Slider(
                value = drag ?: (s.position.toFloat() / dur).coerceIn(0f, 1f),
                onValueChange = { drag = it }, onValueChangeFinished = { drag?.let { MusicPlayer.seek((it * dur).toLong()) }; drag = null },
                colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color.White, inactiveTrackColor = Color(0x40FFFFFF)),
                modifier = Modifier.padding(top = 8.dp),
            )
            Row(Modifier.fillMaxWidth()) {
                Text(fmtDur((drag?.times(dur) ?: s.position.toFloat()) / 1000.0), style = MaterialTheme.typography.labelSmall, color = Color(0xB3FFFFFF))
                Spacer(Modifier.weight(1f))
                Text(fmtDur(dur / 1000.0), style = MaterialTheme.typography.labelSmall, color = Color(0xB3FFFFFF))
            }
            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                IconBtn(Icons.Rounded.Shuffle, "Перемешать", tint = if (s.shuffle) Vs.accent else Color(0x99FFFFFF)) { MusicPlayer.toggleShuffle() }
                IconBtn(Icons.Rounded.SkipPrevious, "Предыдущий", tint = Color.White, size = 56.dp) { MusicPlayer.prev() }
                Box(Modifier.size(78.dp).clip(CircleShape).background(Color.White).clickable { MusicPlayer.toggle() }, contentAlignment = Alignment.Center) {
                    if (s.loading) CircularProgressIndicator(Modifier.size(30.dp), color = Color(0xFF12081F), strokeWidth = 3.dp)
                    else Icon(if (s.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Играть", tint = Color(0xFF12081F), modifier = Modifier.size(42.dp))
                }
                IconBtn(Icons.Rounded.SkipNext, "Следующий", tint = Color.White, size = 56.dp) { MusicPlayer.next() }
                IconBtn(if (s.repeat == Player.REPEAT_MODE_ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat, "Повтор",
                    tint = if (s.repeat != Player.REPEAT_MODE_OFF) Vs.accent else Color(0x99FFFFFF)) { MusicPlayer.cycleRepeat() }
            }
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                IconBtn(Icons.Rounded.Lyrics, "Текст песни", tint = if (showLyrics) Vs.accent else if (t.lyrics.isEmpty()) Color(0x44FFFFFF) else Color(0xCCFFFFFF)) {
                    if (t.lyrics.isNotEmpty()) { showLyrics = !showLyrics; showQueue = false }
                }
                IconBtn(Icons.AutoMirrored.Rounded.QueueMusic, "Очередь", tint = if (showQueue) Vs.accent else Color(0xCCFFFFFF)) { showQueue = !showQueue; showLyrics = false }
            }
        }
    }
}

@Composable
private fun LyricsView(text: String, pos: Double) {
    val (timed, lines) = remember(text) { parseLyrics(text) }
    val state = rememberLazyListState()
    val cur = if (timed) lines.indexOfLast { it.t <= pos + 0.25 } else -1
    LaunchedEffect(cur) { if (cur >= 0) state.animateScrollToItem(maxOf(0, cur - 2)) }
    LazyColumn(Modifier.fillMaxSize(), state = state, contentPadding = PaddingValues(vertical = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        itemsIndexed(lines) { i, l ->
            val on = i == cur
            val a by animateFloatAsState(if (!timed || on) 1f else if (i < cur) 0.35f else 0.5f, label = "ly")
            Text(
                l.text.ifEmpty { "♪" }, color = Color.White.copy(alpha = a),
                fontSize = if (timed) 26.sp else 19.sp, lineHeight = if (timed) 32.sp else 26.sp,
                fontWeight = if (timed) FontWeight.Bold else FontWeight.Medium,
                modifier = Modifier.graphicsLayer { val k = if (on) 1.04f else 1f; scaleX = k; scaleY = k; transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0.5f) }
                    .then(if (timed && l.t >= 0) Modifier.clickable { MusicPlayer.seek((l.t * 1000).toLong()) } else Modifier),
            )
        }
    }
}

@Composable
private fun QueueList(s: MusicPlayer.State) {
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        itemsIndexed(s.queue) { i, t ->
            val on = i == s.index
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (on) Color(0x33FFFFFF) else Color.Transparent)
                    .clickable { MusicPlayer.jump(i) }.padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Cover(t, 44.dp, 10.dp)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(t.title, color = if (on) Vs.accent else Color.White, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(t.artist, color = Color(0x99FFFFFF), style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
                Text(fmtDur(t.duration), color = Color(0x99FFFFFF), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

