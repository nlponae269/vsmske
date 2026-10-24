package ru.vsmske.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Equalizer
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.TextFields
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
import androidx.compose.runtime.rememberUpdatedState
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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Lyrics
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.Track
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.music.Eq
import ru.vsmske.app.music.Music
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import androidx.media3.common.Player as M3

/*
 * Плеер 3.0 на весь экран: размытая обложка во весь фон и цвета из неё, переключатель «Трек · Текст · Очередь»,
 * волнистая полоса перемотки, кнопка «играть» меняет форму. Снизу — Эквалайзер, Скорость, Сон, вид текста.
 */

class Palette(val bg: Color, val glow: Color, val accent: Color, val onAccent: Color)

fun paletteOf(seed: Color) = Palette(
    bg = lerp(seed, Color.Black, 0.76f), glow = lerp(seed, Color.Black, 0.42f),
    accent = lerp(seed, Color.White, 0.62f), onAccent = lerp(seed, Color.Black, 0.82f),
)

/** Самый «живой» цвет обложки */
fun seedOf(b: Bitmap): Color {
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
    val eq by Eq.state.collectAsState()
    val t = s.track ?: return
    val primary = MaterialTheme.colorScheme.primary
    var view by rememberSaveable { mutableStateOf("art") }   // art | lyrics | queue
    var sheet by remember { mutableStateOf("") }               // eq | speed | sleep | playlist
    var lyrStyle by remember { mutableStateOf(if (prefs(ctx).getString("lyr_style", "apple") == "plain") "plain" else "apple") }
    var pal by remember { mutableStateOf(paletteOf(primary)) }
    val lyr = remember(t.id, t.lyrics, s.duration / 5000) { Lyrics.parse(t.lyrics, s.duration / 1000.0) }
    LaunchedEffect(t.cover) { pal = paletteOf(withContext(Dispatchers.Default) { Images.bitmapOf(t.cover)?.let(::seedOf) } ?: primary) }
    LaunchedEffect(t.id) { if (t.lyrics.isBlank() && view == "lyrics") view = "art" }
    val bg by animateColorAsState(pal.bg, tween(800), label = "bg")
    val glow by animateColorAsState(pal.glow, tween(800), label = "glow")
    val accent by animateColorAsState(pal.accent, tween(800), label = "accent")
    val onAccent by animateColorAsState(pal.onAccent, tween(800), label = "onAccent")
    val saved = t.id in (me?.tracks ?: emptyList())
    var dragY by remember { mutableStateOf(0f) }

    Box(
        Modifier.fillMaxSize().background(bg).clickable(enabled = false) {}
            .graphicsLayer { val y = dragY.coerceAtLeast(0f); translationY = y; val k = 1f - y / 6000f; scaleX = k; scaleY = k }
            .pointerInput(view) {
                if (view == "art") detectVerticalDragGestures(onDragEnd = { if (dragY > 260f) onClose(); dragY = 0f }, onDragCancel = { dragY = 0f }) { _, d -> dragY += d }
            },
    ) {
        // фон: обложка во весь экран, сильно размытая, сверху — градиент из её цвета
        if (t.cover.isNotEmpty() && Build.VERSION.SDK_INT >= 31) DbImage(t.cover, Modifier.fillMaxSize().graphicsLayer { scaleX = 1.4f; scaleY = 1.4f; alpha = 0.55f }.blur(90.dp))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(glow.copy(alpha = 0.55f), bg.copy(alpha = 0.85f), bg))))

        Column(Modifier.align(Alignment.TopCenter).fillMaxHeight().widthIn(max = 640.dp).statusBarsPadding().navigationBarsPadding().padding(horizontal = 22.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClose) { Icon(Icons.Rounded.KeyboardArrowDown, "Свернуть", tint = Color.White, modifier = Modifier.size(32.dp)) }
                Spacer(Modifier.weight(1f))
                ViewSwitch(view, t.lyrics.isNotBlank(), accent, onAccent) { view = it }
                Spacer(Modifier.weight(1f))
                IconButton({ sheet = "playlist" }) { Icon(Icons.AutoMirrored.Rounded.PlaylistAdd, "В плейлист", tint = Color.White) }
            }

            if (view != "art") MiniHeader(t, saved, accent) { scope.safe(toast) { Api.toggleSaved(t) } }

            Box(Modifier.weight(1f).fillMaxWidth().padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
                AnimatedContent(view, transitionSpec = { (fadeIn(tween(320)) + scaleIn(initialScale = 0.96f)) togetherWith fadeOut(tween(200)) }, label = "view") { v ->
                    when {
                        v == "queue" -> Queue(s, accent)
                        v == "lyrics" && t.lyrics.isNotBlank() -> LyricsView(lyr, lyrStyle, accent)
                        else -> Art(t, s.playing)
                    }
                }
            }

            if (view == "art") Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(t.title, style = MaterialTheme.typography.headlineSmall, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clickable { if (t.lyrics.isNotBlank()) view = "lyrics" })
                    Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodyLarge, color = Color.White.copy(alpha = 0.7f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                HeartButton(saved, accent) { scope.safe(toast) { Api.toggleSaved(t); toast(if (saved) "Убрано из ваших треков" else "Добавлено в ваши треки") } }
            }

            val dur = s.duration.coerceAtLeast(1)
            var drag by remember { mutableStateOf<Float?>(null) }
            val pos = rememberFramePos()
            WavySeek({ drag ?: (pos.value * 1000 / dur).toFloat().coerceIn(0f, 1f) }, s.playing, accent, Modifier.fillMaxWidth().padding(top = 12.dp),
                onDrag = { drag = it }, onDone = { drag?.let { Music.seek((it * dur).toLong()) }; drag = null })
            Row(Modifier.fillMaxWidth()) {
                Text(fmtDur(((drag?.times(dur)) ?: s.position.toFloat()) / 1000.0), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.7f))
                Spacer(Modifier.weight(1f))
                if (s.speed != 1f) Text("${fmtSpeed(s.speed)}×", style = MaterialTheme.typography.labelMedium, color = accent)
                Spacer(Modifier.weight(1f))
                Text("−" + fmtDur((dur - s.position).coerceAtLeast(0) / 1000.0), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.7f))
            }

            Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Toggle(Icons.Rounded.Shuffle, "Перемешать", s.shuffle, accent) { Music.toggleShuffle() }
                Bounce({ Music.prev() }) { Icon(Icons.Rounded.SkipPrevious, "Предыдущий", tint = Color.White, modifier = Modifier.size(40.dp)) }
                PlayPause(s.playing, s.buffering, accent, onAccent) { Music.toggle() }
                Bounce({ Music.next() }) { Icon(Icons.Rounded.SkipNext, "Следующий", tint = Color.White, modifier = Modifier.size(40.dp)) }
                Toggle(if (s.repeat == M3.REPEAT_MODE_ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat, "Повтор", s.repeat != M3.REPEAT_MODE_OFF, accent) { Music.cycleRepeat() }
            }

            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
                ActChip(Icons.Rounded.Equalizer, if (eq.active) Eq.PRESETS[eq.preset]?.first ?: "Свой" else "Эквалайзер", eq.active, accent, onAccent) { sheet = "eq" }
                ActChip(Icons.Rounded.Speed, if (s.speed != 1f) "${fmtSpeed(s.speed)}×" else "Скорость", s.speed != 1f, accent, onAccent) { sheet = "speed" }
                ActChip(Icons.Rounded.Bedtime, sleepLabel(s), s.sleepAt > 0 || s.sleepEnd, accent, onAccent) { sheet = "sleep" }
                if (view == "lyrics") ActChip(Icons.Rounded.TextFields, if (lyrStyle == "plain") "Обычный" else "Apple Music", false, accent, onAccent) {
                    lyrStyle = if (lyrStyle == "plain") "apple" else "plain"; prefs(ctx).edit().putString("lyr_style", lyrStyle).apply()
                }
            }
        }
    }

    when (sheet) {
        "eq" -> EqSheet { sheet = "" }
        "speed" -> SpeedSheet { sheet = "" }
        "sleep" -> SleepSheet { sheet = "" }
        "playlist" -> PlaylistPickSheet(t) { sheet = "" }
    }
}

