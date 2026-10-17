package ru.vsmske.app.ui.screens

import android.content.Context
import android.media.MediaPlayer
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.catch
import ru.vsmske.app.data.Fb
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Message
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Session
import ru.vsmske.app.data.User
import ru.vsmske.app.data.ago
import ru.vsmske.app.data.chatKeyId
import ru.vsmske.app.data.dayLabel
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.data.isRoom
import ru.vsmske.app.data.seenText
import ru.vsmske.app.data.timeOnly
import ru.vsmske.app.ui.Avatar
import ru.vsmske.app.ui.Card
import ru.vsmske.app.ui.DbImage
import ru.vsmske.app.ui.Empty
import ru.vsmske.app.ui.Field
import ru.vsmske.app.ui.Header
import ru.vsmske.app.ui.HeaderSpec
import ru.vsmske.app.ui.IconBtn
import ru.vsmske.app.ui.Loading
import ru.vsmske.app.ui.LocalNav
import ru.vsmske.app.ui.LocalPad
import ru.vsmske.app.ui.LocalToast
import ru.vsmske.app.ui.ScreenTitle
import ru.vsmske.app.ui.UserName
import ru.vsmske.app.ui.Vs
import ru.vsmske.app.ui.errText
import ru.vsmske.app.ui.glassCard
import ru.vsmske.app.ui.openProfile
import ru.vsmske.app.ui.safe
import java.io.File

