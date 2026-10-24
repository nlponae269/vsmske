package ru.vsmske.app.ui

import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.BookmarkRemove
import androidx.compose.material.icons.rounded.BookmarkAdd
import androidx.compose.foundation.horizontalScroll
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Poll
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import kotlinx.coroutines.tasks.await
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Comment
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Post
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.ago

/** Живой список записей по запросу (лента, стена); limit растёт при прокрутке вниз */
@Composable
fun rememberPosts(key: Any, query: (Long) -> Query?): Pair<List<Post>?, () -> Unit> {
    var limit by remember(key) { mutableStateOf(20L) }
    var list by remember(key) { mutableStateOf<List<Post>?>(null) }
    val toast = LocalToast.current
    DisposableEffect(key, limit) {
        val q = query(limit)
        var reg: ListenerRegistration? = null
        if (q == null) list = emptyList()
        else reg = q.addSnapshotListener { s, e ->
            if (e != null) { toast(errText(e)); if (list == null) list = emptyList(); return@addSnapshotListener }
            val l = s?.documents?.map(Post::from) ?: emptyList()
            Store.need(l.flatMap { listOf(it.authorId, it.wallId) })
            list = l
        }
        onDispose { reg?.remove() }
    }
    return list to { if ((list?.size ?: 0) >= limit) limit += 20 }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen() {
    val nav = LocalNav.current
    val me by Store.me.collectAsState()
    var tab by rememberSaveable { mutableStateOf("friends") }
    var compose by rememberSaveable { mutableStateOf(false) }
    val ids = remember(me?.friends) { listOf(Store.uid) + (me?.friends ?: emptyList()).takeLast(29) }
    val (posts, more) = rememberPosts(tab to ids) { lim -> if (tab == "all") Api.allQuery(lim) else Api.feedQuery(ids, lim) }
    val unseen = Store.notifs.collectAsState().value.let { Store.unseenNotifs() }
    var stories by remember { mutableStateOf<List<ru.vsmske.app.data.Story>>(emptyList()) }
    var storyVer by remember { mutableStateOf(0) }
    LaunchedEffect(ids, storyVer) { stories = runCatching { ru.vsmske.app.data.Media.stories(ids) }.getOrDefault(emptyList()); Store.need(stories.map { it.ownerId }) }
    val scroll = TopAppBarDefaults.enterAlwaysScrollBehavior()
    Scaffold(
        modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
        contentWindowInsets = WindowInsets(0),
        topBar = {
            TopAppBar(
                title = { Row(verticalAlignment = Alignment.CenterVertically) { Logo(); Spacer(Modifier.width(12.dp)); Text("VСмске") } },
                actions = {
                    IconButton({ nav.navigate("search") }) { Icon(Icons.Rounded.Search, "Поиск") }
                    IconButton({ nav.navigate("notifs") }) {
                        BadgedBox(badge = { if (unseen > 0) Badge { Text(if (unseen > 99) "99+" else "$unseen") } }) { Icon(Icons.Outlined.Notifications, "Сигналы") }
                    }
                },
                scrollBehavior = scroll,
            )
        },
        floatingActionButton = { ExtendedFloatingActionButton(onClick = { compose = true }, icon = { Icon(Icons.Rounded.Edit, null) }, text = { Text("Запись") }) },
    ) { pad ->
        PostList(posts, more, PaddingValues(top = pad.calculateTopPadding(), bottom = 96.dp)) {
            item { StoriesRow(stories) { storyVer++ } }
            item { LiveNowCard() }
            item {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(tab == "friends", { tab = "friends" }, { Text("Друзья") }, shape = CircleShape)
                    FilterChip(tab == "all", { tab = "all" }, { Text("Все записи") }, shape = CircleShape)
                }
            }
        }
    }
    if (compose) Composer(Store.uid) { compose = false }
}

@Composable
fun PostList(posts: List<Post>?, more: () -> Unit, pad: PaddingValues, empty: String = "Здесь пока нет записей", header: androidx.compose.foundation.lazy.LazyListScope.() -> Unit = {}) {
    val state = rememberLazyListState()
    val end by remember { derivedStateOf { state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 } }
    LaunchedEffect(end, posts?.size) { if (posts != null && end >= state.layoutInfo.totalItemsCount - 3) more() }
    LazyColumn(Modifier.fillMaxSize(), state = state, contentPadding = pad, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        header()
        when {
            posts == null -> item { Loading() }
            posts.isEmpty() -> item { EmptyState(empty) }
            else -> items(posts, key = { it.id }) { PostCard(it) }
        }
    }
}

