package ru.vsmske.app.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cameraswitch
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import ru.vsmske.app.data.Files
import ru.vsmske.app.data.Media
import ru.vsmske.app.music.ClipMedia
import ru.vsmske.app.music.FileSource
import java.io.File

/** Клип — до 90 секунд (как isClip() и Клипы на сайте), файл — до 20 МБ (как ВС Видео) */
private const val CLIP_MAX_SEC = 90

private suspend fun durationOf(ctx: Context, uri: Uri): Double = withContext(Dispatchers.IO) {
    runCatching {
        val r = MediaMetadataRetriever(); r.setDataSource(ctx, uri)
        val d = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLong() ?: 0L) / 1000.0
        r.release(); d
    }.getOrDefault(0.0)
}

/** Файл из кэша → content:// (так у него есть имя, размер и тип, как у файла из галереи) */
private fun shareable(ctx: Context, f: File): Uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", f)

/** Файл звука на телефоне (трек или клип скачивается один раз в кэш) */
private suspend fun soundFile(ctx: Context, s: Media.Sound): File = withContext(Dispatchers.IO) { FileSource.local(ctx, s.fileId) }

/**
 * «＋»: своя камера (можно под звук из библиотеки или под звук другого клипа), или видео из галереи.
 * Звук накладывается на телефоне при публикации; клип запоминает, чей это звук (Video.soundRef).
 */
@Composable
fun ClipsUpload(presetSound: String) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var sound by remember { mutableStateOf<Media.Sound?>(null) }
    var soundLocal by remember { mutableStateOf<File?>(null) }
    var picking by remember { mutableStateOf(false) }
    var video by remember { mutableStateOf<Uri?>(null) }
    var dur by remember { mutableStateOf(0.0) }
    var camOk by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var micOk by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) }
    val askPerms = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        camOk = r[Manifest.permission.CAMERA] ?: camOk; micOk = r[Manifest.permission.RECORD_AUDIO] ?: micOk
        if (!camOk) toast("Без камеры можно загрузить видео из галереи")
    }
    LaunchedEffect(Unit) { if (!camOk || !micOk) askPerms.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)) }
    // «Снять под этот звук»: звук выбран заранее
    LaunchedEffect(presetSound) {
        if (presetSound.isNotEmpty()) runCatching { Media.sound(presetSound) }.onSuccess { if (it == null) toast("Звук недоступен") else sound = it }.onFailure { toast(errText(it)) }
    }
    // звук качаем на телефон сразу после выбора, чтобы на записи он заиграл без задержки
    LaunchedEffect(sound?.ref) { soundLocal = null; sound?.let { s -> soundLocal = runCatching { soundFile(ctx, s) }.onFailure { toast(errText(it)) }.getOrNull() } }

    suspend fun take(u: Uri) {
        val d = durationOf(ctx, u)
        when {
            d <= 0.0 -> toast("Не получилось прочитать видео — попробуйте другое")
            d > CLIP_MAX_SEC + 0.5 -> toast("Клип — до $CLIP_MAX_SEC секунд, а это видео — ${Math.round(d)} с. Обрежьте его в галерее")
            d < 1.0 -> toast("Слишком коротко — нужна хотя бы секунда")
            else -> { video = u; dur = d }
        }
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> if (u != null) scope.safe(toast) { take(u) } }
    val gallery = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) }

    DarkSystemBars()
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        val v = video
        when {
            v != null -> ClipPublish(v, dur, sound, soundLocal, onSound = { picking = true }, onBack = { video = null })
            camOk -> ClipCamera(sound, soundLocal, micOk, onSound = { picking = true }, onGallery = gallery) { f -> scope.safe(toast) { take(shareable(ctx, f)) } }
            else -> Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                ClipsLogo(72.dp)
                Text("Нужен доступ к камере", color = Color.White, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 16.dp))
                Text("Или загрузите готовое видео до $CLIP_MAX_SEC секунд", color = Color.White.copy(alpha = 0.6f), modifier = Modifier.padding(top = 6.dp, bottom = 22.dp))
                PurpleButton("Разрешить камеру", Modifier.width(240.dp)) { askPerms.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)) }
                Spacer(Modifier.height(10.dp))
                GrayButton("Из галереи", Modifier.width(240.dp)) { gallery() }
            }
        }
        if (video == null) IconButton({ nav.popBackStack() }, Modifier.statusBarsPadding().padding(4.dp)) { Icon(Icons.Rounded.Close, "Закрыть", tint = Color.White, modifier = Modifier.size(30.dp)) }
    }
    if (picking) SoundPickerSheet(onPick = { s -> sound = s; picking = false }, onClose = { picking = false })
}

/** Плашка «♫ Добавить звук» / название звука */
@Composable
private fun SoundChip(sound: Media.Sound?, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val users by ru.vsmske.app.data.Store.users.collectAsState()
    Row(modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Rounded.MusicNote, null, tint = Color.White, modifier = Modifier.size(18.dp))
        Text(when { sound == null -> "Добавить звук"; sound.library -> sound.title + if (sound.sub.isNotEmpty()) " — ${sound.sub}" else ""
                    else -> "Оригинальный звук — ${users[sound.ownerId]?.name ?: ""}" },
            color = Color.White, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 6.dp).widthIn(max = 220.dp))
    }
}

