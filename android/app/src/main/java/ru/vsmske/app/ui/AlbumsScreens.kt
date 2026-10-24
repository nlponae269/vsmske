package ru.vsmske.app.ui

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.InsertDriveFile
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AddPhotoAlternate
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.VideoFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Album
import ru.vsmske.app.data.DiskFile
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Photo
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.ago
import ru.vsmske.app.data.plural

/* Фотоальбомы (сетка, просмотр с жестами) и ВС Диск (файлы до 10 МБ, видит только хозяин). */

@Composable
fun AlbumsScreen(uid: String) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val mine = uid == Store.uid
    var list by remember { mutableStateOf<List<Album>?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var create by remember { mutableStateOf(false) }
    val u = Store.users.collectAsState().value[uid]
    LaunchedEffect(uid, reload) { list = runCatching { Media.albumsOf(uid) }.getOrElse { toast(errText(it)); emptyList() } }
    BackScaffold(if (mine) "Мои альбомы" else "Альбомы · ${u?.name ?: ""}",
        fab = { if (mine) ExtendedFloatingActionButton(onClick = { create = true }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("Альбом") }) }) { pad ->
        val l = list
        LazyVerticalGrid(GridCells.Adaptive(160.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding(), bottom = 100.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            when {
                l == null -> items(6) { Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(24.dp)).shimmer()) }
                l.isEmpty() || u?.banned == true -> item(span = { GridItemSpan(maxLineSpan) }) {
                    EmptyState("Альбомов пока нет", if (mine) "Создайте альбом и добавьте в него фото" else "", "🖼️")
                }
                else -> items(l, key = { it.id }) { a ->
                    Column(Modifier.clickable { nav.navigate("album/${a.id}") }) {
                        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
                            if (a.cover.isNotEmpty()) DbImage(a.cover, Modifier.fillMaxSize())
                            else Icon(Icons.Rounded.PhotoLibrary, null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(48.dp))
                        }
                        Text(a.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp, start = 4.dp))
                        Text("${a.count} ${plural(a.count, "фото", "фото", "фото")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp))
                    }
                }
            }
        }
    }
    if (create) NameDialog("Новый альбом", "", "Создать", { create = false }) { t -> create = false; scope.safe(toast) { val id = Media.createAlbum(t); nav.navigate("album/$id"); reload++ } }
}

