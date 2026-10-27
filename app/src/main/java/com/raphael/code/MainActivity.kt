package com.raphael.code

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebView

class MainActivity : Activity() {

    private var web: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as App
        app.bridge.act = this
        val w = app.ensureWeb()
        (w.parent as? ViewGroup)?.removeView(w)
        app.ctx?.setBaseContext(this)
        setContentView(w)
        web = w
        if (Build.VERSION.SDK_INT < 30) app.bridge.askStorage(this)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val w = web
        if (w == null) {
            moveTaskToBack(true)
            return
        }
        w.evaluateJavascript("(window.__back&&window.__back())?'1':'0'") { r ->
            if (r != "\"1\"") moveTaskToBack(true)
        }
    }

    override fun onDestroy() {
        val app = application as App
        // Yalnızca bu aktivite hâlâ "aktif" ise WebView'i bırak; yeni aktivite devraldıysa dokunma.
        if (app.bridge.act === this) {
            app.bridge.act = null
            web?.let { (it.parent as? ViewGroup)?.removeView(it) }
            app.ctx?.setBaseContext(app)
        }
        super.onDestroy()
    }
}
