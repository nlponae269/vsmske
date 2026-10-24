package ru.vsmske.app.data

/*
 * Разметка текста — ровно как tagify()/linkify() на сайте (app.js 7.0):
 * сначала ссылки https://…, в остальном — **жирный**, *курсив*, ~~зачёркнутый~~, ||спойлер||, `код`,
 * внутри (кроме кода) — #теги и @ники (но не внутри почты a@b.ru). В базе лежит исходный текст.
 */

data class Piece(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val strike: Boolean = false,
    val code: Boolean = false,
    val spoiler: Int = -1,       // номер спойлера в тексте (−1 — не спойлер)
    val url: String? = null,
    val tag: String? = null,     // без «#», в нижнем регистре
    val nick: String? = null,    // без «@», в нижнем регистре
)

object Markup {
    private val URL = Regex("https?://[^\\s<]+[^\\s<.,:;!?)\\]\"'»]")
    private val FMT = Regex("\\|\\|(?=\\S)[^|\\n]{1,500}?(?<=\\S)\\|\\||\\*\\*(?=\\S)[^*\\n]{1,500}?(?<=\\S)\\*\\*|~~(?=\\S)[^~\\n]{1,500}?(?<=\\S)~~|`[^`\\n]{1,500}?`|(?<![\\p{L}\\d*])\\*(?=\\S)[^*\\n]{1,300}?(?<=\\S)\\*(?![\\p{L}\\d*])")
    private val TAG = Regex("#[\\p{L}\\d_]{2,30}")
    private val MENTION = Regex("@[a-zA-Z0-9._]{3,30}")
    private val NICK_END = Regex("[a-zA-Z0-9._]$")

    fun parse(src: String): List<Piece> {
        val out = mutableListOf<Piece>()
        var spoilers = 0
        var pos = 0
        fun plain(t: String) {
            var p = 0
            for (m in FMT.findAll(t)) {
                if (m.range.first > p) tags(t.substring(p, m.range.first), Piece(""), out)
                val x = m.value
                when {
                    x.startsWith("||") -> tags(x.substring(2, x.length - 2), Piece("", spoiler = spoilers++), out)
                    x.startsWith("**") -> tags(x.substring(2, x.length - 2), Piece("", bold = true), out)
                    x.startsWith("~~") -> tags(x.substring(2, x.length - 2), Piece("", strike = true), out)
                    x.startsWith("`") -> out += Piece(x.substring(1, x.length - 1), code = true)
                    else -> tags(x.substring(1, x.length - 1), Piece("", italic = true), out)
                }
                p = m.range.last + 1
            }
            if (p < t.length) tags(t.substring(p), Piece(""), out)
        }
        for (m in URL.findAll(src)) {
            if (m.range.first > pos) plain(src.substring(pos, m.range.first))
            out += Piece(m.value, url = m.value)
            pos = m.range.last + 1
        }
        if (pos < src.length) plain(src.substring(pos))
        return out
    }

    /** #теги и @ники внутри куска; base — оформление куска (жирный, спойлер…) */
    private fun tags(t: String, base: Piece, out: MutableList<Piece>) {
        var p = 0
        for (m in TAG.findAll(t)) {
            if (m.range.first > p) mentions(t.substring(p, m.range.first), base, out)
            out += base.copy(text = m.value, tag = m.value.substring(1).lowercase())
            p = m.range.last + 1
        }
        if (p < t.length) mentions(t.substring(p), base, out)
    }

    private fun mentions(t: String, base: Piece, out: MutableList<Piece>) {
        var p = 0; var prevEnd = 0
        for (m in MENTION.findAll(t)) {
            val gap = t.substring(prevEnd, m.range.first)   // как parts[i-1] на сайте: текст после прошлого совпадения
            prevEnd = m.range.last + 1
            if (NICK_END.containsMatchIn(gap)) continue   // это почта (a@b.ru), не упоминание
            if (m.range.first > p) out += base.copy(text = t.substring(p, m.range.first))
            out += base.copy(text = m.value, nick = m.value.substring(1).lowercase())
            p = m.range.last + 1
        }
        if (p < t.length) out += base.copy(text = t.substring(p))
    }

    /** Для превью (список чатов, сигналы): без значков разметки, спойлер скрыт — как plainText() на сайте */
    fun plain(src: String): String {
        val sb = StringBuilder(); var p = 0
        for (m in FMT.findAll(src)) {
            sb.append(src, p, m.range.first)
            val x = m.value
            sb.append(when {
                x.startsWith("||") -> "▒▒▒"
                x.startsWith("**") || x.startsWith("~~") -> x.substring(2, x.length - 2)
                else -> x.substring(1, x.length - 1)
            })
            p = m.range.last + 1
        }
        sb.append(src, p, src.length)
        return sb.toString()
    }

    /** Упоминания для уведомлений — как extractMentions() на сайте (до 5 ников) */
    fun mentions(src: String): List<String> =
        Regex("(?:^|[\\s(,.!?])@([a-z0-9._]{3,30})", RegexOption.IGNORE_CASE).findAll(src).map { it.groupValues[1].lowercase() }.distinct().take(5).toList()
}
