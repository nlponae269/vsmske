package ru.vsmske.app.ui

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em
import androidx.navigation.NavHostController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Markup

/*
 * Текст записей, комментариев и сообщений с разметкой как на сайте: **жирный**, *курсив*, ~~зачёркнутый~~,
 * ||спойлер|| (открывается нажатием), `код`, ссылки, #теги (страница тега) и @ники (профиль).
 * Ссылки на сам VСмске (видео, клипы, эфиры, записи, профили) открываются прямо в приложении.
 */
@Composable
fun RichText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    linkColor: Color = Color.Unspecified,
    maxLines: Int = Int.MAX_VALUE,
) {
    val nav = LocalNav.current
    val uri = LocalUriHandler.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val cs = MaterialTheme.colorScheme
    val link = if (linkColor == Color.Unspecified) cs.primary else linkColor
    var open by remember(text) { mutableStateOf(emptySet<Int>()) }
    val pieces = remember(text) { Markup.parse(text) }
    val ann: AnnotatedString = remember(pieces, open, link, linkColor, cs.onSurfaceVariant, cs.surfaceContainerHighest) {
        // свой цвет ссылок (например, в «облачке» сообщения) — тогда ещё и подчёркиваем, чтобы ссылку было видно
        val linkStyle = TextLinkStyles(SpanStyle(color = link, fontWeight = FontWeight.Medium, textDecoration = if (linkColor != Color.Unspecified) TextDecoration.Underline else null))
        buildAnnotatedString {
            for (p in pieces) {
                val hidden = p.spoiler >= 0 && p.spoiler !in open
                var st = SpanStyle()
                if (p.bold) st = st.merge(SpanStyle(fontWeight = FontWeight.Bold))
                if (p.italic) st = st.merge(SpanStyle(fontStyle = FontStyle.Italic))
                if (p.strike) st = st.merge(SpanStyle(textDecoration = TextDecoration.LineThrough))
                if (p.code) st = st.merge(SpanStyle(fontFamily = FontFamily.Monospace, fontSize = 0.92.em, background = cs.surfaceContainerHighest))
                if (p.spoiler >= 0) st = st.merge(if (hidden) SpanStyle(color = Color.Transparent, background = cs.onSurfaceVariant.copy(alpha = 0.55f))
                                                  else SpanStyle(background = cs.onSurfaceVariant.copy(alpha = 0.12f)))
                val action: LinkAnnotation? = when {
                    hidden -> LinkAnnotation.Clickable("sp${p.spoiler}") { open = open + p.spoiler }
                    p.url != null -> siteRoute(p.url)?.let { r -> LinkAnnotation.Clickable("u", linkStyle) { openSite(nav, scope, toast, r) } }
                        ?: LinkAnnotation.Url(p.url, linkStyle) { runCatching { uri.openUri(p.url) }.onFailure { toast("Не получилось открыть ссылку") } }
                    p.tag != null -> LinkAnnotation.Clickable("t", linkStyle) { nav.navigate("tag/${p.tag}") }
                    p.nick != null -> LinkAnnotation.Clickable("n", linkStyle) { openNick(nav, scope, toast, p.nick) }
                    else -> null
                }
                if (action != null) withLink(action) { withStyle(st) { append(p.text) } } else withStyle(st) { append(p.text) }
            }
        }
    }
    Text(ann, modifier, color = color, style = style, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
}

/** Ссылка на свой сайт → маршрут в приложении (или null — открыть в браузере) */
fun siteRoute(url: String): String? {
    if (!url.startsWith(SITE)) return null
    var r = url.removePrefix(SITE).removePrefix("#").removePrefix("?/").substringBefore('?').trimEnd('/')
    if (r.startsWith("u/")) r = "@" + r.removePrefix("u/")
    return when {
        r.isEmpty() || r == "feed" -> "feed"
        Regex("^(post|video|videos|clips|live|album|albums|club|lot|event|q)/[\\w-]+$").matches(r) -> r
        r == "clips" -> "clips/-"
        r.startsWith("answers") -> "answers"
        r == "mail" || r in setOf("mail/in", "mail/sent", "mail/new") -> "mail"
        Regex("^mail/[\\w-]+$").matches(r) -> r
        r == "live" || r == "video" || r == "music" || r == "disk" || r == "clubs" || r == "market" || r == "events" || r == "radio" || r == "notes" || r == "weather" || r == "rates" || r == "calc" || r == "timer" || r == "dice" || r == "games/2048" || r == "games/ttt" || r == "games/mines" -> r
        r.startsWith("id/") -> "profile:" + r.removePrefix("id/")
        r.startsWith("@") && r.length > 1 -> "nick:" + r.removePrefix("@").lowercase()
        r.startsWith("tag/") -> r
        else -> null
    }
}

private fun openSite(nav: NavHostController, scope: CoroutineScope, toast: (String) -> Unit, r: String) {
    when {
        r.startsWith("profile:") -> nav.openProfile(r.removePrefix("profile:"))
        r.startsWith("nick:") -> openNick(nav, scope, toast, r.removePrefix("nick:"))
        r in setOf("feed", "video", "music") -> nav.openTab(r)
        else -> nav.navigate(r)
    }
}

/** @ник → профиль (через usernames/{ник}) */
fun openNick(nav: NavHostController, scope: CoroutineScope, toast: (String) -> Unit, nick: String) {
    scope.launch {
        val uid = runCatching { Fire.db.collection("usernames").document(nick).get().await().getString("uid") }.getOrNull()
        if (uid.isNullOrEmpty()) toast("Нет человека с именем @$nick") else nav.openProfile(uid)
    }
}
