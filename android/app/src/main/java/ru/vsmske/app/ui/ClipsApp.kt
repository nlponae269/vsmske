package ru.vsmske.app.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.People
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Net
import ru.vsmske.app.data.Store

/*
 * «ВС Клипы» — отдельное приложение в духе ТикТока (сборка clips из того же кода, что и VСмске).
 * Та же база и тот же аккаунт: клипы — это videos до 90 секунд, лайки и комментарии — те же, что на сайте.
 * Внизу: Главная, Друзья, «＋», Входящие, Профиль. На лентах панель чёрная, как в ТикТоке.
 */

val ClipPurple = Color(0xFF9D4EDD)
val ClipCyan = Color(0xFF25F4EE)
val ClipPink = Color(0xFFFE2C55)

private val ClipsLight = lightColorScheme(
    primary = ClipPurple, onPrimary = Color.White, primaryContainer = Color(0xFFF1E4FF), onPrimaryContainer = Color(0xFF2E0057),
    secondary = Color(0xFF5E5E66), secondaryContainer = Color(0xFFF1F1F2), onSecondaryContainer = Color(0xFF161823),
    tertiary = ClipPink, tertiaryContainer = Color(0xFFFFDDE3), onTertiaryContainer = Color(0xFF3E0011),
    background = Color.White, surface = Color.White, onSurface = Color(0xFF161823), onSurfaceVariant = Color(0xFF75767D),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF8F8F8), surfaceContainer = Color(0xFFF4F4F5),
    surfaceContainerHigh = Color(0xFFF1F1F2), surfaceContainerHighest = Color(0xFFEAEAEB),
    outline = Color(0xFFB4B5B9), outlineVariant = Color(0xFFE3E3E4),
)
private val ClipsDark = darkColorScheme(
    primary = Color(0xFFB57BEE), onPrimary = Color.White, primaryContainer = Color(0xFF4A1C7A), onPrimaryContainer = Color(0xFFF1E4FF),
    secondary = Color(0xFFB0B0B8), secondaryContainer = Color(0xFF2A2A2E), onSecondaryContainer = Color(0xFFEDEDEF),
    tertiary = ClipPink, tertiaryContainer = Color(0xFF5C1022), onTertiaryContainer = Color(0xFFFFDDE3),
    background = Color(0xFF121212), surface = Color(0xFF121212), onSurface = Color(0xFFEDEDEF), onSurfaceVariant = Color(0xFF9A9AA2),
    surfaceContainerLowest = Color(0xFF0B0B0B), surfaceContainerLow = Color(0xFF181818), surfaceContainer = Color(0xFF1E1E1E),
    surfaceContainerHigh = Color(0xFF252527), surfaceContainerHighest = Color(0xFF2E2E31),
    outline = Color(0xFF5B5B61), outlineVariant = Color(0xFF333336),
)

@Composable
fun ClipsTheme(content: @Composable () -> Unit) {
    val mode by ThemePref.mode.collectAsState()
    val dark = when (mode) { "light" -> false; "dark" -> true; else -> isSystemInDarkTheme() }
    val view = androidx.compose.ui.platform.LocalView.current
    if (!view.isInEditMode) SideEffect {
        val w = (view.context as? android.app.Activity)?.window ?: return@SideEffect
        androidx.core.view.WindowCompat.getInsetsController(w, view).apply { isAppearanceLightStatusBars = !dark; isAppearanceLightNavigationBars = !dark }
    }
    MaterialTheme(colorScheme = if (dark) ClipsDark else ClipsLight, typography = VsType, shapes = VsShapes, content = content)
}

