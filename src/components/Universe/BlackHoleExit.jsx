/**
 * BlackHoleExit v3 — Cinematic Gravitational Collapse
 * =====================================================
 *
 * 5-phase Marvel-tier exit animation that consumes the 3D universe scene
 * into a singularity. Drives both a transparent Canvas2D overlay (photon ring,
 * accretion disk, gravitational lensing, remnant glow)
 * AND DOM effects on the universe wrapper (clip-path circle, scale, blur,
 * tremor) for an integrated feel.
 *
 * Phases (total 4500ms):
 *   1. PREMONITION       (0    – 500 ms)  desaturate, faint glitch, mild shake
 *   2. GATHERING         (500  – 1700 ms) wrapper begins bending inward
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

const DURATION = 5500
const DPR = Math.min(window.devicePixelRatio || 1, 2)

/* ─── Math helpers ─── */
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)) }
function lerp(a, b, t) { return a + (b - a) * t }
function easeInCubic(t) { return clamp(t, 0, 1) ** 3 }
function easeInQuart(t) { return clamp(t, 0, 1) ** 4 }
function easeOutCubic(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3) }
function easeOutQuart(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 4) }
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2 }

/* ─── Clip-path curve — function ANALYTIC (no keyframes) ────────
 * Calcula el factor de clip [0..1] vs progress [0..1] como una
 * curva CONTINUA con derivada suave. Tiene 3 segmentos:
 *   - Premonición (0-0.08): clip 1.0 (sin cambios)
 *   - Reducción agresiva (0.08-0.55): clip baja de 1.0 a 0.15 con
 *     easeInQuart (lento al inicio, rápido al final)
 *   - Oscilación amortiguada (0.55-0.80): el agujero se contrae
 *     hacia 0 mientras OSCILA suavemente (3 ciclos sinusoidales
 *     con amplitud decreciente). Esto se siente como olas naturales
 *     en lugar de bounces saltarines.
 *   - Cerrado (>0.80): clip = 0
 * ──────────────────────────────────────────────────────────────── */
