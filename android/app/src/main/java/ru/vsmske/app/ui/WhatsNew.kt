package ru.vsmske.app.ui

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.vsmske.app.BuildConfig
import ru.vsmske.app.data.Store

/* «Что нового» — один раз после обновления и только аккаунтам старше суток (как whatsNewModal() на сайте). */

private val ITEMS = listOf(
    "💣" to "Новые игры: Сапёр (три уровня, рекорды) и Крестики-нолики против телефона — работают и без интернета",
    "🎵" to "Загружать треки теперь могут только администраторы",
    "📴" to "Без интернета приложение больше не зависает: открываются 2048, Калькулятор, Таймер и Жребий, а когда сеть вернётся — всё остальное",
    "✉️" to "ВС Почта: письма с темой на адрес ник@vsmske — значок новых в Меню",
    "💡" to "ВС Ответы: задайте вопрос, отвечайте другим, выбирайте лучший ответ",
    "👀" to "Гости: кто заходил на вашу страницу",
    "🎲" to "2048, Калькулятор, Таймер с секундомером и Жребий — работают без интернета",
    "🗂️" to "Меню разложено по разделам",
    "📻" to "Радио: Record, Европа Плюс, DFM и другие — играет в общем плеере",
    "🛍️" to "Маркет: объявления, «Продано», написать продавцу",
    "📅" to "События: встречи с датой, местом и кнопкой «Пойду»",
    "🔑" to "Вход через Google — тот же аккаунт, что на сайте",
    "🗒️" to "Заметки, Погода и Курсы валют — в Меню",
    "✏️" to "Свою запись можно изменить: «⋯» → «Изменить»",
    "✍️" to "Разметка как на сайте: **жирный**, *курсив*, ~~зачёркнутый~~, ||спойлер|| и `код` — кнопки в новой записи",
    "#️⃣" to "Хэштеги и @ники нажимаются; ссылки на VСмске открываются прямо в приложении",
    "🎤" to "Голосовые в чатах: нажмите микрофон, когда поле пустое",
    "🔖" to "Закладки и общий поиск — людей, тегов, треков и видео",
    "🎵" to "Свой трек: правка названия, обложки и текста, поиск текста с тайм-кодами",
    "✨" to "«Микс дня» и «Чаще всего слушаю» на главной Музыки",
    "🫂" to "Беседы: создайте групповой чат с друзьями — кнопка в «Чатах»",
    "👥" to "Сообщества: подписки, записи, своё сообщество — Меню → Сообщества",
    "🌗" to "Тема: как в системе, светлая или тёмная — Меню → Настройки",
    "💬" to "Чаты: поиск, закрепление долгим нажатием, ответ свайпом вправо",
    "⭕" to "Истории на аватарке профиля — цветное кольцо, нажмите, чтобы открыть",
    "🛠️" to "Исправлены ошибки в клипах, плеере, видео, историях и эфирах",
)

@Composable
fun WhatsNew() {
    val ctx = LocalContext.current
    val me by Store.me.collectAsState()
    val p = remember { ctx.getSharedPreferences("vs", Context.MODE_PRIVATE) }
    var seen by remember { mutableStateOf(p.getString("seen_ver", "")) }
    val u = me ?: return
    if (seen == BuildConfig.VERSION_NAME) return
    if (u.createdAt == 0L || System.currentTimeMillis() - u.createdAt < 86_400_000L) {   // новичкам не показываем — просто запоминаем версию
        androidx.compose.runtime.LaunchedEffect(Unit) { p.edit().putString("seen_ver", BuildConfig.VERSION_NAME).apply(); seen = BuildConfig.VERSION_NAME }
        return
    }
    val close = { p.edit().putString("seen_ver", BuildConfig.VERSION_NAME).apply(); seen = BuildConfig.VERSION_NAME }
    VsSheet(close) {
        Text("Что нового в ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.headlineSmall)
        Column(Modifier.padding(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ITEMS.forEach { (e, t) ->
                Row {
                    Text(e, fontSize = 22.sp, modifier = Modifier.width(36.dp))
                    Text(t, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Button(close, Modifier.fillMaxWidth()) { Text("Понятно") }
    }
}
