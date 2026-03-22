package com.lukasz.matrix;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.IBinder;
import android.os.PowerManager;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;

public class MatrixService extends Service {

    private static final String CHANNEL_ID = "szept_service";
    private static final int NOTIFICATION_ID = 1;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Intent mainIntent = new Intent(this, MainActivity.class);
        mainIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, mainIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Build notification using reflection for Notification.Builder(Context, String) constructor (API 26+)
        Notification notification;
        try {
            Constructor<Notification.Builder> ctor = Notification.Builder.class.getConstructor(Context.class, String.class);
            notification = ctor.newInstance(this, CHANNEL_ID)
                .setContentTitle("szept")
                .setContentText("Connected and receiving messages")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
        } catch (Exception e) {
            // Fallback for compile — should not happen at runtime with API 26+
            notification = new Notification.Builder(this)
                .setContentTitle("szept")
                .setContentText("Connected and receiving messages")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
        }

        startForeground(NOTIFICATION_ID, notification);

        // Partial wake lock
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "szept::BackgroundSync");
        wakeLock.acquire();

        return START_STICKY;
    }

    private void createNotificationChannel() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            Class<?> channelClass = Class.forName("android.app.NotificationChannel");
            Constructor<?> ctor = channelClass.getConstructor(String.class, CharSequence.class, int.class);
            Object channel = ctor.newInstance(CHANNEL_ID, "szept Background", 2); // IMPORTANCE_LOW = 2
            Method setDesc = channelClass.getMethod("setDescription", String.class);
            setDesc.invoke(channel, "Keeps szept connected in the background");
            Method setShowBadge = channelClass.getMethod("setShowBadge", boolean.class);
            setShowBadge.invoke(channel, false);
            Method createChannel = NotificationManager.class.getMethod("createNotificationChannel", channelClass);
            createChannel.invoke(nm, channel);
        } catch (Exception ignored) {}
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        super.onDestroy();
    }
}
