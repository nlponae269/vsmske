package ru.vsmske.app.ui

import androidx.compose.runtime.collectAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Note
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.ago
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.math.roundToInt

/* Сервисы: ВС Заметки (в базе, видит только хозяин), ВС Погода (Open-Meteo) и ВС Курсы (ЦБ РФ через cbr-xml-daily.ru) — как на сайте, бесплатно и без ключей. */

/** Простой GET → текст (для открытых бесплатных API) */
suspend fun httpGet(url: String): String = withContext(Dispatchers.IO) {
    val c = URL(url).openConnection() as HttpURLConnection
    c.connectTimeout = 10_000; c.readTimeout = 15_000
    c.setRequestProperty("User-Agent", "VSmske Android (https://nlponae269.github.io/vsmske/)")
    try {
        if (c.responseCode != 200) error("Сервис не ответил (${c.responseCode})")
        c.inputStream.bufferedReader().use { it.readText() }
    } finally { c.disconnect() }
}

/* ---------- ВС Заметки ---------- */

private val NOTE_COLORS = linkedMapOf("" to Color.Unspecified, "yellow" to Color(0xFFFFE082), "green" to Color(0xFFA5D6A7), "blue" to Color(0xFF90CAF9),
    "pink" to Color(0xFFF48FB1), "violet" to Color(0xFFCE93D8))

@Composable
fun NotesScreen() {
    val toast = LocalToast.current
    var notes by remember { mutableStateOf<List<Note>?>(null) }
    var open by remember { mutableStateOf<Note?>(null) }
    var creating by remember { mutableStateOf(false) }
    var q by rememberSaveable { mutableStateOf("") }
    DisposableEffect(Unit) {
        val r = Api.notesQuery().addSnapshotListener { s, e ->
            if (e != null) { toast(errText(e)); notes = notes ?: emptyList(); return@addSnapshotListener }
            notes = s?.documents?.map(Note::from)?.sortedWith(compareByDescending<Note> { it.pinned }.thenByDescending { it.updatedAt }) ?: return@addSnapshotListener
        }
        onDispose { r.remove() }
    }
    val shown = notes?.filter { q.isBlank() || it.title.contains(q.trim(), true) || it.text.contains(q.trim(), true) }
    BackScaffold("Заметки", fab = { ExtendedFloatingActionButton(onClick = { creating = true }, icon = { Icon(Icons.Rounded.Add, null) }, text = { Text("Заметка") }) }) { pad ->
        LazyVerticalStaggeredGrid(StaggeredGridCells.Adaptive(160.dp), Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = pad.calculateTopPadding(), bottom = 100.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp), verticalItemSpacing = 10.dp) {
            if ((notes?.size ?: 0) > 6) item(span = StaggeredGridItemSpan.FullLine) {
                TextField(q, { q = it.take(60) }, Modifier.fillMaxWidth().padding(vertical = 4.dp), placeholder = { Text("Поиск по заметкам") },
                    leadingIcon = { Icon(Icons.Rounded.Search, null) }, singleLine = true, shape = CircleShape,
                    colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
            }
            when {
                shown == null -> items(4) { Box(Modifier.fillMaxWidth().height(120.dp).clip(RoundedCornerShape(24.dp)).shimmer()) }
                shown.isEmpty() -> item(span = StaggeredGridItemSpan.FullLine) { EmptyState(if (q.isBlank()) "Заметок пока нет" else "Ничего не нашли", "Видите их только вы — и на сайте, и в приложении", "🗒️") }
                else -> items(shown, key = { it.id }) { n -> NoteCard(n) { open = n } }
            }
        }
    }
    if (creating) NoteEditor(null) { creating = false }
    open?.let { n -> NoteEditor(n) { open = null } }
}

