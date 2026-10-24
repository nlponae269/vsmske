package ru.vsmske.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import ru.vsmske.app.data.Images
import ru.vsmske.app.data.User
import ru.vsmske.app.data.initials

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

/** Аватарка — круг, как в Material You */
@Composable
fun Avatar(u: User?, size: Dp = 44.dp, online: Boolean = false, onClick: (() -> Unit)? = null) {
    Box(Modifier.size(size)) {
        Box(
            Modifier.fillMaxSize().clip(CircleShape).background(parseColor(u?.color ?: ""))
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
            contentAlignment = Alignment.Center,
        ) {
            val ph = Images.safe(u?.photo)
            if (ph.isNotEmpty()) DbImage(ph, Modifier.fillMaxSize())
            else Text(initials(u?.name ?: ""), color = Color.White, fontWeight = FontWeight.Medium, fontSize = (size.value * 0.38f).sp)
        }
        if (online) Box(
            Modifier.align(Alignment.BottomEnd).size(size * 0.28f).clip(CircleShape).background(Vs.ok)
                .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape),
        )
    }
}

@Composable
fun UserName(u: User?, style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.titleSmall, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Text(u?.name ?: "…", style = style, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        if (u?.emoji?.isNotEmpty() == true) Text(" " + u.emoji, style = style)
        if (u?.admin == true) Text(" ✓", style = style.copy(color = Vs.accent))
    }
}

/** Главная кнопка — заполненная кнопка Material 3 */
@Composable
fun GradButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, busy: Boolean = false, icon: ImageVector? = null, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled && !busy, modifier = modifier.heightIn(min = 44.dp), contentPadding = PaddingValues(horizontal = 22.dp, vertical = 10.dp)) {
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = LocalContentColor.current, strokeWidth = 2.dp)
        else {
            if (icon != null) { Icon(icon, null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)) }
            Text(text, style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center)
        }
    }
}

/** Вторичная кнопка — тональная кнопка Material 3 */
@Composable
fun GlassButton(text: String, modifier: Modifier = Modifier, icon: ImageVector? = null, color: Color = Color.Unspecified, onClick: () -> Unit) {
    FilledTonalButton(onClick = onClick, modifier = modifier.heightIn(min = 40.dp), contentPadding = PaddingValues(horizontal = if (text.isEmpty()) 12.dp else 18.dp, vertical = 8.dp)) {
        val tint = if (color == Color.Unspecified) LocalContentColor.current else color
        if (icon != null) { Icon(icon, null, tint = tint, modifier = Modifier.size(18.dp)); if (text.isNotEmpty()) Spacer(Modifier.width(8.dp)) }
        if (text.isNotEmpty()) Text(text, color = tint, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun IconBtn(icon: ImageVector, desc: String, modifier: Modifier = Modifier, tint: Color = Color.Unspecified, size: Dp = 40.dp, onClick: () -> Unit) {
    Box(modifier.size(size).clip(CircleShape).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, desc, tint = if (tint == Color.Unspecified) MaterialTheme.colorScheme.onSurfaceVariant else tint, modifier = Modifier.size(size * 0.6f))
    }
}

@Composable
fun Field(
    value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier,
    singleLine: Boolean = true, keyboard: KeyboardOptions = KeyboardOptions.Default, password: Boolean = false, minLines: Int = 1,
) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) }, modifier = modifier.fillMaxWidth(),
        singleLine = singleLine, minLines = minLines, keyboardOptions = keyboard, shape = RoundedCornerShape(12.dp),
        visualTransformation = if (password) androidx.compose.ui.text.input.PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
    )
}

@Composable
fun Card(modifier: Modifier = Modifier, padding: PaddingValues = PaddingValues(16.dp), content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().glassCard().padding(padding)) { content() }
}

@Composable
fun Center(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) =
    Box(modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center, content = content)

@Composable
fun Loading(modifier: Modifier = Modifier) = Center(modifier) { CircularProgressIndicator() }

@Composable
fun Empty(title: String, hint: String = "") = Center {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (hint.isNotEmpty()) Text(hint, style = MaterialTheme.typography.bodySmall, color = Vs.muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
fun ScreenTitle(text: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
        trailing()
    }
}

/** Переключатель вкладок — сегментированные кнопки Material 3 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Tabs(items: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    SingleChoiceSegmentedButtonRow(modifier.fillMaxWidth()) {
        items.forEachIndexed { i, (k, label) ->
            SegmentedButton(
                selected = k == selected, onClick = { onSelect(k) },
                shape = SegmentedButtonDefaults.itemShape(index = i, count = items.size),
            ) { Text(label, maxLines = 1) }
        }
    }
}

@Composable
fun Badge(n: Int, modifier: Modifier = Modifier) {
    if (n <= 0) return
    androidx.compose.material3.Badge(modifier) { Text(if (n > 99) "99+" else n.toString()) }
}
