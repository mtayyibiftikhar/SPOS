const { app, BrowserWindow, Menu, shell } = require("electron");

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
      sandbox: true
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