@Composable
fun NameDialog(title: String, initial: String, ok: String, onClose: () -> Unit, onOk: (String) -> Unit) {
    var name by remember { mutableStateOf(initial) }
    AlertDialog(onClose, title = { Text(title) },
        text = { OutlinedTextField(name, { name = it.take(80) }, singleLine = true, label = { Text("Название") }, modifier = Modifier.fillMaxWidth()) },
        confirmButton = { TextButton({ onOk(name.trim()) }, enabled = name.isNotBlank()) { Text(ok) } },
        dismissButton = { TextButton(onClose) { Text("Отмена") } })
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun AlbumScreen(id: String) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var album by remember { mutableStateOf<Album?>(null) }
    var photos by remember { mutableStateOf<List<Photo>?>(null) }
    var viewer by remember { mutableStateOf<Int?>(null) }
    var progress by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    var menu by remember { mutableStateOf(false) }
    var rename by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf(false) }
    DisposableEffect(id) {
        val a = Fire.db.collection("albums").document(id).addSnapshotListener { s, _ -> if (s != null && s.exists()) { album = Album.from(s); Store.need(listOf(album!!.ownerId)) } }
        val b = Media.photosQuery(id).addSnapshotListener { s, _ -> photos = s?.documents?.map(Photo::from)?.sortedBy { it.createdAt.takeIf { t -> t > 0 } ?: Long.MAX_VALUE } ?: return@addSnapshotListener }
        onDispose { a.remove(); b.remove() }
    }
    val a = album
    val mine = a?.ownerId == Store.uid
    val banned = a?.let { Store.users.collectAsState().value[it.ownerId]?.banned } == true
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(30)) { uris ->
        val al = album ?: return@rememberLauncherForActivityResult
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            var first = al.cover.isEmpty()
            uris.forEachIndexed { i, u ->
                progress = i to uris.size
                try { Media.addPhoto(ctx, al, u, first); first = false } catch (e: Exception) { toast(errText(e)) }
            }
            progress = null; toast("Фото добавлены")
        }
    }
    BackScaffold(a?.title ?: "Альбом", actions = {
        if (mine) Box {
            IconButton({ menu = true }) { Icon(Icons.Rounded.Edit, "Изменить") }
            DropdownMenu(menu, { menu = false }) {
                DropdownMenuItem({ Text("Переименовать") }, { menu = false; rename = true }, leadingIcon = { Icon(Icons.Rounded.Edit, null) })
                DropdownMenuItem({ Text("Удалить альбом") }, { menu = false; ask = true }, leadingIcon = { Icon(Icons.Rounded.Delete, null) })
            }
        }
    }, fab = { if (mine && progress == null) ExtendedFloatingActionButton(onClick = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        icon = { Icon(Icons.Rounded.AddPhotoAlternate, null) }, text = { Text("Фото") }) }) { pad ->
        val ps = photos
        LazyVerticalGrid(GridCells.Adaptive(110.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 4.dp, end = 4.dp, top = pad.calculateTopPadding(), bottom = 100.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            progress?.let { (i, n) -> item(span = { GridItemSpan(maxLineSpan) }) {
                Column(Modifier.padding(12.dp)) { Text("Загружаем фото ${i + 1} из $n…", style = MaterialTheme.typography.titleSmall); LinearProgressIndicator({ (i + 0.5f) / n }, Modifier.fillMaxWidth().padding(top = 8.dp)) }
            } }
            when {
                ps == null -> items(12) { Box(Modifier.aspectRatio(1f).shimmer()) }
                ps.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) { EmptyState("Пустой альбом", if (mine) "Добавьте фото кнопкой внизу" else "", "📷") }
                banned -> item(span = { GridItemSpan(maxLineSpan) }) { Locked("Фото недоступны", Modifier.fillMaxWidth().aspectRatio(2f)) }
                else -> items(ps.size, key = { ps[it].id }) { i ->
                    DbImage(ps[i].thumb, Modifier.aspectRatio(1f).clip(RoundedCornerShape(if (i == 0) 20.dp else 6.dp)).clickable { viewer = i })
                }
            }
        }
    }
    val ps = photos
    viewer?.let { start -> if (ps != null && a != null) PhotoViewer(ps, start, mine, onDelete = { p ->
        val rest = ps.filter { it.id != p.id }
        scope.safe(toast) { Media.deletePhoto(a, p, rest.firstOrNull()); toast("Фото удалено") }
        if (rest.isEmpty()) viewer = null
    }) { viewer = null } }
    if (rename && a != null) NameDialog("Переименовать", a.title, "Сохранить", { rename = false }) { t -> rename = false; scope.safe(toast) { Media.renameAlbum(a, t) } }
    if (ask && a != null) AlertDialog({ ask = false }, title = { Text("Удалить альбом «${a.title}»?") }, text = { Text("Все фото в нём тоже удалятся") },
        confirmButton = { TextButton({ ask = false; scope.safe(toast) { Media.deleteAlbum(a); toast("Альбом удалён"); nav.popBackStack() } }) { Text("Удалить") } },
        dismissButton = { TextButton({ ask = false }) { Text("Отмена") } })
}

/** Просмотр фото: листать вбок, щипок — увеличить, полное фото подгружается из photoFull */
@Composable
fun PhotoViewer(ps: List<Photo>, start: Int, mine: Boolean, onDelete: (Photo) -> Unit, onClose: () -> Unit) {
    val pager = rememberPagerState(start) { ps.size }
    Dialog(onClose, DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(pager, Modifier.fillMaxSize(), key = { ps[it].id }) { i ->
                val p = ps[i]
                var full by remember(p.id) { mutableStateOf("") }
                LaunchedEffect(p.id) { full = runCatching { Media.fullPhoto(p.id) }.getOrDefault("") }
                var scale by remember { mutableStateOf(1f) }
                var off by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }
                Box(Modifier.fillMaxSize().pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ -> scale = (scale * zoom).coerceIn(1f, 5f); off = if (scale > 1f) off + pan else androidx.compose.ui.geometry.Offset.Zero }
                }, contentAlignment = Alignment.Center) {
                    DbImage(full.ifEmpty { p.thumb }, Modifier.fillMaxWidth().graphicsLayer { scaleX = scale; scaleY = scale; translationX = off.x; translationY = off.y }, ContentScale.FillWidth)
                }
            }
            Row(Modifier.statusBarsPadding().padding(8.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClose, Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.4f))) { Icon(Icons.Rounded.Close, "Закрыть", tint = Color.White) }
                Text("${pager.currentPage + 1} из ${ps.size}", color = Color.White, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f).padding(start = 12.dp))
                if (mine) IconButton({ ps.getOrNull(pager.currentPage)?.let(onDelete) }, Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.4f))) {
                    Icon(Icons.Rounded.Delete, "Удалить фото", tint = Color.White)
                }
            }
        }
    }
}

