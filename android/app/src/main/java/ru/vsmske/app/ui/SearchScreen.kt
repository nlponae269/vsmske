package ru.vsmske.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.Track
import ru.vsmske.app.data.User
import ru.vsmske.app.data.Video
import ru.vsmske.app.music.Music

/*
 * Поиск по VСмске: люди (по словам имени, ника и города — users.search), #тег, треки и видео.
 * Треки и видео ищутся по свежим (до 100 треков и 60 роликов, грузятся один раз за заход) — без новых индексов и лишних чтений.
 */
@Composable
fun SearchScreen(onOpenPlayer: () -> Unit) {
    val nav = LocalNav.current
    val ms by Music.state.collectAsState()
    var q by rememberSaveable { mutableStateOf("") }
    var people by remember { mutableStateOf<List<User>?>(null) }
    var tracks by remember { mutableStateOf<List<Track>?>(null) }
    var videos by remember { mutableStateOf<List<Video>?>(null) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val query = q.trim()
    LaunchedEffect(query) {
        people = null
        if (query.isEmpty()) return@LaunchedEffect
        delay(350)   // ждём, пока человек допечатает
        people = runCatching { Api.searchPeople(query) }.getOrDefault(emptyList()).filter { !it.banned }
        if (tracks == null) tracks = runCatching { Media.streamPage(null, 100) }.getOrDefault(emptyList())
        if (videos == null) videos = runCatching { Media.videosQuery(60).get().await().documents.map(Video::from) }.getOrDefault(emptyList())
        Store.need((tracks ?: emptyList()).map { it.ownerId } + (videos ?: emptyList()).map { it.ownerId })
    }
    val users by Store.users.collectAsState()
    val low = query.lowercase().removePrefix("#")
    val foundTracks = if (query.isEmpty()) emptyList() else tracks.orEmpty().filter { users[it.ownerId]?.banned != true && (it.title + " " + it.artist).lowercase().contains(low) }.take(10)
    val foundVideos = if (query.isEmpty()) emptyList() else videos.orEmpty().filter { users[it.ownerId]?.banned != true && (it.title + " " + it.description).lowercase().contains(low) }.take(10)
    val tag = Regex("^#?([\\p{L}\\d_]{2,30})$").find(query)?.groupValues?.get(1)?.lowercase()

    Scaffold(contentWindowInsets = WindowInsets(0), topBar = {
        Row(Modifier.statusBarsPadding().padding(8.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") }
            TextField(q, { q = it.take(60) }, Modifier.weight(1f).focusRequester(focus), placeholder = { Text("Люди, #теги, треки, видео") }, singleLine = true, shape = CircleShape,
                trailingIcon = { if (q.isNotEmpty()) IconButton({ q = "" }) { Icon(Icons.Rounded.Close, "Очистить") } },
                colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
        }
    }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 24.dp)) {
            if (query.isEmpty()) { item { EmptyState("Что ищем?", "Имя человека, @ник, #тег, название трека или видео", "🔎") }; return@LazyColumn }
            if (tag != null) item {
                Row(Modifier.fillMaxWidth().clickable { nav.navigate("tag/$tag") }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.tertiaryContainer), contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.Tag, null, tint = MaterialTheme.colorScheme.onTertiaryContainer)
                    }
                    Column(Modifier.padding(start = 14.dp)) {
                        Text("#$tag", style = MaterialTheme.typography.titleSmall)
                        Text("Записи с этим тегом", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            val p = people
            item { SectionTitle("Люди") }
            when {
                p == null -> items(3) { SkeletonRow() }
                p.isEmpty() -> item { Text("Никого не нашли", Modifier.padding(horizontal = 20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                else -> items(p, key = { "u" + it.id }) { u -> PersonRow(u) { nav.openProfile(u.id) } }
            }
            if (foundTracks.isNotEmpty()) {
                item { SectionTitle("Треки") }
                items(foundTracks, key = { "t" + it.id }) { t -> TrackRow(t, foundTracks, ms, onOpenPlayer) }
            }
            if (foundVideos.isNotEmpty()) {
                item { SectionTitle("Видео") }
                items(foundVideos, key = { "v" + it.id }) { v ->
                    Row(Modifier.fillMaxWidth().clickable { nav.navigate("video/${v.id}") }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        VideoThumb(v, Modifier.width(128.dp).size(width = 128.dp, height = 72.dp))
                        Column(Modifier.weight(1f).padding(start = 12.dp)) {
                            Text(v.title.ifEmpty { "Без названия" }, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(users[v.ownerId]?.name ?: "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}
