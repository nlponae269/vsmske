package ru.vsmske.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.rounded.AddAPhoto
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Sell
import androidx.compose.material.icons.rounded.ShoppingBag
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Lot
import ru.vsmske.app.data.Media
import ru.vsmske.app.data.Store
import ru.vsmske.app.data.ago

/* ВС Маркет: объявления по разделам, «Мои», карточка объявления, «Продано», написать продавцу. */

fun fmtPrice(p: Long): String = if (p <= 0) "Бесплатно" else "%,d ₽".format(java.util.Locale("ru"), p)

@Composable
fun MarketScreen() {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val users by Store.users.collectAsState()
    var cat by rememberSaveable { mutableStateOf("all") }
    var lots by remember { mutableStateOf<List<Lot>?>(null) }
    var create by remember { mutableStateOf(false) }
    DisposableEffect(cat) {
        lots = null
        val r = Media.marketQuery(cat).addSnapshotListener { s, e ->
            if (e != null) { toast(errText(e)); lots = lots ?: emptyList(); return@addSnapshotListener }
            val l = s?.documents?.map(Lot::from)?.sortedWith(compareBy<Lot> { it.sold }.thenByDescending { it.createdAt }) ?: return@addSnapshotListener
            Store.need(l.map { it.ownerId }); lots = l
        }
        onDispose { r.remove() }
    }
    BackScaffold("Маркет", fab = { ExtendedFloatingActionButton(onClick = { create = true }, icon = { Icon(Icons.Rounded.Sell, null) }, text = { Text("Продать") }) }) { pad ->
        LazyVerticalGrid(GridCells.Adaptive(160.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = pad.calculateTopPadding(), bottom = 100.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
                    item { FilterChip(cat == "all", { cat = "all" }, { Text("Все") }, shape = CircleShape) }
                    item { FilterChip(cat == "mine", { cat = "mine" }, { Text("Мои") }, shape = CircleShape) }
                    items(Media.MKT_CATS.entries.toList()) { (k, v) -> FilterChip(cat == k, { cat = k }, { Text(v) }, shape = CircleShape) }
                }
            }
            val l = lots?.filter { users[it.ownerId]?.banned != true }
            when {
                l == null -> items(6) { Box(Modifier.fillMaxWidth().aspectRatio(0.8f).clip(RoundedCornerShape(24.dp)).shimmer()) }
                l.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) { EmptyState(if (cat == "mine") "У вас нет объявлений" else "Здесь пока пусто", "Продайте что-нибудь — кнопка внизу", "🛍️") }
                else -> items(l, key = { it.id }) { lot -> LotCard(lot) { nav.navigate("lot/${lot.id}") } }
            }
        }
    }
    if (create) LotForm { id -> create = false; if (id != null) nav.navigate("lot/$id") }
}

