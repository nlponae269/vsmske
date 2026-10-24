package ru.vsmske.app.music

import android.content.Context
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

/**
 * Эквалайзер как на сайте (6.4): 10 полос ±12 дБ (крайние — полки, остальные — «колокол», Q 1.1),
 * «Усиление басов» 0–12 дБ (полка 90 Гц), запас громкости и мягкий лимитер, чтобы подъём не хрипел.
 * Настройки — SharedPreferences «vs» → «eq» (тот же смысл, что localStorage vs_eq на сайте).
 */
object Eq {
    val F = intArrayOf(32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000)
    val PRESETS = linkedMapOf(
        "flat" to ("Обычный" to intArrayOf(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)), "bass" to ("Басы" to intArrayOf(6, 5, 4, 2, 0, 0, 0, 0, 0, 0)),
        "pop" to ("Поп" to intArrayOf(-1, 1, 3, 4, 3, 0, -1, -1, 1, 2)), "rock" to ("Рок" to intArrayOf(5, 3, -1, -3, -1, 2, 4, 5, 5, 5)),
        "edm" to ("Электроника" to intArrayOf(6, 5, 1, 0, -2, 1, 0, 2, 4, 5)), "hiphop" to ("Хип-хоп" to intArrayOf(6, 5, 2, 3, -1, -1, 1, 0, 2, 3)),
        "vocal" to ("Вокал" to intArrayOf(-2, -3, -2, 1, 4, 4, 3, 1, 0, -1)), "jazz" to ("Джаз" to intArrayOf(3, 2, 1, 2, -1, -1, 0, 1, 2, 3)),
        "classic" to ("Классика" to intArrayOf(4, 3, 2, 1, -1, -1, 0, 2, 3, 4)), "acoustic" to ("Акустика" to intArrayOf(4, 3, 2, 1, 1, 1, 2, 3, 3, 2)),
    )

    data class Settings(val on: Boolean = false, val preset: String = "flat", val bass: Int = 0, val bands: List<Int> = List(10) { 0 }) {
        val active get() = on && (bass != 0 || bands.any { it != 0 })
    }

    val state = MutableStateFlow(Settings())
    @Volatile var version = 0; private set
    private var prefs: android.content.SharedPreferences? = null

    fun load(ctx: Context) {
        val p = ctx.getSharedPreferences("vs", Context.MODE_PRIVATE); prefs = p
        runCatching {
            val j = JSONObject(p.getString("eq", null) ?: return)
            val arr = j.optJSONArray("bands")
            state.value = Settings(j.optBoolean("on"), j.optString("preset", "flat"), j.optInt("bass").coerceIn(0, 12),
                List(10) { i -> (arr?.optInt(i) ?: 0).coerceIn(-12, 12) })
            version++
        }
    }

    fun set(s: Settings) {
        state.value = s; version++
        prefs?.edit()?.putString("eq", JSONObject().put("on", s.on).put("preset", s.preset).put("bass", s.bass).put("bands", JSONArray(s.bands)).toString())?.apply()
    }
    fun toggle() = set(state.value.copy(on = !state.value.on))
    fun preset(k: String) { val p = PRESETS[k] ?: return; set(state.value.copy(on = true, preset = k, bands = p.second.toList())) }
    fun band(i: Int, db: Int) = set(state.value.copy(on = true, preset = "custom", bands = state.value.bands.toMutableList().also { it[i] = db.coerceIn(-12, 12) }))
    fun bass(db: Int) = set(state.value.copy(on = true, bass = db.coerceIn(0, 12)))
    fun reset() = set(Settings(on = state.value.on))

    /** Отклик АЧХ в дБ на частоте f — для кривой на экране */
    fun response(f: Double, s: Settings = state.value, sr: Double = 44100.0): Double {
        if (!s.on) return 0.0
        var db = 0.0
        coeffs(s, sr).forEach { c -> db += c.gainAt(f, sr) }
        return db
    }

    /** Коэффициенты биквадов (формулы RBJ, как у BiquadFilterNode) */
    class Bq(val b0: Double, val b1: Double, val b2: Double, val a1: Double, val a2: Double) {
        fun gainAt(f: Double, sr: Double): Double {
            val w = 2 * PI * f / sr
            val cr = b0 + b1 * cos(w) + b2 * cos(2 * w); val ci = -(b1 * sin(w) + b2 * sin(2 * w))
            val dr = 1 + a1 * cos(w) + a2 * cos(2 * w); val di = -(a1 * sin(w) + a2 * sin(2 * w))
            return 10 * kotlin.math.log10((cr * cr + ci * ci) / (dr * dr + di * di))
        }
    }

