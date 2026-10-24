package ru.vsmske.app.ui

import androidx.compose.foundation.gestures.detectHorizontalDragGestures

import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DropdownMenu
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.Videocam
import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import android.util.Base64
import android.widget.VideoView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import kotlinx.coroutines.launch
import androidx.compose.animation.core.animateFloat
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.flow.MutableStateFlow
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Chat
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Message
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.chatKeyId
import ru.vsmske.app.data.clock
import ru.vsmske.app.data.dayLabel
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.data.isRoom
import java.io.File

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ChatsScreen() {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val chats by Store.chats.collectAsState()
    val users by Store.users.collectAsState()
    val me = Store.uid
    val prefs = remember { ctx.getSharedPreferences("vs", android.content.Context.MODE_PRIVATE) }
    // закреплённые диалоги — на этом телефоне (как vs_chatpins на сайте)
    var pins by remember { mutableStateOf(prefs.getString("chatpins", "")!!.split(',').filter { it.isNotEmpty() }.toSet()) }
    fun togglePin(id: String) { pins = if (id in pins) pins - id else pins + id; prefs.edit().putString("chatpins", pins.joinToString(",")).apply() }
    var q by rememberSaveable { mutableStateOf("") }
    var menuFor by remember { mutableStateOf<String?>(null) }
    fun title(c: ru.vsmske.app.data.Chat): String { val k = c.key(me); return if (c.group) c.name else if (k == me) "Избранное" else users[k]?.name ?: "" }
    val shown = chats.filter { c -> q.isBlank() || title(c).contains(q.trim(), true) || c.lastText.contains(q.trim(), true) }
        .sortedWith(compareByDescending<ru.vsmske.app.data.Chat> { it.id in pins }.thenByDescending { it.lastAt })
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    Scaffold(Modifier.nestedScroll(scroll.nestedScrollConnection), contentWindowInsets = WindowInsets(0),
        topBar = { LargeTopAppBar(title = { Text("Чаты") }, scrollBehavior = scroll, actions = {
            IconButton({ nav.navigate("chat/$me") }) { Icon(Icons.Rounded.Bookmark, "Избранное — заметки для себя") }
        }) }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            if (chats.size > 4) item {
                TextField(q, { q = it.take(60) }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), placeholder = { Text("Поиск по чатам") },
                    leadingIcon = { Icon(Icons.Rounded.Search, null) }, singleLine = true, shape = CircleShape,
                    trailingIcon = { if (q.isNotEmpty()) IconButton({ q = "" }) { Icon(Icons.Rounded.Close, "Очистить") } },
                    colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
            }
            if (chats.isEmpty()) item { EmptyState("Диалогов пока нет", "Откройте страницу друга и нажмите «Написать»", "💬") }
            else if (shown.isEmpty()) item { EmptyState("Ничего не нашли", "Попробуйте другое имя или слово", "🔎") }
            items(shown, key = { it.id }) { c ->
                val key = c.key(me)
                val peer = if (c.group) null else users[key]
                val unread = c.unread(me)
                val pinned = c.id in pins
                Box {
                    ListItem(
                        headlineContent = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.weight(1f, fill = false)) {
                                    if (c.group) Text(c.name, fontWeight = if (unread) FontWeight.Bold else null, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    else if (key == me) Text("Избранное", style = MaterialTheme.typography.titleSmall)
                                    else UserName(peer, if (unread) MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold) else MaterialTheme.typography.titleSmall)
                                }
                                if (pinned) Icon(Icons.Rounded.PushPin, "Закреплён", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 6.dp).size(14.dp))
                            }
                        },
                        supportingContent = {
                            Text((if (c.lastFrom == me) "Вы: " else "") + ru.vsmske.app.data.Markup.plain(c.lastText), maxLines = 1, overflow = TextOverflow.Ellipsis,
                                color = if (unread) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                        },
                        leadingContent = {
                            when {
                                c.group -> Box(Modifier.size(52.dp).clip(CircleShape).background(MaterialTheme.colorScheme.tertiaryContainer), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Rounded.Groups, null, tint = MaterialTheme.colorScheme.onTertiaryContainer)
                                }
                                key == me -> Box(Modifier.size(52.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Rounded.Bookmark, null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
                                }
                                else -> Avatar(peer, 52.dp)
                            }
                        },
                        trailingContent = {
                            Column(horizontalAlignment = Alignment.End) {
                                Text(if (System.currentTimeMillis() - c.lastAt < 86_400_000) clock(c.lastAt) else dayLabel(c.lastAt), style = MaterialTheme.typography.labelSmall,
                                    color = if (unread) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                                if (unread) Box(Modifier.padding(top = 6.dp).size(10.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                            }
                        },
                        colors = ListItemDefaults.colors(containerColor = if (pinned) MaterialTheme.colorScheme.surfaceContainerLow else Color.Transparent),
                        modifier = Modifier.combinedClickable(onLongClick = { menuFor = c.id }) { nav.navigate("chat/$key") },
                    )
                    DropdownMenu(menuFor == c.id, { menuFor = null }) {
                        DropdownMenuItem({ Text(if (pinned) "Открепить" else "Закрепить наверху") }, { menuFor = null; togglePin(c.id) },
                            leadingIcon = { Icon(Icons.Rounded.PushPin, null) })
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ChatScreen(key: String) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val clip = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val me = Store.uid
    val cid = chatKeyId(me, key)
    val chats by Store.chats.collectAsState()
    val users by Store.users.collectAsState()
    val chat = chats.firstOrNull { it.id == cid }
    val room = isRoom(key)
    val peer = if (room) null else users[key]
    var msgs by remember { mutableStateOf<List<Message>?>(null) }
    var text by rememberSaveable { mutableStateOf("") }
    var reply by remember { mutableStateOf<Message?>(null) }
    var edit by remember { mutableStateOf<Message?>(null) }
    var menu by remember { mutableStateOf<Message?>(null) }
    var busy by remember { mutableStateOf(false) }
    val list = rememberLazyListState()
    LaunchedEffect(key) { if (!room) Store.need(listOf(key)) }
    DisposableEffect(cid) {
        val reg = Api.messagesQuery(cid).addSnapshotListener { s, e ->
            if (e != null) { msgs = msgs ?: emptyList(); return@addSnapshotListener }
            val l = s?.documents?.map(Message::from) ?: return@addSnapshotListener
            msgs = l; if (room) Store.need(l.map { it.from })
        }
        onDispose { reg.remove() }
    }
    LaunchedEffect(chat?.lastAt) { chat?.let { Api.markRead(it) } }
    LaunchedEffect(msgs?.size) { val n = msgs?.size ?: 0; if (n > 0) list.animateScrollToItem(n - 1) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri != null) { busy = true; scope.safe({ busy = false; toast(it) }) { Api.sendMessage(key, "", Images.compress(ctx, uri, 1280, 380_000)); busy = false } }
    }
    val readAt = chat?.read?.filterKeys { it != me }?.values?.maxOrNull() ?: 0L
    var callVideo by remember { mutableStateOf(false) }
    var rec by remember { mutableStateOf<ru.vsmske.app.music.VoiceRec?>(null) }
    val askMic = rememberAvPermission {
        runCatching { ru.vsmske.app.music.VoiceRec(ctx) { scope.launch { toast("Минута — это максимум, жмите «Отправить»") } } }
            .onSuccess { if (ru.vsmske.app.music.Music.state.value.playing) ru.vsmske.app.music.Music.toggle(); rec = it }
            .onFailure { toast(errText(it)) }
    }
    DisposableEffect(Unit) { onDispose { rec?.cancel() } }   // ушли из чата посреди записи — запись выбрасываем
    val call = rememberAvPermission { scope.safe(toast) { ru.vsmske.app.rtc.Call.start(ctx, key, callVideo) } }

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(enabled = !room && key != me) { nav.openProfile(key) }) {
                        if (room) Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.tertiaryContainer), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Groups, null) }
                        else Avatar(peer, 40.dp)
                        Column(Modifier.padding(start = 12.dp)) {
                            Text(if (room) chat?.name ?: "Беседа" else if (key == me) "Избранное" else peer?.name ?: "…", style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            val sub = when { room -> "${chat?.members?.size ?: 0} участников"; key == me -> "Заметки для себя"; peer?.banned == true -> "Аккаунт заблокирован"; peer?.online == true -> "в сети"; peer != null && peer.lastSeen > 0 -> "был(а) ${ru.vsmske.app.data.ago(peer.lastSeen)}"; else -> "" }
                            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = if (peer?.online == true) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                },
                navigationIcon = { IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } },
                actions = {
                    if (!room && key != me && peer?.banned != true) {
                        IconButton({ callVideo = false; call(false) }) { Icon(Icons.Rounded.Call, "Позвонить") }
                        IconButton({ callVideo = true; call(true) }) { Icon(Icons.Rounded.Videocam, "Видеозвонок") }
                    }
                },
            )
        },
        bottomBar = {
            Column(Modifier.background(MaterialTheme.colorScheme.surfaceContainer).navigationBarsPadding().imePadding()) {
                val ctxMsg = edit ?: reply
                if (ctxMsg != null) Row(Modifier.fillMaxWidth().padding(start = 16.dp, top = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (edit != null) Icons.Rounded.Edit else Icons.AutoMirrored.Rounded.Reply, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                    Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                        Text(if (edit != null) "Изменение" else "Ответ", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        Text(ctxMsg.text.ifEmpty { if (ctxMsg.audio.isNotEmpty()) "🎤 Голосовое" else "📷 Фото" }, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                    }
                    IconButton({ reply = null; if (edit != null) { edit = null; text = "" } }) { Icon(Icons.Rounded.Close, "Отмена") }
                }
                if (Store.me.value?.isBanned == true) Text("Ваш аккаунт заблокирован — писать сообщения нельзя", Modifier.fillMaxWidth().padding(16.dp), color = MaterialTheme.colorScheme.error)
                else Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    val recNow = rec
                    if (recNow != null) VoiceRecBar(recNow, onCancel = { recNow.cancel(); rec = null }) {
                        val got = recNow.finish(); rec = null
                        if (got == null) toast("Слишком короткое голосовое — держите запись хотя бы секунду")
                        else { val r = reply; reply = null; busy = true; scope.safe({ busy = false; toast(it) }) { Api.sendMessage(key, "", replyTo = r, audio = got.first, dur = got.second); busy = false } }
                    } else {
                    IconButton({ pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = !busy) { Icon(Icons.Rounded.Image, "Фото") }
                    TextField(text, { text = it.take(2000) }, placeholder = { Text("Сообщение") }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(24.dp), maxLines = 5,
                        colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
                    // пустое поле — микрофон (голосовое), есть текст — «отправить», как на сайте
                    if (text.isBlank() && edit == null) IconButton({ askMic(false) }, enabled = !busy) { Icon(Icons.Rounded.Mic, "Записать голосовое", tint = MaterialTheme.colorScheme.primary) }
                    else IconButton({
                        val t = text.trim(); if (t.isEmpty()) return@IconButton
                        text = ""
                        val e = edit; val r = reply; edit = null; reply = null
                        scope.safe(toast) { if (e != null) Api.editMessage(key, e, t) else Api.sendMessage(key, t, replyTo = r) }
                    }, enabled = text.isNotBlank()) { Icon(Icons.AutoMirrored.Rounded.Send, "Отправить", tint = MaterialTheme.colorScheme.primary) }
                    }
                }
            }
        },
    ) { pad ->
        val l = msgs
        LazyColumn(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainerLowest), state = list,
            contentPadding = PaddingValues(start = 10.dp, end = 10.dp, top = pad.calculateTopPadding() + 8.dp, bottom = pad.calculateBottomPadding() + 8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)) {
            when {
                l == null -> item { Loading() }
                l.isEmpty() -> item { EmptyState("Сообщений пока нет", "Напишите первым 👋") }
                else -> itemsIndexed(l, key = { _, m -> m.id }) { i, m ->
                    val prev = l.getOrNull(i - 1)
                    if (prev == null || dayLabel(prev.createdAt) != dayLabel(m.createdAt)) {
                        Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                            Text(dayLabel(m.createdAt), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(horizontal = 12.dp, vertical = 4.dp))
                        }
                    }
                    Bubble(m, mine = m.from == me, read = m.from == me && readAt >= m.createdAt,
                        author = if (room && m.from != me && prev?.from != m.from) users[m.from] else null, hidden = users[m.from]?.banned == true,
                        onReply = { edit = null; reply = m }) { menu = m }
                }
            }
        }
    }

    menu?.let { m ->
        ModalBottomSheet({ menu = null }) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                listOf("❤️", "😂", "👍", "😮", "😢", "🔥").forEach { e ->
                    Text(e, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.clip(CircleShape)
                        .background(if (m.reacts[me] == e) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent)
                        .clickable { menu = null; scope.safe(toast) { Api.react(key, m, e) } }.padding(8.dp))
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            SheetItem(Icons.AutoMirrored.Rounded.Reply, "Ответить") { reply = m; edit = null; menu = null }
            if (m.text.isNotEmpty()) SheetItem(Icons.Rounded.ContentCopy, "Копировать") { clip.setText(AnnotatedString(m.text)); menu = null; toast("Скопировано") }
            if (m.from == me && m.text.isNotEmpty() && m.fwdName.isEmpty()) SheetItem(Icons.Rounded.Edit, "Изменить") { edit = m; reply = null; text = m.text; menu = null }
            if (m.from == me) SheetItem(Icons.Rounded.Delete, "Удалить у всех") { menu = null; scope.safe(toast) { Api.deleteMessage(key, m); toast("Сообщение удалено") } }
            Spacer(Modifier.size(24.dp))
        }
    }
}

