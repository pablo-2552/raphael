package com.raphael.code

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/** JavaScript köprüsü: güvenli dosya işlemleri, pano, izinler, ön plan servisi ve bildirimler. */
class Bridge(private val app: Context) {

    @Volatile
    var act: Activity? = null
    private val main = Handler(Looper.getMainLooper())
    private val conns = ConcurrentHashMap<String, HttpURLConnection>()

    /** WebView'e JS göndermek için (App tarafından bağlanır). */
    @Volatile
    var evalJs: ((String) -> Unit)? = null

    private fun emit(id: String, kind: String, data: String) {
        val code = "window.__nh&&window.__nh(" + JSONObject.quote(id) + "," + JSONObject.quote(kind) + "," + JSONObject.quote(data) + ")"
        main.post { evalJs?.invoke(code) }
    }

    // ---- Güvenli depolama kökü: /storage/emulated/0 (Android/ klasörü yasak) ----
    private val root: File by lazy { Environment.getExternalStorageDirectory().canonicalFile }
    private val protectedTop = setOf(
        "download", "documents", "dcim", "pictures", "music", "movies",
        "android", "alarms", "notifications", "podcasts", "ringtones"
    )
    private val skipNames = setOf(".git", "node_modules", ".godot", ".import", ".gradle")
    private val textExt = setOf(
        "txt", "md", "json", "js", "ts", "jsx", "tsx", "html", "htm", "css", "scss", "py", "kt", "java",
        "c", "h", "cpp", "cs", "gd", "gdshader", "tscn", "tres", "godot", "cfg", "ini", "toml", "yml",
        "yaml", "xml", "sh", "gradle", "properties", "lua", "rb", "go", "rs", "php", "sql", "csv", "svg"
    )

