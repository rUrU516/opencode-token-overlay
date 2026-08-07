const overlay = document.querySelector(".overlay")
const totalElement = document.querySelector("#total")

// UI 每秒最多推进 50K Token。真实目标值始终完整保留，不会丢失用量。
const MAX_TOKENS_PER_SECOND = 50_000
let shown
let target
let connectionStatus = "connecting"
let frameID
let previousFrame

const compact = (value) => {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return Math.round(value).toLocaleString()
}

const total = (value) => value.input + value.cache + value.output

function paint(value) {
  totalElement.textContent = Math.round(total(value)).toLocaleString()
}

function setState(consuming) {
  const offline = connectionStatus === "disconnected"
  overlay.classList.toggle("active", consuming && !offline)
  overlay.classList.toggle("disconnected", offline)
}

function advance(now) {
  frameID = undefined
  if (!shown || !target) return
  const dt = previousFrame === undefined ? 0 : Math.min(.1, (now - previousFrame) / 1000)
  previousFrame = now

  // 服务端发生回退/修正时立即对齐；限速只应用于正向 Token 消耗。
  for (const key of ["input", "cache", "output"]) {
    if (target[key] < shown[key]) shown[key] = target[key]
  }
  const remaining = Math.max(0, total(target) - total(shown))
  if (remaining <= .5) {
    shown = { ...target }
    paint(shown)
    setState(false)
    previousFrame = undefined
    return
  }

  const amount = Math.min(remaining, MAX_TOKENS_PER_SECOND * dt)
  const ratio = amount / remaining
  shown = {
    input: shown.input + Math.max(0, target.input - shown.input) * ratio,
    cache: shown.cache + Math.max(0, target.cache - shown.cache) * ratio,
    output: shown.output + Math.max(0, target.output - shown.output) * ratio,
    cost: shown.cost + (target.cost - shown.cost) * ratio,
  }
  paint(shown)
  setState(true)
  frameID = requestAnimationFrame(advance)
}

function startAdvancing() {
  if (frameID !== undefined) return
  previousFrame = undefined
  frameID = requestAnimationFrame(advance)
}

window.tokenMonitor.onStats((stats) => {
  connectionStatus = stats.status
  if (typeof stats.input !== "number") {
    setState(Boolean(shown && target && total(target) - total(shown) > .5))
    return
  }

  const next = {
    input: stats.input,
    cache: stats.cache,
    output: stats.output,
    cost: stats.cost,
  }
  if (!shown) {
    // 首次启动直接显示今日基线，只有后续真实增量才进入慢速队列。
    shown = { ...next }
    target = { ...next }
    paint(shown)
    setState(false)
    return
  }
  target = next
  if (total(target) - total(shown) > .5) startAdvancing()
  else {
    shown = { ...target }
    paint(shown)
    setState(false)
  }
})
