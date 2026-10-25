package ru.vsmske.app.ui

import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.NICK_RE

@Composable
fun Logo(big: Boolean = false) {
    val s = if (big) 72.dp else 40.dp
    Box(Modifier.size(s).clip(RoundedCornerShape(if (big) 24.dp else 13.dp)).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
        Text("вс", style = (if (big) MaterialTheme.typography.headlineMedium else MaterialTheme.typography.titleMedium).copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.onPrimary)
    }
}

@Composable
private fun AuthFrame(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = 460.dp).fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.height(24.dp))
            Logo(big = true)
            content()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthScreen() {
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf(0) }
    var email by rememberSaveable { mutableStateOf("") }
    var pass by rememberSaveable { mutableStateOf("") }
    var busy by rememberSaveable { mutableStateOf(false) }
    var err by rememberSaveable { mutableStateOf("") }
    var info by rememberSaveable { mutableStateOf("") }
    fun run(block: suspend () -> Unit) { err = ""; info = ""; busy = true; scope.launch { try { block() } catch (e: Exception) { err = errText(e) } finally { busy = false } } }

    AuthFrame {
        Text("VСмске — все свои рядом", style = MaterialTheme.typography.headlineMedium)
        Text("Лента друзей, переписка и музыка.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 8.dp)) {
            listOf("Вход", "Регистрация").forEachIndexed { i, l ->
                SegmentedButton(selected = tab == i, onClick = { tab = i; err = "" }, shape = SegmentedButtonDefaults.itemShape(i, 2)) { Text(l) }
            }
        }
        OutlinedTextField(email, { email = it }, label = { Text("Почта") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(pass, { pass = it }, label = { Text("Пароль") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            supportingText = if (tab == 1) ({ Text("Не меньше 6 символов") }) else null)
        if (err.isNotEmpty()) Text(err, color = MaterialTheme.colorScheme.error)
        if (info.isNotEmpty()) Text(info, color = MaterialTheme.colorScheme.primary)
        Button(onClick = { run { if (tab == 0) Api.signIn(email, pass) else Api.signUp(email, pass) } },
            enabled = !busy && email.isNotBlank() && pass.length >= 6, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text(if (tab == 0) "Войти" else "Создать аккаунт")
        }
        if (tab == 0) TextButton({ if (email.isBlank()) err = "Напишите почту — пришлём ссылку для нового пароля" else run { Api.reset(email); info = "Письмо для смены пароля отправлено" } }) { Text("Забыли пароль?") }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            HorizontalDivider(Modifier.weight(1f)); Text("  или  ", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); HorizontalDivider(Modifier.weight(1f))
        }
        val ctx = androidx.compose.ui.platform.LocalContext.current
        OutlinedButton({ run { Api.signInGoogle(ctx) } }, Modifier.fillMaxWidth().height(52.dp), enabled = !busy) {
            Text("G", fontWeight = FontWeight.Bold, color = Color(0xFF4285F4), fontSize = 20.sp)
            Spacer(Modifier.width(10.dp)); Text("Войти через Google")
        }
    }
}

/** Анкета после регистрации: имя, короткое имя (ник) и город */
@Composable
fun OnboardScreen() {
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf("") }
    var nick by rememberSaveable { mutableStateOf("") }
    var city by rememberSaveable { mutableStateOf("") }
    var busy by rememberSaveable { mutableStateOf(false) }
    var err by rememberSaveable { mutableStateOf("") }
    val nickOk = NICK_RE.matches(nick)
    AuthFrame {
        Text("Расскажите о себе", style = MaterialTheme.typography.headlineMedium)
        Text("Так друзья найдут вас на VСмске.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(name, { name = it.take(60) }, label = { Text("Имя и фамилия") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(nick, { nick = it.lowercase().filter { c -> c in 'a'..'z' || c.isDigit() || c == '.' || c == '_' }.take(30) },
            label = { Text("Короткое имя") }, prefix = { Text("@") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            isError = nick.isNotEmpty() && !nickOk, supportingText = { Text("От 4 символов: латиница, цифры, точка и _") })
        OutlinedTextField(city, { city = it.take(40) }, label = { Text("Город (необязательно)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        if (err.isNotEmpty()) Text(err, color = MaterialTheme.colorScheme.error)
        Button(onClick = { err = ""; busy = true; scope.launch { try { Api.createProfile(name, nick, city) } catch (e: Exception) { err = errText(e) } finally { busy = false } } },
            enabled = !busy && name.isNotBlank() && nickOk, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text("Готово")
        }
        TextButton({ Api.signOut() }) { Text("Выйти") }
    }
}