fun fmtSpeed(v: Float) = if (v == v.toInt().toFloat()) "${v.toInt()}" else "%.2f".format(java.util.Locale.US, v).trimEnd('0').replace('.', ',')

@Composable
private fun sleepLabel(s: Music.State): String {
    var left by remember { mutableStateOf(Music.sleepLeft()) }
    LaunchedEffect(s.sleepAt) { while (s.sleepAt > 0) { left = Music.sleepLeft(); delay(1000) } }
    return when { s.sleepEnd -> "До конца трека"; s.sleepAt == 0L -> "Сон"; else -> fmtDur(left / 1000.0) }
}

/** «Трек · Текст · Очередь» — сегменты-таблетки */
@Composable
private fun ViewSwitch(view: String, hasLyrics: Boolean, accent: Color, onAccent: Color, onPick: (String) -> Unit) {
    Row(Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.1f)).padding(3.dp)) {
        listOf("art" to "Трек", "lyrics" to "Текст", "queue" to "Очередь").forEach { (k, l) ->
            val on = view == k
            val c by animateColorAsState(if (on) accent else Color.Transparent, label = "seg")
            val enabled = k != "lyrics" || hasLyrics
            Text(l, style = MaterialTheme.typography.labelLarge, color = if (on) onAccent else Color.White.copy(alpha = if (enabled) 0.85f else 0.35f),
                modifier = Modifier.clip(CircleShape).background(c).clickable(enabled = enabled) { onPick(if (on && k != "art") "art" else k) }.padding(horizontal = 14.dp, vertical = 7.dp))
        }
    }
}