/** Запись: автор, текст, фото, опрос, кнопки «нравится» и «комментарии» */
@Composable
fun PostCard(p: Post, open: Boolean = false) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    val me = Store.uid
    val a = users[p.authorId]
    val wall = if (p.wallId != p.authorId && p.groupId.isEmpty()) users[p.wallId] else null
    val liked = me in p.likes
    var menu by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf(false) }
    val canDel = p.authorId == me || p.wallId == me || Store.me.value?.admin == true
    Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp).animateContentSize(), shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(a, 44.dp) { nav.openProfile(p.authorId) }
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        UserName(a, modifier = Modifier.weight(1f, fill = false).clickable { nav.openProfile(p.authorId) })
                        if (wall != null) { Text("  →  ", color = MaterialTheme.colorScheme.onSurfaceVariant); UserName(wall, modifier = Modifier.clickable { nav.openProfile(wall.id) }) }
                    }
                    Text(ago(p.createdAt) + if (p.editedAt > 0) " · изменено" else "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Box {
                    val saved = p.id in (Store.me.collectAsState().value?.saved ?: emptyList())
                    val ctx = androidx.compose.ui.platform.LocalContext.current
                    IconButton({ menu = true }) { Icon(Icons.Rounded.MoreVert, "Ещё") }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem({ Text(if (saved) "Убрать из закладок" else "В закладки") },
                            leadingIcon = { Icon(if (saved) Icons.Rounded.BookmarkRemove else Icons.Rounded.BookmarkAdd, null) },
                            onClick = { menu = false; scope.safe(toast) { toast(if (Api.toggleBookmark(p)) "Добавлено в закладки" else "Убрано из закладок") } })
                        DropdownMenuItem({ Text("Поделиться ссылкой") }, leadingIcon = { Icon(Icons.Rounded.Share, null) },
                            onClick = { menu = false; share(ctx, SITE + "post/" + p.id) })
                        if (canDel) DropdownMenuItem({ Text("Удалить") }, leadingIcon = { Icon(Icons.Rounded.Delete, null) }, onClick = { menu = false; ask = true })
                    }
                }
            }
            if (p.text.isNotEmpty()) RichText(p.text, style = MaterialTheme.typography.bodyLarge)
            if (p.repostOf.isNotEmpty()) RepostBox(p.repostOf)
            Pics(p, a?.banned == true) { if (!liked) scope.safe(toast) { Api.toggleLike(p) } }
            p.poll?.let { PollBox(p) }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(liked, { scope.safe(toast) { Api.toggleLike(p) } },
                    { Text(if (p.likes.isEmpty()) "Нравится" else "${p.likes.size}") },
                    leadingIcon = { Icon(if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, null, Modifier.size(18.dp)) }, shape = CircleShape)
                if (!open) FilterChip(false, { nav.navigate("post/${p.id}") }, { Text(if (p.commentCount == 0) "Комментировать" else "${p.commentCount}") },
                    leadingIcon = { Icon(Icons.Outlined.ChatBubbleOutline, null, Modifier.size(18.dp)) }, shape = CircleShape)
                if (p.authorId != me && p.groupId.isEmpty()) FilterChip(false, { scope.safe(toast) { ru.vsmske.app.data.Media.repost(p); toast("Репост на вашей стене") } },
                    { Text(if (p.reposts > 0) "${p.reposts}" else "") }, leadingIcon = { Icon(Icons.Rounded.Repeat, "Поделиться", Modifier.size(18.dp)) }, shape = CircleShape)
            }
        }
    }
    if (ask) AlertDialog({ ask = false }, title = { Text("Удалить запись?") },
        confirmButton = { TextButton({ ask = false; scope.safe(toast) { Api.deletePost(p); toast("Запись удалена") } }) { Text("Удалить") } },
        dismissButton = { TextButton({ ask = false }) { Text("Отмена") } })
}

