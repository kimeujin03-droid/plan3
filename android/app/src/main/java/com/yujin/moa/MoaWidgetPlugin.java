package com.yujin.moa;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONException;

/** 앱 ↔ 바탕화면 위젯 다리: 상태를 넘기고(sync), 위젯에서 누른 것을 가져온다(drain). */
@CapacitorPlugin(name = "MoaWidget")
public class MoaWidgetPlugin extends Plugin {

    @PluginMethod
    public void sync(PluginCall call) {
        MoaWidget.saveState(getContext(), call.getData().toString());
        MoaWidget.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void drain(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("actions", new JSArray(MoaWidget.takeQueue(getContext())));
        } catch (JSONException e) {
            ret.put("actions", new JSArray());
        }
        call.resolve(ret);
    }

    /** 알림이 왜 안 오는지 보려고: 앱 알림 허용, 계획 알림 채널 중요도, 배터리 최적화 제외 여부 */
    @PluginMethod
    public void notifyStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("enabled", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        int importance = -1;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel ch = nm != null ? nm.getNotificationChannel(call.getString("channel", "moa-plan")) : null;
            if (ch != null) importance = ch.getImportance();
        }
        ret.put("channelImportance", importance);
        boolean battery = true;
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm != null) battery = pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        ret.put("batteryIgnored", battery);
        ret.put("manufacturer", Build.MANUFACTURER);
        call.resolve(ret);
    }

    /** 이 앱의 알림 설정 화면 */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context ctx = getContext();
        Intent i;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        call.resolve();
    }

    /** 앱 정보 화면(배터리 '제한 없음'을 여기서 고른다) */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Context ctx = getContext();
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        call.resolve();
    }
}
