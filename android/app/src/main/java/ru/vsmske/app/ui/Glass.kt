package ru.vsmske.app.ui

import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.min

/*
 * Liquid glass, как на сайте (5.2) и в iOS: шапка, док и мини-плеер преломляют то, что под ними.
 * Всё содержимое экрана записывается в GraphicsLayer (glassSource), а стеклянная панель рисует этот слой
 * со сдвигом под себя и пропускает через шейдер: у кромки фон «затягивается» внутрь, центр чуть увеличен,
 * каналы цвета смещены по-разному — радужный развод по краю.
 * Android 13+ — шейдер (AGSL), Android 12 — просто размытое стекло, ниже — полупрозрачная панель.
 */

private const val LENS = """
uniform shader content;
uniform float2 size;
uniform float radius;
uniform float bend;
uniform float band;
half4 main(float2 p) {
    float2 c = size * 0.5;
    float2 q = abs(p - c) - (c - radius);
    float2 o = max(q, 0.0);
    float outside = length(o);
    float sd = outside + min(max(q.x, q.y), 0.0) - radius;
    float2 n;
    if (q.x > 0.0 && q.y > 0.0) { n = o / max(outside, 0.001); }
    else if (q.x > q.y) { n = float2(1.0, 0.0); } else { n = float2(0.0, 1.0); }
    n *= float2(p.x >= c.x ? 1.0 : -1.0, p.y >= c.y ? 1.0 : -1.0);
    float e = clamp(1.0 - max(0.0, -sd) / band, 0.0, 1.0);
    float2 off = -n * (e * e * bend) + (c - p) * 0.025;
    half4 r = content.eval(p + off * 1.12);
    half4 g = content.eval(p + off);
    half4 b = content.eval(p + off * 0.88);
    return half4(r.r, g.g, b.b, g.a);
}
"""

class Backdrop(val layer: GraphicsLayer) {
    var origin by mutableStateOf(Offset.Zero)
}

@Composable
fun rememberBackdrop(): Backdrop {
    val layer = rememberGraphicsLayer()
    return remember { Backdrop(layer) }
}

/** То, что окажется «под стеклом»: рисуется как обычно и заодно записывается в слой */
fun Modifier.glassSource(b: Backdrop): Modifier = this
    .onGloballyPositioned { b.origin = it.positionInRoot() }
    .drawWithContent {
        b.layer.record { this@drawWithContent.drawContent() }
        drawLayer(b.layer)
    }

@RequiresApi(33)
private fun lensEffect(w: Float, h: Float, radius: Float, density: Float): RenderEffect {
    val sh = RuntimeShader(LENS)
    sh.setFloatUniform("size", w, h)
    sh.setFloatUniform("radius", radius)
    sh.setFloatUniform("bend", min(h, 60f * density) * 0.3f)
    sh.setFloatUniform("band", min(h * 0.35f, 18f * density))
    val sat = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(1.5f) })
    val blur = RenderEffect.createBlurEffect(0.8f * density, 0.8f * density, Shader.TileMode.CLAMP)
    val lens = RenderEffect.createRuntimeShaderEffect(sh, "content")
    return RenderEffect.createColorFilterEffect(sat, RenderEffect.createChainEffect(blur, lens))
}

val glassSupported get() = Build.VERSION.SDK_INT >= 33

/**
 * Стеклянная панель. backdrop — слой экрана под ней; без него (или на старом Android) — матовая заливка.
 */
