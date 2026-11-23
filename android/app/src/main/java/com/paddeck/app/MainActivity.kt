package com.paddeck.app

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.net.wifi.WifiManager
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import kotlin.concurrent.thread

/**
 * PadDeck for Android: a full-screen kiosk shell around the dashboard served by the PC companion.
 * - Finds the PC automatically (UDP broadcast "PADDECK_DISCOVER" on port 47801).
 * - Keeps the screen on, hides system bars (immersive), survives Wi-Fi drops.
 * - Stylus MotionEvents (pressure, tilt, hover, buttons) reach the page as Pointer Events,
 *   which PadDeck's drawing-tablet mode streams to Windows.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var status: TextView
    private val prefs by lazy { getSharedPreferences("paddeck", Context.MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#07070D"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            isHapticFeedbackEnabled = true
            overScrollMode = View.OVER_SCROLL_NEVER
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                    if (req.isForMainFrame) showStatus("Can't reach the PC (${err.description}). Searching again…").also { discover() }
                }
                override fun onPageFinished(view: WebView, url: String) { status.visibility = View.GONE }
            }
            addJavascriptInterface(Bridge(), "PadDeckAndroid")
        }
        status = TextView(this).apply {
            setTextColor(Color.parseColor("#A5A6B8")); textSize = 18f; gravity = Gravity.CENTER
            setPadding(64, 64, 64, 64)
            setOnLongClickListener { askForAddress(); true }
        }
        setContentView(FrameLayout(this).apply {
            addView(web, FrameLayout.LayoutParams(-1, -1))
            addView(status, FrameLayout.LayoutParams(-1, -1))
        })
        hideSystemBars()

        val saved = prefs.getString("url", null)
        if (saved != null) load(saved) else discover()
    }

    private fun hideSystemBars() {
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.hide(WindowInsetsCompat.Type.systemBars())
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) hideSystemBars() }

    private fun load(url: String) { showStatus("Connecting to $url"); web.loadUrl(url) }

    private fun showStatus(text: String) = runOnUiThread { status.text = "$text\n\n(long-press to enter the PC address manually)"; status.visibility = View.VISIBLE }

    /** Broadcast on the LAN; the companion answers with its port. */
    private fun discover() {
        showStatus("Looking for PadDeck on your PC…")
        thread(isDaemon = true) {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val lock = wifi.createMulticastLock("paddeck").apply { setReferenceCounted(false); acquire() }
            try {
                DatagramSocket().use { sock ->
                    sock.broadcast = true
                    sock.soTimeout = 1500
                    val msg = "PADDECK_DISCOVER".toByteArray()
                    repeat(20) {
                        sock.send(DatagramPacket(msg, msg.size, InetAddress.getByName("255.255.255.255"), 47801))
                        try {
                            val buf = ByteArray(1024)
                            val pkt = DatagramPacket(buf, buf.size)
                            sock.receive(pkt)
                            val json = JSONObject(String(pkt.data, 0, pkt.length))
                            if (json.optString("app") == "PadDeck") {
                                val url = "http://${pkt.address.hostAddress}:${json.optInt("port", 47800)}/"
                                prefs.edit().putString("url", url).apply()
                                runOnUiThread { load(url) }
                                return@thread
                            }
                        } catch (_: SocketTimeoutException) { }
                    }
                }
                showStatus("No PC found. Is the PadDeck companion running and on the same Wi-Fi?")
            } catch (e: Exception) {
                showStatus("Discovery failed: ${e.message}")
            } finally { lock.release() }
        }
    }

    private fun askForAddress() {
        val input = EditText(this).apply { hint = "192.168.0.123:47800"; setText(prefs.getString("url", "")?.removePrefix("http://")?.trimEnd('/')) }
        AlertDialog.Builder(this).setTitle("PC address").setView(input)
            .setPositiveButton("Connect") { _, _ ->
                val v = input.text.toString().trim().removePrefix("http://").trimEnd('/')
                val url = "http://" + (if (v.contains(":")) v else "$v:47800") + "/"
                prefs.edit().putString("url", url).apply(); load(url)
            }
            .setNeutralButton("Search again") { _, _ -> prefs.edit().remove("url").apply(); discover() }
            .show()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() }

    inner class Bridge {
        @JavascriptInterface fun changePc() = runOnUiThread { askForAddress() }
        @JavascriptInterface fun version(): String = "1.0.0"
    }
}
