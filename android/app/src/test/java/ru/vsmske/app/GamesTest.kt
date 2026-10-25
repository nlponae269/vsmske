package ru.vsmske.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.vsmske.app.data.Calc
import ru.vsmske.app.data.G2048
import ru.vsmske.app.data.Mines
import ru.vsmske.app.data.Ttt
import kotlin.random.Random

class GamesTest {
    @Test fun calcBasics() {
        assertEquals(7.0, Calc.eval("1+2×3")!!, 1e-9)
        assertEquals(9.0, Calc.eval("(1+2)*3")!!, 1e-9)
        assertEquals(-4.0, Calc.eval("-2×2")!!, 1e-9)
        assertEquals(512.0, Calc.eval("2^3^2")!!, 1e-9)
        assertEquals(0.5, Calc.eval("50%")!!, 1e-9)
        assertEquals(2.5, Calc.eval("5÷2")!!, 1e-9)
        assertEquals(1.5, Calc.eval("1,5")!!, 1e-9)
    }

    @Test fun calcErrors() {
        assertNull(Calc.eval(""))
        assertNull(Calc.eval("1+"))
        assertNull(Calc.eval("1/0"))
        assertNull(Calc.eval("2)"))
        assertNull(Calc.eval("abc"))
    }

    @Test fun calcFormat() {
        assertEquals("0,3", Calc.fmt(0.1 + 0.2))
        assertEquals("42", Calc.fmt(42.0))
        assertEquals("-1,25", Calc.fmt(-1.25))
    }

    @Test fun slideMerges() {
        assertEquals(listOf(4, 4, 0, 0) to 8, G2048.slide(listOf(2, 2, 2, 2)))
        assertEquals(listOf(4, 2, 0, 0) to 4, G2048.slide(listOf(2, 0, 2, 2)))
        assertEquals(listOf(8, 0, 0, 0) to 0, G2048.slide(listOf(0, 0, 0, 8)))
    }

    @Test fun moveDirections() {
        val b = listOf(2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0)
        val r = G2048.move(b, 1).board
        assertEquals(4, r[3]); assertEquals(2, r[15])
        val d = G2048.move(b, 3)
        assertEquals(4, d.board[12]); assertEquals(2, d.board[15]); assertEquals(4, d.gained)
        assertTrue(d.moved)
        val full = listOf(2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2)
        assertFalse(G2048.canMove(full))
    }

    @Test fun tttWinAndBlock() {
        assertEquals(listOf(0, 1, 2), Ttt.line(listOf(1, 1, 1, 2, 2, 0, 0, 0, 0)))
        assertEquals(3, Ttt.result(listOf(1, 2, 1, 1, 2, 2, 2, 1, 1)))
        // нолик выигрывает, если может
        assertEquals(5, Ttt.ai(listOf(1, 1, 0, 2, 2, 0, 1, 0, 0)))
        // и блокирует крестик
        assertEquals(2, Ttt.ai(listOf(1, 1, 0, 0, 2, 0, 0, 0, 0)))
        assertEquals(2, Ttt.ai(listOf(1, 1, 0, 0, 2, 0, 0, 0, 0), hard = false))
    }

    @Test fun tttHardNeverLoses() {
        // крестик ходит всеми способами — сложный нолик ни разу не проигрывает
        fun play(b: List<Int>): Boolean {
            if (Ttt.result(b) != 0) return Ttt.result(b) != 1
            return b.indices.filter { b[it] == 0 }.all { i ->
                val x = b.toMutableList().also { it[i] = 1 }
                if (Ttt.result(x) != 0) Ttt.result(x) != 1 else play(x.also { it[Ttt.ai(it, rnd = Random(i))] = 2 })
            }
        }
        assertTrue(play(List(9) { 0 }))
    }

    @Test fun minesFirstSafeAndFlood() {
        val f = Mines.reveal(Mines.new(9, 9), 40, 10, Random(1))
        assertEquals(10, f.mines.size)
        assertFalse(f.lost)
        assertTrue(40 !in f.mines && Mines.near(f, 40).none { it in f.mines })
        assertTrue(f.open.size > 1)   // вокруг первой клетки мин нет — открылось волной
        assertTrue(f.open.none { it in f.mines })
    }

    @Test fun minesWinLoseFlag() {
        var f = Mines.Field(3, 1, setOf(0))
        f = Mines.flag(f, 0); assertTrue(0 in f.flags)
        f = Mines.reveal(f, 0, 1); assertFalse(f.lost)   // под флажком не открывается
        f = Mines.reveal(f, 1, 1); f = Mines.reveal(f, 2, 1)
        assertTrue(f.won)
        val g = Mines.reveal(Mines.Field(3, 1, setOf(0)), 0, 1)
        assertTrue(g.lost)
    }
}
