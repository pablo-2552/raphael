package com.raphael.code

import android.annotation.SuppressLint
import android.app.Application
import android.content.Intent
import android.content.MutableContextWrapper
import android.graphics.Color
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/**
 * WebView burada, uygulama düzeyinde yaşar. Activity kapansa (son uygulamalardan silinse)
 * bile ön plan servisi süreci canlı tuttuğu sürece agent çalışmaya devam eder.
 */
class App : Application() {
    var ctx: MutableContextWrapper? = null
    var web: WebView? = null
    lateinit var bridge: Bridge

    override fun onCreate() {
        super.onCreate()
        bridge = Bridge(this)
        bridge.evalJs = { code -> web?.evaluateJavascript(code, null) }
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun ensureWeb(): WebView {
        web?.let { return it }
        val c = MutableContextWrapper(this)
        ctx = c
        val w = WebView(c)
        w.setBackgroundColor(Color.parseColor("#0B0D12"))
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        w.settings.allowFileAccess = false
        w.settings.setSupportZoom(false)
        w.settings.textZoom = 100
        w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        w.webChromeClient = WebChromeClient()
        w.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return loader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == "appassets.androidplatform.net") return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (e: Exception) {
                    // yoksay
                }
                return true
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // Render süreci öldü: WebView'i at, yenisini kur
                web = null
                ctx = null
                try {
                    (view.parent as? ViewGroup)?.removeView(view)
                    view.destroy()
                } catch (e: Exception) {
                    // yoksay
                }
                bridge.act?.recreate()
                return true
            }
        }
        w.addJavascriptInterface(bridge, "Native")
        w.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
        web = w
        return w
    }
}
