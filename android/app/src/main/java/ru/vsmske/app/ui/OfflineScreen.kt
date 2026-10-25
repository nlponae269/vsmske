package ru.vsmske.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Calculate
import androidx.compose.material.icons.rounded.Casino
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.launch

/** Сервисы, которым интернет не нужен: значок, название, подпись, маршрут, цвет */
private data class Tool(val icon: androidx.compose.ui.graphics.vector.ImageVector, val title: String, val sub: String, val route: String, val tint: Color)
private val TOOLS = listOf(
    Tool(Icons.Rounded.GridView, "2048", "головоломка", "games/2048", Color(0xFFC98A12)),
    Tool(Icons.Rounded.Flag, "Сапёр", "три уровня", "games/mines", Color(0xFF2E9D4A)),
    Tool(Icons.Rounded.Close, "Крестики-нолики", "против телефона", "games/ttt", Color(0xFF1E66F5)),
    Tool(Icons.Rounded.Calculate, "Калькулятор", "с историей", "calc", Color(0xFF4E5B76)),
    Tool(Icons.Rounded.Timer, "Таймер", "и секундомер", "timer", Color(0xFFD0462F)),
    Tool(Icons.Rounded.Casino, "Жребий", "монетка, кубики", "dice", Color(0xFF6A47C9)),
)

/** Сетка «работает без сети» с шапкой сверху */
@Composable
fun OfflineToolsGrid(modifier: Modifier = Modifier, top: PaddingValues = PaddingValues(16.dp), header: @Composable () -> Unit) {
    val nav = LocalNav.current
    LazyVerticalGrid(GridCells.Adaptive(160.dp), modifier.fillMaxSize(), contentPadding = top,
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item(span = { GridItemSpan(maxLineSpan) }) { header() }
        TOOLS.forEach { t -> item { Tile(t.icon, t.title, t.sub, t.tint, Modifier.fillMaxWidth()) { nav.navigate(t.route) } } }
    }
}

/** Экран «Без сети» внутри приложения (из плашки внизу) */
@Composable
fun OfflineToolsScreen() = BackScaffold("Без сети") { pad ->
    OfflineToolsGrid(top = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding(), bottom = 24.dp)) {
        Text("Эти разделы работают и без интернета — всё хранится на телефоне.", style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

/**
 * Вошли, но без интернета профиль не загрузить (и на телефоне нет его копии).
 * Здесь работают сервисы без базы; когда сеть появится, приложение откроется само.
 */
@Composable
fun OfflineScreen() {
    val nav = rememberNavController()
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val toast: (String) -> Unit = { m -> scope.launch { snack.currentSnackbarData?.dismiss(); snack.showSnackbar(m) } }
    CompositionLocalProvider(LocalNav provides nav, LocalToast provides toast) {
        Scaffold(snackbarHost = { SnackbarHost(snack) }, contentWindowInsets = WindowInsets(0)) { _ ->
            NavHost(nav, "home") {
                composable("home") {
                    val cs = MaterialTheme.colorScheme
                    OfflineToolsGrid(Modifier.statusBarsPadding()) {
                        Column(Modifier.fillMaxWidth().padding(top = 32.dp, bottom = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(Modifier.size(96.dp).clip(CookieShape).background(cs.secondaryContainer), contentAlignment = Alignment.Center) {
                                Icon(Icons.Rounded.CloudOff, null, Modifier.size(44.dp), tint = cs.onSecondaryContainer)
                            }
                            Text("Нет интернета", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
                            Text("Лента, чаты и музыка загрузятся, когда появится сеть — приложение откроется само. А пока можно поиграть или посчитать:",
                                style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp, start = 8.dp, end = 8.dp))
                        }
                    }
                }
                composable("games/2048") { Game2048Screen() }
                composable("games/ttt") { TttScreen() }
                composable("games/mines") { MinesScreen() }
                composable("calc") { CalcScreen() }
                composable("timer") { TimerScreen() }
                composable("dice") { DiceScreen() }
            }
        }
    }
}

/** Плашка над нижней панелью, когда пропала сеть внутри приложения */
@Composable
fun OfflineStrip(modifier: Modifier = Modifier, onTools: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    Row(modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(cs.inverseSurface).padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Rounded.WifiOff, null, Modifier.size(18.dp), tint = cs.inverseOnSurface)
        Text("  Нет интернета — показано сохранённое", style = MaterialTheme.typography.bodySmall, color = cs.inverseOnSurface, modifier = Modifier.weight(1f))
        TextButton(onTools, colors = ButtonDefaults.textButtonColors(contentColor = cs.inversePrimary)) { Text("Без сети") }
    }
}
