package ru.vsmske.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.Track
import ru.vsmske.app.data.Video
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.data.plural
import ru.vsmske.app.music.ClipMedia
import ru.vsmske.app.music.FileSource

/** Подпись звука под клипом: «Звук из библиотеки: …» или «Оригинальный звук — имя» */
@Composable
fun soundLabel(v: Video): String {
    val ref = v.soundRef
    val users by Store.users.collectAsState()
    var s by remember(ref) { mutableStateOf(Media.soundCached(ref)) }
    LaunchedEffect(ref) { if (s == null && ref != "v:${v.id}") s = runCatching { Media.sound(ref) }.getOrNull() }
    val snd = s
    return when {
        ref.startsWith("t:") -> "Звук из библиотеки: " + (snd?.let { it.title + if (it.sub.isNotEmpty()) " — ${it.sub}" else "" } ?: "…")
        ref == "v:${v.id}" -> "Оригинальный звук — ${users[v.ownerId]?.name ?: ""}"
        else -> "Оригинальный звук — ${snd?.let { users[it.ownerId]?.name } ?: "…"}"
    }
}

/** Скачать в «Загрузки/ВС Клипы»: на Android 8–9 сначала спрашиваем разрешение на память */
@Composable
fun rememberDownloader(): ((suspend () -> String) -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var pending by remember { mutableStateOf<(suspend () -> String)?>(null) }
    fun run(job: suspend () -> String) { toast("Готовим файл… это может занять до минуты"); scope.safe(toast) { val where = job(); toast("Сохранено: $where") } }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val j = pending; pending = null
        if (ok && j != null) run(j) else if (!ok) toast("Разрешите доступ к памяти, чтобы сохранять файлы")
    }
    return { job ->
        if (Build.VERSION.SDK_INT < 29 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pending = job; ask.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        } else run(job)
    }
}

/** Скачать клип: с водяным знаком (значок «ВС Клипы» и @ник автора) и заставкой в конце */
suspend fun downloadClip(ctx: android.content.Context, v: Video): String {
    val f = withContext(Dispatchers.IO) { FileSource.local(ctx, v.fileId) }
    val owner = Store.user(v.ownerId) ?: runCatching { Store.fetchUser(v.ownerId) }.getOrNull()
    val nick = owner?.nick?.takeIf { it.isNotEmpty() && owner.banned != true } ?: ""
    val marked = ClipMedia.watermark(ctx, f, nick, ClipMedia.appIcon(ctx))
    return try { ClipMedia.saveToDownloads(ctx, marked, "ВС Клипы ${if (nick.isNotEmpty()) "@$nick " else ""}${v.id}.mp4", "video/mp4") } finally { marked.delete() }
}

/** Скачать звук: трек из библиотеки — как есть, оригинальный звук — вынимаем из клипа в .m4a */
suspend fun downloadSound(ctx: android.content.Context, ref: String): String {
    val s = Media.sound(ref) ?: error("Звук не найден — возможно, его удалили")
    val f = withContext(Dispatchers.IO) { FileSource.local(ctx, s.fileId) }
    return if (s.library) ClipMedia.saveToDownloads(ctx, f, "${s.title}${if (s.sub.isNotEmpty()) " — ${s.sub}" else ""}.${ClipMedia.ext(s.type)}", s.type)
    else {
        val name = Store.user(s.ownerId)?.name ?: "клип"
        val m4a = ClipMedia.extractAudio(ctx, f)
        try { ClipMedia.saveToDownloads(ctx, m4a, "Оригинальный звук — $name.m4a", "audio/mp4") } finally { m4a.delete() }
    }
}

/** «Поделиться» у клипа: ссылка, скачать видео, скачать звук, страница звука */
@Composable
fun ClipShareSheet(v: Video, onClose: () -> Unit) {
    val ctx = LocalContext.current
    val nav = LocalNav.current
    val download = rememberDownloader()
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var askDel by remember { mutableStateOf(false) }
    if (askDel) AlertDialog({ askDel = false }, title = { Text("Удалить клип?") }, text = { Text("Клип, его комментарии и файл удалятся насовсем.") },
        confirmButton = { TextButton({ askDel = false; onClose(); scope.safe(toast) { Media.deleteVideo(v); ClipsData.remove(v.id); toast("Клип удалён") } }) { Text("Удалить") } },
        dismissButton = { TextButton({ askDel = false }) { Text("Отмена") } })
    VsSheet(onClose) {
        Text("Поделиться", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            ShareTile(Icons.Rounded.Link, "Ссылка", ClipPurple) { onClose(); share(ctx, (v.title.takeIf { it != Media.CLIP_NO_TITLE && it.isNotBlank() } ?: "Клип в ВС Клипах") + "\n" + SITE + "clips/" + v.id) }
            ShareTile(Icons.Rounded.Download, "Скачать видео", Color(0xFF20B26B)) { onClose(); download { downloadClip(ctx, v) } }
            ShareTile(Icons.Rounded.MusicNote, "Скачать звук", ClipPink) { onClose(); download { downloadSound(ctx, v.soundRef) } }
            ShareTile(Icons.Rounded.Videocam, "Снять под звук", Color(0xFF3FA9F5)) { onClose(); nav.navigate("upload?sound=" + Uri.encode(v.soundRef)) }
        }
        if (v.ownerId == Store.uid || Store.iAmAdmin) TextButton({ askDel = true }, Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Text(if (v.ownerId == Store.uid) "Удалить клип" else "Удалить клип (админ)", color = MaterialTheme.colorScheme.error)
        }
        Text("Файлы сохраняются в «Загрузки/${ClipMedia.FOLDER}»", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 18.dp, bottom = 4.dp).align(Alignment.CenterHorizontally))
    }
}

