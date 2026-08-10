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

const questionDrafts = new Map()

function draftFor(request) {
  let draft = questionDrafts.get(request.id)
  if (draft) return draft
  draft = {
    page: 0,
    answers: request.questions.map(() => []),
    custom: request.questions.map(() => ""),
    confirm: false,
    submitting: false,
    sent: false,
    error: "",
  }
  questionDrafts.set(request.id, draft)
  return draft
}

function valuesFor(draft, question, index) {
  const selected = [...(draft.answers[index] ?? [])]
  const custom = (draft.custom[index] ?? "").trim()
  if (!custom) return selected
  if (!question.multiple) return [custom]
  return selected.includes(custom) ? selected : [...selected, custom]
}

function labelsFor(question, values) {
  return values.map((value) => question.options.find((option) => (option.value ?? option.label) === value)?.label ?? value)
}

function progressHTML(total, page) {
  return `<div class="question-progress">${Array.from({ length: total }, (_, index) => `<i class="${index < page ? "done" : index === page ? "current" : ""}"></i>`).join("")}</div>`
}

function readonlyBlocks(request, status, answers) {
  return (request?.questions ?? []).map((question, index) => {
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
    const answer = status === "answered"
      ? `<div class="question-answer">ANSWER: ${escapeHTML(selectedAnswers.join(" / ") || "—")}</div>`
      : '<div class="question-answer rejected">QUESTION REJECTED</div>'
    return `<section class="question-block">
      <div class="question-header">${escapeHTML(question.header || `QUESTION ${index + 1}`)}</div>
      <div class="question-text">${escapeHTML(question.question)}</div>
      ${options ? `<div class="question-options">${options}</div>` : ""}
      ${answer}
    </section>`
  }).join("")
}

function editorHTML(request, draft) {
  const questions = request.questions
  if (draft.submitting) {
    return `<div class="question-sending">${draft.sent ? "SENT TO V2" : "SENDING..."}<br />PLEASE WAIT</div>${draft.error ? `<div class="question-error">${escapeHTML(draft.error)}</div>` : ""}`
  }

  if (draft.confirm) {
    const summary = questions.map((question, index) => {
      const labels = labelsFor(question, valuesFor(draft, question, index))
      return `<div class="question-summary-item"><div class="question-summary-title">${index + 1}. ${escapeHTML(question.header || `QUESTION ${index + 1}`)}</div><div class="question-summary-answer">${escapeHTML(labels.join(" / ") || "—")}</div></div>`
    }).join("")
    return `${progressHTML(questions.length, questions.length)}
      <div class="question-header">CONFIRM ANSWERS</div>
      <div class="question-summary">${summary}</div>
      ${draft.error ? `<div class="question-error">${escapeHTML(draft.error)}</div>` : ""}
      <div class="question-actions"><button class="question-button danger" data-action="reject">DISMISS</button><div class="question-actions-right"><button class="question-button" data-action="edit">BACK</button><button class="question-button primary" data-action="confirm">CONFIRM</button></div></div>`
  }

  const index = Math.min(draft.page, questions.length - 1)
  const question = questions[index]
  const selected = draft.answers[index] ?? []
  const options = (question.options ?? []).map((option, optionIndex) => {
    const value = option.value ?? option.label
    const picked = selected.includes(value)
    return `<button class="question-option${picked ? " selected" : ""}" type="button" data-option="${optionIndex}">
      <span class="question-option-index">${picked ? "✓" : `${optionIndex + 1}.`}</span>
      <span class="question-option-main"><strong class="question-option-label">${escapeHTML(option.label)}</strong>${option.description ? `<small class="question-option-description">${escapeHTML(option.description)}</small>` : ""}</span>
    </button>`
  }).join("")
  const custom = question.custom
    ? `<textarea class="question-custom-input" data-custom placeholder="输入自定义回答…">${escapeHTML(draft.custom[index] ?? "")}</textarea>`
    : ""
  const answered = valuesFor(draft, question, index).length > 0
  return `${progressHTML(questions.length, index)}
    <div class="question-header">${escapeHTML(question.header || `QUESTION ${index + 1}`)}</div>
    <div class="question-text">${escapeHTML(question.question)}</div>
    <div class="question-hint">${question.multiple ? "MULTI SELECT" : "SELECT ONE"} · ${index + 1}/${questions.length}</div>
    ${options ? `<div class="question-options">${options}</div>` : ""}
    ${custom}
    ${draft.error ? `<div class="question-error">${escapeHTML(draft.error)}</div>` : ""}
    <div class="question-actions"><button class="question-button danger" data-action="reject">DISMISS</button><div class="question-actions-right">${index > 0 ? '<button class="question-button" data-action="back">BACK</button>' : ""}<button class="question-button primary" data-action="next"${answered ? "" : " disabled"}>${index === questions.length - 1 ? "REVIEW" : "NEXT"}</button></div></div>`
}

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
  const draft = status === "waiting" && request ? draftFor(request) : undefined
  questionStatus.textContent = status === "waiting" ? (draft?.submitting ? "SENDING" : draft?.confirm ? "CONFIRM" : "QUESTION") : status === "answered" ? "ANSWERED" : "REJECTED"
  const progress = draft && request.questions.length > 1 ? ` · ${Math.min(draft.page + 1, request.questions.length)}/${request.questions.length}` : ""
  questionCount.textContent = `${progress}${pendingQuestions.size > 0 ? ` · Q:${pendingQuestions.size}` : ""}`
  const content = status === "waiting" && request
    ? editorHTML(request, draft)
    : readonlyBlocks(request, status, answers) || `<section class="question-block"><div class="question-text">${escapeHTML(requestID ?? "QUESTION UPDATED")}</div></section>`
  questionContent.innerHTML = `<div class="question-meta"><span>${escapeHTML(request?.sessionID ?? "SESSION UNKNOWN")}</span><span>${request?.questions?.length ?? 1} ITEM${request?.questions?.length === 1 ? "" : "S"}</span></div>${content}`
  window.tokenMonitor.setQuestionPanelState(questionCollapsed ? "collapsed" : "expanded")
}

