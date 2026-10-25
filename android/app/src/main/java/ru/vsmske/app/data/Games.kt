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
