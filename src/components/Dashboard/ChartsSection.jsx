/**
 * Charts Section - Visualizaciones Interactivas con Recharts
 * ===========================================================
 * 
 * Dashboard de gráficos científicos para análisis del ecosistema quantum
 * 
 * Características:
 * - Gráfico de barras: Repositorios por organización (onClick → filtra org)
 * - Gráfico circular: Distribución de lenguajes (onClick → filtra lenguaje)
 * - Estilo coherente con el diseño existente (cyan/purple)
 * - Integración total con Zustand store
 * 
 * Interactividad:
 * 1. Usuario hace click en barra "IBM" → setFilter('organization', 'IBM')
 * 2. Store actualiza → KPISection muestra solo repos de IBM
 * 3. Gráficos destacan el elemento seleccionado
 * 
 * @module ChartsSection
 */

import { useState, useEffect, useRef } from 'react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useDashboardStore } from '../../store/dashboardStore'
import styles from './ChartsSection.module.css'

// Paleta de colores del diseño Entangle
// NOTA: Verde (#22C55E) reservado SOLO para selección activa
const COLORS = {
  primary: '#00D4E4',   // Cyan
  secondary: '#9D6FDB', // Purple
  tertiary: '#F97316',  // Orange
  quaternary: '#3B82F6', // Blue
  quinary: '#EC4899',   // Pink
  selected: '#22C55E',  // Green - solo para selección
}

// Colores para gráficos (sin verde)
const CHART_COLORS = [
  COLORS.primary,
  COLORS.secondary,
  COLORS.tertiary,
  COLORS.quaternary,
  COLORS.quinary,
]

/**
 * Hook para animaciones de scroll con Intersection Observer
 * Devuelve [ref, isVisible] - cuando el elemento entra en el viewport, isVisible se vuelve true
 */
function useScrollAnimation(threshold = 0.3) {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(element) // Solo animar una vez
        }
      },
      { threshold, rootMargin: '0px' }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [threshold])

  return [ref, isVisible]
}

/**
 * Componente FilterBadge con animaciones de entrada/salida/cambio
 * Maneja su propio ciclo de vida para permitir animaciones de salida
 */
function FilterBadge({ value, onClear, label }) {
  const [state, setState] = useState('hidden') // 'hidden' | 'entering' | 'visible' | 'exiting' | 'changing'
  const [displayValue, setDisplayValue] = useState(value)
  const prevValueRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    // Limpiar timeout anterior
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (value && !prevValueRef.current) {
      // ENTRADA: No había filtro, ahora hay uno
      setDisplayValue(value)
      setState('entering')
      timeoutRef.current = setTimeout(() => setState('visible'), 20)
    } else if (value && prevValueRef.current && value !== prevValueRef.current) {
      // CAMBIO: Había un filtro, cambia a otro
      setState('changing')
      timeoutRef.current = setTimeout(() => {
        setDisplayValue(value)
        setState('visible')
      }, 150)
    } else if (!value && prevValueRef.current) {
      // SALIDA: Había un filtro, se quita
      setState('exiting')
      timeoutRef.current = setTimeout(() => {
        setState('hidden')
        setDisplayValue(null)
      }, 200)
    }

    prevValueRef.current = value

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [value])

  // No renderizar si está oculto
  if (state === 'hidden' && !value) return null

  const getClassName = () => {
    const classes = [styles.filterIndicator]
    if (state === 'visible' || state === 'changing') {
      classes.push(styles.filterVisible)
    }
    if (state === 'exiting') {
      classes.push(styles.filterExiting)
    }
    return classes.join(' ')
  }

  return (
    <div className={getClassName()}>
      <span>✓ {label}:</span>
      <strong className={state === 'changing' ? styles.valueChanging : ''}>
        {displayValue}
      </strong>
      <button 
        className={styles.clearButton}
        onClick={onClear}
        title="Quitar filtro"
      >
        ✕
      </button>
    </div>
  )
}

/**
 * Componente principal de gráficos
 * 
 * @param {Object} props
 * @param {Object} props.data - Datos del ecosistema { repositories, users, organizations }
 * @returns {JSX.Element}
 */
