package ru.vsmske.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import androidx.core.content.ContextCompat
import ru.vsmske.app.data.Store
import ru.vsmske.app.music.Music
import ru.vsmske.app.ui.Root

class MainActivity : ComponentActivity() {
    private val openPlayer = mutableStateOf(false)
    private val clip = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        ru.vsmske.app.ui.ThemePref.load(applicationContext)
        Store.start()
        // «ВС Клипы» — та же сборка, но свой корень: без музыкального плеера и звонков (они в VСмске)
        if (BuildConfig.CLIPS) {
            clip.value = intent?.getStringExtra("clip")
            setContent { ru.vsmske.app.ui.ClipsApp(clip) }
            return
        }
        Music.connect(applicationContext)
        ru.vsmske.app.rtc.Call.watch(applicationContext)
        openPlayer.value = intent?.getBooleanExtra("openPlayer", false) == true
        // плеер в шторке на Android 13+ требует разрешения на уведомления
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        setContent { Root(openPlayer) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra("clip")?.let { clip.value = it }
        if (intent.getBooleanExtra("openPlayer", false)) openPlayer.value = true
    }

    override fun onResume() {
        super.onResume()
        Store.touchSeen()
    }
}
