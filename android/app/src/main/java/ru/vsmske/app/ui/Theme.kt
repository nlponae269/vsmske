package ru.vsmske.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.vsmske.app.R

/*
 * Дизайн 3.0 — Material You «на максимум»: цвета из обоев телефона (Android 12+), крупные скругления,
 * шрифт Onest (русский, современный), логотип — Unbounded. Светлая/тёмная — как в системе.
 */
val Onest = FontFamily(
    Font(R.font.onest_400, FontWeight.Normal), Font(R.font.onest_500, FontWeight.Medium),
    Font(R.font.onest_600, FontWeight.SemiBold), Font(R.font.onest_700, FontWeight.Bold),
)
val Unbounded = FontFamily(Font(R.font.unbounded_700, FontWeight.Bold))

private fun t(size: Int, line: Int, w: FontWeight, ls: Double = 0.0) =
    TextStyle(fontFamily = Onest, fontSize = size.sp, lineHeight = line.sp, fontWeight = w, letterSpacing = ls.sp)

val VsType = Typography(
    displayLarge = t(54, 60, FontWeight.Bold, -1.2), displayMedium = t(44, 50, FontWeight.Bold, -1.0), displaySmall = t(36, 42, FontWeight.Bold, -0.8),
    headlineLarge = t(32, 38, FontWeight.Bold, -0.6), headlineMedium = t(28, 34, FontWeight.Bold, -0.5), headlineSmall = t(24, 30, FontWeight.SemiBold, -0.3),
    titleLarge = t(21, 27, FontWeight.SemiBold, -0.2), titleMedium = t(17, 23, FontWeight.SemiBold), titleSmall = t(15, 20, FontWeight.SemiBold),
    bodyLarge = t(16, 23, FontWeight.Normal), bodyMedium = t(15, 21, FontWeight.Normal), bodySmall = t(13, 18, FontWeight.Normal),
    labelLarge = t(15, 20, FontWeight.Medium), labelMedium = t(13, 17, FontWeight.Medium), labelSmall = t(11, 15, FontWeight.Medium, 0.2),
)

val VsShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp), small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(28.dp), extraLarge = RoundedCornerShape(36.dp),
)

private val Light = lightColorScheme(
    primary = Color(0xFF65558F), onPrimary = Color.White, primaryContainer = Color(0xFFE9DDFF), onPrimaryContainer = Color(0xFF22005D),
    secondary = Color(0xFF625B71), secondaryContainer = Color(0xFFE8DEF8), onSecondaryContainer = Color(0xFF1D192B),
    tertiary = Color(0xFF7D5260), tertiaryContainer = Color(0xFFFFD8E4), onTertiaryContainer = Color(0xFF31111D),
    surface = Color(0xFFFEF7FF), onSurface = Color(0xFF1D1B20), onSurfaceVariant = Color(0xFF49454F),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF7F2FA), surfaceContainer = Color(0xFFF3EDF7),
    surfaceContainerHigh = Color(0xFFECE6F0), surfaceContainerHighest = Color(0xFFE6E0E9),
    outline = Color(0xFF79747E), outlineVariant = Color(0xFFCAC4D0),
)
private val Dark = darkColorScheme(
    primary = Color(0xFFD0BCFF), onPrimary = Color(0xFF381E72), primaryContainer = Color(0xFF4F378B), onPrimaryContainer = Color(0xFFEADDFF),
    secondary = Color(0xFFCCC2DC), secondaryContainer = Color(0xFF4A4458), onSecondaryContainer = Color(0xFFE8DEF8),
    tertiary = Color(0xFFEFB8C8), tertiaryContainer = Color(0xFF633B48), onTertiaryContainer = Color(0xFFFFD8E4),
    surface = Color(0xFF141218), onSurface = Color(0xFFE6E0E9), onSurfaceVariant = Color(0xFFCAC4D0),
    surfaceContainerLowest = Color(0xFF0F0D13), surfaceContainerLow = Color(0xFF1D1B20), surfaceContainer = Color(0xFF211F26),
    surfaceContainerHigh = Color(0xFF2B2930), surfaceContainerHighest = Color(0xFF36343B),
    outline = Color(0xFF938F99), outlineVariant = Color(0xFF49454F),
)

/** Тема приложения: как в системе | светлая | тёмная (SharedPreferences «vs» → «theme») */
object ThemePref {
    val mode = kotlinx.coroutines.flow.MutableStateFlow("system")
    fun load(ctx: android.content.Context) { mode.value = ctx.getSharedPreferences("vs", android.content.Context.MODE_PRIVATE).getString("theme", "system") ?: "system" }
    fun set(ctx: android.content.Context, m: String) { mode.value = m; ctx.getSharedPreferences("vs", android.content.Context.MODE_PRIVATE).edit().putString("theme", m).apply() }
}

@Composable
fun VsTheme(content: @Composable () -> Unit) {
    val ctx = LocalContext.current
    val mode by ThemePref.mode.collectAsState()
    val sysDark = isSystemInDarkTheme()
    val dark = when (mode) { "light" -> false; "dark" -> true; else -> sysDark }
    // значки строки состояния и навигации — под тему (иначе при «светлой» на тёмной системе их не видно)
    val view = androidx.compose.ui.platform.LocalView.current
    if (!view.isInEditMode) androidx.compose.runtime.SideEffect {
        val w = (view.context as? android.app.Activity)?.window ?: return@SideEffect
        androidx.core.view.WindowCompat.getInsetsController(w, view).apply { isAppearanceLightStatusBars = !dark; isAppearanceLightNavigationBars = !dark }
    }
    val colors = when {
        Build.VERSION.SDK_INT >= 31 -> if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        dark -> Dark
        else -> Light
    }
    MaterialTheme(colorScheme = colors, typography = VsType, shapes = VsShapes, content = content)
}
