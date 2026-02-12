/**
 * CollaborationBanner - Banner de Colaboración Descubierta
 * =========================================================
 * 
 * Aparece automáticamente cuando el backend detecta patrones de
 * colaboración real en la BBDD (bridge users, repos conectados, etc.)
 * 
 * Al hacer click, abre la vista fullscreen del grafo de colaboración
 * donde el usuario puede explorar todas las relaciones.
 */

import { useState, useEffect } from 'react'
import { useDashboardStore } from '../../store/dashboardStore'
import { FiActivity, FiArrowRight, FiX } from 'react-icons/fi'
import styles from './CollaborationBanner.module.css'

export default function CollaborationBanner() {
  const {
    collaborationAvailable,
    collaborationDiscovery,
    isDiscovering,
    openCollaborationGraph,
  } = useDashboardStore()
  
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  
  // Animación de entrada con delay
  useEffect(() => {
    if (collaborationAvailable && !dismissed) {
      const timer = setTimeout(() => setVisible(true), 300)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
    }
  }, [collaborationAvailable, dismissed])
  
  // No mostrar si no hay colaboración o fue descartado
  if (!collaborationAvailable || dismissed || isDiscovering) {
    return null
  }
  
  const metrics = collaborationDiscovery?.metrics
  const summary = collaborationDiscovery?.summary
  
  const handleClick = () => {
    openCollaborationGraph()
  }
  
  const handleDismiss = (e) => {
    e.stopPropagation()
    setDismissed(true)
  }
  
  return (
    <div 
      className={`${styles.banner} ${visible ? styles.bannerVisible : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      {/* Fondo animado */}
      <div className={styles.bgGlow} />
      <div className={styles.bgPulse} />
      
      {/* Icono con animación */}
      <div className={styles.iconWrapper}>
        <svg viewBox="0 0 48 48" className={styles.iconSvg}>
          <defs>
            <filter id="bannerGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="g" />
              <feMerge>
                <feMergeNode in="g" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Nodos conectados animados */}
          <circle cx="14" cy="24" r="4" fill="#00f7ff" filter="url(#bannerGlow)" className={styles.nodeA} />
          <circle cx="34" cy="16" r="3.5" fill="#bd00ff" filter="url(#bannerGlow)" className={styles.nodeB} />
          <circle cx="34" cy="32" r="3.5" fill="#00ff9f" filter="url(#bannerGlow)" className={styles.nodeC} />
          <line x1="14" y1="24" x2="34" y2="16" stroke="rgba(255,189,0,0.6)" strokeWidth="1.5" className={styles.link} />
          <line x1="14" y1="24" x2="34" y2="32" stroke="rgba(255,189,0,0.6)" strokeWidth="1.5" className={styles.link} />
          <line x1="34" y1="16" x2="34" y2="32" stroke="rgba(255,189,0,0.4)" strokeWidth="1" className={styles.link} />
          {/* Pulso central */}
          <circle cx="24" cy="24" r="2" fill="#ffbd00" filter="url(#bannerGlow)" className={styles.centerPulse} />
        </svg>
      </div>
      
      {/* Contenido */}
      <div className={styles.content}>
        <div className={styles.title}>
          <FiActivity className={styles.titleIcon} />
          <span>¡Grafo de Colaboración disponible!</span>
        </div>
        <p className={styles.summary}>
          {summary || `${metrics?.bridge_users_count || 0} usuarios puente detectados`}
        </p>
      </div>
      
      {/* CTA */}
      <div className={styles.cta}>
        <span>Explorar</span>
        <FiArrowRight className={styles.ctaArrow} />
      </div>
      
      {/* Cerrar */}
      <button 
        className={styles.dismissBtn}
        onClick={handleDismiss}
        aria-label="Descartar"
      >
        <FiX size={14} />
      </button>
      
      {/* Partículas decorativas */}
      <div className={styles.particles}>
        <span className={styles.particle} style={{ left: '10%', animationDelay: '0s' }} />
        <span className={styles.particle} style={{ left: '30%', animationDelay: '0.5s' }} />
        <span className={styles.particle} style={{ left: '60%', animationDelay: '1s' }} />
        <span className={styles.particle} style={{ left: '85%', animationDelay: '1.5s' }} />
      </div>
    </div>
  )
}
