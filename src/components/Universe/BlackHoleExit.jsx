/**
 * BlackHoleExit v3 — Cinematic gravitational collapse over live content
 * =====================================================================
 *
 * WHY THIS LOOKS PROFESSIONAL:
 * ────────────────────────────
 * Previous versions rotated/scaled a rectangular div → visible corners → "cheap."
 *
 * This version:
 *  1. Scale INCREASES (zoom INTO the content) → corners go OFF-SCREEN → never visible
 *  2. clip-path: circle() in PIXELS, computed per-frame → always perfectly circular
 *  3. Clip radius in CSS compensated for scale → exact screen-space circle
 *  4. Photon ring drawn at the EXACT clip boundary → Interstellar-style event horizon
 *  5. Transparent Canvas2D overlay — no opaque fills — real content always visible
 *  6. Universe container set transparent → QuantumBackground visible through the void
 *  7. Gravitational tremor (screen shake, deterministic sinusoidal, smooth)
 *  8. CSS filters driven per-frame: blue-shift, energy compression, desaturation
 *
 * Duration: 4500ms (under 5s limit).
 */
import { useEffect, useRef, useCallback } from 'react'

// ── Constants ──
const DEBRIS_COUNT = 220
const HAWKING_COUNT = 55
const DURATION = 4500
const DPR = Math.min(window.devicePixelRatio || 1, 2)

const COLORS = [
  [0, 212, 228],    // cyan
  [157, 111, 219],  // purple
  [0, 255, 159],    // green
  [255, 200, 100],  // warm gold
  [255, 255, 255],  // white
  [80, 160, 255],   // blue
]

// ── Math helpers ──
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
function lerp(a, b, t) { return a + (b - a) * t }
function easeInCubic(t) { return t * t * t }
function easeInQuart(t) { return t * t * t * t }
function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4) }
function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 }

// ══════════════════════════════════════════════════════════════════
//  DEBRIS PARTICLE — energy ripped from the universe
// ══════════════════════════════════════════════════════════════════
class DebrisParticle {
  constructor(cx, cy, w, h) {
    const angle = Math.random() * Math.PI * 2
    const dist = 0.20 + Math.random() * 0.80
    const maxR = Math.sqrt(w * w + h * h) * 0.52
    this.x = cx + Math.cos(angle) * dist * maxR
    this.y = cy + Math.sin(angle) * dist * maxR
    this.vx = 0; this.vy = 0
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)]
    this.size = 0.6 + Math.random() * 2.0
    this.alpha = 0.25 + Math.random() * 0.65
    this.trail = []; this.trailMax = 4 + Math.floor(Math.random() * 5)
    this.absorbed = false
    this.spinBias = (Math.random() - 0.5) * 0.5
  }

  update(cx, cy, progress, dt) {
    if (this.absorbed) return
    const dx = cx - this.x, dy = cy - this.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 4) { this.absorbed = true; return }
    const gravity = 100 + 25000 * easeInCubic(progress)
    const force = gravity / (dist * dist + 80)
    const nx = dx / dist, ny = dy / dist
    this.vx += nx * force * dt
    this.vy += ny * force * dt
    const tang = (0.4 + this.spinBias) * Math.min(1, dist / 180)
    this.vx += -ny * force * tang * dt
    this.vy += nx * force * tang * dt
    this.vx *= 0.980; this.vy *= 0.980
    this.x += this.vx * dt; this.y += this.vy * dt
    this.trail.unshift({ x: this.x, y: this.y })
    if (this.trail.length > this.trailMax) this.trail.pop()
  }

  draw(ctx) {
    if (this.absorbed) return
    for (let i = 1; i < this.trail.length; i++) {
      const fade = 1 - i / this.trail.length
      ctx.beginPath()
      ctx.arc(this.trail[i].x, this.trail[i].y, this.size * fade * 0.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${this.alpha * fade * 0.25})`
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${this.alpha})`
    ctx.fill()
  }
}

