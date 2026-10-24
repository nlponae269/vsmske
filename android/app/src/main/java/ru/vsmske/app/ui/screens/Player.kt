package ru.vsmske.app.ui.screens

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
import androidx.compose.runtime.mutableFloatStateOf
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
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import ru.vsmske.app.data.Fb
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Session
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.data.parseLyrics
import ru.vsmske.app.music.MusicPlayer
import ru.vsmske.app.ui.DbImage
import ru.vsmske.app.ui.LocalToast
import ru.vsmske.app.ui.safe
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

/*
 * Полноэкранный плеер в стиле медиаплеера Android (Material You):
 * цвета — из обложки (как карточка плеера в шторке Android 13+), волнистая полоса перемотки,
 * кнопка «играть» меняет форму (круг на паузе → скруглённый квадрат во время игры),
 * текст песни — как в Apple Music (по умолчанию) или обычный.
 */

/** Палитра плеера из обложки: фон, контейнер, акцент и цвет на акценте */
data class PlayerColors(val bg: Color, val container: Color, val accent: Color, val onAccent: Color, val fg: Color = Color.White)

private fun seedOf(b: Bitmap?): Color? {
    if (b == null) return null
    val s = Bitmap.createScaledBitmap(b.copy(Bitmap.Config.ARGB_8888, false), 8, 8, true)
    val px = (0 until 64).map { Color(s.getPixel(it % 8, it / 8)) }
    return px.maxByOrNull { c -> val mx = maxOf(c.red, c.green, c.blue); val mn = minOf(c.red, c.green, c.blue); (mx - mn) * 2 + mx }
}

private fun colorsFrom(seed: Color): PlayerColors {
    val bg = lerp(seed, Color.Black, 0.72f)
    val accent = lerp(seed, Color.White, 0.55f)
    return PlayerColors(bg = bg, container = lerp(seed, Color.Black, 0.5f), accent = accent, onAccent = lerp(seed, Color.Black, 0.78f))
}

/** Вид текста песни: Apple Music (по умолчанию) или обычный; хранится на устройстве */
private fun lyrStyle(ctx: Context) = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE).getString("lyr_style", "ap") ?: "ap"
private fun setLyrStyle(ctx: Context, v: String) = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE).edit().putString("lyr_style", v).apply()

