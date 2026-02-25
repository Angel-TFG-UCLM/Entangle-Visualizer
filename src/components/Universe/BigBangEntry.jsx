/**
 * BigBangEntry — Cinematic quantum genesis explosion overlay
 * ===========================================================
 *
 * Canvas2D transparent overlay that plays over the R3F scene during
 * the Big Bang entry animation. Complements the existing QuantumGenesis
 * Three.js component with 2D particle effects, shockwaves, energy
 * filaments, and cosmic flash.
 *
 * Effects:
 *  1. Genesis flash — supernova-style expanding central glow
 *  2. Anamorphic lens streak — cinematic horizontal light flare
 *  3. Shockwave rings — 5 concentric circles racing outward
 *  4. Energy filaments — radial lines forming cosmic web
 *  5. Genesis particles — 150 colored particles exploding from center
 *  6. Quantum sparks — 60 tiny flickers of reality forming across screen
 *  7. Quantum interference bands — brief horizontal glitch lines
 *  8. Gravity well glow — lingering central glow as universe settles
 *  9. CSS brightness/contrast pulse on canvasWrapper (subtle, settles fast)
 *
 * Design philosophy (learned from BlackHoleExit):
 *  - Subtle > over-the-top. Effects complement, never overwhelm.
 *  - Transparent canvas — never obscures the 3D content.
 *  - CSS filters on canvasWrapper are gentle and brief.
 *  - Auto-cleans on unmount.
 *
 * Duration: 3500ms, auto-completes (no callback needed).
 */
import { useEffect, useRef, useCallback } from 'react'

// ── Constants ──
const GENESIS_PARTICLE_COUNT = 150
const FILAMENT_COUNT = 24
const SPARK_COUNT = 60
const DURATION = 3500
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
function easeOutCubic(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3) }
function easeOutQuart(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 4) }
function easeInCubic(t) { return clamp(t, 0, 1) ** 3 }
function easeOutElastic(t) {
  const c4 = (2 * Math.PI) / 3
  if (t <= 0) return 0
  if (t >= 1) return 1
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

// ══════════════════════════════════════════════════════════════════
//  GENESIS PARTICLE — energy exploding from the singularity
// ══════════════════════════════════════════════════════════════════
class GenesisParticle {
  constructor(cx, cy) {
    this.x = cx
    this.y = cy
    const angle = Math.random() * Math.PI * 2
    const speed = 80 + Math.random() * 320
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)]
    this.size = 0.8 + Math.random() * 2.5
    this.alpha = 0.4 + Math.random() * 0.5
    this.trail = []
    this.trailMax = 3 + Math.floor(Math.random() * 5)
    this.drag = 0.965 + Math.random() * 0.025
    this.bornAt = Math.random() * 0.15  // stagger birth
    this.spin = (Math.random() - 0.5) * 0.3
  }

  update(progress, dt) {
    if (progress < this.bornAt) return
    // Tangential spin for spiral effect
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy)
    if (speed > 1) {
      const nx = -this.vy / speed
      const ny = this.vx / speed
      this.vx += nx * this.spin * speed * dt
      this.vy += ny * this.spin * speed * dt
    }
    this.vx *= this.drag
    this.vy *= this.drag
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.trail.unshift({ x: this.x, y: this.y })
    if (this.trail.length > this.trailMax) this.trail.pop()
  }

  draw(ctx, progress) {
    if (progress < this.bornAt) return
    const life = clamp((progress - this.bornAt) / (0.75 - this.bornAt), 0, 1)
    const fadeAlpha = this.alpha * (1 - easeInCubic(life))
    if (fadeAlpha < 0.01) return

    // Trail
    for (let i = 1; i < this.trail.length; i++) {
      const fade = 1 - i / this.trail.length
      ctx.beginPath()
      ctx.arc(this.trail[i].x, this.trail[i].y, this.size * fade * 0.6, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${fadeAlpha * fade * 0.3})`
      ctx.fill()
    }
    // Main particle
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${fadeAlpha})`
    ctx.fill()
  }
}

