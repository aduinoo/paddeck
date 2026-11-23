package com.paddeck.app

import android.annotation.SuppressLint
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.tan

/**
 * Transparent layer over the drawing-tablet area. Stylus events (Xiaomi Smart Pen) are read
 * natively from MotionEvent - pressure, AXIS_TILT/AXIS_ORIENTATION, hover, stylus buttons,
 * eraser tool and every batched historical sample - and streamed to the PC over a dedicated
 * WebSocket, where they are injected as a real Windows pen. Finger touches are not consumed,
 * so they fall through to the page underneath (gestures, palm rejection).
 */
@SuppressLint("ViewConstructor")
class PenOverlay(private val act: MainActivity) : View(act) {
    private val http = OkHttpClient.Builder().pingInterval(10, TimeUnit.SECONDS).build()
    private var ws: WebSocket? = null
    private var server = ""; private var token = ""
    private var gamma = 1.0; private var pMin = 0.0; private var pMax = 1.0; private var smoothing = 0.0
    private var hover = true; private var barrelMode = "rightClick"; private var offX = 0f; private var offY = 0f
    private var dpr = 1f; private var areaX = 0f; private var areaY = 0f
    private var closed = false
    // status for the page
    private var seen = false; private var sawPressure = false; private var sawTilt = false; private var sawHover = false
    private var sawBarrel = false; private var sawEraser = false; private var maxP = 0f; private var count = 0; private var rate = 0
    private var lastP = 0f; private var contact = false; private var inRange = false; private var lx = 0f; private var ly = 0f; private var isEraser = false
    private var sx = -1f; private var sy = -1f
    private val ticker = object : Runnable {
        var lastRate = System.currentTimeMillis()
        override fun run() {
            if (closed) return
            val now = System.currentTimeMillis()
            if (now - lastRate >= 1000) { rate = count; count = 0; lastRate = now }
            act.emit(JSONObject().put("type", "penStatus").put("seen", seen).put("pressure", sawPressure).put("tilt", sawTilt).put("hover", sawHover)
                .put("barrel", sawBarrel).put("eraser", sawEraser).put("maxP", maxP.toDouble()).put("rate", rate).put("p", lastP.toDouble())
                .put("contact", contact).put("inRange", inRange).put("x", ((lx + left) / dpr).toDouble()).put("y", ((ly + top) / dpr).toDouble()).put("isEraser", isEraser))
            postDelayed(this, 120)
        }
    }

    init { post(ticker) }

    fun configure(j: JSONObject) {
        dpr = j.optDouble("dpr", act.resources.displayMetrics.density.toDouble()).toFloat()
        areaX = j.optDouble("x").toFloat() * dpr; areaY = j.optDouble("y").toFloat() * dpr
        val lp = FrameLayout.LayoutParams((j.optDouble("w") * dpr).toInt(), (j.optDouble("h") * dpr).toInt())
        lp.leftMargin = areaX.toInt(); lp.topMargin = areaY.toInt()
        layoutParams = lp
        val cfg = j.optJSONObject("cfg") ?: JSONObject()
        gamma = cfg.optDouble("gamma", 1.0); pMin = cfg.optDouble("min", 0.0); pMax = cfg.optDouble("max", 1.0)
        smoothing = cfg.optDouble("smoothing", 0.0); hover = cfg.optBoolean("hover", true); barrelMode = cfg.optString("barrel", "rightClick")
        val off = cfg.optJSONObject("offset"); offX = (off?.optDouble("dx", 0.0) ?: 0.0).toFloat() * dpr; offY = (off?.optDouble("dy", 0.0) ?: 0.0).toFloat() * dpr
        val srv = j.optString("server"); val tok = j.optString("token")
        if (srv != server || tok != token || ws == null) { server = srv; token = tok; connect() }
    }