@Composable
private fun Pics(p: Post, banned: Boolean, onDoubleLike: () -> Unit) {
    var viewer by remember { mutableStateOf<String?>(null) }
    var heart by remember { mutableStateOf(0) }
    val hk by androidx.compose.animation.core.animateFloatAsState(if (heart % 2 == 1) 1f else 0f, androidx.compose.animation.core.spring(dampingRatio = 0.4f, stiffness = 400f), label = "heart",
        finishedListener = { if (heart % 2 == 1) heart++ })
    val dbl by androidx.compose.runtime.rememberUpdatedState(onDoubleLike)   // свежее «нравится», а не то, что было при первом показе
    fun tap(src: String) = Modifier.pointerInput(src) { detectTapGestures(onDoubleTap = { dbl(); if (heart % 2 == 0) heart++ }, onTap = { viewer = src }) }
    val imgs = p.images
    if (imgs.isEmpty()) return
    val shape = RoundedCornerShape(16.dp)
    if (banned) { Locked("Фото недоступно", Modifier.fillMaxWidth().aspectRatio(16 / 10f).clip(shape)); return }
    Box(contentAlignment = Alignment.Center) {
        if (imgs.size == 1) DbImage(imgs[0], Modifier.fillMaxWidth().heightIn(max = 460.dp).clip(shape).then(tap(imgs[0])), ContentScale.FillWidth)
        else Column(Modifier.clip(shape), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            imgs.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    row.forEach { src -> DbImage(src, Modifier.weight(1f).aspectRatio(1f).then(tap(src))) }
                }
            }
        }
        if (hk > 0.01f) Icon(Icons.Rounded.Favorite, null, tint = Color.White, modifier = Modifier.size(110.dp).graphicsLayer { scaleX = hk; scaleY = hk; alpha = hk })
    }
    viewer?.let { src ->
        androidx.compose.ui.window.Dialog({ viewer = null }, androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
            Box(Modifier.fillMaxSize().background(Color.Black).clickable { viewer = null }, contentAlignment = Alignment.Center) {
                DbImage(src, Modifier.fillMaxWidth(), ContentScale.FillWidth)
            }
        }
    }
}

@Composable
private fun RepostBox(id: String) {
    var orig by remember(id) { mutableStateOf<Post?>(null) }
    var missing by remember(id) { mutableStateOf(false) }
    val users by Store.users.collectAsState()
    LaunchedEffect(id) {
        runCatching { Fire.db.collection("posts").document(id).get().await() }.onSuccess { s ->
            if (s.exists()) { orig = Post.from(s); Store.need(listOf(orig!!.authorId)) } else missing = true
        }
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Rounded.Repeat, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.width(6.dp)); Text("Репост", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        val o = orig
        when {
            missing -> Text("Исходная запись удалена", color = MaterialTheme.colorScheme.onSurfaceVariant)
            o == null -> Text("Загружаем…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> {
                Row(verticalAlignment = Alignment.CenterVertically) { Avatar(users[o.authorId], 28.dp); Spacer(Modifier.width(8.dp)); UserName(users[o.authorId]) }
                if (o.text.isNotEmpty()) RichText(o.text, maxLines = 6)
                if (o.images.isNotEmpty()) { if (users[o.authorId]?.banned == true) Locked("Фото недоступно", Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(12.dp))) else DbImage(o.images[0], Modifier.fillMaxWidth().heightIn(max = 260.dp).clip(RoundedCornerShape(12.dp)), ContentScale.FillWidth) }
            }
        }
    }
}

