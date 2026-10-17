package ru.vsmske.app

import android.app.Application
import ru.vsmske.app.data.Fb

class VsApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Fb.init(this)
    }
}