// ══════════════════════════════════════════════════════════════════
//  ENERGY FILAMENT — radial lines forming cosmic web
// ══════════════════════════════════════════════════════════════════
class EnergyFilament {
  constructor(cx, cy, w, h) {
    this.cx = cx
    this.cy = cy
    this.angle = Math.random() * Math.PI * 2
    this.maxLen = 100 + Math.random() * Math.max(w, h) * 0.45
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)]
    this.bornAt = 0.02 + Math.random() * 0.20
    this.width = 0.4 + Math.random() * 1.2
    this.alpha = 0.15 + Math.random() * 0.25
    // Branches for cosmic web effect
    this.branches = Math.random() > 0.6 ? 1 + Math.floor(Math.random() * 2) : 0
    this.branchAngles = Array.from({ length: this.branches }, () =>
      this.angle + (Math.random() - 0.5) * 0.8
    )
    this.branchLengths = Array.from({ length: this.branches }, () =>
      this.maxLen * (0.3 + Math.random() * 0.4)
    )
    this.branchStarts = Array.from({ length: this.branches }, () =>
      0.3 + Math.random() * 0.5
    )
  }

  draw(ctx, progress) {
    if (progress < this.bornAt) return
    const life = clamp((progress - this.bornAt) / 0.45, 0, 1)
    const growPhase = easeOutCubic(Math.min(life * 2, 1))
    const fadePhase = life > 0.5 ? easeInCubic((life - 0.5) / 0.5) : 0
    const len = this.maxLen * growPhase
    const alpha = this.alpha * (1 - fadePhase)
    if (alpha < 0.01 || len < 2) return

    const endX = this.cx + Math.cos(this.angle) * len
    const endY = this.cy + Math.sin(this.angle) * len

    // Main filament
    ctx.beginPath()
    ctx.moveTo(this.cx, this.cy)
    ctx.lineTo(endX, endY)
    ctx.strokeStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${alpha})`
    ctx.lineWidth = this.width
    ctx.shadowColor = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${alpha * 0.5})`
    ctx.shadowBlur = 8
    ctx.stroke()
    ctx.shadowBlur = 0

    // Branches (cosmic web filaments)
    for (let b = 0; b < this.branches; b++) {
      const branchStart = this.branchStarts[b]
      if (growPhase < branchStart) continue
      const branchGrow = easeOutCubic(clamp((growPhase - branchStart) / (1 - branchStart), 0, 1))
      const bLen = this.branchLengths[b] * branchGrow
      const startX = this.cx + Math.cos(this.angle) * len * branchStart
      const startY = this.cy + Math.sin(this.angle) * len * branchStart
      const bEndX = startX + Math.cos(this.branchAngles[b]) * bLen
      const bEndY = startY + Math.sin(this.branchAngles[b]) * bLen

      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(bEndX, bEndY)
      ctx.strokeStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${alpha * 0.6})`
      ctx.lineWidth = this.width * 0.6
      ctx.stroke()
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  QUANTUM SPARK — tiny flickers of reality forming
// ══════════════════════════════════════════════════════════════════
class QuantumSpark {
  constructor(w, h) {
    this.x = Math.random() * w
    this.y = Math.random() * h
    this.bornAt = 0.08 + Math.random() * 0.55
    this.duration = 0.04 + Math.random() * 0.08
    this.size = 0.5 + Math.random() * 1.5
    this.color = Math.random() > 0.5
      ? [255, 255, 255]
      : COLORS[Math.floor(Math.random() * COLORS.length)]
    this.alpha = 0.3 + Math.random() * 0.6
  }

  draw(ctx, progress) {
    const localP = (progress - this.bornAt) / this.duration
    if (localP < 0 || localP > 1) return
    const flash = localP < 0.3
      ? easeOutQuart(localP / 0.3)
      : 1 - easeInCubic((localP - 0.3) / 0.7)
    const a = this.alpha * flash
    if (a < 0.01) return
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a})`
    ctx.shadowColor = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a * 0.5})`
    ctx.shadowBlur = 6
    ctx.fill()
    ctx.shadowBlur = 0
  }
}

// ══════════════════════════════════════════════════════════════════
//  SPACETIME RIPPLE — concentric distortion waves (like gravitational
//  waves radiating from the genesis event)
// ══════════════════════════════════════════════════════════════════
class SpacetimeRipple {
  constructor(cx, cy, w, h) {
    this.cx = cx
    this.cy = cy
    this.bornAt = 0.25 + Math.random() * 0.25
    this.maxR = Math.max(w, h) * (0.3 + Math.random() * 0.25)
    this.color = COLORS[Math.floor(Math.random() * 3)] // cyan, purple, green only
    this.segments = 60 + Math.floor(Math.random() * 40)
    this.amplitude = 2 + Math.random() * 4
    this.frequency = 6 + Math.random() * 6
    this.alpha = 0.08 + Math.random() * 0.12
    this.speed = 0.8 + Math.random() * 0.4
  }

  draw(ctx, progress, now) {
    if (progress < this.bornAt) return
    const life = clamp((progress - this.bornAt) / (0.50 * this.speed), 0, 1)
    const r = this.maxR * easeOutCubic(life)
    const alpha = this.alpha * (1 - easeInCubic(life))
    if (alpha < 0.005 || r < 5) return

    const time = now / 1000
    ctx.beginPath()
    for (let i = 0; i <= this.segments; i++) {
      const angle = (i / this.segments) * Math.PI * 2
      const ripple = Math.sin(angle * this.frequency + time * 3) * this.amplitude * (1 - life)
      const px = this.cx + Math.cos(angle) * (r + ripple)
      const py = this.cy + Math.sin(angle) * (r + ripple)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.strokeStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${alpha})`
    ctx.lineWidth = 1 + (1 - life) * 1.5
    ctx.shadowColor = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${alpha * 0.4})`
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function BigBangEntry({ active, wrapperRef }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const hasRunRef = useRef(false)

  const runAnimation = useCallback(() => {
    // Prevent double-run
    if (hasRunRef.current) return
    hasRunRef.current = true

    const canvas = canvasRef.current
    if (!canvas) { hasRunRef.current = false; return }
    const ctx = canvas.getContext('2d')
    if (!ctx) { hasRunRef.current = false; return }

    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = w * DPR
    canvas.height = h * DPR
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)

    const cx = w / 2
    const cy = h / 2

    // Spawn all effects
    const particles = Array.from({ length: GENESIS_PARTICLE_COUNT }, () => new GenesisParticle(cx, cy))
    const filaments = Array.from({ length: FILAMENT_COUNT }, () => new EnergyFilament(cx, cy, w, h))
    const sparks = Array.from({ length: SPARK_COUNT }, () => new QuantumSpark(w, h))
    const ripples = Array.from({ length: 4 }, () => new SpacetimeRipple(cx, cy, w, h))

    const wrapperEl = wrapperRef?.current
    const startTime = performance.now()
    let lastTime = startTime

    // Shockwave ring data (born at different times, expand outward)
    const shockwaves = [
      { born: 0.00, color: COLORS[4], maxR: Math.max(w, h) * 0.65, width: 3,   alpha: 0.40 },
      { born: 0.04, color: COLORS[0], maxR: Math.max(w, h) * 0.55, width: 2.5, alpha: 0.30 },
      { born: 0.10, color: COLORS[1], maxR: Math.max(w, h) * 0.48, width: 2,   alpha: 0.25 },
      { born: 0.16, color: COLORS[2], maxR: Math.max(w, h) * 0.40, width: 1.8, alpha: 0.22 },
      { born: 0.24, color: COLORS[5], maxR: Math.max(w, h) * 0.32, width: 1.5, alpha: 0.18 },
    ]

    // Glitch timing
    let nextGlitchTime = 0

    const frame = (now) => {
      const elapsed = now - startTime
      const progress = clamp(elapsed / DURATION, 0, 1)
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now

      ctx.clearRect(0, 0, w, h)

      // ── CSS filters on canvasWrapper (gentle brightness pulse) ──
      if (wrapperEl && progress < 0.50) {
        const brightProg = clamp(progress / 0.35, 0, 1)
        const brightness = lerp(1.35, 1.0, easeOutCubic(brightProg))
        const contrastProg = clamp(progress / 0.40, 0, 1)
        const contrast = lerp(1.10, 1.0, easeOutCubic(contrastProg))
        wrapperEl.style.filter = `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`
        wrapperEl.style.willChange = 'filter'
      } else if (wrapperEl && progress >= 0.50) {
        // Remove filter after settling
        wrapperEl.style.filter = ''
        wrapperEl.style.willChange = ''
      }

      // ══════════════════════════════════════════════════════════
      //  GENESIS FLASH — massive central glow (supernova explosion)
      //  Bright core expands then dissolves. This is the hero moment.
      // ══════════════════════════════════════════════════════════
      if (progress < 0.40) {
        const flashP = clamp(progress / 0.40, 0, 1)
        const flashRadius = easeOutElastic(Math.min(flashP * 1.5, 1)) * Math.max(w, h) * 0.35
        const flashAlpha = flashP < 0.15
          ? easeOutQuart(flashP / 0.15) * 0.70
          : 0.70 * (1 - easeInCubic((flashP - 0.15) / 0.85))

        if (flashAlpha > 0.01) {
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashRadius)
          grad.addColorStop(0,    `rgba(255,255,255,${flashAlpha})`)
          grad.addColorStop(0.04, `rgba(220,240,255,${flashAlpha * 0.85})`)
          grad.addColorStop(0.10, `rgba(0,212,228,${flashAlpha * 0.45})`)
          grad.addColorStop(0.25, `rgba(157,111,219,${flashAlpha * 0.15})`)
          grad.addColorStop(0.50, `rgba(80,160,255,${flashAlpha * 0.05})`)
          grad.addColorStop(1,    'rgba(0,0,0,0)')
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, w, h)
        }

        // Bright core dot
        if (flashP < 0.6) {
          const coreAlpha = (1 - flashP / 0.6) * 0.95
          const coreSize = 2 + flashP * 8
          ctx.beginPath()
          ctx.arc(cx, cy, coreSize, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${coreAlpha})`
          ctx.shadowColor = `rgba(255,255,255,${coreAlpha})`
          ctx.shadowBlur = 40
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }

      // ══════════════════════════════════════════════════════════
      //  ANAMORPHIC LENS STREAK — cinematic horizontal light flare
      //  Like a camera capturing an intense explosion
      // ══════════════════════════════════════════════════════════
      if (progress < 0.25) {
        const streakP = clamp(progress / 0.25, 0, 1)
        const streakAlpha = streakP < 0.2
          ? easeOutQuart(streakP / 0.2) * 0.35
          : 0.35 * (1 - easeInCubic((streakP - 0.2) / 0.8))
        const streakW = easeOutCubic(Math.min(streakP * 2, 1)) * w * 0.85
        const streakH = 1.5 + (1 - streakP) * 3

        if (streakAlpha > 0.01) {
          const streakGrad = ctx.createLinearGradient(cx - streakW / 2, cy, cx + streakW / 2, cy)
          streakGrad.addColorStop(0,   'rgba(255,255,255,0)')
          streakGrad.addColorStop(0.2, `rgba(0,212,228,${streakAlpha * 0.3})`)
          streakGrad.addColorStop(0.5, `rgba(255,255,255,${streakAlpha})`)
          streakGrad.addColorStop(0.8, `rgba(157,111,219,${streakAlpha * 0.3})`)
          streakGrad.addColorStop(1,   'rgba(255,255,255,0)')
          ctx.fillStyle = streakGrad
          ctx.fillRect(cx - streakW / 2, cy - streakH / 2, streakW, streakH)

          // Secondary thinner streak (vertical, much subtler)
          const vStreakH = streakW * 0.3
          const vStreakW = streakH * 0.5
          const vGrad = ctx.createLinearGradient(cx, cy - vStreakH / 2, cx, cy + vStreakH / 2)
          vGrad.addColorStop(0,   'rgba(255,255,255,0)')
          vGrad.addColorStop(0.5, `rgba(200,230,255,${streakAlpha * 0.15})`)
          vGrad.addColorStop(1,   'rgba(255,255,255,0)')
          ctx.fillStyle = vGrad
          ctx.fillRect(cx - vStreakW / 2, cy - vStreakH / 2, vStreakW, vStreakH)
        }
      }

      // ══════════════════════════════════════════════════════════
      //  SHOCKWAVE RINGS — concentric circles racing outward
      // ══════════════════════════════════════════════════════════
      for (const sw of shockwaves) {
        if (progress < sw.born) continue
        const swP = clamp((progress - sw.born) / 0.50, 0, 1)
        const r = sw.maxR * easeOutCubic(swP)
        if (r < 3) continue
        const swAlpha = sw.alpha * (1 - easeInCubic(swP))
        if (swAlpha < 0.01) continue

        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${sw.color[0]},${sw.color[1]},${sw.color[2]},${swAlpha})`
        ctx.lineWidth = sw.width + (1 - swP) * 3
        ctx.shadowColor = `rgba(${sw.color[0]},${sw.color[1]},${sw.color[2]},${swAlpha * 0.5})`
        ctx.shadowBlur = 15
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // ── Energy filaments (cosmic web forming) ──
      for (const f of filaments) f.draw(ctx, progress)

      // ── Spacetime ripples (gravitational wave distortions) ──
      for (const rp of ripples) rp.draw(ctx, progress, now)

      // ── Genesis particles (outward burst from singularity) ──
      for (const p of particles) {
        p.update(progress, dt)
        p.draw(ctx, progress)
      }

      // ── Quantum sparks (reality forming across the void) ──
      for (const s of sparks) s.draw(ctx, progress)

      // ══════════════════════════════════════════════════════════
      //  QUANTUM INTERFERENCE BANDS — brief horizontal glitch lines
      //  Reality is unstable right after genesis
      // ══════════════════════════════════════════════════════════
      if (progress > 0.05 && progress < 0.45 && elapsed > nextGlitchTime) {
        nextGlitchTime = elapsed + 150 + Math.random() * 500
        const numBands = 1 + Math.floor(Math.random() * 2)
        for (let i = 0; i < numBands; i++) {
          const bandY = Math.random() * h
          const bandH = 1 + Math.random() * 3
          const c = COLORS[Math.floor(Math.random() * COLORS.length)]
          const ga = 0.03 + Math.random() * 0.06
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${ga})`
          ctx.fillRect(0, bandY, w, bandH)
        }
      }

      // ══════════════════════════════════════════════════════════
      //  GRAVITY WELL — lingering central glow as universe settles
      // ══════════════════════════════════════════════════════════
      if (progress > 0.10 && progress < 0.80) {
        const gwP = clamp((progress - 0.10) / 0.70, 0, 1)
        const gwAlpha = gwP < 0.3
          ? easeOutQuart(gwP / 0.3) * 0.25
          : 0.25 * (1 - easeInCubic((gwP - 0.3) / 0.7))
        const gwSize = 10 + gwP * 60

        if (gwAlpha > 0.005) {
          const gwGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, gwSize)
          gwGrad.addColorStop(0,   `rgba(0,212,228,${gwAlpha * 0.5})`)
          gwGrad.addColorStop(0.3, `rgba(157,111,219,${gwAlpha * 0.2})`)
          gwGrad.addColorStop(0.7, `rgba(0,255,159,${gwAlpha * 0.06})`)
          gwGrad.addColorStop(1,   'rgba(0,0,0,0)')
          ctx.fillStyle = gwGrad
          ctx.beginPath()
          ctx.arc(cx, cy, gwSize, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ══════════════════════════════════════════════════════════
      //  NEBULA WISPS — faint gaseous clouds drifting outward
      //  Adds depth and cosmic atmosphere
      // ══════════════════════════════════════════════════════════
      if (progress > 0.15 && progress < 0.70) {
        const nebP = clamp((progress - 0.15) / 0.55, 0, 1)
        const nebAlpha = nebP < 0.4
          ? easeOutCubic(nebP / 0.4) * 0.06
          : 0.06 * (1 - easeInCubic((nebP - 0.4) / 0.6))

        if (nebAlpha > 0.003) {
          // 3 asymmetric nebula patches
          const nebulae = [
            { angle: 0.7, dist: 120, size: 180, color: COLORS[0] },
            { angle: 2.8, dist: 100, size: 150, color: COLORS[1] },
            { angle: 4.5, dist: 140, size: 130, color: COLORS[2] },
          ]
          for (const neb of nebulae) {
            const nebDist = neb.dist * easeOutCubic(nebP)
            const nx = cx + Math.cos(neb.angle) * nebDist
            const ny = cy + Math.sin(neb.angle) * nebDist
            const nebSize = neb.size * (0.3 + nebP * 0.7)
            const nebGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, nebSize)
            nebGrad.addColorStop(0,   `rgba(${neb.color[0]},${neb.color[1]},${neb.color[2]},${nebAlpha})`)
            nebGrad.addColorStop(0.4, `rgba(${neb.color[0]},${neb.color[1]},${neb.color[2]},${nebAlpha * 0.4})`)
            nebGrad.addColorStop(1,   'rgba(0,0,0,0)')
            ctx.beginPath()
            ctx.arc(nx, ny, nebSize, 0, Math.PI * 2)
            ctx.fillStyle = nebGrad
            ctx.fill()
          }
        }
      }

      // ── Canvas overlay fadeout — smooth final dissolution (last 12%) ──
      if (progress > 0.88) {
        canvas.style.opacity = String(1 - easeInCubic((progress - 0.88) / 0.12))
      }

      // ── Continue or complete ──
      if (progress < 1) {
        animRef.current = requestAnimationFrame(frame)
      } else {
        // Clean up wrapper CSS
        if (wrapperEl) {
          wrapperEl.style.filter = ''
          wrapperEl.style.willChange = ''
        }
        canvas.style.opacity = '0'
        animRef.current = null
      }
    }

    animRef.current = requestAnimationFrame(frame)
  }, [wrapperRef])

  useEffect(() => {
    if (active && !hasRunRef.current) {
      runAnimation()
    }
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current)
        animRef.current = null
      }
      const wrapperEl = wrapperRef?.current
      if (wrapperEl) {
        wrapperEl.style.filter = ''
        wrapperEl.style.willChange = ''
      }
      if (canvasRef.current) canvasRef.current.style.opacity = ''
      hasRunRef.current = false
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
