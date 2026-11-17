package com.yujin.moa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 바탕화면의 모아.
 * - 앱이 MoaWidgetPlugin.sync로 넘겨준 상태(하는 중인 일, 빠른 버튼, 꾸미기)를 그린다.
 * - 빠른 버튼을 누르면 앱을 열지 않고 바로 시작·끝을 표시하고, 누른 시각을 대기열에 쌓는다.
 *   앱이 열리면 대기열을 가져가(drain) 그 시각 그대로 기록에 옮긴다. 기록 파일은 앱만 쓴다.
 */
public class MoaWidget extends AppWidgetProvider {
    static final String PREFS = "moa_widget";
    static final String STATE = "state";
    static final String QUEUE = "queue";
    static final String ACTION_TOGGLE = "com.yujin.moa.WIDGET_TOGGLE";
    /** 앱과 같은 규칙: 동시에 두 가지까지 */
    static final int MAX_RUNNING = 2;

    static final int[] SLOT = {R.id.slot1, R.id.slot2, R.id.slot3, R.id.slot4};
    static final int[] SLOT_BG = {R.id.slot1_bg, R.id.slot2_bg, R.id.slot3_bg, R.id.slot4_bg};
    static final int[] SLOT_TEXT = {R.id.slot1_text, R.id.slot2_text, R.id.slot3_text, R.id.slot4_text};

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void saveState(Context c, String json) {
        prefs(c).edit().putString(STATE, json).commit();
    }