/** Корень «ВС Клипов»: вход тем же аккаунтом, без сети — игры (как в VСмске) */
@Composable
fun ClipsApp(startClip: MutableState<String?>) {
    ClipsTheme {
        val phase by Store.phase.collectAsState()
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
            when (phase) {
                Store.Phase.Loading, Store.Phase.Offline -> {
                    val online by Net.online.collectAsState()
                    var waited by remember { mutableStateOf(false) }
                    LaunchedEffect(phase, online) { waited = false; kotlinx.coroutines.delay(if (online) 8000 else 1500); waited = true }
                    if (waited && (!online || phase == Store.Phase.Offline)) OfflineScreen() else ClipsSplash()
                }
                Store.Phase.SignedOut -> { val online by Net.online.collectAsState(); if (online) AuthScreen() else OfflineScreen() }
                Store.Phase.NeedProfile -> OnboardScreen()
                Store.Phase.Ready -> ClipsMain(startClip)
            }
        }
    }
}

@Composable
private fun ClipsSplash() = Box(Modifier.fillMaxSize().background(Color(0xFF0B0B0F)), contentAlignment = Alignment.Center) {
    DarkSystemBars()
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        ClipsLogo(88.dp)
        Text("ВС Клипы", color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 18.dp))
    }
}

/** Значок: кнопка «играть» с голубой и розовой «тенью» */
@Composable
fun ClipsLogo(size: androidx.compose.ui.unit.Dp) = Box(Modifier.size(size), contentAlignment = Alignment.Center) {
    val s = size.value
    Icon(Icons.Rounded.PlayArrow, null, tint = ClipCyan, modifier = Modifier.size(size).offset((-s / 30).dp, (-s / 30).dp))
    Icon(Icons.Rounded.PlayArrow, null, tint = ClipPink, modifier = Modifier.size(size).offset((s / 30).dp, (s / 30).dp))
    Icon(Icons.Rounded.PlayArrow, null, tint = Color.White, modifier = Modifier.size(size))
}

private val CLIP_TABS = setOf("home", "friends", "inbox", "me")

@Composable
private fun ClipsMain(startClip: MutableState<String?>) {
    val nav = rememberNavController()
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val toast: (String) -> Unit = { m -> scope.launch { snack.currentSnackbarData?.dismiss(); snack.showSnackbar(m) } }
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val dark = route == "home" || route == "friends"
    // клип из VСмске («Открыть ВС Клипы») или по ссылке
    LaunchedEffect(startClip.value) { startClip.value?.let { id -> startClip.value = null; nav.navigate("clip/${id.ifEmpty { "-" }}") } }
    CompositionLocalProvider(LocalNav provides nav, LocalToast provides toast) {
        Scaffold(
            contentWindowInsets = WindowInsets(0),
            snackbarHost = { SnackbarHost(snack, Modifier.padding(bottom = 8.dp)) },
            bottomBar = { if (route in CLIP_TABS) ClipsBottomBar(route, dark) },
        ) { pad ->
            NavHost(nav, "home", Modifier.padding(bottom = pad.calculateBottomPadding()).fillMaxSize()) {
                composable("home") { ClipsFeedTab(friends = false) }
                composable("friends") { ClipsFeedTab(friends = true) }
                composable("inbox") { ClipsInbox() }
                composable("me") { ClipsProfile(Store.uid) }
                composable("profile/{id}", listOf(navArgument("id") { type = NavType.StringType })) { ClipsProfile(it.arguments?.getString("id") ?: Store.uid) }
                composable("clip/{id}") { ClipLinkScreen((it.arguments?.getString("id") ?: "").takeIf { s -> s != "-" } ?: "") }
                composable("watch/{i}") { ClipsWatch(it.arguments?.getString("i")?.toIntOrNull() ?: 0) }
                composable("upload?sound={sound}", listOf(navArgument("sound") { type = NavType.StringType; defaultValue = "" })) {
                    ClipsUpload(it.arguments?.getString("sound") ?: "")
                }
                composable("sound/{ref}", listOf(navArgument("ref") { type = NavType.StringType })) { ClipsSoundScreen(it.arguments?.getString("ref") ?: "") }
                composable("requests") { ClipsRequests() }
                composable("activity") { ClipsActivity() }
                composable("search") { ClipsSearch() }
                composable("edit") { EditProfileScreen() }
                composable("chat/{key}", listOf(navArgument("key") { type = NavType.StringType })) { ChatScreen(it.arguments?.getString("key") ?: "", calls = false) }
            }
        }
    }
}

