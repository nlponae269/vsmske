package ru.vsmske.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material3.AlertDialog
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import ru.vsmske.app.data.Fb
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Session
import ru.vsmske.app.data.User
import ru.vsmske.app.data.seenText
import ru.vsmske.app.ui.Avatar
import ru.vsmske.app.ui.Badge
import ru.vsmske.app.ui.Card
import ru.vsmske.app.ui.Empty
import ru.vsmske.app.ui.Field
import ru.vsmske.app.ui.GlassButton
import ru.vsmske.app.ui.Header
import ru.vsmske.app.ui.HeaderSpec
import ru.vsmske.app.ui.IconBtn
import ru.vsmske.app.ui.Loading
import ru.vsmske.app.ui.LocalNav
import ru.vsmske.app.ui.LocalPad
import ru.vsmske.app.ui.LocalToast
import ru.vsmske.app.ui.ScreenTitle
import ru.vsmske.app.ui.Tabs
import ru.vsmske.app.ui.UserName
import ru.vsmske.app.ui.Vs
import ru.vsmske.app.ui.errText
import ru.vsmske.app.ui.openProfile
import ru.vsmske.app.ui.safe

@Composable
fun PersonRow(u: User?, subtitle: String = seenText(u), actions: @Composable () -> Unit = {}) {
    val nav = LocalNav.current
    Card {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { u?.let { nav.openProfile(it.id) } }) {
            Avatar(u, 50.dp, u?.online == true)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                UserName(u)
                if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            actions()
        }
    }
}

@Composable
fun FriendsScreen() {
    val me by Session.me.collectAsState()
    val incoming by Session.incoming.collectAsState()
    val outgoing by Session.outgoing.collectAsState()
    val users by Repo.users.collectAsState()
    val toast = LocalToast.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf("friends") }
    var friends by remember { mutableStateOf<List<User>?>(null) }
    var confirm by remember { mutableStateOf<User?>(null) }
    val ids = me?.friends ?: emptyList()
    LaunchedEffect(ids) { friends = runCatching { Repo.friendsOf(ids) }.getOrElse { emptyList() }.sortedByDescending { it.lastSeen } }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPad(LocalPad.current), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            ScreenTitle("Друзья") { Badge(incoming.size) }
        }
        item { Tabs(listOf("friends" to "Друзья ${ids.size}", "requests" to "Заявки ${incoming.size}"), tab, { tab = it }) }
        if (tab == "friends") {
            val list = friends
            when {
                list == null -> item { Loading() }
                list.isEmpty() -> item { Empty("Пока нет друзей", "Найдите знакомых через поиск вверху") }
                else -> items(list, key = { it.id }) { u ->
                    PersonRow(u) {
                        IconBtn(Icons.AutoMirrored.Rounded.Chat, "Написать", tint = Vs.accent) { nav.navigate("chat/${u.id}") }
                        IconBtn(Icons.Rounded.Close, "Удалить из друзей", tint = Vs.muted) { confirm = u }
                    }
                }
            }
            item { GlassButton("Найти людей", Modifier.padding(top = 4.dp), icon = Icons.Rounded.PersonAdd) { nav.navigate("people") } }
        } else {
            if (incoming.isEmpty()) item { Empty("Новых заявок нет") }
            items(incoming, key = { it.id }) { r ->
                PersonRow(users[r.from], "хочет добавить вас в друзья") {
                    IconBtn(Icons.Rounded.Check, "Принять", tint = Vs.ok) {
                        scope.safe(toast) { Repo.friendAccept(r.from, outgoing.any { it.to == r.from }); toast("Теперь вы друзья") }
                    }
                    IconBtn(Icons.Rounded.Close, "Отклонить", tint = Vs.muted) { scope.safe(toast) { Repo.friendDecline(r.from) } }
                }
            }
            if (outgoing.isNotEmpty()) item { Text("Исходящие", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 4.dp, top = 8.dp)) }
            items(outgoing, key = { it.id }) { r ->
                PersonRow(users[r.to], "заявка отправлена") {
                    GlassButton("Отменить", color = Vs.muted) { scope.safe(toast) { Repo.friendCancel(r.to) } }
                }
            }
        }
    }
    confirm?.let { u ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Удалить из друзей?") },
            text = { Text("${u.name} пропадёт из вашего списка друзей.") },
            confirmButton = { TextButton({ confirm = null; scope.safe(toast) { Repo.friendRemove(u.id); friends = friends?.filter { it.id != u.id }; toast("Удалено из друзей") } }) { Text("Удалить", color = Vs.danger) } },
            dismissButton = { TextButton({ confirm = null }) { Text("Отмена") } },
            containerColor = androidx.compose.ui.graphics.Color(0xFF1E1236),
        )
    }
}

@Composable
fun PeopleScreen() {
    var q by rememberSaveable { mutableStateOf("") }
    var list by remember { mutableStateOf<List<User>?>(null) }
    var err by remember { mutableStateOf("") }
    val me by Session.me.collectAsState()
    val outgoing by Session.outgoing.collectAsState()
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    Header(HeaderSpec("Поиск людей"))
    LaunchedEffect(q) {
        delay(350)
        err = ""
        list = runCatching { Repo.searchPeople(q) }.onFailure { err = errText(it) }.getOrNull() ?: emptyList()
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPad(LocalPad.current), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Field(q, { q = it }, "Имя, город или @ник") }
        val l = list
        when {
            err.isNotEmpty() -> item { Empty("Не удалось найти", err) }
            l == null -> item { Loading() }
            l.isEmpty() -> item { Empty("Никого не нашли") }
            else -> items(l.filter { it.id != Fb.uid }, key = { it.id }) { u ->
                val friend = me?.friends?.contains(u.id) == true
                val sent = outgoing.any { it.to == u.id }
                PersonRow(u, listOf("@" + u.nick, u.city).filter { it.length > 1 }.joinToString(" · ")) {
                    when {
                        friend -> Text("друг", style = MaterialTheme.typography.labelMedium, color = Vs.ok)
                        sent -> Text("заявка", style = MaterialTheme.typography.labelMedium, color = Vs.muted)
                        else -> IconBtn(Icons.Rounded.PersonAdd, "Добавить", tint = Vs.accent) { scope.safe(toast) { Repo.friendAdd(u.id); toast("Заявка отправлена") } }
                    }
                }
            }
        }
        item { Spacer(Modifier.width(1.dp)) }
    }
}
