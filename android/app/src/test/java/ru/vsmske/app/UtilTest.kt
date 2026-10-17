package ru.vsmske.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.vsmske.app.data.buildSearch
import ru.vsmske.app.data.chatId
import ru.vsmske.app.data.extractTags
import ru.vsmske.app.data.parseLyrics
import ru.vsmske.app.data.plural

/** Ожидаемые значения получены из функций сайта (app.js) — приложение должно писать в базу то же самое */
class UtilTest {
    @Test fun searchKeysMatchSite() {
        val js = listOf("а","ал","але","ален","алена","п","пе","пет","петр","петро","петров","петрова","в","во","вод","водк","водки","водкин","водкина",
            "с","са","сан","санк","санкт","пете","петер","петерб","петербу","петербур","петербург","a","al","ale","alen","alena","alena.","alena.p")
        assertEquals(js, buildSearch("Алёна Петрова-Водкина", "alena.p", "Санкт-Петербург"))
    }

    @Test fun tagsMatchSite() = assertEquals(listOf("мир", "cats_2024", "ёлка"), extractTags("Привет #Мир и #мир #a #cats_2024 #Ёлка"))

    @Test fun chatIdSorted() = assertEquals("Abc_abc", chatId("abc", "Abc"))

    @Test fun plurals() {
        assertEquals("друг", plural(21, "друг", "друга", "друзей"))
        assertEquals("друга", plural(3, "друг", "друга", "друзей"))
        assertEquals("друзей", plural(12, "друг", "друга", "друзей"))
    }

    @Test fun lrc() {
        val (timed, lines) = parseLyrics("[ar:Кто-то]\n[00:12.50]Первая\n[00:05]Нулевая\n[01:02.3]Третья")
        assertTrue(timed)
        assertEquals(listOf(5.0, 12.5, 62.3), lines.map { it.t })
        assertEquals("Нулевая", lines[0].text)
        val (t2, plain) = parseLyrics("\nПросто\nтекст\n\n")
        assertTrue(!t2); assertEquals(listOf("Просто", "текст"), plain.map { it.text })
    }
}
