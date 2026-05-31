/**
 * BigBangEntry v2 — Cinematic Quantum Genesis
 * ============================================
 *
 * Transparent canvas2D overlay that plays a 5-phase cinematic Big Bang
 * over the 3D R3F scene. Designed to feel like a Marvel-tier opening shot:
 * anticipation → ignition → primary shockwave → cosmic web → settle.
 *
 * Phases (total 4000ms):
 *   1. SINGULARITY    (0    – 400 ms)  energy lines converge into a pulsing point
 *   2. IGNITION       (400  – 800 ms)  white flash + chromatic aberration + anamorphic flare
 *   3. SHOCKWAVE      (800  – 1900 ms) plasma streaks + 5 concentric rings + 240 particles burst
 *   4. COSMIC WEB     (1900 – 3200 ms) filaments draw outward, stars turn on across the sky
 *   5. SETTLE         (3200 – 4000 ms) afterglow fades, residual sparks twinkle
 *
 * Design principles:
 *   - Transparent canvas — never obscures the 3D content underneath
 *   - CSS filters on canvasWrapper are *gentle* and brief (only during phase 2)
 *   - Auto-cleans on unmount; re-runs only when `replay` prop changes
 *   - 60 FPS target with delta-time integration (resilient to frame drops)
 */
import { useEffect, useRef, useCallback } from 'react'

const DURATION = 4000
const DPR = Math.min(window.devicePixelRatio || 1, 2)

const COLORS = {
  white:  [255, 255, 255],
  cyan:   [0,   212, 228],
  purple: [157, 111, 219],
  green:  [0,   255, 159],
  gold:   [255, 200, 100],
  blue:   [80,  160, 255],
}
const PARTICLE_PALETTE = [COLORS.cyan, COLORS.purple, COLORS.green, COLORS.gold, COLORS.white, COLORS.blue]

/* ─── Math helpers ─── */
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)) }
function lerp(a, b, t) { return a + (b - a) * t }
function easeOutCubic(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3) }
function easeOutQuart(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 4) }
function easeInCubic(t)  { return clamp(t, 0, 1) ** 3 }
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2 }

/* Map progress (0..1) → phase-local progress (0..1) for a [start,end] window */
function phaseT(p, start, end) {
  if (p < start) return 0
  if (p > end) return 1
  return (p - start) / (end - start)
}

/* ══════════════════════════════════════════════════════════════════
 * PHASE 1: CONVERGENT ENERGY STREAKS
 * Líneas brillantes desde los bordes del viewport convergiendo al centro.
 * Comunican "algo se está formando". 14-18 streaks, ángulos pseudoaleatorios.
 * ══════════════════════════════════════════════════════════════════ */
