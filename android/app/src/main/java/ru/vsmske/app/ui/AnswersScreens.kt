package ru.vsmske.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.outlined.ThumbUp
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.QuestionAnswer
import androidx.compose.material.icons.rounded.ThumbUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.vsmske.app.data.Answer
import ru.vsmske.app.data.Api
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Question
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.ago
import ru.vsmske.app.data.plural

/* ВС Ответы: вопросы по разделам, «Мои», ответы с «полезно», лучший ответ (как viewAnswers()/viewQuestion() на сайте). */

@Composable
fun AnswersScreen() {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val users by Store.users.collectAsState()
    var cat by rememberSaveable { mutableStateOf("all") }
    var list by remember { mutableStateOf<List<Question>?>(null) }
    var ask by remember { mutableStateOf(false) }
    DisposableEffect(cat) {
        list = null
        val r = Api.questionsQuery(cat).addSnapshotListener { s, e ->
            if (e != null) { toast(errText(e)); list = list ?: emptyList(); return@addSnapshotListener }
            val l = s?.documents?.map(Question::from)?.sortedByDescending { it.createdAt } ?: return@addSnapshotListener
            Store.need(l.map { it.authorId }); list = l
        }
        onDispose { r.remove() }
    }
    BackScaffold("Ответы", fab = { ExtendedFloatingActionButton(onClick = { ask = true }, icon = { Icon(Icons.Rounded.QuestionAnswer, null) }, text = { Text("Спросить") }) }) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = pad.calculateTopPadding(), bottom = 100.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                    item { FilterChip(cat == "all", { cat = "all" }, { Text("Все") }, shape = CircleShape) }
                    item { FilterChip(cat == "mine", { cat = "mine" }, { Text("Мои") }, shape = CircleShape) }
                    items(Api.Q_CATS.entries.toList()) { (k, v) -> FilterChip(cat == k, { cat = k }, { Text(v) }, shape = CircleShape) }
                }
            }
            val l = list
            when {
                l == null -> items(5) { Box(Modifier.padding(horizontal = 16.dp).fillMaxWidth().height(96.dp).clip(RoundedCornerShape(24.dp)).shimmer()) }
                l.isEmpty() -> item { EmptyState(if (cat == "mine") "Вы ещё ничего не спрашивали" else "Вопросов пока нет", "Задайте первый — кнопка внизу", "💡") }
                else -> items(l, key = { it.id }) { q -> QuestionCard(q, users[q.authorId]) { nav.navigate("q/${q.id}") } }
            }
        }
    }
    if (ask) AskSheet(if (cat in Api.Q_CATS) cat else "other") { id -> ask = false; if (id != null) nav.navigate("q/$id") }
}

