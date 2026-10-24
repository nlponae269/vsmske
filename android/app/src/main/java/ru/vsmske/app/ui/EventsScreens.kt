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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.material.icons.rounded.AddAPhoto
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
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
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.vsmske.app.data.Event
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.plural
import java.util.Calendar

/* ВС События: встречи с датой, местом и списком «Пойду» — как на сайте. */

private val MONTHS_GEN = listOf("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")
fun fmtWhen(t: Long): String {
    val c = Calendar.getInstance().apply { timeInMillis = t }
    val y = if (c.get(Calendar.YEAR) != Calendar.getInstance().get(Calendar.YEAR)) " ${c.get(Calendar.YEAR)}" else ""
    return "${c.get(Calendar.DAY_OF_MONTH)} ${MONTHS_GEN[c.get(Calendar.MONTH)]}$y, %d:%02d".format(c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
}
private fun goingWord(n: Int) = "$n ${plural(n, "идёт", "идут", "идут")}"

@Composable
fun EventsScreen() {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val users by Store.users.collectAsState()
    var events by remember { mutableStateOf<List<Event>?>(null) }
    var create by remember { mutableStateOf(false) }
    DisposableEffect(Unit) {
        val r = Media.eventsQuery().addSnapshotListener { s, e ->
            if (e != null) { toast(errText(e)); events = events ?: emptyList(); return@addSnapshotListener }
            val l = s?.documents?.map(Event::from) ?: return@addSnapshotListener
            Store.need(l.map { it.ownerId }); events = l
        }
        onDispose { r.remove() }
    }
    val now = System.currentTimeMillis() - 3 * 3600_000L   // идущее сейчас ещё считаем предстоящим
    val all = events?.filter { users[it.ownerId]?.banned != true }
    val soon = all?.filter { it.at >= now }?.sortedBy { it.at }
    val past = all?.filter { it.at < now }?.sortedByDescending { it.at }?.take(30)
    BackScaffold("События", fab = { ExtendedFloatingActionButton(onClick = { create = true }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("Событие") }) }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 100.dp)) {
            when {
                soon == null -> items(3) { Box(Modifier.padding(16.dp, 8.dp).fillMaxWidth().height(150.dp).clip(RoundedCornerShape(28.dp)).shimmer()) }
                soon.isEmpty() && past.isNullOrEmpty() -> item { EmptyState("Событий пока нет", "Позовите друзей — кнопка «Событие» внизу", "📅") }
                else -> {
                    item { SectionTitle("Скоро") }
                    if (soon.isEmpty()) item { Text("Ближайших событий нет", Modifier.padding(horizontal = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    items(soon, key = { it.id }) { e -> EventCard(e) { nav.navigate("event/${e.id}") } }
                    if (!past.isNullOrEmpty()) {
                        item { SectionTitle("Прошли") }
                        items(past, key = { "p" + it.id }) { e -> EventCard(e, dim = true) { nav.navigate("event/${e.id}") } }
                    }
                }
            }
        }
    }
    if (create) EventForm { id -> create = false; if (id != null) nav.navigate("event/$id") }
}

@Composable
private fun EventCard(e: Event, dim: Boolean = false, onClick: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    val going = Store.uid in e.going
    Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(cs.surfaceContainerLow).clickable(onClick = onClick).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically) {
        val c = Calendar.getInstance().apply { timeInMillis = e.at }
        Box(Modifier.size(72.dp).clip(RoundedCornerShape(18.dp)).background(if (dim) cs.surfaceContainerHighest else cs.primaryContainer), contentAlignment = Alignment.Center) {
            if (e.cover.isNotEmpty()) DbImage(e.cover, Modifier.fillMaxSize())
            else Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("${c.get(Calendar.DAY_OF_MONTH)}", style = MaterialTheme.typography.headlineSmall, color = cs.onPrimaryContainer)
                Text(MONTHS_GEN[c.get(Calendar.MONTH)].take(3), style = MaterialTheme.typography.labelSmall, color = cs.onPrimaryContainer)
            }
        }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(e.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, color = if (dim) cs.onSurfaceVariant else cs.onSurface)
            Text(fmtWhen(e.at) + if (e.place.isNotEmpty()) " · " + e.place else "", style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(goingWord(e.going.size) + if (going) " · и вы" else "", style = MaterialTheme.typography.labelMedium, color = if (going) cs.primary else cs.onSurfaceVariant)
        }
    }
}

