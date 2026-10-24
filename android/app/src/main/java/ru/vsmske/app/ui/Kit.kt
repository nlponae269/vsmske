package ru.vsmske.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
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

/** Картинка из базы: dataURL (декодируем сами, с кэшем) или фото Google по https */
@Composable
fun DbImage(src: String, modifier: Modifier = Modifier, scale: ContentScale = ContentScale.Crop) {
    val s = Images.safe(src)
    if (s.startsWith("https://")) { AsyncImage(model = s, contentDescription = null, modifier = modifier, contentScale = scale); return }
    var bmp by remember(s) { mutableStateOf<ImageBitmap?>(Images.cached(s)) }
    LaunchedEffect(s) { if (bmp == null && s.isNotEmpty()) bmp = Images.decode(s) }
    val b = bmp
    if (b != null) Image(b, null, modifier, contentScale = scale)
    else Box(modifier.background(MaterialTheme.colorScheme.surfaceContainerHighest))
}

fun parseColor(c: String, fallback: Color = Color(0xFF8E95AB)): Color =
    if (Regex("^#[0-9a-fA-F]{6}$").matches(c)) Color(android.graphics.Color.parseColor(c)) else fallback

/** Аватарка: фото, буквы на цвете профиля или «призрак» у Deleted Account */
@Composable
fun Avatar(u: User?, size: Dp = 40.dp, modifier: Modifier = Modifier, showOnline: Boolean = true, onClick: (() -> Unit)? = null) {
    Box(modifier.size(size)) {
        Box(
            Modifier.fillMaxSize().clip(CircleShape).background(if (u?.banned == true) Color(0xFF8E8A96) else parseColor(u?.color ?: ""))
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            val ph = Images.safe(u?.photo)
            when {
                u?.banned == true -> Text("👻", fontSize = (size.value * 0.45f).sp)
                ph.isNotEmpty() -> DbImage(ph, Modifier.fillMaxSize())
                else -> Text(initials(u?.name ?: ""), color = Color.White, fontWeight = FontWeight.Medium, fontSize = (size.value * 0.38f).sp)
            }
        }
        if (showOnline && u?.online == true && !u.banned) Box(
            Modifier.align(Alignment.BottomEnd).size(size * 0.28f).clip(CircleShape).background(Color(0xFF34A853))
                .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape),
        )
    }
}

@Composable
fun UserName(u: User?, style: TextStyle = MaterialTheme.typography.titleSmall, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(u?.name ?: "…", style = style, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
            color = if (u?.banned == true) MaterialTheme.colorScheme.onSurfaceVariant else Color.Unspecified)
        if (u?.emoji?.isNotEmpty() == true && !u.banned) Text(" " + u.emoji, style = style)
        if (u?.admin == true) Icon(Icons.Rounded.Verified, "Администратор", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 4.dp).size(16.dp))
    }
}

@Composable
fun Loading(modifier: Modifier = Modifier) =
    Box(modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

@Composable
fun EmptyState(title: String, hint: String = "", modifier: Modifier = Modifier) =
    Column(modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (hint.isNotEmpty()) Text(hint, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }

/** Запустить и показать понятную ошибку, если что-то пошло не так */
fun CoroutineScope.safe(toast: (String) -> Unit, block: suspend () -> Unit) = launch {
    try { block() } catch (e: Exception) { toast(errText(e)) }
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
