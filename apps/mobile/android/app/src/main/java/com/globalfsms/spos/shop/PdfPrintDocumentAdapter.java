package com.globalfsms.spos.shop;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;

public class PdfPrintDocumentAdapter extends PrintDocumentAdapter {
    private final File file;
    private final String fileName;

    public PdfPrintDocumentAdapter(Context context, File file, String fileName) {
        this.file = file;
        this.fileName = fileName;
    }

    @Override
    public void onLayout(
        PrintAttributes oldAttributes,
        PrintAttributes newAttributes,
        CancellationSignal cancellationSignal,
        LayoutResultCallback callback,
        Bundle extras
    ) {
        if (cancellationSignal.isCanceled()) {
            callback.onLayoutCancelled();
            return;
        }

        PrintDocumentInfo info = new PrintDocumentInfo.Builder(fileName)
            .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
            .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
            .build();

        callback.onLayoutFinished(info, true);
    }

    @Override
    public void onWrite(
        PageRange[] pages,
        ParcelFileDescriptor destination,
        CancellationSignal cancellationSignal,
        WriteResultCallback callback
    ) {
        try (
            FileInputStream input = new FileInputStream(file);
            FileOutputStream output = new FileOutputStream(destination.getFileDescriptor())
        ) {
            byte[] buffer = new byte[8192];
            int bytesRead;

            while ((bytesRead = input.read(buffer)) >= 0) {
                if (cancellationSignal.isCanceled()) {
                    callback.onWriteCancelled();
                    return;
                }

                output.write(buffer, 0, bytesRead);
            }

            callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
        } catch (IOException error) {
            callback.onWriteFailed(error.getMessage());
        }
    }
}