@Composable
private fun NoteCard(n: Note, onClick: () -> Unit) {
    val c = NOTE_COLORS[n.color]?.takeIf { it != Color.Unspecified }
    val cs = MaterialTheme.colorScheme
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(c ?: cs.surfaceContainerHigh).clickable(onClick = onClick).padding(16.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            if (n.title.isNotEmpty()) Text(n.title, style = MaterialTheme.typography.titleMedium, color = if (c != null) Color(0xFF1D1B20) else cs.onSurface,
                modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            else Spacer(Modifier.weight(1f))
            if (n.pinned) Icon(Icons.Rounded.PushPin, "Закреплена", Modifier.size(16.dp), tint = if (c != null) Color(0xFF49454F) else cs.onSurfaceVariant)
        }
        if (n.text.isNotEmpty()) Text(n.text, style = MaterialTheme.typography.bodyMedium, color = if (c != null) Color(0xFF1D1B20) else cs.onSurface, maxLines = 10, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = if (n.title.isNotEmpty()) 6.dp else 0.dp))
        Text(ago(n.updatedAt), style = MaterialTheme.typography.labelSmall, color = if (c != null) Color(0xFF49454F) else cs.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
    }
}

@Composable
private fun NoteEditor(n: Note?, onClose: () -> Unit) {
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf(n?.title ?: "") }
    var text by remember { mutableStateOf(n?.text ?: "") }
    var color by remember { mutableStateOf(n?.color ?: "") }
    var pinned by remember { mutableStateOf(n?.pinned ?: false) }
    var busy by remember { mutableStateOf(false) }
    val cs = MaterialTheme.colorScheme
    VsSheet({ if (!busy) onClose() }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (n == null) "Новая заметка" else "Заметка", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            IconButton({ pinned = !pinned }) { Icon(Icons.Rounded.PushPin, if (pinned) "Открепить" else "Закрепить", tint = if (pinned) cs.primary else cs.onSurfaceVariant) }
            if (n != null) IconButton({ busy = true; scope.safe({ busy = false; toast(it) }) { Api.deleteNote(n.id); toast("Заметка удалена"); onClose() } }) {
                Icon(Icons.Rounded.Delete, "Удалить", tint = cs.error)
            }
        }
        OutlinedTextField(title, { title = it.take(120) }, Modifier.fillMaxWidth().padding(top = 8.dp), placeholder = { Text("Заголовок") }, singleLine = true)
        OutlinedTextField(text, { text = it.take(20000) }, Modifier.fillMaxWidth().heightIn(min = 160.dp, max = 360.dp).padding(top = 8.dp), placeholder = { Text("Текст заметки") })
        Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            NOTE_COLORS.forEach { (k, c) ->
                Box(Modifier.size(36.dp).clip(CircleShape).background(if (c == Color.Unspecified) cs.surfaceContainerHighest else c)
                    .then(if (color == k) Modifier.border(2.dp, cs.onSurface, CircleShape) else Modifier).clickable { color = k }, contentAlignment = Alignment.Center) {
                    if (color == k) Icon(Icons.Rounded.Check, null, Modifier.size(18.dp), tint = Color(0xFF1D1B20))
                }
            }
        }
        Button({
            busy = true
            scope.safe({ busy = false; toast(it) }) { Api.saveNote(n?.id, title, text, color, pinned); onClose() }
        }, Modifier.fillMaxWidth().padding(top = 14.dp).height(52.dp), enabled = !busy && (title.isNotBlank() || text.isNotBlank())) { Text("Сохранить") }
    }
}

/* ---------- ВС Погода (Open-Meteo, без ключа) ---------- */

private fun wmo(code: Int): Pair<String, String> = when (code) {
    0 -> "☀️" to "Ясно"; 1 -> "🌤️" to "Почти ясно"; 2 -> "⛅" to "Переменная облачность"; 3 -> "☁️" to "Пасмурно"
    45, 48 -> "🌫️" to "Туман"; 51, 53, 55 -> "🌦️" to "Морось"; 56, 57 -> "🌧️" to "Ледяная морось"
    61 -> "🌦️" to "Небольшой дождь"; 63 -> "🌧️" to "Дождь"; 65 -> "🌧️" to "Сильный дождь"; 66, 67 -> "🌧️" to "Ледяной дождь"
    71 -> "🌨️" to "Небольшой снег"; 73 -> "🌨️" to "Снег"; 75 -> "❄️" to "Сильный снег"; 77 -> "🌨️" to "Снежная крупа"
    80, 81, 82 -> "🌦️" to "Ливень"; 85, 86 -> "🌨️" to "Снегопад"; 95 -> "⛈️" to "Гроза"; 96, 99 -> "⛈️" to "Гроза с градом"
    else -> "🌡️" to "—"
}

