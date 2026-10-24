package ru.vsmske.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.vsmske.app.data.Calc
import ru.vsmske.app.data.G2048

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
}
