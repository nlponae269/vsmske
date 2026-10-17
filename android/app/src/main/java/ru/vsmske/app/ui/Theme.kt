package ru.vsmske.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import ru.vsmske.app.R

/* «Фиолетовое стекло» — те же цвета, что в glass.css на сайте (тёмная тема) */
object Vs {
    val bg = Color(0xFF0B0614)
    val bg2 = Color(0xFF160A2B)
    val fg = Color(0xFFF3EEFF)
    val muted = Color(0xFFA99BC9)
    val accent = Color(0xFFA78BFA)
    val p1 = Color(0xFF7C3AED)
    val p3 = Color(0xFFC026D3)
    val p4 = Color(0xFF4F46E5)
    val pink = Color(0xFFEC4899)
    val danger = Color(0xFFF87171)
    val ok = Color(0xFF34D399)
    val glass = Color(0x1AFFFFFF)       // заливка карточек
    val glassHi = Color(0x26FFFFFF)
    val line = Color(0x24C4B5FD)
    val rim = Color(0x61FFFFFF)
    val grad = Brush.linearGradient(listOf(p4, p1, p3))
    val gradText = Brush.linearGradient(listOf(Color(0xFFC4B5FD), Color(0xFFF0ABFC)))
}

val Onest = FontFamily(
    Font(R.font.onest_400, FontWeight.Normal), Font(R.font.onest_500, FontWeight.Medium),
    Font(R.font.onest_600, FontWeight.SemiBold), Font(R.font.onest_700, FontWeight.Bold),
)
val Unbounded = FontFamily(Font(R.font.unbounded_600, FontWeight.SemiBold), Font(R.font.unbounded_700, FontWeight.Bold))

private val base = TextStyle(fontFamily = Onest, color = Vs.fg)
private val typo = Typography(
    bodyLarge = base.copy(fontSize = 16.sp, lineHeight = 22.sp),
    bodyMedium = base.copy(fontSize = 15.sp, lineHeight = 21.sp),
    bodySmall = base.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Vs.muted),
    labelLarge = base.copy(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = base.copy(fontSize = 13.sp, fontWeight = FontWeight.Medium),
    labelSmall = base.copy(fontSize = 11.sp, fontWeight = FontWeight.Medium),
    titleLarge = TextStyle(fontFamily = Unbounded, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, color = Vs.fg, letterSpacing = (-0.3).sp),
    titleMedium = base.copy(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = base.copy(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
    headlineSmall = TextStyle(fontFamily = Unbounded, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, color = Vs.fg),
)

@Composable
fun VsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Vs.accent, onPrimary = Color(0xFF12081F), secondary = Vs.p3, background = Vs.bg, surface = Vs.bg2,
            onBackground = Vs.fg, onSurface = Vs.fg, onSurfaceVariant = Vs.muted, outline = Vs.line, error = Vs.danger,
            surfaceVariant = Color(0x33FFFFFF), surfaceContainerHigh = Color(0xFF1E1236), surfaceContainer = Color(0xFF1A0E30),
        ),
        typography = typo,
        content = content,
    )
}