@Composable
fun FullPlayer(onClose: () -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val s by MusicPlayer.state.collectAsState()
    val me by Session.me.collectAsState()
    val t = s.track ?: return
    val theme = MaterialTheme.colorScheme
    var view by rememberSaveable { mutableStateOf("art") }   // art | lyrics | queue
    var style by remember { mutableStateOf(lyrStyle(ctx)) }
    var pc by remember { mutableStateOf(colorsFrom(theme.primary)) }
    LaunchedEffect(t.cover) { pc = colorsFrom(seedOf(Images.decode(t.cover)?.asAndroidBitmap()) ?: theme.primary) }
    val bg by animateColorAsState(pc.bg, tween(700), label = "bg")
    val container by animateColorAsState(pc.container, tween(700), label = "ct")
    val accent by animateColorAsState(pc.accent, tween(700), label = "ac")
    val onAccent by animateColorAsState(pc.onAccent, tween(700), label = "oa")
    val saved = t.id in (me?.tracks ?: emptyList())
    val mine = t.ownerId == Fb.uid

    Box(Modifier.fillMaxSize().background(bg).clickable(enabled = false) {}) {
        // мягкое свечение цвета обложки сверху, как у карточки плеера Android
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(container, bg), endY = 1600f)))
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClose) { Icon(Icons.Rounded.KeyboardArrowDown, "Свернуть", tint = Color.White, modifier = Modifier.size(30.dp)) }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(when (view) { "lyrics" -> "Текст песни"; "queue" -> "Очередь"; else -> "Сейчас играет" }, style = MaterialTheme.typography.labelLarge, color = Color.White)
                    Text("ВС Музыка", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.6f))
                }
                Spacer(Modifier.size(48.dp))
            }

            Box(Modifier.weight(1f).fillMaxWidth().padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
                AnimatedContent(view, transitionSpec = { fadeIn(tween(250)) togetherWith fadeOut(tween(200)) }, label = "view") { v ->
                    when {
                        v == "queue" -> QueueList(s, accent)
                        v == "lyrics" && t.lyrics.isNotEmpty() -> LyricsPane(t.lyrics, s.position / 1000.0, style, accent) { style = it; setLyrStyle(ctx, it) }
                        else -> Artwork(t.cover, s.playing)
                    }
                }
            }

            // название, исполнитель и ♥ (в мои треки)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(t.title, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Medium), color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodyLarge, color = Color.White.copy(alpha = 0.7f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (!mine) IconButton({ scope.safe(toast) { Repo.toggleSaved(t, saved); toast(if (saved) "Убрано из ваших треков" else "Добавлено в ваши треки") } }) {
                    Icon(if (saved) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, "В мои треки", tint = if (saved) accent else Color.White.copy(alpha = 0.8f))
                }
            }

            val dur = s.duration.coerceAtLeast(1)
            var drag by remember { mutableStateOf<Float?>(null) }
            WavySlider(
                value = drag ?: (s.position.toFloat() / dur).coerceIn(0f, 1f), playing = s.playing, color = accent,
                onDrag = { drag = it }, onDone = { drag?.let { MusicPlayer.seek((it * dur).toLong()) }; drag = null },
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
            )
            Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp)) {
                Text(fmtDur((drag?.times(dur) ?: s.position.toFloat()) / 1000.0), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.7f))
                Spacer(Modifier.weight(1f))
                Text(fmtDur(dur / 1000.0), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.7f))
            }

            Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                ToggleIcon(Icons.Rounded.Shuffle, "Перемешать", s.shuffle, accent) { MusicPlayer.toggleShuffle() }
                IconButton({ MusicPlayer.prev() }, Modifier.size(56.dp)) { Icon(Icons.Rounded.SkipPrevious, "Предыдущий", tint = Color.White, modifier = Modifier.size(36.dp)) }
                PlayButton(s.playing, s.loading, accent, onAccent) { MusicPlayer.toggle() }
                IconButton({ MusicPlayer.next() }, Modifier.size(56.dp)) { Icon(Icons.Rounded.SkipNext, "Следующий", tint = Color.White, modifier = Modifier.size(36.dp)) }
                ToggleIcon(if (s.repeat == Player.REPEAT_MODE_ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat, "Повтор", s.repeat != Player.REPEAT_MODE_OFF, accent) { MusicPlayer.cycleRepeat() }
            }

            // нижние кнопки: текст и очередь — тональные «таблетки», как в Material You
            Row(Modifier.fillMaxWidth().padding(bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally)) {
                PillToggle(Icons.Rounded.Lyrics, "Текст", view == "lyrics", enabled = t.lyrics.isNotEmpty(), container, accent, onAccent) { view = if (view == "lyrics") "art" else "lyrics" }
                PillToggle(Icons.AutoMirrored.Rounded.QueueMusic, "Очередь", view == "queue", enabled = true, container, accent, onAccent) { view = if (view == "queue") "art" else "queue" }
            }
        }
    }
}

@Composable
private fun Artwork(cover: String, playing: Boolean) {
    val scale by animateFloatAsState(if (playing) 1f else 0.88f, spring(dampingRatio = 0.7f, stiffness = 300f), label = "art")
    Box(Modifier.widthIn(max = 380.dp).fillMaxWidth().aspectRatio(1f).graphicsLayer { scaleX = scale; scaleY = scale }
        .shadow(24.dp, RoundedCornerShape(28.dp)).clip(RoundedCornerShape(28.dp)).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center) {
        if (cover.isNotEmpty()) DbImage(cover, Modifier.fillMaxSize())
        else Icon(Icons.Rounded.MusicNote, null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(120.dp))
    }
}

