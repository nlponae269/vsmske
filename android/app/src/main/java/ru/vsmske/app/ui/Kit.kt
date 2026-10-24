package ru.vsmske.app.ui

import androidx.compose.ui.graphics.luminance

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.User
import ru.vsmske.app.data.initials

val LocalNav = staticCompositionLocalOf<NavHostController> { error("нет навигации") }
val LocalToast = staticCompositionLocalOf<(String) -> Unit> { {} }

/** Картинка из базы: dataURL (декодируем сами, с кэшем) или фото Google/YouTube по https */
@Composable
fun DbImage(src: String, modifier: Modifier = Modifier, scale: ContentScale = ContentScale.Crop) {
    if (src.startsWith("https://")) { AsyncImage(model = src, contentDescription = null, modifier = modifier, contentScale = scale); return }
    val s = Images.safe(src)
    var bmp by remember(s) { mutableStateOf<ImageBitmap?>(Images.cached(s)) }
    LaunchedEffect(s) { if (bmp == null && s.isNotEmpty()) bmp = Images.decode(s) }
    val b = bmp
    if (b != null) Image(b, null, modifier, contentScale = scale)
    else Box(modifier.shimmer())
}

fun parseColor(c: String, fallback: Color = Color(0xFF8E95AB)): Color =
    if (Regex("^#[0-9a-fA-F]{6}$").matches(c)) Color(android.graphics.Color.parseColor(c)) else fallback

/** Аватарка: фото, буквы на цвете профиля или «призрак» у Deleted Account. shape — круг или «печенька» */
@Composable
fun Avatar(u: User?, size: Dp = 40.dp, modifier: Modifier = Modifier, shape: Shape = CircleShape, showOnline: Boolean = true, onClick: (() -> Unit)? = null) {
    Box(modifier.size(size)) {
        val base = if (u?.banned == true) Color(0xFF8E8A96) else parseColor(u?.color ?: "")
        Box(
            Modifier.fillMaxSize().clip(shape)
                .background(Brush.linearGradient(listOf(base, base.copy(red = (base.red * 0.75f), green = base.green * 0.75f, blue = (base.blue * 0.9f).coerceAtMost(1f)))))
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            val ph = Images.safe(u?.photo)
            when {
                u?.banned == true -> Text("👻", fontSize = (size.value * 0.46f).sp)
                ph.isNotEmpty() -> DbImage(ph, Modifier.fillMaxSize())
                else -> Text(initials(u?.name ?: ""), color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.38f).sp, fontFamily = Onest)
            }
        }
        if (showOnline && u?.online == true && !u.banned) Box(
            Modifier.align(Alignment.BottomEnd).size((size * 0.27f).coerceAtLeast(10.dp)).clip(CircleShape).background(Color(0xFF34C759))
                .border(2.5.dp, MaterialTheme.colorScheme.surface, CircleShape),
        )
    }
}

@Composable
fun UserName(u: User?, style: TextStyle = MaterialTheme.typography.titleSmall, modifier: Modifier = Modifier, color: Color = Color.Unspecified) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(u?.name ?: "…", style = style, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
            color = if (u?.banned == true) MaterialTheme.colorScheme.onSurfaceVariant else color)
        if (u?.emoji?.isNotEmpty() == true && !u.banned) Text(" " + u.emoji, style = style)
        if (u?.admin == true) Icon(Icons.Rounded.Verified, "Администратор", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 4.dp).size(16.dp))
    }
}

/** Переливающаяся заглушка, пока грузится */
fun Modifier.shimmer(): Modifier = composed {
    val base = MaterialTheme.colorScheme.surfaceContainerHighest
    val hi = MaterialTheme.colorScheme.surfaceContainerLow
    val x by rememberInfiniteTransition(label = "sh").animateFloat(-1f, 2f, infiniteRepeatable(tween(1300, easing = LinearEasing)), label = "x")
    background(Brush.linearGradient(listOf(base, hi, base), start = Offset(x * 600f, 0f), end = Offset(x * 600f + 600f, 300f)))
}

@Composable
fun SkeletonPost(modifier: Modifier = Modifier) = Column(modifier.fillMaxWidth().padding(horizontal = 12.dp).clip(MaterialTheme.shapes.large).background(MaterialTheme.colorScheme.surfaceContainerLow).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(44.dp).clip(CircleShape).shimmer())
        Column(Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.width(140.dp).height(14.dp).clip(CircleShape).shimmer()); Box(Modifier.width(80.dp).height(10.dp).clip(CircleShape).shimmer())
        }
    }
    Box(Modifier.fillMaxWidth().height(14.dp).clip(CircleShape).shimmer()); Box(Modifier.fillMaxWidth(0.7f).height(14.dp).clip(CircleShape).shimmer())
    Box(Modifier.fillMaxWidth().height(180.dp).clip(MaterialTheme.shapes.medium).shimmer())
}

