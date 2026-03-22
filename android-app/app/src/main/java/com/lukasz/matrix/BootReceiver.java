package com.lukasz.matrix;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.lang.reflect.Method;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.MY_PACKAGE_REPLACED".equals(action)) {
            Intent serviceIntent = new Intent(context, MatrixService.class);
            try {
                // startForegroundService via reflection (API 26+)
                Method m = Context.class.getMethod("startForegroundService", Intent.class);
                m.invoke(context, serviceIntent);
            } catch (Exception e) {
                context.startService(serviceIntent);
            }
        }
    }
}
