/**
 * QuantumDivider — Separador de onda de probabilidad cuántica
 * ============================================================
 * SVG animado que simula una función de onda ψ(x) entre secciones.
 * Referencia visual al mundo cuántico: ondas de probabilidad que
 * oscilan suavemente con color cian→púrpura.
 */

import { useMemo } from 'react'
import styles from './QuantumDivider.module.css'

export default function QuantumDivider({ variant = 'default' }) {
  const pathId = useMemo(() => `qwave-${Math.random().toString(36).slice(2, 8)}`, [])
  const gradientId = `${pathId}-grad`

  // Generar path de onda sinusoidal
  const wavePath = useMemo(() => {
    const width = 1200
    const amplitude = variant === 'large' ? 16 : 10
    const frequency = variant === 'large' ? 3 : 4
    const points = []
    const steps = 120

    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width
      const y = 25 + amplitude * Math.sin((i / steps) * Math.PI * 2 * frequency)
      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`)
    }

    return points.join(' ')
  }, [variant])

  // Segunda onda desfasada para efecto de interferencia
  const wavePath2 = useMemo(() => {
    const width = 1200
    const amplitude = variant === 'large' ? 12 : 7
    const frequency = variant === 'large' ? 3.5 : 4.5
    const phaseOffset = 1.2
    const points = []
    const steps = 120

    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width
      const y = 25 + amplitude * Math.sin((i / steps) * Math.PI * 2 * frequency + phaseOffset)
      points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`)
    }

    return points.join(' ')
  }, [variant])

  return (
    <div className={`${styles.divider} ${variant === 'large' ? styles.large : ''}`}>
      <svg
        viewBox="0 0 1200 50"
        preserveAspectRatio="none"
        className={styles.wave}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(0, 212, 228, 0)" />
            <stop offset="15%" stopColor="rgba(0, 212, 228, 0.6)" />
            <stop offset="50%" stopColor="rgba(157, 111, 219, 0.8)" />
            <stop offset="85%" stopColor="rgba(0, 212, 228, 0.6)" />
            <stop offset="100%" stopColor="rgba(0, 212, 228, 0)" />
          </linearGradient>
        </defs>

        {/* Onda principal — ψ(x) */}
        <path
          d={wavePath}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
          className={styles.waveLine}
        />

        {/* Onda de interferencia — φ(x), desfasada */}
        <path
          d={wavePath2}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="0.8"
          opacity="0.4"
          className={styles.waveLineSecondary}
        />

        {/* Nodos de probabilidad (puntos donde las ondas se cruzan) */}
        {[0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((pos, i) => (
          <circle
            key={i}
            cx={pos * 1200}
            cy="25"
            r="2"
            fill="rgba(0, 212, 228, 0.5)"
            className={styles.probabilityNode}
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
      </svg>
    </div>
  )
}