class ConvergentStreak {
  constructor(cx, cy, w, h) {
    this.cx = cx; this.cy = cy
    this.angle = Math.random() * Math.PI * 2
    const startDist = Math.hypot(w, h) * (0.45 + Math.random() * 0.20)
    this.x0 = cx + Math.cos(this.angle) * startDist
    this.y0 = cy + Math.sin(this.angle) * startDist
    this.length = 80 + Math.random() * 180
    this.color = PARTICLE_PALETTE[Math.floor(Math.random() * 4)]  // exclude white/blue → too dim
    this.bornAt = Math.random() * 0.4  // local to phase, staggered
    this.lateral = (Math.random() - 0.5) * 0.15  // slight bend
  }
  draw(ctx, phaseProg) {
    if (phaseProg < this.bornAt) return
    const t = clamp((phaseProg - this.bornAt) / (1 - this.bornAt), 0, 1)
    const e = easeInCubic(t)  // accelerate into the singularity
    const headX = lerp(this.x0, this.cx, e)
    const headY = lerp(this.y0, this.cy, e)
    const tailX = headX - Math.cos(this.angle) * this.length * (1 - e * 0.7)
    const tailY = headY - Math.sin(this.angle) * this.length * (1 - e * 0.7)
    const alpha = (1 - easeInCubic(t)) * 0.85
    if (alpha < 0.01) return
    const grad = ctx.createLinearGradient(tailX, tailY, headX, headY)
    grad.addColorStop(0, `rgba(${this.color[0]},${this.color[1]},${this.color[2]},0)`)
    grad.addColorStop(1, `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${alpha})`)
    ctx.strokeStyle = grad
    ctx.lineWidth = 1.5 + e * 1.5
    ctx.shadowColor = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${alpha * 0.6})`
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(tailX, tailY); ctx.lineTo(headX, headY)
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

/* ══════════════════════════════════════════════════════════════════
 * PHASE 3: BURST PARTICLES (con chromatic aberration RGB)
 * Cada partícula tiene 3 sub-puntos R/G/B desplazados → efecto film cromático
 * ══════════════════════════════════════════════════════════════════ */
class BurstParticle {
  constructor(cx, cy) {
    this.x = cx; this.y = cy
    const angle = Math.random() * Math.PI * 2
    const speed = 140 + Math.random() * 420
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed
    this.color = PARTICLE_PALETTE[Math.floor(Math.random() * PARTICLE_PALETTE.length)]
    this.size = 0.9 + Math.random() * 2.4
    this.alpha = 0.55 + Math.random() * 0.40
    this.trail = []
    this.trailMax = 5 + Math.floor(Math.random() * 6)
    this.drag = 0.955 + Math.random() * 0.030
    this.bornAt = Math.random() * 0.18
    this.spin = (Math.random() - 0.5) * 0.4
  }
  update(localT, dt) {
    if (localT < this.bornAt) return
    const speed = Math.hypot(this.vx, this.vy)
    if (speed > 1) {  // tangential spin → spiral effect
      const nx = -this.vy / speed
      const ny =  this.vx / speed
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
  draw(ctx, localT, chromaOffset) {
    if (localT < this.bornAt) return
    const life = clamp((localT - this.bornAt) / (0.85 - this.bornAt), 0, 1)
    const a = this.alpha * (1 - easeInCubic(life))
    if (a < 0.01) return
    // Trail
    for (let i = 1; i < this.trail.length; i++) {
      const f = 1 - i / this.trail.length
      ctx.beginPath()
      ctx.arc(this.trail[i].x, this.trail[i].y, this.size * f * 0.65, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a * f * 0.35})`
      ctx.fill()
    }
    // Chromatic-aberration triplet (R/G/B offset around true position)
    if (chromaOffset > 0.5) {
      ctx.beginPath(); ctx.arc(this.x - chromaOffset, this.y, this.size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,80,80,${a * 0.5})`; ctx.fill()
      ctx.beginPath(); ctx.arc(this.x + chromaOffset, this.y, this.size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(80,80,255,${a * 0.5})`; ctx.fill()
    }
    // Main particle (G + actual color)
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a})`
    ctx.fill()
  }
}

/* ══════════════════════════════════════════════════════════════════
 * PHASE 3: PLASMA STREAK
 * Rayos cósmicos largos cruzando la pantalla por el centro (estilo
 * "cosmic ray" o trazas de partículas relativistas).
 * ══════════════════════════════════════════════════════════════════ */
class PlasmaStreak {
  constructor(cx, cy, w, h) {
    this.cx = cx; this.cy = cy
    this.angle = Math.random() * Math.PI * 2
    const reach = Math.hypot(w, h) * (0.45 + Math.random() * 0.25)
    this.x1 = cx + Math.cos(this.angle) * reach
    this.y1 = cy + Math.sin(this.angle) * reach
    this.x2 = cx - Math.cos(this.angle) * reach * 0.20  // streak extends past center slightly
    this.y2 = cy - Math.sin(this.angle) * reach * 0.20
    this.color = PARTICLE_PALETTE[Math.floor(Math.random() * PARTICLE_PALETTE.length)]
    this.bornAt = Math.random() * 0.25
    this.width = 1.2 + Math.random() * 1.6
  }
  draw(ctx, localT) {
    if (localT < this.bornAt) return
    const t = clamp((localT - this.bornAt) / (1 - this.bornAt), 0, 1)
    // Streak extends outward fast, then fades
    const headT = easeOutQuart(t)
    const hx = lerp(this.cx, this.x1, headT)
    const hy = lerp(this.cy, this.y1, headT)
    const tx = lerp(this.cx, this.x2, headT)
    const ty = lerp(this.cy, this.y2, headT)
    const a = (1 - easeInCubic(t)) * 0.75
    if (a < 0.01) return
    const grad = ctx.createLinearGradient(tx, ty, hx, hy)
    grad.addColorStop(0,    `rgba(${this.color[0]},${this.color[1]},${this.color[2]},0)`)
    grad.addColorStop(0.5,  `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a})`)
    grad.addColorStop(0.85, `rgba(255,255,255,${a * 0.9})`)
    grad.addColorStop(1,    `rgba(${this.color[0]},${this.color[1]},${this.color[2]},0)`)
    ctx.strokeStyle = grad
    ctx.lineWidth = this.width + (1 - t) * 1.2
    ctx.shadowColor = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a * 0.6})`
    ctx.shadowBlur = 14
    ctx.beginPath()
    ctx.moveTo(tx, ty); ctx.lineTo(hx, hy)
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

