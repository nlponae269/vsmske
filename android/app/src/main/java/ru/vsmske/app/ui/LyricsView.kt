package ru.vsmske.app.ui

import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import ru.vsmske.app.data.LLine
import ru.vsmske.app.data.Lyrics
import ru.vsmske.app.music.Music
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.sin

/*
 * Текст песни 3.0.
 * «Apple Music» (по умолчанию): крупные жирные строки; текущая заливается слово за словом мягким краем,
 * строки едут «волной» (каждая следующая чуть позже — пружина), дальние размыты, в паузах дышат три точки.
 * Палец двигает текст свободно, через 3 секунды он сам возвращается к текущей строке; нажатие на строку — перемотка.
 * «Обычный»: ровный список по центру, текущая строка подсвечена.
 * Позиция берётся каждый кадр (Music.State.smooth()), поэтому заливка идёт плавно, а не рывками раз в четверть секунды.
 */

/** Позиция трека в секундах, обновляется каждый кадр (читать её лучше в фазе рисования) */
@Composable
fun rememberFramePos(): State<Double> {
    val st = remember { mutableDoubleStateOf(Music.state.value.smooth() / 1000.0) }
    LaunchedEffect(Unit) {
        while (true) withFrameMillis {
            val s = Music.state.value
            val p = s.smooth() / 1000.0
            // мелкий откат назад при очередном опросе не показываем — заливка не дёргается
            st.doubleValue = if (s.playing && p < st.doubleValue && st.doubleValue - p < 0.2) st.doubleValue else p
        }
    }
    return st
}

@Composable
fun LyricsView(lyr: Lyrics, style: String, accent: Color, modifier: Modifier = Modifier, contentTop: Int = 0) {
    val pos = rememberFramePos()
    when {
        !lyr.timed -> StaticLyrics(lyr, style, modifier)
        style == "plain" -> PlainLyrics(lyr, pos, accent, modifier)
        else -> AppleLyrics(lyr, pos, modifier, contentTop)
    }
}

private val AppleStyle = TextStyle(fontFamily = Onest, fontSize = 31.sp, lineHeight = 38.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp)

@Composable
private fun AppleLyrics(lyr: Lyrics, pos: State<Double>, modifier: Modifier, contentTop: Int) {
    val lines = lyr.lines
    val cur by remember(lyr) { derivedStateOf { lyr.indexAt(pos.value + 0.12) } }
    val scope = rememberCoroutineScope()
    // своя «прокрутка» у каждой строки — догоняет цель с задержкой по расстоянию (эффект волны)
    val scrolls = remember(lyr) { List(lines.size) { Animatable(0f) } }
    val tops = remember(lyr) { FloatArray(lines.size + 1) }
    var topsVer by remember(lyr) { mutableIntStateOf(0) }
    val drag = remember { Animatable(0f) }
    var dragging by remember { mutableStateOf(false) }
    var userAt by remember { mutableStateOf(0L) }
    var first by remember(lyr) { mutableStateOf(true) }

    LaunchedEffect(cur, topsVer) {
        val c = cur.coerceAtLeast(0)
        val target = tops[c]
        if (first) { scrolls.forEach { it.snapTo(target) }; first = false; return@LaunchedEffect }
        scrolls.forEachIndexed { i, a ->
            val d = i - c
            val lag = if (d < -2) 0L else (d + 2).coerceIn(0, 9) * 45L
            launch { delay(lag); a.animateTo(target, spring(dampingRatio = 0.86f, stiffness = 95f)) }
        }
    }
    LaunchedEffect(userAt) {
        if (userAt == 0L) return@LaunchedEffect
        delay(3000)
        if (!dragging) drag.animateTo(0f, spring(dampingRatio = 0.9f, stiffness = Spring.StiffnessLow))
    }

    BoxWithConstraints(modifier.fillMaxSize().clipToBounds()
        .pointerInput(lyr) {
            detectVerticalDragGestures(
                onDragStart = { dragging = true },
                onDragEnd = { dragging = false; userAt = System.currentTimeMillis() },
                onDragCancel = { dragging = false; userAt = System.currentTimeMillis() },
            ) { ch, dy -> ch.consume(); scope.launch { drag.snapTo(drag.value + dy) } }
        }) {
        val anchor = with(LocalDensity.current) { (maxHeight * 0.26f).toPx() } + contentTop
        val free = drag.value != 0f || dragging
        Layout(content = {
            lines.forEachIndexed { i, l ->
                val dist = if (cur < 0) i + 1 else abs(i - cur)
                AppleLine(l, i == cur, dist, free, pos) { Music.seek((l.start * 1000).toLong()) }
            }
        }) { ms, cons ->
            val c = cons.copy(minHeight = 0, maxHeight = Constraints.Infinity)
            val ps = ms.map { it.measure(c) }
            var y = 0f; var changed = false
            ps.forEachIndexed { i, p -> if (tops[i] != y) { tops[i] = y; changed = true }; y += p.height }
            tops[ps.size] = y
            if (changed) topsVer++
            layout(cons.maxWidth, cons.maxHeight) {
                ps.forEachIndexed { i, p -> p.placeWithLayer(0, (tops[i] - scrolls[i].value + anchor + drag.value).toInt()) }
            }
        }
    }
}

