package ru.vsmske.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.Story
import ru.vsmske.app.data.User
import ru.vsmske.app.data.ago
import ru.vsmske.app.data.plural

/* Истории на 24 часа: ряд кружков в ленте (непросмотренные — в цветном кольце), просмотр на весь экран, своя история из галереи. */

/** Ряд историй: «Ваша история» + люди с историями (сначала непросмотренные) */
@Composable
fun StoriesRow(stories: List<Story>, onChanged: () -> Unit) {
    val users by Store.users.collectAsState()
    val me = Store.uid
    val groups = stories.filter { users[it.ownerId]?.banned != true }.groupBy { it.ownerId }
    val order = groups.keys.sortedWith(compareBy<String> { it != me }.thenBy { k -> groups[k]!!.all { me in it.views || it.ownerId == me } }.thenByDescending { k -> groups[k]!!.maxOf { it.createdAt } })
    var open by remember { mutableStateOf<String?>(null) }
    var add by remember { mutableStateOf<Uri?>(null) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> if (u != null) add = u }
    LazyRow(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        if (me !in groups) item { StoryBubble(users[me], "Ваша история", seen = true, plus = true) { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) } }
        items(order, key = { it }) { uid ->
            val seen = groups[uid]!!.all { me in it.views || it.ownerId == me }
            StoryBubble(users[uid], if (uid == me) "Ваша история" else users[uid]?.name?.substringBefore(' ') ?: "…", seen, plus = false) { open = uid }
        }
    }
    open?.let { start ->
        StoryViewer(order.map { groups[it]!! }, order.indexOf(start).coerceAtLeast(0), onAdd = { open = null; pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) { open = null; onChanged() }
    }
    add?.let { u -> StoryComposer(u) { posted -> add = null; if (posted) onChanged() } }
}

@Composable
private fun StoryBubble(u: User?, label: String, seen: Boolean, plus: Boolean, onClick: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    Column(Modifier.width(76.dp).clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(74.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.size(74.dp).clip(CircleShape).then(
                if (seen) Modifier.border(2.dp, cs.outlineVariant, CircleShape)
                else Modifier.background(Brush.sweepGradient(listOf(cs.primary, cs.tertiary, Color(0xFFFF8A65), cs.primary)))))
            Box(Modifier.size(68.dp).clip(CircleShape).background(cs.surface))
            Avatar(u, 62.dp, showOnline = false)
            if (plus) Box(Modifier.align(Alignment.BottomEnd).size(24.dp).clip(CircleShape).background(cs.primary).border(2.dp, cs.surface, CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.Add, null, tint = cs.onPrimary, modifier = Modifier.size(16.dp))
            }
        }
        Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
    }
}

