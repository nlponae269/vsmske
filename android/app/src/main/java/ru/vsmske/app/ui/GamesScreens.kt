package ru.vsmske.app.ui

import android.content.Context
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import ru.vsmske.app.data.Mines
import ru.vsmske.app.data.Ttt

/* Игры без базы (как на сайте): крестики-нолики и сапёр. Счёт и рекорды — только на телефоне. */

private fun prefs(ctx: Context) = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE)

@Composable
private fun StatChip(label: String, value: String) {
    val cs = MaterialTheme.colorScheme
    Column(Modifier.clip(RoundedCornerShape(18.dp)).background(cs.secondaryContainer).padding(horizontal = 18.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = cs.onSecondaryContainer)
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = cs.onSecondaryContainer)
    }
}

/* ---------- Крестики-нолики ---------- */

@Composable
fun TttScreen() {
    val ctx = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val p = remember { prefs(ctx) }
    var board by remember { mutableStateOf(List(9) { 0 }) }
    var hard by remember { mutableStateOf(p.getBoolean("ttt_hard", false)) }
    var xFirst by remember { mutableStateOf(true) }   // кто начинает — по очереди
    var wins by remember { mutableStateOf(p.getInt("ttt_w", 0)) }
    var losses by remember { mutableStateOf(p.getInt("ttt_l", 0)) }
    var draws by remember { mutableStateOf(p.getInt("ttt_d", 0)) }
    val res = Ttt.result(board)
    val win = Ttt.line(board)
    val myTurn = res == 0 && board.count { it == 1 } == board.count { it == 2 } + (if (xFirst) 0 else 1)
    // ход телефона — с небольшой паузой, чтобы было видно
    LaunchedEffect(board, myTurn) {
        if (res == 0 && !myTurn) { delay(380); board = board.toMutableList().also { it[Ttt.ai(board, hard = hard)] = 2 } }
    }
    LaunchedEffect(res) {
        when (res) {
            1 -> { wins++; p.edit().putInt("ttt_w", wins).apply() }
            2 -> { losses++; p.edit().putInt("ttt_l", losses).apply() }
            3 -> { draws++; p.edit().putInt("ttt_d", draws).apply() }
        }
    }
    fun again() { xFirst = !xFirst; board = List(9) { 0 } }
    val cs = MaterialTheme.colorScheme
    BackScaffold("Крестики-нолики", actions = { IconButton(::again) { Icon(Icons.Rounded.Refresh, "Новая игра") } }) { pad ->
        Column(Modifier.fillMaxSize().padding(top = pad.calculateTopPadding()).verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { StatChip("Победы", "$wins"); StatChip("Ничьи", "$draws"); StatChip("Поражения", "$losses") }
            SingleChoiceSegmentedButtonRow(Modifier.padding(top = 14.dp)) {
                listOf(false to "Лёгкий", true to "Сложный").forEachIndexed { i, (h, l) ->
                    SegmentedButton(hard == h, { hard = h; p.edit().putBoolean("ttt_hard", h).apply() }, SegmentedButtonDefaults.itemShape(i, 2)) { Text(l) }
                }
            }
            Text(when (res) { 1 -> "Вы победили! 🎉"; 2 -> "Телефон победил"; 3 -> "Ничья"; else -> if (myTurn) "Ваш ход — вы ✕" else "Телефон думает…" },
                style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(vertical = 16.dp))
            Box(Modifier.widthIn(max = 420.dp).fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(28.dp)).background(cs.surfaceContainerHigh).padding(8.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (r in 0 until 3) Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (c in 0 until 3) {
                            val i = r * 3 + c; val v = board[i]
                            val hot = win?.contains(i) == true
                            val bg by animateColorAsState(if (hot) cs.primaryContainer else cs.surface, tween(200), label = "c")
                            val pop = remember { Animatable(1f) }
                            LaunchedEffect(v) { if (v != 0) { pop.snapTo(0.4f); pop.animateTo(1f, spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessMedium)) } }
                            Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(20.dp)).background(bg)
                                .clickable(enabled = myTurn && v == 0) {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    board = board.toMutableList().also { it[i] = 1 }
                                }, contentAlignment = Alignment.Center) {
                                if (v != 0) Text(if (v == 1) "✕" else "○", Modifier.scale(pop.value), fontSize = 56.sp, fontWeight = FontWeight.Black,
                                    color = if (v == 1) cs.primary else cs.tertiary)
                            }
                        }
                    }
                }
            }
            if (res != 0) Button(::again, Modifier.padding(top = 20.dp)) { Text("Ещё партию") }
        }
    }
}

/* ---------- Сапёр ---------- */

