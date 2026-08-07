const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("tokenMonitor", {
  onStats(callback) {
    ipcRenderer.on("token-stats", (_event, value) => callback(value))
  },
})
