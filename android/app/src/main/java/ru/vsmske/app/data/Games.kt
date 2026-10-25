package ru.vsmske.app.data

import kotlin.math.pow
import kotlin.random.Random

/** ВС Калькулятор: свой разбор выражения, без eval (как calcEval() на сайте). Поддержка + − × ÷ ^ % ( ) и унарного минуса. */
object Calc {
    fun eval(src: String): Double? {
        val s = src.replace('×', '*').replace('÷', '/').replace('−', '-').replace(',', '.').replace(" ", "")
        if (s.isEmpty()) return null
        var i = 0
        fun peek() = if (i < s.length) s[i] else '\u0000'
        lateinit var expr: () -> Double
        fun number(): Double {
            val st = i
            while (i < s.length && (s[i].isDigit() || s[i] == '.')) i++
            if (st == i) throw IllegalArgumentException()
            return s.substring(st, i).toDouble()
        }
        fun atom(): Double {
            if (peek() == '-') { i++; return -atom() }
            if (peek() == '+') { i++; return atom() }
            var v = if (peek() == '(') { i++; val r = expr(); if (peek() == ')') i++; r } else number()
            while (peek() == '%') { i++; v /= 100 }
            return v
        }
        fun power(): Double { val b = atom(); return if (peek() == '^') { i++; b.pow(power()) } else b }
        fun term(): Double {
            var v = power()
            while (peek() == '*' || peek() == '/') { val op = s[i++]; val r = power(); v = if (op == '*') v * r else v / r }
            return v
        }
        expr = {
            var v = term()
            while (peek() == '+' || peek() == '-') { val op = s[i++]; val r = term(); v = if (op == '+') v + r else v - r }
            v
        }
        return try { val v = expr(); if (i != s.length || v.isNaN() || v.isInfinite()) null else v } catch (_: Exception) { null }
    }

    /** 0.1+0.2 → «0,3»; целые — без дробной части */
    fun fmt(v: Double): String {
        val r = Math.round(v * 1e10) / 1e10
        val t = if (r == Math.floor(r) && kotlin.math.abs(r) < 1e15) r.toLong().toString() else r.toBigDecimal().stripTrailingZeros().toPlainString()
        return t.replace('.', ',')
    }
}

/** Логика 2048: поле 4×4 списком из 16 чисел (0 — пусто) */
object G2048 {
    data class Move(val board: List<Int>, val gained: Int, val moved: Boolean)

    fun empty(rnd: Random = Random): List<Int> = spawn(spawn(List(16) { 0 }, rnd), rnd)

    fun spawn(b: List<Int>, rnd: Random = Random): List<Int> {
        val free = b.indices.filter { b[it] == 0 }
        if (free.isEmpty()) return b
        val at = free[rnd.nextInt(free.size)]
        return b.toMutableList().also { it[at] = if (rnd.nextInt(10) == 0) 4 else 2 }
    }

    /** Сдвинуть одну строку влево со слиянием */
    fun slide(row: List<Int>): Pair<List<Int>, Int> {
        val t = row.filter { it != 0 }
        val out = mutableListOf<Int>(); var gain = 0; var k = 0
        while (k < t.size) {
            if (k + 1 < t.size && t[k] == t[k + 1]) { out += t[k] * 2; gain += t[k] * 2; k += 2 } else { out += t[k]; k++ }
        }
        while (out.size < 4) out += 0
        return out to gain
    }

    /** dir: 0 — влево, 1 — вправо, 2 — вверх, 3 — вниз */
    fun move(b: List<Int>, dir: Int): Move {
        val res = MutableList(16) { 0 }; var gain = 0
        for (line in 0 until 4) {
            val idx = (0 until 4).map { p ->
                when (dir) { 0 -> line * 4 + p; 1 -> line * 4 + (3 - p); 2 -> p * 4 + line; else -> (3 - p) * 4 + line }
            }
            val (row, g) = slide(idx.map { b[it] })
            gain += g
            idx.forEachIndexed { p, at -> res[at] = row[p] }
        }
        return Move(res, gain, res != b)
    }

    fun canMove(b: List<Int>) = (0..3).any { move(b, it).moved }
}

/** Крестики-нолики: поле из 9 клеток, 1 — крестик (человек), 2 — нолик (телефон), 0 — пусто */
object Ttt {
    private val LINES = listOf(listOf(0, 1, 2), listOf(3, 4, 5), listOf(6, 7, 8), listOf(0, 3, 6), listOf(1, 4, 7), listOf(2, 5, 8), listOf(0, 4, 8), listOf(2, 4, 6))

