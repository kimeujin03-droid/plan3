package com.yujin.moa;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 안에 둔 플러그인은 브리지가 만들어지기 전에 등록해야 한다.
        registerPlugin(MoaWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
