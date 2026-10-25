package ru.vsmske.app

import android.app.Application
import ru.vsmske.app.data.Fire
import ru.vsmske.app.data.Net

class VsApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Fire.init(this)
        Net.init(this)
    }
}