/* ══════════════════════════════════════════════════════════════════
 * PHASE 4: FILAMENT (cosmic web)
 * Línea curva creciendo radialmente desde el centro, con segmentos.
 * Representa la estructura a gran escala del universo recién formado.
 * ══════════════════════════════════════════════════════════════════ */
class Filament {
  constructor(cx, cy, w, h) {
    this.cx = cx; this.cy = cy
    this.angle = Math.random() * Math.PI * 2
    this.maxLen = 110 + Math.random() * Math.max(w, h) * 0.45
    this.color = PARTICLE_PALETTE[Math.floor(Math.random() * PARTICLE_PALETTE.length)]
    this.curvature = (Math.random() - 0.5) * 0.6
    this.bornAt = Math.random() * 0.35
    this.width = 0.7 + Math.random() * 1.4
  }
  draw(ctx, localT) {
    if (localT < this.bornAt) return
    const t = clamp((localT - this.bornAt) / (1 - this.bornAt), 0, 1)
    const len = this.maxLen * easeOutCubic(Math.min(t * 2, 1))
    if (len < 4) return
    const a = (1 - easeInCubic(Math.max(0, t * 1.3 - 0.3))) * 0.55
    if (a < 0.01) return
    // Curved filament via quadratic bezier
    const ex = this.cx + Math.cos(this.angle) * len
    const ey = this.cy + Math.sin(this.angle) * len
    const perpX = -Math.sin(this.angle)
    const perpY =  Math.cos(this.angle)
    const ctrlX = this.cx + Math.cos(this.angle) * len * 0.5 + perpX * len * this.curvature
    const ctrlY = this.cy + Math.sin(this.angle) * len * 0.5 + perpY * len * this.curvature
    ctx.strokeStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a})`
    ctx.lineWidth = this.width
    ctx.shadowColor = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a * 0.5})`
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(this.cx, this.cy)
    ctx.quadraticCurveTo(ctrlX, ctrlY, ex, ey)
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

/* ══════════════════════════════════════════════════════════════════
 * PHASE 4-5: STAR (turning on across the sky)
 * Puntos blancos que aparecen progresivamente en posiciones aleatorias
 * tras la formación de la estructura cósmica.
 * ══════════════════════════════════════════════════════════════════ */
