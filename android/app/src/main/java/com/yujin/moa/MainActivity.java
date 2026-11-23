package com.yujin.moa;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 안에 둔 플러그인은 브리지가 만들어지기 전에 등록해야 한다.
        registerPlugin(MoaWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        // 폰의 '글자 크기'를 키워 둔 경우 웹 화면 글자까지 커져서 한 화면에 너무 조금 보인다.
        // 화면 전체를 촘촘하게 쓰려고 웹 글자 배율은 100%로 둔다(앱 안 글자 크기는 앱이 정한다).
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(100);
        }
    }
}
