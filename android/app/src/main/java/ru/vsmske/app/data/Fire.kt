package ru.vsmske.app.data

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import ru.vsmske.app.BuildConfig

/**
 * Тот же проект Firebase, что у сайта. Подключаемся настройками веб-приложения —
 * google-services.json и регистрация в консоли не нужны.
 */
object Fire {
    lateinit var db: FirebaseFirestore; private set
    lateinit var auth: FirebaseAuth; private set

    fun init(ctx: Context) {
        val opts = FirebaseOptions.Builder()
            .setApiKey("AIzaSyADzttkHdFJ1m9hEEaX7Ab84QkBNfHjm_Q")
            .setApplicationId("1:195735209722:web:e9a36c806abeb048edeb43")
            .setProjectId("vsmske")
            .setGcmSenderId("195735209722")
            .build()
        val app = FirebaseApp.getApps(ctx).firstOrNull() ?: FirebaseApp.initializeApp(ctx, opts)
        db = FirebaseFirestore.getInstance(app)
        auth = FirebaseAuth.getInstance(app)
        if (BuildConfig.EMU) {   // только для проверки: ./gradlew assembleDebug -Pemu=true
            db.useEmulator("10.0.2.2", 8080)
            auth.useEmulator("10.0.2.2", 9099)
        }
    }

    val uid: String get() = auth.currentUser?.uid ?: ""
}
