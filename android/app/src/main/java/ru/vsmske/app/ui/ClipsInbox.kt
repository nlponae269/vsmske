package ru.vsmske.app.ui

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Markup
import ru.vsmske.app.data.NOTIF_TEXT
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.User
import ru.vsmske.app.data.Video
import ru.vsmske.app.data.ago

/** «Входящие» как в ТикТоке: новые друзья, активность, дальше — переписки */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClipsInbox() {
    val nav = LocalNav.current
    val chats by Store.chats.collectAsState()
    val incoming by Store.incoming.collectAsState()
    val notifs by Store.notifs.collectAsState()
    val users by Store.users.collectAsState()
    val me = Store.uid
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = {
            CenterAlignedTopAppBar(title = { Text("Входящие", fontWeight = FontWeight.Bold) },
                navigationIcon = { IconButton({ nav.navigate("search") }) { Icon(Icons.Rounded.PersonAdd, "Найти друзей") } },
                actions = { IconButton({ nav.navigate("search") }) { Icon(Icons.Rounded.Search, "Поиск") } },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = MaterialTheme.colorScheme.surface))
        },
    ) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 16.dp)) {
            item {
                val first = incoming.firstOrNull()?.let { users[it.from] }
                InboxRow({ RoundIcon(Icons.Rounded.Groups, Color(0xFF3FA9F5)) }, "Новые друзья",
                    if (first != null) "${first.name} хочет добавить вас в друзья" else "Заявок пока нет", incoming.size) { nav.navigate("requests") }
            }
            item {
                val unseen = Store.unseenNotifs()
                val last = notifs.firstOrNull { it.from != me }
                InboxRow({ RoundIcon(Icons.Rounded.Favorite, ClipPink) }, "Активность",
                    last?.let { "${users[it.from]?.name ?: "…"} ${NOTIF_TEXT[it.type] ?: ""}" } ?: "Лайки, комментарии и упоминания", unseen) { nav.navigate("activity") }
            }
            if (chats.isEmpty()) item { EmptyState("Сообщений пока нет", "Напишите другу — кнопка «Сообщение» в профиле", "💬") }
            items(chats, key = { it.id }) { c ->
                val key = c.key(me)
                val peer = if (c.group) null else users[key]
                val unread = c.lastFrom != me && c.lastAt > (c.read[me] ?: 0L)
                InboxRow(
                    { if (c.group) RoundIcon(Icons.Rounded.Groups, MaterialTheme.colorScheme.tertiary) else Avatar(peer, 56.dp) },
                    if (c.group) c.name.ifEmpty { "Беседа" } else if (key == me) "Избранное" else peer?.name ?: "…",
                    (if (c.lastFrom == me) "Вы: " else "") + Markup.plain(c.lastText).replace('\n', ' ').ifEmpty { "Вложение" } + " · " + ago(c.lastAt),
                    if (unread) -1 else 0,
                ) { nav.navigate("chat/$key") }
            }
        }
    }
}

/** Строка «Входящих»: иконка, заголовок, подпись; badge > 0 — число, -1 — точка непрочитанного */
@Composable
private fun InboxRow(icon: @Composable () -> Unit, title: String, sub: String, badge: Int, onClick: () -> Unit) =
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        icon()
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = if (badge != 0) FontWeight.Bold else FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(sub, style = MaterialTheme.typography.bodyMedium, color = if (badge != 0) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        when {
            badge > 0 -> Box(Modifier.clip(CircleShape).background(ClipPink).padding(horizontal = 8.dp, vertical = 2.dp)) { Text("$badge", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
            badge < 0 -> Box(Modifier.size(10.dp).clip(CircleShape).background(ClipPink))
        }
    }

@Composable
private fun PersonRow(u: User?, sub: String, onClick: () -> Unit, actions: @Composable RowScope.() -> Unit) =
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(u, 52.dp)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            UserName(u, MaterialTheme.typography.titleSmall)
            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), content = actions)
    }

@Composable
private fun SmallBtn(text: String, primary: Boolean, onClick: () -> Unit) =
    Box(Modifier.height(34.dp).clip(MaterialTheme.shapes.small).background(if (primary) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh)
        .clickable(onClick = onClick).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
        Text(text, style = MaterialTheme.typography.labelLarge, color = if (primary) Color.White else MaterialTheme.colorScheme.onSurface)
    }

/** Заявки в друзья: входящие и свои */
@Composable
fun ClipsRequests() {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val incoming by Store.incoming.collectAsState()
    val outgoing by Store.outgoing.collectAsState()
    val users by Store.users.collectAsState()
    LaunchedEffect(outgoing) { Store.need(outgoing.map { it.to }) }
    BackScaffold("Новые друзья") { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            if (incoming.isEmpty() && outgoing.isEmpty()) item {
                EmptyState("Заявок нет", "Найдите знакомых по имени или нику", "👋", action = { PurpleButton("Найти друзей", Modifier.width(200.dp)) { nav.navigate("search") } })
            }
            if (incoming.isNotEmpty()) item { SectionTitle("Хотят дружить") }
            items(incoming, key = { "in" + it.from }) { r ->
                PersonRow(users[r.from], ago(r.createdAt), { nav.openProfile(r.from) }) {
                    SmallBtn("Принять", true) { scope.safe(toast) { Api.friendAccept(r.from); toast("Теперь вы друзья") } }
                    SmallBtn("✕", false) { scope.safe(toast) { Api.friendDecline(r.from) } }
                }
            }
            if (outgoing.isNotEmpty()) item { SectionTitle("Вы отправили") }
            items(outgoing, key = { "out" + it.to }) { r ->
                PersonRow(users[r.to], "ждёт ответа", { nav.openProfile(r.to) }) {
                    SmallBtn("Отменить", false) { scope.safe(toast) { Api.friendCancel(r.to) } }
                }
            }
        }
    }
}

