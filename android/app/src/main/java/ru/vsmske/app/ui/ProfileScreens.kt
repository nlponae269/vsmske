package ru.vsmske.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PersonRemove
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Redeem
import androidx.compose.material.icons.rounded.SmartDisplay
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Gift
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.User
import ru.vsmske.app.data.ago
import ru.vsmske.app.data.plural
import ru.vsmske.app.rtc.Call

/* Профиль 3.0: обложка-градиент (как COVERS на сайте), аватарка-«печенька», быстрые кнопки, подарки, стена. */

val COVERS = linkedMapOf(
    "blue" to listOf(Color(0xFF4F46E5), Color(0xFF7C3AED), Color(0xFFC026D3)), "sunset" to listOf(Color(0xFFF2994A), Color(0xFFD0462F), Color(0xFFB4398F)),
    "sea" to listOf(Color(0xFF1F8A5B), Color(0xFF2B8BB5)), "night" to listOf(Color(0xFF141A33), Color(0xFF4E5B76)),
    "rose" to listOf(Color(0xFFB4398F), Color(0xFFF06C9B)), "gold" to listOf(Color(0xFFC98A12), Color(0xFFF2C94C)),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(id: String, tab: Boolean = false) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val users by Store.users.collectAsState()
    val meU by Store.me.collectAsState()
    val own = id == Store.uid
    LaunchedEffect(id) { runCatching { Store.fetchUser(id) }.onFailure { toast(errText(it)) } }
    val u = if (own) meU else users[id]
    var compose by rememberSaveable { mutableStateOf(false) }
    var askOut by remember { mutableStateOf(false) }
    val canWall = u != null && !u.banned && (own || (id in (meU?.friends ?: emptyList()) && u.wallPrivacy != "me" && Store.uid !in u.blocked))
    val (posts, more) = rememberPosts(id) { lim -> Api.wallQuery(id, lim) }
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        floatingActionButton = { if (canWall) ExtendedFloatingActionButton(onClick = { compose = true }, icon = { Icon(Icons.Rounded.Edit, null) }, text = { Text("Запись") }) },
    ) { pad ->
        Box(Modifier.fillMaxSize()) {
            when {
                u == null -> Loading(Modifier.padding(top = 120.dp))
                u.banned -> BannedCard(u, Modifier.statusBarsPadding().padding(top = 56.dp))
                else -> PostList(if (u.missing) emptyList() else posts, more, PaddingValues(bottom = 96.dp + pad.calculateBottomPadding()), empty = if (own) "Напишите первую запись" else "На стене пока пусто") {
                    item { ProfileHeader(u, own) }
                }
            }
            TopAppBar(title = {}, colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                navigationIcon = { if (!tab) IconButton({ nav.popBackStack() }, Modifier.padding(4.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.25f))) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад", tint = Color.White) } },
                actions = {
                    if (own) {
                        IconButton({ nav.navigate("edit") }, Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.25f))) { Icon(Icons.Rounded.Edit, "Редактировать", tint = Color.White) }
                        Spacer(Modifier.width(6.dp))
                        IconButton({ askOut = true }, Modifier.padding(end = 6.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.25f))) { Icon(Icons.AutoMirrored.Outlined.Logout, "Выйти", tint = Color.White) }
                    }
                })
        }
    }
    if (compose) Composer(id) { compose = false }
    if (askOut) AlertDialog({ askOut = false }, title = { Text("Выйти из аккаунта?") },
        confirmButton = { TextButton({ askOut = false; ru.vsmske.app.music.Music.stop(); Api.signOut() }) { Text("Выйти") } },
        dismissButton = { TextButton({ askOut = false }) { Text("Отмена") } })
}

