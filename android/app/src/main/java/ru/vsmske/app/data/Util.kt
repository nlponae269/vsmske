package ru.vsmske.app.data

import java.util.Calendar

/* То же, что функции сайта с теми же названиями (app.js) — данные должны совпадать байт в байт. */

val NICK_RE = Regex("^[a-z0-9._]{4,30}$")
const val NICK_MSG = "Короткое имя: от 4 до 30 символов, латиница, цифры, точка и _."
val COLORS = listOf("#2F44D0", "#D0462F", "#1F8A5B", "#B4398F", "#C98A12", "#2B8BB5", "#6A47C9", "#4E5B76")

/** Префиксы слов имени, города и ника — по ним ищут людей (users.search, array-contains) */
fun buildSearch(name: String, nick: String, city: String): List<String> {
    val words = "$name $city".lowercase().replace('ё', 'е').split(Regex("[\\s\\-,.]+")).filter { it.isNotEmpty() }.toMutableList()
    if (nick.isNotEmpty()) words.add(nick.lowercase())
    val set = LinkedHashSet<String>()
    words.forEach { w -> for (i in 1..minOf(w.length, 15)) set.add(w.substring(0, i)) }
    return set.take(150)
}

fun extractTags(t: String): List<String> =
    Regex("#([\\p{L}\\d_]{2,30})").findAll(t).map { it.groupValues[1].lowercase() }.distinct().take(10).toList()

fun chatId(a: String, b: String) = listOf(a, b).sorted().joinToString("_")
fun isRoom(key: String) = key.startsWith("g_")
fun chatKeyId(me: String, key: String) = if (isRoom(key)) key else chatId(me, key)

fun plural(n: Int, a: String, b: String, c: String): String {
    val m10 = n % 10; val m100 = n % 100
    return if (m10 == 1 && m100 != 11) a else if (m10 in 2..4 && (m100 < 10 || m100 >= 20)) b else c
}

private val MONTHS = listOf("янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")
private fun hm(c: Calendar) = "%d:%02d".format(c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
private fun startOfDay(): Long = Calendar.getInstance().apply {
    set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
}.timeInMillis

/** «только что», «5 минут назад», «вчера в 14:20», «3 окт в 9:05» */
fun ago(t: Long): String {
    if (t == 0L) return ""
    val d = System.currentTimeMillis() - t
    if (d < 60_000) return "только что"
    if (d < 3_600_000) { val m = (d / 60_000).toInt(); return "$m ${plural(m, "минуту", "минуты", "минут")} назад" }
    val c = Calendar.getInstance().apply { timeInMillis = t }
    val day = startOfDay()
    if (t >= day) return "сегодня в ${hm(c)}"
    if (t >= day - 86_400_000) return "вчера в ${hm(c)}"
    val y = if (c.get(Calendar.YEAR) != Calendar.getInstance().get(Calendar.YEAR)) " ${c.get(Calendar.YEAR)}" else ""
    return "${c.get(Calendar.DAY_OF_MONTH)} ${MONTHS[c.get(Calendar.MONTH)]}$y в ${hm(c)}"
}

fun timeOnly(t: Long): String = if (t == 0L) "" else hm(Calendar.getInstance().apply { timeInMillis = t })

fun dayLabel(t: Long): String {
    val day = startOfDay()
    if (t >= day) return "Сегодня"
    if (t >= day - 86_400_000) return "Вчера"
    val c = Calendar.getInstance().apply { timeInMillis = t }
    val y = if (c.get(Calendar.YEAR) != Calendar.getInstance().get(Calendar.YEAR)) " ${c.get(Calendar.YEAR)}" else ""
    return "${c.get(Calendar.DAY_OF_MONTH)} ${MONTHS[c.get(Calendar.MONTH)]}$y"
}

fun seenText(u: User?): String {
    if (u == null || u.lastSeen == 0L) return ""
    return if (u.online) "в сети" else "был(а) в сети ${ago(u.lastSeen)}"
}

fun fmtDur(s: Double): String { val x = Math.round(s).toInt(); return "${x / 60}:%02d".format(x % 60) }

fun initials(name: String): String =
    name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.take(1).uppercase() }.ifEmpty { "?" }

/** Текст песни с тайм-кодами LRC [мм:сс.сс] */
data class LyricLine(val t: Double, val text: String)

fun parseLyrics(s: String): Pair<Boolean, List<LyricLine>> {
    val re = Regex("\\[(\\d{1,2}):(\\d{2})(?:[.:](\\d{1,3}))?]")
    val out = mutableListOf<LyricLine>()
    var timed = false
    s.split('\n').forEach { raw ->
        val tags = re.findAll(raw).toList()
        val body = raw.replace(re, "").trim()
        if (tags.isNotEmpty()) {
            timed = true
            tags.forEach { m ->
                val frac = m.groupValues[3].let { if (it.isEmpty()) 0.0 else ("0." + it.padEnd(3, '0')).toDouble() }
                out.add(LyricLine(m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt() + frac, body))
            }
        } else if (!Regex("^\\[[a-z]+:.*]$", RegexOption.IGNORE_CASE).matches(raw.trim())) out.add(LyricLine(-1.0, raw.trim()))
    }
    if (timed) return true to out.filter { it.t >= 0 }.sortedBy { it.t }
    while (out.isNotEmpty() && out.first().text.isEmpty()) out.removeAt(0)
    while (out.isNotEmpty() && out.last().text.isEmpty()) out.removeAt(out.size - 1)
    return false to out
}

val NOTIF_TEXT = mapOf(
    "like" to "оценил(а) вашу запись", "comment" to "прокомментировал(а) запись", "wall" to "написал(а) на вашей стене",
    "friend" to "принял(а) вашу заявку в друзья", "repost" to "поделился(ась) вашей записью", "answer" to "ответил(а) на ваш вопрос",
    "best" to "выбрал(а) ваш ответ лучшим", "mention" to "упомянул(а) вас", "gift" to "отправил(а) вам подарок",
    "nick" to "подарил(а) вам коллекционный юзернейм",
)
