package ru.vsmske.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.vsmske.app.data.buildSearch
import ru.vsmske.app.data.chatId
import ru.vsmske.app.data.extractTags
import ru.vsmske.app.data.fmtDur
import ru.vsmske.app.data.parseLyrics
import ru.vsmske.app.data.plural

/** Форматы данных должны совпадать с сайтом (app.js) */
class TextTest {
    @Test fun search() {
        val s = buildSearch("Алёна Иванова", "alena", "Москва")
        assertTrue("але" in s && "иванова" in s && "мос" in s && "alena" in s)
        assertTrue(s.none { it.contains('ё') })
    }
    @Test fun tags() = assertEquals(listOf("осень", "парк"), extractTags("Гуляли #Осень #парк #осень"))
    @Test fun chat() = assertEquals("a_b", chatId("b", "a"))
    @Test fun words() { assertEquals("друг", plural(21, "друг", "друга", "друзей")); assertEquals("друзей", plural(12, "друг", "друга", "друзей")) }
    @Test fun dur() = assertEquals("3:05", fmtDur(185.0))
    @Test fun lyrics() {
        val (timed, lines) = parseLyrics("[ar:Кто-то]\n[00:01.50]Первая\n[00:00.20]Нулевая")
        assertTrue(timed)
        assertEquals(listOf("Нулевая", "Первая"), lines.map { it.text })
        assertEquals(1.5, lines[1].t, 0.001)
    }
}