@Composable
private fun MiniHeader(t: Track, saved: Boolean, accent: Color, onHeart: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        TrackCover(t, 52.dp, 12.dp)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(t.title, style = MaterialTheme.typography.titleMedium, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.65f), maxLines = 1)
        }
        HeartButton(saved, accent, onHeart)
    }
}

@Composable
private fun HeartButton(saved: Boolean, accent: Color, onClick: () -> Unit) {
    val k by animateFloatAsState(if (saved) 1.1f else 1f, spring(dampingRatio = 0.3f, stiffness = 500f), label = "heart")
    IconButton(onClick) {
        Icon(if (saved) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, "В мои треки", tint = if (saved) accent else Color.White.copy(alpha = 0.85f),
            modifier = Modifier.size(28.dp).graphicsLayer { scaleX = k; scaleY = k })
    }
}

@Composable
private fun Art(t: Track, playing: Boolean) {
    val k by animateFloatAsState(if (playing) 1f else 0.84f, spring(dampingRatio = 0.6f, stiffness = 240f), label = "art")
    val corner by animateDpAsState(if (playing) 30.dp else 44.dp, spring(dampingRatio = 0.7f), label = "corner")
    var dx by remember { mutableStateOf(0f) }
    Box(
        Modifier.widthIn(max = 420.dp).fillMaxWidth().aspectRatio(1f)
            .graphicsLayer { scaleX = k; scaleY = k; translationX = dx; rotationZ = dx / 36f; alpha = 1f - minOf(0.5f, abs(dx) / 900f) }
            .pointerInput(t.id) { detectHorizontalDragGestures(onDragEnd = { if (dx < -170) Music.next() else if (dx > 170) Music.prev(); dx = 0f }, onDragCancel = { dx = 0f }) { _, d -> dx += d } }
            .shadow(if (playing) 36.dp else 14.dp, RoundedCornerShape(corner))
            .clip(RoundedCornerShape(corner)).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        if (t.cover.isNotEmpty()) DbImage(t.cover, Modifier.fillMaxSize())
        else {
            Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary))))
            Icon(Icons.Rounded.MusicNote, null, tint = Color.White.copy(alpha = 0.9f), modifier = Modifier.size(120.dp))
        }
    }
}

/** «Играть»: круг на паузе → скруглённый квадрат во время игры (Material 3 Expressive) */
@Composable
private fun PlayPause(playing: Boolean, buffering: Boolean, color: Color, onColor: Color, onClick: () -> Unit) {
    val corner by animateDpAsState(if (playing) 26.dp else 44.dp, spring(dampingRatio = 0.45f, stiffness = 420f), label = "corner")
    val w by animateDpAsState(if (playing) 104.dp else 88.dp, spring(dampingRatio = 0.55f, stiffness = 420f), label = "w")
    Surface(onClick = onClick, shape = RoundedCornerShape(corner), color = color, modifier = Modifier.width(w).height(88.dp), shadowElevation = 6.dp) {
        Box(contentAlignment = Alignment.Center) {
            if (buffering) ExpressiveLoader(36.dp, onColor)
            else AnimatedContent(playing, transitionSpec = { (scaleIn(initialScale = 0.6f) + fadeIn()) togetherWith fadeOut(tween(90)) }, label = "pp") { p ->
                Icon(if (p) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (p) "Пауза" else "Играть", tint = onColor, modifier = Modifier.size(44.dp))
            }
        }
    }
}

/** Кнопка, которая «пружинит» при нажатии */
@Composable
private fun Bounce(onClick: () -> Unit, content: @Composable () -> Unit) {
    var pressed by remember { mutableStateOf(false) }
    val k by animateFloatAsState(if (pressed) 0.8f else 1f, spring(dampingRatio = 0.4f, stiffness = 600f), label = "b")
    Box(Modifier.size(64.dp).graphicsLayer { scaleX = k; scaleY = k }.clip(CircleShape)
        .pointerInput(Unit) { detectTapGestures(onPress = { pressed = true; tryAwaitRelease(); pressed = false }, onTap = { onClick() }) },
        contentAlignment = Alignment.Center) { content() }
}

