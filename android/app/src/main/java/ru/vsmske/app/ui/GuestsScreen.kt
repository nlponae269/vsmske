package ru.vsmske.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.ago

/** Гости моей страницы: кто заходил (последние 50, как viewGuests() на сайте). Видит только хозяин. */
@Composable
fun GuestsScreen() {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val users by Store.users.collectAsState()
    var list by remember { mutableStateOf<List<Pair<String, Long>>?>(null) }
    LaunchedEffect(Unit) {
        list = runCatching { Api.guests() }.onFailure { toast(errText(it)) }.getOrDefault(emptyList())
        Store.need(list!!.map { it.first })
    }
    BackScaffold("Гости") { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            item {
                Text("Кто заходил на вашу страницу. Отметка ставится не чаще раза в полчаса.", style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            }
            val l = list
            when {
                l == null -> item { Loading() }
                l.isEmpty() -> item { EmptyState("Гостей пока не было", "Поделитесь ссылкой на свою страницу", "👀") }
                else -> items(l, key = { it.first }) { (id, at) ->
                    val u = users[id]
                    ListItem(leadingContent = { Avatar(u, 48.dp) }, headlineContent = { UserName(u) },
                        supportingContent = { Text(if (at > 0) ago(at) else "только что") },
                        modifier = Modifier.clickable { nav.openProfile(id) })
                }
            }
        }
    }
}
