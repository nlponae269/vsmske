package ru.vsmske.app.data

import java.util.Calendar
import kotlin.math.roundToInt

/* Те же правила, что у сайта (app.js): поисковые слова, хэштеги, ник, время. */

val NICK_RE = Regex("^[a-z0-9._]{4,30}$")
val COLORS = listOf("#2F44D0", "#D0462F", "#1F8A5B", "#B4398F", "#C98A12", "#2B8BB5", "#6A47C9", "#4E5B76")

/** users.search: все начала слов имени, города и ника (до 15 букв, ё → е, не больше 150) */
fun buildSearch(name: String, nick: String, city: String): List<String> {
    val words = "$name $city".lowercase().replace('ё', 'е').split(Regex("[\\s\\-,.]+")).filter { it.isNotEmpty() }.toMutableList()
    if (nick.isNotEmpty()) words += nick.lowercase()
    val out = LinkedHashSet<String>()
    for (w in words) for (i in 1..minOf(w.length, 15)) out += w.substring(0, i)
    return out.take(150)
}

fun extractTags(t: String): List<String> =
    Regex("#([\\p{L}\\d_]{2,30})").findAll(t).map { it.groupValues[1].lowercase() }.distinct().take(10).toList()

fun chatId(a: String, b: String) = listOf(a, b).sorted().joinToString("_")
fun isRoom(key: String) = key.startsWith("g_")
fun chatKeyId(me: String, key: String) = if (isRoom(key)) key else chatId(me, key)

fun plural(n: Int, one: String, few: String, many: String): String {
    val a = n % 10; val b = n % 100
    return if (a == 1 && b != 11) one else if (a in 2..4 && b !in 12..14) few else many
}

private val MONTHS = listOf("янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")
private fun hm(c: Calendar) = "%d:%02d".format(c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
private fun dayStart() = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }.timeInMillis

fun ago(t: Long): String {
    if (t <= 0) return ""
    val d = System.currentTimeMillis() - t
    if (d < 60_000) return "только что"
    if (d < 3_600_000) { val m = (d / 60_000).toInt(); return "$m ${plural(m, "минуту", "минуты", "минут")} назад" }
    val c = Calendar.getInstance().apply { timeInMillis = t }
    val day = dayStart()
    if (t >= day) return "сегодня в ${hm(c)}"
    if (t >= day - 86_400_000) return "вчера в ${hm(c)}"
    val y = if (c.get(Calendar.YEAR) != Calendar.getInstance().get(Calendar.YEAR)) " ${c.get(Calendar.YEAR)}" else ""
    return "${c.get(Calendar.DAY_OF_MONTH)} ${MONTHS[c.get(Calendar.MONTH)]}$y в ${hm(c)}"
}

fun clock(t: Long): String = if (t <= 0) "" else hm(Calendar.getInstance().apply { timeInMillis = t })

fun dayLabel(t: Long): String {
    val day = dayStart()
    if (t >= day) return "Сегодня"
    if (t >= day - 86_400_000) return "Вчера"
    val c = Calendar.getInstance().apply { timeInMillis = t }
    return "${c.get(Calendar.DAY_OF_MONTH)} ${MONTHS[c.get(Calendar.MONTH)]}"
}

fun fmtDur(sec: Double): String { val s = sec.roundToInt().coerceAtLeast(0); return "${s / 60}:%02d".format(s % 60) }

fun initials(name: String): String =
    name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.take(1).uppercase() }.ifEmpty { "?" }

/** Строка текста песни; t < 0 — без тайм-кода */
data class LyricLine(val t: Double, val text: String)

/** Текст песни, строки LRC [мм:сс.сс] дают синхронизацию. Возвращает (есть тайм-коды, строки). */
fun parseLyrics(src: String): Pair<Boolean, List<LyricLine>> {
    val tag = Regex("\\[(\\d{1,2}):(\\d{2})(?:[.:](\\d{1,3}))?]")
    val meta = Regex("^\\[[a-zA-Z]+:.*]$")
    val out = mutableListOf<LyricLine>()
    var timed = false
    for (raw in src.lines()) {
        val tags = tag.findAll(raw).toList()
        val body = raw.replace(tag, "").trim()
        if (tags.isNotEmpty()) {
            timed = true
            for (m in tags) {
                val frac = m.groupValues[3].let { if (it.isEmpty()) 0.0 else ("0." + it.padEnd(3, '0')).toDouble() }
                out += LyricLine(m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt() + frac, body)
            }
        } else if (!meta.matches(raw.trim())) out += LyricLine(-1.0, raw.trim())
    }
    if (timed) return true to out.filter { it.t >= 0 }.sortedBy { it.t }
    return false to out.dropWhile { it.text.isEmpty() }.dropLastWhile { it.text.isEmpty() }
}

val NOTIF_TEXT = mapOf(
    "like" to "оценил(а) вашу запись", "comment" to "прокомментировал(а) запись", "wall" to "написал(а) на вашей стене",
    "friend" to "принял(а) вашу заявку в друзья", "repost" to "поделился(ась) вашей записью", "answer" to "ответил(а) на ваш вопрос",
    "best" to "выбрал(а) ваш ответ лучшим", "mention" to "упомянул(а) вас", "gift" to "отправил(а) вам подарок",
    "nick" to "подарил(а) вам коллекционный юзернейм", "call" to "звонил(а) вам",
)