    private fun connect() {
        ws?.cancel(); ws = null
        if (server.isEmpty() || token.isEmpty() || closed) return
        val req = Request.Builder().url(server.replaceFirst("http", "ws") + "/ws").build()
        ws = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { webSocket.send(JSONObject().put("type", "auth").put("token", token).toString()) }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { if (!closed) postDelayed({ connect() }, 1500) }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { if (!closed && code != 4001) postDelayed({ connect() }, 1500) }
        })
    }

    fun shutdown() {
        closed = true
        removeCallbacks(ticker)
        ws?.send(JSONObject().put("type", "pen").put("phase", "leave").put("x", 0).put("y", 0).toString())
        ws?.close(1000, "bye"); ws = null
    }

    private fun isStylus(e: MotionEvent, i: Int = 0) = e.getToolType(i) == MotionEvent.TOOL_TYPE_STYLUS || e.getToolType(i) == MotionEvent.TOOL_TYPE_ERASER

    private fun curve(p: Float): Double {
        val v = ((p.toDouble() - pMin) / max(0.01, pMax - pMin)).coerceIn(0.0, 1.0)
        return v.pow(gamma)
    }

    private fun send(phase: String, x: Float, y: Float, pressure: Float, tilt: Float, orient: Float, buttons: Int, eraserTool: Boolean) {
        var px = x + offX; var py = y + offY
        val sm = smoothing.toFloat()
        if (phase == "down" || sx < 0) { sx = px; sy = py } else if (sm > 0f) { sx += (px - sx) * (1f - sm); sy += (py - sy) * (1f - sm); px = sx; py = sy }
        val nx = (px / width).coerceIn(0f, 1f); val ny = (py / height).coerceIn(0f, 1f)
        val barrelBtn = buttons and MotionEvent.BUTTON_STYLUS_PRIMARY != 0
        val secondBtn = buttons and MotionEvent.BUTTON_STYLUS_SECONDARY != 0
        val eraser = eraserTool || secondBtn || (barrelMode == "eraser" && barrelBtn)
        val barrel = barrelMode == "rightClick" && barrelBtn
        // AXIS_TILT is the angle from perpendicular, AXIS_ORIENTATION its direction (radians).
        val tx = Math.toDegrees(atan(tan(tilt.toDouble()) * sin(orient.toDouble()))).toInt()
        val ty = Math.toDegrees(atan(-tan(tilt.toDouble()) * cos(orient.toDouble()))).toInt()
        val p = if (phase == "down" || phase == "move") curve(pressure) else 0.0
        ws?.send(JSONObject().put("type", "pen").put("phase", phase).put("x", nx.toDouble()).put("y", ny.toDouble()).put("p", p)
            .put("tx", tx.coerceIn(-90, 90)).put("ty", ty.coerceIn(-90, 90)).put("b", barrel).put("e", eraser).toString())
        count++
        seen = true
        if (phase == "move" && pressure > 0f && pressure != 1f) sawPressure = true
        if (tilt != 0f) sawTilt = true
        if (phase == "hover") sawHover = true
        if (barrelBtn) sawBarrel = true
        if (eraser) sawEraser = true
        maxP = max(maxP, pressure); lastP = p.toFloat(); lx = x; ly = y; isEraser = eraser
    }

    private fun dispatch(e: MotionEvent, phase: String) {
        val eraserTool = e.getToolType(0) == MotionEvent.TOOL_TYPE_ERASER
        if (phase == "move") {
            for (h in 0 until e.historySize) {
                send("move", e.getHistoricalX(h), e.getHistoricalY(h), e.getHistoricalPressure(h),
                    e.getHistoricalAxisValue(MotionEvent.AXIS_TILT, h), e.getHistoricalAxisValue(MotionEvent.AXIS_ORIENTATION, h), e.buttonState, eraserTool)
            }
        }
        send(phase, e.x, e.y, e.pressure, e.getAxisValue(MotionEvent.AXIS_TILT), e.getAxisValue(MotionEvent.AXIS_ORIENTATION), e.buttonState, eraserTool)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (!isStylus(e)) return false // fingers fall through to the page
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> { contact = true; inRange = true; dispatch(e, "down") }
            MotionEvent.ACTION_MOVE -> dispatch(e, "move")
            MotionEvent.ACTION_UP -> { dispatch(e, "up"); contact = false }
            MotionEvent.ACTION_CANCEL -> { dispatch(e, "up"); contact = false }
        }
        return true
    }

    override fun onHoverEvent(e: MotionEvent): Boolean {
        if (!isStylus(e)) return false
        when (e.actionMasked) {
            MotionEvent.ACTION_HOVER_ENTER, MotionEvent.ACTION_HOVER_MOVE -> { inRange = true; if (hover) dispatch(e, "hover") }
            MotionEvent.ACTION_HOVER_EXIT -> { if (!contact) { inRange = false; dispatch(e, "leave") } }
        }
        return true
    }

    override fun onGenericMotionEvent(e: MotionEvent): Boolean = if (e.isFromSource(android.view.InputDevice.SOURCE_STYLUS)) onHoverEvent(e) else false
}