@Composable
fun GlassPanel(
    backdrop: Backdrop?,
    modifier: Modifier = Modifier,
    radius: Dp = 28.dp,
    tint: Color = Color(0x2E140A26),
    content: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(radius)
    val density = LocalDensity.current.density
    var pos by remember { mutableStateOf(Offset.Zero) }
    Box(
        modifier
            .shadow(24.dp, shape, ambientColor = Color(0x664C1D95), spotColor = Color(0x99000000))
            .clip(shape)
            .onGloballyPositioned { pos = it.positionInRoot() },
    ) {
        if (backdrop != null && Build.VERSION.SDK_INT >= 31) {
            Box(
                Modifier
                    .matchParentSize()
                    .graphicsLayer {
                        val w = size.width; val h = size.height
                        if (w > 0f && h > 0f) {
                            renderEffect = if (Build.VERSION.SDK_INT >= 33) lensEffect(w, h, min(radius.toPx(), h / 2), density).asComposeRenderEffect()
                            else RenderEffect.createBlurEffect(22 * density, 22 * density, Shader.TileMode.CLAMP).asComposeRenderEffect()
                        }
                        clip = true; this.shape = shape
                    }
                    .drawBehind {
                        val o = pos - backdrop.origin
                        translate(-o.x, -o.y) { drawLayer(backdrop.layer) }
                    },
            )
            Box(Modifier.matchParentSize().background(tint))
        } else {
            Box(Modifier.matchParentSize().background(Color(0xD91A0E30)))
        }
        // мягкий отсвет сверху и блик по кромке, как у стекла iOS
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color(0x1FFFFFFF), 0.5f to Color.Transparent)))
        Box(
            Modifier.matchParentSize().border(
                1.3.dp,
                Brush.linearGradient(
                    0f to Color(0xD9FFFFFF), 0.22f to Color(0x33FFFFFF), 0.45f to Color.Transparent,
                    0.7f to Color.Transparent, 1f to Color(0x8CFFFFFF),
                ),
                shape,
            ),
        )
        content()
    }
}

/** Карточка — матовое стекло (сама внутри слоя, поэтому без преломления) */
fun Modifier.glassCard(radius: Dp = 24.dp): Modifier {
    val shape = RoundedCornerShape(radius)
    return this
        .clip(shape)
        .background(Brush.verticalGradient(listOf(Color(0x21FFFFFF), Color(0x0FFFFFFF))))
        .border(1.dp, Brush.linearGradient(0f to Color(0x59FFFFFF), 0.3f to Color(0x14FFFFFF), 0.7f to Color(0x0AFFFFFF), 1f to Color(0x33FFFFFF)), shape)
}

/** Фон: глубокий фиолетовый и медленно кружащиеся размытые шарики (как .orbs на сайте) */
@Composable
fun Orbs(modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "orbs")
    val a by t.animateFloat(0f, 1f, infiniteRepeatable(tween(26000, easing = LinearEasing), RepeatMode.Reverse), label = "a")
    val b by t.animateFloat(0f, 1f, infiniteRepeatable(tween(33000, easing = LinearEasing), RepeatMode.Reverse), label = "b")
    Canvas(modifier.fillMaxSize()) {
        drawRect(Brush.radialGradient(listOf(Vs.bg2, Vs.bg), center = Offset(size.width / 2, -size.height * 0.1f), radius = size.height))
        val w = size.width; val h = size.height
        fun orb(x: Float, y: Float, r: Float, c: Color) =
            drawCircle(Brush.radialGradient(listOf(c.copy(alpha = 0.55f), c.copy(alpha = 0.18f), Color.Transparent), Offset(x, y), r), r, Offset(x, y))
        orb(w * (0.1f + 0.5f * a), h * (0.12f + 0.2f * b), w * 0.75f, Color(0xFF6D28D9))
        orb(w * (0.95f - 0.4f * b), h * (0.35f + 0.25f * a), w * 0.65f, Color(0xFF9D174D))
        orb(w * (0.2f + 0.3f * b), h * (0.75f - 0.2f * a), w * 0.7f, Color(0xFF3730A3))
        orb(w * (0.8f - 0.3f * a), h * (0.9f - 0.15f * b), w * 0.55f, Color(0xFF7E22CE))
        orb(w * (0.5f + 0.35f * (a - b)), h * (0.5f + 0.1f * a), w * 0.45f, Color(0xFF0E7490))
    }
}
