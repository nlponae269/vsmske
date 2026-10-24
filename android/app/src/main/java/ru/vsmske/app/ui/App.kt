package ru.vsmske.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.ViewAgenda
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Surface
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Fb
import ru.vsmske.app.data.Session
import ru.vsmske.app.data.User
import ru.vsmske.app.music.MusicPlayer
import ru.vsmske.app.ui.screens.AuthScreen
import ru.vsmske.app.ui.screens.ChatScreen
import ru.vsmske.app.ui.screens.ChatsScreen
import ru.vsmske.app.ui.screens.EditProfileScreen
import ru.vsmske.app.ui.screens.FeedScreen
import ru.vsmske.app.ui.screens.FriendsScreen
import ru.vsmske.app.ui.screens.FullPlayer
import ru.vsmske.app.ui.screens.MusicScreen
import ru.vsmske.app.ui.screens.NotifsScreen
import ru.vsmske.app.ui.screens.OnboardScreen
import ru.vsmske.app.ui.screens.PeopleScreen
import ru.vsmske.app.ui.screens.PostScreen
import ru.vsmske.app.ui.screens.ProfileScreen

/** Отступы, чтобы содержимое не пряталось под верхней панелью, нижней навигацией и мини-плеером */
val LocalPad = compositionLocalOf { PaddingValues() }
val LocalNav = staticCompositionLocalOf<NavHostController> { error("нет навигации") }

data class HeaderSpec(val title: String, val subtitle: String = "", val user: User? = null, val onClick: (() -> Unit)? = null)

val LocalHeader = staticCompositionLocalOf<MutableState<HeaderSpec?>> { mutableStateOf(null) }
val LocalToast = staticCompositionLocalOf<(String) -> Unit> { {} }

/** Экран сообщает, что написать в шапке */
@Composable
fun Header(spec: HeaderSpec) {
    val h = LocalHeader.current
    SideEffect { h.value = spec }
}

fun NavHostController.openProfile(id: String) = navigate("profile/$id")

private val TABS = listOf("feed", "chats", "friends", "music", "profile/{id}")

@Composable
fun VsRoot(openPlayer: MutableState<Boolean>) {
    VsTheme {
        val phase by Session.phase.collectAsState()
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
            when (phase) {
                Session.Phase.Loading -> Box(Modifier.align(Alignment.Center)) { Logo() }
                Session.Phase.SignedOut -> AuthScreen()
                Session.Phase.NeedProfile -> OnboardScreen()
                Session.Phase.Ready -> Main(openPlayer)
            }
        }
    }
}

