package ru.vsmske.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Playlist
import ru.vsmske.app.data.Track
import ru.vsmske.app.data.plural
import ru.vsmske.app.music.Eq
import ru.vsmske.app.music.Music
import kotlin.math.ln
import kotlin.math.roundToInt

/* Шторки плеера: эквалайзер, скорость, таймер сна, «в плейлист». */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VsSheet(onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.surfaceContainerLow, shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp)) { content() }
    }
}

@Composable
private fun SheetHeader(title: String, sub: String = "", trailing: (@Composable () -> Unit)? = null) =
    Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        trailing?.invoke()
    }

/** Эквалайзер: 10 полос ±12 дБ, «Усиление басов», пресеты и живая кривая АЧХ */
@Composable
fun EqSheet(onClose: () -> Unit) {
    val s by Eq.state.collectAsState()
    val cs = MaterialTheme.colorScheme
    VsSheet(onClose) {
        SheetHeader("Эквалайзер", if (s.on) "Звук настраивается на телефоне — работает и в фоне" else "Выключен") {
            Switch(s.on, { Eq.toggle() })
        }
        EqCurve(s, Modifier.fillMaxWidth().height(110.dp).clip(RoundedCornerShape(24.dp)).background(cs.surfaceContainerHigh))
        LazyRow(Modifier.padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(Eq.PRESETS.entries.toList()) { (k, v) ->
                FilterChip(s.on && s.preset == k, { Eq.preset(k) }, { Text(v.first) }, shape = CircleShape,
                    leadingIcon = if (s.on && s.preset == k) ({ Icon(Icons.Rounded.Check, null, Modifier.size(18.dp)) }) else null)
            }
        }
        Row(Modifier.fillMaxWidth().height(230.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Eq.F.forEachIndexed { i, f ->
                EqBand(s.bands[i], s.on, if (f >= 1000) "${f / 1000}k" else "$f", Modifier.weight(1f)) { Eq.band(i, it) }
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Усиление басов", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            Text(if (s.bass == 0) "выкл" else "+${s.bass} дБ", style = MaterialTheme.typography.labelLarge, color = cs.primary)
        }
        Slider(s.bass.toFloat(), { Eq.bass(it.roundToInt()) }, valueRange = 0f..12f, steps = 11)
        TextButton({ Eq.reset() }, Modifier.align(Alignment.End)) { Icon(Icons.Rounded.RestartAlt, null); Spacer(Modifier.width(6.dp)); Text("Сбросить") }
    }
}

/** Вертикальная полоса эквалайзера: таблетка, заливка от нуля, круглый ползунок; тянуть пальцем */
@Composable
private fun EqBand(db: Int, on: Boolean, label: String, modifier: Modifier, onChange: (Int) -> Unit) {
    val cs = MaterialTheme.colorScheme
    val v by animateFloatAsState(db.toFloat(), spring(dampingRatio = 0.7f, stiffness = 500f), label = "band")
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(if (db > 0) "+$db" else "$db", style = MaterialTheme.typography.labelSmall, color = if (db != 0 && on) cs.primary else cs.onSurfaceVariant)
        Canvas(
            Modifier.weight(1f).width(34.dp).padding(vertical = 8.dp)
                .pointerInput(Unit) {
                    fun at(y: Float) = (12 - (y / size.height * 24f)).roundToInt().coerceIn(-12, 12)
                    detectTapGestures { onChange(at(it.y)) }
                }
                .pointerInput(Unit) {
                    fun at(y: Float) = (12 - (y / size.height * 24f)).roundToInt().coerceIn(-12, 12)
                    detectVerticalDragGestures { ch, _ -> ch.consume(); onChange(at(ch.position.y)) }
                },
        ) {
            val w = 10.dp.toPx(); val cx = size.width / 2
            val mid = size.height / 2
            val y = mid - v / 12f * mid
            drawRoundRect(cs.surfaceContainerHighest, Offset(cx - w / 2, 0f), Size(w, size.height), CornerRadius(w / 2))
            val active = if (on) cs.primary else cs.outline
            drawRoundRect(active, Offset(cx - w / 2, minOf(y, mid)), Size(w, kotlin.math.abs(mid - y).coerceAtLeast(2f)), CornerRadius(w / 2))
            drawLine(cs.outlineVariant, Offset(cx - w, mid), Offset(cx + w, mid), 1.dp.toPx())
            drawCircle(active, 11.dp.toPx(), Offset(cx, y))
            drawCircle(cs.surface, 4.dp.toPx(), Offset(cx, y))
        }
        Text(label, style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}

/** Кривая АЧХ по тем же формулам, что звук */
@Composable
private fun EqCurve(s: Eq.Settings, modifier: Modifier) {
    val cs = MaterialTheme.colorScheme
    Canvas(modifier) {
        val n = 120
        val lo = ln(20.0); val hi = ln(20000.0)
        val p = Path(); val fill = Path()
        for (i in 0..n) {
            val f = kotlin.math.exp(lo + (hi - lo) * i / n)
            val db = Eq.response(f, s).coerceIn(-15.0, 15.0)
            val x = size.width * i / n; val y = (size.height / 2 - db / 15.0 * size.height * 0.42).toFloat()
            if (i == 0) { p.moveTo(x, y); fill.moveTo(x, size.height); fill.lineTo(x, y) } else { p.lineTo(x, y); fill.lineTo(x, y) }
        }
        fill.lineTo(size.width, size.height); fill.close()
        drawLine(cs.outlineVariant, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), 1.dp.toPx())
        drawPath(fill, Brush.verticalGradient(listOf(cs.primary.copy(alpha = 0.35f), Color.Transparent)))
        drawPath(p, cs.primary, style = Stroke(3.dp.toPx(), cap = StrokeCap.Round))
    }
}

/** Скорость: готовые значения, slowed / speed up и «сохранять тон» */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SpeedSheet(onClose: () -> Unit) {
    val s by Music.state.collectAsState()
    VsSheet(onClose) {
        SheetHeader("Скорость", "${fmtSpeed(s.speed)}×")
        Slider(s.speed, { Music.setSpeed((it * 20).roundToInt() / 20f) }, valueRange = 0.5f..2f)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f).forEach { v ->
                FilterChip(s.speed == v, { Music.setSpeed(v) }, { Text("${fmtSpeed(v)}×") }, shape = CircleShape)
            }
            FilterChip(s.speed == 0.85f && !s.pitch, { Music.setSpeed(0.85f, false) }, { Text("🌙 Slowed") }, shape = CircleShape)
            FilterChip(s.speed == 1.25f && !s.pitch, { Music.setSpeed(1.25f, false) }, { Text("⚡ Speed up") }, shape = CircleShape)
        }
        Row(Modifier.fillMaxWidth().padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Сохранять тон", style = MaterialTheme.typography.titleSmall)
                Text("Выключите — голос станет ниже или выше, как на пластинке", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(s.pitch, { Music.setSpeed(s.speed, it) })
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SleepSheet(onClose: () -> Unit) {
    val s by Music.state.collectAsState()
    VsSheet(onClose) {
        SheetHeader("Таймер сна", when { s.sleepEnd -> "Выключится в конце трека"; s.sleepAt > 0 -> "Музыка плавно затихнет"; else -> "Выключить музыку через…" })
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(5, 10, 15, 30, 45, 60, 90).forEach { m ->
                FilterChip(false, { Music.sleepIn(m); onClose() }, { Text("$m мин") }, shape = CircleShape)
            }
            FilterChip(s.sleepEnd, { Music.sleepAtEnd(); onClose() }, { Text("В конце трека") }, shape = CircleShape)
        }
        if (s.sleepAt > 0 || s.sleepEnd) TextButton({ Music.sleepIn(0); onClose() }, Modifier.padding(top = 8.dp)) { Text("Выключить таймер") }
    }
}

/** Добавить трек в свой плейлист (или создать новый) */
@Composable
fun PlaylistPickSheet(t: Track, onClose: () -> Unit) {
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<List<Playlist>?>(null) }
    var name by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { list = runCatching { Media.playlistsMine() }.getOrDefault(emptyList()) }
    VsSheet(onClose) {
        SheetHeader("В плейлист", t.title)
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(name, { name = it.take(60) }, Modifier.weight(1f), placeholder = { Text("Новый плейлист") }, singleLine = true, shape = CircleShape)
            Spacer(Modifier.width(8.dp))
            Box(Modifier.size(52.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary).clickable(enabled = name.isNotBlank()) {
                scope.safe(toast) { Media.savePlaylist(null, name, listOf(t.id)); toast("Плейлист «${name.trim()}» создан"); onClose() }
            }, contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Add, "Создать", tint = MaterialTheme.colorScheme.onPrimary) }
        }
        Spacer(Modifier.height(12.dp))
        val l = list
        if (l == null) Loading()
        else l.forEach { p ->
            val has = t.id in p.tracks
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).clickable(enabled = !has) {
                scope.safe(toast) { Media.savePlaylist(p.id, p.title, p.tracks + t.id, p.color); toast("Добавлено в «${p.title}»"); onClose() }
            }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(parseColor(p.color, MaterialTheme.colorScheme.tertiaryContainer)), contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Rounded.QueueMusic, null, tint = Color.White)
                }
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(p.title, style = MaterialTheme.typography.titleSmall)
                    Text("${p.tracks.size} ${plural(p.tracks.size, "трек", "трека", "треков")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (has) Icon(Icons.Rounded.Check, "Уже здесь", tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}