@Composable
private fun ShareTile(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, bg: Color, onClick: () -> Unit) =
    Column(Modifier.width(80.dp).clip(MaterialTheme.shapes.medium).clickable(onClick = onClick).padding(vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        RoundIcon(icon, bg, 54.dp)
        Text(label, style = MaterialTheme.typography.labelMedium, maxLines = 2, modifier = Modifier.padding(top = 6.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }

/** Проигрывание звука для предпросмотра (общий плеер экрана) */
@Composable
fun rememberSoundPreview(): Pair<ExoPlayer, MutableState<String?>> {
    val player = rememberVideoPlayer()
    val playing = remember { mutableStateOf<String?>(null) }
    DisposableEffect(player) {
        val l = object : Player.Listener { override fun onIsPlayingChanged(isPlaying: Boolean) { if (!isPlaying && player.playbackState == Player.STATE_ENDED) playing.value = null } }
        player.addListener(l); onDispose { player.removeListener(l) }
    }
    return player to playing
}

fun ExoPlayer.toggleSound(key: String, fileId: String, playing: MutableState<String?>) {
    if (playing.value == key) { pause(); playing.value = null; return }
    if (ru.vsmske.app.music.Music.state.value.playing) ru.vsmske.app.music.Music.toggle()
    setMediaItem(MediaItem.fromUri("vsmske://file/$fileId")); repeatMode = Player.REPEAT_MODE_OFF; prepare(); play(); playing.value = key
}

/** Страница звука: обложка, «Слушать», «Поделиться», «Скачать», клипы под этот звук и «Снять под этот звук» */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClipsSoundScreen(ref: String) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val users by Store.users.collectAsState()
    var s by remember(ref) { mutableStateOf(Media.soundCached(ref)) }
    var gone by remember { mutableStateOf(false) }
    var clips by remember(ref) { mutableStateOf<List<Video>?>(null) }
    val (player, playing) = rememberSoundPreview()
    val download = rememberDownloader()
    LaunchedEffect(ref) {
        runCatching { Media.sound(ref) }.onSuccess { s = it; gone = it == null }.onFailure { toast(errText(it)) }
        clips = runCatching { Media.clipsWithSound(ref).filter { it.isClip() }.also { l -> Store.need(l.map { it.ownerId }) } }.getOrElse { emptyList() }
    }
    val snd = s
    val owner = snd?.let { users[it.ownerId] }
    val title = when { snd == null -> "…"; snd.library -> snd.title; else -> "Оригинальный звук — ${owner?.name ?: "…"}" }
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = { TopAppBar(title = {}, navigationIcon = { IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)) },
        bottomBar = {
            if (snd != null) Box(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).navigationBarsPadding().padding(16.dp, 10.dp)) {
                Row(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(12.dp)).background(Brush.horizontalGradient(listOf(ClipPink, ClipPurple)))
                    .clickable { player.pause(); nav.navigate("upload?sound=" + Uri.encode(ref)) }, horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Videocam, null, tint = Color.White)
                    Text("  Снять под этот звук", color = Color.White, style = MaterialTheme.typography.titleMedium)
                }
            }
        },
    ) { pad ->
        if (gone) { EmptyState("Звук недоступен", "Трек или клип со звуком удалили", "🔇", Modifier.padding(top = 160.dp)); return@Scaffold }
        LazyVerticalGrid(GridCells.Fixed(3), Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = pad.calculateBottomPadding() + 8.dp),
            horizontalArrangement = Arrangement.spacedBy(1.5.dp), verticalArrangement = Arrangement.spacedBy(1.5.dp)) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(Modifier.padding(horizontal = 18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(112.dp).clip(RoundedCornerShape(14.dp)).background(Brush.linearGradient(listOf(ClipPurple, ClipPink)))
                            .clickable(enabled = snd != null) { snd?.let { player.toggleSound(ref, it.fileId, playing) } }, contentAlignment = Alignment.Center) {
                            if (!snd?.cover.isNullOrEmpty()) DbImage(snd!!.cover, Modifier.fillMaxSize())
                            else if (snd != null && !snd.library) Avatar(owner, 112.dp, shape = RoundedCornerShape(14.dp), showOnline = false)
                            Box(Modifier.size(44.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                                Icon(if (playing.value == ref) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Слушать", tint = Color.White, modifier = Modifier.size(30.dp))
                            }
                        }
                        Column(Modifier.padding(start = 16.dp).weight(1f)) {
                            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, maxLines = 3, overflow = TextOverflow.Ellipsis)
                            if (snd?.library == true && snd.sub.isNotEmpty()) Text(snd.sub, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (snd != null && !snd.library && owner != null) Text(owner.name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.clickable { nav.openProfile(snd.ownerId) })
                            Text(buildString {
                                append(if (snd?.library == true) "Из библиотеки ВС Музыки" else "Оригинальный звук")
                                clips?.let { append(" · ${it.size} ${plural(it.size, "клип", "клипа", "клипов")}") }
                                if ((snd?.duration ?: 0.0) > 0) append(" · ${fmtDur(snd!!.duration)}")
                            }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                    Row(Modifier.padding(top = 16.dp, bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        GrayButton("Поделиться", Modifier.weight(1f)) {
                            val link = if (ref.startsWith("t:")) SITE + "music/t_" + ref.drop(2) else SITE + "clips/" + ref.drop(2)
                            share(ctx, "Звук «$title» — снимите клип под него в ВС Клипах\n$link")
                        }
                        GrayButton("Скачать", Modifier.weight(1f)) { download { downloadSound(ctx, ref) } }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
            val l = clips
            when {
                l == null -> item(span = { GridItemSpan(maxLineSpan) }) { Loading() }
                l.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) { EmptyState("Под этот звук ещё не снимали", "Будьте первым — кнопка внизу", "🎵") }
                else -> itemsIndexed(l, key = { _, v -> v.id }) { i, v -> GridClip(v) { player.pause(); playing.value = null; ClipsData.watch.clear(); ClipsData.watch.addAll(l); nav.navigate("watch/$i") } }
            }
        }
    }
}

/** Выбор звука из библиотеки (треки ВС Музыки): поиск, прослушивание, «Выбрать» */
@Composable
fun SoundPickerSheet(onPick: (Media.Sound?) -> Unit, onClose: () -> Unit) {
    val toast = LocalToast.current
    var q by remember { mutableStateOf("") }
    var all by remember { mutableStateOf<List<Track>?>(null) }
    val (player, playing) = rememberSoundPreview()
    LaunchedEffect(Unit) {
        all = runCatching {
            val mine = Api.tracksMine(Store.me.value?.tracks ?: emptyList())
            (mine + Media.streamPage(null, 100)).distinctBy { it.id }
        }.getOrElse { toast(errText(it)); emptyList() }
    }
    val shown = remember(q, all) {
        val t = q.trim().lowercase()
        all.orEmpty().filter { t.isEmpty() || it.title.lowercase().contains(t) || it.artist.lowercase().contains(t) }
    }
    VsSheet({ player.pause(); onClose() }) {
        Text("Звуки", style = MaterialTheme.typography.titleLarge)
        Text("Библиотека — треки ВС Музыки", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(q, { q = it.take(60) }, Modifier.fillMaxWidth().padding(vertical = 10.dp), placeholder = { Text("Название или исполнитель") }, singleLine = true,
            leadingIcon = { Icon(Icons.Rounded.Search, null) }, shape = CircleShape)
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 460.dp)) {
            item {
                ListItem(headlineContent = { Text("Без звука из библиотеки") }, supportingContent = { Text("Оригинальный звук — то, что слышит микрофон") },
                    leadingContent = { RoundIcon(Icons.Rounded.MusicNote, MaterialTheme.colorScheme.outline, 48.dp) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent), modifier = Modifier.clickable { player.pause(); onPick(null) })
            }
            when {
                all == null -> item { Loading() }
                shown.isEmpty() -> item { EmptyState("Ничего не нашлось", if (q.isBlank()) "В библиотеке пока нет треков" else "Попробуйте по-другому", "🎵") }
                else -> items(shown, key = { it.id }) { t ->
                    val key = "t:" + t.id
                    ListItem(
                        leadingContent = {
                            Box(Modifier.size(48.dp).clip(RoundedCornerShape(10.dp)).background(Brush.linearGradient(listOf(ClipPurple, ClipPink))).clickable { player.toggleSound(key, t.fileId, playing) },
                                contentAlignment = Alignment.Center) {
                                if (t.cover.isNotEmpty()) DbImage(t.cover, Modifier.fillMaxSize())
                                Icon(if (playing.value == key) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Слушать", tint = Color.White)
                            }
                        },
                        headlineContent = { Text(t.title.ifEmpty { "Без названия" }, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        supportingContent = { Text(listOf(t.artist, if (t.duration > 0) fmtDur(t.duration) else "").filter { it.isNotEmpty() }.joinToString(" · "), maxLines = 1) },
                        trailingContent = {
                            Box(Modifier.clip(RoundedCornerShape(8.dp)).background(ClipPink).clickable {
                                player.pause(); onPick(Media.Sound(key, t.title, t.artist, t.cover, t.fileId, t.type, true, t.ownerId, t.id, t.duration))
                            }.padding(horizontal = 12.dp, vertical = 6.dp)) { Text("Выбрать", color = Color.White, style = MaterialTheme.typography.labelLarge) }
                        },
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    )
                }
            }
        }
    }
}
