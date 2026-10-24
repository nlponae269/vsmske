package ru.vsmske.app.ui

import androidx.compose.material.icons.rounded.CurrencyExchange
import androidx.compose.material.icons.rounded.WbSunny
import androidx.compose.material.icons.rounded.StickyNote2
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Bookmark
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.Equalizer
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SmartDisplay
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material3.Badge
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.vsmske.app.BuildConfig
import ru.vsmske.app.data.Store

/* Меню: карточка своей страницы и все разделы плитками — как «Сервисы» на сайте. */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MenuScreen() {
    val nav = LocalNav.current
    val me by Store.me.collectAsState()
    val reqs = Store.incoming.collectAsState().value.size
    val unseen = Store.notifs.collectAsState().value.let { Store.unseenNotifs() }
    var settings by remember { mutableStateOf(false) }
    var eq by remember { mutableStateOf(false) }
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val cs = MaterialTheme.colorScheme
    Scaffold(Modifier.nestedScroll(scroll.nestedScrollConnection), contentWindowInsets = WindowInsets(0),
        topBar = { LargeTopAppBar(title = { Text("Меню") }, scrollBehavior = scroll) }) { pad ->
        LazyVerticalGrid(GridCells.Adaptive(160.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding(), bottom = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                val u = me
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(32.dp)).background(Brush.linearGradient(COVERS[u?.cover ?: "blue"] ?: COVERS["blue"]!!))
                    .clickable { nav.navigate("me") }.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(76.dp).clip(CookieShape).background(Color.White.copy(alpha = 0.25f)), contentAlignment = Alignment.Center) { Avatar(u, 68.dp, shape = CookieShape, showOnline = false) }
                    Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
                        Text(u?.name ?: "", style = MaterialTheme.typography.titleLarge, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("@${u?.nick ?: ""} · моя страница", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
                    }
                    Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Color.White)
                }
            }
            item { MenuTile(Icons.Rounded.Group, "Друзья", if (reqs > 0) "$reqs ${ru.vsmske.app.data.plural(reqs, "заявка", "заявки", "заявок")}" else "${me?.friends?.size ?: 0}", Color(0xFF2F44D0), reqs) { nav.navigate("friends") } }
            item { MenuTile(Icons.Rounded.Notifications, "Сигналы", if (unseen > 0) "новых: $unseen" else "уведомления", Color(0xFFD0462F), unseen) { nav.navigate("notifs") } }
            item { MenuTile(Icons.Rounded.PhotoLibrary, "Фотоальбомы", "мои фото", Color(0xFF2B8BB5)) { nav.navigate("albums/${Store.uid}") } }
            item { MenuTile(Icons.Rounded.SmartDisplay, "Клипы", "короткие видео", Color(0xFFB4398F)) { nav.navigate("clips/-") } }
            item { MenuTile(Icons.Rounded.Sensors, "Эфиры", "прямые трансляции", Color(0xFFE53935)) { nav.navigate("live") } }
            item { MenuTile(Icons.Rounded.Cloud, "Диск", "файлы до 10 МБ", Color(0xFF1F8A5B)) { nav.navigate("disk") } }
            item { MenuTile(Icons.AutoMirrored.Rounded.QueueMusic, "Плейлисты", "ВС Музыка", Color(0xFF6A47C9)) { nav.navigate("music/playlists") } }
            item { MenuTile(Icons.Rounded.Favorite, "Мои треки", "сохранённое", Color(0xFFC026D3)) { nav.navigate("music/liked") } }
            item { MenuTile(Icons.Rounded.Groups, "Сообщества", "${me?.groups?.size ?: 0} подписок", Color(0xFF1F8A5B)) { nav.navigate("clubs") } }
            item { MenuTile(Icons.Rounded.Bookmark, "Закладки", "${me?.saved?.size ?: 0}", Color(0xFF2B8BB5)) { nav.navigate("saved") } }
            item { MenuTile(Icons.Rounded.Search, "Поиск", "люди, теги, треки", Color(0xFF4E5B76)) { nav.navigate("search") } }
            item { MenuTile(Icons.Rounded.StickyNote2, "Заметки", "только для вас", Color(0xFFC98A12)) { nav.navigate("notes") } }
            item { MenuTile(Icons.Rounded.WbSunny, "Погода", "на неделю", Color(0xFF2B8BB5)) { nav.navigate("weather") } }
            item { MenuTile(Icons.Rounded.CurrencyExchange, "Курсы валют", "ЦБ РФ, конвертер", Color(0xFF1F8A5B)) { nav.navigate("rates") } }
            item { MenuTile(Icons.Rounded.Equalizer, "Эквалайзер", "звук музыки", Color(0xFFC98A12)) { eq = true } }
            item { MenuTile(Icons.Rounded.Settings, "Настройки", "приложение", cs.outline) { settings = true } }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text("VСмске для Android · версия ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant,
                    modifier = Modifier.padding(top = 12.dp).fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
    }
    if (eq) EqSheet { eq = false }
    if (settings) SettingsSheet { settings = false }
}

@Composable
private fun MenuTile(icon: ImageVector, title: String, sub: String, tint: Color, badge: Int = 0, onClick: () -> Unit) =
    Box {
        Tile(icon, title, sub, tint, Modifier.fillMaxWidth(), onClick)
        if (badge > 0) Badge(Modifier.align(Alignment.TopEnd).padding(12.dp)) { Text(if (badge > 99) "99+" else "$badge") }
    }

@Composable
fun SettingsSheet(onClose: () -> Unit) {
    val ctx = LocalContext.current
    val p = remember { ctx.getSharedPreferences("vs", Context.MODE_PRIVATE) }
    var listen by remember { mutableStateOf(p.getBoolean("listen", true)) }
    var lyr by remember { mutableStateOf(if (p.getString("lyr_style", "apple") == "plain") "plain" else "apple") }
    VsSheet(onClose) {
        Text("Настройки", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(bottom = 12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Показывать, что я слушаю", style = MaterialTheme.typography.titleSmall)
                Text("Друзья увидят трек у вас в профиле", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(listen, { listen = it; p.edit().putBoolean("listen", it).apply(); if (!it) ru.vsmske.app.data.Api.setListening(null) })
        }
        Text("Тема", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 18.dp, bottom = 6.dp))
        val theme by ThemePref.mode.collectAsState()
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("system" to "Как в системе", "light" to "Светлая", "dark" to "Тёмная").forEach { (k, l) ->
                FilterChip(theme == k, { ThemePref.set(ctx, k) }, { Text(l) }, shape = CircleShape)
            }
        }
        Text("Текст песни", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 18.dp, bottom = 6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(lyr == "apple", { lyr = "apple"; p.edit().putString("lyr_style", "apple").apply() }, { Text("Apple Music") }, shape = CircleShape)
            FilterChip(lyr == "plain", { lyr = "plain"; p.edit().putString("lyr_style", "plain").apply() }, { Text("Обычный") }, shape = CircleShape)
        }
        Row(Modifier.padding(top = 18.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Smartphone, null, tint = MaterialTheme.colorScheme.primary)
            Text("  Цвета приложения берутся из обоев телефона (Android 12+). Тёмная тема — как в системе.", style = MaterialTheme.typography.bodySmall)
        }
        TextButton(onClose, Modifier.align(Alignment.End)) { Text("Готово") }
    }
}