/** Просмотр: полоски сверху, 6 секунд на историю, тап слева/справа — назад/вперёд, удержание — пауза, свайп вниз — закрыть */
@Composable
fun StoryViewer(groups: List<List<Story>>, startGroup: Int, onAdd: () -> Unit, onClose: () -> Unit) {
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var g by remember { mutableIntStateOf(startGroup) }
    var i by remember { mutableIntStateOf(groups.getOrNull(startGroup)?.indexOfFirst { Store.uid !in it.views }?.coerceAtLeast(0) ?: 0) }
    var paused by remember { mutableStateOf(false) }
    var reply by remember { mutableStateOf("") }
    var dragY by remember { mutableStateOf(0f) }
    val prog = remember { Animatable(0f) }
    val list = groups.getOrNull(g) ?: run { onClose(); return }
    val s = list.getOrNull(i) ?: run { onClose(); return }
    val owner = Store.users.collectAsState().value[s.ownerId]
    val mine = s.ownerId == Store.uid
    fun next() { if (i < list.size - 1) i++ else if (g < groups.size - 1) { g++; i = 0 } else onClose() }
    fun prev() { if (i > 0) i-- else if (g > 0) { g--; i = 0 } }
    LaunchedEffect(s.id) { Media.viewStory(s); prog.snapTo(0f) }
    LaunchedEffect(s.id, paused, reply.isNotEmpty()) {
        if (paused || reply.isNotEmpty()) return@LaunchedEffect
        prog.animateTo(1f, tween(((1f - prog.value) * 6000).toInt(), easing = LinearEasing))
        next()
    }
    Dialog(onClose, DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black).graphicsLayer { translationY = dragY.coerceAtLeast(0f); alpha = 1f - (dragY / 1500f).coerceIn(0f, 0.6f) }
            .pointerInput(Unit) { detectVerticalDragGestures(onDragEnd = { if (dragY > 250) onClose(); dragY = 0f }) { _, d -> dragY += d } }) {
            Box(Modifier.fillMaxSize().pointerInput(s.id) {
                awaitEachGesture {
                    val down = awaitFirstDown()
                    val t0 = System.currentTimeMillis()
                    paused = true
                    val up = waitForUpOrCancellation()
                    paused = false
                    if (up != null && System.currentTimeMillis() - t0 < 250) { if (down.position.x < size.width / 3) prev() else next() }
                }
            }) {
                DbImage(s.image, Modifier.fillMaxSize(), ContentScale.Fit)
                if (s.text.isNotEmpty()) Text(s.text, color = Color.White, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp).clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 16.dp, vertical = 10.dp))
            }
            Column(Modifier.statusBarsPadding().padding(horizontal = 10.dp, vertical = 8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    list.forEachIndexed { k, _ ->
                        Box(Modifier.weight(1f).height(3.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.35f))) {
                            val f = when { k < i -> 1f; k == i -> prog.value; else -> 0f }
                            Box(Modifier.fillMaxWidth(f).height(3.dp).background(Color.White))
                        }
                    }
                }
                Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(owner, 36.dp, showOnline = false)
                    Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                        UserName(owner, MaterialTheme.typography.titleSmall, color = Color.White)
                        Text(ago(s.createdAt), style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.7f))
                    }
                    if (mine) IconButton({ scope.safe(toast) { Media.deleteStory(s); toast("История удалена"); onClose() } }) { Icon(Icons.Rounded.Delete, "Удалить", tint = Color.White) }
                    IconButton(onClose) { Icon(Icons.Rounded.Close, "Закрыть", tint = Color.White) }
                }
            }
            Row(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().imePadding().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (mine) {
                    Row(Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.15f)).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Visibility, null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Text("  ${s.views.size} ${plural(s.views.size, "просмотр", "просмотра", "просмотров")}", color = Color.White, style = MaterialTheme.typography.labelLarge)
                    }
                    Spacer(Modifier.weight(1f))
                    Button(onAdd) { Icon(Icons.Rounded.Add, null); Text(" Ещё история") }
                } else {
                    TextField(reply, { reply = it.take(500) }, placeholder = { Text("Ответить…", color = Color.White.copy(alpha = 0.7f)) }, modifier = Modifier.weight(1f), shape = CircleShape, singleLine = true,
                        colors = TextFieldDefaults.colors(focusedContainerColor = Color.White.copy(alpha = 0.15f), unfocusedContainerColor = Color.White.copy(alpha = 0.15f),
                            focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent, focusedTextColor = Color.White, unfocusedTextColor = Color.White))
                    listOf("❤️", "🔥", "😂").forEach { e -> Text(e, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.clip(CircleShape).clickable { sendStoryReply(s, e, scope, toast); next() }.padding(6.dp)) }
                    if (reply.isNotBlank()) IconButton({ val t = reply; reply = ""; sendStoryReply(s, t, scope, toast) }) { Icon(Icons.AutoMirrored.Rounded.Send, "Отправить", tint = Color.White) }
                }
            }
        }
    }
}

/** Ответ на историю — сообщение в личку с маленькой копией (как storyReply() на сайте) */
private fun sendStoryReply(s: Story, text: String, scope: kotlinx.coroutines.CoroutineScope, toast: (String) -> Unit) {
    scope.safe(toast) {
        val thumb = withContext(Dispatchers.Default) { Images.bitmapOf(s.image)?.let { Images.fromBitmap(it, 360, 60_000) } ?: "" }
        Api.sendMessage(s.ownerId, "↩️ Ответ на историю: $text", thumb)
        toast("Отправлено")
    }
}

/** Своя история: превью и подпись */
@Composable
fun StoryComposer(uri: Uri, onDone: (Boolean) -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    VsSheet({ if (!busy) onDone(false) }) {
        Text("Новая история", style = MaterialTheme.typography.headlineSmall)
        Text("Видна 24 часа друзьям и всем, кто зайдёт на страницу", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box(Modifier.padding(vertical = 12.dp).fillMaxWidth().aspectRatio(0.8f).clip(RoundedCornerShape(28.dp)).background(Color.Black)) {
            coil.compose.AsyncImage(uri, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            if (text.isNotBlank()) Text(text, color = Color.White, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.Center).padding(20.dp).clip(RoundedCornerShape(14.dp)).background(Color.Black.copy(alpha = 0.45f)).padding(12.dp))
        }
        OutlinedTextField(text, { text = it.take(200) }, Modifier.fillMaxWidth(), placeholder = { Text("Подпись (необязательно)") }, singleLine = true, shape = CircleShape)
        Button({
            busy = true
            scope.launch { try { Media.postStory(ctx, uri, text); toast("История опубликована"); onDone(true) } catch (e: Exception) { toast(errText(e)); busy = false } }
        }, Modifier.fillMaxWidth().padding(top = 12.dp).height(52.dp), enabled = !busy) { if (busy) ExpressiveLoader(24.dp, MaterialTheme.colorScheme.onPrimary) else Text("Опубликовать") }
    }
}