function computeClipFactor(t) {
  if (t < 0.08) return 1.0
  if (t < 0.55) {
    const p1 = (t - 0.08) / 0.47
    return 1.0 - easeInQuart(p1) * 0.85
  }
  if (t < 0.80) {
    const oscT = (t - 0.55) / 0.25
    // Base decay: 0.15 → 0
    const baseR = 0.15 * (1 - easeInCubic(oscT))
    // Oscilación: 2.75 ciclos sinusoidales (suaves) con amplitud
    // decreciente. Amplitud peak = 0.028 (2.8% del max screen radius)
    // — visible como respiración del agujero, no como salto.
    const oscillation = Math.cos(oscT * Math.PI * 5.5) * 0.028 * (1 - oscT) * (1 - oscT)
    return Math.max(0, baseR + oscillation)
  }
  return 0
}

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

    const startTime = performance.now()
    completedRef.current = false

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
        { t: 0.05, v: 0.97 },                       // fly-back out
        { t: 0.10, v: 1.00 },                       // vuelve a neutral
        { t: 0.25, v: 1.04 },                       // start subtle zoom-in
        { t: 0.45, v: 1.12 },
        { t: 0.62, v: 1.28 },
        { t: 0.78, v: 1.50 },                       // peak final zoom (collapse)
        { t: 1.00, v: 1.50 },                       // hold
      ],
      // Saturate: gradual desaturation
      saturate: [
        { t: 0.00, v: 1.00 },
        { t: 0.10, v: 0.85 },
        { t: 0.30, v: 0.65 },
        { t: 0.50, v: 0.45 },
        { t: 0.65, v: 0.25 },
        { t: 0.78, v: 0.12 },
        { t: 1.00, v: 0.12 },
      ],
      // Blur arranca a t=0.20 y crece hasta el cierre del clip (t=0.80)
      blur: [
        { t: 0.00, v: 0 },
        { t: 0.20, v: 0 },
        { t: 0.38, v: 2.0 },
        { t: 0.55, v: 6.0 },
        { t: 0.70, v: 9.0 },
        { t: 0.80, v: 14 },
        { t: 1.00, v: 14 },
      ],
      brightness: [
        { t: 0.00, v: 1 },
        { t: 0.40, v: 1 },
        { t: 0.65, v: 0.78 },
        { t: 0.80, v: 0.10 },
        { t: 1.00, v: 0.05 },
      ],
      hueRot: [
        { t: 0.00, v: 0 },
        { t: 0.25, v: 0 },
        { t: 0.50, v: -18 },
        { t: 0.68, v: -36 },
        { t: 0.80, v: -55 },
        { t: 1.00, v: -55 },
      ],
      // Clip radius — ya NO se usa de aquí. computeClipFactor() genera
      // una curva analítica con oscilación amortiguada (sin keyframes).
      // Se mantiene como vestigio comentado por si hace falta debug.
      clipR: [
        { t: 0.00, v: maxScreenR * 1.00 },
        { t: 1.00, v: 0 },
      ],
    }
    // Cache absolute screen-shake amplitude curve (used only in phase 1-2)
    const shakeAmpFor = (p) => {
      if (p < 0.05) return p / 0.05 * 2
      if (p < 0.36) return 2 + ((p - 0.05) / 0.31) * 4
      if (p < 0.55) return 6 * (1 - (p - 0.36) / 0.19)
      return 0
    }

    const frame = (now) => {
      const elapsed = now - startTime
      const progress = clamp(elapsed / DURATION, 0, 1)
      const absT = (now - startTime) / 1000

      ctx.clearRect(0, 0, w, h)

      // ClipR calculado con función analítica continua (en lugar de
       // keyframes) — da oscilaciones amortiguadas suaves sin saltos.
      const currentClipR = computeClipFactor(progress) * maxScreenR

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
        const clipR = currentClipR

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
        // Solo aplicar clipPath cuando ya empezó a cerrarse de verdad.
        // El threshold compara el clip en pixels: si está al 99% o más
        // del radio máximo, no aplica nada (evita un clip "completo" que
        // se vería como un círculo gigante). En cuanto baja del 99% se
        // aplica de forma continua para que el cierre sea PROGRESIVO
        // desde el primer keyframe, sin saltos discretos.
        if (clipR < maxScreenR * 0.995) {
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
       * PHASE 3: EVENT HORIZON  (0.28 → 0.52)
       * Photon ring + accretion disk.
       * El wrapper (clip + filter) lo gestiona la tabla de keyframes
       * arriba — aquí solo dibujamos en el canvas overlay.
       * ════════════════════════════════════════════════════════ */
      const p3 = phaseT(progress, 0.30, 0.55)
      if (p3 > 0) {
        // Event horizon radius: sits AT the actual clip-path edge (+6px
        // so the stroke renders just outside the dark interior) so the
        // ring/disk visually wrap the black hole and respect the bounces.
        const eventR = Math.max(4, currentClipR + 6)

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
        // Only draw when it fits inside the viewport — when the clip is
        // very wide at the start of phase 3, eventR is huge and the ring
        // would render off-screen as a flat line crossing the borders.
        const maxVisibleRing = Math.min(w, h) * 0.55
        if (eventR > 2 && eventR < maxVisibleRing) {
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
      }

      /* ════════════════════════════════════════════════════════
       * PHASE 4: SPAGHETTIFICATION  (0.52 → 0.75)
       * Brighter, faster-spinning accretion disk con DOPPLER SHIFT.
       * El wrapper (zoom, blur, clip) lo gestiona la tabla de
       * keyframes arriba — aquí solo dibujamos en canvas.
       * ════════════════════════════════════════════════════════ */
      const p4 = phaseT(progress, 0.55, 0.80)
      if (p4 > 0) {
        // Event horizon — AT the clip edge (+6px outside) so the ring
        // wraps the black hole and honors every bounce.
        const eventR = Math.max(4, currentClipR + 6)
        const maxVisibleRing = Math.min(w, h) * 0.55

        if (eventR > 2 && eventR < maxVisibleRing) {
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
       * PHASE 5: TOTAL COLLAPSE  (0.66 → 0.74)
       * Solo el white flash final. clip-path y wrapper los maneja
       * la tabla de keyframes — al 74% del progreso el clip llega
       * a 0 y el dashboard es 100% visible. Tras eso queda el
       * REMNANT brillando (siguiente bloque).
       * ════════════════════════════════════════════════════════ */
      const p5 = phaseT(progress, 0.70, 0.80)
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
      /* ════════════════════════════════════════════════════════
       * SINGULARITY REMNANT  (0.60 → 1.00 — fase final cinemática)
       * Físicamente: el agujero negro acaba de colapsar sobre su
       * propia singularidad. El brillo es lo que queda DESPUÉS del
       * colapso. Estructura:
       *  - Build-up (0.00-0.30 local): el brillo aparece mientras
       *    el clip se sigue cerrando.
       *  - PEAK largo y estable (0.30-0.82 local): el brillo permanece
       *    al 100% durante el cierre del agujero y bastante después,
       *    sobreviviéndolo claramente.
       *  - Blink (0.82-0.92 local): pulso de intensidad final (×1.4)
       *    como un "destello" antes de extinguirse.
       *  - Off (0.92-1.00 local): apagado rápido a 0.
       * ════════════════════════════════════════════════════════ */
      const pRemnant = phaseT(progress, 0.80, 1.0)
      if (pRemnant > 0) {
        // Pulse suave (frecuencia 10 rad/s = ~1.6 Hz)
        const pulse = 0.72 + 0.28 * Math.sin(absT * 10)

        // ── Curva de intensidad con BLINK ÉPICO ──
        // pRemnant es 0-1 sobre 1100ms (de t global 0.80 a 1.00, DURATION=5500ms)
        //   0.00-0.15 (165ms): build-up rápido
        //   0.15-0.62 (520ms): PEAK ESTABLE — singularidad visible ~medio segundo
        //   0.62-0.90 (310ms): BLINK rápido (intensity 2.8×)
        //   0.90-1.00 (110ms): off
        let intensity
        if (pRemnant < 0.15) {
          intensity = easeOutCubic(pRemnant / 0.15)
        } else if (pRemnant < 0.62) {
          intensity = 1                                            // PEAK estable 520ms
        } else if (pRemnant < 0.90) {
          // BLINK rápido
          const bp = (pRemnant - 0.62) / 0.28
          if (bp < 0.35) {
            intensity = 1 + 1.8 * easeOutCubic(bp / 0.35)          // 1 → 2.8 (rápido)
          } else {
            const fp = (bp - 0.35) / 0.65
            intensity = 2.8 - 2.5 * (fp * fp)                       // 2.8 → 0.3
          }
        } else {
          intensity = 0.3 - 0.3 * easeOutCubic((pRemnant - 0.90) / 0.10)
        }
        const baseA = Math.max(0, intensity * pulse)

        // ── Curva de tamaño: durante PEAK tamaño normal, blink expande, off colapsa ──
        let sizeShrink
        if (pRemnant < 0.62) {
          sizeShrink = 1.0                                          // tamaño normal
        } else if (pRemnant < 0.90) {
          const bp = (pRemnant - 0.62) / 0.28
          if (bp < 0.35) {
            sizeShrink = 1.0 + 0.6 * easeOutCubic(bp / 0.35)        // 1.0 → 1.6
          } else {
            const fp = (bp - 0.35) / 0.65
            sizeShrink = 1.6 - 1.0 * (fp * fp)                      // 1.6 → 0.6
          }
        } else {
          sizeShrink = Math.max(0.05, 0.6 - 0.55 * easeOutCubic((pRemnant - 0.90) / 0.10))
        }

        if (baseA > 0.001) {
          // ── Halo exterior masivo (suave, gigante) ──
          const haloR = (140 + 50 * pulse) * sizeShrink
          const haloGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR)
          haloGrad.addColorStop(0,    `rgba(255,245,210,${Math.min(1, baseA * 0.50)})`)
          haloGrad.addColorStop(0.15, `rgba(255,210,120,${Math.min(1, baseA * 0.40)})`)
          haloGrad.addColorStop(0.40, `rgba(255,150,80,${Math.min(1, baseA * 0.22)})`)
          haloGrad.addColorStop(0.65, `rgba(0,212,228,${Math.min(1, baseA * 0.14)})`)
          haloGrad.addColorStop(0.85, `rgba(157,111,219,${Math.min(1, baseA * 0.06)})`)
          haloGrad.addColorStop(1,    'rgba(0,0,0,0)')
          ctx.fillStyle = haloGrad
          ctx.fillRect(cx - haloR, cy - haloR, haloR * 2, haloR * 2)

          // ── Halo interior dorado puro ──
          const innerHaloR = (32 + 14 * pulse) * sizeShrink
          const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerHaloR)
          innerGrad.addColorStop(0,    `rgba(255,255,240,${Math.min(1, baseA * 0.80)})`)
          innerGrad.addColorStop(0.35, `rgba(255,230,160,${Math.min(1, baseA * 0.55)})`)
          innerGrad.addColorStop(0.75, `rgba(255,180,90,${Math.min(1, baseA * 0.20)})`)
          innerGrad.addColorStop(1,    'rgba(0,0,0,0)')
          ctx.fillStyle = innerGrad
          ctx.fillRect(cx - innerHaloR, cy - innerHaloR, innerHaloR * 2, innerHaloR * 2)

          // ── Núcleo brillante (singularity dot) — durante blink x2.2 ──
          const isBlink = pRemnant >= 0.62 && pRemnant < 0.90
          const coreBoost = isBlink ? 2.2 : 1.0
          const coreR = (2.5 + pulse * 2.5) * Math.max(0.4, sizeShrink) * coreBoost
          ctx.beginPath()
          ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${Math.min(1, baseA * 0.98)})`
          ctx.shadowColor = `rgba(255,230,160,${Math.min(1, baseA)})`
          ctx.shadowBlur = 28 * sizeShrink * coreBoost
          ctx.fill()
          ctx.shadowBlur = 0

          // ── Star spikes — durante blink se ALARGAN dramáticamente ──
          const spikeBoost = isBlink ? 2.5 : 1.0
          const spikeLen = (30 + 20 * pulse) * sizeShrink * spikeBoost
          const spikeA = Math.min(1, baseA * 0.55)
          if (spikeA > 0.005 && spikeLen > 1) {
            ctx.strokeStyle = `rgba(255,245,200,${spikeA})`
            ctx.lineWidth = 1.2 * (isBlink ? 1.8 : 1)
            ctx.shadowColor = `rgba(255,220,140,${spikeA})`
            ctx.shadowBlur = 16 * (isBlink ? 1.5 : 1)
            ctx.beginPath()
            ctx.moveTo(cx - spikeLen, cy);     ctx.lineTo(cx + spikeLen, cy)
            ctx.moveTo(cx, cy - spikeLen);     ctx.lineTo(cx, cy + spikeLen)
            ctx.stroke()
            ctx.strokeStyle = `rgba(255,245,200,${spikeA * 0.55})`
            ctx.lineWidth = 0.8 * (isBlink ? 1.6 : 1)
            ctx.beginPath()
            const diag = spikeLen * 0.55
            ctx.moveTo(cx - diag, cy - diag); ctx.lineTo(cx + diag, cy + diag)
            ctx.moveTo(cx - diag, cy + diag); ctx.lineTo(cx + diag, cy - diag)
            ctx.stroke()
            ctx.shadowBlur = 0
          }

          // ── BLINK extra: shockwave radial ──
          if (pRemnant >= 0.62 && pRemnant < 0.80) {
            const sp = (pRemnant - 0.62) / 0.18
            const ringR = 50 + 200 * easeOutCubic(sp)
            const ringA = (1 - sp) * 0.55
            if (ringA > 0.01) {
              ctx.strokeStyle = `rgba(255,235,180,${ringA})`
              ctx.lineWidth = 2 + (1 - sp) * 3
              ctx.shadowColor = `rgba(255,210,120,${ringA})`
              ctx.shadowBlur = 22
              ctx.beginPath()
              ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
              ctx.stroke()
              ctx.shadowBlur = 0
            }
          }
        }
      }

      /* ════════════════════════════════════════════════════════
       * CANVAS OVERLAY FADE-OUT (últimos 4%)
       * El remnant ya se reduce naturalmente de tamaño hasta quedar
       * un puntito brillante. Este fade final es solo el "apagado"
       * limpio del puntito al unmount — 4% del DURATION = ~220ms.
       * ════════════════════════════════════════════════════════ */
      if (progress > 0.96) {
        const fadeT = (progress - 0.96) / 0.04
        const eased = easeInOutCubic(fadeT)
        if (canvasRef.current) {
          canvasRef.current.style.opacity = String(1 - eased)
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
