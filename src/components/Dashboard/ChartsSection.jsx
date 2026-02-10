/**
 * Charts Section - Visualizaciones Interactivas con Recharts
 * ===========================================================
 * 
 * Dashboard de gráficos científicos para análisis del ecosistema quantum
 * 
 * Características:
 * - Gráfico 1: Top Organizaciones por número de repositorios
 * - Gráfico 2: Top Repositorios (filtrable por estrellas/usuarios/commits)
 * - Gráfico 3: Top Usuarios (por commits y followers)
 * - Integración total con Zustand store para filtrado cruzado
 * 
 * @module ChartsSection
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
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
  const valueRef = useRef(null)
  const [valueOverflows, setValueOverflows] = useState(false)

  useEffect(() => {
    // Limpiar timeout anterior
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (value && !prevValueRef.current) {
      setDisplayValue(value)
      setState('entering')
      timeoutRef.current = setTimeout(() => setState('visible'), 20)
    } else if (value && prevValueRef.current && value !== prevValueRef.current) {
      setState('changing')
      timeoutRef.current = setTimeout(() => {
        setDisplayValue(value)
        setState('visible')
      }, 150)
    } else if (!value && prevValueRef.current) {
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

  useEffect(() => {
    const el = valueRef.current
    if (!el) return
    const check = () => {
      const overflow = el.scrollWidth - el.clientWidth
      if (overflow > 2) {
        setValueOverflows(true)
        el.style.setProperty('--marquee-distance', `-${overflow + 8}px`)
      } else {
        setValueOverflows(false)
      }
    }
    const timer = setTimeout(check, 300)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { clearTimeout(timer); ro.disconnect() }
  }, [displayValue])

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
      <span className={styles.filterLabel}>✓ {label}:</span>
      <div ref={valueRef} className={`${styles.filterValueWrapper} ${valueOverflows ? styles.filterValueMarquee : ''}`}>
        <strong className={state === 'changing' ? styles.valueChanging : ''}>
          {displayValue}
        </strong>
      </div>
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
 */