@Composable
private fun PollBox(p: Post) {
    val poll = p.poll ?: return
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val mine = poll.votes[Store.uid]
    val total = poll.votes.size
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(poll.q, style = MaterialTheme.typography.titleMedium)
        poll.options.forEachIndexed { i, o ->
            val n = poll.votes.values.count { it == i }
            val pct = if (total > 0) n.toFloat() / total else 0f
            Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceContainerHighest)
                .clickable { scope.safe(toast) { Api.vote(p, i) } }) {
                if (mine != null) Box(Modifier.fillMaxWidth(pct).fillMaxSize().background(if (mine == i) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.secondaryContainer))
                Row(Modifier.fillMaxSize().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(o + if (mine == i) "  ✓" else "", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (mine != null) Text("${(pct * 100).toInt()}%", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
        Text("$total ${ru.vsmske.app.data.plural(total, "голос", "голоса", "голосов")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Новая запись — шторка снизу: текст, до 4 фото, опрос */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Composer(wall: String, onDone: () -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var field by rememberSaveable(stateSaver = androidx.compose.ui.text.input.TextFieldValue.Saver) { mutableStateOf(androidx.compose.ui.text.input.TextFieldValue("")) }
    val text = field.text
    val pics = remember { mutableStateListOf<Uri>() }
    var poll by rememberSaveable { mutableStateOf(false) }
    var q by rememberSaveable { mutableStateOf("") }
    val opts = remember { mutableStateListOf("", "") }
    var busy by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(4)) { l -> pics.addAll(l.take(4 - pics.size)) }
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val ready = !busy && (text.isNotBlank() || pics.isNotEmpty() || (poll && opts.count { it.isNotBlank() } >= 2))
    ModalBottomSheet(onDismissRequest = onDone, sheetState = sheet) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 16.dp).imePadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (wall == Store.uid) "Новая запись" else "Запись на стене", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(field, { if (it.text.length <= 4000) field = it }, placeholder = { Text("Что у вас нового?") }, modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp))
            FormatBar { mark -> field = wrapMark(field, mark) }
            if (pics.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(pics.toList()) { u ->
                    Box(Modifier.size(88.dp).clip(RoundedCornerShape(12.dp))) {
                        coil.compose.AsyncImage(u, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        IconButton({ pics.remove(u) }, Modifier.align(Alignment.TopEnd).size(28.dp).padding(2.dp).clip(CircleShape).background(Color(0x99000000))) {
                            Icon(Icons.Rounded.Close, "Убрать", tint = Color.White, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
            if (poll) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(q, { q = it.take(200) }, label = { Text("Вопрос") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                opts.forEachIndexed { i, o -> OutlinedTextField(o, { opts[i] = it.take(100) }, label = { Text("Вариант ${i + 1}") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
                if (opts.size < 6) TextButton({ opts.add("") }) { Text("+ Ещё вариант") }
            }
            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton({ pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = pics.size < 4) { Icon(Icons.Rounded.Image, "Фото") }
                IconButton({ poll = !poll }) { Icon(Icons.Rounded.Poll, "Опрос", tint = if (poll) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                Spacer(Modifier.weight(1f))
                Button(onClick = {
                    busy = true
                    scope.safe({ busy = false; toast(it) }) {
                        val n = pics.size
                        val imgs = pics.map { Images.compress(ctx, it, if (n > 1) 1080 else 1280, if (n > 1) 880_000 / n else 700_000) }
                        val pl = if (poll) (q.ifBlank { "Опрос" } to opts.map { it.trim() }.filter { it.isNotEmpty() }) else null
                        Api.createPost(wall, text, imgs, pl)
                        toast("Опубликовано"); onDone()
                    }
                }, enabled = ready) { if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Опубликовать") }
            }
        }
    }
}

/** Одна запись с комментариями */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PostScreen(id: String) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    var post by remember { mutableStateOf<Post?>(null) }
    var gone by remember { mutableStateOf(false) }
    var comments by remember { mutableStateOf<List<Comment>?>(null) }
    var text by rememberSaveable { mutableStateOf("") }
    DisposableEffect(id) {
        val ref = Fire.db.collection("posts").document(id)
        val a = ref.addSnapshotListener { s, _ -> if (s != null) { if (s.exists()) { post = Post.from(s); Store.need(listOf(post!!.authorId, post!!.wallId)) } else gone = true } }
        val b = ref.collection("comments").orderBy("createdAt").limit(300).addSnapshotListener { s, _ ->
            val l = s?.documents?.map(Comment::from) ?: return@addSnapshotListener; comments = l; Store.need(l.map { it.authorId }) }
        onDispose { a.remove(); b.remove() }
    }
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = { TopAppBar(title = { Text("Запись") }, navigationIcon = { IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } }) },
        bottomBar = {
            val p = post
            if (p != null) Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainer).navigationBarsPadding().imePadding().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                TextField(text, { text = it.take(1000) }, placeholder = { Text("Комментарий…") }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(24.dp),
                    colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent), maxLines = 4)
                IconButton({ val t = text; text = ""; scope.safe(toast) { Api.addComment(p, t) } }, enabled = text.isNotBlank()) { Icon(Icons.AutoMirrored.Rounded.Send, "Отправить", tint = MaterialTheme.colorScheme.primary) }
            }
        },
    ) { pad ->
        val p = post
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding() + 4.dp, bottom = pad.calculateBottomPadding() + 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when {
                gone -> item { EmptyState("Запись удалена") }
                p == null -> item { Loading() }
                else -> {
                    item { PostCard(p, open = true) }
                    item { Text("Комментарии", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) }
                    val cs = comments
                    if (cs == null) item { Loading() } else if (cs.isEmpty()) item { EmptyState("Пока тихо", "Напишите первым") }
                    else items(cs, key = { it.id }) { c ->
                        val a = users[c.authorId]
                        val mine = c.authorId == Store.uid || p.authorId == Store.uid || p.wallId == Store.uid
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                            Avatar(a, 36.dp) { nav.openProfile(c.authorId) }
                            Column(Modifier.padding(start = 10.dp).weight(1f).clip(RoundedCornerShape(4.dp, 18.dp, 18.dp, 18.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(horizontal = 12.dp, vertical = 8.dp)) {
                                UserName(a, MaterialTheme.typography.labelLarge)
                                RichText(c.text, style = MaterialTheme.typography.bodyMedium)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(ago(c.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Spacer(Modifier.weight(1f))
                                    val liked = Store.uid in c.likes
                                    Text((if (liked) "♥ " else "♡ ") + (c.likes.size.takeIf { it > 0 } ?: ""), style = MaterialTheme.typography.labelMedium,
                                        color = if (liked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.clickable { scope.safe(toast) { Api.toggleCommentLike(p, c) } }.padding(4.dp))
                                    if (mine) Text("удалить", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error,
                                        modifier = Modifier.clickable { scope.safe(toast) { Api.deleteComment(p, c) } }.padding(4.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Записи с хэштегом — открывается нажатием на #тег */
@Composable
fun TagScreen(tag: String) {
    val (posts, more) = rememberPosts("tag:$tag") { lim -> Api.tagQuery(tag, lim) }
    val sorted = remember(posts) { posts?.sortedByDescending { it.createdAt } }
    BackScaffold("#$tag") { pad ->
        PostList(sorted, more, PaddingValues(top = pad.calculateTopPadding() + 4.dp, bottom = 24.dp), empty = "С тегом #$tag пока ничего нет")
    }
}

/** Кнопки разметки (как «Aa» на сайте): оборачивают выделенное — или ставят пару значков и курсор между ними */
@Composable
fun FormatBar(onMark: (String) -> Unit) {
    Row(Modifier.horizontalScroll(androidx.compose.foundation.rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("**" to "Ж", "*" to "К", "~~" to "З", "||" to "Спойлер", "`" to "Код").forEach { (m, l) ->
            FilterChip(false, { onMark(m) }, {
                Text(l, fontWeight = if (m == "**") androidx.compose.ui.text.font.FontWeight.Bold else null,
                    fontStyle = if (m == "*") androidx.compose.ui.text.font.FontStyle.Italic else null,
                    textDecoration = if (m == "~~") androidx.compose.ui.text.style.TextDecoration.LineThrough else null,
                    fontFamily = if (m == "`") androidx.compose.ui.text.font.FontFamily.Monospace else null)
            }, shape = CircleShape)
        }
    }
}

fun wrapMark(v: androidx.compose.ui.text.input.TextFieldValue, mark: String): androidx.compose.ui.text.input.TextFieldValue {
    val a = minOf(v.selection.start, v.selection.end).coerceIn(0, v.text.length)
    val b = maxOf(v.selection.start, v.selection.end).coerceIn(0, v.text.length)
    val t = v.text.substring(0, a) + mark + v.text.substring(a, b) + mark + v.text.substring(b)
    if (t.length > 4000) return v
    val sel = if (a == b) androidx.compose.ui.text.TextRange(a + mark.length) else androidx.compose.ui.text.TextRange(a + mark.length, b + mark.length)
    return v.copy(text = t, selection = sel)
}

/** Закладки — записи, сохранённые в users.saved (новые сверху, как на сайте) */
@Composable
fun SavedScreen() {
    val toast = LocalToast.current
    val me by Store.me.collectAsState()
    var posts by remember { mutableStateOf<List<Post>?>(null) }
    val ids = me?.saved ?: emptyList()
    val asked = remember { mutableSetOf<String>() }   // какие id уже запрашивали (удалённые записи не перечитываем каждый раз)
    LaunchedEffect(ids) {
        val have = posts
        if (have != null && asked.containsAll(ids)) { posts = ids.reversed().mapNotNull { id -> have.firstOrNull { it.id == id } }; return@LaunchedEffect }
        asked += ids
        posts = runCatching { Api.postsByIds(ids.reversed()) }.onSuccess { l -> Store.need(l.flatMap { listOf(it.authorId, it.wallId) }) }.getOrElse { toast(errText(it)); emptyList() }
    }
    BackScaffold("Закладки") { pad ->
        PostList(posts, {}, PaddingValues(top = pad.calculateTopPadding() + 4.dp, bottom = 24.dp), empty = "Закладок пока нет — нажмите «⋯» у записи и «В закладки»")
    }
}
