package ru.vsmske.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.SmartDisplay
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import kotlinx.coroutines.flow.MutableStateFlow
import ru.vsmske.app.BuildConfig

/*
 * Клипы живут в отдельном приложении «ВС Клипы» (тот же код, сборка clips). В VСмске по нажатию на клипы — окно
 * «недоступно в этой версии» с кнопкой «Скачать APK» (или «Открыть», если «ВС Клипы» уже стоят).
 */
object ClipsGate {
    const val PKG = "ru.vsmske.clips"
    const val APK = "https://github.com/nlponae269/vsmske/releases/download/android/VSClips.apk"
    /** id клипа, который хотели открыть ("" — просто ленту); null — окна нет */
    val ask = MutableStateFlow<String?>(null)
}

/** Открыть клип: в «ВС Клипах» — сразу, в VСмске — окно «недоступно» */
fun NavHostController.openClips(id: String) {
    val clip = id.takeIf { it != "-" } ?: ""
    if (BuildConfig.CLIPS) navigate("clip/${clip.ifEmpty { "-" }}") else ClipsGate.ask.value = clip
}

@Composable
fun ClipsGateDialog() {
    val ask by ClipsGate.ask.collectAsState()
    val id = ask ?: return
    val ctx = LocalContext.current
    val launch = remember(ctx) { ctx.packageManager.getLaunchIntentForPackage(ClipsGate.PKG) }
    val close = { ClipsGate.ask.value = null }
    AlertDialog(close,
        icon = {
            Box(Modifier.size(64.dp).clip(CookieShape).background(Color(0xFF16161D)), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.SmartDisplay, null, tint = Color(0xFF25F4EE), modifier = Modifier.size(34.dp))
            }
        },
        title = { Text("Клипы в этой версии недоступны") },
        text = {
            Text(if (launch != null) "Клипы теперь в отдельном приложении «ВС Клипы» — оно у вас уже установлено."
                 else "Клипы переехали в отдельное приложение «ВС Клипы»: лайки, комментарии, сохранённое и свой профиль. Вход — тем же аккаунтом.",
                style = MaterialTheme.typography.bodyMedium)
        },
        confirmButton = {
            Button({
                close()
                runCatching {
                    if (launch != null) ctx.startActivity(launch.putExtra("clip", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    else ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(ClipsGate.APK)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }) { Text(if (launch != null) "Открыть ВС Клипы" else "Скачать APK") }
        },
        dismissButton = { TextButton(close) { Text("Закрыть") } },
    )
}
