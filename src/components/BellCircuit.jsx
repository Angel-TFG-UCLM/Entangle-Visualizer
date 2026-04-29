/**
 * BellCircuit - Circuito de Par de Bell interactivo
 * =================================================
 * Mejoras vs versión anterior:
 *   - Hit-areas ampliadas con <rect> invisibles para hacer el hover fácil
 *   - Tooltip flotante (sigue al ratón) en lugar de panel fijo debajo
 *   - Animación pulsante de las compuertas restaurada (no solo en hover)
 *   - Descripción del circuito visible siempre debajo (no solo en hover)
 */

import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import styles from './BellCircuit.module.css'

function BellFormula() {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      katex.render(
        '|\\Phi^+\\rangle = \\tfrac{1}{\\sqrt{2}}(|00\\rangle + |11\\rangle)',
        ref.current,
        { throwOnError: false, displayMode: false },
      )
    }
  }, [])
  return <span ref={ref} className={styles.formula} aria-label="Bell state formula" />
}

/**
 * Renderiza un grupo SVG con un rect transparente más grande sobre la
 * compuerta visible para facilitar el hover/focus. Se ancla a (cx, cy).
 */
function GateGroup({ gateKey, hovered, setHovered, hitX, hitY, hitW = 40, hitH = 40, t, children }) {
  return (
    <g
      className={`${styles.gate} ${hovered === gateKey ? styles.gateActive : ''}`}
      onMouseEnter={() => setHovered(gateKey)}
      onMouseLeave={() => setHovered(prev => (prev === gateKey ? null : prev))}
      onFocus={() => setHovered(gateKey)}
      onBlur={() => setHovered(prev => (prev === gateKey ? null : prev))}
      tabIndex={0}
      role="button"
      aria-label={t(`app.footer.gates.${gateKey}`)}
    >
      {children}
      {/* Hit-area transparente más grande para facilitar el hover */}
      <rect
        x={hitX}
        y={hitY}
        width={hitW}
        height={hitH}
        fill="transparent"
        className={styles.hitArea}
      />
    </g>
  )
}

GateGroup.propTypes = {
  gateKey: PropTypes.string.isRequired,
  hovered: PropTypes.string,
  setHovered: PropTypes.func.isRequired,
  hitX: PropTypes.number.isRequired,
  hitY: PropTypes.number.isRequired,
  hitW: PropTypes.number,
  hitH: PropTypes.number,
  t: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
}

