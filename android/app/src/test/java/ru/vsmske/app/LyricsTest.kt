package ru.vsmske.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.vsmske.app.data.Lyrics

class LyricsTest {
    @Test fun repeatsAndOffset() {
        val l = Lyrics.parse("[offset:500]\n[00:10.00][00:30.00]Припев\n[00:12.00]Куплет", 60.0)
        assertTrue(l.timed)
        val words = l.lines.filter { !it.pause }
        assertEquals(listOf("Припев", "Куплет", "Припев"), words.map { it.text })
        assertEquals(9.5, words[0].start, 0.001)
        assertTrue(l.lines.first().pause)   // вступление 9 с — точки
    }
    @Test fun wordTimes() {
        val l = Lyrics.parse("[00:01.00]<00:01.00>Раз <00:02.00>два <00:03.00>три")
        val line = l.lines.first { !it.pause }
        assertEquals("Раз два три", line.text)
        assertEquals(3, line.words.size)
        assertEquals(2.0, line.words[1].start, 0.001)
        assertEquals(3f, line.litChars(2.0), 0.01f)
        assertEquals(0f, line.litChars(0.5), 0.01f)
    }
    @Test fun estimatedFill() {
        val l = Lyrics.parse("[00:00.00]Один два\n[00:20.00]Дальше")
        val first = l.lines[0]
        assertTrue(first.end < 20)
        assertTrue(l.lines[1].pause)        // длинная пауза до следующей строки
        assertEquals(0, l.indexAt(1.0))
        assertEquals(first.text.length.toFloat(), first.litChars(first.end), 0.01f)
    }
    @Test fun plain() {
        val l = Lyrics.parse("\nСтрока\nЕщё\n")
        assertFalse(l.timed); assertEquals(2, l.lines.size); assertEquals(-1, l.indexAt(5.0))
    }
}