@Composable
private fun BannedCard(u: User, modifier: Modifier) {
    Column(modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Avatar(u, 112.dp, shape = CookieShape)
        Text("Deleted Account", style = MaterialTheme.typography.headlineSmall)
        Text("Аккаунт заблокирован" + if (u.banUntil == 0L) " навсегда" else "", color = MaterialTheme.colorScheme.error)
        Text("Страница, записи, фото и музыка этого человека недоступны.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProfileHeader(u: User, own: Boolean) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    val cs = MaterialTheme.colorScheme
    var gifts by remember(u.id) { mutableStateOf<List<Gift>>(emptyList()) }
    var giftSheet by remember { mutableStateOf(false) }
    var callVideo by remember { mutableStateOf(false) }
    LaunchedEffect(u.friends) { Store.need(u.friends.take(12)) }
    LaunchedEffect(u.id) { gifts = runCatching { Media.giftsOf(u.id) }.getOrDefault(emptyList()); Store.need(gifts.map { it.from }) }
    val call = rememberAvPermission { scope.safe(toast) { Call.start(ctx, u.id, callVideo) } }
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(230.dp)) {
            Box(Modifier.fillMaxWidth().height(190.dp).clip(RoundedCornerShape(bottomStart = 36.dp, bottomEnd = 36.dp))
                .background(Brush.linearGradient(COVERS[u.cover] ?: COVERS["blue"]!!))) {
                Text(u.emoji.ifEmpty { "✦" }, fontSize = 140.sp, color = Color.White.copy(alpha = 0.12f), modifier = Modifier.align(Alignment.CenterEnd).offset(x = 30.dp, y = 10.dp))
            }
            Box(Modifier.align(Alignment.BottomStart).padding(start = 20.dp).size(124.dp).clip(CookieShape).background(cs.surface), contentAlignment = Alignment.Center) {
                Avatar(u, 112.dp, shape = CookieShape, showOnline = false)
            }
            if (u.online && !own) Chip("в сети", Color(0xFF34C759), Color.White, Modifier.align(Alignment.BottomStart).padding(start = 110.dp, bottom = 8.dp))
        }
        Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            UserName(u, MaterialTheme.typography.headlineMedium)
            Text("@${u.nick}" + if (!own && !u.online) " · " + (if (u.lastSeen > 0) "был(а) ${ago(u.lastSeen)}" else "давно не заходил(а)") else "",
                color = cs.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
            if (u.status.isNotEmpty()) Text(u.status, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 4.dp))
            if (u.listening.isNotEmpty()) Row(Modifier.padding(top = 6.dp).clip(CircleShape).background(cs.primaryContainer).padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Bars(true, cs.onPrimaryContainer, Modifier.size(14.dp)); Text("  ${u.listening}", style = MaterialTheme.typography.labelLarge, color = cs.onPrimaryContainer, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Stat("${u.friends.size}", plural(u.friends.size, "друг", "друга", "друзей")) { if (own) nav.navigate("friends") }
                Stat("${gifts.size}", plural(gifts.size, "подарок", "подарка", "подарков")) { if (!own) giftSheet = true }
                if (u.city.isNotEmpty()) Stat("📍", u.city) {}
            }
            if (u.about.isNotEmpty()) Text(u.about, style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            if (!own) Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                FriendButtons(u, Modifier.weight(1f, fill = false))
                Spacer(Modifier.width(8.dp))
                FilledTonalIconButton({ callVideo = false; call(false) }) { Icon(Icons.Rounded.Call, "Позвонить") }
                FilledTonalIconButton({ callVideo = true; call(true) }) { Icon(Icons.Rounded.Videocam, "Видеозвонок") }
            }
        }
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            item { QuickTile(Icons.Rounded.PhotoLibrary, "Фото", Color(0xFF2B8BB5)) { nav.navigate("albums/${u.id}") } }
            item { QuickTile(Icons.Rounded.SmartDisplay, "Видео", Color(0xFFD0462F)) { nav.navigate("videos/${u.id}") } }
            item { QuickTile(Icons.Rounded.MusicNote, "Музыка", Color(0xFF6A47C9)) { nav.navigate("music/user/${u.id}") } }
            if (!own) item { QuickTile(Icons.Rounded.Redeem, "Подарить", Color(0xFFC98A12)) { giftSheet = true } }
        }
        val fr = u.friends.take(10).mapNotNull { users[it] }
        if (fr.isNotEmpty()) {
            SectionTitle("Друзья · ${u.friends.size}")
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                items(fr, key = { it.id }) { f ->
                    Column(Modifier.width(64.dp).clickable { nav.openProfile(f.id) }, horizontalAlignment = Alignment.CenterHorizontally) {
                        Avatar(f, 56.dp); Text(f.name.substringBefore(' '), style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        if (gifts.isNotEmpty()) {
            SectionTitle("Подарки")
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(gifts.take(30), key = { it.id }) { g ->
                    val from = users[g.from]
                    Column(Modifier.width(92.dp).clip(RoundedCornerShape(22.dp)).background(cs.surfaceContainerHigh).padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(Media.GIFTS[g.gift]?.first ?: "🎁", fontSize = 40.sp)
                        Text(from?.name?.substringBefore(' ') ?: "…", style = MaterialTheme.typography.labelSmall, maxLines = 1, color = cs.onSurfaceVariant)
                    }
                }
            }
        }
        Text("Записи", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(start = 20.dp, top = 20.dp, bottom = 4.dp))
    }
    if (giftSheet) GiftSheet(u) { sent -> giftSheet = false; if (sent) scope.safe(toast) { gifts = Media.giftsOf(u.id) } }
}

@Composable
private fun Stat(n: String, label: String, onClick: () -> Unit) =
    Row(Modifier.clip(CircleShape).clickable(onClick = onClick).padding(vertical = 4.dp), verticalAlignment = Alignment.Bottom) {
        Text(n, style = MaterialTheme.typography.titleMedium); Text(" $label", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }

@Composable
private fun QuickTile(icon: ImageVector, label: String, tint: Color, onClick: () -> Unit) =
    Column(Modifier.width(84.dp).clip(RoundedCornerShape(24.dp)).background(tint.copy(alpha = 0.13f)).clickable(onClick = onClick).padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(28.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 6.dp))
    }

/** Подарок: 16 подарков как на сайте и подпись */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GiftSheet(u: User, onDone: (Boolean) -> Unit) {
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var pick by remember { mutableStateOf("gift") }
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    VsSheet({ onDone(false) }) {
        Text("Подарок для ${u.name.substringBefore(' ')}", style = MaterialTheme.typography.headlineSmall)
        FlowRow(Modifier.padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 4) {
            Media.GIFTS.forEach { (k, v) ->
                val on = pick == k
                Column(Modifier.weight(1f).clip(RoundedCornerShape(20.dp)).background(if (on) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh)
                    .then(if (on) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(20.dp)) else Modifier).clickable { pick = k }.padding(vertical = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(v.first, fontSize = 34.sp); Text(v.second, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
            }
        }
        OutlinedTextField(text, { text = it.take(200) }, Modifier.fillMaxWidth(), placeholder = { Text("Пожелание (необязательно)") }, shape = CircleShape, singleLine = true)
        Button({ busy = true; scope.safe({ busy = false; toast(it) }) { Media.sendGift(u.id, pick, text); toast("Подарок отправлен 🎉"); onDone(true) } },
            Modifier.fillMaxWidth().padding(top = 12.dp).height(52.dp), enabled = !busy) { Text("Подарить ${Media.GIFTS[pick]?.first ?: ""}") }
    }
}

/** Кнопки дружбы и «Написать» — как на сайте */
@Composable
fun FriendButtons(u: User, modifier: Modifier = Modifier) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val me by Store.me.collectAsState()
    val inc by Store.incoming.collectAsState()
    val out by Store.outgoing.collectAsState()
    var ask by remember { mutableStateOf(false) }
    val friend = u.id in (me?.friends ?: emptyList())
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        when {
            friend -> OutlinedButton({ ask = true }) { Icon(Icons.Rounded.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Друзья") }
            inc.any { it.from == u.id } -> Button({ scope.safe(toast) { Api.friendAccept(u.id); toast("Теперь вы друзья") } }) { Icon(Icons.Rounded.PersonAdd, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Принять") }
            out.any { it.to == u.id } -> OutlinedButton({ scope.safe(toast) { Api.friendCancel(u.id); toast("Заявка отменена") } }) { Text("Заявка") }
            else -> Button({ scope.safe(toast) { Api.friendAdd(u.id); toast("Заявка отправлена") } }) { Icon(Icons.Rounded.PersonAdd, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Добавить") }
        }
        FilledTonalButton({ nav.navigate("chat/${u.id}") }) { Icon(Icons.Outlined.ChatBubbleOutline, null, Modifier.size(18.dp)) }
    }
    if (ask) AlertDialog({ ask = false }, title = { Text("Удалить из друзей?") }, text = { Text(u.name) },
        icon = { Icon(Icons.Rounded.PersonRemove, null) },
        confirmButton = { TextButton({ ask = false; scope.safe(toast) { Api.friendRemove(u.id); toast("Удалено из друзей") } }) { Text("Удалить") } },
        dismissButton = { TextButton({ ask = false }) { Text("Отмена") } })
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EditProfileScreen() {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val me = Store.me.collectAsState().value ?: return
    var name by rememberSaveable { mutableStateOf(me.name) }
    var city by rememberSaveable { mutableStateOf(me.city) }
    var status by rememberSaveable { mutableStateOf(me.status) }
    var about by rememberSaveable { mutableStateOf(me.about) }
    var cover by rememberSaveable { mutableStateOf(me.cover) }
    var photo by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri != null) scope.safe(toast) { photo = Images.compress(ctx, uri, 256, 120_000, square = true) }
    }
    BackScaffold("Редактирование") { pad ->
        Column(Modifier.fillMaxSize().padding(top = pad.calculateTopPadding()).imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(28.dp)).background(Brush.linearGradient(COVERS[cover] ?: COVERS["blue"]!!)), contentAlignment = Alignment.Center) {
                Box(Modifier.size(112.dp).clip(CookieShape).clickable { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, contentAlignment = Alignment.Center) {
                    val src = photo ?: me.photo
                    if (Images.safe(src).isNotEmpty()) DbImage(src, Modifier.fillMaxSize(), ContentScale.Crop) else Avatar(me, 112.dp, shape = CookieShape, showOnline = false)
                    Box(Modifier.fillMaxSize().background(Color(0x55000000)), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.PhotoCamera, "Фото", tint = Color.White) }
                }
            }
            if (photo != "" && (photo != null || me.photo.isNotEmpty())) TextButton({ photo = "" }) { Text("Убрать фото") }
            Text("Обложка", style = MaterialTheme.typography.titleSmall, modifier = Modifier.fillMaxWidth())
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                COVERS.forEach { (k, c) ->
                    Box(Modifier.size(48.dp).clip(CircleShape).background(Brush.linearGradient(c)).then(if (cover == k) Modifier.border(3.dp, MaterialTheme.colorScheme.onSurface, CircleShape) else Modifier)
                        .clickable { cover = k }, contentAlignment = Alignment.Center) { if (cover == k) Icon(Icons.Rounded.Check, null, tint = Color.White) }
                }
            }
            OutlinedTextField(name, { name = it.take(60) }, label = { Text("Имя") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(status, { status = it.take(120) }, label = { Text("Статус") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(city, { city = it.take(40) }, label = { Text("Город") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(about, { about = it.take(600) }, label = { Text("О себе") }, minLines = 3, modifier = Modifier.fillMaxWidth())
            Button(onClick = {
                busy = true
                scope.safe({ busy = false; toast(it) }) { Api.saveProfile(name, city, status, about, photo, cover); toast("Сохранено"); nav.popBackStack() }
            }, enabled = !busy && name.isNotBlank(), modifier = Modifier.fillMaxWidth().height(52.dp)) {
                if (busy) ExpressiveLoader(24.dp, MaterialTheme.colorScheme.onPrimary) else Text("Сохранить")
            }
        }
    }
}
