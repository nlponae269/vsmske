package ru.vsmske.app.data

/*
 * Текст песни 3.0: разбор LRC «по-взрослому».
 * - несколько тайм-кодов на строку ([00:12.00][01:40.00]Припев), [offset:±мс];
 * - тайм-коды слов <мм:сс.сс> (расширенный LRC) — заливка точно по словам;
 *   если их нет, время строки делится между словами по длине;
 * - у каждой строки есть конец: следующая строка или оценка по длине текста — длинные паузы
 *   становятся «проигрышем» (три точки, как в Apple Music), в том числе вступление.
 */

data class LWord(val text: String, val from: Int, val to: Int, val start: Double, val end: Double)

data class LLine(val start: Double, val end: Double, val text: String, val words: List<LWord>, val pause: Boolean = false) {
    /** Сколько символов строки «спето» к моменту t (дробное — для мягкой заливки) */
    fun litChars(t: Double): Float {
        if (t <= start) return 0f
        if (t >= end) return text.length.toFloat()
        var lit = 0f
        for (w in words) {
            lit = when {
                t >= w.end -> w.to.toFloat()
                t > w.start -> w.from + (w.to - w.from) * ((t - w.start) / (w.end - w.start).coerceAtLeast(0.01)).toFloat()
                else -> return lit
            }
        }
        return lit
    }
    /** Доля проигрыша (0..1) — для точек */
    fun progress(t: Double) = ((t - start) / (end - start).coerceAtLeast(0.01)).toFloat().coerceIn(0f, 1f)
}

class Lyrics(val timed: Boolean, val lines: List<LLine>) {
    /** Текущая строка: последняя начавшаяся (или −1 до первой) */
    fun indexAt(t: Double): Int {
        if (!timed) return -1
        var lo = 0; var hi = lines.size - 1; var ans = -1
        while (lo <= hi) { val m = (lo + hi) / 2; if (lines[m].start <= t) { ans = m; lo = m + 1 } else hi = m - 1 }
        return ans
    }
    val isEmpty get() = lines.none { it.text.isNotBlank() }

    companion object {
        private val TAG = Regex("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?]")
        private val WORD = Regex("<(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?>")
        private val META = Regex("^\\[([a-zA-Z#]+):(.*)]$")

        private fun sec(m: MatchResult): Double {
            val f = m.groupValues[3]
            return m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt() + if (f.isEmpty()) 0.0 else ("0." + f.padEnd(3, '0')).toDouble()
        }

        /** Сколько обычно поётся строка такой длины (если до следующей далеко) */
        fun singTime(chars: Int) = (0.9 + chars * 0.085).coerceIn(1.4, 9.0)

        fun parse(src: String, duration: Double = 0.0): Lyrics {
            var offset = 0.0
            data class Raw(val t: Double, val body: String)
            val raw = mutableListOf<Raw>(); val plain = mutableListOf<String>()
            for (line in src.replace("\r", "").lines()) {
                val s = line.trim()
                val meta = META.matchEntire(s)
                if (meta != null && !TAG.containsMatchIn(s)) {
                    if (meta.groupValues[1].lowercase() == "offset") offset = (meta.groupValues[2].trim().toDoubleOrNull() ?: 0.0) / 1000.0
                    continue
                }
                val tags = TAG.findAll(s).toList()
                if (tags.isEmpty()) { plain += s; continue }
                val body = s.substring(tags.last().range.last + 1).trim()
                tags.forEach { raw += Raw(sec(it), body) }
            }
            if (raw.isEmpty()) return Lyrics(false, plain.dropWhile { it.isEmpty() }.dropLastWhile { it.isEmpty() }
                .map { LLine(-1.0, -1.0, WORD.replace(it, ""), emptyList()) })

            raw.sortBy { it.t }
            val lines = mutableListOf<LLine>()
            val endAll = if (duration > 0) duration else raw.last().t + 8
            fun pause(a: Double, b: Double) { if (b - a >= 4.0) lines += LLine(a, b, "", emptyList(), pause = true) }
            pause(0.0, (raw.first().t - offset - 0.4))
            for ((i, r) in raw.withIndex()) {
                val start = (r.t - offset).coerceAtLeast(0.0)
                val next = (raw.getOrNull(i + 1)?.t?.minus(offset) ?: endAll).coerceAtLeast(start + 0.2)
                // слова с тайм-кодами: «<00:01.00>Раз <00:01.40>два»
                val wtags = WORD.findAll(r.body).toList()
                val text = WORD.replace(r.body, "").replace(Regex("\\s+"), " ").trim()
                if (text.isEmpty()) { pause(start, next); continue }
                val words = mutableListOf<LWord>()
                if (wtags.isNotEmpty()) {
                    var pos = 0
                    val pieces = mutableListOf<Pair<Double, String>>()
                    val head = r.body.substring(0, wtags.first().range.first).trim()
                    if (head.isNotEmpty()) pieces += r.t to head
                    wtags.forEachIndexed { k, m ->
                        val to = wtags.getOrNull(k + 1)?.range?.first ?: r.body.length
                        val w = r.body.substring(m.range.last + 1, to).trim()
                        if (w.isNotEmpty()) pieces += sec(m) to w
                    }
                    pieces.forEachIndexed { k, (t, w) ->
                        val from = text.indexOf(w, pos).takeIf { it >= 0 } ?: pos
                        pos = (from + w.length).coerceAtMost(text.length)
                        val ws = t - offset
                        val we = pieces.getOrNull(k + 1)?.first?.minus(offset) ?: minOf(next, ws + singTime(w.length))
                        words += LWord(w, from, pos, ws, we.coerceAtLeast(ws + 0.05))
                    }
                    val end = minOf(next, words.last().end + 0.15)
                    lines += LLine(start, end, text, words)
                    pause(end, next)
                } else {
                    val end = minOf(next, start + singTime(text.length))
                    // делим время между словами по длине (гласные тянутся — даём каждому слову запас)
                    val parts = Regex("\\S+").findAll(text).toList()
                    val weight = parts.map { it.value.length + 2.0 }
                    val total = weight.sum()
                    var t = start
                    parts.forEachIndexed { k, m ->
                        val d = (end - start) * weight[k] / total
                        words += LWord(m.value, m.range.first, m.range.last + 1, t, t + d); t += d
                    }
                    lines += LLine(start, end, text, words)
                    pause(end + 0.6, next)
                }
            }
            return Lyrics(true, lines)
        }
    }
}
