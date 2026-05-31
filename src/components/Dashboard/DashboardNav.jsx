/**
 * DashboardNav - Menú de navegación lateral flotante
 * ====================================================
 * 
 * Dock minimalista que permite saltar entre secciones del dashboard.
 * Usa IntersectionObserver para detectar la sección activa.
 * 
 * Características:
 * - Dock flotante glassmorphism (lateral izquierdo)
 * - Iconos con tooltip al hover
 * - Indicador activo animado
 * - Scroll suave a la sección objetivo
 * - Extensible: para añadir secciones solo hay que agregar al array NAV_ITEMS
 * 
 * @module DashboardNav
 */

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, PieChart, Network, Gauge, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIdleTimer } from '../../hooks/useIdleTimer'
import { useDashboardStore } from '../../store/dashboardStore'
import styles from './DashboardNav.module.css'

/**
 * Configuración de secciones de navegación
 * Para añadir una nueva sección:
 * 1. Añadir un objeto aquí con id, label e icon
 * 2. Poner id={id} en la sección correspondiente de App.jsx
 */
const NAV_ITEMS = [
  { id: 'section-kpis',    labelKey: 'nav.kpis',    icon: Gauge,    scrollPadding: 200  },
  { id: 'section-charts',  labelKey: 'nav.charts',  icon: BarChart3, scrollPadding: -90  },
  { id: 'section-network', labelKey: 'nav.network', icon: Network,  scrollPadding: -107  },
]

export default function DashboardNav() {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState(null)
  const [isVisible, setIsVisible] = useState(false)
  const [hoveredItem, setHoveredItem] = useState(null)

  // Cinematic mode: tras 20 s sin actividad en el dashboard, ocultar el dock
  // de navegaciÃ³n lateral y avisar a otros componentes (p.ej. el FAB de IA)
  // mediante un atributo en <body>. Sólo se activa cuando el dashboard estÃ¡
  // realmente visible (el dock ya estÃ¡ visible por scroll), no estamos en el
  // Universo 3D (que tiene su propio cinematic mode), y no hay un panel
  // interactivo abierto en el dashboard (chat IA, panel admin, etc.).
  const isUniverseView = useDashboardStore(s => s.showCollaborationGraph)
  const [interactivePanelsOpen, setInteractivePanelsOpen] = useState(false)
  useEffect(() => {
    const check = () => {
      const chatEl = document.querySelector('[class*="chatWindow"]:not([class*="chatWindowClosing"])')
      const adminEl = document.querySelector('[class*="adminPanel"]:not([class*="adminPanelClosing"])')
      const popoverEl = document.querySelector('[class*="settingsDropdown"]:not([class*="settingsDropdownClosing"])')
      setInteractivePanelsOpen(!!(chatEl || adminEl || popoverEl))
    }
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  const { isIdle: cinematic } = useIdleTimer({
    timeoutMs: 20000,
    enabled: isVisible && !isUniverseView && !interactivePanelsOpen,
  })
  useEffect(() => {
    if (cinematic) {
      document.body.dataset.dashboardCinematic = 'true'
    } else {
      delete document.body.dataset.dashboardCinematic
    }
    return () => {
      delete document.body.dataset.dashboardCinematic
    }
  }, [cinematic])

  // Detectar sección activa y visibilidad del nav basándonos en scroll
  useEffect(() => {
    const getHeaderHeight = () => {
      const header = document.querySelector('header')
      return header ? header.getBoundingClientRect().height : 100
    }

    const handleScroll = () => {
      // Visibilidad del dock
      setIsVisible(window.scrollY > 200)

      // Detección de sección activa
      const headerH = getHeaderHeight()
      const threshold = headerH + 40 // punto de referencia bajo el header
      let active = null

      for (const item of NAV_ITEMS) {
        const el = document.getElementById(item.id)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        // La sección está activa si su parte superior ya pasó el umbral
        // y su parte inferior aún no ha salido del viewport
        if (rect.top <= threshold && rect.bottom > threshold) {
          active = item.id
        }
      }

      // Si ninguna coincide, elegir la más cercana por arriba del umbral
      if (!active) {
        let bestDist = Infinity
        for (const item of NAV_ITEMS) {
          const el = document.getElementById(item.id)
          if (!el) continue
          const rect = el.getBoundingClientRect()
          const dist = Math.abs(rect.top - threshold)
          if (rect.top <= threshold && dist < bestDist) {
            bestDist = dist
            active = item.id
          }
        }
      }

      if (active) setActiveSection(active)
    }

    // Verificar posición inicial
    const timer = setTimeout(handleScroll, 300)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const scrollToSection = useCallback((sectionId) => {
    const element = document.getElementById(sectionId)
    if (!element) return

    const navItem = NAV_ITEMS.find(item => item.id === sectionId)
    const padding = navItem?.scrollPadding ?? 20

    const header = document.querySelector('header')
    const headerH = header ? header.getBoundingClientRect().height : 100
    const elementTop = element.getBoundingClientRect().top + window.scrollY

    window.scrollTo({
      top: elementTop - headerH - padding,
      behavior: 'smooth',
    })
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <nav className={`${styles.dashboardNav} ${isVisible ? styles.navVisible : ''} ${cinematic ? styles.navCinematicHidden : ''}`}>
      <div className={styles.navTrack}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id

          return (
            <button
              key={item.id}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              onClick={() => scrollToSection(item.id)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              aria-label={t('nav.goTo', { section: t(item.labelKey) })}
              title=""
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={`${styles.navTooltip} ${hoveredItem === item.id ? styles.tooltipVisible : ''}`}>
                {t(item.labelKey)}
              </span>
              {isActive && <span className={styles.activeDot} />}
            </button>
          )
        })}

        <div className={styles.navDivider} />

        {/* Botón volver arriba */}
        <button
          className={styles.navItem}
          onClick={scrollToTop}
          onMouseEnter={() => setHoveredItem('top')}
          onMouseLeave={() => setHoveredItem(null)}
          aria-label={t('nav.backToTop')}
          title=""
        >
          <ChevronUp size={18} strokeWidth={1.8} />
          <span className={`${styles.navTooltip} ${hoveredItem === 'top' ? styles.tooltipVisible : ''}`}>
            {t('nav.backToTop')}
          </span>
        </button>
      </div>
    </nav>
  )
}
