const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("tokenMonitor", {
  onStats(callback) {
    ipcRenderer.on("token-stats", (_event, value) => callback(value))
  },
  onQuestion(callback) {
    ipcRenderer.on("question-event", (_event, value) => callback(value))
  },
  setQuestionPanelState(state) {
    ipcRenderer.send("question-panel-state", state)
  },
  replyQuestion(payload) {
    return ipcRenderer.invoke("question-reply", payload)
  },
  rejectQuestion(payload) {
    return ipcRenderer.invoke("question-reject", payload)
  },
  replyPermission(payload) {
    return ipcRenderer.invoke("permission-reply", payload)
  },
})
