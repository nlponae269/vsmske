package ru.vsmske.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.SmartDisplay
import androidx.compose.material.icons.rounded.Apps
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SmartDisplay
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kotlinx.coroutines.launch
import ru.vsmske.app.data.Store
import ru.vsmske.app.music.Music

/** Планшеты и широкие экраны: боковая панель вместо нижней и ограниченная ширина содержимого */
private val TABLET_MIN = 600.dp
private val CONTENT_MAX = 880.dp

@Composable
fun Root(openPlayer: MutableState<Boolean>) {
    VsTheme {
        val phase by Store.phase.collectAsState()
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
            when (phase) {
                Store.Phase.Loading, Store.Phase.Offline -> {
                    // без сети профиль может не прийти никогда: через пару секунд показываем то, что работает без интернета
                    val online by ru.vsmske.app.data.Net.online.collectAsState()
                    var waited by remember { androidx.compose.runtime.mutableStateOf(false) }
                    androidx.compose.runtime.LaunchedEffect(phase, online) { waited = false; kotlinx.coroutines.delay(if (online) 8000 else 1500); waited = true }
                    if (waited && (!online || phase == Store.Phase.Offline)) OfflineScreen() else Loading(Modifier.align(Alignment.Center))
                }
                Store.Phase.SignedOut -> {
                    val online by ru.vsmske.app.data.Net.online.collectAsState()
                    if (online) AuthScreen() else OfflineScreen()   // войти без сети нельзя — показываем то, что работает
                }
                Store.Phase.NeedProfile -> OnboardScreen()
                Store.Phase.Ready -> Main(openPlayer)
            }
        }
    }
}

private val TABS = setOf("feed", "video", "music", "chats", "menu")
/** Экраны на весь экран и на планшете (без колонки по центру) */
private val FULL = setOf("clips/{id}", "live/{id}")

