package ru.vsmske.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.catch
import ru.vsmske.app.data.Comment
import ru.vsmske.app.data.Fb
import ru.vsmske.app.data.Post
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Session
import ru.vsmske.app.data.ago
import ru.vsmske.app.ui.Avatar
import ru.vsmske.app.ui.Card
import ru.vsmske.app.ui.Empty
import ru.vsmske.app.ui.Field
import ru.vsmske.app.ui.Header
import ru.vsmske.app.ui.HeaderSpec
import ru.vsmske.app.ui.IconBtn
import ru.vsmske.app.ui.Loading
import ru.vsmske.app.ui.LocalNav
import ru.vsmske.app.ui.LocalPad
import ru.vsmske.app.ui.LocalToast
import ru.vsmske.app.ui.Tabs
import ru.vsmske.app.ui.UserName
import ru.vsmske.app.ui.Vs
import ru.vsmske.app.ui.errText
import ru.vsmske.app.ui.openProfile
import ru.vsmske.app.ui.safe

fun listPad(p: PaddingValues) = PaddingValues(start = 12.dp, end = 12.dp, top = p.calculateTopPadding(), bottom = p.calculateBottomPadding())

@Composable
fun FeedScreen() {
    val me by Session.me.collectAsState()
    var tab by rememberSaveable { mutableStateOf("friends") }
    val friends = me?.friends ?: emptyList()
    val flow = remember(tab, friends) { if (tab == "all") Repo.allFeed() else Repo.friendsFeed(listOf(Fb.uid) + friends) }
    var err by remember { mutableStateOf<String?>(null) }
    val posts by remember(flow) { flow.catch { err = errText(it) } }.collectAsState(initial = null)
    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPad(LocalPad.current), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Composer(Fb.uid) }
        item { Tabs(listOf("friends" to "Друзья", "all" to "Все записи"), tab, { tab = it }) }
        val list = posts
        when {
            err != null -> item { Empty("Не удалось загрузить ленту", err ?: "") }
            list == null -> item { Loading() }
            list.isEmpty() -> item { Empty("Здесь появятся записи ваших друзей", "Напишите первую запись или найдите знакомых") }
            else -> items(list, key = { it.id }) { p -> PostCard(p) }
        }
    }
}

/** Одна запись и комментарии к ней */
@Composable
fun PostScreen(id: String) {
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val post by remember(id) { Repo.post(id).catch { } }.collectAsState(initial = null)
    val comments by remember(id) { Repo.comments(id).catch { } }.collectAsState(initial = emptyList())
    val users by Repo.users.collectAsState()
    var text by remember { mutableStateOf("") }
    Header(HeaderSpec("Запись", if (comments.isNotEmpty()) "${comments.size} комм." else ""))
    LaunchedEffect(comments) { Repo.ensureUsers(comments.map { it.authorId }) }
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars))) {
        LazyColumn(Modifier.weight(1f), contentPadding = listPad(LocalPad.current).let { PaddingValues(start = 12.dp, end = 12.dp, top = it.calculateTopPadding(), bottom = 12.dp) }, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val p = post
            if (p == null) item { Loading() } else {
                item { PostCard(p) }
                items(comments, key = { it.id }) { c -> CommentRow(p, c, users[c.authorId]) }
                if (comments.isEmpty()) item { Empty("Комментариев пока нет", "Будьте первым") }
            }
        }
        val p = post
        if (p != null) Card(Modifier.padding(start = 12.dp, end = 12.dp, bottom = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Field(text, { text = it.take(1000) }, "Комментарий", singleLine = false, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(6.dp))
                IconBtn(Icons.AutoMirrored.Rounded.Send, "Отправить", tint = Vs.accent) {
                    val t = text.trim(); if (t.isEmpty()) return@IconBtn
                    text = ""; scope.safe(toast) { Repo.addComment(p, t) }
                }
            }
        }
    }
}

@Composable
private fun CommentRow(p: Post, c: Comment, u: ru.vsmske.app.data.User?) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val me = Fb.uid
    Card {
        Row(verticalAlignment = Alignment.Top) {
            Avatar(u, 36.dp) { nav.openProfile(c.authorId) }
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                UserName(u, modifier = Modifier.clickable { nav.openProfile(c.authorId) })
                Text(c.text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                    Text(ago(c.createdAt), style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                    val liked = me in c.likes
                    Row(Modifier.clickable { scope.safe(toast) { Repo.toggleCommentLike(p.id, c) } }.padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, "Нравится", tint = if (liked) Vs.pink else Vs.muted, modifier = Modifier.padding(end = 2.dp))
                        if (c.likes.isNotEmpty()) Text("${c.likes.size}", style = MaterialTheme.typography.labelMedium, color = Vs.muted)
                    }
                    if (c.authorId == me || p.authorId == me || p.wallId == me) IconBtn(Icons.Rounded.Delete, "Удалить", tint = Vs.muted, size = 32.dp) {
                        scope.safe(toast) { Repo.deleteComment(p.id, c.id) }
                    }
                }
            }
        }
    }
}