    /** Победная линия или null */
    fun line(b: List<Int>): List<Int>? = LINES.firstOrNull { (a, c, d) -> b[a] != 0 && b[a] == b[c] && b[a] == b[d] }

    /** 0 — игра идёт, 1/2 — победа, 3 — ничья */
    fun result(b: List<Int>): Int = line(b)?.let { b[it[0]] } ?: if (b.none { it == 0 }) 3 else 0

    private fun score(b: MutableList<Int>, turn: Int, me: Int): Int {
        when (val r = result(b)) { 0 -> {}; 3 -> return 0; else -> return if (r == me) 10 else -10 }
        val outs = b.indices.filter { b[it] == 0 }.map { i -> b[i] = turn; val s = score(b, 3 - turn, me); b[i] = 0; s - s.coerceIn(-1, 1) }
        return if (turn == me) outs.max() else outs.min()
    }

    /**
     * Ход телефона. hard — полный перебор (не проигрывает),
     * иначе — выигрывает или блокирует, если видит, а в остальном ходит случайно.
     */
    fun ai(b: List<Int>, me: Int = 2, hard: Boolean = true, rnd: Random = Random): Int {
        val free = b.indices.filter { b[it] == 0 }
        if (free.isEmpty()) return -1
        val m = b.toMutableList()
        if (!hard) {
            for (who in listOf(me, 3 - me)) free.firstOrNull { i -> m[i] = who; val w = result(m) == who; m[i] = 0; w }?.let { return it }
            return free[rnd.nextInt(free.size)]
        }
        val scored = free.map { i -> m[i] = me; val s = score(m, 3 - me, me); m[i] = 0; i to s }
        val best = scored.maxOf { it.second }
        val top = scored.filter { it.second == best }.map { it.first }
        return top[rnd.nextInt(top.size)]
    }
}

/** Сапёр: поле w×h, мины расставляются после первого хода (первая клетка и соседи — без мин) */
object Mines {
    data class Field(val w: Int, val h: Int, val mines: Set<Int>, val open: Set<Int> = emptySet(), val flags: Set<Int> = emptySet(), val boom: Int = -1) {
        val lost get() = boom >= 0
        val won get() = mines.isNotEmpty() && !lost && open.size == w * h - mines.size
    }

    fun near(f: Field, i: Int): List<Int> {
        val x = i % f.w; val y = i / f.w
        return (-1..1).flatMap { dy -> (-1..1).map { dx -> dx to dy } }.filter { it != 0 to 0 }
            .map { (dx, dy) -> x + dx to y + dy }.filter { (a, b) -> a in 0 until f.w && b in 0 until f.h }.map { (a, b) -> b * f.w + a }
    }

    fun count(f: Field, i: Int) = near(f, i).count { it in f.mines }

    fun new(w: Int, h: Int) = Field(w, h, emptySet())

    fun plant(f: Field, first: Int, n: Int, rnd: Random = Random): Field {
        val safe = near(f, first).toSet() + first
        val pool = (0 until f.w * f.h).filter { it !in safe }.shuffled(rnd)
        return f.copy(mines = pool.take(n.coerceAtMost(pool.size)).toSet())
    }

    /** Открыть клетку; пустые (0 мин рядом) раскрываются волной */
    fun reveal(f0: Field, i: Int, n: Int, rnd: Random = Random): Field {
        var f = if (f0.mines.isEmpty()) plant(f0, i, n, rnd) else f0
        if (f.lost || f.won || i in f.open || i in f.flags) return f
        if (i in f.mines) return f.copy(boom = i, open = f.open + i)
        val open = f.open.toMutableSet(); val q = ArrayDeque(listOf(i))
        while (q.isNotEmpty()) {
            val c = q.removeFirst()
            if (c in open || c in f.flags) continue
            open += c
            if (count(f, c) == 0) near(f, c).filter { it !in open && it !in f.mines }.forEach { q += it }
        }
        f = f.copy(open = open)
        return f
    }

    /** Нажатие на открытую цифру: если флажков рядом столько же — открыть остальных соседей */
    fun chord(f: Field, i: Int, n: Int): Field {
        if (i !in f.open || f.lost) return f
        val nb = near(f, i)
        if (nb.count { it in f.flags } != count(f, i)) return f
        return nb.filter { it !in f.flags && it !in f.open }.fold(f) { acc, c -> if (acc.lost) acc else reveal(acc, c, n) }
    }

    fun flag(f: Field, i: Int): Field =
        if (i in f.open || f.lost || f.won) f else f.copy(flags = if (i in f.flags) f.flags - i else f.flags + i)
}
