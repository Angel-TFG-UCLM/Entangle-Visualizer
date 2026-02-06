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
import { BarChart3, PieChart, Network, Table2, Gauge, ChevronUp } from 'lucide-react'
import styles from './DashboardNav.module.css'

/**
 * Configuración de secciones de navegación
 * Para añadir una nueva sección:
 * 1. Añadir un objeto aquí con id, label e icon
 * 2. Poner id={id} en la sección correspondiente de App.jsx
 */
const NAV_ITEMS = [
  { id: 'section-kpis',    label: 'KPIs',                icon: Gauge,    scrollPadding: 200  },
  { id: 'section-charts',  label: 'Gráficos',            icon: BarChart3, scrollPadding: -90  },
  { id: 'section-network', label: 'Red de Colaboración',  icon: Network,  scrollPadding: -107  },
  { id: 'section-tables',  label: 'Tablas de Detalle',    icon: Table2,   scrollPadding: -107  },
]

export default function DashboardNav() {
  const [activeSection, setActiveSection] = useState(null)
  const [isVisible, setIsVisible] = useState(false)
  const [hoveredItem, setHoveredItem] = useState(null)

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
    <nav className={`${styles.dashboardNav} ${isVisible ? styles.navVisible : ''}`}>
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
              aria-label={`Ir a ${item.label}`}
              title=""
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={`${styles.navTooltip} ${hoveredItem === item.id ? styles.tooltipVisible : ''}`}>
                {item.label}
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
          aria-label="Volver arriba"
          title=""
        >
          <ChevronUp size={18} strokeWidth={1.8} />
          <span className={`${styles.navTooltip} ${hoveredItem === 'top' ? styles.tooltipVisible : ''}`}>
            Volver arriba
          </span>
        </button>
      </div>
    </nav>
  )
}
