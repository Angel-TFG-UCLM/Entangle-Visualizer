/**
 * WavefunctionCollapse — Efecto decorativo SVG
 * ==============================================
 * 
 * Onda de probabilidad que oscila continuamente.
 * Cuando collapsed=true, la onda "colapsa" a un pico delta de Dirac.
 * Simula la medición cuántica: superposición → estado definido.
 * 
 * @param {boolean} collapsed - Si true, muestra estado colapsado (delta de Dirac)
 * @param {number} width - Ancho del SVG (default 120)
 * @param {number} height - Alto del SVG (default 32)
 */

import styles from './WavefunctionCollapse.module.css'

export default function WavefunctionCollapse({ collapsed = false, width = 120, height = 32 }) {
  // Generar path de onda sinusoidal
  const points = 60
  const wavePoints = []
  const collapsedPoints = []
  const pad = 8 // padding superior para que el punto + glow no se corte
  const svgH = height + pad
  const cy = pad + height / 2

  for (let i = 0; i <= points; i++) {
    const x = (i / points) * width
    // Onda: envolvente gaussiana × sin
    const t = i / points
    const envelope = Math.exp(-Math.pow((t - 0.5) * 4, 2))
    const wave = Math.sin(t * Math.PI * 6) * envelope * (height * 0.35)
    wavePoints.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${(cy - wave).toFixed(1)}`)
    
    // Colapsado: delta de Dirac (pico estrecho en el centro)
    const delta = Math.exp(-Math.pow((t - 0.5) * 20, 2)) * (height * 0.4)
    collapsedPoints.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${(cy - delta).toFixed(1)}`)
  }

  const wavePath = wavePoints.join(' ')
  const collapsedPath = collapsedPoints.join(' ')

  return (
    <div className={`${styles.container} ${collapsed ? styles.active : ''}`}>
      <svg 
        viewBox={`0 0 ${width} ${svgH}`} 
        width={width} 
        height={svgH}
        className={styles.svg}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(0, 212, 228, 0)" />
            <stop offset="30%" stopColor="rgba(0, 212, 228, 0.6)" />
            <stop offset="50%" stopColor="rgba(157, 111, 219, 0.8)" />
            <stop offset="70%" stopColor="rgba(0, 212, 228, 0.6)" />
            <stop offset="100%" stopColor="rgba(0, 212, 228, 0)" />
          </linearGradient>
          <filter id="wfGlow">
            <feGaussianBlur stdDeviation="1.5" result="g" />
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Línea base (eje x) */}
        <line 
          x1="0" y1={cy} x2={width} y2={cy} 
          stroke="rgba(0, 212, 228, 0.08)" 
          strokeWidth="0.5" 
        />
        
        {/* Onda (estado superpuesto) */}
        <path 
          d={wavePath}
          fill="none"
          stroke="url(#waveGrad)"
          strokeWidth="1.5"
          strokeDasharray="4 2"
          filter="url(#wfGlow)"
          className={styles.wave}
        />
        
        {/* Delta de Dirac (estado colapsado) — visible solo en hover */}
        <path 
          d={collapsedPath}
          fill="none"
          stroke="url(#waveGrad)"
          strokeWidth="2"
          filter="url(#wfGlow)"
          className={styles.collapsed}
        />
        
        {/* Punto de medición — solo en hover */}
        <circle 
          cx={width / 2} 
          cy={cy - height * 0.4} 
          r="3" 
          fill="#00D4E4"
          filter="url(#wfGlow)"
          className={styles.measureDot}
        />
      </svg>
      
      {/* Label */}
      <span className={styles.label}>|ψ|²</span>
      <span className={styles.labelCollapsed}>δ(x)</span>
    </div>
  )
}