/* ---------- ВС Диск ---------- */

private fun iconFor(f: DiskFile): Pair<ImageVector, Color> = when {
    f.type.startsWith("image/") -> Icons.Rounded.Image to Color(0xFF2B8BB5)
    f.type.startsWith("video/") -> Icons.Rounded.VideoFile to Color(0xFFD0462F)
    f.type.startsWith("audio/") -> Icons.Rounded.MusicNote to Color(0xFF6A47C9)
    f.type == "application/pdf" -> Icons.Rounded.PictureAsPdf to Color(0xFFC62828)
    f.type.startsWith("text/") || "document" in f.type || "word" in f.type -> Icons.Rounded.Description to Color(0xFF1F8A5B)
    else -> Icons.AutoMirrored.Rounded.InsertDriveFile to Color(0xFF8E95AB)
}

@Composable
fun DiskScreen() {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var files by remember { mutableStateOf<List<DiskFile>?>(null) }
    var progress by remember { mutableStateOf<Float?>(null) }
    var opening by remember { mutableStateOf<String?>(null) }
    var ask by remember { mutableStateOf<DiskFile?>(null) }
    DisposableEffect(Unit) {
        val r = Media.diskQuery().addSnapshotListener { s, e ->
            if (e != null) { toast(errText(e)); files = emptyList(); return@addSnapshotListener }
            files = s?.documents?.map(DiskFile::from)?.sortedByDescending { it.createdAt } ?: return@addSnapshotListener
        }
        onDispose { r.remove() }
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { u ->
        if (u != null) scope.launch {
            progress = 0f
            try { Media.uploadDisk(ctx, u) { progress = it }; toast("Файл загружен") } catch (e: Exception) { toast(errText(e)) }
            progress = null
        }
    }
    val total = files?.sumOf { it.size } ?: 0
    BackScaffold("Диск", fab = { if (progress == null) ExtendedFloatingActionButton(onClick = { pick.launch("*/*") }, icon = { Icon(Icons.Rounded.CloudUpload, null) }, text = { Text("Загрузить") }) }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 100.dp)) {
            item {
                Column(Modifier.padding(16.dp).fillMaxWidth().clip(RoundedCornerShape(28.dp))
                    .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.tertiaryContainer))).padding(20.dp)) {
                    Text("☁️  Ваше облако", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text("${files?.size ?: 0} ${plural(files?.size ?: 0, "файл", "файла", "файлов")} · ${fmtSize(total)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text("Файлы до 10 МБ. Видите только вы — и на сайте, и в приложении.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.75f), modifier = Modifier.padding(top = 6.dp))
                    progress?.let { LinearProgressIndicator({ it }, Modifier.fillMaxWidth().padding(top = 12.dp)) }
                }
            }
            val l = files
            when {
                l == null -> items(4) { SkeletonRow() }
                l.isEmpty() -> item { EmptyState("Диск пуст", "Загрузите документы, фото, архивы — что угодно", "📁") }
                else -> items(l, key = { it.id }) { f ->
                    val (ic, tint) = iconFor(f)
                    Row(Modifier.fillMaxWidth().clickable(enabled = opening == null && f.status != "uploading") {
                        opening = f.id
                        scope.launch {
                            try {
                                val file = Media.diskLocal(ctx, f)
                                val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", file)
                                ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW).setDataAndType(uri, f.type.ifEmpty { "*/*" }).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), f.name))
                            } catch (e: Exception) { toast(errText(e)) }
                            opening = null
                        }
                    }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(tint.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                            if (opening == f.id) ExpressiveLoader(28.dp, tint) else Icon(ic, null, tint = tint)
                        }
                        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                            Text(f.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(if (f.status == "uploading") "загружается…" else "${fmtSize(f.size)} · ${ago(f.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton({ ask = f }) { Icon(Icons.Rounded.Delete, "Удалить", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            }
        }
    }
    ask?.let { f -> AlertDialog({ ask = null }, title = { Text("Удалить «${f.name}»?") },
        confirmButton = { TextButton({ ask = null; scope.safe(toast) { ru.vsmske.app.data.Files.delete(f.id); toast("Файл удалён") } }) { Text("Удалить") } },
        dismissButton = { TextButton({ ask = null }) { Text("Отмена") } }) }
}