// ══════════════════════════════════════════════════════════════════
//  HAWKING RADIATION PARTICLE
// ══════════════════════════════════════════════════════════════════
class HawkingParticle {
  constructor(cx, cy) {
    const angle = Math.random() * Math.PI * 2
    this.x = cx; this.y = cy
    this.vx = Math.cos(angle) * (150 + Math.random() * 400)
    this.vy = Math.sin(angle) * (150 + Math.random() * 400)
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)]
    this.size = 0.5 + Math.random() * 2
    this.alpha = 0.8 + Math.random() * 0.2
    this.life = 0; this.maxLife = 0.4 + Math.random() * 0.6
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt
    this.vx *= 0.96; this.vy *= 0.96; this.life += dt
  }
  draw(ctx) {
    const fade = Math.max(0, 1 - this.life / this.maxLife)
    if (fade <= 0) return
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${fade * 0.10})`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${fade * this.alpha})`
    ctx.fill()
  }
}

// ══════════════════════════════════════════════════════════════════
//  REALITY FRACTURE — jagged cracks in spacetime
// ══════════════════════════════════════════════════════════════════
class RealityFracture {
  constructor(cx, cy, w, h) {
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)]
    this.angle = Math.random() * Math.PI * 2
    this.segments = []
    const numSegs = 5 + Math.floor(Math.random() * 8)
    const maxLen = Math.min(w, h) * (0.15 + Math.random() * 0.30)
    let x = cx, y = cy, a = this.angle
    for (let i = 0; i < numSegs; i++) {
      const segLen = (maxLen / numSegs) * (0.5 + Math.random())
      a += (Math.random() - 0.5) * 1.2 // jagged random walk
      const nx = x + Math.cos(a) * segLen
      const ny = y + Math.sin(a) * segLen
      this.segments.push({ x1: x, y1: y, x2: nx, y2: ny })
      x = nx; y = ny
    }
    this.born = 0.08 + Math.random() * 0.35 // when it appears
    this.lifespan = 0.15 + Math.random() * 0.20
    this.width = 0.5 + Math.random() * 1.5
    this.branches = []
    // Sub-branches for extra chaos
    if (Math.random() > 0.4 && this.segments.length > 2) {
      const branchIdx = 1 + Math.floor(Math.random() * (this.segments.length - 2))
      const seg = this.segments[branchIdx]
      const ba = a + (Math.random() - 0.5) * 2
      let bx = seg.x2, by = seg.y2
      for (let i = 0; i < 3; i++) {
        const bl = (maxLen / numSegs) * 0.4 * (0.5 + Math.random())
        const nbx = bx + Math.cos(ba + (Math.random() - 0.5) * 0.8) * bl
        const nby = by + Math.sin(ba + (Math.random() - 0.5) * 0.8) * bl
        this.branches.push({ x1: bx, y1: by, x2: nbx, y2: nby })
        bx = nbx; by = nby
      }
    }
  }

  draw(ctx, progress) {
    if (progress < this.born) return
    const localP = (progress - this.born) / this.lifespan
    if (localP > 1) return
    // fade in fast, linger, fade out
    const alpha = localP < 0.15
      ? localP / 0.15
      : localP > 0.7 ? (1 - localP) / 0.3 : 1
    const drawSegs = (segs, widthMul) => {
      for (const s of segs) {
        ctx.beginPath()
        ctx.moveTo(s.x1, s.y1)
        ctx.lineTo(s.x2, s.y2)
        ctx.strokeStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${alpha * 0.6})`
        ctx.lineWidth = this.width * widthMul
        ctx.shadowColor = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${alpha * 0.4})`
        ctx.shadowBlur = 12
        ctx.stroke()
      }
    }
    drawSegs(this.segments, 1)
    drawSegs(this.branches, 0.6)
    ctx.shadowBlur = 0
  }
}

