package ru.vsmske.app.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Comment
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import ru.vsmske.app.data.Fb
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Post
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Session
import ru.vsmske.app.data.ago
import ru.vsmske.app.ui.Avatar
import ru.vsmske.app.ui.Card
import ru.vsmske.app.ui.DbImage
import ru.vsmske.app.ui.Field
import ru.vsmske.app.ui.GradButton
import ru.vsmske.app.ui.IconBtn
import ru.vsmske.app.ui.LocalNav
import ru.vsmske.app.ui.LocalToast
import ru.vsmske.app.ui.UserName
import ru.vsmske.app.ui.Vs
import ru.vsmske.app.ui.openProfile
import ru.vsmske.app.ui.safe

/** Новая запись: текст и до 4 фото (сжимаются так же, как на сайте, чтобы запись влезла в 1 МБ) */
@Composable
fun Composer(wall: String, hint: String = "Что у вас нового?") {
    val me by Session.me.collectAsState()
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    val pics = remember { mutableStateListOf<Uri>() }
    var busy by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(4)) { list ->
        list.forEach { if (pics.size < 4) pics.add(it) }
    }
    Card {
        Row(verticalAlignment = Alignment.Top) {
            Avatar(me, 42.dp)
            Spacer(Modifier.width(10.dp))
            Field(text, { text = it.take(4000) }, hint, singleLine = false, modifier = Modifier.weight(1f))
        }
        if (pics.isNotEmpty()) Row(Modifier.padding(top = 10.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            pics.forEach { u ->
                Box(Modifier.size(84.dp).clip(RoundedCornerShape(14.dp))) {
                    AsyncImage(u, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    Box(Modifier.align(Alignment.TopEnd).padding(4.dp).size(24.dp).clip(CircleShape).background(Color(0x99000000)).clickable { pics.remove(u) }, contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.Close, "Убрать", tint = Color.White, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            IconBtn(Icons.Rounded.Image, "Фото", tint = Vs.accent) {
                if (pics.size >= 4) toast("Не больше 4 фото в записи")
                else picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }
            Spacer(Modifier.weight(1f))
            GradButton("Опубликовать", busy = busy, enabled = text.isNotBlank() || pics.isNotEmpty()) {
                busy = true
                scope.safe(toast) {
                    try {
                        val n = pics.size
                        val imgs = pics.map { Images.compress(ctx, it, if (n > 1) 1080 else 1280, if (n > 1) 880_000 / n else Images.MAX_POST_IMG) }
                        Repo.createPost(wall, text.trim(), imgs)
                        text = ""; pics.clear(); toast("Опубликовано")
                    } finally { busy = false }
                }
            }
        }
    }
}

@Composable
fun PostCard(p: Post, onOpen: (() -> Unit)? = null, nested: Boolean = false) {
    val users by Repo.users.collectAsState()
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val me = Fb.uid
    LaunchedEffect(p.authorId, p.wallId) { Repo.ensureUsers(listOf(p.authorId, p.wallId)) }
    val author = users[p.authorId]
    val wallUser = if (p.groupId.isEmpty() && p.wallId != p.authorId) users[p.wallId] else null
    var menu by remember { mutableStateOf(false) }
    var viewer by remember { mutableStateOf<String?>(null) }
    val liked = me in p.likes

    Card(Modifier.then(if (nested) Modifier.padding(top = 8.dp) else Modifier)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(author, if (nested) 34.dp else 44.dp, author?.online == true) { nav.openProfile(p.authorId) }
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    UserName(author, modifier = Modifier.weight(1f, fill = false).clickable { nav.openProfile(p.authorId) })
                    if (wallUser != null) Text("  →  " + wallUser.name, style = MaterialTheme.typography.bodySmall, maxLines = 1, modifier = Modifier.clickable { nav.openProfile(p.wallId) })
                }
                Text(ago(p.createdAt) + if (p.edited) " · изменено" else "", style = MaterialTheme.typography.bodySmall)
            }
            if (!nested && (p.authorId == me || p.wallId == me || Session.me.value?.admin == true)) Box {
                IconBtn(Icons.Rounded.MoreHoriz, "Ещё", tint = Vs.muted) { menu = true }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem({ Text("Удалить запись") }, leadingIcon = { Icon(Icons.Rounded.Delete, null) }, onClick = {
                        menu = false; scope.safe(toast) { Repo.deletePost(p.id); toast("Запись удалена") }
                    })
                }
            }
        }
        if (p.text.isNotEmpty()) SelectionContainer {
            Text(p.text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 10.dp).then(if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier))
        }
        if (p.images.isNotEmpty()) PostImages(p.images) { viewer = it }
        p.poll?.let { PollView(p) }
        if (p.repostOf.isNotEmpty() && !nested) {
            var orig by remember(p.repostOf) { mutableStateOf<Post?>(null) }
            var gone by remember(p.repostOf) { mutableStateOf(false) }
            LaunchedEffect(p.repostOf) { orig = Repo.getPost(p.repostOf); gone = orig == null }
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Repeat, null, tint = Vs.muted, modifier = Modifier.size(16.dp))
                Text(" Репост", style = MaterialTheme.typography.bodySmall)
            }
            orig?.let { PostCard(it, onOpen = { nav.navigate("post/${it.id}") }, nested = true) }
            if (gone) Text("Запись удалена", style = MaterialTheme.typography.bodySmall)
        }
        if (!nested) Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            val c by animateColorAsState(if (liked) Vs.pink else Vs.fg.copy(alpha = 0.8f), label = "like")
            Pill(if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, p.likes.size, c, liked) {
                scope.safe(toast) { Repo.toggleLike(p) }
            }
            Pill(Icons.AutoMirrored.Rounded.Comment, p.commentCount, Vs.fg.copy(alpha = 0.8f)) { onOpen?.invoke() ?: nav.navigate("post/${p.id}") }
            if (p.reposts > 0) Pill(Icons.Rounded.Repeat, p.reposts, Vs.muted) {}
        }
    }
    viewer?.let { ImageViewer(it) { viewer = null } }
}

