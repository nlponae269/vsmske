package ru.vsmske.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Group
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.plural
import kotlinx.coroutines.launch

/* Сообщества: подписки и все сообщества, страница сообщества с записями; создать — как на сайте. */

fun membersWord(n: Int) = "$n ${plural(n, "участник", "участника", "участников")}"

@Composable
fun GroupAvatar(g: Group?, size: androidx.compose.ui.unit.Dp, shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(size * 0.3f)) {
    Box(Modifier.size(size).clip(shape).background(Brush.linearGradient(COVERS[g?.cover ?: "blue"] ?: COVERS["blue"]!!)), contentAlignment = Alignment.Center) {
        if (!g?.photo.isNullOrEmpty()) DbImage(g!!.photo, Modifier.fillMaxSize())
        else Text(g?.name?.take(1)?.uppercase() ?: "", color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun ClubsScreen() {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val me by Store.me.collectAsState()
    var all by remember { mutableStateOf<List<Group>?>(null) }
    var mineList by remember { mutableStateOf<List<Group>?>(null) }
    var q by rememberSaveable { mutableStateOf("") }
    var create by remember { mutableStateOf(false) }
    val myIds = me?.groups ?: emptyList()
    DisposableEffect(Unit) {
        val r = Media.groupsQuery().addSnapshotListener { s, e ->
            if (e != null) { toast(errText(e)); all = all ?: emptyList(); return@addSnapshotListener }
            all = s?.documents?.map(Group::from) ?: return@addSnapshotListener
        }
        onDispose { r.remove() }
    }
    LaunchedEffect(myIds) { mineList = runCatching { Media.groupsByIds(myIds.reversed()) }.getOrDefault(emptyList()) }
    val term = q.trim()
    fun ok(g: Group) = term.isEmpty() || g.name.contains(term, true) || g.about.contains(term, true)
    val mine = mineList.orEmpty().filter(::ok)
    val rest = all.orEmpty().filter { it.id !in myIds && ok(it) }
    BackScaffold("Сообщества", fab = { ExtendedFloatingActionButton(onClick = { create = true }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("Создать") }) }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 100.dp)) {
            item {
                TextField(q, { q = it.take(60) }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), placeholder = { Text("Найти сообщество") },
                    leadingIcon = { Icon(Icons.Rounded.Search, null) }, singleLine = true, shape = CircleShape,
                    colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
            }
            if (mine.isNotEmpty()) {
                item { SectionTitle("Мои подписки · ${myIds.size}") }
                items(mine, key = { "m" + it.id }) { g -> ClubRow(g, subscribed = true) { nav.navigate("club/${g.id}") } }
            }
            item { SectionTitle(if (mine.isEmpty()) "Сообщества" else "Ещё сообщества") }
            when {
                all == null -> items(5) { SkeletonRow() }
                rest.isEmpty() -> item { EmptyState(if (term.isEmpty()) "Сообществ пока нет" else "Ничего не нашли", if (term.isEmpty()) "Создайте первое — кнопка внизу" else "", "👥") }
                else -> items(rest, key = { it.id }) { g -> ClubRow(g, subscribed = false) { nav.navigate("club/${g.id}") } }
            }
        }
    }
    if (create) {
        var name by remember { mutableStateOf("") }
        var about by remember { mutableStateOf("") }
        var busy by remember { mutableStateOf(false) }
        VsSheet({ if (!busy) create = false }) {
            Text("Новое сообщество", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(name, { name = it.take(60) }, Modifier.fillMaxWidth().padding(top = 12.dp), label = { Text("Название") }, singleLine = true)
            OutlinedTextField(about, { about = it.take(600) }, Modifier.fillMaxWidth().padding(top = 8.dp), label = { Text("О чём оно") }, minLines = 2, maxLines = 5)
            Button({
                busy = true
                scope.safe({ busy = false; toast(it) }) { val id = Media.createGroup(name, about); create = false; toast("Сообщество создано"); nav.navigate("club/$id") }
            }, Modifier.fillMaxWidth().padding(top = 14.dp).height(52.dp), enabled = name.isNotBlank() && !busy) { if (busy) ExpressiveLoader(24.dp, MaterialTheme.colorScheme.onPrimary) else Text("Создать") }
        }
    }
}

@Composable
private fun ClubRow(g: Group, subscribed: Boolean, onClick: () -> Unit) =
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        GroupAvatar(g, 52.dp)
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(g.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(membersWord(g.membersCount) + if (g.about.isNotEmpty()) " · " + g.about else "", style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (subscribed) Icon(Icons.Rounded.Check, "Вы подписаны", tint = MaterialTheme.colorScheme.primary)
    }

@Composable
fun ClubScreen(id: String) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val me by Store.me.collectAsState()
    var g by remember { mutableStateOf<Group?>(null) }
    var gone by remember { mutableStateOf(false) }
    var compose by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    DisposableEffect(id) {
        val r = Fire.db.collection("groups").document(id).addSnapshotListener { s, _ ->
            if (s == null) return@addSnapshotListener
            if (!s.exists()) { gone = true; return@addSnapshotListener }
            g = Group.from(s)
        }
        onDispose { r.remove() }
    }
    val (posts, more) = rememberPosts("club:$id") { lim -> Api.wallQuery(id, lim) }
    val cur = g
    val subscribed = id in (me?.groups ?: emptyList())
    val admin = cur != null && Store.uid in cur.admins
    Scaffold(contentWindowInsets = WindowInsets(0),
        floatingActionButton = { if (admin) ExtendedFloatingActionButton(onClick = { compose = true }, icon = { Icon(Icons.Rounded.Edit, null) }, text = { Text("Запись") }) }) { pad ->
        Box(Modifier.fillMaxSize()) {
            when {
                gone -> EmptyState("Сообщество удалено", emoji = "🫥", modifier = Modifier.padding(top = 120.dp))
                cur == null -> Loading(Modifier.padding(top = 120.dp))
                else -> PostList(posts, more, PaddingValues(bottom = 96.dp + pad.calculateBottomPadding()), empty = "Записей пока нет") {
                    item {
                        Column {
                            Box(Modifier.fillMaxWidth().height(190.dp).clip(RoundedCornerShape(bottomStart = 36.dp, bottomEnd = 36.dp))
                                .background(Brush.linearGradient(COVERS[cur.cover] ?: COVERS["blue"]!!)))
                            Row(Modifier.padding(horizontal = 20.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                                GroupAvatar(cur, 72.dp)
                                Column(Modifier.weight(1f).padding(start = 14.dp)) {
                                    Text(cur.name, style = MaterialTheme.typography.headlineSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    Text(membersWord(cur.membersCount) + if (admin) " · вы админ" else "", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            if (cur.about.isNotEmpty()) RichText(cur.about, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 20.dp))
                            Row(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                                val act: () -> Unit = {
                                    busy = true
                                    scope.safe({ busy = false; toast(it) }) { Media.setSubscribed(cur, !subscribed); busy = false; toast(if (subscribed) "Вы отписались" else "Вы подписались") }
                                }
                                if (subscribed) FilledTonalButton(act, enabled = !busy) { Icon(Icons.Rounded.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Вы подписаны") }
                                else Button(act, enabled = !busy) { Icon(Icons.Rounded.Groups, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Подписаться") }
                            }
                            Text("Записи", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(start = 20.dp, top = 8.dp, bottom = 4.dp))
                        }
                    }
                }
            }
            IconButton({ nav.popBackStack() }, Modifier.statusBarsPadding().padding(8.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.25f))) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад", tint = Color.White)
            }
        }
    }
    if (compose && cur != null) Composer(cur.id, group = true) { compose = false }
}

/** Кэш сообществ для подписей у записей (как cache.groups на сайте) */
object Groups {
    val map = kotlinx.coroutines.flow.MutableStateFlow<Map<String, Group>>(emptyMap())
    private val loading = mutableSetOf<String>()
    private val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Main)
    fun need(id: String) {
        if (id.isEmpty() || id in map.value || !loading.add(id)) return
        scope.launch {
            runCatching { Media.groupsByIds(listOf(id)) }.onSuccess { l -> map.value = map.value + l.associateBy { it.id } }
            loading -= id
        }
    }
}

/** Подпись «в сообществе «…»» у записи сообщества */
@Composable
fun GroupLabel(groupId: String) {
    val nav = LocalNav.current
    val gs by Groups.map.collectAsState()
    LaunchedEffect(groupId) { Groups.need(groupId) }
    val g = gs[groupId]
    Row(Modifier.clip(CircleShape).clickable { nav.navigate("club/$groupId") }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        GroupAvatar(g, 18.dp, CircleShape)
        Text("  в сообществе «${g?.name ?: "…"}»", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