@Composable
fun ChatsScreen() {
    val chats by Session.chats.collectAsState()
    val users by Repo.users.collectAsState()
    val nav = LocalNav.current
    val me = Fb.uid
    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPad(LocalPad.current), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { ScreenTitle("Чаты") }
        if (chats.isEmpty()) item { Empty("Здесь будут ваши диалоги", "Откройте страницу друга и нажмите «Написать»") }
        items(chats, key = { it.id }) { c ->
            val key = c.key(me)
            val peer = if (c.group) null else users[key]
            val unread = c.unread(me)
            Card {
                Row(Modifier.clickable { nav.navigate("chat/$key") }, verticalAlignment = Alignment.CenterVertically) {
                    if (c.group) Box(Modifier.size(52.dp).clip(RoundedCornerShape(17.dp)).background(Vs.grad), contentAlignment = Alignment.Center) {
                        Text("👥", style = MaterialTheme.typography.titleMedium)
                    } else Avatar(peer, 52.dp, peer?.online == true)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (c.group) Text(c.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, modifier = Modifier.weight(1f))
                            else if (key == me) Text("Избранное", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                            else UserName(peer, modifier = Modifier.weight(1f))
                            Text(ago(c.lastAt).replace("сегодня в ", ""), style = MaterialTheme.typography.bodySmall)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                (if (c.lastFrom == me) "Вы: " else "") + c.lastText, style = MaterialTheme.typography.bodyMedium,
                                color = if (unread) Vs.fg else Vs.muted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                            )
                            if (unread) Box(Modifier.padding(start = 6.dp).size(10.dp).clip(RoundedCornerShape(5.dp)).background(Vs.pink))
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ChatScreen(key: String) {
    val me = Fb.uid
    val nav = LocalNav.current
    val toast = LocalToast.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val users by Repo.users.collectAsState()
    val chats by Session.chats.collectAsState()
    val room = isRoom(key)
    val chat = chats.firstOrNull { it.id == chatKeyId(me, key) }
    val peer: User? = if (room) null else users[key]
    var err by remember { mutableStateOf<String?>(null) }
    val msgs by remember(key) { Repo.messages(key).catch { err = errText(it) } }.collectAsState(initial = null)
    var text by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var del by remember { mutableStateOf<Message?>(null) }
    var viewer by remember { mutableStateOf<String?>(null) }
    val state = rememberLazyListState()

    LaunchedEffect(key) { if (!room) Repo.ensureUsers(listOf(key)) }
    LaunchedEffect(msgs, chat) { chat?.let { Repo.markRead(it) }; if (room) Repo.ensureUsers(msgs.orEmpty().map { it.from }) }
    LaunchedEffect(msgs?.size) { if (!msgs.isNullOrEmpty()) state.animateScrollToItem(0) }
    Header(
        if (room) HeaderSpec(chat?.name ?: "Беседа", "${chat?.members?.size ?: 0} участников")
        else if (key == me) HeaderSpec("Избранное", "заметки для себя")
        else HeaderSpec(peer?.name ?: "…", seenText(peer), peer) { nav.openProfile(key) },
    )
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) { sending = true; scope.safe(toast) { try { Repo.sendMessage(key, "", Images.compress(ctx, uri, 1280, Images.MAX_MSG_IMG)) } finally { sending = false } } }
    }
    val top = LocalPad.current.calculateTopPadding()
    Column(Modifier.fillMaxSize().imePadding()) {
        Box(Modifier.weight(1f)) {
            val list = msgs
            when {
                err != null -> Empty("Не удалось открыть диалог", err ?: "")
                list == null -> Loading(Modifier.padding(top = top))
                list.isEmpty() -> Box(Modifier.padding(top = top)) { Empty("Сообщений пока нет", "Напишите первым 👋") }
                else -> {
                    val rev = list.asReversed()
                    LazyColumn(Modifier.fillMaxSize(), state = state, reverseLayout = true,
                        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = top, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        items(rev.size, key = { rev[it].id }) { i ->
                            val m = rev[i]
                            val older = rev.getOrNull(i + 1)
                            Column {
                                if (older == null || dayLabel(older.createdAt) != dayLabel(m.createdAt)) Text(
                                    dayLabel(m.createdAt), style = MaterialTheme.typography.labelSmall, color = Vs.muted,
                                    modifier = Modifier.align(Alignment.CenterHorizontally).padding(vertical = 8.dp).clip(RoundedCornerShape(50)).background(Color(0x1AFFFFFF)).padding(horizontal = 10.dp, vertical = 4.dp),
                                )
                                Bubble(m, mine = m.from == me, showName = room && m.from != me && older?.from != m.from, author = users[m.from],
                                    onLong = { if (m.from == me) del = m }, onImage = { viewer = it })
                            }
                        }
                    }
                }
            }
        }
        val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        Row(
            Modifier.padding(start = 10.dp, end = 10.dp, top = 6.dp, bottom = bottom + 10.dp).glassCard(26.dp).padding(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconBtn(Icons.Rounded.Image, "Фото", tint = Vs.accent) { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            Box(Modifier.weight(1f)) { Field(text, { text = it.take(2000) }, "Сообщение", singleLine = false) }
            if (sending) CircularProgressIndicator(Modifier.padding(8.dp).size(24.dp), color = Vs.accent, strokeWidth = 2.dp)
            else IconBtn(Icons.AutoMirrored.Rounded.Send, "Отправить", tint = Vs.accent) {
                val t = text.trim(); if (t.isEmpty()) return@IconBtn
                text = ""
                scope.safe(toast) { Repo.sendMessage(key, t) }
            }
        }
    }
    del?.let { m ->
        AlertDialog(
            onDismissRequest = { del = null }, title = { Text("Удалить сообщение?") },
            confirmButton = { TextButton({ del = null; scope.safe(toast) { Repo.deleteMessage(key, m.id) } }) { Text("Удалить", color = Vs.danger) } },
            dismissButton = { TextButton({ del = null }) { Text("Отмена") } }, containerColor = Color(0xFF1E1236),
        )
    }
    viewer?.let { ImageViewer(it) { viewer = null } }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Bubble(m: Message, mine: Boolean, showName: Boolean, author: User?, onLong: () -> Unit, onImage: (String) -> Unit) {
    val shape = RoundedCornerShape(20.dp, 20.dp, if (mine) 6.dp else 20.dp, if (mine) 20.dp else 6.dp)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Column(
            Modifier.widthIn(max = 300.dp).clip(shape)
                .then(if (mine) Modifier.background(Vs.grad) else Modifier.background(Color(0x1FFFFFFF)).border(1.dp, Color(0x1FFFFFFF), shape))
                .combinedClickable(onClick = {}, onLongClick = onLong).padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            if (showName) Text(author?.name ?: "…", style = MaterialTheme.typography.labelMedium, color = Vs.accent)
            if (m.fwdName.isNotEmpty()) Text("↪ Переслано от ${m.fwdName}", style = MaterialTheme.typography.labelSmall, color = if (mine) Color(0xCCFFFFFF) else Vs.muted)
            if (m.replyText.isNotEmpty()) Text("┃ " + m.replyText, style = MaterialTheme.typography.bodySmall, color = if (mine) Color(0xCCFFFFFF) else Vs.muted, maxLines = 2)
            if (m.image.isNotEmpty()) DbImage(m.image, Modifier.padding(vertical = 4.dp).widthIn(max = 280.dp).heightIn(max = 340.dp).clip(RoundedCornerShape(14.dp)).clickable { onImage(m.image) }, scale = ContentScale.FillWidth)
            if (m.audio.isNotEmpty()) VoiceRow(m)
            if (m.text.isNotEmpty()) Text(m.text, style = MaterialTheme.typography.bodyLarge, color = if (mine) Color.White else Vs.fg)
            Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                if (m.reacts.isNotEmpty()) Text(m.reacts.values.groupingBy { it }.eachCount().entries.joinToString(" ") { if (it.value > 1) it.key + it.value else it.key } + "  ", style = MaterialTheme.typography.labelSmall)
                Text((if (m.edited) "изм. " else "") + timeOnly(m.createdAt), style = MaterialTheme.typography.labelSmall, color = if (mine) Color(0xB3FFFFFF) else Vs.muted)
            }
        }
    }
}

/** Голосовые с сайта: dataURL audio/webm или audio/mp4 прямо в сообщении */
object Voice {
    val playing = MutableStateFlow<String?>(null)
    private var mp: MediaPlayer? = null

    fun toggle(ctx: Context, id: String, data: String) {
        if (playing.value == id) { stop(); return }
        stop()
        runCatching {
            val f = File(ctx.cacheDir, "voice_$id")
            if (!f.exists()) f.writeBytes(Base64.decode(data.substringAfter(","), Base64.DEFAULT))
            mp = MediaPlayer().apply {
                setDataSource(f.absolutePath); setOnCompletionListener { stop() }; prepare(); start()
            }
            playing.value = id
        }.onFailure { stop() }
    }

    fun stop() { mp?.runCatching { stop(); release() }; mp = null; playing.value = null }
}

@Composable
private fun VoiceRow(m: Message) {
    val ctx = LocalContext.current
    val cur by Voice.playing.collectAsState()
    Row(Modifier.padding(vertical = 2.dp).clickable { Voice.toggle(ctx, m.id, m.audio) }, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(18.dp)).background(Color(0x33FFFFFF)), contentAlignment = Alignment.Center) {
            Icon(if (cur == m.id) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Голосовое", tint = Color.White)
        }
        Text("  🎤 " + fmtDur(m.dur), style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.size(8.dp))
    }
}
