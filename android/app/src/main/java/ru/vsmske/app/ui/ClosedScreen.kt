package ru.vsmske.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** 3.14: VСмске закрыт. Вернуть приложение — CLOSED = false (данные в базе не тронуты). */
const val CLOSED = true
private const val MIG_APK = "https://storage.yandexcloud.net/vsclips-video/app/Mig.apk"

@Composable
fun ClosedScreen() = VsTheme {
    val ctx = LocalContext.current
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface).systemBarsPadding().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(max = 420.dp)) {
            Box(Modifier.size(88.dp).clip(RoundedCornerShape(26.dp)).background(Color(0xFFE8664A)), contentAlignment = Alignment.Center) {
                Text("вс", color = Color.White, fontSize = 36.sp, fontWeight = FontWeight.Black)
            }
            Text("VСмске закрыт", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 20.dp))
            Text("Спасибо, что были с нами! Проект больше не работает.\nКороткие видео теперь — в приложении «Миг».",
                style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 10.dp))
            Button({ runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(MIG_APK))) } },
                Modifier.padding(top = 24.dp).height(52.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9D4EDD), contentColor = Color.White)) {
                Text("Скачать «Миг»", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}
