package ru.vsmske.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Reply
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Mail
import ru.vsmske.app.data.Markup
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.ago

/* ВС Почта: письма с темой по адресу ник@vsmske. Входящие слушает Store (значок в Меню), отправленные — этот экран. */

data class MailDraft(val to: String = "", val subject: String = "", val text: String = "")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MailScreen() {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val users by Store.users.collectAsState()
    val inbox by Store.mailIn.collectAsState()
    var tab by rememberSaveable { mutableStateOf(0) }
    var sent by remember { mutableStateOf<List<Mail>?>(null) }
    var draft by remember { mutableStateOf<MailDraft?>(null) }
    DisposableEffect(tab) {
        if (tab != 1) return@DisposableEffect onDispose { }
        val r = Api.mailOutQuery().addSnapshotListener { s, e ->
            if (e != null) { toast(errText(e)); sent = sent ?: emptyList(); return@addSnapshotListener }
            val l = s?.documents?.map(Mail::from)?.filter { !it.delFrom }?.sortedByDescending { it.createdAt } ?: return@addSnapshotListener
            Store.need(l.map { it.to }); sent = l
        }
        onDispose { r.remove() }
    }
    val me = Store.me.collectAsState().value
    BackScaffold("Почта", fab = { ExtendedFloatingActionButton(onClick = { draft = MailDraft() }, icon = { Icon(Icons.Rounded.Edit, null) }, text = { Text("Написать") }) }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 100.dp)) {
            item {
                Text("Ваш адрес: ${me?.nick ?: ""}@vsmske", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
                val unread = inbox.count { !it.read }
                PrimaryTabRow(tab, Modifier.padding(top = 4.dp)) {
                    Tab(tab == 0, { tab = 0 }, text = { Text(if (unread > 0) "Входящие · $unread" else "Входящие") })
                    Tab(tab == 1, { tab = 1 }, text = { Text("Отправленные") })
                }
            }
            val list = if (tab == 0) inbox else sent
            when {
                list == null -> item { Loading() }
                list.isEmpty() -> item { EmptyState(if (tab == 0) "Писем нет" else "Вы ещё ничего не отправляли", "Письмо можно отправить любому по нику", "✉️") }
                else -> items(list, key = { it.id }) { m ->
                    val other = users[if (tab == 0) m.from else m.to]
                    val unread = tab == 0 && !m.read
                    ListItem(
                        leadingContent = { Avatar(other, 44.dp) },
                        headlineContent = {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text((if (tab == 1) "Кому: " else "") + (other?.name ?: "…"), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                                    fontWeight = if (unread) FontWeight.Bold else FontWeight.Normal)
                                Text(ago(m.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        },
                        supportingContent = {
                            Column {
                                Text(m.subject.ifBlank { "(без темы)" }, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal, color = MaterialTheme.colorScheme.onSurface)
                                Text(Markup.plain(m.text).replace('\n', ' '), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        },
                        trailingContent = if (unread) ({ Box(Modifier.size(10.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary)) }) else null,
                        modifier = Modifier.clickable { nav.navigate("mail/${m.id}") },
                    )
                }
            }
        }
    }
    draft?.let { d -> MailCompose(d) { ok -> draft = null; if (ok) tab = 1 } }
}

/** Одно письмо: прочитать, ответить, удалить у себя */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MailReadScreen(id: String) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    var m by remember { mutableStateOf<Mail?>(null) }
    var gone by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf<MailDraft?>(null) }
    var askDel by remember { mutableStateOf(false) }
    DisposableEffect(id) {
        val r = Fire.db.collection("mail").document(id).addSnapshotListener { s, e ->
            if (e != null) { gone = true; return@addSnapshotListener }
            if (s == null) return@addSnapshotListener
            if (!s.exists()) { gone = true; return@addSnapshotListener }
            m = Mail.from(s).also { Store.need(listOf(it.from, it.to)) }
        }
        onDispose { r.remove() }
    }
    val mm = m
    LaunchedEffect(mm?.id, mm?.read) { if (mm != null && mm.to == Store.uid && !mm.read) runCatching { Api.markMailRead(mm) } }
    val inbox = mm != null && mm.to == Store.uid
    Scaffold(contentWindowInsets = WindowInsets(0), topBar = {
        TopAppBar(title = { Text("Письмо") }, navigationIcon = { IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } },
            actions = {
                if (mm != null) {
                    if (inbox && mm.from != Store.uid && users[mm.from]?.banned != true) IconButton({ draft = replyDraft(mm, users[mm.from]) }) { Icon(Icons.AutoMirrored.Rounded.Reply, "Ответить") }
                    IconButton({ askDel = true }) { Icon(Icons.Rounded.Delete, "Удалить") }
                }
            })
    }) { pad ->
        when {
            gone -> EmptyState("Письмо удалено", emoji = "🫥", modifier = Modifier.padding(top = 120.dp))
            mm == null -> Loading(Modifier.padding(top = 120.dp))
            else -> Column(Modifier.fillMaxSize().padding(top = pad.calculateTopPadding()).verticalScroll(rememberScrollState()).padding(20.dp)) {
                Text(mm.subject.ifBlank { "(без темы)" }, style = MaterialTheme.typography.headlineSmall)
                listOf("От" to mm.from, "Кому" to mm.to).forEach { (label, uid) ->
                    val u = users[uid]
                    Row(Modifier.padding(top = 12.dp).clip(RoundedCornerShape(16.dp)).clickable { nav.openProfile(uid) }.padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("$label  ", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(48.dp))
                        Avatar(u, 28.dp)
                        Column(Modifier.padding(start = 8.dp)) {
                            UserName(u)
                            if (u?.nick?.isNotEmpty() == true) Text("${u.nick}@vsmske", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                Text(ago(mm.createdAt), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
                HorizontalDivider(Modifier.padding(vertical = 16.dp))
                SelectionContainer { RichText(mm.text, style = MaterialTheme.typography.bodyLarge) }
                if (inbox && mm.from != Store.uid && users[mm.from]?.banned != true)
                    FilledTonalButton({ draft = replyDraft(mm, users[mm.from]) }, Modifier.padding(top = 24.dp)) { Icon(Icons.AutoMirrored.Rounded.Reply, null); Text("  Ответить") }
            }
        }
    }
    draft?.let { d -> MailCompose(d) { draft = null } }
    if (askDel && mm != null) AlertDialog({ askDel = false }, title = { Text("Удалить письмо?") }, text = { Text("Оно пропадёт только у вас.") },
        confirmButton = { TextButton({ askDel = false; scope.safe(toast) { Api.deleteMail(mm); toast("Письмо удалено"); nav.popBackStack() } }) { Text("Удалить") } },
        dismissButton = { TextButton({ askDel = false }) { Text("Отмена") } })
}

/** Ответ с цитатой — как mailreply на сайте */
private fun replyDraft(m: Mail, from: ru.vsmske.app.data.User?): MailDraft {
    val quote = m.text.lines().joinToString("\n") { "> $it" }
    val subj = if (m.subject.lowercase().startsWith("re:")) m.subject else "Re: ${m.subject}"
    return MailDraft(from?.nick ?: "", subj.take(200), "\n\n${from?.name ?: ""} писал(а):\n$quote".take(9000))
}

@Composable
fun MailCompose(start: MailDraft, onDone: (Boolean) -> Unit) {
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var to by remember { mutableStateOf(start.to) }
    var subject by remember { mutableStateOf(start.subject) }
    var text by remember { mutableStateOf(start.text) }
    var busy by remember { mutableStateOf(false) }
    VsSheet({ if (!busy) onDone(false) }) {
        Text("Новое письмо", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(bottom = 12.dp))
        OutlinedTextField(to, { to = it.take(60).trim() }, Modifier.fillMaxWidth(), label = { Text("Кому") }, singleLine = true,
            placeholder = { Text("ник") }, suffix = { Text("@vsmske") })
        OutlinedTextField(subject, { subject = it.take(200) }, Modifier.fillMaxWidth().padding(top = 6.dp), label = { Text("Тема") }, singleLine = true)
        OutlinedTextField(text, { text = it.take(10000) }, Modifier.fillMaxWidth().padding(top = 6.dp), label = { Text("Письмо") }, minLines = 5, maxLines = 10)
        Button({
            busy = true
            scope.safe({ busy = false; toast(it) }) { Api.sendMail(to, subject, text); toast("Письмо отправлено"); onDone(true) }
        }, Modifier.fillMaxWidth().padding(top = 12.dp).height(52.dp), enabled = !busy && to.isNotBlank() && text.isNotBlank()) {
            if (busy) ExpressiveLoader(24.dp, MaterialTheme.colorScheme.onPrimary) else Text("Отправить")
        }
    }
}