/** Кнопка «играть»: круг на паузе, скруглённый квадрат во время игры (как в Material 3 Expressive) */
@Composable
private fun PlayButton(playing: Boolean, loading: Boolean, color: Color, onColor: Color, onClick: () -> Unit) {
    val corner by animateDpAsState(if (playing) 26.dp else 40.dp, spring(dampingRatio = 0.55f, stiffness = 380f), label = "corner")
    val w by animateDpAsState(if (playing) 96.dp else 80.dp, spring(dampingRatio = 0.6f, stiffness = 380f), label = "w")
    Surface(onClick = onClick, shape = RoundedCornerShape(corner), color = color, modifier = Modifier.width(w).height(80.dp)) {
        Box(contentAlignment = Alignment.Center) {
            if (loading) CircularProgressIndicator(Modifier.size(30.dp), color = onColor, strokeWidth = 3.dp)
            else Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (playing) "Пауза" else "Играть", tint = onColor, modifier = Modifier.size(40.dp))
        }
    }
}

@Composable
private fun ToggleIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, desc: String, on: Boolean, accent: Color, onClick: () -> Unit) {
    Box(Modifier.size(48.dp).clip(CircleShape).background(if (on) accent.copy(alpha = 0.22f) else Color.Transparent).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, desc, tint = if (on) accent else Color.White.copy(alpha = 0.75f), modifier = Modifier.size(24.dp))
    }
}

@Composable
private fun PillToggle(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, on: Boolean, enabled: Boolean, container: Color, accent: Color, onAccent: Color, onClick: () -> Unit) {
    val bgc by animateColorAsState(if (on) accent else container.copy(alpha = 0.9f), label = "pill")
    val fgc = if (on) onAccent else Color.White.copy(alpha = if (enabled) 0.9f else 0.35f)
    Row(
        Modifier.height(44.dp).clip(RoundedCornerShape(22.dp)).background(bgc).clickable(enabled = enabled, onClick = onClick).padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = fgc, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(8.dp))
        Text(label, color = fgc, style = MaterialTheme.typography.labelLarge)
    }
}

/**
 * Волнистая полоса перемотки, как в медиаплеере Android 13+: сыгранная часть — волна (бежит, пока играет;
 * на паузе выпрямляется), остаток — тонкая линия, ползунок — вертикальная «таблетка».
 */
@Composable
fun WavySlider(value: Float, playing: Boolean, color: Color, onDrag: (Float) -> Unit, onDone: () -> Unit, modifier: Modifier = Modifier) {
    val amp by animateFloatAsState(if (playing) 1f else 0f, tween(500), label = "amp")
    val phase by rememberInfiniteTransition(label = "wave").animateFloat(0f, (2 * PI).toFloat(), infiniteRepeatable(tween(1600, easing = LinearEasing)), label = "ph")
    var width by remember { mutableFloatStateOf(1f) }
    val d = LocalDensity.current
    Canvas(
        modifier.height(36.dp)
            .pointerInput(Unit) {
                detectTapGestures { o -> onDrag((o.x / size.width).coerceIn(0f, 1f)); onDone() }
            }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragStart = { o -> onDrag((o.x / size.width).coerceIn(0f, 1f)) },
                    onDragEnd = onDone, onDragCancel = onDone,
                    onHorizontalDrag = { ch, _ -> onDrag((ch.position.x / size.width).coerceIn(0f, 1f)) },
                )
            },
    ) {
        width = size.width
        val cy = size.height / 2
        val x = size.width * value
        val stroke = with(d) { 4.dp.toPx() }
        val a = with(d) { 3.5.dp.toPx() } * amp
        val wl = with(d) { 28.dp.toPx() }
        val gap = with(d) { 6.dp.toPx() }
        // остаток — прямая полупрозрачная линия
        if (x + gap < size.width) drawLine(color.copy(alpha = 0.3f), Offset(x + gap, cy), Offset(size.width, cy), stroke, StrokeCap.Round)
        // сыгранное — волна
        val end = (x - gap).coerceAtLeast(0f)
        if (end > 0f) {
            val p = Path()
            var px = 0f
            p.moveTo(0f, cy + a * sin(phase))
            while (px < end) { px = minOf(end, px + 2f); p.lineTo(px, cy + a * sin(px / wl * 2 * PI.toFloat() - phase)) }
            drawPath(p, color, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        // ползунок
        val tw = with(d) { 5.dp.toPx() }; val th = with(d) { 22.dp.toPx() }
        drawRoundRect(color, Offset(x - tw / 2, cy - th / 2), Size(tw, th), CornerRadius(tw / 2))
    }
}

/** Текст песни: переключатель вида сверху, ниже — Apple Music или обычный */
@Composable
private fun LyricsPane(text: String, pos: Double, style: String, accent: Color, onStyle: (String) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("ap" to "Apple Music", "plain" to "Обычный").forEach { (k, l) ->
                val on = style == k
                Text(l, style = MaterialTheme.typography.labelLarge, color = if (on) Color.Black else Color.White.copy(alpha = 0.8f),
                    modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(if (on) accent else Color.White.copy(alpha = 0.12f)).clickable { onStyle(k) }.padding(horizontal = 14.dp, vertical = 7.dp))
            }
        }
        if (style == "plain") PlainLyrics(text, pos, accent) else AppleLyrics(text, pos)
    }
}

