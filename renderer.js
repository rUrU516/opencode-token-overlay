const overlay = document.querySelector(".overlay")
const totalElement = document.querySelector("#total")
const barElement = document.querySelector("#bar")
const cacheHitElement = document.querySelector("#cache-hit")
const hudElement = document.querySelector(".hud")
const chipElements = [...document.querySelectorAll(".chip")]
const questionPanel = document.querySelector("#question-panel")
const questionToggle = document.querySelector("#question-toggle")
const questionStatus = document.querySelector("#question-status")
const questionCount = document.querySelector("#question-count")
const questionContent = document.querySelector("#question-content")

// UI 每秒最多推进 10K Token。真实目标值始终完整保留，不会丢失用量。
const MAX_TOKENS_PER_SECOND = 10_000
const TOKENS_PER_BAR = 100_000
let shown
let target
let connectionStatus = "connecting"
let frameID
let previousFrame
let previousBar
let burstTimer
let questionCollapsed = false
const pendingQuestions = new Map()
let currentQuestion
let questionDismissTimer

const chipColors = ["#8f4939", "#a95b3e", "#d56f40", "#ed9847", "#f0c65a", "#f4dc73"]

function randomizeChip(chip) {
  const direction = Math.random() < .5 ? -1 : 1
  chip.style.setProperty("--x", `${Math.round(-26 + Math.random() * 54)}px`)
  chip.style.setProperty("--y", `${direction * Math.round(20 + Math.random() * 13)}px`)
  chip.style.setProperty("--size", `${2 + Math.floor(Math.random() * 4)}px`)
  chip.style.setProperty("--spin", `${[90,180,270][Math.floor(Math.random() * 3)]}deg`)
  chip.style.setProperty("--chip-color", chipColors[Math.floor(Math.random() * chipColors.length)])
}

chipElements.forEach((chip) => {
  randomizeChip(chip)
  chip.addEventListener("animationiteration", () => randomizeChip(chip))
})

const escapeHTML = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
})[character])

function renderQuestion() {
  if (!currentQuestion) {
    questionPanel.hidden = true
    window.tokenMonitor.setQuestionPanelState("hidden")
    return
  }

  const { status, request, answers, requestID } = currentQuestion
  questionPanel.hidden = false
  questionPanel.classList.toggle("collapsed", questionCollapsed)
  questionToggle.setAttribute("aria-expanded", String(!questionCollapsed))
  questionStatus.dataset.status = status
  questionStatus.textContent = status === "waiting" ? "QUESTION" : status === "answered" ? "ANSWERED" : "REJECTED"
  questionCount.textContent = pendingQuestions.size > 0 ? `· Q:${pendingQuestions.size}` : ""

  const questions = request?.questions ?? []
  const blocks = questions.map((question, index) => {
    const selectedAnswers = answers?.[index] ?? []
    const options = (question.options ?? []).map((option, optionIndex) => {
      const selected = selectedAnswers.includes(option.value ?? option.label)
      return `<div class="question-option${selected ? " selected" : ""}">
        <span class="question-option-index">${selected ? "✓" : `${optionIndex + 1}.`}</span>
        <span class="question-option-main">
          <strong class="question-option-label">${escapeHTML(option.label)}</strong>
          ${option.description ? `<small class="question-option-description">${escapeHTML(option.description)}</small>` : ""}
        </span>
      </div>`
    }).join("")
    const custom = question.custom && status === "waiting"
      ? `<div class="question-option custom"><span class="question-option-index">+</span><span class="question-option-main"><strong class="question-option-label">TYPE YOUR OWN</strong><small class="question-option-description">可输入自定义回答</small></span></div>`
      : ""
    const answer = status === "answered"
      ? `<div class="question-answer">ANSWER: ${escapeHTML((answers?.[index] ?? []).join(" / ") || "—")}</div>`
      : status === "rejected"
        ? '<div class="question-answer rejected">QUESTION REJECTED</div>'
        : ""
    return `<section class="question-block">
      <div class="question-header">${escapeHTML(question.header || `QUESTION ${index + 1}`)}</div>
      <div class="question-text">${escapeHTML(question.question)}</div>
      ${options || custom ? `<div class="question-options">${options}${custom}</div>` : ""}
      ${answer}
    </section>`
  }).join("")

  questionContent.innerHTML = `<div class="question-meta"><span>${escapeHTML(request?.sessionID ?? "SESSION UNKNOWN")}</span><span>${questions.length || 1} ITEM${questions.length === 1 ? "" : "S"}</span></div>${blocks || `<section class="question-block"><div class="question-text">${escapeHTML(requestID ?? "QUESTION UPDATED")}</div></section>`}`
  window.tokenMonitor.setQuestionPanelState(questionCollapsed ? "collapsed" : "expanded")
}

function showQuestion(update) {
  clearTimeout(questionDismissTimer)
  if (update.type === "sync") {
    pendingQuestions.clear()
    for (const request of update.requests ?? []) pendingQuestions.set(request.id, request)
    const request = [...pendingQuestions.values()].at(-1)
    currentQuestion = request ? { status: "waiting", request, requestID: request.id } : undefined
  } else if (update.type === "asked") {
    pendingQuestions.set(update.request.id, update.request)
    currentQuestion = { status: "waiting", request: update.request, requestID: update.request.id }
    questionCollapsed = false
  } else if (update.type === "replied" || update.type === "rejected") {
    pendingQuestions.delete(update.requestID)
    currentQuestion = {
      status: update.type === "replied" ? "answered" : "rejected",
      request: update.request,
      requestID: update.requestID,
      answers: update.answers,
    }
    questionCollapsed = false
  }
  renderQuestion()

  if (update.type === "replied") {
    questionDismissTimer = setTimeout(() => {
      const request = [...pendingQuestions.values()].at(-1)
      currentQuestion = request ? { status: "waiting", request, requestID: request.id } : undefined
      renderQuestion()
    }, 5_000)
  }
}

questionToggle.addEventListener("click", () => {
  questionCollapsed = !questionCollapsed
  renderQuestion()
})

window.tokenMonitor.onQuestion(showQuestion)

const total = (value) => value.input + value.cache + value.output

function paintCacheHit(stats) {
  const promptTokens = stats.input + stats.cacheRead + stats.cacheWrite
  cacheHitElement.textContent = promptTokens > 0
    ? `HIT ${(stats.cacheRead / promptTokens * 100).toFixed(4)}%`
    : "HIT --.----%"
}

function paint(value) {
  const valueTotal = total(value)
  totalElement.textContent = Math.round(valueTotal).toLocaleString()
  const bar = Math.floor(valueTotal / TOKENS_PER_BAR)
  const progress = (valueTotal % TOKENS_PER_BAR) / TOKENS_PER_BAR
  barElement.style.width = `${Math.max(1, progress * 100)}%`
  hudElement.style.setProperty("--chip-x", `${9 + progress * 234}px`)
  if (previousBar !== undefined && bar > previousBar) triggerBurst()
  previousBar = bar
}

function triggerBurst() {
  overlay.classList.remove("burst")
  void overlay.offsetWidth
  overlay.classList.add("burst")
  clearTimeout(burstTimer)
  burstTimer = setTimeout(() => overlay.classList.remove("burst"), 580)
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
  paintCacheHit(stats)
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
