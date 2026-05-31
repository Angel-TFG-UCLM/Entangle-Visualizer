/**
 * BlackHoleExit v3 — Cinematic Gravitational Collapse
 * =====================================================
 *
 * 5-phase Marvel-tier exit animation that consumes the 3D universe scene
 * into a singularity. Drives both a transparent Canvas2D overlay (particles,
 * photon ring, accretion disk, gravitational lensing, hawking radiation)
 * AND DOM effects on the universe wrapper (clip-path circle, scale, blur,
 * tremor) for an integrated feel.
 *
 * Phases (total 4500ms):
 *   1. PREMONITION       (0    – 500 ms)  desaturate, faint glitch, mild shake
 *   2. GATHERING         (500  – 1700 ms) debris falls inward on logarithmic spirals
 *   3. EVENT HORIZON     (1700 – 2900 ms) photon ring + accretion disk + clip-path begins
 *   4. SPAGHETTIFICATION (2900 – 3900 ms) content stretches, lensing intensifies
 *   5. TOTAL COLLAPSE    (3900 – 4500 ms) clip-path rushes to zero, final flash, void
 *
 * Why this looks professional:
 *  - clip-path: circle() in pixels, computed per-frame (always perfectly circular)
 *  - Scale INCREASES (zoom into content) → rect corners go off-screen → never visible
 *  - Photon ring drawn at the EXACT clip boundary → Interstellar-style event horizon
 *  - Transparent canvas — never blocks real content, only adds glow over it
 *  - Quantum background (data-quantum-bg) made visible through the hole → seamless
 *  - Deterministic sinusoidal tremor (no jank from Math.random per frame)
 *  - Auto-cleans all DOM mutations on unmount or completion
 */
import { useEffect, useRef, useCallback } from 'react'

const DURATION = 6500
const DPR = Math.min(window.devicePixelRatio || 1, 2)

const COLORS = {
  white:  [255, 255, 255],
  cyan:   [0,   212, 228],
  purple: [157, 111, 219],
  green:  [0,   255, 159],
  gold:   [255, 200, 100],
  orange: [255, 140, 60],
  blue:   [80,  160, 255],
}
const DEBRIS_PALETTE = [COLORS.cyan, COLORS.purple, COLORS.green, COLORS.gold, COLORS.white, COLORS.blue]

/* ─── Math helpers ─── */
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)) }
function lerp(a, b, t) { return a + (b - a) * t }
function easeInCubic(t) { return clamp(t, 0, 1) ** 3 }
function easeInQuart(t) { return clamp(t, 0, 1) ** 4 }
function easeOutCubic(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3) }
function easeOutQuart(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 4) }
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2 }

function phaseT(p, start, end) {
  if (p < start) return 0
  if (p > end) return 1
  return (p - start) / (end - start)
}

/* ─── Keyframe interpolator ──────────────────────────────────────
 * Devuelve el valor de una curva definida por keyframes `{t, v}`
 * (t debe ser monótono creciente entre 0..1). Usa easing por
 * segmento opcional. Garantiza continuidad C0 entre fases —
 * elimina los "saltos" entre transiciones que veíamos antes.
 * ──────────────────────────────────────────────────────────────── */
function sampleKeyframes(p, frames, ease = easeInOutCubic) {
  if (p <= frames[0].t) return frames[0].v
  if (p >= frames[frames.length - 1].t) return frames[frames.length - 1].v
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1]
    if (p >= a.t && p <= b.t) {
      const localT = (p - a.t) / (b.t - a.t)
      return lerp(a.v, b.v, (a.ease || ease)(localT))
    }
  }
  return frames[frames.length - 1].v
}

/* ══════════════════════════════════════════════════════════════════
 * DEBRIS PARTICLE — fragments of the universe being absorbed
 * Falls inward on a logarithmic spiral (Kerr-metric inspired).
 * Trail intensifies as it accelerates → gives sense of relativistic fall.
 * ══════════════════════════════════════════════════════════════════ */
