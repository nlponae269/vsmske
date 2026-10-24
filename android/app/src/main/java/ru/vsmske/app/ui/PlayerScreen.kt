package ru.vsmske.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Lyrics
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.data.parseLyrics
import ru.vsmske.app.music.Music
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import androidx.media3.common.Player as M3

/*
 * Плеер на весь экран — как медиаплеер Android (Material You):
 * цвета из обложки, волнистая полоса перемотки, кнопка «играть» меняет форму (круг ↔ скруглённый квадрат),
 * «таблетки» Текст и Очередь. Текст песни по умолчанию как в Apple Music, можно переключить на «Обычный».
 */

private class Palette(val bg: Color, val glow: Color, val accent: Color, val onAccent: Color)

private fun paletteOf(seed: Color) = Palette(
    bg = lerp(seed, Color.Black, 0.74f), glow = lerp(seed, Color.Black, 0.45f),
    accent = lerp(seed, Color.White, 0.6f), onAccent = lerp(seed, Color.Black, 0.8f),
)

/** Самый «живой» цвет обложки */
private fun seedOf(b: Bitmap): Color {
    val s = Bitmap.createScaledBitmap(b, 12, 12, true)
    var best = Color.Gray; var score = -1f
    for (y in 0 until 12) for (x in 0 until 12) {
        val c = Color(s.getPixel(x, y))
        val mx = maxOf(c.red, c.green, c.blue); val mn = minOf(c.red, c.green, c.blue)
        val sc = (mx - mn) * 2f + mx * 0.5f - if (mx < 0.15f) 1f else 0f
        if (sc > score) { score = sc; best = c }
    }
    return best
}

private fun prefs(ctx: Context) = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE)

@Composable
fun PlayerScreen(onClose: () -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val s by Music.state.collectAsState()
    val me by Store.me.collectAsState()
    val t = s.track ?: return
    val primary = MaterialTheme.colorScheme.primary
    var view by rememberSaveable { mutableStateOf("art") }   // art | lyrics | queue
    var lyrStyle by remember { mutableStateOf(prefs(ctx).getString("lyr_style", "apple") ?: "apple") }
    var pal by remember { mutableStateOf(paletteOf(primary)) }
    LaunchedEffect(t.cover) {
        pal = paletteOf(withContext(Dispatchers.Default) { Images.bitmapOf(t.cover)?.let(::seedOf) } ?: primary)
        if (t.lyrics.isEmpty() && view == "lyrics") view = "art"
    }
    val bg by animateColorAsState(pal.bg, tween(700), label = "bg")
    val glow by animateColorAsState(pal.glow, tween(700), label = "glow")
    val accent by animateColorAsState(pal.accent, tween(700), label = "accent")
    val onAccent by animateColorAsState(pal.onAccent, tween(700), label = "onAccent")
    val saved = t.id in (me?.tracks ?: emptyList())
    var dragY by remember { mutableStateOf(0f) }

    Box(
        Modifier.fillMaxSize().background(bg).clickable(enabled = false) {}
            .graphicsLayer { translationY = dragY.coerceAtLeast(0f) }
            .pointerInput(Unit) { detectVerticalDragGestures(onDragEnd = { if (dragY > 260f) onClose(); dragY = 0f }, onDragCancel = { dragY = 0f }) { _, d -> dragY += d } },
    ) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(glow, bg), endY = 1800f)))
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClose) { Icon(Icons.Rounded.KeyboardArrowDown, "Свернуть", tint = Color.White, modifier = Modifier.size(32.dp)) }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(when (view) { "lyrics" -> "Текст песни"; "queue" -> "Очередь"; else -> "Сейчас играет" }, style = MaterialTheme.typography.labelLarge, color = Color.White)
                    Text(if (s.queue.size > 1) "${s.index + 1} из ${s.queue.size}" else "ВС Музыка", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.6f))
                }
                Spacer(Modifier.size(48.dp))
            }

            Box(Modifier.weight(1f).fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                AnimatedContent(view, transitionSpec = { fadeIn(tween(250)) togetherWith fadeOut(tween(200)) }, label = "view") { v ->
                    when {
                        v == "queue" -> Queue(s, accent)
                        v == "lyrics" && t.lyrics.isNotEmpty() -> Lyrics(t.lyrics, s.position / 1000.0, lyrStyle, accent, onAccent) { lyrStyle = it; prefs(ctx).edit().putString("lyr_style", it).apply() }
                        else -> Art(t, s.playing)
                    }
                }
            }

            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(t.title, style = MaterialTheme.typography.headlineSmall, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodyLarge, color = Color.White.copy(alpha = 0.7f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (t.ownerId != Store.uid) IconButton({ scope.safe(toast) { Api.toggleSaved(t); toast(if (saved) "Убрано из ваших треков" else "Добавлено в ваши треки") } }) {
                    Icon(if (saved) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, "В мои треки", tint = if (saved) accent else Color.White.copy(alpha = 0.85f))
                }
            }

            val dur = s.duration.coerceAtLeast(1)
            var drag by remember { mutableStateOf<Float?>(null) }
            WavySeek(drag ?: (s.position.toFloat() / dur).coerceIn(0f, 1f), s.playing, accent, Modifier.fillMaxWidth().padding(top = 16.dp),
                onDrag = { drag = it }, onDone = { drag?.let { Music.seek((it * dur).toLong()) }; drag = null })
            Row(Modifier.fillMaxWidth()) {
                Text(fmtDur(((drag?.times(dur)) ?: s.position.toFloat()) / 1000.0), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.7f))
                Spacer(Modifier.weight(1f))
                Text(fmtDur(dur / 1000.0), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.7f))
            }

            Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Toggle(Icons.Rounded.Shuffle, "Перемешать", s.shuffle, accent) { Music.toggleShuffle() }
                IconButton({ Music.prev() }, Modifier.size(60.dp)) { Icon(Icons.Rounded.SkipPrevious, "Предыдущий", tint = Color.White, modifier = Modifier.size(38.dp)) }
                PlayPause(s.playing, s.buffering, accent, onAccent) { Music.toggle() }
                IconButton({ Music.next() }, Modifier.size(60.dp)) { Icon(Icons.Rounded.SkipNext, "Следующий", tint = Color.White, modifier = Modifier.size(38.dp)) }
                Toggle(if (s.repeat == M3.REPEAT_MODE_ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat, "Повтор", s.repeat != M3.REPEAT_MODE_OFF, accent) { Music.cycleRepeat() }
            }

            Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally)) {
                Pill(Icons.Rounded.Lyrics, "Текст", view == "lyrics", t.lyrics.isNotEmpty(), glow, accent, onAccent) { view = if (view == "lyrics") "art" else "lyrics" }
                Pill(Icons.AutoMirrored.Rounded.QueueMusic, "Очередь", view == "queue", true, glow, accent, onAccent) { view = if (view == "queue") "art" else "queue" }
            }
        }
    }
}

