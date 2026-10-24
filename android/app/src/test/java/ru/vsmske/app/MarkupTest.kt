package ru.vsmske.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.vsmske.app.data.Markup

/** Разметка должна совпадать с tagify()/linkify() сайта */
class MarkupTest {
    private fun text(s: String) = Markup.parse(s).joinToString("") { it.text }

    @Test fun formats() {
        val p = Markup.parse("a **жир** *кур* ~~зач~~ `ко*д` ||тайна|| b")
        assertEquals("a жир кур зач ко*д тайна b", p.joinToString("") { it.text })
        assertTrue(p.first { it.text == "жир" }.bold)
        assertTrue(p.first { it.text == "кур" }.italic)
        assertTrue(p.first { it.text == "зач" }.strike)
        assertTrue(p.first { it.text == "ко*д" }.code)
        assertEquals(0, p.first { it.text == "тайна" }.spoiler)
    }
    @Test fun notItalicInsideWords() {
        assertEquals("2*3*4", text("2*3*4"))
        assertEquals("** просто", text("** просто"))
    }
    @Test fun links() {
        val p = Markup.parse("смотри https://ya.ru/x, ок")
        assertEquals("https://ya.ru/x", p.first { it.url != null }.url)
        assertEquals("смотри https://ya.ru/x, ок", p.joinToString("") { it.text })
    }
    @Test fun tagsAndMentions() {
        val p = Markup.parse("Привет @Alena_1 и #Осень, почта a@mail.ru")
        assertEquals("alena_1", p.first { it.nick != null }.nick)
        assertEquals("осень", p.first { it.tag != null }.tag)
        assertNull(p.firstOrNull { it.nick == "mail.ru" })
        // тег внутри жирного остаётся жирным
        assertTrue(Markup.parse("**#тег**").first { it.tag == "тег" }.bold)
    }
    @Test fun plainPreview() {
        assertEquals("жир ▒▒▒ код", Markup.plain("**жир** ||тайна|| `код`"))
        assertEquals(listOf("vasya", "petya"), Markup.mentions("@Vasya, привет! (@petya) a@b.ru"))
    }
}