class DebrisParticle {
  constructor(cx, cy, w, h) {
    const angle = Math.random() * Math.PI * 2
    const dist = 0.18 + Math.random() * 0.85
    const maxR = Math.hypot(w, h) * 0.55
    this.x = cx + Math.cos(angle) * dist * maxR
    this.y = cy + Math.sin(angle) * dist * maxR
    this.vx = 0; this.vy = 0
    this.color = DEBRIS_PALETTE[Math.floor(Math.random() * DEBRIS_PALETTE.length)]
    this.size = 0.6 + Math.random() * 2.0
    this.alpha = 0.30 + Math.random() * 0.60
    this.trail = []
    this.trailMax = 5 + Math.floor(Math.random() * 6)
    this.absorbed = false
    this.spinBias = (Math.random() - 0.5) * 0.65  // logarithmic spiral coefficient
  }
  update(cx, cy, progress, dt) {
    if (this.absorbed) return
    const dx = cx - this.x, dy = cy - this.y
    const d = Math.hypot(dx, dy)
    if (d < 4) { this.absorbed = true; return }
    // Gravity grows non-linearly with time (event horizon forms → accelerates)
    const gravity = 80 + 32000 * easeInCubic(progress)
    const nx = dx / d, ny = dy / d
    // Tangential spin → Kerr-spiral (frame dragging)
    const tx = -ny, ty = nx
    const spinMag = (260 + 1100 * progress) * this.spinBias / Math.max(d * 0.012, 1)
    this.vx += (nx * gravity / Math.max(d, 1) + tx * spinMag) * dt
    this.vy += (ny * gravity / Math.max(d, 1) + ty * spinMag) * dt
    // Drag scaled with progress so it doesn't stall at end
    const drag = 0.94 - progress * 0.06
    this.vx *= drag
    this.vy *= drag
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.trail.unshift({ x: this.x, y: this.y, a: this.alpha })
    if (this.trail.length > this.trailMax) this.trail.pop()
  }
  draw(ctx, progress) {
    if (this.absorbed) return
    const a = this.alpha * (0.85 + 0.15 * progress)
    if (a < 0.01) return
    // Trail (gives motion blur + sense of velocity)
    for (let i = 1; i < this.trail.length; i++) {
      const f = 1 - i / this.trail.length
      ctx.beginPath()
      ctx.arc(this.trail[i].x, this.trail[i].y, this.size * f * 0.7, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a * f * 0.4})`
      ctx.fill()
    }
    // Main particle
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a})`
    ctx.fill()
  }
}

/* ══════════════════════════════════════════════════════════════════
 * REALITY FRACTURE — spacetime cracks radiating from the singularity
 * Líneas quebradas que aparecen brevemente representando "el tejido
 * del espacio-tiempo rompiéndose" alrededor del horizonte de eventos.
 * ══════════════════════════════════════════════════════════════════ */
class RealityFracture {
  constructor(cx, cy, w, h) {
    this.cx = cx; this.cy = cy
    this.angle = Math.random() * Math.PI * 2
    const reach = Math.hypot(w, h) * (0.35 + Math.random() * 0.30)
    // Pre-compute the kinked path: 4-6 segments with small lateral jitter
    const segs = 4 + Math.floor(Math.random() * 3)
    this.points = []
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const r = reach * t
      const perpJitter = (Math.random() - 0.5) * 28 * (1 - t)
      const px = cx + Math.cos(this.angle) * r + Math.cos(this.angle + Math.PI / 2) * perpJitter
      const py = cy + Math.sin(this.angle) * r + Math.sin(this.angle + Math.PI / 2) * perpJitter
      this.points.push([px, py])
    }
    this.color = Math.random() < 0.5 ? COLORS.cyan : COLORS.purple
    this.bornAt = 0.35 + Math.random() * 0.45  // appear during EVENT HORIZON phase
    this.flickerPhase = Math.random() * Math.PI * 2
  }
  draw(ctx, p, absT) {
    if (p < this.bornAt) return
    const local = clamp((p - this.bornAt) / 0.18, 0, 1)
    const flicker = 0.55 + 0.45 * Math.sin(absT * 22 + this.flickerPhase)
    const a = easeOutQuart(local) * (1 - easeInCubic(Math.max(0, local * 1.4 - 0.4))) * flicker * 0.65
    if (a < 0.01) return
    ctx.strokeStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a})`
    ctx.lineWidth = 1.1 + (1 - local) * 1.4
    ctx.shadowColor = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a * 0.6})`
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(this.points[0][0], this.points[0][1])
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i][0], this.points[i][1])
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

/* ══════════════════════════════════════════════════════════════════
 * HAWKING PARTICLE — emitted from the event horizon outward
 * Pequeñas partículas que ESCAPAN del horizonte (radiación de Hawking).
 * Spawned only after the event horizon forms.
 * ══════════════════════════════════════════════════════════════════ */