@Composable
private fun Art(t: ru.vsmske.app.data.Track, playing: Boolean) {
    val k by animateFloatAsState(if (playing) 1f else 0.86f, spring(dampingRatio = 0.65f, stiffness = 280f), label = "art")
    var dx by remember { mutableStateOf(0f) }
    Box(
        Modifier.widthIn(max = 400.dp).fillMaxWidth().aspectRatio(1f)
            .graphicsLayer { scaleX = k; scaleY = k; translationX = dx; rotationZ = dx / 40f }
            .pointerInput(t.id) { detectHorizontalDragGestures(onDragEnd = { if (dx < -180) Music.next() else if (dx > 180) Music.prev(); dx = 0f }, onDragCancel = { dx = 0f }) { _, d -> dx += d } }
            .shadow(28.dp, RoundedCornerShape(28.dp)).clip(RoundedCornerShape(28.dp)).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        if (t.cover.isNotEmpty()) DbImage(t.cover, Modifier.fillMaxSize())
        else Icon(Icons.Rounded.MusicNote, null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(120.dp))
    }
}

/** «Играть»: круг на паузе → скруглённый квадрат во время игры (Material 3 Expressive) */
@Composable
private fun PlayPause(playing: Boolean, buffering: Boolean, color: Color, onColor: Color, onClick: () -> Unit) {
    val corner by animateDpAsState(if (playing) 24.dp else 42.dp, spring(dampingRatio = 0.5f, stiffness = 400f), label = "corner")
    val w by animateDpAsState(if (playing) 100.dp else 84.dp, spring(dampingRatio = 0.6f, stiffness = 400f), label = "w")
    Surface(onClick = onClick, shape = RoundedCornerShape(corner), color = color, modifier = Modifier.width(w).height(84.dp)) {
        Box(contentAlignment = Alignment.Center) {
            if (buffering) CircularProgressIndicator(Modifier.size(30.dp), color = onColor, strokeWidth = 3.dp)
            else Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (playing) "Пауза" else "Играть", tint = onColor, modifier = Modifier.size(42.dp))
        }
    }
}

