/**
 * BlochSphere — Esfera de Bloch decorativa SVG
 * ===============================================
 * Representación minimalista de la esfera de Bloch (espacio de estados
 * de un qubit). Decorativa, con órbitas animadas y vector de estado.
 * 
 * Props:
 * - size: Tamaño en píxeles
 * - collapsed: Si true, el vector de estado colapsa hacia |0⟩ (polo norte)
 */

import styles from './BlochSphere.module.css'

export default function BlochSphere({ size = 120, collapsed = false }) {
  const half = size / 2
  const r = size * 0.38

  // Posición del vector de estado:
  // - Superposición: diagonal (hacia arriba-derecha)
  // - Colapsado: apunta al polo norte |0⟩
  const vectorEndX = collapsed ? half : half + r * 0.55
  const vectorEndY = collapsed ? half - r : half - r * 0.7

  return (
    <svg 
      viewBox={`0 0 ${size} ${size}`} 
      width={size} 
      height={size} 
      className={`${styles.blochSphere} ${collapsed ? styles.collapsed : ''}`}
    >
      <defs>
        <linearGradient id="blochGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(0, 212, 228, 0.15)" />
          <stop offset="100%" stopColor="rgba(157, 111, 219, 0.1)" />
        </linearGradient>
        <filter id="blochGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="g" />
          <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Esfera exterior */}
      <circle cx={half} cy={half} r={r} fill="url(#blochGrad)" stroke="rgba(0, 212, 228, 0.2)" strokeWidth="0.8" />
      
      {/* Elipse ecuatorial */}
      <ellipse cx={half} cy={half} rx={r} ry={r * 0.35} fill="none" stroke="rgba(0, 212, 228, 0.15)" strokeWidth="0.6" strokeDasharray="3 3" className={styles.equator} />
      
      {/* Eje vertical (|0⟩ → |1⟩) */}
      <line x1={half} y1={half - r - 6} x2={half} y2={half + r + 6} stroke="rgba(255, 255, 255, 0.1)" strokeWidth="0.5" strokeDasharray="2 3" />
      
      {/* Etiquetas */}
      <text x={half} y={half - r - 9} textAnchor="middle" fill="rgba(0, 212, 228, 0.4)" fontSize="8" fontFamily="var(--font-family-mono)">|0⟩</text>
      <text x={half} y={half + r + 16} textAnchor="middle" fill="rgba(157, 111, 219, 0.4)" fontSize="8" fontFamily="var(--font-family-mono)">|1⟩</text>
      
      {/* Vector de estado ψ (flecha del centro hacia la superficie) */}
      <line 
        x1={half} 
        y1={half} 
        x2={vectorEndX} 
        y2={vectorEndY} 
        stroke={collapsed ? "#00D4E4" : "rgba(0, 212, 228, 0.5)"} 
        strokeWidth={collapsed ? "1.5" : "1.2"} 
        className={styles.stateVector} 
      />
      <circle 
        cx={vectorEndX} 
        cy={vectorEndY} 
        r={collapsed ? "3.5" : "2.5"} 
        fill="#00D4E4" 
        filter="url(#blochGlow)" 
        className={`${styles.statePoint} ${collapsed ? styles.collapsedPoint : ''}`} 
      />

      {/* Centro */}
      <circle cx={half} cy={half} r="1.5" fill="rgba(255, 255, 255, 0.3)" />
    </svg>
  )
}