/** Активность: лайки, комментарии, упоминания, заявки (те же сигналы, что в VСмске) */
@Composable
fun ClipsActivity() {
    val nav = LocalNav.current
    val list by Store.notifs.collectAsState()
    val users by Store.users.collectAsState()
    val seen = remember { Store.me.value?.notifSeenAt ?: 0L }
    LaunchedEffect(Unit) { runCatching { Api.markNotifsSeen() } }
    BackScaffold("Активность") { pad ->
        val shown = list.filter { it.from != Store.uid && it.type != "call" }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            if (shown.isEmpty()) item { EmptyState("Пока тихо", "Здесь появятся лайки, комментарии и заявки", "🔔") }
            items(shown, key = { it.id }) { n ->
                val u = users[n.from]
                Row(Modifier.fillMaxWidth().background(if (n.createdAt > seen) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else Color.Transparent)
                    .clickable { nav.openProfile(n.from) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box {
                        Avatar(u, 48.dp, showOnline = false)
                        NOTIF_ICON[n.type]?.let { ic ->
                            Box(Modifier.align(Alignment.BottomEnd).size(20.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface), contentAlignment = Alignment.Center) { Text(ic, fontSize = 11.sp) }
                        }
                    }
                    Column(Modifier.weight(1f).padding(start = 12.dp)) {
                        Text("${u?.name ?: "…"} ${NOTIF_TEXT[n.type] ?: ""}", style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text((if (n.text.isNotEmpty()) "«${Markup.plain(n.text)}» · " else "") + ago(n.createdAt), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

/** Поиск: люди (по имени и нику) и клипы из уже загруженной ленты */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClipsSearch() {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var q by remember { mutableStateOf("") }
    var people by remember { mutableStateOf<List<User>>(emptyList()) }
    val outgoing by Store.outgoing.collectAsState()
    val me by Store.me.collectAsState()
    LaunchedEffect(q) {
        if (q.trim().length < 2) { people = emptyList(); return@LaunchedEffect }
        delay(350)
        people = runCatching { Api.searchPeople(q) }.getOrElse { toast(errText(it)); emptyList() }.filter { it.id != Store.uid }
    }
    val clips: List<Video> = remember(q, ClipsData.forYou.size) {
        val t = q.trim().lowercase()
        if (t.length < 2) emptyList() else ClipsData.forYou.filter { it.title.lowercase().contains(t) }.take(30)
    }
    Scaffold(contentWindowInsets = WindowInsets(0), topBar = {
        TopAppBar(navigationIcon = { IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } },
            title = {
                TextField(q, { q = it.take(60) }, Modifier.fillMaxWidth().padding(end = 12.dp), placeholder = { Text("Люди и клипы") }, singleLine = true,
                    leadingIcon = { Icon(Icons.Rounded.Search, null) }, shape = MaterialTheme.shapes.small,
                    colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
            })
    }) { pad ->
        LazyVerticalGrid(GridCells.Fixed(3), Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(1.5.dp), verticalArrangement = Arrangement.spacedBy(1.5.dp)) {
            if (q.trim().length < 2) item(span = { GridItemSpan(maxLineSpan) }) { EmptyState("Найдите друзей", "Введите имя или @ник — от двух букв", "🔎") }
            else if (people.isEmpty() && clips.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) { EmptyState("Ничего не нашлось", "Попробуйте по-другому", "🤷") }
            if (people.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }) { SectionTitle("Люди") }
            people.forEach { u ->
                item(span = { GridItemSpan(maxLineSpan) }, key = "u" + u.id) {
                    PersonRow(u, if (u.nick.isNotEmpty()) "@${u.nick}" else u.city, { nav.openProfile(u.id) }) {
                        val friend = me?.friends?.contains(u.id) == true
                        val sent = outgoing.any { it.to == u.id }
                        if (!friend && !sent && !u.banned) SmallBtn("Добавить", true) { scope.safe(toast) { Api.friendAdd(u.id); toast("Заявка отправлена") } }
                        else if (sent) SmallBtn("Отправлено", false) { scope.safe(toast) { Api.friendCancel(u.id) } }
                    }
                }
            }
            if (clips.isNotEmpty()) item(span = { GridItemSpan(maxLineSpan) }) { SectionTitle("Клипы") }
            itemsIndexed(clips, key = { _, v -> "c" + v.id }) { i, v -> GridClip(v) { ClipsData.watch.clear(); ClipsData.watch.addAll(clips); nav.navigate("watch/$i") } }
        }
    }
}
