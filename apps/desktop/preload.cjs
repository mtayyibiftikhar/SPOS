const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sposNative", {
  platform: "desktop",
  downloadFile: (payload) => ipcRenderer.invoke("spos:download-file", payload),
  printReceiptHtml: (payload) => ipcRenderer.invoke("spos:print-receipt-html", payload)
});