@Composable
fun EventScreen(id: String) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    var ev by remember { mutableStateOf<Event?>(null) }
    var gone by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    DisposableEffect(id) {
        val r = Fire.db.collection("events").document(id).addSnapshotListener { s, _ ->
            if (s == null) return@addSnapshotListener
            if (!s.exists()) { gone = true; return@addSnapshotListener }
            ev = Event.from(s).also { Store.need(listOf(it.ownerId) + it.going.take(30)) }
        }
        onDispose { r.remove() }
    }
    val e = ev
    val going = e != null && Store.uid in e.going
    Scaffold(contentWindowInsets = WindowInsets(0)) { pad ->
        Box(Modifier.fillMaxSize().padding(bottom = pad.calculateBottomPadding())) {
            when {
                gone -> EmptyState("Событие удалено", emoji = "🫥", modifier = Modifier.padding(top = 120.dp))
                e == null -> Loading(Modifier.padding(top = 120.dp))
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
                    item {
                        Box(Modifier.fillMaxWidth().aspectRatio(16 / 9f).background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary)))) {
                            if (e.cover.isNotEmpty() && users[e.ownerId]?.banned != true) DbImage(e.cover, Modifier.fillMaxSize(), ContentScale.Crop)
                            else Icon(Icons.Rounded.CalendarMonth, null, Modifier.align(Alignment.Center).size(80.dp), tint = Color.White.copy(alpha = 0.8f))
                        }
                    }
                    item {
                        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(e.title, style = MaterialTheme.typography.headlineSmall)
                            Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Rounded.Schedule, null, Modifier.size(18.dp)); Text("  " + fmtWhen(e.at), style = MaterialTheme.typography.bodyLarge) }
                            if (e.place.isNotEmpty()) Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Rounded.Place, null, Modifier.size(18.dp)); Text("  " + e.place, style = MaterialTheme.typography.bodyLarge) }
                            if (e.text.isNotEmpty()) RichText(e.text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                    item {
                        Row(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            val act: () -> Unit = { busy = true; scope.safe({ busy = false; toast(it) }) { Media.toggleGoing(e); busy = false } }
                            if (going) FilledTonalButton(act, enabled = !busy) { Icon(Icons.Rounded.Check, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Вы идёте") }
                            else Button(act, enabled = !busy) { Text("Пойду") }
                            if (e.ownerId == Store.uid) IconButton({ ask = true }) { Icon(Icons.Rounded.Delete, "Удалить событие", tint = MaterialTheme.colorScheme.error) }
                        }
                    }
                    item { SectionTitle(goingWord(e.going.size)) }
                    items(e.going.take(100), key = { "g$it" }) { uid -> PersonRow(users[uid]) { nav.openProfile(uid) } }
                }
            }
            IconButton({ nav.popBackStack() }, Modifier.statusBarsPadding().padding(8.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.3f))) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад", tint = Color.White)
            }
        }
    }
    if (ask && e != null) AlertDialog({ ask = false }, title = { Text("Удалить событие?") },
        confirmButton = { TextButton({ ask = false; scope.safe(toast) { Media.deleteEvent(e); toast("Событие удалено"); nav.popBackStack() } }) { Text("Удалить") } },
        dismissButton = { TextButton({ ask = false }) { Text("Отмена") } })
}

/** Новое событие: название, дата и время (календарь и часы Material 3), место, описание, обложка */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EventForm(onDone: (String?) -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var place by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var cover by remember { mutableStateOf<Uri?>(null) }
    var at by remember { mutableLongStateOf(Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, 1); set(Calendar.HOUR_OF_DAY, 19); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0) }.timeInMillis) }
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> if (u != null) cover = u }
    VsSheet({ if (!busy) onDone(null) }) {
        Text("Новое событие", style = MaterialTheme.typography.headlineSmall)
        Box(Modifier.padding(vertical = 12.dp).fillMaxWidth().height(130.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.secondaryContainer)
            .clickable { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, contentAlignment = Alignment.Center) {
            if (cover != null) coil.compose.AsyncImage(cover, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Rounded.AddAPhoto, null); Text("  Обложка (необязательно)", style = MaterialTheme.typography.labelLarge) }
        }
        OutlinedTextField(title, { title = it.take(100) }, Modifier.fillMaxWidth(), label = { Text("Название") }, singleLine = true)
        Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton({ pickDate = true }, Modifier.weight(1f)) { Icon(Icons.Rounded.CalendarMonth, null, Modifier.size(18.dp)); Text("  " + fmtWhen(at).substringBefore(",")) }
            OutlinedButton({ pickTime = true }) { Icon(Icons.Rounded.Schedule, null, Modifier.size(18.dp)); Text("  " + fmtWhen(at).substringAfter(", ")) }
        }
        OutlinedTextField(place, { place = it.take(120) }, Modifier.fillMaxWidth(), label = { Text("Где") }, singleLine = true)
        OutlinedTextField(text, { text = it.take(2000) }, Modifier.fillMaxWidth().padding(top = 8.dp), label = { Text("Подробности") }, minLines = 2, maxLines = 5)
        Button({
            busy = true
            scope.safe({ busy = false; toast(it) }) { val id = Media.createEvent(ctx, title, text, place, at, cover); toast("Событие создано"); onDone(id) }
        }, Modifier.fillMaxWidth().padding(top = 12.dp).height(52.dp), enabled = !busy && title.trim().length >= 2) {
            if (busy) ExpressiveLoader(24.dp, MaterialTheme.colorScheme.onPrimary) else Text("Создать", fontWeight = FontWeight.SemiBold)
        }
    }
    if (pickDate) {
        val st = rememberDatePickerState(initialSelectedDateMillis = at)
        DatePickerDialog({ pickDate = false }, confirmButton = {
            TextButton({
                st.selectedDateMillis?.let { d ->
                    // выбранный день (в UTC) + прежние часы и минуты
                    val day = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")).apply { timeInMillis = d }
                    at = Calendar.getInstance().apply { timeInMillis = at; set(day.get(Calendar.YEAR), day.get(Calendar.MONTH), day.get(Calendar.DAY_OF_MONTH)) }.timeInMillis
                }
                pickDate = false
            }) { Text("Готово") }
        }, dismissButton = { TextButton({ pickDate = false }) { Text("Отмена") } }) { DatePicker(st) }
    }
    if (pickTime) {
        val c = Calendar.getInstance().apply { timeInMillis = at }
        val st = rememberTimePickerState(c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), is24Hour = true)
        AlertDialog({ pickTime = false }, text = { TimePicker(st) },
            confirmButton = { TextButton({ at = Calendar.getInstance().apply { timeInMillis = at; set(Calendar.HOUR_OF_DAY, st.hour); set(Calendar.MINUTE, st.minute) }.timeInMillis; pickTime = false }) { Text("Готово") } },
            dismissButton = { TextButton({ pickTime = false }) { Text("Отмена") } })
    }
}
