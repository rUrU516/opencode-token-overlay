const { app, BrowserWindow, screen } = require("electron")
const { readFile } = require("node:fs/promises")
const { homedir } = require("node:os")
const path = require("node:path")

let overlay
let stopping = false

const empty = () => ({ input: 0, cache: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: 0 })
const add = (target, value) => {
  target.input += value.input
  target.cache += value.cache
  target.cacheRead += value.cacheRead
  target.cacheWrite += value.cacheWrite
  target.output += value.output
  target.cost += value.cost
  return target
}
const usage = (tokens = {}, cost = 0) => ({
  input: tokens.input ?? 0,
  cache: (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0),
  cacheRead: tokens.cache?.read ?? 0,
  cacheWrite: tokens.cache?.write ?? 0,
  output: (tokens.output ?? 0) + (tokens.reasoning ?? 0),
  cost: cost ?? 0,
})

function send(payload) {
  if (!overlay || overlay.isDestroyed()) return
  overlay.webContents.send("token-stats", payload)
}

async function service() {
  const file = path.join(process.env.XDG_STATE_HOME ?? path.join(homedir(), ".local", "state"), "opencode", "service.json")
  const info = JSON.parse(await readFile(file, "utf8"))
  const headers = info.password
    ? { authorization: `Basic ${Buffer.from(`opencode:${info.password}`).toString("base64")}` }
    : {}
  const response = await fetch(new URL("/api/health", info.url), { headers, signal: AbortSignal.timeout(2_000) })
  if (!response.ok) throw new Error(`OpenCode service is not healthy (${response.status})`)
  return { url: info.url, headers }
}

async function json(endpoint, pathname) {
  const response = await fetch(new URL(pathname, endpoint.url), {
    headers: endpoint.headers,
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`)
  return response.json()
}

async function sessions(endpoint) {
  const result = []
  let cursor
  do {
    const query = new URLSearchParams({ limit: "1000" })
    if (cursor) query.set("cursor", cursor)
    else query.set("order", "asc")
    const page = await json(endpoint, `/api/session?${query}`)
    result.push(...page.data)
    cursor = page.cursor?.next || undefined
  } while (cursor)
  return result
}

async function messagesToday(endpoint, session, midnight) {
  const total = empty()
  let cursor
  do {
    const query = new URLSearchParams({ limit: "200" })
    if (cursor) query.set("cursor", cursor)
    else query.set("order", "desc")
    const page = await json(endpoint, `/api/session/${encodeURIComponent(session.id)}/message?${query}`)
    for (const message of page.data) {
      const created = message.time?.created ?? 0
      if (created < midnight) continue
      // Fork 会复制原会话历史；这些复制消息不是新产生的 Token。
      if (session.fork && created < session.time.created) continue
      if (message.type !== "assistant" || !message.tokens) continue
      add(total, usage(message.tokens, message.cost))
    }
    const oldest = Math.min(...page.data.map((message) => message.time?.created ?? Infinity))
    if (!page.data.length || oldest < midnight) break
    cursor = page.cursor?.next || undefined
  } while (cursor)
  return total
}

async function bootstrap(endpoint) {
  const all = await sessions(endpoint)
  const snapshots = new Map(all.map((session) => [session.id, usage(session.tokens, session.cost)]))
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const midnight = start.getTime()
  const active = all.filter((session) => session.time.updated >= midnight)
  const today = empty()

  // 小批量并发，避免一次性请求过多会话。
  for (let index = 0; index < active.length; index += 8) {
    const batch = await Promise.all(active.slice(index, index + 8).map((session) => messagesToday(endpoint, session, midnight)))
    batch.forEach((value) => add(today, value))
  }
  return { today, snapshots, midnight }
}

async function subscribe(endpoint, onEvent, signal) {
  const response = await fetch(new URL("/api/event", endpoint.url), { headers: endpoint.headers, signal })
  if (!response.ok || !response.body) throw new Error(`Event stream: HTTP ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) throw new Error("Event stream ended")
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n")
    let boundary
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const packet = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const data = packet.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n")
      if (!data) continue
      try { onEvent(JSON.parse(data)) } catch { /* 忽略心跳或未知事件 */ }
    }
  }
}

async function monitor() {
  let retry = 1_000
  while (!stopping) {
    const controller = new AbortController()
    try {
      send({ status: "connecting" })
      const endpoint = await service()
      const state = await bootstrap(endpoint)
      send({ status: "idle", ...state.today })
      retry = 1_000
      let idleTimer

      await subscribe(endpoint, (event) => {
        if (event.type !== "session.usage.updated") return
        const next = usage(event.data.tokens, event.data.cost)
        const previous = state.snapshots.get(event.data.sessionID)
        state.snapshots.set(event.data.sessionID, next)
        if (!previous || event.created < state.midnight) return

        const delta = {
          input: Math.max(0, next.input - previous.input),
          cache: Math.max(0, next.cache - previous.cache),
          cacheRead: Math.max(0, next.cacheRead - previous.cacheRead),
          cacheWrite: Math.max(0, next.cacheWrite - previous.cacheWrite),
          output: Math.max(0, next.output - previous.output),
          cost: Math.max(0, next.cost - previous.cost),
        }
        const consumed = delta.input + delta.cache + delta.output
        if (consumed <= 0) return
        add(state.today, delta)
        send({ status: "active", delta: consumed, ...state.today })
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => send({ status: "idle", ...state.today }), 2_800)
      }, controller.signal)
    } catch (error) {
      if (stopping) return
      send({ status: "disconnected", message: error.message })
      await new Promise((resolve) => setTimeout(resolve, retry))
      retry = Math.min(retry * 2, 15_000)
    } finally {
      controller.abort()
    }
  }
}

function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay()
  const width = 268
  const height = 76

  overlay = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + workArea.width - width - 28),
    y: Math.round(workArea.y + 36),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  overlay.setAlwaysOnTop(true, "floating")
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlay.loadFile(path.join(__dirname, "index.html"))
  overlay.once("ready-to-show", () => {
    overlay.showInactive()
    void monitor()
  })
  overlay.on("closed", () => { overlay = undefined })
}

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock.hide()
  createOverlay()
})

app.on("before-quit", () => { stopping = true })
app.on("window-all-closed", () => app.quit())