    // ---- İzinler ----
    private fun hasStorageNow(): Boolean =
        if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
        else app.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    fun askStorage(a: Activity) {
        if (hasStorageNow()) return
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                a.startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + a.packageName)))
            } catch (e: Exception) {
                a.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        } else {
            a.requestPermissions(
                arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE), 1
            )
        }
    }

    // ---- Yol güvenliği ----
    private fun res(p: String): File {
        var s = p.trim().replace('\\', '/')
        val rp = root.path
        for (pre in listOf(rp, "/storage/emulated/0", "/sdcard", "sdcard")) {
            if (s == pre || s.startsWith("$pre/")) {
                s = s.removePrefix(pre)
                break
            }
        }
        s = s.trimStart('/')
        val f = File(root, s).canonicalFile
        if (!(f.path == rp || f.path.startsWith("$rp/"))) throw SecurityException("Erişim engellendi: depolama kökü dışı")
        val first = f.path.removePrefix(rp).trimStart('/').substringBefore('/')
        if (first.equals("Android", true)) throw SecurityException("Erişim engellendi: Android klasörü")
        return f
    }

    private fun rel(f: File): String = "/" + f.path.removePrefix(root.path).trimStart('/')

    private fun isTop(f: File): Boolean = f.parentFile?.path == root.path

    private fun isBlocked(f: File): Boolean = isTop(f) && f.name.equals("Android", true)

    private fun guardTop(f: File) {
        if (f.path == root.path || (isTop(f) && protectedTop.contains(f.name.lowercase())))
            throw SecurityException("Ana klasörler silinemez/taşınamaz: " + rel(f))
    }

    private fun j(f: () -> JSONObject): String = try {
        f().put("ok", true).toString()
    } catch (e: Throwable) {
        JSONObject().put("ok", false).put("error", e.message ?: e.javaClass.simpleName).toString()
    }

    private fun walk(b: File): Sequence<File> =
        if (b.isDirectory) b.walkTopDown().onEnter { d -> !skipNames.contains(d.name) } else sequenceOf(b)

    private fun zipTo(src: File, dest: File) {
        dest.parentFile?.mkdirs()
        val destPath = dest.canonicalPath
        ZipOutputStream(BufferedOutputStream(FileOutputStream(dest))).use { z ->
            val base = if (src.isDirectory) src else (src.parentFile ?: src)
            for (f in walk(src)) {
                if (!f.isFile || f.canonicalPath == destPath) continue
                val name = f.relativeTo(base).path.replace('\\', '/')
                z.putNextEntry(ZipEntry(name))
                f.inputStream().use { it.copyTo(z) }
                z.closeEntry()
            }
        }
    }

    private fun unzipTo(zip: File, dest: File): Int {
        dest.mkdirs()
        val destPath = dest.canonicalPath
        var n = 0
        ZipInputStream(BufferedInputStream(FileInputStream(zip))).use { zi ->
            var e: ZipEntry? = zi.nextEntry
            while (e != null) {
                val out = File(dest, e.name).canonicalFile
                if (!(out.path == destPath || out.path.startsWith(destPath + File.separator)))
                    throw SecurityException("Zip içinde geçersiz yol: " + e.name)
                if (e.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    FileOutputStream(out).use { zi.copyTo(it) }
                    n++
                }
                zi.closeEntry()
                e = zi.nextEntry
            }
        }
        return n
    }

    // ================= JavaScript'e açılan yöntemler =================

    @JavascriptInterface
    fun hasStorage(): Boolean = hasStorageNow()

    @JavascriptInterface
    fun requestStorage() {
        main.post { act?.let { askStorage(it) } }
    }

    @JavascriptInterface
    fun copyText(t: String) {
        main.post {
            val cm = app.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("Raphael", t))
            Toast.makeText(app, "Kopyalandı", Toast.LENGTH_SHORT).show()
        }
    }

    // ---- yerel HTTP: tarayıcı CORS kısıtı olmadan, akışlı (NVIDIA vb. için) ----
    @JavascriptInterface
    fun httpStart(id: String, url: String, method: String, headersJson: String, body: String) {
        Thread {
            var c: HttpURLConnection? = null
            try {
                c = URL(url).openConnection() as HttpURLConnection
                conns[id] = c
                c.requestMethod = method
                c.connectTimeout = 20000
                c.readTimeout = 300000
                c.setRequestProperty("Accept-Encoding", "identity")
                val h = JSONObject(headersJson)
                for (k in h.keys()) c.setRequestProperty(k, h.getString(k))
                if (body.isNotEmpty()) {
                    c.doOutput = true
                    c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                }
                val code = c.responseCode
                emit(id, "s", code.toString())
                val ins = if (code >= 400) c.errorStream else c.inputStream
                if (ins != null) {
                    val buf = ByteArray(4096)
                    while (true) {
                        val n = ins.read(buf)
                        if (n < 0) break
                        if (n > 0) emit(id, "d", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP))
                    }
                }
                emit(id, "e", "")
            } catch (e: Throwable) {
                emit(id, "x", e.message ?: e.javaClass.simpleName)
            } finally {
                conns.remove(id)
                try {
                    c?.disconnect()
                } catch (e: Exception) {
                    // yoksay
                }
            }
        }.start()
    }

    @JavascriptInterface
    fun httpAbort(id: String) {
        try {
            conns[id]?.disconnect()
        } catch (e: Exception) {
            // yoksay
        }
    }

    // ---- ön plan servisi + bildirimler ----
    @JavascriptInterface
    fun runStart(text: String) {
        try {
            RunService.start(app, text)
        } catch (e: Exception) {
            // arka plandan başlatma kısıtı vb.: sessizce geç
        }
    }

    @JavascriptInterface
    fun runStop() {
        try {
            RunService.stop(app)
        } catch (e: Exception) {
            // yoksay
        }
    }

    @JavascriptInterface
    fun notifyDone(title: String, text: String) {
        try {
            RunService.notifyDone(app, title, text)
        } catch (e: Exception) {
            // yoksay
        }
    }

    // ---- dosya işlemleri ----
    @JavascriptInterface
    fun fsList(p: String): String = j {
        val d = res(p)
        if (!d.isDirectory) throw IOException("Klasör değil veya yok: " + rel(d))
        val kids = (d.listFiles() ?: throw IOException("Okunamadı (izin verildi mi?)"))
            .filter { !isBlocked(it) }
            .sortedWith(compareBy<File>({ !it.isDirectory }, { it.name.lowercase() }))
        val arr = JSONArray()
        for (k in kids.take(500)) {
            arr.put(
                JSONObject().put("n", k.name).put("d", k.isDirectory)
                    .put("s", if (k.isFile) k.length() else 0L).put("t", k.lastModified())
            )
        }
        JSONObject().put("entries", arr).put("path", rel(d)).put("total", kids.size)
    }

    @JavascriptInterface
    fun fsRead(p: String, max: Int): String = j {
        val f = res(p)
        if (!f.isFile) throw IOException("Dosya yok: " + rel(f))
        if (f.length() > 8_000_000L) throw IOException("Dosya çok büyük (>8MB)")
        val cap = if (max <= 0) 200000 else max
        val text = f.readText()
        if (text.take(2000).contains('\u0000')) throw IOException("İkili dosya, okunamaz")
        val cut = text.length > cap
        JSONObject().put("content", if (cut) text.substring(0, cap) else text)
            .put("truncated", cut).put("size", f.length())
    }

    @JavascriptInterface
    fun fsWrite(p: String, content: String, append: Boolean): String = j {
        val f = res(p)
        if (f.isDirectory) throw IOException("Bu bir klasör: " + rel(f))
        f.parentFile?.mkdirs()
        if (append) f.appendText(content) else f.writeText(content)
        JSONObject().put("path", rel(f)).put("size", f.length())
    }

    @JavascriptInterface
    fun fsMkdir(p: String): String = j {
        val f = res(p)
        if (!f.mkdirs() && !f.isDirectory) throw IOException("Klasör oluşturulamadı: " + rel(f))
        JSONObject().put("path", rel(f))
    }

    @JavascriptInterface
    fun fsDelete(p: String): String = j {
        val f = res(p)
        guardTop(f)
        if (!f.exists()) throw IOException("Yok: " + rel(f))
        val ok = if (f.isDirectory) f.deleteRecursively() else f.delete()
        if (!ok) throw IOException("Silinemedi: " + rel(f))
        JSONObject().put("path", rel(f))
    }

    @JavascriptInterface
    fun fsMove(a: String, b: String): String = j {
        val s = res(a)
        guardTop(s)
        var d = res(b)
        if (!s.exists()) throw IOException("Kaynak yok: " + rel(s))
        if (d.isDirectory) d = File(d, s.name)
        d.parentFile?.mkdirs()
        if (!s.renameTo(d)) {
            s.copyRecursively(d, true)
            s.deleteRecursively()
        }
        JSONObject().put("path", rel(d))
    }

    @JavascriptInterface
    fun fsCopy(a: String, b: String): String = j {
        val s = res(a)
        var d = res(b)
        if (!s.exists()) throw IOException("Kaynak yok: " + rel(s))
        if (d.isDirectory) d = File(d, s.name)
        d.parentFile?.mkdirs()
        if (!s.copyRecursively(d, true)) throw IOException("Kopyalanamadı")
        JSONObject().put("path", rel(d))
    }

    @JavascriptInterface
    fun fsZip(a: String, b: String): String = j {
        val s = res(a)
        val d = res(b)
        if (!s.exists()) throw IOException("Kaynak yok: " + rel(s))
        zipTo(s, d)
        JSONObject().put("path", rel(d)).put("size", d.length())
    }

    @JavascriptInterface
    fun fsUnzip(a: String, b: String): String = j {
        val s = res(a)
        val d = res(b)
        if (!s.isFile) throw IOException("Zip yok: " + rel(s))
        val n = unzipTo(s, d)
        JSONObject().put("path", rel(d)).put("count", n)
    }

    @JavascriptInterface
    fun fsSearch(p: String, q: String, content: Boolean): String = j {
        val base = res(p)
        if (!base.exists()) throw IOException("Yol yok: " + rel(base))
        val needle = q.lowercase()
        val out = JSONArray()
        var n = 0
        var truncated = false
        for (f in walk(base)) {
            if (f == base || isBlocked(f)) continue
            val rp = f.relativeTo(base).path
            if (!content) {
                if (f.name.lowercase().contains(needle)) {
                    out.put(rp + if (f.isDirectory) "/" else "")
                    n++
                }
            } else if (f.isFile && f.length() < 600_000L && textExt.contains(f.extension.lowercase())) {
                var ln = 0
                try {
                    f.forEachLine { line ->
                        ln++
                        if (n < 60 && line.lowercase().contains(needle)) {
                            out.put(rp + ":" + ln + ": " + line.trim().take(160))
                            n++
                        }
                    }
                } catch (e: Exception) {
                    // okunamayan dosyayı atla
                }
            }
            if (n >= 60) {
                truncated = true
                break
            }
        }
        JSONObject().put("results", out).put("truncated", truncated)
    }

    @JavascriptInterface
    fun fsTree(p: String, depth: Int): String = j {
        val base = res(p)
        if (!base.isDirectory) throw IOException("Klasör değil veya yok: " + rel(base))
        val arr = JSONArray()
        var truncated = false
        fun rec(d: File, lvl: Int) {
            if (truncated) return
            val kids = (d.listFiles() ?: return)
                .filter { !isBlocked(it) && !skipNames.contains(it.name) }
                .sortedWith(compareBy<File>({ !it.isDirectory }, { it.name.lowercase() }))
            for (k in kids) {
                if (arr.length() >= 400) {
                    truncated = true
                    return
                }
                arr.put(
                    JSONObject().put("p", k.relativeTo(base).path).put("d", k.isDirectory)
                        .put("s", if (k.isFile) k.length() else 0L)
                )
                if (k.isDirectory && lvl < depth) rec(k, lvl + 1)
            }
        }
        rec(base, 1)
        JSONObject().put("entries", arr).put("truncated", truncated)
    }
}