export default function BellCircuit() {
  const { t } = useTranslation()
  const [hoveredGate, setHoveredGate] = useState(null)
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 })
  const wrapperRef = useRef(null)

  // Tracking del puntero para posicionar el tooltip flotante
  const handlePointerMove = (e) => {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    setPointerPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      onMouseMove={handlePointerMove}
    >
      <div className={styles.svgScroller}>
        <svg
          viewBox="0 0 600 70"
          className={styles.circuitSvg}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={t('app.footer.circuitLabel')}
        >
          <defs>
            <linearGradient id="bellCircuitGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="rgba(0,212,228,0.05)" />
              <stop offset="15%"  stopColor="rgba(0,212,228,0.6)" />
              <stop offset="50%"  stopColor="rgba(157,111,219,0.6)" />
              <stop offset="85%"  stopColor="rgba(0,212,228,0.6)" />
              <stop offset="100%" stopColor="rgba(0,212,228,0.05)" />
            </linearGradient>
            <filter id="bellGlow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Líneas de qubit */}
          <line x1="50" y1="20" x2="550" y2="20" stroke="url(#bellCircuitGrad)" strokeWidth="1.5" />
          <line x1="50" y1="40" x2="550" y2="40" stroke="url(#bellCircuitGrad)" strokeWidth="1.5" />

          {/* Etiquetas de qubit */}
          <text x="30" y="24" fill="rgba(0,212,228,0.7)"   fontSize="10" fontFamily="var(--font-family-mono)" textAnchor="end">|0⟩</text>
          <text x="30" y="44" fill="rgba(157,111,219,0.7)" fontSize="10" fontFamily="var(--font-family-mono)" textAnchor="end">|0⟩</text>

          {/* === Hadamard === */}
          <GateGroup gateKey="hadamard" hovered={hoveredGate} setHovered={setHoveredGate} hitX={105} hitY={0} hitW={40} hitH={40} t={t}>
            <rect x="115" y="10" width="20" height="20" rx="3" fill="rgba(0,212,228,0.06)" stroke="rgba(0,212,228,0.7)" strokeWidth="1.5" className={styles.gateH} />
            <text x="125" y="24" fill="rgba(0,212,228,0.9)" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="var(--font-family-mono)">H</text>
          </GateGroup>

          {/* === CNOT === */}
          <GateGroup gateKey="cnot" hovered={hoveredGate} setHovered={setHoveredGate} hitX={186} hitY={4} hitW={28} hitH={50} t={t}>
            <circle cx="200" cy="20" r="6" fill="none" stroke="rgba(0,212,228,0.7)" strokeWidth="1.5" className={styles.gateCNOT} />
            <line x1="200" y1="14" x2="200" y2="26" stroke="rgba(0,212,228,0.7)" strokeWidth="1.5" />
            <line x1="194" y1="20" x2="206" y2="20" stroke="rgba(0,212,228,0.7)" strokeWidth="1.5" />
            <line x1="200" y1="26" x2="200" y2="40" stroke="rgba(157,111,219,0.6)" strokeWidth="1.5" strokeDasharray="3 2" />
            <circle cx="200" cy="40" r="4" fill="rgba(157,111,219,0.6)" className={styles.gateCNOT} />
          </GateGroup>

          {/* === Pauli-Z === */}
          <GateGroup gateKey="pauliZ" hovered={hoveredGate} setHovered={setHoveredGate} hitX={270} hitY={0} hitW={40} hitH={40} t={t}>
            <rect x="280" y="10" width="20" height="20" rx="3" fill="rgba(0,255,159,0.06)" stroke="rgba(0,255,159,0.6)" strokeWidth="1.5" className={styles.gateZ} />
            <text x="290" y="24" fill="rgba(0,255,159,0.85)" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="var(--font-family-mono)">Z</text>
          </GateGroup>

          {/* === Segundo Hadamard === */}
          <GateGroup gateKey="hadamard2" hovered={hoveredGate} setHovered={setHoveredGate} hitX={345} hitY={20} hitW={40} hitH={40} t={t}>
            <rect x="355" y="30" width="20" height="20" rx="3" fill="rgba(157,111,219,0.06)" stroke="rgba(157,111,219,0.7)" strokeWidth="1.5" className={styles.gateH2} />
            <text x="365" y="44" fill="rgba(157,111,219,0.9)" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="var(--font-family-mono)">H</text>
          </GateGroup>

          {/* === Medición === */}
          <GateGroup gateKey="measure" hovered={hoveredGate} setHovered={setHoveredGate} hitX={430} hitY={0} hitW={48} hitH={56} t={t}>
            <rect x="440" y="10" width="24" height="20" rx="3" fill="rgba(0,212,228,0.06)" stroke="rgba(0,212,228,0.6)" strokeWidth="1.5" className={styles.gateMeasure} />
            <path d="M 446,26 Q 452,16 458,26" fill="none" stroke="rgba(0,212,228,0.7)" strokeWidth="1.5" />
            <line x1="452" y1="20" x2="456" y2="14" stroke="rgba(0,212,228,0.7)" strokeWidth="1.5" />
            <rect x="440" y="30" width="24" height="20" rx="3" fill="rgba(157,111,219,0.06)" stroke="rgba(157,111,219,0.6)" strokeWidth="1.5" className={styles.gateMeasure} />
            <path d="M 446,46 Q 452,36 458,46" fill="none" stroke="rgba(157,111,219,0.7)" strokeWidth="1.5" />
            <line x1="452" y1="40" x2="456" y2="34" stroke="rgba(157,111,219,0.7)" strokeWidth="1.5" />
          </GateGroup>

          {/* === Estado final |Φ⁺⟩ === */}
          <GateGroup gateKey="bellState" hovered={hoveredGate} setHovered={setHoveredGate} hitX={560} hitY={10} hitW={40} hitH={40} t={t}>
            <text x="572" y="32" fill="rgba(0,212,228,0.85)" fontSize="11" fontFamily="var(--font-family-mono)" textAnchor="start" filter="url(#bellGlow)">|Φ⁺⟩</text>
          </GateGroup>
        </svg>
      </div>

      {/* Tooltip flotante posicionado bajo el cursor */}
      {hoveredGate && (
        <div
          className={styles.floatingTooltip}
          style={{
            left: pointerPos.x,
            top: pointerPos.y - 48,
          }}
          role="tooltip"
        >
          <span className={styles.tooltipText}>
            {t(`app.footer.gates.${hoveredGate}`)}
          </span>
          {hoveredGate === 'bellState' && <BellFormula />}
        </div>
      )}

      {/* Descripción del circuito (siempre visible) */}
      <p className={styles.circuitLabel}>
        {t('app.footer.circuitLabel')}
        <span className={styles.hintInline}>
          <span className={styles.hintDot} />
          {t('app.footer.circuitHint')}
        </span>
      </p>
    </div>
  )
}