@Composable
private fun Toggle(icon: ImageVector, desc: String, on: Boolean, accent: Color, onClick: () -> Unit) {
    val c by animateColorAsState(if (on) accent.copy(alpha = 0.22f) else Color.Transparent, label = "t")
    Box(Modifier.size(48.dp).clip(CircleShape).background(c).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, desc, tint = if (on) accent else Color.White.copy(alpha = 0.75f))
    }
}

@Composable
private fun ActChip(icon: ImageVector, label: String, on: Boolean, accent: Color, onAccent: Color, onClick: () -> Unit) {
    val c by animateColorAsState(if (on) accent else Color.White.copy(alpha = 0.1f), label = "chip")
    val fg = if (on) onAccent else Color.White.copy(alpha = 0.9f)
    Row(Modifier.height(40.dp).clip(CircleShape).background(c).clickable(onClick = onClick).padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = fg, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(label, color = fg, style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}

/**
 * Волнистая полоса перемотки, как в медиаплеере Android 13+: сыгранная часть — бегущая волна
 * (на паузе плавно выпрямляется), остаток — тонкая линия, ползунок — вертикальная таблетка.
 */
@Composable
fun WavySeek(value: () -> Float, playing: Boolean, color: Color, modifier: Modifier, onDrag: (Float) -> Unit, onDone: () -> Unit) {
    val amp by animateFloatAsState(if (playing) 1f else 0f, tween(450), label = "amp")
    val phase by rememberInfiniteTransition(label = "wave").animateFloat(0f, (2 * PI).toFloat(), infiniteRepeatable(tween(1500, easing = LinearEasing)), label = "phase")
    val d = LocalDensity.current
    // жесты запускаются один раз — берём свежие обработчики (в них длительность текущего трека)
    val drag by rememberUpdatedState(onDrag)
    val done by rememberUpdatedState(onDone)
    Canvas(
        modifier.height(40.dp)
            .pointerInput(Unit) { detectTapGestures { o -> drag((o.x / size.width).coerceIn(0f, 1f)); done() } }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(onDragStart = { o -> drag((o.x / size.width).coerceIn(0f, 1f)) }, onDragEnd = { done() }, onDragCancel = { done() }) { ch, _ ->
                    drag((ch.position.x / size.width).coerceIn(0f, 1f))
                }
            },
    ) {
        val cy = size.height / 2
        val x = size.width * value()
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

@Composable
private fun Queue(s: Music.State, accent: Color) {
    val state = rememberLazyListState()
    LaunchedEffect(Unit) { if (s.index > 0) state.scrollToItem(s.index) }
    LazyColumn(Modifier.fillMaxSize(), state = state, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        itemsIndexed(s.queue, key = { i, t -> "$i-${t.id}" }) { i, t ->
            val on = i == s.index
            Row(Modifier.animateItem().fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(if (on) Color.White.copy(alpha = 0.13f) else Color.Transparent)
                .clickable { Music.jump(i) }.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(contentAlignment = Alignment.Center) {
                    TrackCover(t, 48.dp, 12.dp)
                    if (on) Box(Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) { Bars(s.playing, accent) }
                }
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(t.title, color = if (on) accent else Color.White, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
                if (!on) IconButton({ Music.removeAt(i) }) { Icon(Icons.Rounded.Close, "Убрать из очереди", tint = Color.White.copy(alpha = 0.5f)) }
                else Text(fmtDur(t.duration), color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(end = 12.dp))
            }
        }
    }
}

/** Три прыгающих столбика «сейчас играет» */
@Composable
fun Bars(playing: Boolean, color: Color, modifier: Modifier = Modifier) {
    val tr = rememberInfiniteTransition(label = "bars")
    val hs = (0..2).map { i -> tr.animateFloat(0.3f, 1f, infiniteRepeatable(tween(420 + i * 130, easing = LinearEasing), RepeatMode.Reverse), label = "h$i") }
    Canvas(modifier.size(18.dp)) {
        val w = size.width / 5
        hs.forEachIndexed { i, h ->
            val hh = size.height * (if (playing) h.value else 0.3f)
            drawRoundRect(color, Offset(i * 2 * w, size.height - hh), Size(w, hh), CornerRadius(w / 2))
        }
    }
}
