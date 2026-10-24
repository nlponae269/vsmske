package ru.vsmske.app.ui

import android.content.Context
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Calc
import ru.vsmske.app.data.G2048
import kotlin.math.abs
import kotlin.random.Random

/* Сервисы без базы (как на сайте): 2048, Калькулятор, Таймер/секундомер, Жребий. Всё хранится только на телефоне. */

private fun prefs(ctx: Context) = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE)

/* ---------- 2048 ---------- */

private val TILE = mapOf(
    2 to Color(0xFFEEE4DA), 4 to Color(0xFFEDE0C8), 8 to Color(0xFFF2B179), 16 to Color(0xFFF59563), 32 to Color(0xFFF67C5F),
    64 to Color(0xFFF65E3B), 128 to Color(0xFFEDCF72), 256 to Color(0xFFEDCC61), 512 to Color(0xFFEDC850), 1024 to Color(0xFFEDC53F), 2048 to Color(0xFFEDC22E),
)

@Composable
fun Game2048Screen() {
    val ctx = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val p = remember { prefs(ctx) }
    fun saved(): List<Int>? = p.getString("g2048", null)?.split(',')?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 16 }
    var board by remember { mutableStateOf(saved() ?: G2048.empty()) }
    var score by remember { mutableStateOf(p.getInt("g2048_score", 0)) }
    var best by remember { mutableStateOf(p.getInt("g2048_best", 0)) }
    var won by remember { mutableStateOf(p.getBoolean("g2048_won", false)) }
    var showWin by remember { mutableStateOf(false) }
    val over = !G2048.canMove(board)
    fun save() { p.edit().putString("g2048", board.joinToString(",")).putInt("g2048_score", score).putInt("g2048_best", best).putBoolean("g2048_won", won).apply() }
    fun reset() { board = G2048.empty(); score = 0; won = false; showWin = false; save() }
    val doMove = rememberUpdatedState { dir: Int ->
        val m = G2048.move(board, dir)
        if (m.moved) {
            board = G2048.spawn(m.board); score += m.gained
            if (score > best) best = score
            if (!won && board.any { it >= 2048 }) { won = true; showWin = true }
            if (m.gained > 0) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            save()
        }
    }
    val cs = MaterialTheme.colorScheme
    BackScaffold("2048", actions = { IconButton(::reset) { Icon(Icons.Rounded.Refresh, "Новая игра") } }) { pad ->
        Column(Modifier.fillMaxSize().padding(top = pad.calculateTopPadding()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf("Счёт" to score, "Рекорд" to best).forEach { (l, v) ->
                    Column(Modifier.clip(RoundedCornerShape(18.dp)).background(cs.secondaryContainer).padding(horizontal = 22.dp, vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(l, style = MaterialTheme.typography.labelMedium, color = cs.onSecondaryContainer)
                        Text("$v", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = cs.onSecondaryContainer)
                    }
                }
            }
            Text("Сдвигайте плитки пальцем. Одинаковые складываются.", style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant, modifier = Modifier.padding(vertical = 12.dp))
            Box(Modifier.widthIn(max = 460.dp).fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(24.dp)).background(Color(0xFFBBADA0))
                .pointerInput(Unit) {
                    var total = Offset.Zero
                    detectDragGestures(onDragStart = { total = Offset.Zero }, onDragEnd = {
                        if (maxOf(abs(total.x), abs(total.y)) > 40f)
                            doMove.value(if (abs(total.x) > abs(total.y)) (if (total.x < 0) 0 else 1) else (if (total.y < 0) 2 else 3))
                    }) { ch, d -> ch.consume(); total += d }
                }.padding(8.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (r in 0 until 4) Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (c in 0 until 4) {
                            val v = board[r * 4 + c]
                            val bg by animateColorAsState(if (v == 0) Color(0xFFCDC1B4) else TILE[v] ?: Color(0xFF3C3A32), tween(120), label = "t")
                            val pop = remember { Animatable(1f) }
                            LaunchedEffect(v) { if (v != 0) { pop.snapTo(0.85f); pop.animateTo(1f, spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessMedium)) } }
                            Box(Modifier.weight(1f).fillMaxHeight().scale(pop.value).clip(RoundedCornerShape(12.dp)).background(bg), contentAlignment = Alignment.Center) {
                                if (v != 0) Text("$v", fontWeight = FontWeight.Black, color = if (v <= 4) Color(0xFF776E65) else Color.White,
                                    fontSize = when { v < 100 -> 32.sp; v < 1000 -> 26.sp; else -> 20.sp })
                            }
                        }
                    }
                }
                if (over) Box(Modifier.matchParentSize().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.7f)), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Ходов нет", style = MaterialTheme.typography.headlineMedium, color = Color(0xFF776E65), fontWeight = FontWeight.Bold)
                        Button(::reset, Modifier.padding(top = 12.dp)) { Text("Ещё раз") }
                    }
                }
            }
        }
    }
    if (showWin) AlertDialog({ showWin = false }, title = { Text("2048! 🎉") }, text = { Text("Вы собрали плитку 2048. Можно играть дальше — за рекордом.") },
        confirmButton = { TextButton({ showWin = false }) { Text("Дальше") } }, dismissButton = { TextButton(::reset) { Text("Новая игра") } })
}