@Composable
private fun Toggle(icon: ImageVector, desc: String, on: Boolean, accent: Color, onClick: () -> Unit) =
    Box(Modifier.size(48.dp).clip(CircleShape).background(if (on) accent.copy(alpha = 0.22f) else Color.Transparent).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, desc, tint = if (on) accent else Color.White.copy(alpha = 0.75f))
    }

@Composable
private fun Pill(icon: ImageVector, label: String, on: Boolean, enabled: Boolean, base: Color, accent: Color, onAccent: Color, onClick: () -> Unit) {
    val c by animateColorAsState(if (on) accent else lerp(base, Color.White, 0.08f), label = "pill")
    val fg = if (on) onAccent else Color.White.copy(alpha = if (enabled) 0.9f else 0.35f)
    Row(Modifier.height(44.dp).clip(CircleShape).background(c).clickable(enabled = enabled, onClick = onClick).padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = fg, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)); Text(label, color = fg, style = MaterialTheme.typography.labelLarge)
    }
}

/**
 * Волнистая полоса перемотки, как в медиаплеере Android 13+: сыгранная часть — бегущая волна
 * (на паузе плавно выпрямляется), остаток — тонкая линия, ползунок — вертикальная таблетка.
 */
@Composable
private fun WavySeek(value: Float, playing: Boolean, color: Color, modifier: Modifier, onDrag: (Float) -> Unit, onDone: () -> Unit) {
    val amp by animateFloatAsState(if (playing) 1f else 0f, tween(450), label = "amp")
    val phase by rememberInfiniteTransition(label = "wave").animateFloat(0f, (2 * PI).toFloat(), infiniteRepeatable(tween(1500, easing = LinearEasing)), label = "phase")
    val d = LocalDensity.current
    Canvas(
        modifier.height(40.dp)
            .pointerInput(Unit) { detectTapGestures { o -> onDrag((o.x / size.width).coerceIn(0f, 1f)); onDone() } }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(onDragStart = { o -> onDrag((o.x / size.width).coerceIn(0f, 1f)) }, onDragEnd = onDone, onDragCancel = onDone) { ch, _ ->
                    onDrag((ch.position.x / size.width).coerceIn(0f, 1f))
                }
            },
    ) {
        val cy = size.height / 2
        val x = size.width * value
        val stroke = with(d) { 4.dp.toPx() }
        val a = with(d) { 3.5.dp.toPx() } * amp
        val wave = with(d) { 30.dp.toPx() }
        val gap = with(d) { 6.dp.toPx() }
        if (x + gap < size.width) drawLine(color.copy(alpha = 0.3f), Offset(x + gap, cy), Offset(size.width, cy), stroke, StrokeCap.Round)
        val end = x - gap
        if (end > 0f) {
            val p = Path(); var px = 0f
            p.moveTo(0f, cy + a * sin(-phase))
            while (px < end) { px = minOf(end, px + 2f); p.lineTo(px, cy + a * sin(px / wave * 2 * PI.toFloat() - phase)) }
            drawPath(p, color, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        val tw = with(d) { 5.dp.toPx() }; val th = with(d) { 24.dp.toPx() }
        drawRoundRect(color, Offset(x - tw / 2, cy - th / 2), Size(tw, th), CornerRadius(tw / 2))
    }
}

/** Текст песни: сверху выбор вида (Apple Music / Обычный), ниже сам текст */
@Composable
private fun Lyrics(text: String, pos: Double, style: String, accent: Color, onAccent: Color, onStyle: (String) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("apple" to "Apple Music", "plain" to "Обычный").forEach { (k, l) ->
                val on = style == k
                Text(l, style = MaterialTheme.typography.labelLarge, color = if (on) onAccent else Color.White.copy(alpha = 0.85f),
                    modifier = Modifier.clip(CircleShape).background(if (on) accent else Color.White.copy(alpha = 0.12f)).clickable { onStyle(k) }.padding(horizontal = 14.dp, vertical = 7.dp))
            }
        }
        if (style == "plain") PlainLyrics(text, pos, accent) else AppleLyrics(text, pos)
    }
}