@Composable
private fun Main(openPlayer: MutableState<Boolean>) {
    val nav = rememberNavController()
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val toast: (String) -> Unit = { m -> scope.launch { snack.currentSnackbarData?.dismiss(); snack.showSnackbar(m) } }
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val isTab = route in TABS
    val withInput = route == "chat/{key}" || route == "post/{id}" || route == "clips/{id}" || route == "live/{id}" || route == "video/{id}"   // там своё внизу — мини-плеер прячем
    val ms by Music.state.collectAsState()
    val hasPlayer = ms.track != null
    val online by ru.vsmske.app.data.Net.online.collectAsState()

    CompositionLocalProvider(LocalNav provides nav, LocalToast provides toast) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val tablet = maxWidth >= TABLET_MIN
            Row(Modifier.fillMaxSize()) {
                if (tablet && isTab) SideRail(route, nav)
                Scaffold(
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    contentWindowInsets = WindowInsets(0),
                    snackbarHost = { SnackbarHost(snack) },
                    bottomBar = {
                        Column {
                            AnimatedVisibility(!online && isTab, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                                OfflineStrip(Modifier.padding(horizontal = 8.dp, vertical = 4.dp).then(if (!hasPlayer && tablet) Modifier.navigationBarsPadding() else Modifier)) { nav.navigate("offline") }
                            }
                            AnimatedVisibility(hasPlayer && !withInput, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                                MiniPlayer(Modifier.padding(horizontal = 8.dp, vertical = 6.dp).then(if (isTab && !tablet) Modifier else Modifier.navigationBarsPadding())) { openPlayer.value = true }
                            }
                            if (isTab && !tablet) BottomNav(route, nav)
                        }
                    },
                ) { pad ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                        NavHost(nav, startDestination = "feed",
                            modifier = Modifier.fillMaxSize().padding(bottom = pad.calculateBottomPadding()).widthIn(max = if (tablet && route !in FULL) CONTENT_MAX else Dp.Unspecified)) {
                            val open = { openPlayer.value = true }
                            composable("feed") { FeedScreen() }
                            composable("video") { VideoHome() }
                            composable("music") { MusicScreen(onOpenPlayer = open) }
                            composable("chats") { ChatsScreen() }
                            composable("menu") { MenuScreen() }
                            composable("friends") { FriendsScreen() }
                            composable("me") { ProfileScreen(Store.uid) }
                            composable("video/{id}") { WatchScreen(it.arguments?.getString("id") ?: "") }
                            composable("videos/{uid}") { UserVideosScreen(it.arguments?.getString("uid") ?: "") }
                            composable("clips/{id}") { ClipsScreen((it.arguments?.getString("id") ?: "").takeIf { s -> s != "-" } ?: "") }
                            composable("albums/{uid}") { AlbumsScreen(it.arguments?.getString("uid") ?: Store.uid) }
                            composable("album/{id}") { AlbumScreen(it.arguments?.getString("id") ?: "") }
                            composable("disk") { DiskScreen() }
                            composable("live") { LiveListScreen() }
                            composable("live/{id}") { LiveRoomScreen(it.arguments?.getString("id") ?: "") }
                            composable("music/playlists") { PlaylistsScreen() }
                            composable("music/liked") { TrackListScreen("liked", "", open) }
                            composable("music/stream") { TrackListScreen("stream", "", open) }
                            composable("music/user/{uid}") { TrackListScreen("user", it.arguments?.getString("uid") ?: "", open) }
                            composable("music/pl/{id}") { TrackListScreen("pl", it.arguments?.getString("id") ?: "", open) }
                            composable("notifs") { NotifsScreen() }
                            composable("tag/{tag}") { TagScreen(it.arguments?.getString("tag") ?: "") }
                            composable("search") { SearchScreen(onOpenPlayer = open) }
                            composable("saved") { SavedScreen() }
                            composable("clubs") { ClubsScreen() }
                            composable("notes") { NotesScreen() }
                            composable("weather") { WeatherScreen() }
                            composable("rates") { RatesScreen() }
                            composable("radio") { RadioScreen() }
                            composable("market") { MarketScreen() }
                            composable("answers") { AnswersScreen() }
                            composable("games/2048") { Game2048Screen() }
                            composable("calc") { CalcScreen() }
                            composable("offline") { OfflineToolsScreen() }
                            composable("guests") { GuestsScreen() }
                            composable("timer") { TimerScreen() }
                            composable("dice") { DiceScreen() }
                            composable("q/{id}") { QuestionScreen(it.arguments?.getString("id") ?: "") }
                            composable("mail") { MailScreen() }
                            composable("mail/{id}") { MailReadScreen(it.arguments?.getString("id") ?: "") }
                            composable("events") { EventsScreen() }
                            composable("event/{id}") { EventScreen(it.arguments?.getString("id") ?: "") }
                            composable("lot/{id}") { LotScreen(it.arguments?.getString("id") ?: "") }
                            composable("club/{id}") { ClubScreen(it.arguments?.getString("id") ?: "") }
                            composable("edit") { EditProfileScreen() }
                            composable("profile/{id}", listOf(navArgument("id") { type = NavType.StringType })) { ProfileScreen(it.arguments?.getString("id") ?: Store.uid) }
                            composable("chat/{key}", listOf(navArgument("key") { type = NavType.StringType })) { ChatScreen(it.arguments?.getString("key") ?: "") }
                            composable("post/{id}", listOf(navArgument("id") { type = NavType.StringType })) { PostScreen(it.arguments?.getString("id") ?: "") }
                        }
                    }
                }
            }
        }
        if (!(openPlayer.value && hasPlayer)) LiveBar(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 6.dp).wrapContentWidth(Alignment.CenterHorizontally), route)
        AnimatedVisibility(openPlayer.value && hasPlayer, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
            PlayerScreen(onClose = { openPlayer.value = false })
        }
        if (openPlayer.value && hasPlayer) BackHandler { openPlayer.value = false }
        if (!(openPlayer.value && hasPlayer)) WhatsNew()
        CallOverlay()
    }
}

fun NavHostController.openProfile(id: String) = if (id == ru.vsmske.app.data.Fire.uid) navigate("me") { launchSingleTop = true } else navigate("profile/$id")
fun NavHostController.openTab(r: String) = navigate(r) { popUpTo("feed") { saveState = true }; launchSingleTop = true; restoreState = true }

private class NavItem(val r: String, val label: String, val on: ImageVector, val off: ImageVector, val badge: Int = 0)