@Composable
private fun QuestionCard(q: Question, author: ru.vsmske.app.data.User?, onClick: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(cs.surfaceContainerLow).clickable(onClick = onClick).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(author, 28.dp)
            Text("  ${author?.name ?: ""} · ${ago(q.createdAt)}", style = MaterialTheme.typography.labelMedium, color = cs.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Chip(Api.Q_CATS[q.category] ?: "Другое", cs.secondaryContainer, cs.onSecondaryContainer)
        }
        Text(q.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 10.dp), maxLines = 3, overflow = TextOverflow.Ellipsis)
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            val n = q.answersCount.toInt().coerceAtLeast(0)
            Text(if (n == 0) "Нет ответов" else "$n ${plural(n, "ответ", "ответа", "ответов")}", style = MaterialTheme.typography.bodySmall,
                color = if (n == 0) cs.onSurfaceVariant else cs.primary)
            if (q.bestId.isNotEmpty()) Text("  ·  🏆 есть лучший", style = MaterialTheme.typography.bodySmall, color = cs.tertiary)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuestionScreen(id: String) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    var q by remember { mutableStateOf<Question?>(null) }
    var gone by remember { mutableStateOf(false) }
    var answers by remember { mutableStateOf<List<Answer>?>(null) }
    var text by rememberSaveable { mutableStateOf("") }
    var askDel by remember { mutableStateOf(false) }
    DisposableEffect(id) {
        val a = Fire.db.collection("questions").document(id).addSnapshotListener { s, _ ->
            if (s == null) return@addSnapshotListener
            if (!s.exists()) { gone = true; return@addSnapshotListener }
            q = Question.from(s).also { Store.need(listOf(it.authorId)) }
        }
        val b = Api.answersQuery(id).addSnapshotListener { s, _ ->
            val l = s?.documents?.map(Answer::from) ?: return@addSnapshotListener; answers = l; Store.need(l.map { it.authorId }) }
        onDispose { a.remove(); b.remove() }
    }
    val me = Store.uid
    val qq = q
    val mine = qq?.authorId == me
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = {
            TopAppBar(title = { Text("Вопрос") }, navigationIcon = { IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад") } },
                actions = { if (qq != null && (mine || Store.iAmAdmin)) IconButton({ askDel = true }) { Icon(Icons.Rounded.Delete, "Удалить вопрос") } })
        },
        bottomBar = {
            if (qq != null) Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainer).navigationBarsPadding().imePadding().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                TextField(text, { text = it.take(3000) }, placeholder = { Text("Ваш ответ…") }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(24.dp),
                    colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent), maxLines = 5)
                IconButton({ val t = text; text = ""; scope.safe({ text = t; toast(it) }) { Api.answer(qq, t); toast("Ответ опубликован") } }, enabled = text.isNotBlank()) {
                    Icon(Icons.AutoMirrored.Rounded.Send, "Ответить", tint = MaterialTheme.colorScheme.primary)
                }
            }
        },
    ) { pad ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = pad.calculateTopPadding() + 4.dp, bottom = pad.calculateBottomPadding() + 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when {
                gone -> item { EmptyState("Вопрос удалён", emoji = "🫥") }
                qq == null -> item { Loading() }
                else -> {
                    item {
                        val cs = MaterialTheme.colorScheme
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(cs.primaryContainer).padding(18.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { nav.openProfile(qq.authorId) }) {
                                Avatar(users[qq.authorId], 36.dp)
                                Column(Modifier.padding(start = 10.dp)) {
                                    UserName(users[qq.authorId], color = cs.onPrimaryContainer)
                                    Text("${Api.Q_CATS[qq.category] ?: "Другое"} · ${ago(qq.createdAt)}", style = MaterialTheme.typography.labelSmall, color = cs.onPrimaryContainer.copy(alpha = 0.75f))
                                }
                            }
                            Text(qq.title, style = MaterialTheme.typography.titleLarge, color = cs.onPrimaryContainer, modifier = Modifier.padding(top = 12.dp))
                            if (qq.text.isNotBlank()) RichText(qq.text, style = MaterialTheme.typography.bodyLarge, color = cs.onPrimaryContainer, modifier = Modifier.padding(top = 6.dp))
                        }
                    }
                    val l = answers
                    if (l == null) item { Loading() }
                    else {
                        // лучший — первым, остальные по «полезно», потом по времени (как на сайте)
                        val sorted = l.filter { users[it.authorId]?.banned != true || it.authorId == me }
                            .sortedWith(compareByDescending<Answer> { it.id == qq.bestId }.thenByDescending { it.likes.size }.thenBy { it.createdAt })
                        item {
                            Text(if (sorted.isEmpty()) "Ответов пока нет — будьте первым" else "${sorted.size} ${plural(sorted.size, "ответ", "ответа", "ответов")}",
                                style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp, start = 4.dp))
                        }
                        items(sorted, key = { it.id }) { a ->
                            AnswerCard(a, users[a.authorId], best = a.id == qq.bestId, canBest = mine && a.authorId != me && a.id != qq.bestId,
                                canDelete = a.authorId == me || mine || Store.iAmAdmin,
                                onLike = { scope.safe(toast) { Api.likeAnswer(qq.id, a) } },
                                onBest = { scope.safe(toast) { Api.bestAnswer(qq, a); toast("Лучший ответ выбран") } },
                                onDelete = { scope.safe(toast) { Api.deleteAnswer(qq, a); toast("Ответ удалён") } },
                                onAuthor = { nav.openProfile(a.authorId) })
                        }
                    }
                }
            }
        }
    }
    if (askDel && qq != null) AlertDialog({ askDel = false }, title = { Text("Удалить вопрос?") }, text = { Text("Вместе с ним удалятся все ответы.") },
        confirmButton = { TextButton({ askDel = false; scope.safe(toast) { Api.deleteQuestion(qq); toast("Вопрос удалён"); nav.popBackStack() } }) { Text("Удалить") } },
        dismissButton = { TextButton({ askDel = false }) { Text("Отмена") } })
}

