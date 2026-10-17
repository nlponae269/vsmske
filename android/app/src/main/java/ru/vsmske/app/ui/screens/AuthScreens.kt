package ru.vsmske.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Fb
import ru.vsmske.app.data.NICK_MSG
import ru.vsmske.app.data.NICK_RE
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Session
import ru.vsmske.app.ui.Card
import ru.vsmske.app.ui.Field
import ru.vsmske.app.ui.GlassButton
import ru.vsmske.app.ui.GradButton
import ru.vsmske.app.ui.Logo
import ru.vsmske.app.ui.Orbs
import ru.vsmske.app.ui.Tabs
import ru.vsmske.app.ui.Vs
import ru.vsmske.app.ui.errText

@Composable
private fun AuthFrame(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        Orbs()
        Column(
            Modifier.fillMaxSize().statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
        ) {
            Spacer(Modifier.height(40.dp))
            Logo()
            Text("Социальная сеть для своих", style = MaterialTheme.typography.bodyMedium, color = Vs.muted, modifier = Modifier.padding(top = 8.dp, bottom = 24.dp))
            Box(Modifier.widthIn(max = 460.dp)) { content() }
        }
    }
}

@Composable
fun AuthScreen() {
    var tab by rememberSaveable { mutableStateOf("login") }
    var email by rememberSaveable { mutableStateOf("") }
    var pass by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf("") }
    var nick by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    AuthFrame {
        Card {
            Tabs(listOf("login" to "Вход", "register" to "Регистрация"), tab, { tab = it; err = "" })
            Spacer(Modifier.height(16.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (tab == "register") {
                    Field(name, { name = it }, "Имя и фамилия")
                    Field(nick, { nick = it.lowercase().trim() }, "Короткое имя (латиницей)")
                }
                Field(email, { email = it.trim() }, "Почта", keyboard = KeyboardOptions(keyboardType = KeyboardType.Email))
                Field(pass, { pass = it }, "Пароль", password = true, keyboard = KeyboardOptions(keyboardType = KeyboardType.Password))
                if (err.isNotEmpty()) Text(err, color = Vs.danger, style = MaterialTheme.typography.bodyMedium)
                GradButton(if (tab == "login") "Войти" else "Создать страницу", Modifier.fillMaxWidth(), busy = busy) {
                    err = ""
                    if (email.isEmpty() || pass.isEmpty()) { err = "Введите почту и пароль"; return@GradButton }
                    if (tab == "register") {
                        if (name.isBlank()) { err = "Напишите имя"; return@GradButton }
                        if (!NICK_RE.matches(nick)) { err = NICK_MSG; return@GradButton }
                    }
                    busy = true
                    scope.launch {
                        try {
                            if (tab == "login") Repo.login(email, pass)
                            else {
                                if (Repo.nickTaken(nick)) { err = "Короткое имя уже занято, выберите другое."; busy = false; return@launch }
                                Session.creating = true
                                try { Repo.register(email, pass, name.trim(), nick) }
                                catch (e: Exception) { Session.creating = false; if (Fb.auth.currentUser != null) Session.phase.value = Session.Phase.NeedProfile; throw e }
                            }
                        } catch (e: Exception) { err = errText(e); busy = false }
                    }
                }
                if (tab == "login") Text(
                    "Аккаунт тот же, что на сайте nlponae269.github.io/vsmske. Если входили через Google — сначала задайте пароль на сайте в «VС ID».",
                    style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                )
            }
        }
    }
}

/** Вошли, а профиля ещё нет (например, регистрация оборвалась) */
@Composable
fun OnboardScreen() {
    var name by rememberSaveable { mutableStateOf("") }
    var nick by rememberSaveable { mutableStateOf("") }
    var city by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    AuthFrame {
        Card {
            Text("Заполните страницу", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field(name, { name = it }, "Имя и фамилия")
                Field(nick, { nick = it.lowercase().trim() }, "Короткое имя (латиницей)")
                Field(city, { city = it }, "Город (необязательно)")
                if (err.isNotEmpty()) Text(err, color = Vs.danger)
                GradButton("Готово", Modifier.fillMaxWidth(), busy = busy) {
                    if (name.isBlank()) { err = "Напишите имя"; return@GradButton }
                    if (!NICK_RE.matches(nick)) { err = NICK_MSG; return@GradButton }
                    busy = true; err = ""
                    scope.launch {
                        try { Session.creating = true; Repo.createProfile(name.trim(), nick, city.trim(), (Fb.auth.currentUser?.photoUrl?.toString() ?: "").take(2000)) }
                        catch (e: Exception) { Session.creating = false; err = errText(e); busy = false }
                    }
                }
                GlassButton("Выйти", Modifier.fillMaxWidth()) { Session.signOut() }
            }
        }
    }
}
