package ru.vsmske.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import androidx.core.content.ContextCompat
import ru.vsmske.app.data.Repo
import ru.vsmske.app.data.Session
import ru.vsmske.app.music.MusicPlayer
import ru.vsmske.app.ui.VsRoot

class MainActivity : ComponentActivity() {
    private val openPlayer = mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()   // значки строки состояния — светлые или тёмные по теме (Material You)
        super.onCreate(savedInstanceState)
        Session.init()
        MusicPlayer.connect(applicationContext)
        openPlayer.value = intent?.getBooleanExtra("openPlayer", false) == true
        // уведомление с плеером в шторке на Android 13+ требует разрешения
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        setContent { VsRoot(openPlayer) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra("openPlayer", false)) openPlayer.value = true
    }

    override fun onResume() {
        super.onResume()
        Repo.touchSeen()
    }
}
