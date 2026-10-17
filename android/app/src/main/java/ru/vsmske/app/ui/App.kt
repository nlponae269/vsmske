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

/** Отступы, чтобы содержимое уходило под стеклянные шапку и док, но не пряталось за ними навсегда */
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
        Box(Modifier.fillMaxSize().background(Vs.bg)) {
            when (phase) {
                Session.Phase.Loading -> Box(Modifier.fillMaxSize()) { Orbs(); Box(Modifier.align(Alignment.Center)) { Logo() } }
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
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(11.dp)).background(Vs.grad), contentAlignment = Alignment.Center) {
            Text("вс", style = MaterialTheme.typography.labelLarge.copy(fontFamily = Unbounded), color = Color.White)
        }
        Spacer(Modifier.width(10.dp))
        Text("VСмске", style = MaterialTheme.typography.titleLarge.copy(brush = Vs.gradText))
    }
}

@Composable
private fun Main(openPlayer: MutableState<Boolean>) {
    val nav = rememberNavController()
    val backdrop = rememberBackdrop()
    val header = remember { mutableStateOf<HeaderSpec?>(null) }
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val toast: (String) -> Unit = { m -> scope.launch { snack.currentSnackbarHostState(m) } }
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val me = Fb.uid
    val isTab = route in TABS && (route != "profile/{id}" || entry?.arguments?.getString("id") == me)
    val inChat = route == "chat/{key}"
    val ps by MusicPlayer.state.collectAsState()
    val hasPlayer = ps.track != null

    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val pad = PaddingValues(
        top = top + 80.dp,
        bottom = if (inChat) 0.dp else bottom + (if (isTab) 96.dp else 16.dp) + (if (hasPlayer) 74.dp else 0.dp),
    )
    LaunchedEffect(route) { if (route != null && isTab) header.value = null }

    CompositionLocalProvider(LocalNav provides nav, LocalPad provides pad, LocalHeader provides header, LocalToast provides toast) {
        Box(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().glassSource(backdrop)) {
                Orbs()
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
            }

            TopBar(backdrop, isTab, header.value, Modifier.align(Alignment.TopCenter).padding(top = top + 8.dp, start = 12.dp, end = 12.dp))

            Column(
                Modifier.align(Alignment.BottomCenter).padding(bottom = bottom + 10.dp, start = 12.dp, end = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AnimatedVisibility(hasPlayer && !inChat, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                    MiniPlayer(backdrop) { openPlayer.value = true }
                }
                AnimatedVisibility(isTab, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                    Dock(backdrop, route, entry?.arguments?.getString("id"), nav)
                }
            }

            SnackbarHost(snack, Modifier.align(Alignment.TopCenter).padding(top = top + 84.dp))

            AnimatedVisibility(openPlayer.value && hasPlayer, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                FullPlayer(onClose = { openPlayer.value = false })
            }
            if (openPlayer.value) BackHandler { openPlayer.value = false }
        }
    }
}

private suspend fun SnackbarHostState.currentSnackbarHostState(m: String) { currentSnackbarData?.dismiss(); showSnackbar(m) }