@Composable
private fun AppleLine(l: LLine, on: Boolean, dist: Int, free: Boolean, pos: State<Double>, onTap: () -> Unit) {
    if (l.pause) {
        AnimatedVisibility(on, enter = expandVertically(tween(420, easing = FastOutSlowInEasing)) + fadeIn(tween(300)),
            exit = shrinkVertically(tween(420, easing = FastOutSlowInEasing)) + fadeOut(tween(200))) {
            PauseDots(l, pos)
        }
        return
    }
    val alpha by animateFloatAsState(if (on) 1f else if (free) 0.55f else 0.42f, tween(400), label = "a")
    val scale by animateFloatAsState(if (on) 1f else 0.955f, spring(dampingRatio = 0.75f, stiffness = 160f), label = "s")
    val blurR by animateFloatAsState(if (on || free || Build.VERSION.SDK_INT < 31) 0f else minOf(dist, 5) * 1.05f, tween(500), label = "b")
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    val dim = Color.White.copy(alpha = 0.34f)
    androidx.compose.material3.Text(
        l.text, style = AppleStyle, color = if (on) dim else Color.White.copy(alpha = 0.5f), onTextLayout = { layout = it },
        modifier = Modifier.fillMaxWidth()
            .clickable(remember { MutableInteractionSource() }, null, onClick = onTap)
            .padding(vertical = 11.dp)
            .graphicsLayer { this.alpha = alpha; scaleX = scale; scaleY = scale; transformOrigin = TransformOrigin(0f, 0.5f) }
            .then(if (blurR > 0.05f) Modifier.blur(blurR.dp) else Modifier)
            .drawWithContent {
                drawContent()
                val lay = layout ?: return@drawWithContent
                if (!on) return@drawWithContent
                val lit = l.litChars(pos.value)
                if (lit <= 0f) return@drawWithContent
                val edge = 28.dp.toPx()
                for (row in 0 until lay.lineCount) {
                    val a = lay.getLineStart(row); val b = lay.getLineEnd(row, visibleEnd = true)
                    if (lit <= a) break
                    val left = lay.getLineLeft(row); val right = lay.getLineRight(row)
                    val x = if (lit >= b) right + edge else {
                        val k = floor(lit).toInt().coerceIn(a, b - 1)
                        val x0 = lay.getHorizontalPosition(k, true)
                        val x1 = if (k + 1 < b) lay.getHorizontalPosition(k + 1, true) else right
                        x0 + (x1 - x0) * (lit - k)
                    }
                    val brush = Brush.horizontalGradient(0f to Color.White, 1f to Color.Transparent,
                        startX = (x - edge * 0.6f).coerceAtLeast(left - 1), endX = x + edge * 0.4f)
                    clipRect(top = lay.getLineTop(row), bottom = lay.getLineBottom(row)) { drawText(lay, brush = brush) }
                }
            },
    )
}

/** Проигрыш: три точки «дышат» и по очереди загораются, перед концом сжимаются */
@Composable
private fun PauseDots(l: LLine, pos: State<Double>) {
    Canvas(Modifier.padding(vertical = 18.dp).width(78.dp).height(26.dp)) {
        val p = l.progress(pos.value)
        val t = pos.value
        val breathe = 1f + 0.12f * sin(t * 3.4).toFloat()
        val outro = if (p > 0.9f) 1f - (p - 0.9f) / 0.1f * 0.6f else 1f
        val r = size.height / 2 * 0.62f
        for (i in 0..2) {
            val lit = ((p * 3f) - i).coerceIn(0f, 1f)
            val cx = r + i * (size.width - 2 * r) / 2.4f
            drawCircle(Color.White.copy(alpha = 0.3f + 0.7f * lit), r * breathe * outro * (0.85f + 0.15f * lit), Offset(cx, size.height / 2))
        }
    }
}

@Composable
private fun PlainLyrics(lyr: Lyrics, pos: State<Double>, accent: Color, modifier: Modifier) {
    val lines = remember(lyr) { lyr.lines.filter { !it.pause } }
    val cur by remember(lines) { derivedStateOf { lines.indexOfLast { it.start <= pos.value + 0.2 } } }
    val state = rememberLazyListState()
    BoxWithConstraints(modifier.fillMaxSize()) {
        val h = with(LocalDensity.current) { maxHeight.roundToPx() }
        LaunchedEffect(cur) { if (cur >= 0) state.animateScrollToItem(cur, -h / 3) }
        LazyColumn(Modifier.fillMaxSize(), state = state, contentPadding = PaddingValues(top = 24.dp, bottom = maxHeight * 0.6f),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            itemsIndexed(lines) { i, l ->
                val on = i == cur
                val a by animateFloatAsState(if (on) 1f else 0.55f, tween(300), label = "pa")
                androidx.compose.material3.Text(l.text, textAlign = TextAlign.Center, style = TextStyle(fontFamily = Onest, fontSize = if (on) 22.sp else 19.sp, lineHeight = 28.sp,
                    fontWeight = if (on) FontWeight.Bold else FontWeight.Medium), color = if (on) accent else Color.White,
                    modifier = Modifier.fillMaxWidth().graphicsLayer { alpha = a }.clickable { Music.seek((l.start * 1000).toLong()) }.padding(horizontal = 8.dp))
            }
        }
    }
}

/** Текст без тайм-кодов — просто читаем */
@Composable
private fun StaticLyrics(lyr: Lyrics, style: String, modifier: Modifier) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(if (style == "plain") 8.dp else 14.dp)) {
        lyr.lines.forEach { l ->
            if (l.text.isEmpty()) Box(Modifier.height(10.dp))
            else androidx.compose.material3.Text(l.text, color = Color.White.copy(alpha = 0.92f),
                textAlign = if (style == "plain") TextAlign.Center else TextAlign.Start, modifier = Modifier.fillMaxWidth(),
                style = if (style == "plain") TextStyle(fontFamily = Onest, fontSize = 19.sp, lineHeight = 27.sp, fontWeight = FontWeight.Medium) else AppleStyle.copy(fontSize = 26.sp, lineHeight = 33.sp))
        }
        Box(Modifier.height(120.dp))
    }
}