/* ---------- Калькулятор ---------- */

@Composable
fun CalcScreen() {
    val ctx = LocalContext.current
    val p = remember { prefs(ctx) }
    var expr by rememberSaveable { mutableStateOf("") }
    var hist by remember { mutableStateOf(p.getString("calc_hist", "")!!.split('\n').filter { it.isNotBlank() }) }
    val preview = remember(expr) { Calc.eval(expr)?.let { Calc.fmt(it) } }
    fun press(k: String) {
        when (k) {
            "C" -> expr = ""
            "⌫" -> expr = expr.dropLast(1)
            "=" -> {
                val v = Calc.eval(expr) ?: return
                val r = Calc.fmt(v)
                hist = (listOf("$expr = $r") + hist).take(30)
                p.edit().putString("calc_hist", hist.joinToString("\n")).apply()
                expr = r
            }
            "( )" -> expr += if (expr.count { it == '(' } > expr.count { it == ')' } && expr.lastOrNull()?.let { it.isDigit() || it == ')' || it == '%' } == true) ")" else "("
            else -> if (expr.length < 120) expr += k
        }
    }
    val cs = MaterialTheme.colorScheme
    val keys = listOf(
        listOf("C", "( )", "%", "÷"), listOf("7", "8", "9", "×"), listOf("4", "5", "6", "−"),
        listOf("1", "2", "3", "+"), listOf(",", "0", "⌫", "="),
    )
    BackScaffold("Калькулятор") { pad ->
        Column(Modifier.fillMaxSize().padding(top = pad.calculateTopPadding()).padding(16.dp).widthIn(max = 520.dp)) {
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), reverseLayout = true) {
                items(hist) { h ->
                    Text(h, style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant, textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth().clickable { expr = h.substringAfterLast("= ") }.padding(vertical = 4.dp))
                }
            }
            Text(expr.ifEmpty { "0" }, style = MaterialTheme.typography.displaySmall, textAlign = TextAlign.End, maxLines = 2, modifier = Modifier.fillMaxWidth())
            Text(if (preview != null && preview != expr) "= $preview" else " ", style = MaterialTheme.typography.titleLarge, color = cs.primary,
                textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp))
            keys.forEach { row ->
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { k ->
                        val op = k in setOf("÷", "×", "−", "+", "=")
                        val fn = k in setOf("C", "( )", "%", "⌫")
                        Box(Modifier.weight(1f).height(68.dp).clip(if (k == "=") RoundedCornerShape(24.dp) else CircleShape)
                            .background(when { k == "=" -> cs.primary; op -> cs.primaryContainer; fn -> cs.secondaryContainer; else -> cs.surfaceContainerHigh })
                            .clickable { press(k) }, contentAlignment = Alignment.Center) {
                            Text(k, fontSize = 26.sp, color = when { k == "=" -> cs.onPrimary; op -> cs.onPrimaryContainer; fn -> cs.onSecondaryContainer; else -> cs.onSurface })
                        }
                    }
                }
            }
            if (hist.isNotEmpty()) TextButton({ hist = emptyList(); p.edit().remove("calc_hist").apply() }, Modifier.align(Alignment.End)) { Text("Очистить историю") }
        }
    }
}

/* ---------- Таймер и секундомер ---------- */

private fun fmtMs(ms: Long, cs: Boolean = true): String {
    val t = ms.coerceAtLeast(0); val h = t / 3_600_000; val m = t / 60_000 % 60; val s = t / 1000 % 60; val c = t / 10 % 100
    val base = if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
    return if (cs) "$base,%02d".format(c) else base
}