private data class Level(val key: String, val title: String, val w: Int, val h: Int, val n: Int)
private val LEVELS = listOf(Level("easy", "Новичок", 9, 9, 10), Level("mid", "Любитель", 12, 14, 30), Level("hard", "Профи", 14, 18, 50))
private val NUM = listOf(Color(0xFF1E66F5), Color(0xFF2E9D4A), Color(0xFFD0362F), Color(0xFF6A47C9), Color(0xFF9C4A12), Color(0xFF0F8C8C), Color(0xFF333333), Color(0xFF777777))

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MinesScreen() {
    val ctx = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val p = remember { prefs(ctx) }
    var lv by remember { mutableStateOf(LEVELS.firstOrNull { it.key == p.getString("mines_lv", "easy") } ?: LEVELS[0]) }
    var f by remember { mutableStateOf(Mines.new(lv.w, lv.h)) }
    var flagMode by remember { mutableStateOf(false) }
    var sec by remember { mutableStateOf(0) }
    var best by remember(lv) { mutableStateOf(p.getInt("mines_best_${lv.key}", 0)) }
    val started = f.mines.isNotEmpty()
    val done = f.won || f.lost
    LaunchedEffect(started, done) { while (started && !done) { delay(1000); sec++ } }
    LaunchedEffect(f.won) {
        if (f.won && (best == 0 || sec < best)) { best = sec; p.edit().putInt("mines_best_${lv.key}", sec).apply() }
        if (f.won) haptic.performHapticFeedback(HapticFeedbackType.LongPress)
    }
    LaunchedEffect(f.lost) { if (f.lost) haptic.performHapticFeedback(HapticFeedbackType.LongPress) }
    fun reset(l: Level = lv) { lv = l; p.edit().putString("mines_lv", l.key).apply(); f = Mines.new(l.w, l.h); sec = 0 }
    val tapped = rememberUpdatedState { i: Int, long: Boolean ->
        if (!done) {
            val flag = long != flagMode
            f = when {
                i in f.open -> Mines.chord(f, i, lv.n)
                flag -> { if (started) { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); Mines.flag(f, i) } else f }
                else -> Mines.reveal(f, i, lv.n)
            }
        }
    }
    val cs = MaterialTheme.colorScheme
    BackScaffold("Сапёр", actions = { IconButton({ reset() }) { Icon(Icons.Rounded.Refresh, "Новая игра") } }) { pad ->
        Column(Modifier.fillMaxSize().padding(top = pad.calculateTopPadding()).verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            SingleChoiceSegmentedButtonRow {
                LEVELS.forEachIndexed { i, l -> SegmentedButton(lv == l, { reset(l) }, SegmentedButtonDefaults.itemShape(i, LEVELS.size)) { Text(l.title) } }
            }
            Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatChip("Мины", "${lv.n - f.flags.size}"); StatChip("Время", "$sec"); StatChip("Рекорд", if (best > 0) "$best" else "—")
            }
            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                FilterChip(flagMode, { flagMode = !flagMode }, { Text(if (flagMode) "🚩 Режим флажков" else "⛏ Режим копания") })
            }
            Text(when { f.won -> "Победа! Все мины найдены 🎉"; f.lost -> "Бум! Попробуйте ещё"; !started -> "Нажмите любую клетку — первая всегда без мины"
                else -> "Долгое нажатие — флажок, нажатие на цифру — открыть соседей" },
                style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant, modifier = Modifier.padding(vertical = 10.dp))
            Column(Modifier.widthIn(max = (lv.w * 40).dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(cs.surfaceContainerHighest).padding(4.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp)) {
                for (y in 0 until lv.h) Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    for (x in 0 until lv.w) {
                        val i = y * lv.w + x
                        val open = i in f.open || (done && i in f.mines)
                        val mine = i in f.mines
                        val bg = when { i == f.boom -> Color(0xFFD0362F); open -> cs.surface; f.won && mine -> cs.primaryContainer; else -> cs.secondaryContainer }
                        Box(Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(6.dp)).background(bg)
                            .combinedClickable(onLongClick = { tapped.value(i, true) }) { tapped.value(i, false) }, contentAlignment = Alignment.Center) {
                            val n = if (open && !mine) Mines.count(f, i) else 0
                            when {
                                open && mine -> Text("💣", fontSize = 14.sp)
                                i in f.flags -> Text("🚩", fontSize = 14.sp)
                                n > 0 -> Text("$n", fontWeight = FontWeight.Black, color = NUM[n - 1], fontSize = 16.sp)
                            }
                        }
                    }
                }
            }
            if (done) Button({ reset() }, Modifier.padding(top = 20.dp)) { Text("Ещё раз") }
        }
    }
}
