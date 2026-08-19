const { app, BrowserWindow, ipcMain, screen } = require("electron")
const { readFile } = require("node:fs/promises")
const { homedir } = require("node:os")
const path = require("node:path")

let overlay
let stopping = false

function lifecycle(message, details) {
  const suffix = details === undefined ? "" : ` ${typeof details === "string" ? details : JSON.stringify(details)}`
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`)
}

process.on("uncaughtExceptionMonitor", (error) => lifecycle("Uncaught exception", error?.stack ?? String(error)))
process.on("exit", (code) => lifecycle("Main process exited", { code }))

const OVERLAY_WIDTH = 268
const OVERLAY_HEIGHT = 100
const QUESTION_HEIGHTS = {
  hidden: OVERLAY_HEIGHT,
  collapsed: 110,
  expanded: 444,
}

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

function sendQuestion(payload) {
  if (!overlay || overlay.isDestroyed()) return
  overlay.webContents.send("question-event", payload)
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

async function json(endpoint, pathname, options = {}) {
  const response = await fetch(new URL(pathname, endpoint.url), {
    headers: endpoint.headers,
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404 && options.notFound !== undefined) return options.notFound
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`)
  return response.json()
}

async function mutate(endpoint, pathname, body) {
  const response = await fetch(new URL(pathname, endpoint.url), {
    method: "POST",
    headers: { ...endpoint.headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  if (response.ok) return
  let detail
  try { detail = await response.json() } catch { /* 非 JSON 错误响应 */ }
  throw new Error(detail?.message ?? `${pathname}: HTTP ${response.status}`)
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

async function bootstrapActiveSessions(endpoint) {
  const result = await json(endpoint, "/api/session/active")
  return new Set(Object.keys(result.data ?? {}))
}

function questionFromForm(form) {
  if (form.metadata?.kind !== "question") return
  return {
    kind: "question",
    id: form.id,
    sessionID: form.sessionID,
    protocol: "form",
    questions: form.fields.map((field, index) => ({
      key: field.key,
      type: field.type,
      header: field.title ?? `QUESTION ${index + 1}`,
      question: field.description ?? field.title ?? field.key,
      options: (field.options ?? []).map((option) => ({
        value: option.value,
        label: option.label,
        description: option.description ?? "",
      })),
      multiple: field.type === "multiselect",
      custom: field.custom === true,
    })),
    fieldKeys: form.fields.map((field) => field.key),
    tool: form.metadata?.tool,
  }
}

function questionFromLegacy(request) {
  return { ...request, kind: "question", protocol: "question" }
}

function permissionRequest(request) {
  return { ...request, kind: "permission" }
}

function formAnswers(request, answer = {}) {
  return (request?.fieldKeys ?? []).map((key) => {
    const value = answer[key]
    if (value === undefined || value === null) return []
    return Array.isArray(value) ? value.map(String) : [String(value)]
  })
}

async function bootstrapInteractions(endpoint) {
  let locations = await json(endpoint, "/api/debug/location")
  if (!locations.length) locations = [undefined]

  const pages = await Promise.all(locations.flatMap((location) => {
    const query = new URLSearchParams()
    if (location?.directory) query.set("location[directory]", location.directory)
    if (location?.workspaceID) query.set("location[workspace]", location.workspaceID)
    const suffix = query.size ? `?${query}` : ""
    return [
      // 新版 V2 已移除旧 Question 列表接口；仅在旧服务仍提供时补齐它。
      json(endpoint, `/api/question/request${suffix}`, { notFound: { data: [] } }).then((page) => ({ kind: "question", page })),
      json(endpoint, `/api/form/request${suffix}`).then((page) => ({ kind: "form", page })),
      json(endpoint, `/api/permission/request${suffix}`).then((page) => ({ kind: "permission", page })),
    ]
  }))

  const requests = new Map()
  for (const result of pages) {
    for (const item of result.page.data ?? []) {
      const request = result.kind === "form"
        ? questionFromForm(item)
        : result.kind === "permission"
          ? permissionRequest(item)
          : questionFromLegacy(item)
      if (request) requests.set(request.id, request)
    }
  }
  return requests
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
    let rolloverTimer
    let idleTimer
    let activityTimer
    try {
      send({ status: "connecting" })
      const endpoint = await service()
      const queuedEvents = []
      let ready = false
      let streamError
      const stream = subscribe(endpoint, (event) => {
        if (!ready) queuedEvents.push(event)
        else handleEvent(event)
      }, controller.signal).catch((error) => { streamError = error })
      const [state, interactionRequests, activeSessions] = await Promise.all([
        bootstrap(endpoint),
        bootstrapInteractions(endpoint),
        bootstrapActiveSessions(endpoint),
      ])
      state.activeSessions = activeSessions
      send({ status: "idle", sessionsBusy: state.activeSessions.size > 0, ...state.today })
      sendQuestion({ type: "sync", requests: [...interactionRequests.values()] })
      retry = 1_000

      // /api/event 是易失流；若短暂断流刚好漏掉 idle，单靠 SSE 会让忙碌状态永久残留。
      // 每秒用权威 active 快照轻量校准一次，确保最终冲刺能可靠触发。
      activityTimer = setInterval(() => {
        void bootstrapActiveSessions(endpoint).then((active) => {
          const changed = active.size !== state.activeSessions.size || [...active].some((id) => !state.activeSessions.has(id))
          if (!changed) return
          state.activeSessions = active
          send({ status: "idle", sessionsBusy: state.activeSessions.size > 0 })
        }).catch(() => { /* SSE 重连流程负责处理服务故障 */ })
      }, 1_000)

      // 跨过本地零点后重新汇总当天消息。不能只等待 Usage 事件，
      // 否则悬浮窗在零点后无新请求时会一直保留昨天的总量。
      const nextMidnight = new Date()
      nextMidnight.setHours(24, 0, 0, 0)
      rolloverTimer = setTimeout(() => controller.abort("day-rollover"), Math.max(0, nextMidnight.getTime() - Date.now() + 250))

      function handleEvent(event) {
        if (event.type === "session.status") {
          if (event.data.status.type === "idle") state.activeSessions.delete(event.data.sessionID)
          else state.activeSessions.add(event.data.sessionID)
          send({ status: "idle", sessionsBusy: state.activeSessions.size > 0 })
          return
        }
        if (event.type === "session.deleted") {
          state.activeSessions.delete(event.data.sessionID)
          send({ status: "idle", sessionsBusy: state.activeSessions.size > 0 })
          return
        }
        if (event.type === "form.created") {
          const request = questionFromForm(event.data.form)
          if (!request) return
          interactionRequests.set(request.id, request)
          sendQuestion({ type: "asked", request, pending: interactionRequests.size })
          return
        }
        if (event.type === "form.replied") {
          const request = interactionRequests.get(event.data.id)
          if (!request) return
          interactionRequests.delete(event.data.id)
          sendQuestion({
            type: "replied",
            request,
            requestID: event.data.id,
            sessionID: event.data.sessionID,
            answers: formAnswers(request, event.data.answer),
            pending: interactionRequests.size,
          })
          return
        }
        if (event.type === "form.cancelled") {
          const request = interactionRequests.get(event.data.id)
          if (!request) return
          interactionRequests.delete(event.data.id)
          sendQuestion({ type: "rejected", request, requestID: event.data.id, sessionID: event.data.sessionID, pending: interactionRequests.size })
          return
        }
        if (event.type === "question.asked") {
          const request = questionFromLegacy(event.data)
          interactionRequests.set(request.id, request)
          sendQuestion({ type: "asked", request, pending: interactionRequests.size })
          return
        }
        if (event.type === "question.replied") {
          const request = interactionRequests.get(event.data.requestID)
          interactionRequests.delete(event.data.requestID)
          sendQuestion({ type: "replied", request, ...event.data, pending: interactionRequests.size })
          return
        }
        if (event.type === "question.rejected") {
          const request = interactionRequests.get(event.data.requestID)
          interactionRequests.delete(event.data.requestID)
          sendQuestion({ type: "rejected", request, ...event.data, pending: interactionRequests.size })
          return
        }
        if (event.type === "permission.asked") {
          const request = permissionRequest(event.data)
          interactionRequests.set(request.id, request)
          sendQuestion({ type: "asked", request, pending: interactionRequests.size })
          return
        }
        if (event.type === "permission.replied") {
          const request = interactionRequests.get(event.data.requestID)
          interactionRequests.delete(event.data.requestID)
          sendQuestion({
            type: event.data.reply === "reject" ? "rejected" : "replied",
            request,
            ...event.data,
            pending: interactionRequests.size,
          })
          return
        }
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
        send({ status: "active", delta: consumed, sessionsBusy: state.activeSessions.size > 0, ...state.today })
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => send({ status: "idle", sessionsBusy: state.activeSessions.size > 0, ...state.today }), 2_800)
      }

      // SSE 在启动汇总之前连接；汇总期间到达的事件按原顺序补放，
      // 避免短暂出现并被回答的 Question 永久丢失。
      for (const event of queuedEvents) handleEvent(event)
      queuedEvents.length = 0
      ready = true
      await stream
      if (streamError) throw streamError
    } catch (error) {
      if (stopping) return
      if (controller.signal.reason === "day-rollover") {
        retry = 1_000
        continue
      }
      lifecycle("Monitor disconnected", { message: error.message, retry })
      send({ status: "disconnected", message: error.message })
      await new Promise((resolve) => setTimeout(resolve, retry))
      retry = Math.min(retry * 2, 15_000)
    } finally {
      clearTimeout(rolloverTimer)
      clearTimeout(idleTimer)
      clearInterval(activityTimer)
      controller.abort()
    }
  }
}

function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay()

  overlay = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: Math.round(workArea.x + workArea.width - OVERLAY_WIDTH - 28),
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
    lifecycle("Overlay ready", { pid: process.pid })
    overlay.showInactive()
    void monitor()
  })
  overlay.on("unresponsive", () => lifecycle("Overlay became unresponsive"))
  overlay.webContents.on("render-process-gone", (_event, details) => lifecycle("Renderer process gone", details))
  overlay.on("closed", () => {
    lifecycle("Overlay window closed")
    overlay = undefined
  })
}

