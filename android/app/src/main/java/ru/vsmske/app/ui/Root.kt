package ru.vsmske.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.ChatBubble
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
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

@Composable
fun Root(openPlayer: MutableState<Boolean>) {
    VsTheme {
        val phase by Store.phase.collectAsState()
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface)) {
            when (phase) {
                Store.Phase.Loading -> Loading(Modifier.align(Alignment.Center))
                Store.Phase.SignedOut -> AuthScreen()
                Store.Phase.NeedProfile -> OnboardScreen()
                Store.Phase.Ready -> Main(openPlayer)
            }
        }
    }
}

private val TABS = setOf("feed", "chats", "music", "friends", "me")

@Composable
private fun Main(openPlayer: MutableState<Boolean>) {
    val nav = rememberNavController()
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val toast: (String) -> Unit = { m -> scope.launch { snack.currentSnackbarData?.dismiss(); snack.showSnackbar(m) } }
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val isTab = route in TABS
    val withInput = route == "chat/{key}"   // там внизу поле ввода — мини-плеер прячем
    val ms by Music.state.collectAsState()
    val hasPlayer = ms.track != null

    CompositionLocalProvider(LocalNav provides nav, LocalToast provides toast) {
        Scaffold(
            contentWindowInsets = WindowInsets(0),
            snackbarHost = { SnackbarHost(snack) },
            bottomBar = {
                Column {
                    AnimatedVisibility(hasPlayer && !withInput, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
                        MiniPlayer(Modifier.padding(horizontal = 8.dp, vertical = 6.dp).then(if (isTab) Modifier else Modifier.navigationBarsPadding())) { openPlayer.value = true }
                    }
                    if (isTab) BottomNav(route, nav)
                }
            },
        ) { pad ->
            NavHost(nav, startDestination = "feed", modifier = Modifier.padding(bottom = pad.calculateBottomPadding())) {
                composable("feed") { FeedScreen() }
                composable("chats") { ChatsScreen() }
                composable("music") { MusicScreen(onOpenPlayer = { openPlayer.value = true }) }
                composable("friends") { FriendsScreen() }
                composable("me") { ProfileScreen(Store.uid, tab = true) }
                composable("notifs") { NotifsScreen() }
                composable("edit") { EditProfileScreen() }
                composable("profile/{id}", listOf(navArgument("id") { type = NavType.StringType })) { ProfileScreen(it.arguments?.getString("id") ?: Store.uid) }
                composable("chat/{key}", listOf(navArgument("key") { type = NavType.StringType })) { ChatScreen(it.arguments?.getString("key") ?: "") }
                composable("post/{id}", listOf(navArgument("id") { type = NavType.StringType })) { PostScreen(it.arguments?.getString("id") ?: "") }
            }
        }
        AnimatedVisibility(openPlayer.value && hasPlayer, enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
            PlayerScreen(onClose = { openPlayer.value = false })
        }
        if (openPlayer.value && hasPlayer) BackHandler { openPlayer.value = false }
    }
}

fun NavHostController.openProfile(id: String) = if (id == ru.vsmske.app.data.Fire.uid) navigate("me") { launchSingleTop = true } else navigate("profile/$id")
fun NavHostController.openTab(r: String) = navigate(r) { popUpTo("feed") { saveState = true }; launchSingleTop = true; restoreState = true }

/** Нижняя навигация Material 3 — «пилюля» под значком выбранного раздела */
@Composable
private fun BottomNav(route: String?, nav: NavHostController) {
    val me = Store.uid
    val unread = Store.chats.collectAsState().value.count { it.unread(me) }
    val reqs = Store.incoming.collectAsState().value.size
    class Item(val r: String, val label: String, val on: ImageVector, val off: ImageVector, val badge: Int = 0)
    val items = listOf(
        Item("feed", "Лента", Icons.Rounded.Home, Icons.Outlined.Home),
        Item("chats", "Чаты", Icons.Rounded.ChatBubble, Icons.Outlined.ChatBubbleOutline, unread),
        Item("music", "Музыка", Icons.Rounded.MusicNote, Icons.Outlined.MusicNote),
        Item("friends", "Друзья", Icons.Rounded.Group, Icons.Outlined.Group, reqs),
        Item("me", "Профиль", Icons.Rounded.AccountCircle, Icons.Outlined.AccountCircle),
    )
    NavigationBar {
        items.forEach { i ->
            val on = route == i.r
            NavigationBarItem(
                selected = on, onClick = { if (!on) nav.openTab(i.r) },
                icon = { BadgedBox(badge = { if (i.badge > 0) Badge { Text(if (i.badge > 99) "99+" else "${i.badge}") } }) { Icon(if (on) i.on else i.off, i.label) } },
                label = { Text(i.label, maxLines = 1) },
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
