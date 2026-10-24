package ru.vsmske.app.ui.screens

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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.catch
import ru.vsmske.app.data.Fb
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Session
import ru.vsmske.app.data.plural
import ru.vsmske.app.data.seenText
import ru.vsmske.app.ui.Avatar
import ru.vsmske.app.ui.Card
import ru.vsmske.app.ui.DbImage
import ru.vsmske.app.ui.Empty
import ru.vsmske.app.ui.Field
import ru.vsmske.app.ui.GlassButton
import ru.vsmske.app.ui.GradButton
import ru.vsmske.app.ui.Header
import ru.vsmske.app.ui.HeaderSpec
import ru.vsmske.app.ui.Loading
import ru.vsmske.app.ui.LocalNav
import ru.vsmske.app.ui.LocalPad
import ru.vsmske.app.ui.LocalToast
import ru.vsmske.app.ui.UserName
import ru.vsmske.app.ui.Vs
import ru.vsmske.app.ui.glassCard
import ru.vsmske.app.ui.parseColor
import ru.vsmske.app.ui.safe

/** Обложки профиля — те же ключи, что users.cover на сайте */
val COVERS = mapOf(
    "blue" to listOf("#4F46E5", "#7C3AED", "#C026D3"), "sunset" to listOf("#F2994A", "#D0462F", "#B4398F"),
    "sea" to listOf("#1F8A5B", "#2B8BB5"), "night" to listOf("#141A33", "#4E5B76"),
    "rose" to listOf("#B4398F", "#F06C9B"), "gold" to listOf("#C98A12", "#F2C94C"),
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileScreen(id: String) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val my = Fb.uid
    val own = id == my
    val u by remember(id) { Repo.userFlow(id).catch { } }.collectAsState(initial = Repo.users.value[id])
    val wall by remember(id) { Repo.wall(id).catch { } }.collectAsState(initial = null)
    val incoming by Session.incoming.collectAsState()
    val outgoing by Session.outgoing.collectAsState()
    var confirmRemove by remember { mutableStateOf(false) }
    if (!own) Header(HeaderSpec(u?.name ?: "", seenText(u)))
    LaunchedEffect(u) { u?.let { Repo.putUser(it) } }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = listPad(LocalPad.current), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val user = u
        if (user == null) { item { Loading() }; return@LazyColumn }
        item {
            Column(Modifier.fillMaxWidth().glassCard(28.dp)) {
                val cover = (COVERS[user.cover] ?: COVERS["blue"]!!).map { parseColor(it) }
                Box(Modifier.fillMaxWidth().height(120.dp).background(Brush.linearGradient(cover)))
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).offset(y = (-48).dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.border(4.dp, MaterialTheme.colorScheme.surfaceContainerLow, CircleShape).padding(4.dp)) { Avatar(user, 104.dp, user.online) }
                    Spacer(Modifier.height(10.dp))
                    UserName(user, MaterialTheme.typography.headlineSmall)
                    if (user.nick.isNotEmpty()) Text("@" + user.nick, color = Vs.accent, style = MaterialTheme.typography.bodyMedium)
                    if (user.status.isNotEmpty()) Text(user.status, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
                    Text(seenText(user), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
                    if (user.listening.isNotEmpty()) Text("🎵 " + (if (own) "Вы слушаете: " else "Слушает: ") + user.listening, style = MaterialTheme.typography.bodySmall, color = Vs.accent, modifier = Modifier.padding(top = 4.dp))
                    FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (user.city.isNotEmpty()) Chip("📍 " + user.city)
                        if (user.bday.isNotEmpty()) Chip("🎂 " + user.bday.split("-").reversed().joinToString("."))
                        val fc = user.friends.size
                        Chip("👥 $fc ${plural(fc, "друг", "друга", "друзей")}")
                    }
                    if (user.about.isNotEmpty()) Text(user.about, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 10.dp))
                    Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (own) {
                            GradButton("Редактировать", icon = Icons.Rounded.Edit) { nav.navigate("edit") }
                            GlassButton("Выйти", icon = Icons.AutoMirrored.Rounded.Logout, color = Vs.muted) { Session.signOut() }
                        } else if (!user.deleted) {
                            GradButton("Написать", icon = Icons.AutoMirrored.Rounded.Chat) { nav.navigate("chat/$id") }
                            val friend = my in user.friends
                            when {
                                friend -> GlassButton("В друзьях", icon = Icons.Rounded.Check) { confirmRemove = true }
                                incoming.any { it.from == id } -> GlassButton("Принять заявку", icon = Icons.Rounded.PersonAdd, color = Vs.ok) {
                                    scope.safe(toast) { Repo.friendAccept(id, outgoing.any { it.to == id }); toast("Теперь вы друзья") }
                                }
                                outgoing.any { it.to == id } -> GlassButton("Заявка отправлена", icon = Icons.Rounded.Schedule, color = Vs.muted) { scope.safe(toast) { Repo.friendCancel(id); toast("Заявка отменена") } }
                                else -> GlassButton("Добавить", icon = Icons.Rounded.PersonAdd) { scope.safe(toast) { Repo.friendAdd(id); toast("Заявка отправлена") } }
                            }
                        }
                    }
                }
            }
        }
        val canWrite = own || (my in user.friends && user.privacyWall != "me")
        if (canWrite) item { Composer(id, if (own) "Что у вас нового?" else "Написать на стене…") }
        val list = wall
        when {
            list == null -> item { Loading() }
            list.isEmpty() -> item { Empty("На стене пока пусто") }
            else -> items(list, key = { it.id }) { PostCard(it) }
        }
    }
    if (confirmRemove) androidx.compose.material3.AlertDialog(
        onDismissRequest = { confirmRemove = false },
        title = { Text("Удалить из друзей?") },
        confirmButton = { androidx.compose.material3.TextButton({ confirmRemove = false; scope.safe(toast) { Repo.friendRemove(id); toast("Удалено из друзей") } }) { Text("Удалить", color = Vs.danger) } },
        dismissButton = { androidx.compose.material3.TextButton({ confirmRemove = false }) { Text("Отмена") } },
    )
}