@Composable
fun TimerScreen() {
    var tab by rememberSaveable { mutableStateOf(0) }
    BackScaffold("Таймер") { pad ->
        Column(Modifier.fillMaxSize().padding(top = pad.calculateTopPadding())) {
            PrimaryTabRowCompat(tab, listOf("Секундомер", "Таймер")) { tab = it }
            if (tab == 0) Stopwatch() else Countdown()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PrimaryTabRowCompat(sel: Int, titles: List<String>, onSel: (Int) -> Unit) =
    PrimaryTabRow(sel) { titles.forEachIndexed { i, t -> Tab(sel == i, { onSel(i) }, text = { Text(t) }) } }

/** Секундомер переживает поворот экрана: храним время старта, а не «тиканье» */
@Composable
private fun Stopwatch() {
    var startAt by rememberSaveable { mutableStateOf(0L) }    // 0 — стоит
    var acc by rememberSaveable { mutableStateOf(0L) }
    var laps by rememberSaveable { mutableStateOf(listOf<Long>()) }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    val running = startAt != 0L
    LaunchedEffect(running) { while (running) { now = System.currentTimeMillis(); delay(16) } }
    val total = acc + if (running) now - startAt else 0
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(fmtMs(total), fontSize = 60.sp, fontWeight = FontWeight.Light, modifier = Modifier.padding(vertical = 32.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            FilledTonalButton({ if (running) laps = listOf(total) + laps else { acc = 0; laps = emptyList() } }, Modifier.size(width = 130.dp, height = 56.dp), enabled = running || total > 0) {
                if (running) { Icon(Icons.Rounded.Flag, null); Text("  Круг") } else Text("Сброс")
            }
            Button({
                val t = System.currentTimeMillis()
                if (running) { acc += t - startAt; startAt = 0 } else { startAt = t; now = t }
            }, Modifier.size(width = 130.dp, height = 56.dp)) {
                Icon(if (running) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null); Text(if (running) "  Стоп" else "  Старт")
            }
        }
        LazyColumn(Modifier.padding(top = 20.dp).widthIn(max = 420.dp)) {
            items(laps.size) { i ->
                val lap = laps[i]; val prev = laps.getOrNull(i + 1) ?: 0
                Row(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
                    Text("Круг ${laps.size - i}", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("+" + fmtMs(lap - prev), Modifier.weight(1f), textAlign = TextAlign.Center)
                    Text(fmtMs(lap), Modifier.weight(1f), textAlign = TextAlign.End)
                }
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun Countdown() {
    val haptic = LocalHapticFeedback.current
    var endAt by rememberSaveable { mutableStateOf(0L) }     // 0 — не идёт
    var left by rememberSaveable { mutableStateOf(5 * 60_000L) }
    var set by rememberSaveable { mutableStateOf(5 * 60_000L) }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    var ring by remember { mutableStateOf(false) }
    val running = endAt != 0L
    LaunchedEffect(running) {
        while (running) {
            now = System.currentTimeMillis()
            if (now >= endAt) { endAt = 0; left = 0; ring = true; break }
            delay(50)
        }
    }
    LaunchedEffect(ring) {
        if (!ring) return@LaunchedEffect
        val tone = runCatching { android.media.ToneGenerator(android.media.AudioManager.STREAM_ALARM, 90) }.getOrNull()
        try { repeat(6) { tone?.startTone(android.media.ToneGenerator.TONE_PROP_BEEP2, 400); haptic.performHapticFeedback(HapticFeedbackType.LongPress); delay(700) } }
        finally { tone?.release() }
    }
    val shown = if (running) endAt - now else left
    val cs = MaterialTheme.colorScheme
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.padding(vertical = 24.dp).size(240.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator({ if (set > 0) (shown.toFloat() / set).coerceIn(0f, 1f) else 0f }, Modifier.fillMaxSize(), strokeWidth = 10.dp, trackColor = cs.surfaceContainerHighest)
            Text(fmtMs(shown + if (running) 999 else 0, cs = false), fontSize = 48.sp, fontWeight = FontWeight.Light)
        }
        if (!running && left == set) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                listOf(1, 3, 5, 10, 25).forEach { m -> FilterChip(set == m * 60_000L, { set = m * 60_000L; left = set }, { Text("$m мин") }, shape = CircleShape) }
            }
            var custom by remember { mutableStateOf("") }
            OutlinedTextField(custom, { v -> custom = v.filter(Char::isDigit).take(3); custom.toLongOrNull()?.takeIf { it in 1..999 }?.let { set = it * 60_000; left = set } },
                Modifier.width(200.dp), label = { Text("Свои минуты") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.padding(top = 20.dp)) {
            FilledTonalButton({ endAt = 0; left = set; ring = false }, Modifier.size(width = 130.dp, height = 56.dp)) { Text("Сброс") }
            Button({
                ring = false
                if (running) { left = endAt - System.currentTimeMillis(); endAt = 0 }
                else if (left > 0) { endAt = System.currentTimeMillis() + left; now = System.currentTimeMillis() }
            }, Modifier.size(width = 130.dp, height = 56.dp), enabled = running || left > 0) {
                Icon(if (running) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null); Text(if (running) "  Пауза" else "  Старт")
            }
        }
        if (ring) Text("Время вышло! ⏰", style = MaterialTheme.typography.headlineSmall, color = cs.primary, modifier = Modifier.padding(top = 24.dp))
        Text("Держите экран открытым — таймер работает, пока открыт этот раздел.", style = MaterialTheme.typography.bodySmall,
            color = cs.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 24.dp))
    }
}

/* ---------- Жребий: монетка, кубики, число, выбор из списка ---------- */

@Composable
fun DiceScreen() {
    val haptic = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf(0) }
    var result by rememberSaveable { mutableStateOf("") }
    var dice by rememberSaveable { mutableStateOf(2) }
    var from by rememberSaveable { mutableStateOf("1") }
    var to by rememberSaveable { mutableStateOf("100") }
    var options by rememberSaveable { mutableStateOf("") }
    val spin = remember { Animatable(0f) }
    fun roll(make: () -> String) {
        scope.launch {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            spin.snapTo(0f)
            launch { spin.animateTo(1f, tween(650)) }
            repeat(8) { result = make(); delay(70) }
            result = make()
        }
    }
    val faces = listOf("⚀", "⚁", "⚂", "⚃", "⚄", "⚅")
    val cs = MaterialTheme.colorScheme
    BackScaffold("Жребий") { pad ->
        Column(Modifier.fillMaxSize().padding(top = pad.calculateTopPadding()).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
            PrimaryTabRowCompat(tab, listOf("Монетка", "Кубики", "Число", "Выбор")) { tab = it; result = "" }
            Box(Modifier.padding(24.dp).size(220.dp).graphicsLayer { rotationY = spin.value * 720f }.clip(CircleShape).background(cs.primaryContainer), contentAlignment = Alignment.Center) {
                Text(result.ifEmpty { "?" }, fontSize = if (result.length > 8) 22.sp else if (tab == 1) 56.sp else 40.sp, color = cs.onPrimaryContainer,
                    textAlign = TextAlign.Center, fontWeight = FontWeight.Bold, modifier = Modifier.padding(16.dp))
            }
            when (tab) {
                0 -> Button({ roll { if (Random.nextBoolean()) "Орёл" else "Решка" } }, Modifier.height(56.dp)) { Text("Подбросить") }
                1 -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { (1..4).forEach { n -> FilterChip(dice == n, { dice = n }, { Text("$n") }, shape = CircleShape) } }
                    Button({ roll { List(dice) { faces[Random.nextInt(6)] }.joinToString(" ") } }, Modifier.padding(top = 12.dp).height(56.dp)) { Text("Бросить") }
                    if (result.isNotEmpty()) Text("Сумма: ${result.split(' ').sumOf { faces.indexOf(it) + 1 }}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
                }
                2 -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 24.dp)) {
                        OutlinedTextField(from, { from = it.filter { c -> c.isDigit() || c == '-' }.take(9) }, Modifier.weight(1f), label = { Text("От") }, singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                        OutlinedTextField(to, { to = it.filter { c -> c.isDigit() || c == '-' }.take(9) }, Modifier.weight(1f), label = { Text("До") }, singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    }
                    val a = from.toIntOrNull(); val b = to.toIntOrNull()
                    Button({ roll { val lo = minOf(a!!, b!!); val hi = maxOf(a, b); Random.nextInt(lo, hi + 1).toString() } },
                        Modifier.padding(top = 12.dp).height(56.dp), enabled = a != null && b != null) { Text("Случайное число") }
                }
                else -> {
                    OutlinedTextField(options, { options = it.take(2000) }, Modifier.fillMaxWidth().padding(horizontal = 24.dp), label = { Text("Варианты — каждый с новой строки") }, minLines = 4)
                    val list = options.lines().map { it.trim() }.filter { it.isNotEmpty() }
                    Button({ roll { list.random() } }, Modifier.padding(top = 12.dp).height(56.dp), enabled = list.size >= 2) { Text("Выбрать") }
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}