@Composable
fun Logo() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
            Text("вс", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.onPrimary)
        }
        Spacer(Modifier.width(12.dp))
        Text("VСмске", style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
private fun Main(openPlayer: MutableState<Boolean>) {
    val nav = rememberNavController()
    val header = remember { mutableStateOf<HeaderSpec?>(null) }
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val toast: (String) -> Unit = { m -> scope.launch { snack.currentSnackbarHostState(m) } }
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val me = Fb.uid
    val isTab = route in TABS && (route != "profile/{id}" || entry?.arguments?.getString("id") == me)
    val inChat = route == "chat/{key}" || route == "post/{id}"   // экраны с полем ввода внизу — мини-плеер прячем
    val ps by MusicPlayer.state.collectAsState()
    val hasPlayer = ps.track != null

    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    // верхняя панель 64 dp, нижняя навигация 80 dp, мини-плеер 64 dp + отступ
    val pad = PaddingValues(
        top = top + 64.dp,
        bottom = if (inChat) 0.dp else bottom + (if (isTab) 80.dp else 0.dp) + (if (hasPlayer) 76.dp else 12.dp),
    )
    LaunchedEffect(route) { if (route != null && isTab) header.value = null }

    CompositionLocalProvider(LocalNav provides nav, LocalPad provides pad, LocalHeader provides header, LocalToast provides toast) {
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
            NavHost(nav, startDestination = "feed") {
                composable("feed") { FeedScreen() }
                composable("chats") { ChatsScreen() }
                composable("friends") { FriendsScreen() }
                composable("music") { MusicScreen(onOpenPlayer = { openPlayer.value = true }) }
                composable("people") { PeopleScreen() }
                composable("notifs") { NotifsScreen() }
                composable("edit") { EditProfileScreen() }
                composable("profile/{id}", listOf(navArgument("id") { type = NavType.StringType })) { ProfileScreen(it.arguments?.getString("id") ?: me) }
                composable("chat/{key}", listOf(navArgument("key") { type = NavType.StringType })) { ChatScreen(it.arguments?.getString("key") ?: "") }
                composable("post/{id}", listOf(navArgument("id") { type = NavType.StringType })) { PostScreen(it.arguments?.getString("id") ?: "") }
            }

            TopBar(isTab, header.value, Modifier.align(Alignment.TopCenter))

            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth()) {
                AnimatedVisibility(hasPlayer && !inChat, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                    MiniPlayer(Modifier.padding(start = 8.dp, end = 8.dp, bottom = if (isTab) 8.dp else bottom + 8.dp)) { openPlayer.value = true }
                }
                AnimatedVisibility(isTab, enter = slideInVertically { it }, exit = slideOutVertically { it }) {
                    BottomNav(route, entry?.arguments?.getString("id"), nav)
                }
            }

            SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(bottom = pad.calculateBottomPadding() + 8.dp))

            AnimatedVisibility(openPlayer.value && hasPlayer, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                FullPlayer(onClose = { openPlayer.value = false })
            }
            if (openPlayer.value) BackHandler { openPlayer.value = false }
        }
    }
}

private suspend fun SnackbarHostState.currentSnackbarHostState(m: String) { currentSnackbarData?.dismiss(); showSnackbar(m) }

