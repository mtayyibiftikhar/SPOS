package com.globalfsms.spos.shop;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SposNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