    /** 쌓인 누름을 꺼내고 비운다. */
    static synchronized String takeQueue(Context c) {
        SharedPreferences p = prefs(c);
        String q = p.getString(QUEUE, "[]");
        p.edit().putString(QUEUE, "[]").commit();
        return q;
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, MoaWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = render(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        RemoteViews v = render(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (ACTION_TOGGLE.equals(intent.getAction())) {
            String id = intent.getStringExtra("id");
            if (id != null) toggle(c, id);
            refreshAll(c);
        }
    }

    /** 하는 중이면 끝, 아니면 시작. 화면에는 바로 보이고, 기록은 앱이 열릴 때 옮긴다. */
    static synchronized void toggle(Context c, String id) {
        try {
            SharedPreferences p = prefs(c);
            JSONObject st = new JSONObject(p.getString(STATE, "{}"));
            JSONArray running = st.optJSONArray("running");
            if (running == null) running = new JSONArray();
            long now = System.currentTimeMillis();
            int found = -1;
            for (int k = 0; k < running.length(); k++) {
                JSONObject r = running.optJSONObject(k);
                if (r != null && id.equals(r.optString("id"))) found = k;
            }
            String op;
            if (found >= 0) {
                running.remove(found);
                op = "end";
            } else {
                if (running.length() >= MAX_RUNNING) return;
                JSONObject q = findQuick(st, id);
                JSONObject r = new JSONObject();
                r.put("id", id);
                r.put("name", q != null ? q.optString("name") : "");
                r.put("color", q != null ? q.optString("color") : "#CFC6F3");
                r.put("start", now);
                running.put(r);
                op = "start";
            }
            st.put("running", running);
            if (st.optBoolean("sleeping", false) && "start".equals(op)) st.put("sleeping", false);
            JSONArray queue = new JSONArray(p.getString(QUEUE, "[]"));
            JSONObject a = new JSONObject();
            a.put("op", op);
            a.put("id", id);
            a.put("at", now);
            queue.put(a);
            p.edit().putString(STATE, st.toString()).putString(QUEUE, queue.toString()).commit();
        } catch (JSONException ignored) {
            // 상태가 깨졌으면 아무것도 하지 않는다. 앱이 다음에 다시 맞춰 준다.
        }
    }

    static JSONObject findQuick(JSONObject st, String id) {
        JSONArray quick = st.optJSONArray("quick");
        if (quick == null) return null;
        for (int k = 0; k < quick.length(); k++) {
            JSONObject q = quick.optJSONObject(k);
            if (q != null && id.equals(q.optString("id"))) return q;
        }
        return null;
    }

    static boolean isRunning(JSONArray running, String id) {
        if (running == null) return false;
        for (int k = 0; k < running.length(); k++) {
            JSONObject r = running.optJSONObject(k);
            if (r != null && id.equals(r.optString("id"))) return true;
        }
        return false;
    }

    static int color(String hex, int fallback) {
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    static int accessoryRes(String kind) {
        switch (kind) {
            case "ribbon": return R.drawable.acc_ribbon;
            case "hat": return R.drawable.acc_hat;
            case "headphones": return R.drawable.acc_headphones;
            case "glasses": return R.drawable.acc_glasses;
            case "flower": return R.drawable.acc_flower;
            default: return 0;
        }
    }

    static RemoteViews render(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.moa_widget);
        JSONObject st;
        try {
            st = new JSONObject(prefs(c).getString(STATE, "{}"));
        } catch (JSONException e) {
            st = new JSONObject();
        }
        JSONArray running = st.optJSONArray("running");
        JSONArray quick = st.optJSONArray("quick");
        boolean sleeping = st.optBoolean("sleeping", false);
        int n = running == null ? 0 : running.length();

        // 눈: 자는 중 / 하는 중 / 기다리는 중
        v.setImageViewResource(R.id.moa_eyes, sleeping ? R.drawable.moa_eyes_sleep : n > 0 ? R.drawable.moa_eyes_focus : R.drawable.moa_eyes_idle);

        int acc = accessoryRes(st.optString("accessory", "none"));
        if (acc != 0) {
            v.setImageViewResource(R.id.moa_acc, acc);
            v.setViewVisibility(R.id.moa_acc, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.moa_acc, View.GONE);
        }
        String board = st.optString("board", "sign");
        v.setViewVisibility(R.id.moa_skate, "skate".equals(board) ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.moa_sign, "sign".equals(board) ? View.VISIBLE : View.GONE);

        if (n > 0) {
            JSONObject r = running.optJSONObject(0);
            String name = r != null ? r.optString("name") : "";
            long start = r != null ? r.optLong("start", System.currentTimeMillis()) : System.currentTimeMillis();
            long base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - start);
            v.setTextViewText(R.id.sign_text, name);
            v.setChronometer(R.id.sign_time, base, null, true);
            v.setViewVisibility(R.id.sign_time, View.VISIBLE);
            v.setTextViewText(R.id.status, n > 1 ? name + " 외 " + (n - 1) + "개 하는 중" : name + " 하는 중 · 누르면 끝");
        } else {
            v.setTextViewText(R.id.sign_text, sleeping ? "쿨쿨" : "모아");
            v.setChronometer(R.id.sign_time, SystemClock.elapsedRealtime(), null, false);
            v.setViewVisibility(R.id.sign_time, View.GONE);
            v.setTextViewText(R.id.status, sleeping ? "자는 중이야" : "뭐 할까? 눌러서 시작");
        }

        for (int k = 0; k < SLOT.length; k++) {
            JSONObject q = quick != null && k < quick.length() ? quick.optJSONObject(k) : null;
            if (q == null) {
                v.setViewVisibility(SLOT[k], View.GONE);
                continue;
            }
            v.setViewVisibility(SLOT[k], View.VISIBLE);
            String id = q.optString("id");
            boolean on = isRunning(running, id);
            v.setInt(SLOT_BG[k], "setColorFilter", color(q.optString("color"), 0xFFCFC6F3));
            v.setTextViewText(SLOT_TEXT[k], (on ? "■ " : "") + q.optString("name"));
            v.setContentDescription(SLOT[k], q.optString("name") + (on ? " 끝내기" : " 시작"));
            Intent t = new Intent(c, MoaWidget.class).setAction(ACTION_TOGGLE).putExtra("id", id);
            PendingIntent pi = PendingIntent.getBroadcast(c, 100 + k, t, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(SLOT[k], pi);
        }

        Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.moa_frame, PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
