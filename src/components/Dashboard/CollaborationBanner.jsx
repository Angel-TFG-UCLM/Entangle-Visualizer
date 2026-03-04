/**
 * CollaborationBanner - Portal de Acceso al Universo Cuántico
 * ============================================================
 * 
 * Aparece automáticamente cuando el backend detecta patrones de
 * colaboración real en la BBDD (bridge users, repos conectados, etc.)
 * 
 * Diseñado como un "portal cuántico" inmersivo que invita a explorar
 * el grafo 3D de colaboración.
 */

import { useState, useEffect, useRef } from 'react'
import { useDashboardStore } from '../../store/dashboardStore'
import styles from './CollaborationBanner.module.css'

export default function CollaborationBanner() {
  const {
    collaborationAvailable,
    collaborationDiscovery,
    isDiscovering,
    openCollaborationGraph,
  } = useDashboardStore()
  
  const [visible, setVisible] = useState(false)
  const [inView, setInView] = useState(false)
  const [autoTour, setAutoTour] = useState(false)
  const wrapperRef = useRef(null)
  
  /* IntersectionObserver — revela el banner al hacer scroll */
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); io.disconnect() } },
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  
  useEffect(() => {
    if (collaborationAvailable) {
      const timer = setTimeout(() => setVisible(true), 400)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
    }
  }, [collaborationAvailable])
  
  const shouldShow = collaborationAvailable && !isDiscovering
  const revealed = shouldShow && visible && inView
  
  const metrics = collaborationDiscovery?.metrics
  
  const handleClick = () => openCollaborationGraph({ autoTour })
  
  const handleToggle = (e) => {
    e.stopPropagation()
    setAutoTour(v => !v)
  }
  
  
  return (
    <div ref={wrapperRef} className={`${styles.wrapper} ${revealed ? styles.wrapperVisible : ''}`}>
    <div 
      className={`${styles.banner} ${revealed ? styles.bannerVisible : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      {/* Fondo de campo estelar */}
      <div className={styles.starfield}>
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} className={styles.star} style={{
            left: `${(i * 17 + 7) % 100}%`,
            top: `${(i * 23 + 11) % 100}%`,
            animationDelay: `${(i * 0.4) % 3}s`,
            animationDuration: `${2 + (i % 3)}s`,
          }} />
        ))}
      </div>

      {/* Línea brillante superior */}
      <div className={styles.topEdge} />

      {/* Átomo orbital — icono del portal */}
      <div className={styles.portalIcon}>
        <svg viewBox="0 0 120 120" width="56" height="56" className={styles.portalAtom}>
          <ellipse cx="60" cy="60" rx="48" ry="16" fill="none" stroke="rgba(0,212,228,0.25)" strokeWidth="1" className={styles.pOrbit1} />
          <ellipse cx="60" cy="60" rx="48" ry="16" fill="none" stroke="rgba(157,111,219,0.2)" strokeWidth="1" className={styles.pOrbit2} />
          <ellipse cx="60" cy="60" rx="48" ry="16" fill="none" stroke="rgba(0,255,159,0.18)" strokeWidth="1" className={styles.pOrbit3} />
          <circle r="3" fill="#00D4E4" filter="url(#pGlow)">
            <animateMotion dur="2.4s" repeatCount="indefinite" path="M 108,60 A 48,16 0 1,1 12,60 A 48,16 0 1,1 108,60" />
          </circle>
          <circle r="2.5" fill="#9D6FDB" filter="url(#pGlow)">
            <animateMotion dur="3s" repeatCount="indefinite" path="M 93,77 A 48,16 60 1,1 27,43 A 48,16 60 1,1 93,77" />
          </circle>
          <circle r="2" fill="#00ff9f" filter="url(#pGlow)">
            <animateMotion dur="3.6s" repeatCount="indefinite" path="M 27,77 A 48,16 120 1,1 93,43 A 48,16 120 1,1 27,77" />
          </circle>
          <circle cx="60" cy="60" r="5" fill="rgba(0,212,228,0.4)" />
          <circle cx="60" cy="60" r="2.5" fill="rgba(255,255,255,0.6)" />
          <defs>
            <filter id="pGlow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="3" result="g" />
              <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
        </svg>
        {/* Anillo de pulso detrás del átomo */}
        <div className={styles.portalRing} />
        <div className={styles.portalRing2} />
      </div>
      
      {/* Contenido central */}
      <div className={styles.content}>
        <div className={styles.label}>QUANTUM UNIVERSE</div>
        <h3 className={styles.title}>Explorar el Universo de Colaboración</h3>
        <p className={styles.subtitle}>
          {metrics
            ? `${metrics.graph_nodes || 0} nodos · ${metrics.graph_links || 0} enlaces · ${metrics.bridge_users_count || 0} usuarios puente`
            : 'Red de entrelazamiento cuántico descubierta'
          }
        </p>
      </div>
      
      {/* Toggle Tour Cósmico */}
      <div className={styles.tourToggle} onClick={handleToggle} title="Iniciar Tour Cósmico al entrar">
        <div className={`${styles.toggleTrack} ${autoTour ? styles.toggleTrackOn : ''}`}>
          <div className={`${styles.toggleThumb} ${autoTour ? styles.toggleThumbOn : ''}`} />
        </div>
        <span className={`${styles.toggleLabel} ${autoTour ? styles.toggleLabelOn : ''}`}>Tour</span>
      </div>
      
      {/* Botón CTA */}
      <div className={styles.cta}>
        <span className={styles.ctaText}>Entrar</span>
        <svg className={styles.ctaIcon} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        <div className={styles.ctaGlow} />
      </div>
      
    </div>
    </div>
  )
}
