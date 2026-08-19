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

  function hash(value) {
    return [...value].reduce((result, character) => ((result * 31) + character.charCodeAt(0)) >>> 0, 2166136261)
  }

  const ease = (value) => value * value * (3 - 2 * value)

  function particlePoints(definition, count) {
    if (Array.isArray(definition.particles) && definition.particles.length) {
      return Array.from({ length: count }, (_, index) => definition.particles[index % definition.particles.length])
    }
    const offset = hash(definition.id) % 360 * Math.PI / 180
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    return Array.from({ length: count }, (_, index) => {
      const radius = Math.sqrt((index + .5) / count)
      const angle = offset + index * goldenAngle
      return {
        x: Math.cos(angle) * radius * definition.width * .42,
        y: Math.sin(angle) * radius * definition.height * .42,
      }
    })
  }

  class Controller {
    constructor(element, options = {}) {
      if (!definitions.length) throw new Error("No Token characters are registered")
      this.element = element
      this.transitionElement = options.transitionElement
      this.particles = this.transitionElement ? [...this.transitionElement.querySelectorAll("i")] : []
      this.trackStart = options.trackStart ?? 24
      this.trackEnd = options.trackEnd ?? 242
      this.index = Math.max(0, Math.min(definitions.length - 1, options.index ?? 0))
      this.progress = 0
      this.burst = undefined
      this.switching = undefined
      this.phase = undefined
      this.outerPoseReset = false
      this.mount(this.index)
    }

    mount(index) {
      this.index = (index + definitions.length) % definitions.length
      this.definition = definitions[this.index]
      const definition = this.definition
      this.element.dataset.character = definition.id
      this.element.setAttribute("aria-label", definition.name)
      this.element.style.setProperty("--character-width", `${definition.width}px`)
      this.element.style.setProperty("--character-height", `${definition.height}px`)
      this.element.style.setProperty("--character-bottom", `${definition.bottom}px`)
      this.element.innerHTML = `<svg viewBox="${definition.viewBox}" role="img" aria-label="${definition.name}">${definition.svg}</svg>`
      this.phase = undefined
      this.outerPoseReset = false
      this.resetOuterPose()
      definition.mounted?.(this.element)
      this.setPhase("idle")
    }

    next() {
      this.mount(this.index + 1)
    }

    setProgress(progress) {
      this.progress = Math.max(0, Math.min(1, progress))
      const x = this.trackStart + this.progress * (this.trackEnd - this.trackStart)
      this.currentX = x
      this.element.style.setProperty("--character-x", `${x}px`)
    }

    beginBurst(startedAt, duration, landingX) {
      this.burst = { startedAt, duration, landingX }
      this.outerPoseReset = false
      this.setPhase("resist")
      // 跨圈时进度已进入下一轮左端；同步画出终点首帧，避免等 RAF 时闪现左端角色。
      this.render(startedAt, true)
    }

    prepareParticles(oldDefinition, nextDefinition, duration) {
      if (!this.transitionElement || !this.particles.length) return
      const from = particlePoints(oldDefinition, this.particles.length)
      const to = particlePoints(nextDefinition, this.particles.length)
      this.transitionElement.style.setProperty("--transition-x", `${this.currentX}px`)
      this.transitionElement.style.setProperty("--switch-duration", `${duration}ms`)
      this.particles.forEach((particle, index) => {
        const angle = index * 2.399963 + (hash(oldDefinition.id + nextDefinition.id) % 17) * .13
        const distance = 13 + index % 5 * 3
        particle.style.setProperty("--from-x", `${from[index].x.toFixed(2)}px`)
        particle.style.setProperty("--from-y", `${(54 - oldDefinition.bottom - oldDefinition.height / 2 + from[index].y).toFixed(2)}px`)
        particle.style.setProperty("--burst-x", `${(8 + Math.cos(angle) * distance).toFixed(2)}px`)
        particle.style.setProperty("--burst-y", `${(-7 + Math.sin(angle) * distance * .72).toFixed(2)}px`)
        particle.style.setProperty("--to-x", `${to[index].x.toFixed(2)}px`)
        particle.style.setProperty("--to-y", `${(54 - nextDefinition.bottom - nextDefinition.height / 2 + to[index].y).toFixed(2)}px`)
        particle.style.setProperty("--particle-spin", `${(index % 2 ? -1 : 1) * (90 + index % 4 * 90)}deg`)
        particle.style.setProperty("--particle-delay", `${-index % 6 * 5}ms`)
      })
      this.transitionElement.classList.remove("active")
      void this.transitionElement.offsetWidth
      this.transitionElement.classList.add("active")
    }

    beginSwitch(startedAt, duration) {
      const oldDefinition = this.definition
      const nextIndex = (this.index + 1) % definitions.length
      const nextDefinition = definitions[nextIndex]
      this.burst = undefined
      this.switching = { startedAt, duration, nextIndex, mounted: false }
      this.prepareParticles(oldDefinition, nextDefinition, duration)
      this.setPhase("disperse")
    }

    mountSwitchTarget(now) {
      if (!this.switching || this.switching.mounted) return
      this.switching.mounted = true
      this.mount(this.switching.nextIndex)
      this.setProgress(this.progress)
      // 关节角色需要先生成完整静止姿态，再进入统一重组阶段。
      this.definition.render?.(this.element, { phase: "idle", progress: 0, now })
      this.setPhase("assemble")
      this.element.style.opacity = "0"
      this.outerPoseReset = false
    }

    endSwitch(now = performance.now()) {
      if (!this.switching) return
      this.mountSwitchTarget(now)
      this.switching = undefined
      this.transitionElement?.classList.remove("active")
      this.outerPoseReset = false
      this.resetOuterPose()
    }

    resetOuterPose() {
      if (this.outerPoseReset) return
      this.element.style.left = "var(--character-x,24px)"
      this.element.style.transform = "translateX(-50%)"
      this.element.style.opacity = "1"
      this.element.style.filter = ""
      this.outerPoseReset = true
    }

    setPhase(phase) {
      if (phase === this.phase) return
      const previous = this.phase
      this.phase = phase
      this.element.dataset.phase = phase
      this.definition.phaseChanged?.(this.element, { phase, previous })
    }

    render(now, moving) {
      if (this.switching) {
        const progress = Math.max(0, Math.min(1, (now - this.switching.startedAt) / this.switching.duration))
        if (progress < .48) {
          const fade = ease(progress / .48)
          this.setPhase("disperse")
          this.element.style.left = `${this.currentX}px`
          this.element.style.transform = `translateX(-50%) rotate(${Math.sin(progress * Math.PI * 8) * 5}deg) scale(${1 + fade * .18})`
          this.element.style.opacity = String(1 - fade)
          this.element.style.filter = `brightness(${1 + fade * 1.4})`
        } else {
          this.mountSwitchTarget(now)
          const assemble = ease((progress - .48) / .52)
          this.element.style.left = `${this.currentX}px`
          this.element.style.transform = `translateX(-50%) translateY(${(1 - assemble) * 3}px) scale(${.58 + assemble * .42})`
          this.element.style.opacity = String(assemble)
          this.element.style.filter = `brightness(${2.2 - assemble * 1.2})`
        }
        return
      }
      if (!this.burst) {
        this.resetOuterPose()
        const phase = moving ? "run" : "idle"
        this.setPhase(phase)
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
      this.setPhase(phase.name)
      this.outerPoseReset = false
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
