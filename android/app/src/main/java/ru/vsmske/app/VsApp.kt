package ru.vsmske.app

import android.app.Application
import ru.vsmske.app.data.Fire

class VsApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Fire.init(this)
    }
}
