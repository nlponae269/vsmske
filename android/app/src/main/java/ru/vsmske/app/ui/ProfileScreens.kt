package ru.vsmske.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PersonRemove
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.User
import ru.vsmske.app.data.ago
import ru.vsmske.app.data.plural

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(id: String, tab: Boolean = false) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val users by Store.users.collectAsState()
    val meU by Store.me.collectAsState()
    val own = id == Store.uid
    LaunchedEffect(id) { runCatching { Store.fetchUser(id) }.onFailure { toast(errText(it)) } }
    val u = if (own) meU?.let { it } else users[id]
    var compose by rememberSaveable { mutableStateOf(false) }
    var askOut by remember { mutableStateOf(false) }
    val canWall = u != null && !u.banned && (own || (id in (meU?.friends ?: emptyList()) && u.wallPrivacy != "me" && Store.uid !in u.blocked))
    val (posts, more) = rememberPosts(id) { lim -> Api.wallQuery(id, lim) }
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = {
            TopAppBar(
                title = { Text(if (own) "Моя страница" else u?.name ?: "") },
                navigationIcon = { if (!tab) IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } },
                actions = {
                    if (own) {
                        IconButton({ nav.navigate("edit") }) { Icon(Icons.Rounded.Edit, "Редактировать") }
                        IconButton({ askOut = true }) { Icon(Icons.AutoMirrored.Outlined.Logout, "Выйти") }
                    }
                },
            )
        },
        floatingActionButton = { if (canWall) ExtendedFloatingActionButton(onClick = { compose = true }, icon = { Icon(Icons.Rounded.Edit, null) }, text = { Text("Запись") }) },
    ) { pad ->
        if (u == null) { Loading(Modifier.padding(pad)); return@Scaffold }
        if (u.banned) { BannedCard(u, Modifier.padding(top = pad.calculateTopPadding())); return@Scaffold }
        PostList(if (u.missing) emptyList() else posts, more, PaddingValues(top = pad.calculateTopPadding(), bottom = 96.dp), empty = if (own) "Напишите первую запись" else "На стене пока пусто") {
            item { ProfileHeader(u, own) }
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
        Avatar(u, 112.dp)
        Text("Deleted Account", style = MaterialTheme.typography.headlineSmall)
        Text("Аккаунт заблокирован" + if (u.banUntil == 0L) " навсегда" else "", color = MaterialTheme.colorScheme.error)
        Text("Страница, записи, фото и музыка этого человека недоступны.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProfileHeader(u: User, own: Boolean) {
    val nav = LocalNav.current
    val users by Store.users.collectAsState()
    LaunchedEffect(u.friends) { Store.need(u.friends.take(12)) }
    Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp), shape = RoundedCornerShape(28.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Avatar(u, 104.dp)
            UserName(u, MaterialTheme.typography.headlineSmall, Modifier.padding(top = 6.dp))
            Text("@${u.nick}" + if (!own) " · " + (if (u.online) "в сети" else if (u.lastSeen > 0) "был(а) ${ago(u.lastSeen)}" else "давно не заходил(а)") else "",
                color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
            if (u.status.isNotEmpty()) Text(u.status, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
            if (u.listening.isNotEmpty()) Text("🎵 ${u.listening}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary, textAlign = TextAlign.Center)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), modifier = Modifier.padding(top = 4.dp)) {
                if (u.city.isNotEmpty()) AssistChip({}, { Text("📍 ${u.city}") })
                AssistChip({}, { Text("${u.friends.size} ${plural(u.friends.size, "друг", "друга", "друзей")}") })
            }
            if (u.about.isNotEmpty()) Text(u.about, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
            if (!own) FriendButtons(u, Modifier.padding(top = 8.dp))
            val fr = u.friends.take(8).mapNotNull { users[it] }
            if (fr.isNotEmpty()) Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(-8.dp)) {
                fr.forEach { f -> Avatar(f, 36.dp, Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerLow).padding(2.dp), showOnline = false) { nav.openProfile(f.id) } }
            }
        }
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
            friend -> OutlinedButton({ ask = true }) { Icon(Icons.Rounded.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("В друзьях") }
            inc.any { it.from == u.id } -> Button({ scope.safe(toast) { Api.friendAccept(u.id); toast("Теперь вы друзья") } }) { Icon(Icons.Rounded.PersonAdd, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Принять заявку") }
            out.any { it.to == u.id } -> OutlinedButton({ scope.safe(toast) { Api.friendCancel(u.id); toast("Заявка отменена") } }) { Text("Заявка отправлена") }
            else -> Button({ scope.safe(toast) { Api.friendAdd(u.id); toast("Заявка отправлена") } }) { Icon(Icons.Rounded.PersonAdd, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Добавить") }
        }
        FilledTonalButton({ nav.navigate("chat/${u.id}") }) { Icon(Icons.Outlined.ChatBubbleOutline, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Написать") }
    }
    if (ask) AlertDialog({ ask = false }, title = { Text("Удалить из друзей?") }, text = { Text(u.name) },
        icon = { Icon(Icons.Rounded.PersonRemove, null) },
        confirmButton = { TextButton({ ask = false; scope.safe(toast) { Api.friendRemove(u.id); toast("Удалено из друзей") } }) { Text("Удалить") } },
        dismissButton = { TextButton({ ask = false }) { Text("Отмена") } })
}

@OptIn(ExperimentalMaterial3Api::class)
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
    var photo by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri != null) scope.safe(toast) { photo = Images.compress(ctx, uri, 256, 120_000, square = true) }
    }
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = { TopAppBar(title = { Text("Редактирование") }, navigationIcon = { IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } }) },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).imePadding().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(112.dp).clip(CircleShape).clickable { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, contentAlignment = Alignment.Center) {
                val src = photo ?: me.photo
                if (Images.safe(src).isNotEmpty()) DbImage(src, Modifier.fillMaxSize(), ContentScale.Crop) else Avatar(me, 112.dp, showOnline = false)
                Box(Modifier.fillMaxSize().background(Color(0x55000000)), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.PhotoCamera, "Фото", tint = Color.White) }
            }
            if (photo != null || me.photo.isNotEmpty()) TextButton({ photo = "" }) { Text("Убрать фото") }
            OutlinedTextField(name, { name = it.take(60) }, label = { Text("Имя") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(status, { status = it.take(120) }, label = { Text("Статус") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(city, { city = it.take(40) }, label = { Text("Город") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(about, { about = it.take(600) }, label = { Text("О себе") }, minLines = 3, modifier = Modifier.fillMaxWidth())
            Button(onClick = {
                busy = true
                scope.safe({ busy = false; toast(it) }) { Api.saveProfile(name, city, status, about, photo); toast("Сохранено"); nav.popBackStack() }
            }, enabled = !busy && name.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Сохранить")
            }
        }
    }
}