@Composable
private fun SheetItem(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) =
    ListItem(headlineContent = { Text(label) }, leadingContent = { Icon(icon, null) }, colors = ListItemDefaults.colors(containerColor = Color.Transparent), modifier = Modifier.clickable(onClick = onClick))

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Bubble(m: Message, mine: Boolean, read: Boolean, author: ru.vsmske.app.data.User?, hidden: Boolean, onReply: () -> Unit, onMenu: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    val bg = if (mine) cs.primary else cs.surfaceContainerHigh
    val fg = if (mine) cs.onPrimary else cs.onSurface
    var viewer by remember { mutableStateOf(false) }
    // свайп вправо — ответить (как на сайте): сообщение едет за пальцем, после порога — лёгкая вибрация
    val dx = remember { androidx.compose.animation.core.Animatable(0f) }
    val scope = rememberCoroutineScope()
    val replyNow by androidx.compose.runtime.rememberUpdatedState(onReply)
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    val trigger = with(androidx.compose.ui.platform.LocalDensity.current) { 64.dp.toPx() }
    Box(Modifier.fillMaxWidth().pointerInput(m.id) {
        detectHorizontalDragGestures(
            onDragEnd = { if (dx.value >= trigger) replyNow(); scope.launch { dx.animateTo(0f, androidx.compose.animation.core.spring(dampingRatio = 0.6f)) } },
            onDragCancel = { scope.launch { dx.animateTo(0f) } },
        ) { ch, d ->
            val nv = (dx.value + d).coerceIn(0f, trigger * 1.4f)
            if (nv != dx.value) ch.consume()
            if (dx.value < trigger && nv >= trigger) haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
            scope.launch { dx.snapTo(nv) }
        }
    }) {
    if (dx.value > 1f) Icon(Icons.AutoMirrored.Rounded.Reply, null, tint = cs.primary,
        modifier = Modifier.align(Alignment.CenterStart).padding(start = 8.dp).size(24.dp).graphicsLayer { alpha = (dx.value / trigger).coerceIn(0f, 1f); val k = 0.6f + 0.4f * alpha; scaleX = k; scaleY = k })
    Row(Modifier.fillMaxWidth().graphicsLayer { translationX = dx.value }, horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Column(
            Modifier.widthIn(max = 310.dp).clip(RoundedCornerShape(20.dp, 20.dp, if (mine) 6.dp else 20.dp, if (mine) 20.dp else 6.dp))
                .background(bg).combinedClickable(onClick = {}, onLongClick = onMenu).padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            if (author != null) Text(author.name, style = MaterialTheme.typography.labelMedium, color = cs.primary)
            if (m.fwdName.isNotEmpty()) Text("↪ Переслано от ${m.fwdName}", style = MaterialTheme.typography.labelSmall, color = fg.copy(alpha = 0.75f))
            if (m.replyText.isNotEmpty()) Text("│ " + ru.vsmske.app.data.Markup.plain(m.replyText), style = MaterialTheme.typography.bodySmall, color = fg.copy(alpha = 0.75f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (m.image.isNotEmpty()) {
                if (hidden) Text("🔒 Фото недоступно", color = fg.copy(alpha = 0.75f))
                else DbImage(m.image, Modifier.padding(vertical = 4.dp).widthIn(max = 280.dp).heightIn(max = 340.dp).clip(RoundedCornerShape(14.dp)).clickable { viewer = true }, ContentScale.FillWidth)
            }
            if (m.audio.isNotEmpty()) {
                if (hidden) Text("🔒 Голосовое недоступно", color = fg.copy(alpha = 0.75f))
                else if (m.audio.startsWith("data:video/")) VideoNote(m) else VoiceRow(m, fg)
            }
            if (m.fwdText.isNotEmpty()) RichText(m.fwdText, style = MaterialTheme.typography.bodyLarge, color = fg, linkColor = fg)
            if (m.text.isNotEmpty()) RichText(m.text, style = MaterialTheme.typography.bodyLarge, color = fg, linkColor = fg)
            Row(Modifier.align(Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                if (m.reacts.isNotEmpty()) Text(m.reacts.values.groupingBy { it }.eachCount().entries.joinToString(" ") { if (it.value > 1) it.key + it.value else it.key } + "  ", style = MaterialTheme.typography.labelMedium)
                Text((if (m.edited) "изменено · " else "") + clock(m.createdAt) + if (mine) (if (m.pending) " ◷" else if (read) " ✓✓" else " ✓") else "",
                    style = MaterialTheme.typography.labelSmall, color = fg.copy(alpha = 0.7f))
            }
        }
    }
    }
    if (viewer) Dialog({ viewer = false }, androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black).clickable { viewer = false }, contentAlignment = Alignment.Center) { DbImage(m.image, Modifier.fillMaxWidth(), ContentScale.FillWidth) }
    }
}

/** Голосовые с сайта: dataURL audio/webm → временный файл → MediaPlayer */
private object Voice {
    val playing = MutableStateFlow("")
    private var mp: MediaPlayer? = null
    fun toggle(ctx: Context, id: String, data: String) {
        val was = playing.value
        mp?.release(); mp = null; playing.value = ""
        if (was == id) return
        runCatching {
            val f = tempFile(ctx, id, data)
            mp = MediaPlayer().apply { setDataSource(f.absolutePath); setOnCompletionListener { playing.value = ""; release(); mp = null }; prepare(); start() }
            playing.value = id
        }
    }
}

private fun tempFile(ctx: Context, id: String, data: String): File {
    val ext = Regex("^data:(audio|video)/([a-z0-9]+)").find(data)?.groupValues?.get(2) ?: "webm"
    val f = File(ctx.cacheDir, "msg_$id.$ext")
    if (!f.exists()) f.writeBytes(Base64.decode(data.substringAfter(','), Base64.DEFAULT))
    return f
}

@Composable
private fun VoiceRow(m: Message, fg: Color) {
    val ctx = LocalContext.current
    val cur by Voice.playing.collectAsState()
    Row(Modifier.padding(vertical = 2.dp).clickable { Voice.toggle(ctx, m.id, m.audio) }, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(fg.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
            Icon(if (cur == m.id) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Голосовое", tint = fg)
        }
        Text("  🎤 ${fmtDur(m.dur)}", style = MaterialTheme.typography.labelLarge, color = fg)
    }
}

/** Видеокружок с сайта: круглое видео, по нажатию играет со звуком */
@Composable
private fun VideoNote(m: Message) {
    val ctx = LocalContext.current
    val file = remember(m.id) { runCatching { tempFile(ctx, m.id, m.audio) }.getOrNull() }
    if (file == null) { Text("🎥 Видеокружок"); return }
    Box(Modifier.padding(vertical = 4.dp).size(200.dp).clip(CircleShape).background(Color.Black)) {
        AndroidView({ c -> VideoView(c).apply {
            setVideoPath(file.absolutePath)
            setOnPreparedListener { p -> p.isLooping = true; p.setVolume(0f, 0f); start() }
            setOnClickListener { if (isPlaying) pause() else start() }
        } }, Modifier.fillMaxSize())
    }
}

/** Идёт запись голосового: мигающая точка, время, громкость; «Удалить» и «Отправить» */
@Composable
private fun VoiceRecBar(r: ru.vsmske.app.music.VoiceRec, onCancel: () -> Unit, onSend: () -> Unit) {
    var ms by remember { mutableStateOf(0L) }
    val levels = remember { mutableStateListOf<Float>() }
    LaunchedEffect(r) { while (true) { ms = r.elapsed(); levels.add(r.level()); if (levels.size > 40) levels.removeAt(0); kotlinx.coroutines.delay(100) } }
    val blink by androidx.compose.animation.core.rememberInfiniteTransition(label = "rec").animateFloat(1f, 0.25f,
        androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(600), androidx.compose.animation.core.RepeatMode.Reverse), label = "b")
    val cs = MaterialTheme.colorScheme
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onCancel) { Icon(Icons.Rounded.Delete, "Удалить запись", tint = cs.error) }
        Box(Modifier.size(10.dp).clip(CircleShape).background(Color(0xFFE53935).copy(alpha = blink)))
        Text("  " + ru.vsmske.app.data.fmtDur(ms / 1000.0), style = MaterialTheme.typography.titleSmall)
        Row(Modifier.weight(1f).height(32.dp).padding(horizontal = 10.dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
            levels.forEach { v -> Box(Modifier.weight(1f).fillMaxHeight(0.15f + 0.85f * kotlin.math.sqrt(v)).clip(CircleShape).background(cs.primary)) }
        }
        androidx.compose.material3.FilledIconButton(onSend) { Icon(Icons.AutoMirrored.Rounded.Send, "Отправить голосовое") }
    }
}