// ══════════════════════════════════════════════════════════════════
//  EDGE SPARK — chaotic particle at the event horizon boundary
// ══════════════════════════════════════════════════════════════════
class EdgeSpark {
  constructor() {
    this.angle = Math.random() * Math.PI * 2
    this.angularVel = (Math.random() - 0.5) * 4 // erratic angular speed
    this.radialOffset = (Math.random() - 0.5) * 30 // jitter around edge
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)]
    this.size = 0.4 + Math.random() * 1.2
    this.alpha = 0.3 + Math.random() * 0.6
    this.flicker = Math.random() * 1000 // phase offset for flicker
    this.born = 0.05 + Math.random() * 0.40
  }

  draw(ctx, cx, cy, screenR, progress, now) {
    if (progress < this.born || screenR < 8) return
    const fade = clamp((progress - this.born) / 0.08, 0, 1) * (screenR > 30 ? 1 : screenR / 30)
    // Flicker: occasionally go invisible for chaotic feel
    const flickerVal = Math.sin(now * 0.013 + this.flicker) + Math.sin(now * 0.029 + this.flicker * 1.7)
    if (flickerVal < -0.8) return // ~20% time invisible = chaotic
    this.angle += this.angularVel * 0.016 // approximate dt
    const r = screenR + this.radialOffset + Math.sin(now * 0.007 + this.flicker) * 8
    if (r < 3) return
    const x = cx + Math.cos(this.angle) * r
    const y = cy + Math.sin(this.angle) * r
    const a = this.alpha * fade * (0.6 + flickerVal * 0.2)
    ctx.beginPath()
    ctx.arc(x, y, this.size * 4, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a * 0.12})`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a})`
    ctx.fill()
  }
}

// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function BlackHoleExit({ active, onComplete, wrapperRef }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const completedRef = useRef(false)

  const runAnimation = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = window.innerWidth, h = window.innerHeight
    canvas.width = w * DPR; canvas.height = h * DPR
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)

    const cx = w / 2, cy = h / 2

    // ── Target DOM elements ──
    const wrapperEl = wrapperRef?.current
    const quantumBg = document.querySelector('[data-quantum-bg]')
    const universeContainer = wrapperEl?.parentNode

    // GPU acceleration hint
    if (wrapperEl) wrapperEl.style.willChange = 'transform, clip-path, filter'
    // Make universe container bg transparent IMMEDIATELY so the real dashboard
    // is visible through the clip-path hole as it shrinks. The canvasWrapper
    // still covers the full screen, so dashboard only appears outside the circle.
    if (universeContainer) universeContainer.style.background = 'transparent'

    // ── Particles ──
    const debris = []
    for (let i = 0; i < DEBRIS_COUNT; i++) debris.push(new DebrisParticle(cx, cy, w, h))
    const hawking = []
    let hawkingSpawned = false

    // ── Reality fractures (spacetime cracks) ──
    const fractures = []
    for (let i = 0; i < 14; i++) fractures.push(new RealityFracture(cx, cy, w, h))

    // ── Edge turbulence sparks ──
    const edgeSparks = []
    for (let i = 0; i < 40; i++) edgeSparks.push(new EdgeSpark())

    // ── Quantum glitch state ──
    let nextGlitchTime = 300 + Math.random() * 500

    // Max circle radius (pixels) to fully cover viewport including corners
    const maxScreenR = Math.sqrt(w * w + h * h) / 2 + 80

    const startTime = performance.now()
    completedRef.current = false
    let lastT = startTime

    function frame(now) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / DURATION, 1)
      const dt = Math.min((now - lastT) / 1000, 0.05)
      lastT = now

      // ══════════════════════════════════════════════════════════
      //  CORE PHYSICS
      //  Key: scale INCREASES (zoom in = falling toward singularity)
      //       clip-path circle in PIXELS (always circular, no corners)
      //       cssR = screenR / scale (compensates for scale)
      // ══════════════════════════════════════════════════════════

      // Clip: gentle start → dramatic acceleration at the end
      const clipP = clamp((progress - 0.06) / 0.76, 0, 1) // 0.06-0.82 → 0-1
      const clipEased = easeInQuart(clipP)
      const screenR = maxScreenR * (1 - clipEased)

      // No scale-up — clip-path alone is circular, no rectangular corners visible.
      // Subtle rotation only (max 8°) for a gentle gravitational vortex feel.
      const rotP = clamp(progress / 0.82, 0, 1)
      const rotation = easeInCubic(rotP) * 8

      // Gravitational tremor (deterministic smooth sinusoidal, not random flickering)
      let shakeX = 0, shakeY = 0
      if (progress > 0.22 && progress < 0.82) {
        const si = easeInCubic((progress - 0.22) / 0.60) * 3.5
        shakeX = (Math.sin(now * 0.031) + Math.sin(now * 0.067)) * si
        shakeY = (Math.cos(now * 0.043) + Math.cos(now * 0.059)) * si
      }

      // CSS Filters — very subtle, no oversaturation
      const saturate = progress < 0.35
        ? 1 + progress * 0.6              // 1 → 1.2 very gentle boost
        : lerp(1.2, 0.3, easeInCubic(clamp((progress - 0.35) / 0.47, 0, 1)))
      const hueRotate = easeInCubic(rotP) * 60 // subtle blue-shift, not extreme
      const brightness = progress < 0.40
        ? 1 + progress * 0.5              // 1 → 1.2 gentle glow
        : lerp(1.2, 0, easeInCubic(clamp((progress - 0.40) / 0.42, 0, 1)))
      const contrast = 1 + clamp(progress, 0, 0.5) * 0.5 // max 1.25
      const blur = progress > 0.55
        ? easeInCubic(clamp((progress - 0.55) / 0.27, 0, 1)) * 10
        : 0

      // ═══ APPLY TO 3D CANVAS WRAPPER ═══
      if (wrapperEl) {
        wrapperEl.style.clipPath = `circle(${screenR}px at 50% 50%)`
        wrapperEl.style.transform = `translate(${shakeX}px, ${shakeY}px) rotate(${rotation}deg)`
        wrapperEl.style.filter = `saturate(${saturate}) hue-rotate(${hueRotate}deg) brightness(${brightness}) contrast(${contrast}) blur(${blur}px)`
        wrapperEl.style.transformOrigin = 'center center'
        wrapperEl.style.transition = 'none'
      }

      // ═══ QUANTUM BACKGROUND (vacío cuántico) ═══
      if (quantumBg) {
        const qP = clamp(progress / 0.88, 0, 1)
        quantumBg.style.opacity = Math.max(0, 0.6 - easeInCubic(qP) * 0.6)
        quantumBg.style.filter = `hue-rotate(${easeInCubic(qP) * 120}deg) blur(${easeInCubic(qP) * 5}px)`
        quantumBg.style.transition = 'none'
      }

      // ══════════════════════════════════════════════════════════
      //  TRANSPARENT CANVAS2D OVERLAY EFFECTS
      // ══════════════════════════════════════════════════════════
      ctx.clearRect(0, 0, w, h)

      // Overlay draw center tracks the shake for perfect photon ring alignment
      const drawCX = cx + shakeX
      const drawCY = cy + shakeY

      // ── Vignette ──
      if (progress > 0.08) {
        const vigAlpha = clamp((progress - 0.08) / 0.25, 0, 1) * 0.55
        const vigGrad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.18, cx, cy, maxScreenR)
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)')
        vigGrad.addColorStop(0.45, `rgba(0,0,0,${vigAlpha * 0.3})`)
        vigGrad.addColorStop(1, `rgba(0,0,0,${vigAlpha})`)
        ctx.fillStyle = vigGrad
        ctx.fillRect(0, 0, w, h)
      }

      // ── Star streaks (light pulled toward singularity) ──
      if (progress > 0.04 && progress < 0.74) {
        const sp = clamp((progress - 0.04) / 0.70, 0, 1)
        const streakAlpha = Math.min(1, sp / 0.12) * (1 - Math.max(0, (sp - 0.78) / 0.22)) * 0.07
        ctx.save()
        ctx.translate(cx, cy)
        for (let i = 0; i < 48; i++) {
          const angle = (i / 48) * Math.PI * 2 + progress * 0.8
          const outerDist = maxScreenR * (1 - sp * 0.15)
          const innerDist = lerp(outerDist * 0.65, 12, easeInCubic(sp))
          const c = COLORS[i % COLORS.length]
          const grad = ctx.createLinearGradient(
            Math.cos(angle) * innerDist, Math.sin(angle) * innerDist,
            Math.cos(angle) * outerDist, Math.sin(angle) * outerDist
          )
          grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${streakAlpha * 3})`)
          grad.addColorStop(0.5, `rgba(${c[0]},${c[1]},${c[2]},${streakAlpha})`)
          grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`)
          ctx.beginPath()
          ctx.moveTo(Math.cos(angle) * innerDist, Math.sin(angle) * innerDist)
          ctx.lineTo(Math.cos(angle) * outerDist, Math.sin(angle) * outerDist)
          ctx.strokeStyle = grad
          ctx.lineWidth = 1 + sp * 2.5
          ctx.stroke()
        }
        ctx.restore()
      }

      // ── Space distortion waves (concentric rings converging) ──
      const waveData = [
        { born: 0.02, color: COLORS[0], maxR: w * 0.80 },
        { born: 0.10, color: COLORS[1], maxR: w * 0.65 },
        { born: 0.18, color: COLORS[2], maxR: w * 0.50 },
        { born: 0.28, color: COLORS[5], maxR: w * 0.35 },
      ]
      for (const wave of waveData) {
        if (progress < wave.born) continue
        const wp = clamp((progress - wave.born) / 0.50, 0, 1)
        const waveR = wave.maxR * (1 - easeInCubic(wp))
        if (waveR < 5) continue
        const wAlpha = (1 - wp) * 0.35 * Math.min(1, (progress - wave.born) / 0.05)
        ctx.beginPath()
        ctx.arc(drawCX, drawCY, waveR, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${wave.color[0]},${wave.color[1]},${wave.color[2]},${wAlpha})`
        ctx.lineWidth = 2 + (1 - wp) * 4
        ctx.shadowColor = `rgba(${wave.color[0]},${wave.color[1]},${wave.color[2]},${wAlpha * 0.5})`
        ctx.shadowBlur = 20
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // ── Gravitational lensing rings ──
      const lensRings = [
        { maxR: 350, delay: 0.04, color: COLORS[0], lw: 2.0 },
        { maxR: 260, delay: 0.12, color: COLORS[1], lw: 1.6 },
        { maxR: 170, delay: 0.20, color: COLORS[2], lw: 1.3 },
      ]
      for (const lr of lensRings) {
        if (progress < lr.delay) continue
        const lp = clamp((progress - lr.delay) / 0.55, 0, 1)
        const r = lr.maxR * (1 - easeInCubic(lp))
        if (r < 3) continue
        const la = (1 - lp) * 0.55
        ctx.beginPath()
        ctx.arc(drawCX, drawCY, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${lr.color[0]},${lr.color[1]},${lr.color[2]},${la})`
        ctx.lineWidth = lr.lw + (1 - lp) * 2
        ctx.shadowColor = `rgba(${lr.color[0]},${lr.color[1]},${lr.color[2]},${la * 0.5})`
        ctx.shadowBlur = 18
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // ══════════════════════════════════════════════════════════
      //  PHOTON RING — at the EXACT boundary of the clip-path
      //  This is the hero visual. Multi-layered concentric rings
      //  with orbiting bright spots (Interstellar Gargantua style).
      //  Perfectly synchronized with the real clip edge.
      // ══════════════════════════════════════════════════════════
      if (screenR > 6 && progress > 0.08) {
        const ringFade = clamp((progress - 0.08) / 0.10, 0, 1) * (screenR > 25 ? 1 : screenR / 25)

        // Multi-layered rings (outer diffuse → sharp core → inner diffuse)
        const photonLayers = [
          { offset: 22, color: [0, 255, 159], width: 12,  alpha: 0.06 },
          { offset: 14, color: [157, 111, 219], width: 7,  alpha: 0.13 },
          { offset: 6,  color: [0, 212, 228], width: 4.5, alpha: 0.35 },
          { offset: 0,  color: [255, 255, 255], width: 2.5, alpha: 0.85 },
          { offset: -4, color: [0, 212, 228], width: 3.5, alpha: 0.40 },
          { offset: -10, color: [157, 111, 219], width: 6,  alpha: 0.18 },
          { offset: -20, color: [0, 255, 159], width: 10,  alpha: 0.05 },
        ]
        for (const pl of photonLayers) {
          const r = screenR + pl.offset
          if (r < 3) continue
          const a = pl.alpha * ringFade
          ctx.beginPath()
          ctx.arc(drawCX, drawCY, r, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(${pl.color[0]},${pl.color[1]},${pl.color[2]},${a})`
          ctx.lineWidth = pl.width
          ctx.shadowColor = `rgba(${pl.color[0]},${pl.color[1]},${pl.color[2]},${a * 0.6})`
          ctx.shadowBlur = pl.width * 4
          ctx.stroke()
          ctx.shadowBlur = 0
        }

        // Orbiting photon bright spots (accretion hot-spots)
        const spotTime = now / 1000
        for (let i = 0; i < 6; i++) {
          const spotAngle = spotTime * (1.5 + i * 0.5) + (i / 6) * Math.PI * 2
          const sx = drawCX + Math.cos(spotAngle) * screenR
          const sy = drawCY + Math.sin(spotAngle) * screenR
          const spotSize = (2 + Math.sin(now / 200 + i) * 1) * ringFade
          const spotGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, spotSize * 8)
          spotGrad.addColorStop(0, `rgba(255,255,255,${0.7 * ringFade})`)
          spotGrad.addColorStop(0.15, `rgba(0,212,228,${0.5 * ringFade})`)
          spotGrad.addColorStop(0.4, `rgba(157,111,219,${0.15 * ringFade})`)
          spotGrad.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.beginPath()
          ctx.arc(sx, sy, spotSize * 8, 0, Math.PI * 2)
          ctx.fillStyle = spotGrad
          ctx.fill()
        }
      }

      // ── Accretion disk glow ──
      if (progress > 0.08 && screenR > 20) {
        const diskAlpha = clamp((progress - 0.08) / 0.10, 0, 1) *
          (screenR > 60 ? 0.35 : (screenR / 60) * 0.35)
        const diskR = Math.min(screenR * 0.6, 120)
        ctx.save()
        ctx.translate(drawCX, drawCY)
        ctx.rotate(progress * Math.PI * 5.5)
        for (let i = 0; i < 3; i++) {
          const la = (i / 3) * Math.PI * 2
          const c = COLORS[i]
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, diskR)
          grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${diskAlpha * 0.5})`)
          grad.addColorStop(0.4, `rgba(${c[0]},${c[1]},${c[2]},${diskAlpha * 0.12})`)
          grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`)
          ctx.beginPath()
          ctx.ellipse(0, 0, diskR, diskR * 0.35, la, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
        }
        ctx.restore()
      }

      // ── Debris particles ──
      for (const p of debris) {
        p.update(drawCX, drawCY, progress, dt)
        p.draw(ctx)
      }

      // ── Reality fractures (spacetime cracks — quantum disorder) ──
      for (const f of fractures) f.draw(ctx, progress)

      // ── Edge turbulence sparks (chaotic event horizon) ──
      for (const s of edgeSparks) s.draw(ctx, drawCX, drawCY, screenR, progress, now)

      // ── Quantum glitch bands (holographic interference) ──
      if (progress > 0.10 && progress < 0.72 && elapsed > nextGlitchTime) {
        nextGlitchTime = elapsed + 120 + Math.random() * 600
        const numBands = 1 + Math.floor(Math.random() * 3)
        for (let i = 0; i < numBands; i++) {
          const bandY = Math.random() * h
          const bandH = 1 + Math.random() * 4
          const c = COLORS[Math.floor(Math.random() * COLORS.length)]
          const ga = 0.04 + Math.random() * 0.08
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${ga})`
          ctx.fillRect(0, bandY, w, bandH)
        }
      }

      // ── Singularity (bright center glow) ──
      if (progress > 0.06 && progress < 0.90) {
        const sp = progress < 0.50
          ? easeOutQuart((progress - 0.06) / 0.44)
          : progress < 0.72 ? 1 : 1 - easeInCubic((progress - 0.72) / 0.18)
        const singSize = 2 + sp * 14
        const singAlpha = sp * 0.85
        const grad = ctx.createRadialGradient(drawCX, drawCY, 0, drawCX, drawCY, singSize * 14)
        grad.addColorStop(0, `rgba(255,255,255,${singAlpha})`)
        grad.addColorStop(0.05, `rgba(215,240,255,${singAlpha * 0.7})`)
        grad.addColorStop(0.15, `rgba(0,212,228,${singAlpha * 0.35})`)
        grad.addColorStop(0.4, `rgba(157,111,219,${singAlpha * 0.10})`)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.beginPath()
        ctx.arc(drawCX, drawCY, singSize * 14, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
        ctx.beginPath()
        ctx.arc(drawCX, drawCY, singSize, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${singAlpha})`
        ctx.shadowColor = `rgba(255,255,255,${singAlpha})`
        ctx.shadowBlur = 40
        ctx.fill()
        ctx.shadowBlur = 0
      }

      // ── Hawking radiation burst ──
      if (progress > 0.70 && !hawkingSpawned) {
        hawkingSpawned = true
        for (let i = 0; i < HAWKING_COUNT; i++) hawking.push(new HawkingParticle(drawCX, drawCY))
      }
      for (const hp of hawking) { hp.update(dt); hp.draw(ctx) }

      // ── Flash (singularity collapse moment) ──
      if (progress > 0.62 && progress < 0.84) {
        const fp = (progress - 0.62) / 0.22
        const flashAlpha = fp < 0.25
          ? easeOutQuart(fp / 0.25) * 0.65
          : 0.65 * (1 - easeInCubic((fp - 0.25) / 0.75))
        const flashGrad = ctx.createRadialGradient(drawCX, drawCY, 0, drawCX, drawCY, w * 0.45)
        flashGrad.addColorStop(0, `rgba(255,255,255,${flashAlpha})`)
        flashGrad.addColorStop(0.08, `rgba(200,235,255,${flashAlpha * 0.6})`)
        flashGrad.addColorStop(0.22, `rgba(0,212,228,${flashAlpha * 0.2})`)
        flashGrad.addColorStop(0.45, `rgba(157,111,219,${flashAlpha * 0.06})`)
        flashGrad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = flashGrad
        ctx.fillRect(0, 0, w, h)
      }

      // ── Vanishing sparkle — bright starburst as the last point disappears ──
      if (progress > 0.72 && progress < 0.96) {
        const vp = (progress - 0.72) / 0.24
        const sparkAlpha = vp < 0.25
          ? easeOutQuart(vp / 0.25)
          : (1 - easeInCubic((vp - 0.25) / 0.75))
        const sparkSize = vp < 0.25 ? lerp(2, 10, vp / 0.25) : lerp(10, 1, (vp - 0.25) / 0.75)
        // Starburst rays — brighter, longer
        const numRays = 8
        for (let i = 0; i < numRays; i++) {
          const rayAngle = (i / numRays) * Math.PI * 2 + progress * 4
          const rayLen = sparkSize * (12 + Math.sin(now * 0.012 + i * 1.3) * 6)
          ctx.beginPath()
          ctx.moveTo(drawCX, drawCY)
          ctx.lineTo(drawCX + Math.cos(rayAngle) * rayLen, drawCY + Math.sin(rayAngle) * rayLen)
          ctx.strokeStyle = `rgba(255,255,255,${sparkAlpha * 0.7})`
          ctx.lineWidth = 1.5
          ctx.shadowColor = `rgba(200,235,255,${sparkAlpha * 0.6})`
          ctx.shadowBlur = 15
          ctx.stroke()
        }
        ctx.shadowBlur = 0
        // Outer glow halo
        const haloGrad = ctx.createRadialGradient(drawCX, drawCY, 0, drawCX, drawCY, sparkSize * 20)
        haloGrad.addColorStop(0, `rgba(255,255,255,${sparkAlpha * 0.95})`)
        haloGrad.addColorStop(0.04, `rgba(215,240,255,${sparkAlpha * 0.7})`)
        haloGrad.addColorStop(0.12, `rgba(0,212,228,${sparkAlpha * 0.3})`)
        haloGrad.addColorStop(0.30, `rgba(157,111,219,${sparkAlpha * 0.08})`)
        haloGrad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.beginPath()
        ctx.arc(drawCX, drawCY, sparkSize * 20, 0, Math.PI * 2)
        ctx.fillStyle = haloGrad
        ctx.fill()
        // Bright core dot
        ctx.beginPath()
        ctx.arc(drawCX, drawCY, sparkSize * 0.8, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${sparkAlpha})`
        ctx.shadowColor = `rgba(255,255,255,${sparkAlpha})`
        ctx.shadowBlur = 35
        ctx.fill()
        ctx.shadowBlur = 0
      }

      // ── Canvas overlay fadeout — smooth final dissolution ──
      if (progress > 0.92) {
        canvas.style.opacity = String(1 - easeInCubic((progress - 0.92) / 0.08))
      }

      // ── Continue or complete ──
      if (progress < 1) {
        animRef.current = requestAnimationFrame(frame)
      } else {
        // Everything already invisible: wrapper clipped to 0, universe bg transparent,
        // canvas overlay at opacity 0. Dashboard is fully visible underneath.
        if (wrapperEl) {
          wrapperEl.style.clipPath = 'circle(0px at 50% 50%)'
          wrapperEl.style.transform = ''
          wrapperEl.style.filter = ''
        }
        canvas.style.opacity = '0'
        if (!completedRef.current) {
          completedRef.current = true
          onComplete?.()
        }
      }
    }

    animRef.current = requestAnimationFrame(frame)
  }, [onComplete, wrapperRef])

  useEffect(() => {
    if (active) runAnimation()
    return () => {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
      const wrapperEl = wrapperRef?.current
      if (wrapperEl) {
        wrapperEl.style.clipPath = ''
        wrapperEl.style.transform = ''
        wrapperEl.style.filter = ''
        wrapperEl.style.transformOrigin = ''
        wrapperEl.style.transition = ''
        wrapperEl.style.willChange = ''
      }
      if (wrapperEl?.parentNode) wrapperEl.parentNode.style.background = ''
      const quantumBg = document.querySelector('[data-quantum-bg]')
      if (quantumBg) {
        quantumBg.style.opacity = ''
        quantumBg.style.filter = ''
        quantumBg.style.transition = ''
      }
      // Reset canvas opacity
      if (canvasRef.current) canvasRef.current.style.opacity = ''
    }
  }, [active, runAnimation, wrapperRef])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 200,
        pointerEvents: 'none',
      }}
    />
  )
}
