package com.globalfsms.spos.shop;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "SposNative")
public class SposNativePlugin extends Plugin {
    private String sanitizeFileName(String fileName, String fallback) {
        String value = fileName == null ? fallback : fileName.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1F]", "-").trim();
        return value.isEmpty() ? fallback : value;
    }

    private byte[] decodeBase64(PluginCall call) {
        String base64 = call.getString("base64", "");
        return Base64.decode(base64, Base64.DEFAULT);
    }

    private void resolveOk(PluginCall call, String message) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("message", message);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        String fileName = sanitizeFileName(call.getString("fileName"), "spos-file.pdf");
        String mimeType = call.getString("mimeType", "application/pdf");
        byte[] data;

        try {
            data = decodeBase64(call);
        } catch (Exception error) {
            call.reject("File data is invalid.");
            return;
        }

        try {
            Context context = getContext();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SPOS");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                ContentResolver resolver = context.getContentResolver();
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);

                if (uri == null) {
                    call.reject("Unable to create download file.");
                    return;
                }

                try (OutputStream output = resolver.openOutputStream(uri)) {
                    if (output == null) {
                        call.reject("Unable to open download file.");
                        return;
                    }

                    output.write(data);
                }

                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
            } else {
                File downloadsDirectory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "SPOS");

                if (!downloadsDirectory.exists() && !downloadsDirectory.mkdirs()) {
                    call.reject("Unable to create Downloads/SPOS folder.");
                    return;
                }

                try (FileOutputStream output = new FileOutputStream(new File(downloadsDirectory, fileName))) {
                    output.write(data);
                }
            }

            resolveOk(call, "File saved to Downloads/SPOS.");
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Unable to save file." : error.getMessage());
        }
    }

    @PluginMethod
    public void printPdf(PluginCall call) {
        String fileName = sanitizeFileName(call.getString("fileName"), "spos-receipt.pdf");
        byte[] data;

        try {
            data = decodeBase64(call);
        } catch (Exception error) {
            call.reject("Print data is invalid.");
            return;
        }

        try {
            File printFile = new File(getContext().getCacheDir(), fileName);

            try (FileOutputStream output = new FileOutputStream(printFile)) {
                output.write(data);
            }

            PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);

            if (printManager == null) {
                call.reject("Android print service is not available.");
                return;
            }

            printManager.print(
                fileName,
                new PdfPrintDocumentAdapter(getContext(), printFile, fileName),
                new PrintAttributes.Builder().build()
            );
            resolveOk(call, "Print dialog opened.");
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Unable to print file." : error.getMessage());
        }
    }

    @PluginMethod
    public void printReceiptHtml(PluginCall call) {
        String fileName = sanitizeFileName(call.getString("fileName"), "spos-receipt.html");
        String html = call.getString("html", "");
        Context context = getContext();
        PrintManager printManager = (PrintManager) context.getSystemService(Context.PRINT_SERVICE);

        if (printManager == null) {
            call.reject("Android print service is not available.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            WebView printWebView = new WebView(context);

            printWebView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    PrintAttributes attributes = new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.UNKNOWN_PORTRAIT)
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .build();

                    printManager.print(fileName, view.createPrintDocumentAdapter(fileName), attributes);
                    resolveOk(call, "Print dialog opened.");
                }
            });

            printWebView.loadDataWithBaseURL("https://shop.globalfsms.com", html, "text/html", "UTF-8", null);
        });
    }
}