    private fun peaking(f: Double, q: Double, db: Double, sr: Double): Bq {
        val a = 10.0.pow(db / 40); val w = 2 * PI * f / sr; val al = sin(w) / (2 * q); val cw = cos(w)
        val a0 = 1 + al / a
        return Bq((1 + al * a) / a0, -2 * cw / a0, (1 - al * a) / a0, -2 * cw / a0, (1 - al / a) / a0)
    }
    private fun shelf(f: Double, db: Double, sr: Double, low: Boolean): Bq {
        val a = 10.0.pow(db / 40); val w = 2 * PI * f / sr; val cw = cos(w); val sw = sin(w)
        val al = sw / 2 * sqrt(2.0); val sa = 2 * sqrt(a) * al
        return if (low) {
            val a0 = (a + 1) + (a - 1) * cw + sa
            Bq(a * ((a + 1) - (a - 1) * cw + sa) / a0, 2 * a * ((a - 1) - (a + 1) * cw) / a0, a * ((a + 1) - (a - 1) * cw - sa) / a0,
                -2 * ((a - 1) + (a + 1) * cw) / a0, ((a + 1) + (a - 1) * cw - sa) / a0)
        } else {
            val a0 = (a + 1) - (a - 1) * cw + sa
            Bq(a * ((a + 1) + (a - 1) * cw + sa) / a0, -2 * a * ((a - 1) + (a + 1) * cw) / a0, a * ((a + 1) + (a - 1) * cw - sa) / a0,
                2 * ((a - 1) - (a + 1) * cw) / a0, ((a + 1) - (a - 1) * cw - sa) / a0)
        }
    }

    fun coeffs(s: Settings, sr: Double): List<Bq> {
        val out = ArrayList<Bq>(11)
        for (i in 0 until 10) {
            val g = s.bands[i].toDouble(); if (g == 0.0) continue
            val f = minOf(F[i].toDouble(), sr * 0.45)
            out += when (i) { 0 -> shelf(f, g, sr, true); 9 -> shelf(f, g, sr, false); else -> peaking(f, 1.1, g, sr) }
        }
        if (s.bass != 0) out += shelf(90.0, s.bass.toDouble(), sr, true)
        return out
    }

    /** Запас громкости (как pre.gain на сайте) */
    fun preGain(s: Settings): Double { val boost = maxOf(0, s.bands.maxOrNull() ?: 0) + s.bass * 0.7; return 10.0.pow(-boost * 0.5 / 20) }
}

/** Обработка звука в ExoPlayer: PCM 16 бит, цепочка биквадов на каждый канал + лимитер */
@UnstableApi
class EqProcessor : BaseAudioProcessor() {
    private var ver = -1
    private var filters: List<Eq.Bq> = emptyList()
    private var pre = 1.0
    private var on = false
    private var ch = 2
    private var z1 = DoubleArray(0); private var z2 = DoubleArray(0)

    override fun onConfigure(input: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (input.encoding != C.ENCODING_PCM_16BIT) return AudioProcessor.AudioFormat.NOT_SET   // не 16 бит — пропускаем как есть
        ch = input.channelCount; ver = -1
        return input
    }

    private fun refresh() {
        if (ver == Eq.version) return
        ver = Eq.version
        val s = Eq.state.value
        on = s.active
        filters = if (on) Eq.coeffs(s, inputAudioFormat.sampleRate.toDouble()) else emptyList()
        pre = if (on) Eq.preGain(s) else 1.0
        z1 = DoubleArray(filters.size * ch); z2 = DoubleArray(filters.size * ch)
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        refresh()
        val size = inputBuffer.remaining()
        if (size == 0) return
        val out = replaceOutputBuffer(size)
        if (!on) { out.put(inputBuffer); out.flip(); return }
        val inp = inputBuffer.order(ByteOrder.nativeOrder())
        out.order(ByteOrder.nativeOrder())
        var c = 0
        val nf = filters.size
        while (inp.remaining() >= 2) {
            var x = inp.short / 32768.0 * pre
            for (k in 0 until nf) {
                val f = filters[k]; val j = k * ch + c
                val y = f.b0 * x + z1[j]
                z1[j] = f.b1 * x - f.a1 * y + z2[j]
                z2[j] = f.b2 * x - f.a2 * y
                x = y
            }
            // мягкий лимитер: до −1.5 дБ линейно, выше — плавное насыщение
            val lim = 0.84
            if (x > lim) x = lim + (1 - lim) * tanh((x - lim) / (1 - lim)) else if (x < -lim) x = -lim - (1 - lim) * tanh((-x - lim) / (1 - lim))
            out.putShort((x * 32767).toInt().coerceIn(-32768, 32767).toShort())
            c = (c + 1) % ch
        }
        out.flip()
    }

    override fun onFlush() { z1.fill(0.0); z2.fill(0.0); ver = -1 }
    override fun onReset() { filters = emptyList(); ver = -1 }
}
