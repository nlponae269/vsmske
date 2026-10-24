package ru.vsmske.app.ui

import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.NOTIF_TEXT
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.User
import ru.vsmske.app.data.ago

@Composable
fun PersonRow(u: User?, trailing: @Composable () -> Unit = {}, onClick: () -> Unit) {
    ListItem(
        headlineContent = { UserName(u) },
        supportingContent = {
            val sub = when { u == null -> ""; u.banned -> "Аккаунт заблокирован"; u.online -> "в сети"; u.city.isNotEmpty() -> u.city; else -> "@${u.nick}" }
            Text(sub, color = if (u?.online == true && !u.banned) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        },
        leadingContent = { Avatar(u, 48.dp) },
        trailingContent = trailing,
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FriendsScreen() {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val me by Store.me.collectAsState()
    val users by Store.users.collectAsState()
    val inc by Store.incoming.collectAsState()
    var tab by rememberSaveable { mutableStateOf(0) }
    var q by rememberSaveable { mutableStateOf("") }
    var found by remember { mutableStateOf<List<User>?>(null) }
    LaunchedEffect(me?.friends) { Store.need(me?.friends ?: emptyList()) }
    LaunchedEffect(tab, q) {
        if (tab != 2) return@LaunchedEffect
        found = null; delay(300)
        found = runCatching { if (q.isBlank()) Api.recentPeople().filter { it.id != Store.uid && !it.banned } else Api.searchPeople(q) }.getOrElse { toast(errText(it)); emptyList() }
    }
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = {
            Column {
                TopAppBar(title = { Text("Друзья") }, navigationIcon = { IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } })
                PrimaryTabRow(tab) {
                    Tab(tab == 0, { tab = 0 }, text = { Text("Друзья") })
                    Tab(tab == 1, { tab = 1 }, text = { Row(verticalAlignment = Alignment.CenterVertically) { Text("Заявки"); if (inc.isNotEmpty()) Badge(Modifier.padding(start = 6.dp)) { Text("${inc.size}") } } })
                    Tab(tab == 2, { tab = 2 }, text = { Text("Поиск") })
                }
            }
        },
    ) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            when (tab) {
                0 -> {
                    val list = (me?.friends ?: emptyList()).mapNotNull { users[it] }.sortedByDescending { it.online }
                    if (me?.friends.isNullOrEmpty()) item { EmptyState("Пока никого", "Найдите знакомых во вкладке «Поиск»") }
                    items(list, key = { it.id }) { u -> PersonRow(u, onClick = { nav.openProfile(u.id) }) }
                }
                1 -> {
                    if (inc.isEmpty()) item { EmptyState("Новых заявок нет") }
                    items(inc, key = { it.from }) { r ->
                        PersonRow(users[r.from], trailing = {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Button({ scope.safe(toast) { Api.friendAccept(r.from); toast("Теперь вы друзья") } }) { Text("Принять") }
                                OutlinedButton({ scope.safe(toast) { Api.friendDecline(r.from) } }) { Text("Нет") }
                            }
                        }) { nav.openProfile(r.from) }
                    }
                }
                else -> {
                    item {
                        OutlinedTextField(q, { q = it.take(60) }, placeholder = { Text("Имя, фамилия или ник") }, singleLine = true,
                            leadingIcon = { Icon(Icons.Rounded.Search, null) }, modifier = Modifier.fillMaxWidth().padding(16.dp))
                    }
                    val f = found
                    if (f == null) item { Loading() }
                    else if (f.isEmpty()) item { EmptyState("Никого не нашли") }
                    else items(f, key = { it.id }) { u -> PersonRow(u, onClick = { nav.openProfile(u.id) }) }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotifsScreen() {
    val nav = LocalNav.current
    val list by Store.notifs.collectAsState()
    val users by Store.users.collectAsState()
    val seen = remember { Store.me.value?.notifSeenAt ?: 0L }
    LaunchedEffect(Unit) { runCatching { Api.markNotifsSeen() } }
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = { TopAppBar(title = { Text("Сигналы") }, navigationIcon = { IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } }) },
    ) { pad ->
        val shown = list.filter { it.from != Store.uid }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            if (shown.isEmpty()) item { EmptyState("Пока тихо", "Здесь появятся лайки, комментарии и заявки") }
            items(shown, key = { it.id }) { n ->
                val u = users[n.from]
                ListItem(
                    headlineContent = { Text("${u?.name ?: "…"} ${NOTIF_TEXT[n.type] ?: ""}") },
                    supportingContent = { Text((if (n.text.isNotEmpty()) "«${ru.vsmske.app.data.Markup.plain(n.text)}» · " else "") + ago(n.createdAt), maxLines = 2, color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    leadingContent = {
                        Box {
                            Avatar(u, 44.dp, showOnline = false)
                            val ic = NOTIF_ICON[n.type]
                            if (ic != null) Box(Modifier.align(Alignment.BottomEnd).size(20.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface), contentAlignment = Alignment.Center) {
                                Text(ic, fontSize = 12.sp)
                            }
                        }
                    },
                    colors = ListItemDefaults.colors(containerColor = if (n.createdAt > seen) MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.45f) else Color.Transparent),
                    modifier = Modifier.clickable { if (n.postId.isNotEmpty() && n.type in setOf("like", "comment", "wall", "repost", "mention")) nav.navigate("post/${n.postId}") else if (n.postId.isNotEmpty() && n.type in setOf("answer", "best")) nav.navigate("q/${n.postId}") else if (n.type == "gift") nav.navigate("me") else nav.openProfile(n.from) },
                )
            }
        }
    }
}

private val NOTIF_ICON = mapOf("like" to "❤️", "comment" to "💬", "wall" to "📝", "friend" to "🤝", "repost" to "🔁", "mention" to "@",
    "gift" to "🎁", "nick" to "💎", "call" to "📞", "answer" to "💡", "best" to "🏆")