class Star {
  constructor(w, h, cx, cy) {
    // Position with mild bias away from center (avoid covering 3D content)
    const angle = Math.random() * Math.PI * 2
    const dist = (0.18 + Math.random() * 0.45) * Math.min(w, h)
    this.x = cx + Math.cos(angle) * dist
    this.y = cy + Math.sin(angle) * dist
    this.size = 0.4 + Math.random() * 1.2
    this.bornAt = Math.random() * 0.7  // staggered turn-on across the full phase
    this.maxAlpha = 0.45 + Math.random() * 0.45
    // Twinkle
    this.twinkleFreq = 1.5 + Math.random() * 2.5
    this.twinklePhase = Math.random() * Math.PI * 2
  }
  draw(ctx, localT, absoluteTime) {
    if (localT < this.bornAt) return
    const turnOn = clamp((localT - this.bornAt) / 0.15, 0, 1)
    const twinkle = 0.7 + 0.3 * Math.sin(absoluteTime * this.twinkleFreq + this.twinklePhase)
    const a = this.maxAlpha * easeOutCubic(turnOn) * twinkle
    if (a < 0.02) return
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.fill()
    // Soft halo for the brighter ones
    if (this.size > 0.9) {
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.size * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(180,220,255,${a * 0.15})`
      ctx.fill()
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════════ */
export default function BigBangEntry({ active, wrapperRef, replay = 0 }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const hasRunRef = useRef(false)
  const lastReplayRef = useRef(replay)

  const runAnimation = useCallback(() => {
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
    const wrapperEl = wrapperRef?.current

    /* ─── Spawn all actors ─── */
    const streaks   = Array.from({ length: 18 }, () => new ConvergentStreak(cx, cy, w, h))
    const bursts    = Array.from({ length: 240 }, () => new BurstParticle(cx, cy))
    const plasmas   = Array.from({ length: 14 }, () => new PlasmaStreak(cx, cy, w, h))
    const filaments = Array.from({ length: 28 }, () => new Filament(cx, cy, w, h))
    const stars     = Array.from({ length: 110 }, () => new Star(w, h, cx, cy))

    /* ─── Shockwave configuration (5 concentric rings, staggered) ─── */
    const maxDim = Math.max(w, h)
    const shockwaves = [
      { born: 0.00, color: COLORS.white,  maxR: maxDim * 0.70, width: 4.0, alpha: 0.55 },
      { born: 0.05, color: COLORS.cyan,   maxR: maxDim * 0.62, width: 3.0, alpha: 0.40 },
      { born: 0.12, color: COLORS.purple, maxR: maxDim * 0.54, width: 2.4, alpha: 0.32 },
      { born: 0.22, color: COLORS.green,  maxR: maxDim * 0.45, width: 2.0, alpha: 0.26 },
      { born: 0.34, color: COLORS.gold,   maxR: maxDim * 0.36, width: 1.6, alpha: 0.22 },
    ]

    const startTime = performance.now()
    let lastTime = startTime

    /* ─── Cleanup of CSS filters on wrapper ─── */
    const resetWrapper = () => {
      if (!wrapperEl) return
      wrapperEl.style.filter = ''
      wrapperEl.style.transform = ''
      wrapperEl.style.transformOrigin = ''
    }

    const frame = (now) => {
      const elapsed = now - startTime
      const progress = clamp(elapsed / DURATION, 0, 1)
      const dt = Math.min(0.033, (now - lastTime) / 1000)
      lastTime = now
      const absT = (now - startTime) / 1000

      ctx.clearRect(0, 0, w, h)

      /* ════════════════════════════════════════════════════════
       * CAMERA FLY-IN (simulado por CSS transform sobre wrapper)
       * Antes del flash: wrapper a scale 1.04 (la cámara está
       * "pegada" al punto donde se va a formar el universo).
       * Tras el flash y durante cosmic web: scale → 1.0 (la cámara
       * retrocede revelando el universo completo).
       * Sutil pero refuerza el sentido de "nace algo enorme".
       * ════════════════════════════════════════════════════════ */
      if (wrapperEl) {
        // Calcular zoom independiente del filter (que se gestiona en phase 2)
        const flyEase = progress < 0.18
          ? 1.04                                                      // sostenido (anticipación)
          : progress < 0.55
            ? lerp(1.04, 1.0, easeOutCubic((progress - 0.18) / 0.37)) // retrocede tras el flash
            : 1.0                                                     // asentado
        // Solo escribir transform si no estamos en phase 2 (que escribe filter pero no transform)
        wrapperEl.style.transform = `scale(${flyEase})`
        wrapperEl.style.transformOrigin = 'center center'
      }

      /* ════════════════════════════════════════════════════════
       * CINEMATIC OVERLAY — Vignette inversa
       * Máxima al inicio (anticipación, oscuridad antes del
       * nacimiento del universo), se desvanece con el flash de
       * phase 2 → metáfora: "antes del big bang no existe nada,
       * después se ilumina todo".
       * ════════════════════════════════════════════════════════ */
      const vigEase = progress < 0.10
        ? 1                                              // peak
        : progress < 0.30
          ? 1 - easeOutQuart((progress - 0.10) / 0.20)   // fade out con la explosión
          : 0
      if (vigEase > 0.05) {
        const vigGrad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.10, cx, cy, Math.hypot(w, h) * 0.55)
        vigGrad.addColorStop(0,    'rgba(0,0,0,0)')
        vigGrad.addColorStop(0.4,  `rgba(0,0,0,${vigEase * 0.20})`)
        vigGrad.addColorStop(0.8,  `rgba(0,0,0,${vigEase * 0.65})`)
        vigGrad.addColorStop(1,    `rgba(0,0,0,${vigEase * 0.95})`)
        ctx.fillStyle = vigGrad
        ctx.fillRect(0, 0, w, h)
      }

      /* ════════════════════════════════════════════════════════
       * PHASE 1: SINGULARITY  (0 → 0.10 of total)
       * Energy lines converge into a pulsing white-cyan point
       * ════════════════════════════════════════════════════════ */
      const p1 = phaseT(progress, 0.0, 0.10)
      if (p1 > 0 && p1 < 1) {
        // Convergent streaks rushing toward center
        for (const s of streaks) s.draw(ctx, p1)
        // Pulsing seed dot at the centre (anticipation)
        const pulse = 0.55 + 0.45 * Math.sin(absT * 18)
        const seedR = 2 + p1 * 6
        const seedA = 0.55 + p1 * 0.4
        const seedGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, seedR * 8)
        seedGrad.addColorStop(0,    `rgba(255,255,255,${seedA * pulse})`)
        seedGrad.addColorStop(0.3,  `rgba(0,212,228,${seedA * pulse * 0.5})`)
        seedGrad.addColorStop(1,    'rgba(0,0,0,0)')
        ctx.fillStyle = seedGrad
        ctx.fillRect(cx - seedR * 8, cy - seedR * 8, seedR * 16, seedR * 16)
      }

      /* ════════════════════════════════════════════════════════
       * PHASE 2: IGNITION  (0.08 → 0.22 of total)
       * The flash: chromatic aberration + white overlay + anamorphic flare
       * ════════════════════════════════════════════════════════ */
      const p2 = phaseT(progress, 0.08, 0.22)
      if (p2 > 0 && p2 < 1) {
        // Massive central white flash (radial gradient covering ~entire screen)
        const flashEase = p2 < 0.30 ? easeOutQuart(p2 / 0.30) : 1 - easeInCubic((p2 - 0.30) / 0.70)
        const flashA = clamp(flashEase * 0.85, 0, 0.85)
        if (flashA > 0.01) {
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDim * 0.7)
          grad.addColorStop(0,    `rgba(255,255,255,${flashA})`)
          grad.addColorStop(0.18, `rgba(220,240,255,${flashA * 0.65})`)
          grad.addColorStop(0.4,  `rgba(157,111,219,${flashA * 0.20})`)
          grad.addColorStop(0.7,  `rgba(0,80,140,${flashA * 0.07})`)
          grad.addColorStop(1,    'rgba(0,0,0,0)')
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, w, h)
        }
        // Anamorphic horizontal lens flare (cinematic, very wide)
        const flareW = w * easeOutQuart(p2) * 1.05
        const flareH = lerp(8, 2, p2)
        const flareA = clamp(flashEase * 0.75, 0, 0.75)
        if (flareA > 0.02) {
          const fGrad = ctx.createLinearGradient(cx - flareW / 2, cy, cx + flareW / 2, cy)
          fGrad.addColorStop(0,    'rgba(255,255,255,0)')
          fGrad.addColorStop(0.15, `rgba(0,212,228,${flareA * 0.40})`)
          fGrad.addColorStop(0.5,  `rgba(255,255,255,${flareA})`)
          fGrad.addColorStop(0.85, `rgba(157,111,219,${flareA * 0.40})`)
          fGrad.addColorStop(1,    'rgba(255,255,255,0)')
          ctx.fillStyle = fGrad
          ctx.fillRect(cx - flareW / 2, cy - flareH / 2, flareW, flareH)
        }
        // CSS filter on wrapper: brightness pulse + saturate during flash peak
        if (wrapperEl) {
          const b = 1 + flashEase * 0.55
          const sat = 1 + flashEase * 0.30
          const blur = (1 - flashEase) > 0.7 ? 0 : flashEase * 1.5
          wrapperEl.style.filter = `brightness(${b}) saturate(${sat}) blur(${blur}px)`
        }
      } else if (p2 >= 1 && wrapperEl) {
        // After ignition, clean filter
        wrapperEl.style.filter = ''
      }

      /* ════════════════════════════════════════════════════════
       * PHASE 3: SHOCKWAVE  (0.20 → 0.475 of total)
       * Plasma streaks + 5 concentric rings + 240 particles bursting
       * ════════════════════════════════════════════════════════ */
      const p3 = phaseT(progress, 0.20, 0.475)
      if (p3 > 0 && p3 < 1) {
        // Plasma streaks (cosmic rays)
        for (const ps of plasmas) ps.draw(ctx, p3)

        // Concentric shockwave rings (each born at its `born` time)
        for (const sw of shockwaves) {
          if (p3 < sw.born) continue
          const swP = clamp((p3 - sw.born) / 0.55, 0, 1)
          const r = sw.maxR * easeOutQuart(swP)
          if (r < 3) continue
          const a = sw.alpha * (1 - easeInCubic(swP))
          if (a < 0.01) continue
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(${sw.color[0]},${sw.color[1]},${sw.color[2]},${a})`
          ctx.lineWidth = sw.width + (1 - swP) * 2.5
          ctx.shadowColor = `rgba(${sw.color[0]},${sw.color[1]},${sw.color[2]},${a * 0.55})`
          ctx.shadowBlur = 16
          ctx.stroke()
          ctx.shadowBlur = 0
        }

        // Burst particles (chromatic aberration scales with energy)
        const chroma = lerp(4, 0, easeOutQuart(p3))
        for (const bp of bursts) {
          bp.update(p3, dt)
          bp.draw(ctx, p3, chroma)
        }
      }