/**
 * Как в Apple Music: крупные жирные строки слева, текущая заливается белым по мере пения,
 * остальные приглушены, дальние размыты; текст едет так, чтобы текущая строка была в верхней трети.
 */
@Composable
private fun AppleLyrics(text: String, pos: Double) {
    val (timed, lines) = remember(text) { parseLyrics(text) }
    val state = rememberLazyListState()
    val cur = if (timed) lines.indexOfLast { it.t <= pos + 0.15 } else -1
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val offset = with(LocalDensity.current) { (maxHeight * 0.22f).roundToPx() }
        LaunchedEffect(cur) { if (cur >= 0) state.animateScrollToItem(cur, -offset) }
        LazyColumn(Modifier.fillMaxSize(), state = state, contentPadding = PaddingValues(top = 8.dp, bottom = maxHeight * 0.6f), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            itemsIndexed(lines) { i, l ->
                val on = i == cur
                val dist = if (cur < 0) 0 else abs(i - cur)
                val alpha by animateFloatAsState(if (!timed) 0.92f else if (on) 1f else 0.32f, tween(350), label = "a")
                val blur = if (timed && !on && Build.VERSION.SDK_INT >= 31) minOf(dist, 4).toFloat() * 0.9f else 0f
                // доля строки, которая уже спета: до начала следующей строки
                val next = lines.getOrNull(i + 1)?.t ?: (l.t + 4.0)
                val frac = if (on) ((pos - l.t) / (next - l.t).coerceAtLeast(0.5)).toFloat().coerceIn(0f, 1f) else if (i < cur) 1f else 0f
                val base = TextStyle(fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.5).sp)
                val brush = if (on) Brush.horizontalGradient(0f to Color.White, frac to Color.White, (frac + 0.08f).coerceAtMost(1f) to Color.White.copy(alpha = 0.38f), 1f to Color.White.copy(alpha = 0.38f)) else null
                val scale by animateFloatAsState(if (on) 1f else 0.96f, spring(dampingRatio = 0.8f, stiffness = 200f), label = "s")
                val body = l.text.ifEmpty { "• • •" }
                Text(
                    body, textAlign = TextAlign.Start,
                    style = if (brush != null) base.copy(brush = brush) else base.copy(color = Color.White),
                    modifier = Modifier.fillMaxWidth()
                        .graphicsLayer { this.alpha = alpha; scaleX = scale; scaleY = scale; transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0.5f) }
                        .then(if (blur > 0f) Modifier.blur(blur.dp) else Modifier)
                        .then(if (timed) Modifier.clickable { MusicPlayer.seek((l.t * 1000).toLong()) } else Modifier),
                )
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
                modifier = if (timed && l.t >= 0) Modifier.clickable { MusicPlayer.seek((l.t * 1000).toLong()) } else Modifier)
        }
    }
}

@Composable
private fun QueueList(s: MusicPlayer.State, accent: Color) {
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        itemsIndexed(s.queue) { i, t ->
            val on = i == s.index
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (on) Color.White.copy(alpha = 0.12f) else Color.Transparent)
                    .clickable { MusicPlayer.jump(i) }.padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Cover(t, 48.dp, 10.dp)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(t.title, color = if (on) accent else Color.White, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
                Text(fmtDur(t.duration), color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
