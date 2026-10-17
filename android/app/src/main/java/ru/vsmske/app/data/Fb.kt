package ru.vsmske.app.data

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

/**
 * Тот же проект Firebase, что и у сайта. Подключаемся с настройками веб-приложения —
 * так не нужен google-services.json и ничего не надо регистрировать в консоли.
 */
object Fb {
    lateinit var db: FirebaseFirestore; private set
    lateinit var auth: FirebaseAuth; private set

    fun init(ctx: Context) {
        val opts = FirebaseOptions.Builder()
            .setApiKey("AIzaSyADzttkHdFJ1m9hEEaX7Ab84QkBNfHjm_Q")
            .setApplicationId("1:195735209722:web:e9a36c806abeb048edeb43")
            .setProjectId("vsmske")
            .setGcmSenderId("195735209722")
            .build()
        val app = if (FirebaseApp.getApps(ctx).isEmpty()) FirebaseApp.initializeApp(ctx, opts) else FirebaseApp.getInstance()
        db = FirebaseFirestore.getInstance(app)
        auth = FirebaseAuth.getInstance(app)
        if (ru.vsmske.app.BuildConfig.EMU) {
            db.useEmulator("10.0.2.2", 8080)
            auth.useEmulator("10.0.2.2", 9099)
        }
    }

    val uid: String get() = auth.currentUser?.uid ?: ""
}
