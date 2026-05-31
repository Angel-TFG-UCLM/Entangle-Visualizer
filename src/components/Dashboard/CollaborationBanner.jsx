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
import { useTranslation } from 'react-i18next'
import styles from './CollaborationBanner.module.css'
import Tooltip from '../Tooltip'

/**
 * Animador de números — cuenta desde 0 al valor real cuando el banner es
 * visible. Easing ease-out expo. Stateless: cada cambio de `value` lanza
 * una nueva animación corta.
 */
function CountUp({ value = 0, visible = false, duration = 1100 }) {
  const [display, setDisplay] = useState(0)
  const startRef = useRef(0)
  const fromRef = useRef(0)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!visible) return
    cancelAnimationFrame(rafRef.current)
    startRef.current = performance.now()
    fromRef.current = display
    const to = value
    const tick = (now) => {
      const elapsed = now - startRef.current
      const t = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - t, 4)
      const cur = Math.round(fromRef.current + (to - fromRef.current) * eased)
      setDisplay(cur)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, visible, duration])

  return <>{display.toLocaleString()}</>
}

export default function CollaborationBanner() {
  const { t } = useTranslation()
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
  const bannerRef = useRef(null)
  
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

  /* Cursor glow magnético — actualiza CSS vars --mx / --my en el banner */
  useEffect(() => {
    const el = bannerRef.current
    if (!el) return
    const handler = (e) => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    el.addEventListener('pointermove', handler)
    return () => el.removeEventListener('pointermove', handler)
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
      ref={bannerRef}
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

      {/* Cursor glow magnético (#4) — sigue al puntero dentro del banner */}
      <div className={styles.cursorGlow} aria-hidden="true" />

      {/* Línea brillante superior */}
      <div className={styles.topEdge} />

      {/* Átomo orbital — icono del portal con estelas (#2) */}
      <div className={styles.portalIcon}>
        {/* Energy pulse (#5) — onda sutil que nace del átomo en hover */}
        <div className={styles.energyPulse} aria-hidden="true" />
        <svg viewBox="0 0 120 120" width="56" height="56" className={styles.portalAtom}>
          <ellipse cx="60" cy="60" rx="48" ry="16" fill="none" stroke="rgba(0,212,228,0.25)" strokeWidth="1" className={styles.pOrbit1} />
          <ellipse cx="60" cy="60" rx="48" ry="16" fill="none" stroke="rgba(157,111,219,0.2)" strokeWidth="1" className={styles.pOrbit2} />
          <ellipse cx="60" cy="60" rx="48" ry="16" fill="none" stroke="rgba(0,255,159,0.18)" strokeWidth="1" className={styles.pOrbit3} />

          {/* Trail cyan (órbita horizontal) — ellipse: continuo sin Z, sin saltos */}
          <ellipse
            cx="60" cy="60" rx="48" ry="16" pathLength="100"
            fill="none" stroke="#00D4E4" strokeWidth="2"
            strokeLinecap="round" strokeDasharray="22 78" strokeOpacity="0.14"
            filter="url(#pGlow)"
          >
            <animate attributeName="stroke-dashoffset" from="22" to="-78" dur="2.4s" repeatCount="indefinite" />
          </ellipse>
          <ellipse
            cx="60" cy="60" rx="48" ry="16" pathLength="100"
            fill="none" stroke="#00D4E4" strokeWidth="1"
            strokeLinecap="round" strokeDasharray="12 88" strokeOpacity="0.32"
          >
            <animate attributeName="stroke-dashoffset" from="12" to="-88" dur="2.4s" repeatCount="indefinite" />
          </ellipse>
          {/* Electrón cyan = dash ultracorto + linecap round (=punto) */}
          <ellipse
            cx="60" cy="60" rx="48" ry="16" pathLength="100"
            fill="none" stroke="#00D4E4" strokeWidth="6"
            strokeLinecap="round" strokeDasharray="0.1 99.9"
            filter="url(#pGlow)"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="2.4s" repeatCount="indefinite" />
          </ellipse>

          {/* Trail púrpura (órbita rotada 60°) */}
          <g transform="rotate(60 60 60)">
            <ellipse
              cx="60" cy="60" rx="48" ry="16" pathLength="100"
              fill="none" stroke="#9D6FDB" strokeWidth="2"
              strokeLinecap="round" strokeDasharray="22 78" strokeOpacity="0.14"
              filter="url(#pGlow)"
            >
              <animate attributeName="stroke-dashoffset" from="22" to="-78" dur="3s" repeatCount="indefinite" />
            </ellipse>
            <ellipse
              cx="60" cy="60" rx="48" ry="16" pathLength="100"
              fill="none" stroke="#9D6FDB" strokeWidth="1"
              strokeLinecap="round" strokeDasharray="12 88" strokeOpacity="0.32"
            >
              <animate attributeName="stroke-dashoffset" from="12" to="-88" dur="3s" repeatCount="indefinite" />
            </ellipse>
            <ellipse
              cx="60" cy="60" rx="48" ry="16" pathLength="100"
              fill="none" stroke="#9D6FDB" strokeWidth="5"
              strokeLinecap="round" strokeDasharray="0.1 99.9"
              filter="url(#pGlow)"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="3s" repeatCount="indefinite" />
            </ellipse>
          </g>

          {/* Trail verde (órbita rotada 120°) */}
          <g transform="rotate(120 60 60)">
            <ellipse
              cx="60" cy="60" rx="48" ry="16" pathLength="100"
              fill="none" stroke="#00ff9f" strokeWidth="2"
              strokeLinecap="round" strokeDasharray="22 78" strokeOpacity="0.14"
              filter="url(#pGlow)"
            >
              <animate attributeName="stroke-dashoffset" from="22" to="-78" dur="3.6s" repeatCount="indefinite" />
            </ellipse>
            <ellipse
              cx="60" cy="60" rx="48" ry="16" pathLength="100"
              fill="none" stroke="#00ff9f" strokeWidth="1"
              strokeLinecap="round" strokeDasharray="12 88" strokeOpacity="0.32"
            >
              <animate attributeName="stroke-dashoffset" from="12" to="-88" dur="3.6s" repeatCount="indefinite" />
            </ellipse>
            <ellipse
              cx="60" cy="60" rx="48" ry="16" pathLength="100"
              fill="none" stroke="#00ff9f" strokeWidth="4"
              strokeLinecap="round" strokeDasharray="0.1 99.9"
              filter="url(#pGlow)"
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="3.6s" repeatCount="indefinite" />
            </ellipse>
          </g>

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
        <div className={styles.label}>{t('collaboration.bannerLabel')}</div>
        <h3 className={styles.title}>{t('collaboration.bannerTitle')}</h3>
        <p className={styles.subtitle}>
          {metrics ? (() => {
            // Plantilla con tokens \x00X\x00 que respetan el orden de cualquier idioma
            const tpl = t('collaboration.bannerMetrics', {
              nodes: '\x00N\x00',
              links: '\x00L\x00',
              bridges: '\x00B\x00',
            })
            const parts = tpl.split(/\x00([NLB])\x00/)
            return parts.map((p, i) => {
              if (i % 2 === 0) return p
              const val = p === 'N'
                ? (metrics.graph_nodes || 0)
                : p === 'L'
                  ? (metrics.graph_links || 0)
                  : (metrics.bridge_users_count || 0)
              return (
                <strong key={i} className={styles.metricCount}>
                  <CountUp value={val} visible={revealed} />
                </strong>
              )
            })
          })() : t('collaboration.bannerFallback')}
        </p>
      </div>
      
      {/* Toggle Tour Cósmico */}
      <Tooltip label={t('collaboration.tourHint')} position="top">
        <div className={styles.tourToggle} role="button" tabIndex={0} onClick={handleToggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggle() }}>
          <div className={`${styles.toggleTrack} ${autoTour ? styles.toggleTrackOn : ''}`}>
            <div className={`${styles.toggleThumb} ${autoTour ? styles.toggleThumbOn : ''}`} />
          </div>
          <span className={`${styles.toggleLabel} ${autoTour ? styles.toggleLabelOn : ''}`}>{t('collaboration.tour')}</span>
        </div>
      </Tooltip>
      
      {/* Botón CTA */}
      <div className={styles.cta}>
        <span className={styles.ctaText}>{t('collaboration.enter')}</span>
        <svg className={styles.ctaIcon} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        <div className={styles.ctaGlow} />
      </div>
      
    </div>
    </div>
  )
}