async function submitQuestion(request, draft) {
  draft.submitting = true
  draft.error = ""
  renderQuestion()
  const allAnswers = request.questions.map((question, index) => valuesFor(draft, question, index))
  const payload = { protocol: request.protocol, sessionID: request.sessionID, requestID: request.id }
  if (request.protocol === "form") {
    payload.answer = Object.fromEntries(request.questions.map((question, index) => [question.key, question.type === "multiselect" ? allAnswers[index] : allAnswers[index][0] ?? ""]))
  } else {
    payload.answers = allAnswers
  }
  try {
    await window.tokenMonitor.replyQuestion(payload)
    draft.sent = true
    renderQuestion()
  } catch (error) {
    draft.submitting = false
    draft.error = error?.message ?? String(error)
    renderQuestion()
  }
}

async function rejectQuestion(request, draft) {
  draft.submitting = true
  draft.error = ""
  renderQuestion()
  try {
    await window.tokenMonitor.rejectQuestion({ protocol: request.protocol, sessionID: request.sessionID, requestID: request.id })
    draft.sent = true
    renderQuestion()
  } catch (error) {
    draft.submitting = false
    draft.error = error?.message ?? String(error)
    renderQuestion()
  }
}

questionContent.addEventListener("click", (event) => {
  const request = currentQuestion?.status === "waiting" ? currentQuestion.request : undefined
  if (!request) return
  const draft = draftFor(request)
  if (draft.submitting) return
  const question = request.questions[draft.page]
  const option = event.target.closest("[data-option]")
  if (option && question) {
    const item = question.options[Number(option.dataset.option)]
    if (!item) return
    const value = item.value ?? item.label
    if (question.multiple) {
      const selected = draft.answers[draft.page]
      draft.answers[draft.page] = selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value]
    } else {
      draft.answers[draft.page] = [value]
      draft.custom[draft.page] = ""
    }
    draft.error = ""
    renderQuestion()
    return
  }

  const action = event.target.closest("[data-action]")?.dataset.action
  if (action === "back") {
    draft.page = Math.max(0, draft.page - 1)
    draft.error = ""
    renderQuestion()
  } else if (action === "next") {
    if (!valuesFor(draft, question, draft.page).length) return
    if (draft.page >= request.questions.length - 1) draft.confirm = true
    else draft.page += 1
    draft.error = ""
    renderQuestion()
  } else if (action === "edit") {
    draft.confirm = false
    draft.page = request.questions.length - 1
    renderQuestion()
  } else if (action === "confirm") {
    void submitQuestion(request, draft)
  } else if (action === "reject") {
    void rejectQuestion(request, draft)
  }
})

questionContent.addEventListener("input", (event) => {
  if (!event.target.matches("[data-custom]")) return
  const request = currentQuestion?.status === "waiting" ? currentQuestion.request : undefined
  if (!request) return
  const draft = draftFor(request)
  const question = request.questions[draft.page]
  draft.custom[draft.page] = event.target.value
  if (!question.multiple && event.target.value.trim()) {
    draft.answers[draft.page] = []
    questionContent.querySelectorAll("[data-option].selected").forEach((option) => option.classList.remove("selected"))
  }
  const next = questionContent.querySelector('[data-action="next"]')
  if (next) next.disabled = valuesFor(draft, question, draft.page).length === 0
})

function oldestPendingQuestion() {
  const request = pendingQuestions.values().next().value
  return request ? { status: "waiting", request, requestID: request.id } : undefined
}

function showQuestion(update) {
  clearTimeout(questionDismissTimer)
  if (update.type === "sync") {
    pendingQuestions.clear()
    for (const request of update.requests ?? []) pendingQuestions.set(request.id, request)
    currentQuestion = oldestPendingQuestion()
  } else if (update.type === "asked") {
    pendingQuestions.set(update.request.id, update.request)
    // 新请求只进入队尾，不打断当前正在展示的旧问题。
    if (!currentQuestion || currentQuestion.status !== "waiting") {
      currentQuestion = oldestPendingQuestion()
      questionCollapsed = false
    }
  } else if (update.type === "replied" || update.type === "rejected") {
    const currentResolved = currentQuestion?.status === "waiting" && currentQuestion.requestID === update.requestID
    pendingQuestions.delete(update.requestID)
    questionDrafts.delete(update.requestID)
    // 其他客户端处理了队列中的非当前问题时，只从队列移除，不抢占当前内容。
    if (currentResolved) {
      if (pendingQuestions.size > 0) {
        // 有积压时跳过 5 秒结果页，立即展示最旧的下一条。
        currentQuestion = oldestPendingQuestion()
      } else {
        currentQuestion = {
          status: update.type === "replied" ? "answered" : "rejected",
          request: update.request,
          requestID: update.requestID,
          answers: update.answers,
        }
      }
      questionCollapsed = false
    }
  }
  renderQuestion()

  if (update.type === "replied" && currentQuestion?.status === "answered") {
    questionDismissTimer = setTimeout(() => {
      currentQuestion = oldestPendingQuestion()
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