/** Верхняя панель Material 3: на вкладках — логотип, поиск и сигналы; внутри — «назад» и заголовок */
@Composable
private fun TopBar(isTab: Boolean, h: HeaderSpec?, modifier: Modifier) {
    val nav = LocalNav.current
    val unseen = Session.notifs.collectAsState().value.let { Session.unseenNotifs() }
    Surface(modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().height(64.dp).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (!isTab) {
                IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") }
                if (h?.user != null) { Avatar(h.user, 40.dp, h.user.online); Spacer(Modifier.width(12.dp)) }
                Column(Modifier.weight(1f).then(if (h?.onClick != null) Modifier.clickable { h.onClick.invoke() } else Modifier)) {
                    Text(h?.title ?: "", style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (!h?.subtitle.isNullOrEmpty()) Text(h!!.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
            } else {
                Spacer(Modifier.width(12.dp))
                Box(Modifier.weight(1f)) { Logo() }
                IconButton({ nav.navigate("people") }) { Icon(Icons.Rounded.Search, "Поиск людей") }
                IconButton({ nav.navigate("notifs") }) {
                    BadgedBox(badge = { if (unseen > 0) Badge { Text(if (unseen > 99) "99+" else unseen.toString()) } }) { Icon(Icons.Outlined.Notifications, "Сигналы") }
                }
            }
        }
    }
}

/** Нижняя навигация Material 3 — «пилюля» под значком выбранного раздела */
@Composable
private fun BottomNav(route: String?, arg: String?, nav: NavHostController) {
    val me = Fb.uid
    val unread = Session.chats.collectAsState().value.count { it.unread(me) }
    val reqs = Session.incoming.collectAsState().value.size
    data class Item(val r: String, val label: String, val on: ImageVector, val off: ImageVector, val badge: Int = 0)
    val items = listOf(
        Item("feed", "Лента", Icons.Rounded.Home, Icons.Outlined.Home), Item("chats", "Чаты", Icons.Rounded.ChatBubble, Icons.Outlined.ChatBubbleOutline, unread),
        Item("music", "Музыка", Icons.Rounded.MusicNote, Icons.Outlined.MusicNote), Item("friends", "Друзья", Icons.Rounded.Group, Icons.Outlined.Group, reqs),
        Item("profile/$me", "Профиль", Icons.Rounded.AccountCircle, Icons.Outlined.AccountCircle),
    )
    NavigationBar {
        items.forEach { it ->
            val on = if (it.r.startsWith("profile/")) route == "profile/{id}" && arg == me else route == it.r
            NavigationBarItem(
                selected = on,
                onClick = {
                    if (!on) nav.navigate(it.r) {
                        popUpTo("feed") { saveState = true }
                        launchSingleTop = true; restoreState = true
                    }
                },
                icon = { BadgedBox(badge = { if (it.badge > 0) Badge { Text(if (it.badge > 99) "99+" else it.badge.toString()) } }) { Icon(if (on) it.on else it.off, it.label) } },
                label = { Text(it.label, maxLines = 1) },
            )
        }
    }
}

/** Мини-плеер — карточка с обложкой и кнопками, как медиаплеер в шторке Android */
@Composable
private fun MiniPlayer(modifier: Modifier = Modifier, onOpen: () -> Unit) {
    val s by MusicPlayer.state.collectAsState()
    val t = s.track ?: return
    val cs = MaterialTheme.colorScheme
    Surface(onClick = onOpen, modifier = modifier.fillMaxWidth().height(64.dp), shape = RoundedCornerShape(16.dp), color = cs.secondaryContainer) {
        Box {
            Row(Modifier.fillMaxSize().padding(start = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(48.dp).clip(RoundedCornerShape(10.dp)).background(cs.primaryContainer), contentAlignment = Alignment.Center) {
                    if (t.cover.isNotEmpty()) DbImage(t.cover, Modifier.fillMaxSize()) else Icon(Icons.Rounded.MusicNote, null, tint = cs.onPrimaryContainer)
                }
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = cs.onSecondaryContainer)
                    Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = cs.onSecondaryContainer.copy(alpha = 0.75f))
                }
                if (s.loading) CircularProgressIndicator(Modifier.padding(horizontal = 12.dp).size(22.dp), strokeWidth = 2.dp)
                else IconButton({ MusicPlayer.toggle() }) { Icon(if (s.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Играть", tint = cs.onSecondaryContainer) }
                IconButton({ MusicPlayer.next() }) { Icon(Icons.Rounded.SkipNext, "Следующий", tint = cs.onSecondaryContainer) }
            }
            val pct = if (s.duration > 0) s.position.toFloat() / s.duration else 0f
            LinearProgressIndicator({ pct.coerceIn(0f, 1f) }, Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 16.dp).height(3.dp),
                color = cs.primary, trackColor = cs.primary.copy(alpha = 0.18f))
        }
    }
}

fun CoroutineScope.safe(toast: (String) -> Unit, block: suspend () -> Unit) = launch {
    try { block() } catch (e: Exception) { toast(errText(e)) }
}

fun errText(e: Throwable): String {
    val m = e.message ?: ""
    return when {
        "PERMISSION_DENIED" in m || "permission" in m.lowercase() -> "Нет доступа (возможно, ограничения приватности)"
        "UNAVAILABLE" in m || "network" in m.lowercase() -> "Нет связи с сервером. Проверьте интернет"
        "password is invalid" in m || "INVALID_LOGIN_CREDENTIALS" in m || "credential" in m.lowercase() -> "Неверная почта или пароль"
        "no user record" in m -> "Такого аккаунта нет"
        "email address is already" in m -> "Эта почта уже зарегистрирована"
        "badly formatted" in m -> "Проверьте адрес почты"
        "at least 6" in m || "WEAK_PASSWORD" in m -> "Пароль — минимум 6 символов"
        m.isNotEmpty() && m.length < 120 && m.any { it in 'а'..'я' } -> m
        else -> "Что-то пошло не так. Попробуйте ещё раз"
    }
}