@Composable
private fun ClipsBottomBar(route: String?, dark: Boolean) {
    val nav = LocalNav.current
    val chats by Store.chats.collectAsState()
    val incoming by Store.incoming.collectAsState()
    Store.notifs.collectAsState().value
    val me = Store.uid
    val unread = chats.count { it.lastFrom != me && it.lastAt > (it.read[me] ?: 0L) } + incoming.size + Store.unseenNotifs()
    val bg by animateColorAsState(if (dark) Color.Black else MaterialTheme.colorScheme.surface, label = "bb")
    val fg = if (dark) Color.White else MaterialTheme.colorScheme.onSurface
    Column(Modifier.background(bg)) {
        if (!dark) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, thickness = 0.5.dp)
        Row(Modifier.fillMaxWidth().navigationBarsPadding().height(58.dp), verticalAlignment = Alignment.CenterVertically) {
            fun go(r: String) = nav.navigate(r) { popUpTo("home") { saveState = true }; launchSingleTop = true; restoreState = true }
            BarItem("Главная", Icons.Rounded.Home, Icons.Outlined.Home, route == "home", fg) { go("home") }
            BarItem("Друзья", Icons.Rounded.People, Icons.Outlined.People, route == "friends", fg) { go("friends") }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { PlusButton(dark) { nav.navigate("upload") } }
            BarItem("Входящие", Icons.Rounded.ChatBubble, Icons.Outlined.ChatBubbleOutline, route == "inbox", fg, unread) { go("inbox") }
            BarItem("Профиль", Icons.Rounded.Person, Icons.Outlined.Person, route == "me", fg) { go("me") }
        }
    }
}

@Composable
private fun RowScope.BarItem(label: String, on: ImageVector, off: ImageVector, sel: Boolean, fg: Color, badge: Int = 0, onClick: () -> Unit) {
    Column(Modifier.weight(1f).fillMaxHeight().clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        BadgedBox({ if (badge > 0) Badge(containerColor = ClipPink) { Text(if (badge > 99) "99+" else "$badge") } }) {
            Icon(if (sel) on else off, label, tint = if (sel) fg else fg.copy(alpha = 0.6f), modifier = Modifier.size(26.dp))
        }
        Text(label, fontSize = 10.sp, fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium, color = if (sel) fg else fg.copy(alpha = 0.6f))
    }
}

/** «＋» как в ТикТоке: белая (на ленте) или чёрная плашка с голубым и розовым краем */
@Composable
private fun PlusButton(dark: Boolean, onClick: () -> Unit) {
    Box(Modifier.size(48.dp, 32.dp).clickable(onClick = onClick)) {
        Box(Modifier.matchParentSize().padding(end = 6.dp).clip(RoundedCornerShape(9.dp)).background(ClipCyan))
        Box(Modifier.matchParentSize().padding(start = 6.dp).clip(RoundedCornerShape(9.dp)).background(ClipPink))
        Box(Modifier.matchParentSize().padding(horizontal = 3.dp).clip(RoundedCornerShape(8.dp)).background(if (dark) Color.White else Color(0xFF161823)),
            contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.Add, "Новый клип", tint = if (dark) Color.Black else Color.White, modifier = Modifier.size(22.dp))
        }
    }
}

/** Круглая иконка раздела во «Входящих» */
@Composable
fun RoundIcon(icon: ImageVector, bg: Color, size: androidx.compose.ui.unit.Dp = 56.dp) =
    Box(Modifier.size(size).clip(androidx.compose.foundation.shape.CircleShape).background(bg), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(size * 0.5f))
    }

/** Серая кнопка профиля (Изменить, Сообщение…) */
@Composable
fun GrayButton(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) =
    Box(modifier.height(44.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).clickable(onClick = onClick),
        contentAlignment = Alignment.Center) { Text(text, style = MaterialTheme.typography.titleSmall, maxLines = 1) }

@Composable
fun PurpleButton(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) =
    Box(modifier.height(44.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.primary).clickable(onClick = onClick),
        contentAlignment = Alignment.Center) { Text(text, style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 1) }

