/**
 * EntanglementLines — SVG decorativo entre KPI cards
 * ====================================================
 * 
 * Dibuja líneas curvas pulsantes que conectan las 3 KPI cards,
 * simulando el entrelazamiento cuántico entre las métricas.
 * Las líneas respiran y tienen partículas viajando entre ellas.
 */

import { useEffect, useRef, useState } from 'react'
import styles from './EntanglementLines.module.css'

export default function EntanglementLines({ containerRef, cardRefs }) {
  const svgRef = useRef(null)
  const [paths, setPaths] = useState([])
  const [svgSize, setSvgSize] = useState({ w: 1, h: 1 })

  useEffect(() => {
    const calculate = () => {
      const container = containerRef?.current
      if (!container) return

      const cards = (cardRefs || []).map(r => r?.current).filter(Boolean)
      if (cards.length < 2) return

      const cRect = container.getBoundingClientRect()
      if (cRect.width === 0 || cRect.height === 0) return

      setSvgSize({ w: cRect.width, h: cRect.height })

      const centers = cards.map(card => {
        const r = card.getBoundingClientRect()
        return {
          x: r.left + r.width / 2 - cRect.left,
          y: r.top + r.height / 2 - cRect.top,
        }
      })

      // Si los centros son iguales, las cards aún no tienen layout
      if (centers.length >= 2 && centers[0].x === centers[1].x && centers[0].y === centers[1].y) return

      const newPaths = []
      for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
          const a = centers[i]
          const b = centers[j]
          const midX = (a.x + b.x) / 2
          const midY = (a.y + b.y) / 2 - 25
          newPaths.push({
            d: `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`,
          })
        }
      }
      if (newPaths.length > 0) setPaths(newPaths)
    }

    // Reintentar periódicamente — las cards tienen scroll-reveal (opacity 0 → 1)
    // así que necesitamos esperar a que sean visibles para medir posiciones correctas
    const timers = [
      setTimeout(calculate, 200),
      setTimeout(calculate, 600),
      setTimeout(calculate, 1200),
      setTimeout(calculate, 2000),
      setTimeout(calculate, 3000),
    ]

    window.addEventListener('resize', calculate)
    window.addEventListener('scroll', calculate, { passive: true })

    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', calculate)
      window.removeEventListener('scroll', calculate)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lineColors = ['rgba(0,212,228,0.35)', 'rgba(157,111,219,0.30)', 'rgba(0,255,159,0.25)']
  const dotColors = ['#00D4E4', '#9D6FDB', '#00ff9f']

  return (
    <svg
      ref={svgRef}
      className={styles.entanglementSvg}
      viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
    >
      <defs>
        <filter id="entGlow">
          <feGaussianBlur stdDeviation="2" result="g" />
          <feMerge>
            <feMergeNode in="g" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {paths.map((p, i) => (
        <g key={i}>
          <path
            d={p.d}
            fill="none"
            stroke={lineColors[i % lineColors.length]}
            strokeWidth="1.5"
            strokeDasharray="6 8"
            filter="url(#entGlow)"
            className={styles.line}
            style={{ animationDelay: `${i * 1.3}s` }}
          />
          <circle r="3" fill={dotColors[i % dotColors.length]} opacity="0.8" filter="url(#entGlow)">
            <animateMotion
              dur={`${2.5 + i * 0.8}s`}
              repeatCount="indefinite"
              path={p.d}
            />
          </circle>
          <circle r="1.8" fill={dotColors[i % dotColors.length]} opacity="0.4">
            <animateMotion
              dur={`${3.2 + i * 0.6}s`}
              repeatCount="indefinite"
              path={p.d}
              keyPoints="1;0"
              keyTimes="0;1"
            />
          </circle>
        </g>
      ))}
    </svg>
  )
}
