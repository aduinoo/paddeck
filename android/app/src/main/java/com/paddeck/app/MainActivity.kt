package com.paddeck.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONArray
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import kotlin.concurrent.thread

/**
 * PadDeck for Android. The interface is bundled in the APK (assets/web) and served locally by
 * WebViewAssetLoader; it talks to PadDeck Desktop on the PC over the local network.
 * Native parts: QR scanning, LAN discovery, file picking and immersive kiosk mode.
 */
class MainActivity : ComponentActivity() {
    lateinit var web: WebView
    private lateinit var root: FrameLayout
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val scanLauncher = registerForActivityResult(ScanContract()) { r ->
        if (r.contents != null) emit(JSONObject().put("type", "qr").put("text", r.contents))
    }
    private val fileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val cb = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val assets = WebViewAssetLoader.Builder()
            .setHttpAllowed(true)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#07070D"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            overScrollMode = View.OVER_SCROLL_NEVER
            isHapticFeedbackEnabled = true
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? = assets.shouldInterceptRequest(req.url)
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = cb
                    return try { fileLauncher.launch(params.createIntent()); true } catch (e: Exception) { fileCallback = null; false }
                }
            }
            addJavascriptInterface(Bridge(), "PadDeckAndroid")
        }
        root = FrameLayout(this).apply { addView(web, FrameLayout.LayoutParams(-1, -1)) }
        setContentView(root)
        hideSystemBars()
        web.loadUrl("http://appassets.androidplatform.net/assets/web/index.html")
    }

    private fun hideSystemBars() {
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.hide(WindowInsetsCompat.Type.systemBars())
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) hideSystemBars() }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }

    /** Sends an event to the page: window 'paddeck-native' CustomEvent. */
    fun emit(obj: JSONObject) {
        val js = "window.dispatchEvent(new CustomEvent('paddeck-native',{detail:${obj}}))"
        runOnUiThread { web.evaluateJavascript(js, null) }
    }

    /** UDP broadcast "PADDECK_DISCOVER" on port 47801; every PadDeck Desktop on the LAN answers. */
    private fun discover() {
        thread(isDaemon = true) {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val lock = wifi.createMulticastLock("paddeck").apply { setReferenceCounted(false); acquire() }
            val found = LinkedHashMap<String, JSONObject>()
            try {
                DatagramSocket().use { sock ->
                    sock.broadcast = true
                    sock.soTimeout = 500
                    val msg = "PADDECK_DISCOVER".toByteArray()
                    repeat(6) {
                        sock.send(DatagramPacket(msg, msg.size, InetAddress.getByName("255.255.255.255"), 47801))
                        val until = System.currentTimeMillis() + 500
                        while (System.currentTimeMillis() < until) {
                            try {
                                val buf = ByteArray(1024); val pkt = DatagramPacket(buf, buf.size)
                                sock.receive(pkt)
                                val j = JSONObject(String(pkt.data, 0, pkt.length))
                                if (j.optString("app") == "PadDeck") {
                                    val host = pkt.address.hostAddress ?: continue
                                    found[host] = JSONObject().put("host", host).put("port", j.optInt("port", 47800)).put("name", j.optString("host", host))
                                    emit(JSONObject().put("type", "discovered").put("pcs", JSONArray(found.values.toList())))
                                }
                            } catch (_: SocketTimeoutException) { break }
                        }
                    }
                }
            } catch (_: Exception) { } finally { lock.release() }
            emit(JSONObject().put("type", "discovered").put("pcs", JSONArray(found.values.toList())).put("done", true))
        }
    }

    inner class Bridge {
        @JavascriptInterface fun version(): String = "2.1.0"
        @JavascriptInterface fun scanQr() = runOnUiThread {
            scanLauncher.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("Scan the QR code shown in PadDeck Desktop").setBeepEnabled(false).setOrientationLocked(false))
        }
        @JavascriptInterface fun discover() = this@MainActivity.discover()
        @JavascriptInterface fun changePc() = emit(JSONObject().put("type", "changePc"))
        @JavascriptInterface fun vibrate(ms: Int) {
            val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms.toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
        }
    }
}