@Composable
private fun AnswerCard(a: Answer, author: ru.vsmske.app.data.User?, best: Boolean, canBest: Boolean, canDelete: Boolean,
                       onLike: () -> Unit, onBest: () -> Unit, onDelete: () -> Unit, onAuthor: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    var confirm by remember { mutableStateOf(false) }
    val liked = Store.uid in a.likes
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(if (best) cs.tertiaryContainer else cs.surfaceContainerLow).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(author, 32.dp, onClick = onAuthor)
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                UserName(author)
                Text(ago(a.createdAt), style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant)
            }
            if (best) Chip("Лучший", cs.tertiary, cs.onTertiary, leading = { Icon(Icons.Rounded.EmojiEvents, null, Modifier.size(16.dp), tint = cs.onTertiary) })
        }
        RichText(a.text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 8.dp))
        Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onLike) {
                Icon(if (liked) Icons.Rounded.ThumbUp else Icons.Outlined.ThumbUp, null, Modifier.size(18.dp))
                Text(if (a.likes.isEmpty()) "  Полезно" else "  ${a.likes.size}")
            }
            if (canBest) TextButton(onBest) { Icon(Icons.Rounded.EmojiEvents, null, Modifier.size(18.dp)); Text("  Лучший") }
            Spacer(Modifier.weight(1f))
            if (canDelete) IconButton({ confirm = true }) { Icon(Icons.Rounded.Delete, "Удалить ответ", tint = cs.onSurfaceVariant) }
        }
    }
    if (confirm) AlertDialog({ confirm = false }, title = { Text("Удалить ответ?") },
        confirmButton = { TextButton({ confirm = false; onDelete() }) { Text("Удалить") } },
        dismissButton = { TextButton({ confirm = false }) { Text("Отмена") } })
}

@Composable
private fun AskSheet(start: String, onDone: (String?) -> Unit) {
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var cat by remember { mutableStateOf(start) }
    var busy by remember { mutableStateOf(false) }
    VsSheet({ if (!busy) onDone(null) }) {
        Text("Новый вопрос", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(bottom = 12.dp))
        OutlinedTextField(title, { title = it.take(150) }, Modifier.fillMaxWidth(), label = { Text("Вопрос") }, supportingText = { Text("${title.length}/150, от 5 символов") })
        OutlinedTextField(text, { text = it.take(2000) }, Modifier.fillMaxWidth().padding(top = 4.dp), label = { Text("Подробности (необязательно)") }, minLines = 3, maxLines = 6)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
            items(Api.Q_CATS.entries.toList()) { (k, v) -> FilterChip(cat == k, { cat = k }, { Text(v) }, shape = CircleShape) }
        }
        Button({
            busy = true
            scope.safe({ busy = false; toast(it) }) { val id = Api.ask(title, text, cat); toast("Вопрос опубликован"); onDone(id) }
        }, Modifier.fillMaxWidth().padding(top = 8.dp).height(52.dp), enabled = !busy && title.trim().length >= 5) {
            if (busy) ExpressiveLoader(24.dp, MaterialTheme.colorScheme.onPrimary) else Text("Опубликовать")
        }
    }
}