@Composable
fun SkeletonRow() = Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.size(52.dp).clip(MaterialTheme.shapes.small).shimmer())
    Column(Modifier.padding(start = 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.width(170.dp).height(14.dp).clip(CircleShape).shimmer()); Box(Modifier.width(110.dp).height(11.dp).clip(CircleShape).shimmer())
    }
}

@Composable
fun Loading(modifier: Modifier = Modifier) = Box(modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) { ExpressiveLoader() }

/** Пустой экран: большой значок в «печеньке», заголовок и подсказка */
@Composable
fun EmptyState(title: String, hint: String = "", emoji: String = "✨", modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) =
    Column(modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(96.dp).clip(CookieShape).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) { Text(emoji, fontSize = 42.sp) }
        Spacer(Modifier.height(4.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        if (hint.isNotEmpty()) Text(hint, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        action?.invoke()
    }

/** Заголовок раздела со стрелкой «все» */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, more: String? = null, onMore: (() -> Unit)? = null) =
    Row(modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 18.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
        if (onMore != null) Row(Modifier.clip(CircleShape).clickable(onClick = onMore).padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (more != null) Text(more, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.primary)
        }
    }

/** Плитка раздела (меню профиля, сервисы) */
@Composable
fun Tile(icon: ImageVector, title: String, sub: String = "", tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit) =
    Surface(onClick = onClick, modifier = modifier, shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(tint.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = tint) }
            Column {
                Text(title, style = MaterialTheme.typography.titleSmall, maxLines = 1)
                if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }

/** Маленькая таблетка-плашка (LIVE, длительность, счётчики) */
@Composable
fun Chip(text: String, bg: Color, fg: Color, modifier: Modifier = Modifier, leading: (@Composable () -> Unit)? = null) =
    Row(modifier.clip(CircleShape).background(bg).padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        leading?.invoke()
        Text(text, color = fg, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold))
    }

@Composable
fun Locked(text: String, modifier: Modifier = Modifier) =
    Box(modifier.background(MaterialTheme.colorScheme.surfaceContainerHighest), contentAlignment = Alignment.Center) {
        Text("🔒 $text", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }

/** Запустить и показать понятную ошибку, если что-то пошло не так */
fun CoroutineScope.safe(toast: (String) -> Unit, block: suspend () -> Unit) = launch {
    try { block() } catch (e: Exception) { if (e !is kotlinx.coroutines.CancellationException) toast(errText(e)) }
}

fun errText(e: Throwable): String {
    val m = e.message ?: ""
    return when {
        "PERMISSION_DENIED" in m || "permission" in m.lowercase() -> "Нет доступа — возможно, ограничения приватности"
        "UNAVAILABLE" in m || "network" in m.lowercase() -> "Нет связи с сервером. Проверьте интернет"
        "INVALID_LOGIN_CREDENTIALS" in m || "password is invalid" in m || "credential" in m.lowercase() -> "Неверная почта или пароль"
        "no user record" in m -> "Такого аккаунта нет"
        "email address is already" in m -> "Эта почта уже зарегистрирована"
        "badly formatted" in m -> "Проверьте адрес почты"
        "at least 6" in m || "WEAK_PASSWORD" in m -> "Пароль — минимум 6 символов"
        m.isNotEmpty() && m.length < 140 && m.any { it in 'а'..'я' } -> m
        else -> "Что-то пошло не так. Попробуйте ещё раз"
    }
}

fun fmtNum(n: Int): String = when { n >= 1_000_000 -> "%.1f млн".format(n / 1e6).replace(".0", ""); n >= 1000 -> "%.1f тыс".format(n / 1e3).replace(".0", ""); else -> "$n" }
fun fmtSize(b: Long): String = when { b >= 1_048_576 -> "%.1f МБ".format(b / 1_048_576.0); b >= 1024 -> "${b / 1024} КБ"; else -> "$b Б" }

/** На тёмных экранах (плеер, клипы, эфир, видео, звонок) значки строки состояния — светлые; при уходе — как было */
@Composable
fun DarkSystemBars() {
    val view = androidx.compose.ui.platform.LocalView.current
    val lightBars = MaterialTheme.colorScheme.surface.luminance() > 0.5f
    androidx.compose.runtime.DisposableEffect(lightBars) {
        val w = (view.context as? android.app.Activity)?.window
        val c = w?.let { androidx.core.view.WindowCompat.getInsetsController(it, view) }
        c?.isAppearanceLightStatusBars = false; c?.isAppearanceLightNavigationBars = false
        onDispose { c?.isAppearanceLightStatusBars = lightBars; c?.isAppearanceLightNavigationBars = lightBars }
    }
}
