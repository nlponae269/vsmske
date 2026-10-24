package ru.vsmske.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.graphics.shapes.CornerRounding
import androidx.graphics.shapes.Morph
import androidx.graphics.shapes.RoundedPolygon
import androidx.graphics.shapes.star
import androidx.graphics.shapes.toPath

/* Фигуры Material 3 Expressive: «печенька» для аватарки профиля и живой индикатор загрузки (фигуры перетекают друг в друга). */

private fun RoundedPolygon.unit(): RoundedPolygon {   // в квадрат 0..1
    val b = calculateBounds(); val w = b[2] - b[0]; val h = b[3] - b[1]; val s = maxOf(w, h)
    return transformed { x, y -> androidx.graphics.shapes.TransformResult((x - b[0]) / s + (s - w) / s / 2, (y - b[1]) / s + (s - h) / s / 2) }
}

val Cookie9: RoundedPolygon = RoundedPolygon.star(9, innerRadius = 0.8f, rounding = CornerRounding(0.5f), innerRounding = CornerRounding(0.5f)).unit()
val Cookie12: RoundedPolygon = RoundedPolygon.star(12, innerRadius = 0.86f, rounding = CornerRounding(0.4f), innerRounding = CornerRounding(0.4f)).unit()
private val Flower = RoundedPolygon.star(8, innerRadius = 0.7f, rounding = CornerRounding(0.35f), innerRounding = CornerRounding(0.35f)).unit()
private val Pill6 = RoundedPolygon(6, rounding = CornerRounding(0.45f)).unit()
private val Blob = RoundedPolygon.star(4, innerRadius = 0.62f, rounding = CornerRounding(0.6f), innerRounding = CornerRounding(0.6f)).unit()

/** Форма из многоугольника graphics-shapes (для clip/background) */
class PolyShape(private val poly: RoundedPolygon) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val p = poly.toPath().asComposePath()
        p.transform(Matrix().apply { scale(size.width, size.height) })
        return Outline.Generic(p)
    }
}

val CookieShape = PolyShape(Cookie9)
val Cookie12Shape = PolyShape(Cookie12)

/** Индикатор загрузки Material 3 Expressive: фигура вращается и перетекает в следующую */
@Composable
fun ExpressiveLoader(size: Dp = 48.dp, color: Color = MaterialTheme.colorScheme.primary, modifier: Modifier = Modifier) {
    val shapes = remember { listOf(Cookie9, Flower, Pill6, Blob, Cookie12) }
    val morphs = remember { shapes.indices.map { Morph(shapes[it], shapes[(it + 1) % shapes.size]) } }
    val tr = rememberInfiniteTransition(label = "loader")
    val t by tr.animateFloat(0f, shapes.size.toFloat(), infiniteRepeatable(tween(shapes.size * 650, easing = LinearEasing)), label = "t")
    val rot by tr.animateFloat(0f, 360f, infiniteRepeatable(tween(2400, easing = LinearEasing), RepeatMode.Restart), label = "r")
    Canvas(modifier.size(size)) {
        val i = t.toInt() % shapes.size
        val f = t - t.toInt()
        val e = if (f < 0.5f) 4 * f * f * f else 1 - Math.pow((-2.0 * f + 2), 3.0).toFloat() / 2   // плавно в середине
        val p: Path = morphs[i].toPath(e).asComposePath()
        p.transform(Matrix().apply { scale(this@Canvas.size.width, this@Canvas.size.height) })
        rotate(rot) { drawPath(p, color) }
    }
}
