package ru.vsmske.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import ru.vsmske.app.data.NOTIF_TEXT
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Session
import ru.vsmske.app.data.ago
import ru.vsmske.app.ui.Avatar
import ru.vsmske.app.ui.Card
import ru.vsmske.app.ui.Empty
import ru.vsmske.app.ui.Header
import ru.vsmske.app.ui.HeaderSpec
import ru.vsmske.app.ui.LocalNav
import ru.vsmske.app.ui.LocalPad
import ru.vsmske.app.ui.Vs
import ru.vsmske.app.ui.openProfile

private val ICON = mapOf("like" to "❤️", "comment" to "💬", "wall" to "📝", "friend" to "🤝", "repost" to "🔁", "answer" to "💡",
    "best" to "🏆", "mention" to "📣", "gift" to "🎁", "nick" to "💎")

@Composable
fun NotifsScreen() {
    val list by Session.notifs.collectAsState()
    val users by Repo.users.collectAsState()
    val me by Session.me.collectAsState()
    val nav = LocalNav.current
    val seenBefore = remember0(me?.notifSeenAt ?: 0)
    Header(HeaderSpec("Сигналы"))
    LaunchedEffect(list.size) { if (Session.unseenNotifs() > 0) Repo.markNotifsSeen() }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPad(LocalPad.current), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (list.isEmpty()) item { Empty("Сигналов пока нет", "Здесь появятся лайки, комментарии и заявки") }
        items(list, key = { it.id }) { n ->
            val u = users[n.from]
            val fresh = n.createdAt > seenBefore
            Card {
                Row(
                    Modifier.clickable { if (n.postId.isNotEmpty()) nav.navigate("post/${n.postId}") else nav.openProfile(n.from) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(u, 46.dp) { nav.openProfile(n.from) }
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(buildAnnotatedString {
                            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(u?.name ?: "Кто-то") }
                            append(" " + (NOTIF_TEXT[n.type] ?: ""))
                        }, style = MaterialTheme.typography.bodyMedium)
                        if (n.text.isNotEmpty()) Text("«${n.text}»", style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(ago(n.createdAt), style = MaterialTheme.typography.bodySmall, color = if (fresh) Vs.accent else Vs.muted)
                    }
                    Text(ICON[n.type] ?: "🔔", style = MaterialTheme.typography.titleLarge)
                }
            }
        }
    }
}

/** Запоминаем, когда смотрели раньше, — чтобы новые подсветить, даже когда отметка уже обновилась */
@Composable
private fun remember0(v: Long): Long = androidx.compose.runtime.remember { v }