@SuppressLint("MissingPermission")
@Composable
private fun ClipCamera(sound: Media.Sound?, soundLocal: File?, micOk: Boolean, onSound: () -> Unit, onGallery: () -> Unit, onDone: (File) -> Unit) {
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val life = LocalLifecycleOwner.current
    var front by remember { mutableStateOf(true) }
    var recording by remember { mutableStateOf<Recording?>(null) }
    var elapsed by remember { mutableStateOf(0f) }
    val previewView = remember { PreviewView(ctx).apply { scaleType = PreviewView.ScaleType.FILL_CENTER; implementationMode = PreviewView.ImplementationMode.COMPATIBLE } }
    // SD и ~1,5 Мбит/с: 90 секунд укладываются в 20 МБ
    val capture = remember {
        VideoCapture.withOutput(Recorder.Builder().setQualitySelector(QualitySelector.from(Quality.SD, FallbackStrategy.higherQualityOrLowerThan(Quality.SD)))
            .setTargetVideoEncodingBitRate(1_500_000).build())
    }
    val soundPlayer = rememberVideoPlayer()
    LaunchedEffect(soundLocal) { soundLocal?.let { soundPlayer.setMediaItem(MediaItem.fromUri(Uri.fromFile(it))); soundPlayer.repeatMode = Player.REPEAT_MODE_OFF; soundPlayer.prepare() } ?: soundPlayer.clearMediaItems() }
    var provider by remember { mutableStateOf<ProcessCameraProvider?>(null) }
    LaunchedEffect(front) {
        val p = provider ?: withContext(Dispatchers.IO) { ProcessCameraProvider.getInstance(ctx).get() }.also { provider = it }
        runCatching {
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            p.unbindAll()
            p.bindToLifecycle(life, if (front) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
        }.onFailure { toast("Камера не запустилась: ${errText(it)}") }
    }
    DisposableEffect(Unit) { onDispose { recording?.stop(); provider?.unbindAll() } }
    val maxSec = minOf(CLIP_MAX_SEC.toDouble(), sound?.duration?.takeIf { it >= 1.0 } ?: CLIP_MAX_SEC.toDouble()).toFloat()

    fun start() {
        if (sound != null && soundLocal == null) { toast("Звук ещё загружается — секунду"); return }
        val f = File(ctx.cacheDir, "clip_rec_${System.currentTimeMillis()}.mp4")
        val opts = FileOutputOptions.Builder(f).setDurationLimitMillis((maxSec * 1000).toLong()).setFileSizeLimit(Files.VIDEO_MAX - 512 * 1024).build()
        var pend = capture.output.prepareRecording(ctx, opts)
        // со звуком из библиотеки микрофон не нужен: звук всё равно заменим
        if (sound == null && micOk) pend = pend.withAudioEnabled()
        elapsed = 0f
        recording = pend.start(ContextCompat.getMainExecutor(ctx)) { e ->
            when (e) {
                is VideoRecordEvent.Start -> if (sound != null) { soundPlayer.seekTo(0); soundPlayer.play() }
                is VideoRecordEvent.Status -> elapsed = e.recordingStats.recordedDurationNanos / 1e9f
                is VideoRecordEvent.Finalize -> {
                    soundPlayer.pause(); recording = null
                    val okEnd = !e.hasError() || e.error == VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED || e.error == VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED
                    if (okEnd && f.length() > 0) onDone(f) else { f.delete(); toast("Запись не получилась — попробуйте ещё раз") }
                }
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
        AndroidView({ previewView }, Modifier.fillMaxSize())
        SoundChip(sound, Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 10.dp)) { if (recording == null) onSound() }
        if (recording == null) IconButton({ front = !front }, Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(6.dp)) {
            Icon(Icons.Rounded.Cameraswitch, "Сменить камеру", tint = Color.White, modifier = Modifier.size(30.dp))
        }
        if (recording != null) Text("${elapsed.toInt()} / ${maxSec.toInt()} с", color = Color.White, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
            modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 60.dp))
        // внизу: запись по центру, галерея справа
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(bottom = 28.dp)) {
            RecordButton(recording != null, elapsed / maxSec, Modifier.align(Alignment.Center)) {
                val r = recording
                if (r == null) start() else if (elapsed < 1f) toast("Снимите хотя бы секунду") else r.stop()
            }
            if (recording == null) Column(Modifier.align(Alignment.CenterEnd).padding(end = 32.dp).clickable(onClick = onGallery), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).border(2.dp, Color.White, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.PhotoLibrary, null, tint = Color.White)
                }
                Text("Загрузить", color = Color.White, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

/** Кнопка записи: белое кольцо, красная середина; во время записи — квадрат и полоска времени по кругу */
@Composable
private fun RecordButton(rec: Boolean, f: Float, modifier: Modifier, onClick: () -> Unit) {
    Box(modifier.size(86.dp).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val w = 6.dp.toPx()
            drawCircle(Color.White.copy(alpha = if (rec) 0.35f else 0.9f), radius = size.minDimension / 2 - w / 2, style = Stroke(w))
            if (rec) drawArc(ClipPink, -90f, 360f * f.coerceIn(0f, 1f), false, topLeft = Offset(w / 2, w / 2), size = Size(size.width - w, size.height - w), style = Stroke(w, cap = StrokeCap.Round))
        }
        Box(Modifier.size(if (rec) 30.dp else 66.dp).clip(if (rec) RoundedCornerShape(8.dp) else CircleShape).background(ClipPink))
    }
}

/** Публикация: предпросмотр (со звуком, если выбран), подпись, «Опубликовать» */
@Composable
private fun ClipPublish(video: Uri, dur: Double, sound: Media.Sound?, soundLocal: File?, onSound: () -> Unit, onBack: () -> Unit) {
    val nav = LocalNav.current
    val ctx = LocalContext.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var stage by remember { mutableStateOf<String?>(null) }
    var progress by remember { mutableStateOf(0f) }
    val player = rememberVideoPlayer()
    val soundPlayer = rememberVideoPlayer()
    LaunchedEffect(video, soundLocal) {
        player.setMediaItem(MediaItem.fromUri(video)); player.repeatMode = Player.REPEAT_MODE_ONE; player.volume = if (soundLocal != null) 0f else 0.8f; player.prepare(); player.play()
        if (soundLocal != null) { soundPlayer.setMediaItem(MediaItem.fromUri(Uri.fromFile(soundLocal))); soundPlayer.repeatMode = Player.REPEAT_MODE_ONE; soundPlayer.prepare(); soundPlayer.play() }
        else soundPlayer.clearMediaItems()
    }
    // звук в предпросмотре идёт от начала вместе с видео
    LaunchedEffect(video, soundLocal) {
        var last = 0L
        while (soundLocal != null) { val p = player.currentPosition; if (p < last) soundPlayer.seekTo(0); last = p; delay(200) }
    }
    Column(Modifier.fillMaxSize().statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack, enabled = stage == null) { Icon(Icons.Rounded.Close, "Назад", tint = Color.White) }
            Text("Новый клип", color = Color.White, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
        }
        Box(Modifier.padding(top = 8.dp).fillMaxWidth(0.62f).aspectRatio(9 / 16f).clip(RoundedCornerShape(18.dp)).background(Color.DarkGray)) {
            ExoView(player, Modifier.fillMaxSize(), controls = false, fill = true)
        }
        Text("${Math.round(dur)} с", color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp))
        SoundChip(sound, Modifier.padding(top = 10.dp)) { if (stage == null) onSound() }
        OutlinedTextField(title, { title = it.take(120) }, Modifier.fillMaxWidth().padding(top = 14.dp), enabled = stage == null,
            placeholder = { Text("Опишите клип…") }, minLines = 2, maxLines = 4,
            colors = OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White, focusedBorderColor = ClipPurple,
                unfocusedBorderColor = Color.White.copy(alpha = 0.3f), cursorColor = Color.White, focusedPlaceholderColor = Color.White.copy(alpha = 0.5f),
                unfocusedPlaceholderColor = Color.White.copy(alpha = 0.5f)))
        Text("${title.length}/120", color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.End).padding(top = 4.dp))
        val st = stage
        if (st != null) {
            LinearProgressIndicator({ progress }, Modifier.fillMaxWidth().padding(top = 18.dp), color = ClipPink, trackColor = Color.White.copy(alpha = 0.2f))
            Text("$st ${(progress * 100).toInt()}% — не закрывайте приложение", color = Color.White.copy(alpha = 0.7f), modifier = Modifier.padding(top = 8.dp))
        } else Row(Modifier.padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GrayButton("Переснять", Modifier.weight(1f), onBack)
            PurpleButton("Опубликовать", Modifier.weight(1f)) {
                if (sound != null && soundLocal == null) { toast("Звук ещё загружается — секунду"); return@PurpleButton }
                player.pause(); soundPlayer.pause()
                scope.safe({ stage = null; toast(it) }) {
                    var src = video
                    var mixed: File? = null
                    if (sound != null && soundLocal != null) {
                        stage = "Накладываем звук…"; progress = 0f
                        mixed = ClipMedia.replaceAudio(ctx, video, soundLocal) { progress = it }
                        src = shareable(ctx, mixed)
                    }
                    stage = "Загружаем…"; progress = 0f
                    try { Media.addVideoFile(ctx, src, title, "", sound?.ref ?: "") { progress = it } } finally { mixed?.delete() }
                    toast("Клип опубликован 🎉")
                    runCatching { ClipsData.reset(); ClipsData.more() }
                    nav.navigate("me") { popUpTo("home"); launchSingleTop = true }
                }
            }
        }
    }
}