export default function ChartsSection({ data }) {
  const { selectedOrg, selectedLanguage, selectedRepo, setFilter } = useDashboardStore()
  
  // Estados para métricas y hover
  const [repoMetric, setRepoMetric] = useState('stargazer_count')
  const [isMetricDropdownOpen, setIsMetricDropdownOpen] = useState(false)
  const metricDropdownRef = useRef(null)
  const [hoveredPieIndex, setHoveredPieIndex] = useState(null)
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null)
  
  // Animaciones de scroll
  const [orgChartRef, orgChartVisible] = useScrollAnimation(0.3)
  const [repoChartRef, repoChartVisible] = useScrollAnimation(0.3)
  const [userChartRef, userChartVisible] = useScrollAnimation(0.3)
  const [pieChartRef, pieChartVisible] = useScrollAnimation(0.3)

  // Refs para aplicar transiciones CSS inline a las barras SVG
  const orgBarContainerRef = useRef(null)
  const repoBarContainerRef = useRef(null)
  const pieContainerRef = useRef(null)

  // Control para animación de Recharts (solo animar la primera vez en scroll)
  const [hasAnimatedOrgBars, setHasAnimatedOrgBars] = useState(false)
  const [hasAnimatedPie, setHasAnimatedPie] = useState(false)
  
  useEffect(() => {
    if (orgChartVisible && !hasAnimatedOrgBars) {
      const timer = setTimeout(() => setHasAnimatedOrgBars(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [orgChartVisible, hasAnimatedOrgBars])

  useEffect(() => {
    if (pieChartVisible && !hasAnimatedPie) {
      const timer = setTimeout(() => setHasAnimatedPie(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [pieChartVisible, hasAnimatedPie])

  // Protección contra datos no disponibles
  const organizations = data?.organizations || []
  const repositories = data?.repositories || []
  const users = data?.users || []

  // Filtrar datos según selección actual
  const filteredRepos = useMemo(() => {
    let filtered = repositories

    if (selectedOrg) {
      filtered = filtered.filter(repo => 
        repo.owner?.login === selectedOrg ||
        repo.organization?.login === selectedOrg
      )
    }

    if (selectedLanguage) {
      filtered = filtered.filter(repo => 
        repo.primary_language?.name === selectedLanguage ||
        repo.language === selectedLanguage
      )
    }

    return filtered
  }, [repositories, selectedOrg, selectedLanguage])

  const filteredUsers = useMemo(() => {
    let filtered = users

    if (selectedOrg) {
      filtered = filtered.filter(user => 
        user.company === selectedOrg ||
        user.organizations?.includes(selectedOrg)
      )
    }

    return filtered
  }, [users, selectedOrg])

  // GRÁFICO 1: Top Organizaciones por número de repos
  const orgData = useMemo(() => {
    return organizations.map(org => {
      const orgRepos = repositories.filter(r => 
        r.owner?.login === org.login || r.organization?.login === org.login
      )
      return {
        name: org.login,
        repositories: orgRepos.length,
        stars: orgRepos.reduce((sum, r) => sum + (r.stargazer_count || 0), 0),
        isSelected: selectedOrg === org.login,
      }
    })
    .sort((a, b) => b.repositories - a.repositories)
    .slice(0, 10)
  }, [organizations, repositories, selectedOrg])

  // GRÁFICO 2: Top Repos (por métrica seleccionada)
  const repoData = useMemo(() => {
    const metricLabels = {
      stargazer_count: 'Estrellas',
      forks_count: 'Forks',
      contributors: 'Contribuidores',
    }

    return filteredRepos
      .map(repo => ({
        name: repo.name.length > 15 ? repo.name.slice(0, 15) + '...' : repo.name,
        fullName: repo.full_name,
        [metricLabels[repoMetric]]: repo[repoMetric] || 0,
        isSelected: selectedRepo === repo.full_name,
      }))
      .sort((a, b) => b[metricLabels[repoMetric]] - a[metricLabels[repoMetric]])
      .slice(0, 10)
  }, [filteredRepos, repoMetric, selectedRepo])

  // GRÁFICO 3: Top Usuarios por commits y followers
  const userData = useMemo(() => {
    return filteredUsers
      .map(user => ({
        name: user.login,
        commits: user.contributions_to_quantum || user.quantum_repos_count || 0,
        followers: user.followers || 0,
      }))
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 10)
  }, [filteredUsers])

  // GRÁFICO 4: Distribución de lenguajes
  const languageData = useMemo(() => {
    const languageCounts = {}
    repositories.forEach(repo => {
      const lang = repo.primary_language?.name || repo.language
      if (lang) {
        languageCounts[lang] = (languageCounts[lang] || 0) + 1
      }
    })

    return Object.entries(languageCounts)
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort((a, b) => b.value - a.value)
  }, [repositories])

  const CHART_COLORS = ['#00D4E4', '#9D6FDB', '#F97316', '#3B82F6', '#EC4899']

  // Verificar si hay algún sector/barra seleccionado
  const hasSelectedLanguage = selectedLanguage !== null
  const hasSelectedOrg = selectedOrg !== null

  // Aplicar estilos CSS inline a las barras de ORGANIZACIONES
  useEffect(() => {
    if (!orgBarContainerRef.current) return
    const raf = requestAnimationFrame(() => {
      const rects = orgBarContainerRef.current?.querySelectorAll('.recharts-bar-rectangle path')
      if (!rects) return
      rects.forEach((rect, index) => {
        const entry = orgData[index]
        if (!entry) return
        const fillColor = entry.isSelected ? '#22C55E' : '#00D4E4'
        const opacity = entry.isSelected ? 1 : 0.85
        rect.style.transition = 'fill 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s cubic-bezier(0.4,0,0.2,1), filter 0.4s ease'
        rect.style.fill = fillColor
        rect.style.opacity = opacity
        rect.style.filter = entry.isSelected ? 'brightness(1.1) drop-shadow(0 0 8px rgba(34, 197, 94, 0.5))' : 'none'
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [orgData])

  // Aplicar estilos CSS inline a las barras de REPOSITORIOS
  useEffect(() => {
    if (!repoBarContainerRef.current) return
    const raf = requestAnimationFrame(() => {
      const rects = repoBarContainerRef.current?.querySelectorAll('.recharts-bar-rectangle path')
      if (!rects) return
      rects.forEach((rect, index) => {
        const entry = repoData[index]
        if (!entry) return
        const fillColor = entry.isSelected ? '#22C55E' : '#9D6FDB'
        const opacity = entry.isSelected ? 1 : 0.85
        rect.style.transition = 'fill 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s cubic-bezier(0.4,0,0.2,1), filter 0.4s ease'
        rect.style.fill = fillColor
        rect.style.opacity = opacity
        rect.style.filter = entry.isSelected ? 'brightness(1.1) drop-shadow(0 0 8px rgba(34, 197, 94, 0.5))' : 'none'
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [repoData])

  // Aplicar estilos al PieChart via DOM
  // Clave: transition SOLO cuando cambia la selección, NO cuando cambia el hover
  const prevSelectedLangRef = useRef(selectedLanguage)

  useEffect(() => {
    if (!pieContainerRef.current) return

    const selectionChanged = selectedLanguage !== prevSelectedLangRef.current

    const raf = requestAnimationFrame(() => {
      const paths = pieContainerRef.current?.querySelectorAll('.recharts-pie-sector path')
      if (!paths?.length) return

      paths.forEach((path, index) => {
        const entry = languageData[index]
        if (!entry) return

        const isHovered = hoveredPieIndex === index
        const isSelected = selectedLanguage === entry.name
        const baseColor = CHART_COLORS[index % CHART_COLORS.length]

        let opacity = 0.85
        if (hasSelectedLanguage) {
          opacity = isSelected ? 1 : 0.35
        } else if (isHovered) {
          opacity = 1
        }

        const fillColor = isSelected ? '#22C55E' : baseColor
        const strokeColor = isSelected ? '#22C55E' : 'rgba(15, 20, 25, 0.6)'
        const strokeWidth = isSelected ? 2 : 1
        const cssFilter = isSelected
          ? 'brightness(1.15) drop-shadow(0 0 12px rgba(34, 197, 94, 0.8))'
          : isHovered && !hasSelectedLanguage
            ? 'brightness(1.2) drop-shadow(0 0 8px rgba(0, 212, 228, 0.5))'
            : 'none'

        // Transición SOLO si la selección cambió, instantáneo para hover
        path.style.transition = selectionChanged
          ? 'fill 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.45s cubic-bezier(0.4,0,0.2,1), stroke 0.45s cubic-bezier(0.4,0,0.2,1), stroke-width 0.35s ease, filter 0.45s ease'
          : 'none'

        path.style.fill = fillColor
        path.style.opacity = opacity
        path.style.stroke = strokeColor
        path.style.strokeWidth = strokeWidth
        path.style.filter = cssFilter
        path.style.cursor = 'pointer'
      })

      prevSelectedLangRef.current = selectedLanguage
    })

    return () => cancelAnimationFrame(raf)
  }, [languageData, hoveredPieIndex, hasSelectedLanguage, selectedLanguage])

  // Handlers
  const handleOrgClick = (data) => {
    if (data && data.name) setFilter('org', data.name)
  }

  const handleRepoClick = (data) => {
    if (data && data.fullName) setFilter('repo', data.fullName)
  }

  const handleLanguageClick = (entry, index) => {
    if (entry && entry.name) setFilter('language', entry.name)
  }

  // Custom tooltip — estilo medición cuántica
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className={styles.customTooltip}>
          <p className={styles.tooltipLabel}>
            <span className={styles.tooltipMeasure}>⊕</span> {label}
          </p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              ⟨{entry.name}| = <strong>{entry.value.toLocaleString()}</strong>
            </p>
          ))}
          <span className={styles.tooltipFooter}>medición colapsada</span>
        </div>
      )
    }
    return null
  }

  return (
    <section className={styles.chartsSection}>
      {/* GRÁFICO 1: Top Organizaciones */}
      <div 
        ref={orgChartRef}
        className={`${styles.chartCard} ${styles.scrollReveal} ${orgChartVisible ? styles.scrollRevealed : ''}`}
      >
        <div className={styles.titleRow}>
          <h3 className={styles.chartTitle}>📊 Top Organizaciones</h3>
          <FilterBadge 
            value={selectedOrg}
            label="Filtrando"
            onClear={() => setFilter('org', selectedOrg)}
          />
        </div>
        <p className={styles.chartSubtitle}>Por número de repositorios</p>
        {orgChartVisible ? (
          <div ref={orgBarContainerRef}>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={orgData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(75, 85, 99, 0.3)" vertical={false} />
              <XAxis dataKey="name" stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
              <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Bar 
                dataKey="repositories" 
                fill="#00D4E4"
                onClick={handleOrgClick}
                cursor="pointer"
                radius={[4, 4, 0, 0]}
                isAnimationActive={!hasAnimatedOrgBars}
                animationBegin={200}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
          </div>
        ) : null}
      </div>

      {/* GRÁFICO 2: Top Repositorios */}
      <div 
        ref={repoChartRef}
        className={`${styles.chartCard} ${styles.scrollReveal} ${repoChartVisible ? styles.scrollRevealed : ''}`}
      >
        <div className={styles.titleRow}>
          <h3 className={styles.chartTitle}>⭐ Top Repositorios</h3>
          <FilterBadge 
            value={selectedRepo}
            label="Repositorio"
            onClear={() => setFilter('repo', selectedRepo)}
          />
        </div>
        <div className={styles.subtitleRow}>
          <p className={styles.chartSubtitleInline}>Filtrado por</p>
          <div className={styles.metricDropdown} ref={metricDropdownRef}>
            <button
              className={styles.metricDropdownTrigger}
              onClick={() => setIsMetricDropdownOpen(prev => !prev)}
              onBlur={(e) => {
                if (!metricDropdownRef.current?.contains(e.relatedTarget)) {
                  setIsMetricDropdownOpen(false)
                }
              }}
            >
              <span className={styles.metricDropdownIcon}>
                {repoMetric === 'stargazer_count' && '⭐'}
                {repoMetric === 'forks_count' && '🔱'}
                {repoMetric === 'contributors' && '👥'}
              </span>
              <span>{repoMetric === 'stargazer_count' ? 'Estrellas' : repoMetric === 'forks_count' ? 'Forks' : 'Contribuidores'}</span>
              <ChevronDown size={14} className={`${styles.metricDropdownChevron} ${isMetricDropdownOpen ? styles.chevronOpen : ''}`} />
            </button>
            {isMetricDropdownOpen && (
              <div className={styles.metricDropdownMenu}>
                {[
                  { value: 'stargazer_count', label: 'Estrellas', icon: '⭐' },
                  { value: 'forks_count', label: 'Forks', icon: '🔱' },
                  { value: 'contributors', label: 'Contribuidores', icon: '👥' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`${styles.metricDropdownItem} ${repoMetric === opt.value ? styles.metricDropdownItemActive : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setRepoMetric(opt.value)
                      setIsMetricDropdownOpen(false)
                    }}
                  >
                    <span className={styles.metricDropdownItemIcon}>{opt.icon}</span>
                    <span>{opt.label}</span>
                    {repoMetric === opt.value && <span className={styles.metricDropdownCheck}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {repoChartVisible ? (
          <div ref={repoBarContainerRef}>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={repoData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(75, 85, 99, 0.3)" vertical={false} />
              <XAxis dataKey="name" stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
              <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Bar 
                dataKey={Object.keys(repoData[0] || {}).find(k => !['name', 'fullName', 'isSelected'].includes(k))}
                fill="#9D6FDB"
                onClick={handleRepoClick}
                cursor="pointer"
                radius={[4, 4, 0, 0]}
                isAnimationActive={true}
                animationBegin={0}
                animationDuration={600}
                animationEasing="ease-in-out"
              />
            </BarChart>
          </ResponsiveContainer>
          </div>
        ) : null}
      </div>

      {/* GRÁFICO 3: Top Usuarios */}
      <div 
        ref={userChartRef}
        className={`${styles.chartCard} ${styles.scrollReveal} ${userChartVisible ? styles.scrollRevealed : ''}`}
      >
        <h3 className={styles.chartTitle}>👥 Top Contribuidores</h3>
        <p className={styles.chartSubtitle}>Por commits y seguidores</p>
        {userChartVisible ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={userData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(75, 85, 99, 0.3)" vertical={false} />
              <XAxis dataKey="name" stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
              <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Legend />
              <Bar dataKey="commits" fill="#F97316" radius={[4, 4, 0, 0]} name="Commits"
                isAnimationActive={true} animationBegin={0} animationDuration={600} animationEasing="ease-in-out"
              />
              <Bar dataKey="followers" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Seguidores"
                isAnimationActive={true} animationBegin={0} animationDuration={600} animationEasing="ease-in-out"
              />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>

      {/* GRÁFICO 4: Distribución de Lenguajes */}
      <div 
        ref={pieChartRef}
        className={`${styles.chartCard} ${styles.scrollReveal} ${pieChartVisible ? styles.scrollRevealed : ''}`}
      >
        <div className={styles.titleRow}>
          <h3 className={styles.chartTitle}>🔬 Distribución de Lenguajes</h3>
          <FilterBadge 
            value={selectedLanguage}
            label="Filtrando"
            onClear={() => setFilter('language', selectedLanguage)}
          />
        </div>
        <p className={styles.chartSubtitle}>Haz click en un segmento para filtrar</p>
        {pieChartVisible ? (
        <div ref={pieContainerRef}>
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
              {languageData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                  stroke="rgba(15, 20, 25, 0.6)"
                  strokeWidth={1}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        </div>
        ) : (
          <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#6b7280' }}>Cargando gráfico...</span>
          </div>
        )}
      </div>
    </section>
  )
}