      /* ════════════════════════════════════════════════════════
       * PHASE 4: COSMIC WEB  (0.475 → 0.80 of total)
       * Filaments expand outward, stars start turning on
       * ════════════════════════════════════════════════════════ */
      const p4 = phaseT(progress, 0.475, 0.80)
      if (p4 > 0 && p4 < 1) {
        for (const f of filaments) f.draw(ctx, p4)
        for (const st of stars) st.draw(ctx, p4, absT)
      }

      /* ════════════════════════════════════════════════════════
       * PHASE 5: SETTLE  (0.80 → 1.00 of total)
       * Stars persist with twinkle, residual central afterglow fades
       * ════════════════════════════════════════════════════════ */
      const p5 = phaseT(progress, 0.80, 1.0)
      if (p5 > 0) {
        // Lingering afterglow at the centre (gentle, settles fast)
        const afterA = (1 - easeOutCubic(p5)) * 0.30
        if (afterA > 0.01) {
          const ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDim * 0.35)
          ag.addColorStop(0,   `rgba(0,212,228,${afterA})`)
          ag.addColorStop(0.4, `rgba(157,111,219,${afterA * 0.4})`)
          ag.addColorStop(1,   'rgba(0,0,0,0)')
          ctx.fillStyle = ag
          ctx.fillRect(0, 0, w, h)
        }
        // Continue twinkling stars but fading out gently
        const starFade = 1 - easeInCubic(p5)
        if (starFade > 0.05) {
          ctx.globalAlpha = starFade
          for (const st of stars) st.draw(ctx, 1, absT)
          ctx.globalAlpha = 1
        }
      }

      if (progress < 1) {
        animRef.current = requestAnimationFrame(frame)
      } else {
        // Clean up: clear canvas + reset wrapper CSS
        ctx.clearRect(0, 0, w, h)
        resetWrapper()
        hasRunRef.current = false
      }
    }

    animRef.current = requestAnimationFrame(frame)
  }, [wrapperRef])

  /* ─── Trigger when `active` flips true OR when `replay` increments ─── */
  useEffect(() => {
    if (active && (!hasRunRef.current || replay !== lastReplayRef.current)) {
      lastReplayRef.current = replay
      hasRunRef.current = false
      runAnimation()
    }
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current)
        animRef.current = null
      }
      hasRunRef.current = false
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      if (wrapperRef?.current) {
        wrapperRef.current.style.filter = ''
        wrapperRef.current.style.transform = ''
        wrapperRef.current.style.transformOrigin = ''
      }
    }
  }, [active, replay, runAnimation, wrapperRef])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9998,
        opacity: active ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    />
  )
}
