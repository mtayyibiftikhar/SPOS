const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const POS_URL = process.env.SPOS_APP_URL || "https://shop.globalfsms.com/login";
const ALLOWED_HOSTS = new Set(["shop.globalfsms.com", "owner.globalfsms.com"]);

function isAllowedAppUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);

    return parsed.protocol === "https:" && ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function openExternal(targetUrl) {
  shell.openExternal(targetUrl).catch(() => undefined);
}

function sanitizeFileName(fileName, fallback = "receipt.pdf") {
  const cleaned = String(fileName || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function getBufferFromBase64(base64) {
  return Buffer.from(String(base64 || ""), "base64");
}

function getPdfFilter(fileName) {
  return fileName.toLowerCase().endsWith(".pdf")
    ? [{ name: "PDF document", extensions: ["pdf"] }]
    : [{ name: "All files", extensions: ["*"] }];
}

function printHtmlDocument({ html, fileName }, parentWindow) {
  return new Promise((resolve) => {
    const printWindow = new BrowserWindow({
      height: 900,
      parent: parentWindow,
      show: false,
      title: sanitizeFileName(fileName, "receipt.html"),
      width: 640,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const finish = (result) => {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
      }

      resolve(result);
    };

    printWindow.webContents.once("did-finish-load", () => {
      printWindow.webContents.print(
        {
          printBackground: true,
          silent: false
        },
        (success, failureReason) => {
          finish({
            ok: success,
            message: success ? "Print dialog opened." : failureReason || "Unable to print receipt."
          });
        }
      );
    });

    printWindow.webContents.once("did-fail-load", (_event, _code, description) => {
      finish({ ok: false, message: description || "Unable to load receipt for printing." });
    });

    void printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(html || ""))}`);
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#f6faf6",
    height: 860,
    minHeight: 720,
    minWidth: 1100,
    show: false,
    title: "SPOS Shop",
    width: 1360,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAppUrl(url)) {
      return { action: "allow" };
    }

    openExternal(url);

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppUrl(url)) {
      return;
    }

    event.preventDefault();
    openExternal(url);
  });

  void mainWindow.loadURL(POS_URL);
}

app.setAppUserModelId("com.globalfsms.spos.shop");

ipcMain.handle("spos:download-file", async (event, payload) => {
  try {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const fileName = sanitizeFileName(payload?.fileName, "spos-file.pdf");
    const defaultPath = path.join(app.getPath("downloads") || os.homedir(), fileName);
    const result = await dialog.showSaveDialog(parentWindow ?? undefined, {
      defaultPath,
      filters: getPdfFilter(fileName),
      title: "Save SPOS file"
    });

    if (result.canceled || !result.filePath) {
      return { ok: false, message: "Save cancelled." };
    }

    await fs.promises.writeFile(result.filePath, getBufferFromBase64(payload?.base64));
    shell.showItemInFolder(result.filePath);

    return { ok: true, path: result.filePath };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to save file."
    };
  }
});

ipcMain.handle("spos:print-receipt-html", async (event, payload) => {
  try {
    return await printHtmlDocument(payload ?? {}, BrowserWindow.fromWebContents(event.sender));
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to print receipt."
    };
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
