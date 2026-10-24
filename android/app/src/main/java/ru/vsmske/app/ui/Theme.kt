package ru.vsmske.app.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/*
 * Material You (1.1): цвета берутся из обоев телефона (динамический цвет, Android 12+),
 * на старых Android — фиолетовая палитра Material 3 (как у сайта в дизайне Material You).
 * Светлая или тёмная — как в системе. Экраны берут цвета через Vs.* — это просто имена ролей темы.
 */
object Vs {
    val bg: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.surface
    val bg2: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.surfaceContainer
    val fg: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.onSurface
    val muted: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.onSurfaceVariant
    val accent: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.primary
    val p1: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.primary
    val p3: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.tertiary
    val p4: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.secondary
    val pink: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.error
    val danger: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.error
    val ok = Color(0xFF34A853)
    val line: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.outlineVariant
    /** «Градиент» в Material You — тональный контейнер (обложки без картинки, свои сообщения и т. п.) */
    val grad: Brush @Composable @ReadOnlyComposable get() = SolidColor(MaterialTheme.colorScheme.primaryContainer)
    val onGrad: Color @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.onPrimaryContainer
    val gradText: Brush @Composable @ReadOnlyComposable get() = SolidColor(MaterialTheme.colorScheme.onSurface)
}

// Палитра Material 3 по умолчанию (фиолетовая) — для Android 11 и ниже
private val LightM3 = lightColorScheme(
    primary = Color(0xFF65558F), onPrimary = Color.White, primaryContainer = Color(0xFFE9DDFF), onPrimaryContainer = Color(0xFF22005D),
    secondary = Color(0xFF625B71), secondaryContainer = Color(0xFFE8DEF8), onSecondaryContainer = Color(0xFF1D192B),
    tertiary = Color(0xFF7D5260), tertiaryContainer = Color(0xFFFFD8E4), onTertiaryContainer = Color(0xFF31111D),
    surface = Color(0xFFFEF7FF), onSurface = Color(0xFF1D1B20), onSurfaceVariant = Color(0xFF49454F),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF7F2FA), surfaceContainer = Color(0xFFF3EDF7),
    surfaceContainerHigh = Color(0xFFECE6F0), surfaceContainerHighest = Color(0xFFE6E0E9),
    outline = Color(0xFF79747E), outlineVariant = Color(0xFFCAC4D0),
)
private val DarkM3 = darkColorScheme(
    primary = Color(0xFFD0BCFF), onPrimary = Color(0xFF381E72), primaryContainer = Color(0xFF4F378B), onPrimaryContainer = Color(0xFFEADDFF),
    secondary = Color(0xFFCCC2DC), secondaryContainer = Color(0xFF4A4458), onSecondaryContainer = Color(0xFFE8DEF8),
    tertiary = Color(0xFFEFB8C8), tertiaryContainer = Color(0xFF633B48), onTertiaryContainer = Color(0xFFFFD8E4),
    surface = Color(0xFF141218), onSurface = Color(0xFFE6E0E9), onSurfaceVariant = Color(0xFFCAC4D0),
    surfaceContainerLowest = Color(0xFF0F0D13), surfaceContainerLow = Color(0xFF1D1B20), surfaceContainer = Color(0xFF211F26),
    surfaceContainerHigh = Color(0xFF2B2930), surfaceContainerHighest = Color(0xFF36343B),
    outline = Color(0xFF938F99), outlineVariant = Color(0xFF49454F),
)

/** Шрифт системный (как в приложениях Google), заголовки чуть плотнее */
private val typo = Typography().let { t ->
    t.copy(
        headlineMedium = t.headlineMedium.copy(fontWeight = FontWeight.Normal),
        headlineSmall = t.headlineSmall.copy(fontWeight = FontWeight.Normal),
        titleLarge = t.titleLarge.copy(fontWeight = FontWeight.Normal, fontSize = 22.sp),
        titleMedium = t.titleMedium.copy(fontWeight = FontWeight.Medium),
        titleSmall = t.titleSmall.copy(fontWeight = FontWeight.Medium, fontSize = 15.sp),
        bodySmall = t.bodySmall.copy(fontSize = 13.sp),
    )
}

@Composable
fun vsColors(dark: Boolean = isSystemInDarkTheme()): ColorScheme {
    val ctx = LocalContext.current
    return when {
        Build.VERSION.SDK_INT >= 31 -> if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        dark -> DarkM3
        else -> LightM3
    }
}

@Composable
fun VsTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = vsColors(), typography = typo, content = content)
}
