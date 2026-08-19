(() => {
  const definitions = []
  const byID = new Map()

  function register(definition) {
    if (!definition || typeof definition.id !== "string" || !definition.id) throw new TypeError("Character id is required")
    if (byID.has(definition.id)) throw new Error(`Character already registered: ${definition.id}`)
    if (typeof definition.svg !== "string" || !definition.svg.trim()) throw new TypeError(`Character ${definition.id} requires svg markup`)
    if (typeof definition.burstPose !== "function") throw new TypeError(`Character ${definition.id} requires burstPose()`)
    const normalized = {
      name: definition.id,
      viewBox: "0 0 64 64",
      width: 36,
      height: 42,
      bottom: 39,
      ...definition,
    }
    definitions.push(normalized)
    byID.set(normalized.id, normalized)
    if (normalized.css) {
      const style = document.createElement("style")
      style.dataset.tokenCharacter = normalized.id
      style.textContent = normalized.css
      document.head.append(style)
    }
    return normalized
  }

  function burstPhase(progress) {
    if (progress < .14) return { name: "resist", progress: progress / .14 }
    if (progress < .25) return { name: "launch", progress: (progress - .14) / .11 }
    if (progress < .82) return { name: "tumble", progress: (progress - .25) / .57 }
    return { name: "land", progress: (progress - .82) / .18 }
  }

  class Controller {
    constructor(element, options = {}) {
      if (!definitions.length) throw new Error("No Token characters are registered")
      this.element = element
      this.trackStart = options.trackStart ?? 17
      this.trackEnd = options.trackEnd ?? 243
      this.index = Math.max(0, Math.min(definitions.length - 1, options.index ?? 0))
      this.progress = 0
      this.burst = undefined
      this.mount(this.index)
    }

    mount(index) {
      this.index = (index + definitions.length) % definitions.length
      this.definition = definitions[this.index]
      const definition = this.definition
      this.element.dataset.character = definition.id
      this.element.dataset.phase = "idle"
      this.element.setAttribute("aria-label", definition.name)
      this.element.style.setProperty("--character-width", `${definition.width}px`)
      this.element.style.setProperty("--character-height", `${definition.height}px`)
      this.element.style.setProperty("--character-bottom", `${definition.bottom}px`)
      this.element.innerHTML = `<svg viewBox="${definition.viewBox}" role="img" aria-label="${definition.name}">${definition.svg}</svg>`
      this.resetOuterPose()
      definition.mounted?.(this.element)
    }

    next() {
      this.mount(this.index + 1)
    }

    setProgress(progress) {
      this.progress = Math.max(0, Math.min(1, progress))
      const x = this.trackStart + this.progress * (this.trackEnd - this.trackStart)
      this.element.style.setProperty("--character-x", `${x}px`)
    }

    beginBurst(startedAt, duration, landingX) {
      this.burst = { startedAt, duration, landingX }
      this.element.dataset.phase = "resist"
    }

    endBurst() {
      this.burst = undefined
      this.next()
      this.setProgress(this.progress)
    }

    resetOuterPose() {
      this.element.style.left = "var(--character-x,17px)"
      this.element.style.transform = "translateX(-50%)"
      this.element.style.opacity = "1"
      this.element.style.filter = ""
    }

    render(now, moving) {
      if (!this.burst) {
        this.resetOuterPose()
        const phase = moving ? "run" : "idle"
        this.element.dataset.phase = phase
        this.definition.render?.(this.element, { phase, progress: 0, now })
        return
      }

      // 与原先 steps(20) 一致，保留 8-bit 阶梯运动观感。
      const raw = Math.max(0, Math.min(1, (now - this.burst.startedAt) / this.burst.duration))
      const stepped = Math.min(1, Math.floor(raw * 20) / 20)
      const phase = burstPhase(stepped)
      const pose = this.definition.burstPose({
        phase: phase.name,
        progress: phase.progress,
        overall: stepped,
        startX: this.trackEnd,
        endX: this.burst.landingX,
      })
      this.element.dataset.phase = phase.name
      this.element.style.left = `${pose.x ?? this.trackEnd}px`
      this.element.style.transform = `translateX(-50%) translateY(${pose.y ?? 0}px) rotate(${pose.rotate ?? 0}deg) scaleX(${pose.scaleX ?? 1}) scaleY(${pose.scaleY ?? 1})`
      this.element.style.opacity = String(pose.opacity ?? 1)
      this.element.style.filter = pose.filter ?? ""
      this.definition.render?.(this.element, { ...phase, overall: stepped, now })
    }
  }

  window.TokenCharacters = Object.freeze({
    register,
    list: () => definitions.map(({ id, name }) => ({ id, name })),
    Controller,
  })
})()
