package com.raphael.code

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager

/** Agent çalışırken süreci canlı tutan ön plan servisi (bildirim çubuğunda "çalışıyor" gösterir). */
class RunService : Service() {
    private var wl: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Raphael çalışıyor"
        ensureChannels(this)
        startForeground(1, buildRun(this, text))
        if (wl == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            val lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "raphael:run")
            lock.acquire(60 * 60 * 1000L)
            wl = lock
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        wl?.let { if (it.isHeld) it.release() }
        wl = null
        super.onDestroy()
    }

    companion object {
        const val CH_RUN = "raphael_run"
        const val CH_DONE = "raphael_done"
        const val EXTRA_TEXT = "text"

        fun ensureChannels(ctx: Context) {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CH_RUN) == null) {
                nm.createNotificationChannel(NotificationChannel(CH_RUN, "Çalışan görev", NotificationManager.IMPORTANCE_LOW))
            }
            if (nm.getNotificationChannel(CH_DONE) == null) {
                nm.createNotificationChannel(NotificationChannel(CH_DONE, "Görev bitti", NotificationManager.IMPORTANCE_DEFAULT))
            }
        }

        private fun openApp(ctx: Context): PendingIntent {
            val i = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            return PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }

        private fun buildRun(ctx: Context, text: String): Notification =
            Notification.Builder(ctx, CH_RUN)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Raphael çalışıyor")
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openApp(ctx))
                .build()

        fun start(ctx: Context, text: String) {
            ctx.startForegroundService(Intent(ctx, RunService::class.java).putExtra(EXTRA_TEXT, text))
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, RunService::class.java))
        }

        fun notifyDone(ctx: Context, title: String, text: String) {
            ensureChannels(ctx)
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val n = Notification.Builder(ctx, CH_DONE)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setContentIntent(openApp(ctx))
                .build()
            nm.notify(2, n)
        }
    }
}