class HawkingParticle {
  constructor(cx, cy, eventRadius) {
    const angle = Math.random() * Math.PI * 2
    this.x = cx + Math.cos(angle) * eventRadius
    this.y = cy + Math.sin(angle) * eventRadius
    const speed = 60 + Math.random() * 180
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed
    this.color = Math.random() < 0.6 ? COLORS.white : COLORS.cyan
    this.size = 0.4 + Math.random() * 0.9
    this.alpha = 0.65 + Math.random() * 0.30
    this.age = 0
    // Vida más larga y variable para que el último frame de cada partícula
    // ya esté en alpha~0 antes de morir (fade natural, no corte).
    this.life = 0.85 + Math.random() * 0.70  // seconds (was 0.45 + 0.35)
  }
  update(dt) {
    this.age += dt
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.vx *= 0.985
    this.vy *= 0.985
  }
  draw(ctx) {
    const f = clamp(1 - this.age / this.life, 0, 1)
    // Curva quart en lugar de cubic — tail-off MUY suave al final
    const fade = easeOutQuart(f) * easeOutQuart(f)
    const a = this.alpha * fade
    if (a < 0.001) return
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.color[0]},${this.color[1]},${this.color[2]},${a})`
    ctx.fill()
  }
  isDead() { return this.age >= this.life }
}

/* ══════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════════ */
export default function BlackHoleExit({ active, onComplete, wrapperRef }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const completedRef = useRef(false)

  const runAnimation = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = w * DPR
    canvas.height = h * DPR
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)

    const cx = w / 2
    const cy = h / 2
    const maxScreenR = Math.hypot(w, h) / 2 + 80
    const wrapperEl = wrapperRef?.current
    const universeContainer = wrapperEl?.parentNode

    /* ─── Prepare DOM ─── */
    if (wrapperEl) {
      wrapperEl.style.willChange = 'transform, clip-path, filter'
      wrapperEl.style.transformOrigin = 'center center'
      wrapperEl.style.transition = 'none'
    }
    // Make container transparent so dashboard shows through the hole
    if (universeContainer) universeContainer.style.background = 'transparent'
    /* IMPORTANTE: NO manipulamos `[data-quantum-bg]`. El QuantumBackground
       es global (vive en App.jsx) y forma parte del dashboard real. Al ir
       cerrándose el clip-path del wrapper del universo, el dashboard (con
       su QuantumBackground vivo y sus animaciones reales) aparece debajo
       de forma orgánica. Si tocásemos su opacity tendríamos un "salto" al
       restaurarla al final. */

    /* ─── Actors ─── */
    const debris   = Array.from({ length: 260 }, () => new DebrisParticle(cx, cy, w, h))
    const fractures = Array.from({ length: 16 }, () => new RealityFracture(cx, cy, w, h))
    const hawking = []
    let hawkingSpawnedAt = 0

    const startTime = performance.now()
    completedRef.current = false
    let lastT = startTime

    /* ─── KEYFRAME TABLES ──────────────────────────────────────────
     * Cada propiedad del wrapper se define como una curva continua
     * de keyframes. El wrapper se actualiza UNA sola vez por frame,
     * evitando los saltos entre fases (donde antes cada phase
     * escribía valores potencialmente discontinuos).
     * ──────────────────────────────────────────────────────────── */
    const KF = {
      // Scale (transform): zoom inicial leve, retrocede, luego inward zoom
      scale: [
        { t: 0.00, v: 1.00 },
        { t: 0.05, v: 0.97 },                       // fly-back out (más rápido)
        { t: 0.10, v: 1.00 },                       // vuelve a neutral
        { t: 0.28, v: 1.04 },                       // start subtle zoom-in (era 0.42)
        { t: 0.50, v: 1.10 },                       // era 0.62
        { t: 0.65, v: 1.22 },                       // era 0.78
        { t: 0.74, v: 1.45 },                       // peak final zoom (era 0.86)
        { t: 1.00, v: 1.45 },                       // hold
      ],
      // Saturate: gradual desaturation
      saturate: [
        { t: 0.00, v: 1.00 },
        { t: 0.07, v: 0.85 },                       // era 0.11
        { t: 0.28, v: 0.65 },                       // era 0.42
        { t: 0.50, v: 0.48 },                       // era 0.62
        { t: 0.65, v: 0.30 },                       // era 0.78
        { t: 0.74, v: 0.15 },                       // era 0.86
        { t: 1.00, v: 0.15 },
      ],
      // Blur: smooth ramp from 0 to 12
      blur: [
        { t: 0.00, v: 0 },
        { t: 0.10, v: 0 },                          // sin blur durante premonición (era 0.20)
        { t: 0.28, v: 1.3 },                        // era 0.42
        { t: 0.50, v: 3.0 },                        // era 0.62
        { t: 0.65, v: 5.5 },                        // era 0.78
        { t: 0.74, v: 11 },                         // era 0.86
        { t: 1.00, v: 11 },
      ],
      // Brightness: stays at 1 until phase 4, dims hard at the end
      brightness: [
        { t: 0.00, v: 1 },
        { t: 0.50, v: 1 },                          // era 0.62
        { t: 0.65, v: 0.78 },                       // era 0.78
        { t: 0.74, v: 0.10 },                       // era 0.86
        { t: 1.00, v: 0.05 },
      ],
      // Hue rotation: blueshift progresivo (efecto agujero negro)
      hueRot: [
        { t: 0.00, v: 0 },
        { t: 0.28, v: 0 },                          // era 0.42
        { t: 0.50, v: -18 },                        // era 0.62
        { t: 0.65, v: -32 },                        // era 0.78
        { t: 0.74, v: -55 },                        // era 0.86
        { t: 1.00, v: -55 },
      ],
      // Clip radius (en px, antes de aplicar counter-zoom de scale).
      // Valor BASELINE = maxScreenR (sin clip visible). El shrink ahora
      // arranca a t=0.15 (era 0.40) — agujero negro visible mucho antes.
      // A t=0.74 (era 0.86) el clip llega a 0 → dashboard 100% visible
      // y el remnant brilla sobre él durante todo el final.
      clipR: [
        { t: 0.00, v: maxScreenR * 1.0  },
        { t: 0.15, v: maxScreenR * 1.0  },          // era 0.40 — arranca el cierre antes
        { t: 0.32, v: maxScreenR * 0.78 },          // era 0.62 — primera contracción visible
        { t: 0.52, v: maxScreenR * 0.45 },          // era 0.78
        { t: 0.74, v: 0 },                          // era 0.86 — total collapse antes
        { t: 1.00, v: 0 },                          // hold colapsado
      ],
    }
    // Cache absolute screen-shake amplitude curve (used only in phase 1-2)
    const shakeAmpFor = (p) => {
      if (p < 0.04) return p / 0.04 * 2
      if (p < 0.28) return 2 + ((p - 0.04) / 0.24) * 4
      if (p < 0.50) return 6 * (1 - (p - 0.28) / 0.22)
      return 0
    }

    const frame = (now) => {
      const elapsed = now - startTime
      const progress = clamp(elapsed / DURATION, 0, 1)
      const dt = Math.min(0.033, (now - lastT) / 1000)
      lastT = now
      const absT = (now - startTime) / 1000

      ctx.clearRect(0, 0, w, h)

      /* ════════════════════════════════════════════════════════
       * WRAPPER (CSS) — una sola actualización por frame con
       * valores interpolados continuamente de los keyframes.
       * Garantiza C0-continuidad → cero saltos visibles.
       * ════════════════════════════════════════════════════════ */
      if (wrapperEl) {
        const scale = sampleKeyframes(progress, KF.scale)
        const sat   = sampleKeyframes(progress, KF.saturate)
        const blur  = sampleKeyframes(progress, KF.blur)
        const br    = sampleKeyframes(progress, KF.brightness)
        const hue   = sampleKeyframes(progress, KF.hueRot)
        const clipR = sampleKeyframes(progress, KF.clipR)

        const shakeAmp = shakeAmpFor(progress)
        const sx = Math.sin(absT * 26) * shakeAmp
        const sy = Math.cos(absT * 21) * shakeAmp
        // counter-zoom: el clip-path se aplica sobre el wrapper YA
        // escalado por scale, así que tenemos que dividir el clipR
        // por la escala para que en screen-space siga siendo el valor
        // visual deseado.
        const clipInCSS = clipR / scale
        wrapperEl.style.transform = `translate(${sx}px, ${sy}px) scale(${scale})`
        wrapperEl.style.filter = `saturate(${sat}) blur(${blur}px) hue-rotate(${hue}deg) brightness(${br})`
        // Solo aplicar clipPath cuando ya empezó a cerrarse (evita
        // clip visible artificial al inicio)
        if (progress > 0.39) {
          wrapperEl.style.clipPath = `circle(${Math.max(0, clipInCSS)}px at 50% 50%)`
        } else {
          wrapperEl.style.clipPath = ''
        }
      }
      /* NOTA: el quantumBg ya NO se manipula. Ver comentario al inicio. */

      /* ════════════════════════════════════════════════════════
       * CINEMATIC OVERLAY — Vignette darkening
       * Oscurecimiento radial de los bordes que se intensifica
       * progresivamente, peak en phase 4, y se DESVANECE durante
       * la fase del remnant para que el dashboard quede limpio.
       * ════════════════════════════════════════════════════════ */
      let vigEase
      if (progress < 0.10) {
        vigEase = 0
      } else if (progress < 0.75) {
        vigEase = easeInOutCubic((progress - 0.10) / 0.65)
      } else if (progress < 0.85) {
        vigEase = 1                                            // peak sostenido
      } else {
        // Fade out durante el remnant (0.85 → 1.0)
        vigEase = 1 - easeInOutCubic((progress - 0.85) / 0.15)
      }
      if (vigEase > 0.02) {
        const vigGrad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.15, cx, cy, Math.hypot(w, h) * 0.65)
        vigGrad.addColorStop(0,    'rgba(0,0,0,0)')
        vigGrad.addColorStop(0.5,  `rgba(0,0,0,${vigEase * 0.25})`)
        vigGrad.addColorStop(0.85, `rgba(0,0,0,${vigEase * 0.65})`)
        vigGrad.addColorStop(1,    `rgba(0,0,0,${vigEase * 0.92})`)
        ctx.fillStyle = vigGrad
        ctx.fillRect(0, 0, w, h)
      }

      /* ════════════════════════════════════════════════════════
       * PHASE 1: PREMONITION  (0 → 0.11)
       * Solo activa visualmente vía la tabla de keyframes (saturate
       * y scale). No dibuja nada en canvas — el ambient previo es
       * pura sensación CSS.
       * ════════════════════════════════════════════════════════ */
      // Sin draws aquí — los efectos de phase 1 son los keyframes
      // wrapper de scale/saturate + shake aplicados arriba.

      /* ════════════════════════════════════════════════════════
       * PHASE 2: GATHERING  (0.04 → 0.28)
       * Debris falls inward
       * ════════════════════════════════════════════════════════ */
      const p2 = phaseT(progress, 0.04, 0.28)
      if (p2 > 0) {
        for (const d of debris) {
          d.update(cx, cy, p2, dt)
          d.draw(ctx, p2)
        }
      }

      /* ════════════════════════════════════════════════════════
       * PHASE 3: EVENT HORIZON  (0.28 → 0.52)
       * Photon ring + accretion disk + reality fractures.
       * El wrapper (clip + filter) lo gestiona la tabla de keyframes
       * arriba — aquí solo dibujamos en el canvas overlay.
       * ════════════════════════════════════════════════════════ */
      const p3 = phaseT(progress, 0.28, 0.52)
      if (p3 > 0) {
        // Continue updating debris (acceleration intensifies)
        for (const d of debris) {
          d.update(cx, cy, p2 || 1, dt)
          d.draw(ctx, p2 || 1)
        }

        // Reality fractures appear (use overall progress so timings sync)
        for (const f of fractures) f.draw(ctx, progress, absT)

        // Event horizon radius (shrinks as we go through phase 3-4-5)
        const eventR = lerp(150, 4, easeInQuart(progress))

        // ── Accretion disk con doppler shift sutil ──
        const diskInner = eventR * 1.05
        const diskOuter = eventR * 1.85
        if (diskOuter < maxScreenR && p3 > 0.05) {
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(absT * 1.4)
          for (let arc = 0; arc < 4; arc++) {
            const arcStart = (arc / 4) * Math.PI * 2
            const arcEnd = arcStart + Math.PI * 0.55
            const baseA = 0.45 * easeOutQuart(p3) * (1 - easeInCubic(Math.max(0, p3 - 0.75) / 0.25))
            const grad = ctx.createLinearGradient(-diskOuter, 0, diskOuter, 0)
            grad.addColorStop(0,   `rgba(0,180,228,${baseA * 0.55})`)
            grad.addColorStop(0.30,`rgba(0,212,228,${baseA * 0.85})`)
            grad.addColorStop(0.5, `rgba(255,220,140,${baseA})`)
            grad.addColorStop(0.70,`rgba(255,140,60,${baseA * 0.95})`)
            grad.addColorStop(1,   `rgba(180,60,40,${baseA * 0.45})`)
            ctx.strokeStyle = grad
            ctx.lineWidth = lerp(8, 3, p3)
            ctx.shadowColor = `rgba(255,180,80,${baseA * 0.7})`
            ctx.shadowBlur = 18
            ctx.beginPath()
            ctx.arc(0, 0, (diskInner + diskOuter) / 2, arcStart, arcEnd)
            ctx.stroke()
          }
          ctx.shadowBlur = 0
          ctx.restore()
        }

        // ── Photon ring at the event horizon ──
        if (eventR > 2) {
          const ringA = clamp(easeOutQuart(p3) * 0.95, 0, 0.95)
          ctx.beginPath()
          ctx.arc(cx, cy, eventR, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(255,220,140,${ringA})`
          ctx.lineWidth = lerp(2, 5, p3)
          ctx.shadowColor = `rgba(255,180,80,${ringA})`
          ctx.shadowBlur = 24
          ctx.stroke()
          ctx.shadowBlur = 0

          // Inner darkness — black hole event horizon
          const innerR = eventR * 0.85
          const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR)
          innerGrad.addColorStop(0,   `rgba(0,0,0,${0.95 * easeOutCubic(p3)})`)
          innerGrad.addColorStop(0.85,`rgba(0,0,0,${0.7 * easeOutCubic(p3)})`)
          innerGrad.addColorStop(1,   'rgba(0,0,0,0)')
          ctx.fillStyle = innerGrad
          ctx.beginPath()
          ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
          ctx.fill()
        }

        // ── Hawking radiation (spawn periodically) ──
        if (p3 > 0.25 && absT - hawkingSpawnedAt > 0.04) {
          for (let i = 0; i < 3; i++) hawking.push(new HawkingParticle(cx, cy, eventR * 1.1))
          hawkingSpawnedAt = absT
        }
      }

      /* ════════════════════════════════════════════════════════
       * PHASE 4: SPAGHETTIFICATION  (0.52 → 0.75)
       * Brighter, faster-spinning accretion disk con DOPPLER SHIFT.
       * El wrapper (zoom, blur, clip) lo gestiona la tabla de
       * keyframes arriba — aquí solo dibujamos en canvas.
       * ════════════════════════════════════════════════════════ */
      const p4 = phaseT(progress, 0.52, 0.75)
      if (p4 > 0) {
        // Reality fractures remain
        for (const f of fractures) f.draw(ctx, progress, absT)

        // Event horizon
        const eventR = lerp(150, 4, easeInQuart(progress))

        if (eventR > 2) {
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(absT * 2.4)
          const ringA = 0.85 * (1 - easeInCubic(p4))
          for (let arc = 0; arc < 5; arc++) {
            const arcStart = (arc / 5) * Math.PI * 2
            const arcEnd = arcStart + Math.PI * 0.5
            const grad = ctx.createLinearGradient(-eventR * 2, 0, eventR * 2, 0)
            grad.addColorStop(0,    `rgba(80,200,255,${ringA * 0.5})`)
            grad.addColorStop(0.25, `rgba(0,212,228,${ringA * 0.85})`)
            grad.addColorStop(0.5,  `rgba(255,255,255,${ringA})`)
            grad.addColorStop(0.75, `rgba(255,140,60,${ringA * 0.95})`)
            grad.addColorStop(1,    `rgba(180,40,20,${ringA * 0.5})`)
            ctx.strokeStyle = grad
            ctx.lineWidth = lerp(3, 8, p4)
            ctx.shadowColor = `rgba(255,200,100,${ringA * 0.8})`
            ctx.shadowBlur = 28
            ctx.beginPath()
            ctx.arc(0, 0, eventR * lerp(1.45, 1.15, p4), arcStart, arcEnd)
            ctx.stroke()
          }
          ctx.shadowBlur = 0
          ctx.restore()

          // Photon ring — brighter and tighter
          const ringAlpha = (1 - easeInCubic(p4 * 0.7))
          ctx.beginPath()
          ctx.arc(cx, cy, eventR, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(255,240,180,${ringAlpha})`
          ctx.lineWidth = 4
          ctx.shadowColor = `rgba(255,200,100,${ringAlpha})`
          ctx.shadowBlur = 30
          ctx.stroke()
          ctx.shadowBlur = 0

          // Inner darkness
          ctx.beginPath()
          ctx.arc(cx, cy, eventR * 0.92, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(0,0,0,0.98)`
          ctx.fill()
        }
      }

      /* ════════════════════════════════════════════════════════
       * HAWKING PARTICLES — render global (post phase 4)
       * Las partículas spawneadas durante phase 3 siguen vivas
       * después de que phase 4 termine; las renderizamos siempre
       * que existan para que hagan su fade natural en lugar de
       * cortarse de golpe al cambiar de fase.
       * ════════════════════════════════════════════════════════ */
      for (let i = hawking.length - 1; i >= 0; i--) {
        hawking[i].update(dt)
        if (hawking[i].isDead()) hawking.splice(i, 1)
      }
      for (const hp of hawking) hp.draw(ctx)

      /* ════════════════════════════════════════════════════════
       * PHASE 5: TOTAL COLLAPSE  (0.66 → 0.74)
       * Solo el white flash final. clip-path y wrapper los maneja
       * la tabla de keyframes — al 74% del progreso el clip llega
       * a 0 y el dashboard es 100% visible. Tras eso queda el
       * REMNANT brillando (siguiente bloque).
       * ════════════════════════════════════════════════════════ */
      const p5 = phaseT(progress, 0.66, 0.74)
      if (p5 > 0) {
        const flashLocal = clamp(p5 / 0.40, 0, 1)
        const flashA = flashLocal < 0.45
          ? easeOutQuart(flashLocal / 0.45) * 0.90
          : 0.90 * (1 - easeInCubic((flashLocal - 0.45) / 0.55))
        if (flashA > 0.02) {
          const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxScreenR)
          fg.addColorStop(0,   `rgba(255,255,255,${flashA})`)
          fg.addColorStop(0.3, `rgba(220,230,255,${flashA * 0.5})`)
          fg.addColorStop(0.7, `rgba(0,80,140,${flashA * 0.1})`)
          fg.addColorStop(1,   'rgba(0,0,0,0)')
          ctx.fillStyle = fg
          ctx.fillRect(0, 0, w, h)
        }
      }

      /* ════════════════════════════════════════════════════════
       * SINGULARITY REMNANT  (0.58 → 1.00 — fase final cinemática)
       * Tras el colapso queda un brillo dorado-cyan en el centro
       * que pulsa suavemente y se desvanece durante ~2700ms.
       * Aparece SOLAPADO con el final de phase 4 (58% vs phase 4
       * fin 75%) — emerge mientras el agujero se sigue colapsando,
       * peak sostenido cuando colapso completo, y fade larguísimo
       * que se diluye imperceptiblemente.
       * El dashboard es 100% visible detrás durante toda esta fase.
       * ════════════════════════════════════════════════════════ */
      const pRemnant = phaseT(progress, 0.58, 1.0)
      if (pRemnant > 0) {
        // Pulse suave (frecuencia 10 rad/s = ~1.6 Hz)
        const pulse = 0.72 + 0.28 * Math.sin(absT * 10)

        // Curva de intensidad de 3 tramos (build-up, peak, fade muy largo)
        let intensity
        if (pRemnant < 0.30) {
          intensity = easeOutCubic(pRemnant / 0.30)              // build-up
        } else if (pRemnant < 0.45) {
          intensity = 1                                          // peak sostenido
        } else {
          // Fade out muy largo (55% del tiempo del remnant) con curva suave
          // easeInOutCubic invertido para que decrezca muy lento al final
          intensity = 1 - easeInOutCubic((pRemnant - 0.45) / 0.55)
        }
        const baseA = intensity * pulse

        /* IMPORTANTE: no aplicamos threshold (`baseA > X`) para evitar
           el "pop" cuando el valor cae por debajo. Si baseA es muy bajo
           el navegador renderiza alpha~0 (imperceptible) sin discontinuidad. */
        if (baseA > 0.001) {
          // ── Halo exterior masivo (suave, gigante) ──
          const haloR = 140 + 50 * pulse
          const haloGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR)
          haloGrad.addColorStop(0,    `rgba(255,245,210,${baseA * 0.50})`)
          haloGrad.addColorStop(0.15, `rgba(255,210,120,${baseA * 0.40})`)
          haloGrad.addColorStop(0.40, `rgba(255,150,80,${baseA * 0.22})`)
          haloGrad.addColorStop(0.65, `rgba(0,212,228,${baseA * 0.14})`)
          haloGrad.addColorStop(0.85, `rgba(157,111,219,${baseA * 0.06})`)
          haloGrad.addColorStop(1,    'rgba(0,0,0,0)')
          ctx.fillStyle = haloGrad
          ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2)

          // ── Halo interior más concentrado (dorado puro) ──
          const innerHaloR = 32 + 14 * pulse
          const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerHaloR)
          innerGrad.addColorStop(0,    `rgba(255,255,240,${baseA * 0.80})`)
          innerGrad.addColorStop(0.35, `rgba(255,230,160,${baseA * 0.55})`)
          innerGrad.addColorStop(0.75, `rgba(255,180,90,${baseA * 0.20})`)
          innerGrad.addColorStop(1,    'rgba(0,0,0,0)')
          ctx.fillStyle = innerGrad
          ctx.fillRect(cx - innerHaloR, cy - innerHaloR, innerHaloR * 2, innerHaloR * 2)

          // ── Núcleo brillante (singularity dot) ──
          const coreR = 2.5 + pulse * 2.5
          ctx.beginPath()
          ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${baseA * 0.98})`
          ctx.shadowColor = `rgba(255,230,160,${baseA})`
          ctx.shadowBlur = 28
          ctx.fill()
          ctx.shadowBlur = 0

          // ── Star spikes (4 puntas, lens flare cinemático) ──
          const spikeLen = 30 + 20 * pulse
          const spikeA = baseA * 0.55
          if (spikeA > 0.005) {
            ctx.strokeStyle = `rgba(255,245,200,${spikeA})`
            ctx.lineWidth = 1.2
            ctx.shadowColor = `rgba(255,220,140,${spikeA})`
            ctx.shadowBlur = 16
            ctx.beginPath()
            ctx.moveTo(cx - spikeLen, cy);     ctx.lineTo(cx + spikeLen, cy)
            ctx.moveTo(cx, cy - spikeLen);     ctx.lineTo(cx, cy + spikeLen)
            ctx.stroke()
            ctx.strokeStyle = `rgba(255,245,200,${spikeA * 0.55})`
            ctx.lineWidth = 0.8
            ctx.beginPath()
            const diag = spikeLen * 0.55
            ctx.moveTo(cx - diag, cy - diag); ctx.lineTo(cx + diag, cy + diag)
            ctx.moveTo(cx - diag, cy + diag); ctx.lineTo(cx + diag, cy - diag)
            ctx.stroke()
            ctx.shadowBlur = 0
          }
        }
      }

      /* ════════════════════════════════════════════════════════
       * CANVAS OVERLAY + UNIVERSE CONTAINER FADE-OUT (últimos 12%)
       * El `.universe` div tiene background opaco y z-index 9999.
       * Sin un fade explícito, al desmontarse (cuando onComplete
       * dispara setIsExiting+closeCollaborationGraph) desaparece de
       * golpe revelando el dashboard en 1 frame = corte visible.
       * Aquí lo desvanecemos progresivamente en paralelo con el
       * canvas overlay, así el dashboard emerge orgánicamente y el
       * unmount es imperceptible (ya estaba transparente).
       * ════════════════════════════════════════════════════════ */
      if (progress > 0.88) {
        const fadeT = (progress - 0.88) / 0.12  // 0 → 1 en los últimos 12%
        const eased = easeInOutCubic(fadeT)
        if (canvasRef.current) {
          canvasRef.current.style.opacity = String(1 - eased)
        }
        if (universeContainer) {
          universeContainer.style.opacity = String(1 - eased)
        }
      }

      if (progress < 1) {
        animRef.current = requestAnimationFrame(frame)
      } else if (!completedRef.current) {
        completedRef.current = true
        /* En este punto el clip está en 0, el canvas overlay y el
           contenedor .universe ya están al opacity=0 (invisibles).
           Limpio inline styles del wrapper. NO restauro la opacity
           del universeContainer aquí — el componente se desmonta
           inmediatamente tras onComplete y restaurar opacity=1
           justo antes del unmount causaría un flash. El cleanup
           del useEffect return se encarga de la defensa final. */
        if (wrapperEl) {
          wrapperEl.style.clipPath = ''
          wrapperEl.style.transform = ''
          wrapperEl.style.filter = ''
          wrapperEl.style.transformOrigin = ''
          wrapperEl.style.transition = ''
          wrapperEl.style.willChange = ''
        }
        ctx.clearRect(0, 0, w, h)
        onComplete?.()
      }
    }

    animRef.current = requestAnimationFrame(frame)
  }, [onComplete, wrapperRef])

  useEffect(() => {
    if (active) runAnimation()
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current)
        animRef.current = null
      }
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height)
      // Clean any leftover DOM mutations defensively
      const wrapperEl = wrapperRef?.current
      if (wrapperEl) {
        wrapperEl.style.clipPath = ''
        wrapperEl.style.transform = ''
        wrapperEl.style.filter = ''
        wrapperEl.style.transformOrigin = ''
        wrapperEl.style.transition = ''
        wrapperEl.style.willChange = ''
      }
      if (wrapperEl?.parentNode) {
        wrapperEl.parentNode.style.background = ''
        wrapperEl.parentNode.style.opacity = ''
      }
      /* No tocamos el quantumBg en ningún momento (ver comentario al
         inicio del runAnimation). Si por algún motivo histórico quedó
         con opacity inline (de versiones anteriores) defensivamente la
         restauramos a default solo aquí en el cleanup. */
      const quantumBg = document.querySelector('[data-quantum-bg]')
      if (quantumBg && quantumBg.style.opacity !== '') {
        quantumBg.style.opacity = ''
      }
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
        transition: 'opacity 0.4s ease-out',
      }}
    />
  )
}