@Composable
private fun LotCard(l: Lot, onClick: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    Column(Modifier.clickable(onClick = onClick)) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(22.dp)).background(cs.surfaceContainerHigh), contentAlignment = Alignment.Center) {
            if (l.image.isNotEmpty()) DbImage(l.image, Modifier.fillMaxSize()) else Icon(Icons.Rounded.ShoppingBag, null, tint = cs.onSurfaceVariant, modifier = Modifier.size(48.dp))
            if (l.sold) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                Chip("Продано", Color.White, Color.Black)
            }
        }
        Text(fmtPrice(l.price), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp, start = 4.dp))
        Text(l.title, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 4.dp))
        if (l.city.isNotEmpty()) Text(l.city, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
fun LotScreen(id: String) {
    val nav = LocalNav.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    val users by Store.users.collectAsState()
    var lot by remember { mutableStateOf<Lot?>(null) }
    var gone by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf(false) }
    DisposableEffect(id) {
        val r = Fire.db.collection("market").document(id).addSnapshotListener { s, _ ->
            if (s == null) return@addSnapshotListener
            if (!s.exists()) { gone = true; return@addSnapshotListener }
            lot = Lot.from(s).also { Store.need(listOf(it.ownerId)) }
        }
        onDispose { r.remove() }
    }
    val l = lot
    val seller = l?.let { users[it.ownerId] }
    val mine = l?.ownerId == Store.uid
    Scaffold(contentWindowInsets = WindowInsets(0)) { pad ->
        Box(Modifier.fillMaxSize().padding(bottom = pad.calculateBottomPadding())) {
            when {
                gone -> EmptyState("Объявление снято", emoji = "🫥", modifier = Modifier.padding(top = 120.dp))
                l == null -> Loading(Modifier.padding(top = 120.dp))
                else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
                    item {
                        Box(Modifier.fillMaxWidth().aspectRatio(1f).background(MaterialTheme.colorScheme.surfaceContainerHigh), contentAlignment = Alignment.Center) {
                            when {
                                seller?.banned == true -> Locked("Фото недоступно", Modifier.fillMaxSize())
                                l.image.isNotEmpty() -> DbImage(l.image, Modifier.fillMaxSize(), ContentScale.Crop)
                                else -> Icon(Icons.Rounded.ShoppingBag, null, Modifier.size(96.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    item {
                        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(fmtPrice(l.price), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
                                if (l.sold) Chip("Продано", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
                            }
                            Text(l.title, style = MaterialTheme.typography.titleLarge)
                            Text(listOfNotNull(Media.MKT_CATS[l.category], l.city.ifBlank { null }, ago(l.createdAt)).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (l.text.isNotEmpty()) RichText(l.text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                    item {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surfaceContainerLow)
                            .clickable { nav.openProfile(l.ownerId) }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(seller, 48.dp)
                            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                Text("Продавец", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                UserName(seller)
                            }
                        }
                    }
                    item {
                        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (mine) {
                                FilledTonalButton({ scope.safe(toast) { Media.setSold(l, !l.sold); toast(if (l.sold) "Снова в продаже" else "Отмечено как продано") } }, Modifier.weight(1f)) {
                                    Text(if (l.sold) "Снова в продаже" else "Продано")
                                }
                                IconButton({ ask = true }) { Icon(Icons.Rounded.Delete, "Удалить объявление", tint = MaterialTheme.colorScheme.error) }
                            } else if (seller?.banned != true) Button({ nav.navigate("chat/${l.ownerId}") }, Modifier.fillMaxWidth().height(52.dp)) {
                                Icon(Icons.Outlined.ChatBubbleOutline, null); Spacer(Modifier.width(8.dp)); Text("Написать продавцу")
                            }
                        }
                    }
                }
            }
            IconButton({ nav.popBackStack() }, Modifier.statusBarsPadding().padding(8.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.3f))) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Назад", tint = Color.White)
            }
        }
    }
    if (ask && l != null) AlertDialog({ ask = false }, title = { Text("Удалить объявление?") },
        confirmButton = { TextButton({ ask = false; scope.safe(toast) { Media.deleteLot(l); toast("Объявление удалено"); nav.popBackStack() } }) { Text("Удалить") } },
        dismissButton = { TextButton({ ask = false }) { Text("Отмена") } })
}

/** Новое объявление */
@Composable
private fun LotForm(onDone: (String?) -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var cat by remember { mutableStateOf("other") }
    var city by remember { mutableStateOf(Store.me.value?.city ?: "") }
    var text by remember { mutableStateOf("") }
    var photo by remember { mutableStateOf<Uri?>(null) }
    var busy by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> if (u != null) photo = u }
    VsSheet({ if (!busy) onDone(null) }) {
        Text("Новое объявление", style = MaterialTheme.typography.headlineSmall)
        Box(Modifier.padding(vertical = 12.dp).fillMaxWidth().height(160.dp).clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.secondaryContainer)
            .clickable { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, contentAlignment = Alignment.Center) {
            if (photo != null) coil.compose.AsyncImage(photo, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Rounded.AddAPhoto, null, tint = MaterialTheme.colorScheme.onSecondaryContainer)
                Text("Добавить фото", color = MaterialTheme.colorScheme.onSecondaryContainer, style = MaterialTheme.typography.labelLarge)
            }
        }
        OutlinedTextField(title, { title = it.take(100) }, Modifier.fillMaxWidth(), label = { Text("Что продаёте") }, singleLine = true)
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(price, { price = it.filter(Char::isDigit).take(10) }, Modifier.weight(1f), label = { Text("Цена, ₽") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), supportingText = { Text("0 — бесплатно") })
            OutlinedTextField(city, { city = it.take(40) }, Modifier.weight(1f), label = { Text("Город") }, singleLine = true)
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
            items(Media.MKT_CATS.entries.toList()) { (k, v) -> FilterChip(cat == k, { cat = k }, { Text(v) }, shape = CircleShape) }
        }
        OutlinedTextField(text, { text = it.take(3000) }, Modifier.fillMaxWidth().padding(top = 6.dp), label = { Text("Описание") }, minLines = 3, maxLines = 6)
        Button({
            busy = true
            scope.safe({ busy = false; toast(it) }) {
                val id = Media.createLot(ctx, title, price.toLongOrNull() ?: 0, cat, city, text, photo)
                toast("Объявление опубликовано"); onDone(id)
            }
        }, Modifier.fillMaxWidth().padding(top = 12.dp).height(52.dp), enabled = !busy && title.trim().length >= 2) {
            if (busy) ExpressiveLoader(24.dp, MaterialTheme.colorScheme.onPrimary) else Text("Опубликовать")
        }
    }
}