@Composable
private fun Chip(t: String) {
    Text(t, style = MaterialTheme.typography.labelMedium, modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.secondaryContainer).padding(horizontal = 12.dp, vertical = 6.dp))
}

@Composable
fun EditProfileScreen() {
    val me = Session.me.collectAsState().value ?: return
    val nav = LocalNav.current
    val toast = LocalToast.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(me.name) }
    var status by remember { mutableStateOf(me.status) }
    var city by remember { mutableStateOf(me.city) }
    var about by remember { mutableStateOf(me.about) }
    var photo by remember { mutableStateOf(me.photo) }
    var busy by remember { mutableStateOf(false) }
    Header(HeaderSpec("Редактировать страницу"))
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.safe(toast) { photo = Images.compress(ctx, uri, 256, Images.MAX_AVATAR, square = true) }
    }
    Column(
        Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState())
            .padding(start = 12.dp, end = 12.dp, top = LocalPad.current.calculateTopPadding(), bottom = LocalPad.current.calculateBottomPadding()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(84.dp).clip(RoundedCornerShape(26.dp)).background(parseColor(me.color)).clickable {
                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }, contentAlignment = Alignment.Center) {
                    if (Images.safe(photo).isNotEmpty()) DbImage(photo, Modifier.fillMaxSize())
                    Box(Modifier.fillMaxSize().background(Color(0x55000000)), contentAlignment = Alignment.Center) {
                        androidx.compose.material3.Icon(Icons.Rounded.PhotoCamera, "Фото", tint = Color.White)
                    }
                }
                Column(Modifier.padding(start = 14.dp)) {
                    Text("Фото профиля", style = MaterialTheme.typography.titleSmall)
                    Text("Нажмите, чтобы выбрать", style = MaterialTheme.typography.bodySmall)
                    if (photo.isNotEmpty()) Text("Убрать фото", color = Vs.danger, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 4.dp).clickable { photo = "" })
                }
            }
        }
        Card {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field(name, { name = it.take(60) }, "Имя и фамилия")
                Field(status, { status = it.take(120) }, "Статус")
                Field(city, { city = it.take(40) }, "Город")
                Field(about, { about = it.take(600) }, "О себе", singleLine = false, minLines = 3)
                Text("Короткое имя @${me.nick}, обложку и остальное можно поменять на сайте.", style = MaterialTheme.typography.bodySmall)
                GradButton("Сохранить", Modifier.fillMaxWidth(), busy = busy, enabled = name.isNotBlank()) {
                    busy = true
                    scope.safe(toast) {
                        try { Repo.updateProfile(me, name.trim(), status.trim(), city.trim(), about.trim(), photo); toast("Сохранено"); nav.popBackStack() }
                        finally { busy = false }
                    }
                }
            }
        }
    }
}