ipcMain.on("question-panel-state", (_event, state) => {
  if (!overlay || overlay.isDestroyed()) return
  const height = QUESTION_HEIGHTS[state]
  if (!height) return
  overlay.setSize(OVERLAY_WIDTH, height, true)
})

function trustedRenderer(event) {
  return overlay && !overlay.isDestroyed() && event.sender === overlay.webContents
}

ipcMain.handle("question-reply", async (event, payload) => {
  if (!trustedRenderer(event)) throw new Error("Untrusted renderer")
  const endpoint = await service()
  const sessionID = encodeURIComponent(payload.sessionID)
  const requestID = encodeURIComponent(payload.requestID)
  if (payload.protocol === "form") {
    await mutate(endpoint, `/api/session/${sessionID}/form/${requestID}/reply`, { answer: payload.answer })
    return
  }
  if (payload.protocol === "question") {
    await mutate(endpoint, `/api/session/${sessionID}/question/${requestID}/reply`, { answers: payload.answers })
    return
  }
  throw new Error("Unsupported question protocol")
})

ipcMain.handle("question-reject", async (event, payload) => {
  if (!trustedRenderer(event)) throw new Error("Untrusted renderer")
  const endpoint = await service()
  const sessionID = encodeURIComponent(payload.sessionID)
  const requestID = encodeURIComponent(payload.requestID)
  if (payload.protocol === "form") {
    await mutate(endpoint, `/api/session/${sessionID}/form/${requestID}/cancel`)
    return
  }
  if (payload.protocol === "question") {
    await mutate(endpoint, `/api/session/${sessionID}/question/${requestID}/reject`)
    return
  }
  throw new Error("Unsupported question protocol")
})

ipcMain.handle("permission-reply", async (event, payload) => {
  if (!trustedRenderer(event)) throw new Error("Untrusted renderer")
  if (!["once", "always", "reject"].includes(payload.reply)) throw new Error("Unsupported permission reply")
  const endpoint = await service()
  const sessionID = encodeURIComponent(payload.sessionID)
  const requestID = encodeURIComponent(payload.requestID)
  await mutate(endpoint, `/api/session/${sessionID}/permission/${requestID}/reply`, {
    reply: payload.reply,
    ...(payload.message ? { message: payload.message } : {}),
  })
})

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock.hide()
  createOverlay()
})

app.on("child-process-gone", (_event, details) => lifecycle("Child process gone", details))
app.on("before-quit", () => {
  lifecycle("Application quitting")
  stopping = true
})
app.on("window-all-closed", () => app.quit())
