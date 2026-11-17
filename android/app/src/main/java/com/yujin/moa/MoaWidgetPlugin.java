package com.yujin.moa;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
}
