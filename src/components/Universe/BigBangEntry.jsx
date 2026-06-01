/**
 * BigBangEntry v2 — Cinematic Quantum Genesis
 * ============================================
 *
 * Transparent canvas2D overlay that plays a 5-phase cinematic Big Bang
 * over the 3D R3F scene. Designed to feel like a Marvel-tier opening shot:
 * anticipation → ignition → primary shockwave → cosmic web → settle.
 *
 * Phases (total 4000ms):
 *   1. SINGULARITY    (0    – 400 ms)  pulsing seed point
 *   2. IGNITION       (400  – 800 ms)  white flash + anamorphic flare
 *   3. SHOCKWAVE      (800  – 1900 ms) concentric rings echo the node expansion
 *   4. COSMIC WEB     (1900 – 3200 ms) real 3D nodes provide matter motion
 *   5. SETTLE         (3200 – 4000 ms) afterglow fades
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

/* ─── Math helpers ─── */
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)) }
function lerp(a, b, t) { return a + (b - a) * t }
function easeOutCubic(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3) }
function easeOutQuart(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 4) }
function easeInCubic(t)  { return clamp(t, 0, 1) ** 3 }

/* Map progress (0..1) → phase-local progress (0..1) for a [start,end] window */
function phaseT(p, start, end) {
  if (p < start) return 0
  if (p > end) return 1
  return (p - start) / (end - start)
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
       * Pulsing white-cyan seed point
       * ════════════════════════════════════════════════════════ */
      const p1 = phaseT(progress, 0.0, 0.10)
      if (p1 > 0 && p1 < 1) {
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
       * The flash: white overlay + anamorphic flare
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
       * Five concentric rings echo the real node expansion underneath
       * ════════════════════════════════════════════════════════ */
      const p3 = phaseT(progress, 0.20, 0.475)
      if (p3 > 0 && p3 < 1) {
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
      }

      /* ════════════════════════════════════════════════════════
       * PHASE 5: SETTLE  (0.80 → 1.00 of total)
       * Residual central afterglow fades
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