private class Weather(val place: String, val temp: Double, val feels: Double, val wind: Double, val hum: Int, val code: Int,
                      val days: List<Triple<String, Pair<Double, Double>, Int>>)

@Composable
fun WeatherScreen() {
    val me = Store.me.value
    val ctx = LocalContext.current
    val prefs = remember { ctx.getSharedPreferences("vs", android.content.Context.MODE_PRIVATE) }
    var city by rememberSaveable { mutableStateOf(prefs.getString("weather_city", null) ?: me?.city?.ifBlank { null } ?: "Москва") }
    var input by rememberSaveable { mutableStateOf(city) }
    var w by remember { mutableStateOf<Weather?>(null) }
    var err by remember { mutableStateOf("") }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(city, reload) {
        w = null; err = ""
        try {
            val g = JSONObject(httpGet("https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=" + URLEncoder.encode(city.trim(), "UTF-8")))
            val r = g.optJSONArray("results")?.optJSONObject(0) ?: error("Не нашли город «$city»")
            val lat = r.getDouble("latitude"); val lon = r.getDouble("longitude")
            val place = listOf(r.optString("name"), r.optString("country")).filter { it.isNotBlank() }.joinToString(", ")
            val f = JSONObject(httpGet("https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon&timezone=auto&forecast_days=7" +
                "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min"))
            val c = f.getJSONObject("current"); val d = f.getJSONObject("daily")
            val dates = d.getJSONArray("time"); val mx = d.getJSONArray("temperature_2m_max"); val mn = d.getJSONArray("temperature_2m_min"); val cd = d.getJSONArray("weather_code")
            val days = (0 until dates.length()).map { i -> Triple(dates.getString(i), mx.getDouble(i) to mn.getDouble(i), cd.getInt(i)) }
            w = Weather(place, c.getDouble("temperature_2m"), c.getDouble("apparent_temperature"), c.getDouble("wind_speed_10m"), c.optInt("relative_humidity_2m"), c.getInt("weather_code"), days)
            prefs.edit().putString("weather_city", city).apply()
        } catch (e: Exception) { err = errText(e).takeIf { "Что-то" !in it } ?: "Не получилось загрузить погоду. Проверьте интернет" }
    }
    BackScaffold("Погода", actions = { IconButton({ reload++ }) { Icon(Icons.Rounded.Refresh, "Обновить") } }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            item {
                TextField(input, { input = it.take(60) }, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), placeholder = { Text("Город") },
                    leadingIcon = { Icon(Icons.Rounded.Search, null) }, singleLine = true, shape = CircleShape,
                    trailingIcon = { if (input.isNotBlank() && input != city) TextButton({ city = input.trim() }) { Text("Найти") } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                    colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
            }
            val x = w
            when {
                err.isNotEmpty() -> item { EmptyState("Погода не загрузилась", err, "🌥️") }
                x == null -> item { Loading() }
                else -> {
                    item {
                        val (ic, label) = wmo(x.code)
                        Column(Modifier.padding(16.dp).fillMaxWidth().clip(RoundedCornerShape(32.dp))
                            .background(Brush.linearGradient(listOf(Color(0xFF2B8BB5), Color(0xFF4F46E5)))).padding(24.dp)) {
                            Text(x.place, color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.titleMedium)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("${x.temp.roundToInt()}°", color = Color.White, fontSize = 72.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.width(12.dp)); Text(ic, fontSize = 56.sp)
                            }
                            Text(label, color = Color.White, style = MaterialTheme.typography.titleLarge)
                            Text("Ощущается как ${x.feels.roundToInt()}° · ветер ${x.wind.roundToInt()} км/ч · влажность ${x.hum}%", color = Color.White.copy(alpha = 0.85f),
                                style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
                        }
                    }
                    item { SectionTitle("На неделю") }
                    item {
                        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(x.days) { (date, t, code) ->
                                val day = runCatching {
                                    val d = java.time.LocalDate.parse(date)
                                    if (d == java.time.LocalDate.now()) "Сегодня" else d.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale("ru")).replaceFirstChar { it.uppercase() } + ", " + d.dayOfMonth
                                }.getOrDefault(date)
                                Column(Modifier.width(96.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(12.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(day, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                                    Text(wmo(code).first, fontSize = 30.sp, modifier = Modifier.padding(vertical = 6.dp))
                                    Text("${t.first.roundToInt()}°", style = MaterialTheme.typography.titleMedium)
                                    Text("${t.second.roundToInt()}°", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                    item { Text("Данные — Open-Meteo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(20.dp)) }
                }
            }
        }
    }
}

/* ---------- ВС Курсы (ЦБ РФ) ---------- */

private class Rate(val code: String, val name: String, val value: Double, val prev: Double, val nominal: Int)
private val FLAGS = mapOf("USD" to "🇺🇸", "EUR" to "🇪🇺", "CNY" to "🇨🇳", "GBP" to "🇬🇧", "JPY" to "🇯🇵", "TRY" to "🇹🇷", "KZT" to "🇰🇿", "BYN" to "🇧🇾",
    "UAH" to "🇺🇦", "AED" to "🇦🇪", "CHF" to "🇨🇭", "INR" to "🇮🇳", "AMD" to "🇦🇲", "GEL" to "🇬🇪", "UZS" to "🇺🇿", "KGS" to "🇰🇬")

@Composable
fun RatesScreen() {
    var rates by remember { mutableStateOf<List<Rate>?>(null) }
    var date by remember { mutableStateOf("") }
    var err by remember { mutableStateOf("") }
    var reload by remember { mutableIntStateOf(0) }
    var amount by rememberSaveable { mutableStateOf("100") }
    var pick by rememberSaveable { mutableStateOf("USD") }
    LaunchedEffect(reload) {
        rates = null; err = ""
        try {
            val j = JSONObject(httpGet("https://www.cbr-xml-daily.ru/daily_json.js"))
            date = j.optString("Date").take(10)
            val v = j.getJSONObject("Valute")
            val top = listOf("USD", "EUR", "CNY", "GBP", "TRY", "KZT", "BYN", "AED", "JPY", "CHF")
            rates = v.keys().asSequence().mapNotNull { k -> v.optJSONObject(k)?.let { o -> Rate(k, o.optString("Name"), o.optDouble("Value"), o.optDouble("Previous"), o.optInt("Nominal", 1).coerceAtLeast(1)) } }
                .sortedWith(compareBy<Rate> { top.indexOf(it.code).let { i -> if (i < 0) 99 else i } }.thenBy { it.name }).toList()
        } catch (e: Exception) { err = "Не получилось загрузить курсы. Проверьте интернет" }
    }
    BackScaffold("Курсы валют", actions = { IconButton({ reload++ }) { Icon(Icons.Rounded.Refresh, "Обновить") } }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            val l = rates
            when {
                err.isNotEmpty() -> item { EmptyState("Курсы не загрузились", err, "💱") }
                l == null -> items(6) { SkeletonRow() }
                else -> {
                    item {
                        val r = l.firstOrNull { it.code == pick } ?: l.first()
                        val n = amount.replace(',', '.').toDoubleOrNull() ?: 0.0
                        Column(Modifier.padding(16.dp).fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Brush.linearGradient(listOf(Color(0xFF1F8A5B), Color(0xFF2B8BB5)))).padding(20.dp)) {
                            Text("Перевести", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.labelLarge)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(12) }, Modifier.width(140.dp), singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                                        focusedBorderColor = Color.White, unfocusedBorderColor = Color.White.copy(alpha = 0.6f)))
                                Text("  ${FLAGS[r.code] ?: ""} ${r.code}  =", color = Color.White, style = MaterialTheme.typography.titleMedium)
                            }
                            Text("%,.2f ₽".format(java.util.Locale("ru"), n * r.value / r.nominal), color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
                            Text("Курс ЦБ на $date · нажмите на валюту ниже, чтобы выбрать", color = Color.White.copy(alpha = 0.8f), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    items(l, key = { it.code }) { r ->
                        val diff = r.value - r.prev
                        Row(Modifier.fillMaxWidth().clickable { pick = r.code }.background(if (pick == r.code) MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f) else Color.Transparent)
                            .padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(FLAGS[r.code] ?: "💱", fontSize = 26.sp, modifier = Modifier.width(44.dp))
                            Column(Modifier.weight(1f)) {
                                Text("${r.code}${if (r.nominal > 1) " × ${r.nominal}" else ""}", style = MaterialTheme.typography.titleSmall)
                                Text(r.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("%.2f ₽".format(java.util.Locale("ru"), r.value), style = MaterialTheme.typography.titleSmall)
                                Text((if (diff >= 0) "▲ " else "▼ ") + "%.2f".format(java.util.Locale("ru"), kotlin.math.abs(diff)), style = MaterialTheme.typography.labelMedium,
                                    color = if (diff >= 0) Color(0xFF2E7D32) else Color(0xFFC62828))
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ---------- ВС Радио (те же станции, что на сайте; играет в общем плеере) ---------- */

private val RADIO = listOf(
    listOf("record", "Радио Record", "Танцевальная музыка", "https://radiorecord.hostingradio.ru/rr_main96.aacp", "#F2994A"),
    listOf("europa", "Европа Плюс", "Поп-хиты", "https://ep256.hostingradio.ru:8052/europaplus256.mp3", "#2F80ED"),
    listOf("rusradio", "Русское Радио", "Русская поп-музыка", "https://rusradio.hostingradio.ru/rusradio96.aacp", "#D0462F"),
    listOf("dfm", "DFM", "Dance FM", "https://dfm.hostingradio.ru/dfm96.aacp", "#B4398F"),
    listOf("maximum", "Maximum", "Рок и альтернатива", "https://maximum.hostingradio.ru/maximum96.aacp", "#4E5B76"),
    listOf("chill", "Record Chill-Out", "Спокойная музыка", "https://radiorecord.hostingradio.ru/chil96.aacp", "#1F8A5B"),
    listOf("rock", "Record Rock", "Рок", "https://radiorecord.hostingradio.ru/rock96.aacp", "#141A33"),
    listOf("lofi", "Record Lo-Fi", "Лоу-фай для учёбы", "https://radiorecord.hostingradio.ru/lofi96.aacp", "#6A47C9"),
).map { (id, t, a, url, _) -> ru.vsmske.app.data.Track("radio:$id", "", t, a, url, "radio", 0.0, "", "", 0) }
private val RADIO_COLORS = listOf("#F2994A", "#2F80ED", "#D0462F", "#B4398F", "#4E5B76", "#1F8A5B", "#141A33", "#6A47C9")

@Composable
fun RadioScreen() {
    val ctx = LocalContext.current
    val ms by ru.vsmske.app.music.Music.state.collectAsState()
    BackScaffold("Радио") { pad ->
        androidx.compose.foundation.lazy.grid.LazyVerticalGrid(androidx.compose.foundation.lazy.grid.GridCells.Adaptive(160.dp), Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding(), bottom = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(RADIO.size) { i ->
                val st = RADIO[i]
                val c = parseColor(RADIO_COLORS[i])
                val on = ms.track?.id == st.id
                Column(Modifier.fillMaxWidth().height(140.dp).clip(RoundedCornerShape(28.dp))
                    .background(Brush.linearGradient(listOf(c, c.copy(alpha = 0.7f))))
                    .clickable { if (on) ru.vsmske.app.music.Music.toggle() else ru.vsmske.app.music.Music.play(ctx, RADIO, i) }.padding(16.dp)) {
                    Box(Modifier.size(40.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.25f)), contentAlignment = Alignment.Center) {
                        if (on && ms.playing) Bars(true, Color.White) else Icon(Icons.Rounded.PlayArrow, "Слушать", tint = Color.White)
                    }
                    Spacer(Modifier.weight(1f))
                    Text(st.title, color = Color.White, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                    Text(st.artist, color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
            }
            item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                Text("Если станция не включается, её эфир сейчас недоступен — попробуйте другую.", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp))
            }
        }
    }
}