export default function ChartsSection({ data }) {
  const { selectedOrg, selectedLanguage, setFilter } = useDashboardStore()
  
  // Estado para hover en gráficos
  const [hoveredPieIndex, setHoveredPieIndex] = useState(null)
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null)

  // Animaciones de scroll para cada tarjeta (CSS fade-in)
  // Threshold alto para que no se dispare hasta que esté bien visible
  const [barChartRef, barChartVisible] = useScrollAnimation(0.3)
  const [pieChartRef, pieChartVisible] = useScrollAnimation(0.3)
  
  // Control para animación de Recharts
  // hasAnimatedBars/Pie: true después de la primera animación (para no re-animar)
  const [hasAnimatedBars, setHasAnimatedBars] = useState(false)
  const [hasAnimatedPie, setHasAnimatedPie] = useState(false)
  
  // Marcar como animado después de que termine
  useEffect(() => {
    if (barChartVisible && !hasAnimatedBars) {
      const timer = setTimeout(() => setHasAnimatedBars(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [barChartVisible, hasAnimatedBars])
  
  useEffect(() => {
    if (pieChartVisible && !hasAnimatedPie) {
      const timer = setTimeout(() => setHasAnimatedPie(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [pieChartVisible, hasAnimatedPie])

  // Protección contra datos no disponibles
  const organizations = data?.organizations || []
  const repositories = data?.repositories || []

  // Preparar datos para gráfico de organizaciones
  const orgData = organizations.map(org => {
    const orgRepos = repositories.filter(r => 
      r.owner?.login === org.login || r.organization?.login === org.login
    )
    const totalStars = orgRepos.reduce((sum, r) => sum + (r.stargazer_count || 0), 0)
    
    return {
      name: org.login,
      repositories: orgRepos.length,
      stars: totalStars,
      isSelected: selectedOrg === org.login,
    }
  }).sort((a, b) => b.repositories - a.repositories)

  // Preparar datos para gráfico de lenguajes
  const languageCounts = {}
  repositories.forEach(repo => {
    const lang = repo.primary_language?.name || repo.language
    if (lang) {
      languageCounts[lang] = (languageCounts[lang] || 0) + 1
    }
  })

  const languageData = Object.entries(languageCounts)
    .map(([name, value]) => ({
      name,
      value,
      isSelected: selectedLanguage === name,
    }))
    .sort((a, b) => b.value - a.value)

  // Handlers de click
  const handleOrgClick = (data) => {
    if (data && data.name) {
      setFilter('org', data.name)
    }
  }

  const handleLanguageClick = (entry, index) => {
    if (entry && entry.name) {
      setFilter('language', entry.name)
    }
  }

  // Verificar si hay algún sector seleccionado
  const hasSelectedLanguage = selectedLanguage !== null

  // Verificar si hay alguna barra seleccionada  
  const hasSelectedOrg = selectedOrg !== null

  // Custom tooltip para mostrar información adicional
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className={styles.customTooltip}>
          <p className={styles.tooltipLabel}>{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: <strong>{entry.value}</strong>
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <section className={styles.chartsSection}>
      {/* Gráfico de Barras: Repositorios por Organización */}
      <div 
        ref={barChartRef}
        className={`${styles.chartCard} ${styles.scrollReveal} ${barChartVisible ? styles.scrollRevealed : ''}`}
      >
        <FilterBadge 
          value={selectedOrg}
          label="Filtrando"
          onClear={() => setFilter('org', selectedOrg)}
        />
        <h3 className={styles.chartTitle}>
          📊 Repositorios por Organización
        </h3>
        <p className={styles.chartSubtitle}>
          Haz click en una barra para filtrar
        </p>
        {barChartVisible ? (
        <ResponsiveContainer width="100%" height={350}>
          <BarChart 
            data={orgData} 
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            style={{ backgroundColor: 'transparent' }}
          >
            <defs>
              <linearGradient id="barGradient1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00D4E4" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#00D4E4" stopOpacity={0.6}/>
              </linearGradient>
              <linearGradient id="barGradient2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9D6FDB" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#9D6FDB" stopOpacity={0.6}/>
              </linearGradient>
              <linearGradient id="barGradient3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22C55E" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#22C55E" stopOpacity={0.6}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(75, 85, 99, 0.3)" vertical={false} />
            <XAxis 
              dataKey="name" 
              stroke="#6b7280" 
              tick={{ fill: '#9ca3af', fontSize: 14 }}
              axisLine={{ stroke: 'rgba(75, 85, 99, 0.5)' }}
              tickLine={{ stroke: 'rgba(75, 85, 99, 0.5)' }}
            />
            <YAxis 
              stroke="#6b7280" 
              tick={{ fill: '#9ca3af', fontSize: 14 }}
              axisLine={{ stroke: 'rgba(75, 85, 99, 0.5)' }}
              tickLine={{ stroke: 'rgba(75, 85, 99, 0.5)' }}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar 
              dataKey="repositories" 
              name="Repositorios"
              fill={COLORS.primary}
              onClick={handleOrgClick}
              cursor="pointer"
              onMouseEnter={(_, index) => setHoveredBarIndex(index)}
              onMouseLeave={() => setHoveredBarIndex(null)}
              isAnimationActive={!hasAnimatedBars}
              animationBegin={200}
              animationDuration={800}
              animationEasing="ease-out"
              radius={[4, 4, 0, 0]}
            >
              {orgData.map((entry, index) => {
                const isHovered = hoveredBarIndex === index
                const isSelected = entry.isSelected
                const baseColor = CHART_COLORS[index % CHART_COLORS.length]
                
                // Determinar opacidad: si hay selección, atenuar los no seleccionados
                let opacity = 0.85
                if (hasSelectedOrg) {
                  opacity = isSelected ? 1 : 0.4
                } else if (isHovered) {
                  opacity = 1
                }
                
                return (
                  <Cell 
                    key={`cell-${index}`}
                    fill={isSelected ? COLORS.selected : baseColor}
                    opacity={opacity}
                    className={styles.barCell}
                    style={{
                      filter: isSelected ? 'brightness(1.1) drop-shadow(0 0 10px rgba(34, 197, 94, 0.7))' :
                              isHovered && !hasSelectedOrg ? 'brightness(1.15)' : 'none',
                      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                )
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        ) : (
          <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#6b7280' }}>Cargando gráfico...</span>
          </div>
        )}
      </div>

      {/* Gráfico Circular: Distribución de Lenguajes */}
      <div 
        ref={pieChartRef}
        className={`${styles.chartCard} ${styles.scrollReveal} ${pieChartVisible ? styles.scrollRevealed : ''}`}
      >
        <FilterBadge 
          value={selectedLanguage}
          label="Filtrando"
          onClear={() => setFilter('language', selectedLanguage)}
        />
        <h3 className={styles.chartTitle}>
          🔬 Distribución de Lenguajes
        </h3>
        <p className={styles.chartSubtitle}>
          Haz click en un segmento para filtrar
        </p>
        {pieChartVisible ? (
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={languageData}
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={35}
              dataKey="value"
              onClick={handleLanguageClick}
              onMouseEnter={(_, index) => setHoveredPieIndex(index)}
              onMouseLeave={() => setHoveredPieIndex(null)}
              cursor="pointer"
              isAnimationActive={!hasAnimatedPie}
              animationBegin={200}
              animationDuration={800}
              animationEasing="ease-out"
              label={({ name, value, cx, cy, midAngle, outerRadius }) => {
                const RADIAN = Math.PI / 180
                const radius = outerRadius + 25
                const x = cx + radius * Math.cos(-midAngle * RADIAN)
                const y = cy + radius * Math.sin(-midAngle * RADIAN)
                return (
                  <text
                    x={x}
                    y={y}
                    fill="#9ca3af"
                    textAnchor={x > cx ? 'start' : 'end'}
                    dominantBaseline="central"
                    style={{ fontSize: '12px', fontWeight: 500 }}
                  >
                    {`${name} (${value})`}
                  </text>
                )
              }}
              labelLine={{ stroke: 'rgba(156, 163, 175, 0.4)', strokeWidth: 1 }}
            >
              {languageData.map((entry, index) => {
                const isHovered = hoveredPieIndex === index
                const isSelected = entry.isSelected
                const baseColor = CHART_COLORS[index % CHART_COLORS.length]
                
                // Determinar opacidad: si hay selección, atenuar los no seleccionados
                let opacity = 0.85
                if (hasSelectedLanguage) {
                  opacity = isSelected ? 1 : 0.35
                } else if (isHovered) {
                  opacity = 1
                }
                
                return (
                  <Cell 
                    key={`cell-${index}`}
                    fill={isSelected ? COLORS.selected : baseColor}
                    opacity={opacity}
                    stroke={isSelected ? COLORS.selected : 'rgba(15, 20, 25, 0.6)'}
                    strokeWidth={isSelected ? 2 : 1}
                    className={styles.pieCell}
                    style={{ 
                      filter: isSelected ? 'brightness(1.15) drop-shadow(0 0 12px rgba(34, 197, 94, 0.8))' : 
                              isHovered && !hasSelectedLanguage ? 'brightness(1.2) drop-shadow(0 0 8px rgba(0, 212, 228, 0.5))' : 'none',
                      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                )
              })}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        ) : (
          <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#6b7280' }}>Cargando gráfico...</span>
          </div>
        )}
      </div>
    </section>
  )
}
