/**
 * LogoQuantumParticles - Halo atómico inspirado en el modelo de Bohr
 * ==================================================================
 * En lugar de partículas en órbitas circulares concéntricas, este componente
 * dibuja 3 órbitas elípticas inclinadas en distintos ejes (x, y, z) simulando
 * el modelo planetario clásico del átomo. Cada órbita tiene su propia velocidad
 * y fase, y cada electrón parpadea suavemente.
 *
 * El conjunto se comporta como un sistema mucho más orgánico que las simples
 * órbitas circulares, sin perder coherencia visual con el resto de metáforas
 * cuánticas del proyecto.
 */

import { memo } from 'react'
import styles from './LogoQuantumParticles.module.css'

function LogoQuantumParticles() {
  return (
    <span className={styles.atom} aria-hidden="true">
      {/* Órbita 1 - elipse plana, rotación lenta horaria */}
      <span className={`${styles.shell} ${styles.shell1}`}>
        <span className={`${styles.electron} ${styles.cyan}`} />
      </span>

      {/* Órbita 2 - elipse inclinada (eje y), rotación media */}
      <span className={`${styles.shell} ${styles.shell2}`}>
        <span className={`${styles.electron} ${styles.purple}`} />
      </span>

      {/* Órbita 3 - elipse inclinada al otro lado, rotación distinta */}
      <span className={`${styles.shell} ${styles.shell3}`}>
        <span className={`${styles.electron} ${styles.cyan}`} />
      </span>

      {/* Trazas tenues de las elipses para sugerir las órbitas */}
      <svg className={styles.shellTraces} viewBox="-50 -50 100 100" aria-hidden="true">
        <ellipse cx="0" cy="0" rx="44" ry="18" className={`${styles.shellPath} ${styles.shell1Path}`} />
        <ellipse cx="0" cy="0" rx="42" ry="20" className={`${styles.shellPath} ${styles.shell2Path}`} />
        <ellipse cx="0" cy="0" rx="40" ry="16" className={`${styles.shellPath} ${styles.shell3Path}`} />
      </svg>
    </span>
  )
}

// Wrap in memo: el componente no recibe props ni depende de estado externo,
// asÃ­ que NUNCA necesita re-renderizarse cuando su padre (App) re-render
// por otros motivos (p.ej. polling de estado del backend). Sin este memo,
// cada update de App provocaba un micro-freeze visible en el Ã¡tomo del badge.
export default memo(LogoQuantumParticles)