@Composable
private fun TopBar(backdrop: Backdrop, isTab: Boolean, h: HeaderSpec?, modifier: Modifier) {
    val nav = LocalNav.current
    val unseen = Session.notifs.collectAsState().value.let { Session.unseenNotifs() }
    GlassPanel(backdrop, modifier.fillMaxWidth().height(60.dp), radius = 24.dp) {
        Row(Modifier.fillMaxSize().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (!isTab) {
                IconBtn(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") { nav.popBackStack() }
                if (h?.user != null) { Avatar(h.user, 36.dp, h.user.online); Spacer(Modifier.width(10.dp)) }
                Column(Modifier.weight(1f).then(if (h?.onClick != null) Modifier.clickable { h.onClick.invoke() } else Modifier)) {
                    Text(h?.title ?: "", style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (!h?.subtitle.isNullOrEmpty()) Text(h!!.subtitle, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
            } else {
                Spacer(Modifier.width(6.dp))
                Box(Modifier.weight(1f)) { Logo() }
                IconBtn(Icons.Rounded.Search, "Поиск людей") { nav.navigate("people") }
                Box {
                    IconBtn(Icons.Rounded.Notifications, "Сигналы") { nav.navigate("notifs") }
                    Badge(unseen, Modifier.align(Alignment.TopEnd))
                }
            }
        }
    }
}

@Composable
private fun Dock(backdrop: Backdrop, route: String?, arg: String?, nav: NavHostController) {
    val me = Fb.uid
    val unread = Session.chats.collectAsState().value.count { it.unread(me) }
    val reqs = Session.incoming.collectAsState().value.size
    data class Item(val r: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector, val badge: Int = 0)
    val items = listOf(
        Item("feed", "Лента", Icons.Rounded.ViewAgenda), Item("chats", "Чаты", Icons.Rounded.ChatBubble, unread),
        Item("friends", "Друзья", Icons.Rounded.Group, reqs), Item("music", "Музыка", Icons.Rounded.MusicNote),
        Item("profile/$me", "Профиль", Icons.Rounded.Person),
    )
    GlassPanel(backdrop, Modifier.fillMaxWidth().height(70.dp), radius = 28.dp) {
        Row(Modifier.fillMaxSize().padding(6.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
            items.forEach { it ->
                val on = if (it.r.startsWith("profile/")) route == "profile/{id}" && arg == me else route == it.r
                val scale by animateFloatAsState(if (on) 1.08f else 1f, label = "dock")
                Box(
                    Modifier.weight(1f).height(58.dp).clip(RoundedCornerShape(20.dp))
                        .background(if (on) Vs.grad else Brush.linearGradient(listOf(Color.Transparent, Color.Transparent)))
                        .clickable {
                            if (!on) nav.navigate(it.r) {
                                popUpTo("feed") { saveState = true }
                                launchSingleTop = true; restoreState = true
                            }
                        }.graphicsLayer { scaleX = scale; scaleY = scale },
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(it.icon, it.label, tint = if (on) Color.White else Vs.fg.copy(alpha = 0.8f), modifier = Modifier.size(24.dp))
                        Text(it.label, style = MaterialTheme.typography.labelSmall, color = if (on) Color.White else Vs.muted, maxLines = 1)
                    }
                    Badge(it.badge, Modifier.align(Alignment.TopEnd).padding(top = 4.dp, end = 6.dp))
                }
            }
        }
    }
}

@Composable
private fun MiniPlayer(backdrop: Backdrop, onOpen: () -> Unit) {
    val s by MusicPlayer.state.collectAsState()
    val t = s.track ?: return
    GlassPanel(backdrop, Modifier.fillMaxWidth().height(64.dp).clickable(onClick = onOpen), radius = 22.dp) {
        val pct = if (s.duration > 0) s.position.toFloat() / s.duration else 0f
        Box(Modifier.fillMaxWidth(pct.coerceIn(0f, 1f)).height(64.dp).background(Color(0x22A78BFA)))
        Row(Modifier.fillMaxSize().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(46.dp).clip(RoundedCornerShape(12.dp)).background(Vs.grad), contentAlignment = Alignment.Center) {
                if (t.cover.isNotEmpty()) DbImage(t.cover, Modifier.fillMaxSize()) else Icon(Icons.Rounded.MusicNote, null, tint = Color.White)
            }
            Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (s.loading) CircularProgressIndicator(Modifier.size(22.dp), color = Vs.accent, strokeWidth = 2.dp)
            else IconBtn(if (s.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Играть") { MusicPlayer.toggle() }
            IconBtn(Icons.Rounded.SkipNext, "Следующий") { MusicPlayer.next() }
            IconBtn(Icons.Rounded.Close, "Закрыть", tint = Vs.muted) { MusicPlayer.close() }
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