/** Разделы нижней панели и боковой панели — одни и те же, с одинаковыми счётчиками */
@Composable
private fun navItems(): List<NavItem> {
    val me = Store.uid
    val unread = Store.chats.collectAsState().value.count { it.unread(me) }
    val reqs = Store.incoming.collectAsState().value.size + Store.notifs.collectAsState().value.let { Store.unseenNotifs() } + Store.mailIn.collectAsState().value.count { !it.read }
    return listOf(
        NavItem("feed", "Лента", Icons.Rounded.Home, Icons.Outlined.Home),
        NavItem("video", "Видео", Icons.Rounded.SmartDisplay, Icons.Outlined.SmartDisplay),
        NavItem("music", "Музыка", Icons.Rounded.MusicNote, Icons.Outlined.MusicNote),
        NavItem("chats", "Чаты", Icons.Rounded.ChatBubble, Icons.Outlined.ChatBubbleOutline, unread),
        NavItem("menu", "Меню", Icons.Rounded.Apps, Icons.Outlined.Apps, reqs),
    )
}

/** Нижняя навигация Material 3 — «пилюля» под значком выбранного раздела (телефон) */
@Composable
private fun BottomNav(route: String?, nav: NavHostController) {
    NavigationBar {
        navItems().forEach { i ->
            val on = route == i.r
            NavigationBarItem(
                selected = on, onClick = { if (!on) nav.openTab(i.r) },
                icon = { BadgedBox(badge = { if (i.badge > 0) Badge { Text(if (i.badge > 99) "99+" else "${i.badge}") } }) { Icon(if (on) i.on else i.off, i.label) } },
                label = { Text(i.label, maxLines = 1) },
            )
        }
    }
}

/** Боковая панель для планшетов — те же разделы, слева, с подписями */
@Composable
private fun SideRail(route: String?, nav: NavHostController) {
    NavigationRail(Modifier.fillMaxHeight().statusBarsPadding().navigationBarsPadding(), containerColor = MaterialTheme.colorScheme.surfaceContainer) {
        navItems().forEach { i ->
            val on = route == i.r
            NavigationRailItem(
                selected = on, onClick = { if (!on) nav.openTab(i.r) },
                icon = { BadgedBox(badge = { if (i.badge > 0) Badge { Text(if (i.badge > 99) "99+" else "${i.badge}") } }) { Icon(if (on) i.on else i.off, i.label) } },
                label = { Text(i.label, maxLines = 1) }, alwaysShowLabel = true,
            )
        }
    }
}

/** Мини-плеер — как медиаплеер в шторке: обложка, название, кнопки и полоска прогресса */
@Composable
private fun MiniPlayer(modifier: Modifier, onOpen: () -> Unit) {
    val s by Music.state.collectAsState()
    val t = s.track ?: return
    val cs = MaterialTheme.colorScheme
    Surface(onClick = onOpen, modifier = modifier.fillMaxWidth().height(64.dp), shape = RoundedCornerShape(16.dp), color = cs.secondaryContainer) {
        Box {
            Row(Modifier.fillMaxSize().padding(start = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                TrackCover(t, 48.dp, 10.dp)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = cs.onSecondaryContainer)
                    Text(t.artist.ifEmpty { "Неизвестный исполнитель" }, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = cs.onSecondaryContainer.copy(alpha = 0.75f))
                }
                if (s.buffering) CircularProgressIndicator(Modifier.padding(horizontal = 12.dp).size(22.dp), strokeWidth = 2.dp)
                else IconButton({ Music.toggle() }) { Icon(if (s.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (s.playing) "Пауза" else "Играть", tint = cs.onSecondaryContainer) }
                IconButton({ Music.next() }) { Icon(Icons.Rounded.SkipNext, "Следующий", tint = cs.onSecondaryContainer) }
            }
            val pct = if (s.duration > 0) s.position.toFloat() / s.duration else 0f
            LinearProgressIndicator({ pct.coerceIn(0f, 1f) }, Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 16.dp).height(3.dp).clip(RoundedCornerShape(2.dp)),
                color = cs.primary, trackColor = cs.primary.copy(alpha = 0.18f))
        }
    }
}