/**
 * Как в Apple Music: крупные жирные строки слева; текущая заливается белым по мере пения,
 * остальные приглушены, дальние размыты; текст едет так, чтобы текущая строка была в верхней трети.
 */
@Composable
private fun AppleLyrics(text: String, pos: Double) {
    val (timed, lines) = remember(text) { parseLyrics(text) }
    val state = rememberLazyListState()
    val cur = if (timed) lines.indexOfLast { it.t <= pos + 0.15 } else -1
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val offset = with(LocalDensity.current) { (maxHeight * 0.25f).roundToPx() }
        LaunchedEffect(cur) { if (cur >= 0) state.animateScrollToItem(cur, -offset) }
        LazyColumn(Modifier.fillMaxSize(), state = state, contentPadding = PaddingValues(top = 8.dp, bottom = maxHeight * 0.6f), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            itemsIndexed(lines) { i, l ->
                val on = i == cur
                val dist = if (cur < 0) 0 else abs(i - cur)
                val alpha by animateFloatAsState(if (!timed) 0.95f else if (on) 1f else 0.3f, tween(350), label = "a")
                val scale by animateFloatAsState(if (on || !timed) 1f else 0.96f, spring(dampingRatio = 0.8f, stiffness = 220f), label = "s")
                val blur = if (timed && !on && Build.VERSION.SDK_INT >= 31) minOf(dist, 4) * 0.9f else 0f
                val next = lines.getOrNull(i + 1)?.t ?: (l.t + 4.0)
                val frac = if (on) ((pos - l.t) / (next - l.t).coerceAtLeast(0.5)).toFloat().coerceIn(0f, 1f) else 0f
                val base = TextStyle(fontSize = 30.sp, lineHeight = 37.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.4).sp)
                val st = if (on) base.copy(brush = Brush.horizontalGradient(0f to Color.White, frac to Color.White, (frac + 0.1f).coerceAtMost(1f) to Color.White.copy(alpha = 0.4f), 1f to Color.White.copy(alpha = 0.4f)))
                         else base.copy(color = Color.White)
                Text(l.text.ifEmpty { "• • •" }, style = st,
                    modifier = Modifier.fillMaxWidth()
                        .graphicsLayer { this.alpha = alpha; scaleX = scale; scaleY = scale; transformOrigin = TransformOrigin(0f, 0.5f) }
                        .then(if (blur > 0f) Modifier.blur(blur.dp) else Modifier)
                        .then(if (timed) Modifier.clickable { Music.seek((l.t * 1000).toLong()) } else Modifier))
            }
        }
    }
}

/** Обычный текст: ровный список, текущая строка подсвечена */
@Composable
private fun PlainLyrics(text: String, pos: Double, accent: Color) {
    val (timed, lines) = remember(text) { parseLyrics(text) }
    val state = rememberLazyListState()
    val cur = if (timed) lines.indexOfLast { it.t <= pos + 0.25 } else -1
    LaunchedEffect(cur) { if (cur >= 0) state.animateScrollToItem(maxOf(0, cur - 2)) }
    LazyColumn(Modifier.fillMaxSize(), state = state, contentPadding = PaddingValues(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        itemsIndexed(lines) { i, l ->
            val on = i == cur
            Text(l.text.ifEmpty { "♪" }, fontSize = 19.sp, lineHeight = 26.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                color = if (on) accent else Color.White.copy(alpha = if (timed) 0.6f else 0.9f),
                modifier = if (timed) Modifier.clickable { Music.seek((l.t * 1000).toLong()) } else Modifier)
        }
    }
}

@Composable
private fun Queue(s: Music.State, accent: Color) {
    val state = rememberLazyListState()
    LaunchedEffect(Unit) { if (s.index > 0) state.scrollToItem(s.index) }
    LazyColumn(Modifier.fillMaxSize(), state = state, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        itemsIndexed(s.queue) { i, t ->
            val on = i == s.index
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (on) Color.White.copy(alpha = 0.12f) else Color.Transparent).clickable { Music.jump(i) }.padding(8.dp),
                verticalAlignment = Alignment.CenterVertically) {
                TrackCover(t, 48.dp, 10.dp)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(t.title, color = if (on) accent else Color.White, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
                Text(fmtDur(t.duration), color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