@Composable
private fun Pill(icon: androidx.compose.ui.graphics.vector.ImageVector, n: Int, color: Color, on: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(if (on) Vs.pink.copy(alpha = 0.16f) else Color(0x14FFFFFF))
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(18.dp))
        if (n > 0) Text(" $n", color = color, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun PostImages(list: List<String>, onOpen: (String) -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Column(Modifier.padding(top = 10.dp).fillMaxWidth().clip(shape), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        when (list.size) {
            1 -> DbImage(list[0], Modifier.fillMaxWidth().heightIn(min = 120.dp, max = 480.dp).clickable { onOpen(list[0]) }, scale = ContentScale.FillWidth)
            else -> list.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    row.forEach { s -> DbImage(s, Modifier.weight(1f).aspectRatio(1f).clickable { onOpen(s) }) }
                    if (row.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
fun ImageViewer(src: String, onClose: () -> Unit) {
    Dialog(onClose, DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color(0xF2000000)).clickable(onClick = onClose), contentAlignment = Alignment.Center) {
            DbImage(src, Modifier.fillMaxWidth(), scale = ContentScale.Fit)
            IconBtn(Icons.Rounded.Close, "Закрыть", Modifier.align(Alignment.TopEnd).padding(24.dp), tint = Color.White, onClick = onClose)
        }
    }
}

@Composable
private fun PollView(p: Post) {
    val poll = p.poll ?: return
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val me = Fb.uid
    val mine = poll.votes[me]
    val total = poll.votes.size
    Column(Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0x0FFFFFFF)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(poll.q, style = MaterialTheme.typography.titleSmall)
        poll.options.forEachIndexed { i, o ->
            val n = poll.votes.values.count { it == i }
            val pct = if (total > 0) n.toFloat() / total else 0f
            Box(
                Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(12.dp)).background(Color(0x14FFFFFF))
                    .clickable { scope.safe(toast) { Repo.vote(p, i) } },
            ) {
                if (mine != null) Box(Modifier.fillMaxWidth(pct).height(40.dp).background(if (mine == i) Vs.p1.copy(alpha = 0.55f) else Color(0x22FFFFFF)))
                Row(Modifier.fillMaxSize().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(o, modifier = Modifier.weight(1f), fontWeight = if (mine == i) FontWeight.SemiBold else FontWeight.Normal)
                    if (mine != null) Text("${(pct * 100).toInt()}%", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        Text("$total ${ru.vsmske.app.data.plural(total, "голос", "голоса", "голосов")}", style = MaterialTheme.typography.bodySmall)
    }
}
