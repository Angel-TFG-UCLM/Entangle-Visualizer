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
  FiUsers, FiCode, FiEye, FiPackage, FiStar, FiGitBranch, FiUserCheck 
} from 'react-icons/fi'
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
  const { 
    selectedOrg, 
    selectedLanguage, 
    selectedRepo, 
    setFilter, 
    resetFilters,
    // Selección múltiple para análisis de colaboración
    selectedRepos,
    selectedOrgs,
    selectedUser,
    toggleRepoSelection,
    toggleOrgSelection,
    selectUserForAnalysis,
    collaborationMode
  } = useDashboardStore()
  
  // Estados para métricas y hover
  const [repoMetric, setRepoMetric] = useState('stargazer_count')
  const [isMetricDropdownOpen, setIsMetricDropdownOpen] = useState(false)
  const metricDropdownRef = useRef(null)
  const [hoveredPieIndex, setHoveredPieIndex] = useState(null)
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null)
  const [showOthersPanel, setShowOthersPanel] = useState(false) // Panel para "Otros" lenguajes
  
  // Estado para tipo de colaborador (solo aplica cuando hay repo seleccionado)
  const [collabType, setCollabType] = useState('all') // 'all', 'contributors', 'reviewers'
  const [includeBots, setIncludeBots] = useState(false) // Excluir bots por defecto
  const [isCollabDropdownOpen, setIsCollabDropdownOpen] = useState(false)
  const collabDropdownRef = useRef(null)
  const [isUpdatingUsers, setIsUpdatingUsers] = useState(false) // Estado de carga para colaboradores
  
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
  // NUEVA ARQUITECTURA: El backend ahora maneja el filtrado dinámico
  // Los datos en charts/tables ya vienen filtrados cuando hay filtros activos
  const charts = useDashboardStore(state => state.charts)
  const tables = useDashboardStore(state => state.tables)
  const isLoading = useDashboardStore(state => state.isLoading)
  const isFiltering = useDashboardStore(state => state.isFiltering)
  
  // Datos legacy como fallback - asegurar que siempre sean arrays
  const organizations = Array.isArray(data?.organizations) ? data.organizations : []
  const repositories = Array.isArray(data?.repositories) ? data.repositories : []
  const users = Array.isArray(data?.users) ? data.users : []

  // SIMPLIFICADO: Usar directamente datos del backend (ya filtrados si hay filtros activos)
  // No necesitamos combinar pools ni filtrar localmente
  const chartRepos = useMemo(() => {
    if (charts?.repositories) {
      if (Array.isArray(charts.repositories)) {
        return charts.repositories
      }
      // Combinar todas las métricas en un pool único
      const allRepos = new Map()
      const keys = ['byStars', 'byForks', 'byCollaborators']
      keys.forEach(key => {
        const list = charts.repositories[key] || []
        list.forEach(r => allRepos.set(r.full_name || r.id, r))
      })
      return Array.from(allRepos.values())
    }
    return repositories
  }, [charts?.repositories, repositories])

  const chartUsers = useMemo(() => {
    return Array.isArray(charts?.users) ? charts.users : users
  }, [charts?.users, users])

  // Obtener info del repo seleccionado para mostrar su lenguaje
  const selectedRepoInfo = useMemo(() => {
    if (!selectedRepo) return null
    // Buscar en todos los repos disponibles
    const allRepos = chartRepos
    const repo = allRepos.find(r => r.full_name === selectedRepo)
    if (repo) {
      return {
        name: repo.name || repo.full_name,
        language: repo.primary_language?.name || repo.primary_language || 'No especificado'
      }
    }
    return { name: selectedRepo.split('/')[1] || selectedRepo, language: 'No especificado' }
  }, [selectedRepo, chartRepos])

  // Ref para evitar doble carga inicial
  // Refs para controlar cuándo recargar
  const initialLoadRef = useRef(true)
  const prevCollabTypeRef = useRef(collabType)
  const prevIncludeBotsRef = useRef(includeBots)
  
  // Efecto para recargar colaboradores cuando cambia el tipo de colaborador o bots
  // SOLO se dispara cuando cambia collabType o includeBots, NO cuando cambian filtros globales
  useEffect(() => {
    // Skip en la carga inicial (los datos ya vienen del store)
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      prevCollabTypeRef.current = collabType
      prevIncludeBotsRef.current = includeBots
      return
    }
    
    // Solo recargar si realmente cambió collabType o includeBots
    const collabTypeChanged = prevCollabTypeRef.current !== collabType
    const includeBotsChanged = prevIncludeBotsRef.current !== includeBots
    
    if (!collabTypeChanged && !includeBotsChanged) {
      return
    }
    
    prevCollabTypeRef.current = collabType
    prevIncludeBotsRef.current = includeBots
    
    const loadFilteredCollaborators = async () => {
      setIsUpdatingUsers(true)
      try {
        const { getDashboardStats } = await import('../../services/api')
        const filters = {}
        
        // Solo añadir collabType si no es 'all'
        if (collabType !== 'all') {
          filters.collabType = collabType
        }
        
        // Añadir filtro de bots
        filters.includeBots = includeBots
        
        // Añadir filtros activos
        if (selectedRepo) filters.repo = selectedRepo
        if (selectedOrg) filters.org = selectedOrg
        if (selectedLanguage) filters.language = selectedLanguage
        
        const stats = await getDashboardStats(false, filters)
        
        // Actualizar solo los usuarios
        useDashboardStore.setState(state => ({
          charts: {
            ...state.charts,
            users: stats.charts?.users || []
          }
        }))
      } catch (error) {
        console.warn('Error cargando colaboradores filtrados:', error)
      } finally {
        setIsUpdatingUsers(false)
      }
    }
    
    loadFilteredCollaborators()
  }, [collabType, includeBots, selectedRepo, selectedOrg, selectedLanguage])

  // Reset collabType cuando se deselecciona el repo (sin disparar nueva llamada API)
  useEffect(() => {
    if (!selectedRepo && collabType !== 'all') {
      // Actualizar el ref primero para evitar que el efecto anterior dispare una llamada
      prevCollabTypeRef.current = 'all'
      setCollabType('all')
    }
  }, [selectedRepo, collabType])

  // GRÁFICO 1: Top Organizaciones por número de repos
  // Usa datos pre-calculados si están disponibles
  const orgData = useMemo(() => {
    // Si tenemos datos pre-calculados del backend, usarlos directamente
    if (charts?.organizations?.length > 0) {
      return charts.organizations.map(org => ({
        name: org.login,
        repositories: org.quantum_repositories_count || 0,
        stars: org.total_stars || 0,
        isSelected: selectedOrg === org.login,
      }))
    }
    
    // Fallback: calcular desde datos raw (solo con mockData o pocos datos)
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
  }, [charts?.organizations, organizations, repositories, selectedOrg])

  // GRÁFICO 2: Top Repos (por métrica seleccionada)
  const repoData = useMemo(() => {
    const metricLabels = {
      stargazer_count: 'Estrellas',
      fork_count: 'Forks',
      collaborators_count: 'Contribuidores',
    }
    
    // Mapeo de métrica a clave del backend
    const metricToKey = {
      stargazer_count: 'byStars',
      fork_count: 'byForks',
      collaborators_count: 'byCollaborators',
    }
    
    // SIMPLIFICADO: El backend ya devuelve datos filtrados
    // Solo elegimos la métrica correcta
    let sourceRepos = []
    
    if (charts?.repositories) {
      if (Array.isArray(charts.repositories)) {
        sourceRepos = charts.repositories
      } else {
        sourceRepos = charts.repositories[metricToKey[repoMetric]] || []
      }
    }
    
    // Fallback si no hay datos
    if (sourceRepos.length === 0) {
      sourceRepos = chartRepos
    }

    return sourceRepos
      .map(repo => ({
        name: (repo.name || '').length > 15 ? repo.name.slice(0, 15) + '...' : (repo.name || ''),
        fullName: repo.full_name,
        [metricLabels[repoMetric]]: repo[repoMetric] || 0,
        isSelected: selectedRepo === repo.full_name,
      }))
      .sort((a, b) => b[metricLabels[repoMetric]] - a[metricLabels[repoMetric]])
      .slice(0, 10)
  }, [charts?.repositories, chartRepos, repoMetric, selectedRepo])

  // GRÁFICO 3: Top Usuarios por score de colaboración (contribuciones × diversidad de repos)
  const userData = useMemo(() => {
    // SIMPLIFICADO: El backend ya devuelve datos filtrados
    const sourceUsers = Array.isArray(charts?.users) ? charts.users : chartUsers

    const usersWithScore = sourceUsers.map(user => {
      // Soportar múltiples formatos de campos (backend real vs mockData)
      const contributions = user.total_contributions || 
        user.contributions_to_quantum || // Campo de mockData
        (
          (user.total_commit_contributions || 0) +
          (user.total_pr_contributions || 0) +
          (user.total_pr_review_contributions || 0) +
          (user.total_issue_contributions || 0)
        )
      const repos = user.relevant_repos_count || user.quantum_repos_count || 0
      // Score: raíz cuadrada de (contribuciones × repos) para balancear ambas métricas
      // Multiplicamos repos por 100 para darle más peso a la diversidad
      const collaborationScore = Math.round(Math.sqrt(contributions * (repos * 100)))
      
      return {
        login: user.login, // Necesario para el click en análisis de colaboración
        name: user.name || user.login, // Mostrar nombre o login como fallback
        displayName: user.login, // Para el eje X
        score: collaborationScore,
        contributions,
        repos,
        isSelected: selectedUser === user.login, // Marcar si está seleccionado para análisis
      }
    })
    
    return usersWithScore
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  }, [charts?.users, chartUsers, selectedUser])

  // GRÁFICO 4: Distribución de lenguajes (Top 6 + "Otros")
  // Guardamos también los lenguajes que componen "Otros" para el tooltip
  const { languageData, othersLanguages } = useMemo(() => {
    let allLanguages = []
    
    // Si tenemos datos pre-calculados, usarlos directamente
    if (charts?.languageDistribution?.length > 0) {
      allLanguages = charts.languageDistribution
    } else {
      // Fallback: calcular desde datos raw
      const languageCounts = {}
      repositories.forEach(repo => {
        const lang = repo.primary_language?.name || repo.language
        if (lang) {
          languageCounts[lang] = (languageCounts[lang] || 0) + 1
        }
      })

      allLanguages = Object.entries(languageCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    }
    
    // Limitar a top 6 y agrupar el resto en "Otros"
    const TOP_N = 6
    if (allLanguages.length <= TOP_N) {
      return { languageData: allLanguages, othersLanguages: [] }
    }
    
    const topLanguages = allLanguages.slice(0, TOP_N)
    const others = allLanguages.slice(TOP_N)
    const othersValue = others.reduce((sum, lang) => sum + lang.value, 0)
    
    return {
      languageData: [
        ...topLanguages,
        { name: 'Otros', value: othersValue }
      ],
      othersLanguages: others // Guardamos para mostrar en tooltip
    }
  }, [charts?.languageDistribution, repositories])

  // Colores para PieChart: 6 colores principales + gris para "Otros"
  const PIE_COLORS = ['#00D4E4', '#9D6FDB', '#F97316', '#3B82F6', '#EC4899', '#22C55E', '#6B7280']
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
  // Click normal: filtro simple
  // Ctrl/Cmd + Click: selección múltiple para análisis de colaboración
  const handleOrgClick = (data, event) => {
    if (!data?.name) return
    
    // Ctrl/Cmd + Click = selección múltiple para análisis
    if (event?.ctrlKey || event?.metaKey) {
      toggleOrgSelection(data.name)
    } else {
      setFilter('org', data.name)
    }
  }

  const handleRepoClick = (data, event) => {
    if (!data?.fullName) return
    
    // Ctrl/Cmd + Click = selección múltiple para análisis
    if (event?.ctrlKey || event?.metaKey) {
      toggleRepoSelection(data.fullName)
    } else {
      setFilter('repo', data.fullName)
    }
  }

  // Click en usuario para ver su red de colaboración
  const handleUserClick = (data, event) => {
    if (!data?.login) return
    
    // Siempre abre el análisis de colaboración del usuario
    selectUserForAnalysis(data.login)
  }

  const handleLanguageClick = (entry, index) => {
    if (entry && entry.name) {
      if (entry.name === 'Otros') {
        setShowOthersPanel(true) // Abrir panel de lenguajes agrupados
      } else {
        setFilter('language', entry.name)
      }
    }
  }
  
  const handleOthersLanguageSelect = (langName) => {
    setFilter('language', langName)
    setShowOthersPanel(false)
  }

  // Custom tooltip - estilo medición cuántica
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
  
  // Tooltip especial para Colaboradores con información detallada
  const CollaboratorTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className={styles.customTooltip}>
          <p className={styles.tooltipLabel}>
            <span className={styles.tooltipMeasure}>👤</span> {data.name}
          </p>
          <div className={styles.tooltipStats}>
            <p><span style={{color: '#00D4E4'}}>Score:</span> <strong>{data.score.toLocaleString()}</strong></p>
            <p><span style={{color: '#9D6FDB'}}>Contribuciones:</span> <strong>{data.contributions.toLocaleString()}</strong></p>
            <p><span style={{color: '#F97316'}}>Repos:</span> <strong>{data.repos}</strong></p>
          </div>
          <span className={styles.tooltipFooter}>
            Score = √(contribuciones × repos × 100)
          </span>
        </div>
      )
    }
    return null
  }

  // Tooltip especial para PieChart que muestra detalle de "Otros"
  const PieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const entry = payload[0]
      const isOtros = entry.name === 'Otros'
      
      return (
        <div className={styles.customTooltip}>
          <p className={styles.tooltipLabel}>
            <span className={styles.tooltipMeasure}>⊕</span> {entry.name}
          </p>
          <p style={{ color: entry.payload.fill }}>
            ⟨repos| = <strong>{entry.value.toLocaleString()}</strong>
          </p>
          {isOtros && othersLanguages.length > 0 && (
            <div className={styles.tooltipOthers}>
              <p className={styles.tooltipOthersTitle}>Incluye:</p>
              <div className={styles.tooltipOthersList}>
                {othersLanguages.slice(0, 10).map((lang, i) => (
                  <span key={i} className={styles.tooltipOthersItem}>
                    {lang.name}: {lang.value}
                  </span>
                ))}
                {othersLanguages.length > 10 && (
                  <span className={styles.tooltipOthersMore}>
                    +{othersLanguages.length - 10} más...
                  </span>
                )}
              </div>
            </div>
          )}
          <span className={styles.tooltipFooter}>
            {isOtros ? `${othersLanguages.length} lenguajes agrupados` : 'click para filtrar'}
          </span>
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
        <div className={styles.chartContainer}>
          {isFiltering && (
            <div className={styles.chartLoadingOverlay}>
              <div className={styles.chartLoadingSpinner}></div>
              <span>Actualizando...</span>
            </div>
          )}
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
                  onClick={(data, index, event) => handleOrgClick(data, event)}
                  cursor="pointer"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={true}
                  animationBegin={hasAnimatedOrgBars ? 0 : 200}
                  animationDuration={hasAnimatedOrgBars ? 300 : 800}
                  animationEasing="ease-out"
                >
                  {orgData.map((entry, index) => (
                    <Cell 
                      key={`org-cell-${index}`} 
                      fill={selectedOrgs.includes(entry.name) ? '#9D6FDB' : (entry.isSelected ? '#22C55E' : '#00D4E4')}
                      style={{ 
                        transition: 'fill 0.3s ease',
                        filter: selectedOrgs.includes(entry.name) ? 'brightness(1.1) drop-shadow(0 0 6px rgba(157, 111, 219, 0.5))' : 'none'
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          ) : null}
          
          {/* Hint para análisis de colaboración */}
          <p className={styles.chartHint}>
            Ctrl+Click para seleccionar múltiples organizaciones y comparar
          </p>
        </div>
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
                {repoMetric === 'stargazer_count' && <FiStar size={14} />}
                {repoMetric === 'fork_count' && <FiGitBranch size={14} />}
                {repoMetric === 'collaborators_count' && <FiUserCheck size={14} />}
              </span>
              <span>{repoMetric === 'stargazer_count' ? 'Estrellas' : repoMetric === 'fork_count' ? 'Forks' : 'Contribuidores'}</span>
              <ChevronDown size={14} className={`${styles.metricDropdownChevron} ${isMetricDropdownOpen ? styles.chevronOpen : ''}`} />
            </button>
            {isMetricDropdownOpen && (
              <div className={styles.metricDropdownMenu}>
                {[
                  { value: 'stargazer_count', label: 'Estrellas', Icon: FiStar },
                  { value: 'fork_count', label: 'Forks', Icon: FiGitBranch },
                  { value: 'collaborators_count', label: 'Contribuidores', Icon: FiUserCheck },
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
                    <span className={styles.metricDropdownItemIcon}><opt.Icon size={14} /></span>
                    <span>{opt.label}</span>
                    {repoMetric === opt.value && <span className={styles.metricDropdownCheck}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={styles.chartContainer}>
          {isFiltering && (
            <div className={styles.chartLoadingOverlay}>
              <div className={styles.chartLoadingSpinner}></div>
              <span>Actualizando...</span>
            </div>
          )}
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
                  onClick={(data, index, event) => handleRepoClick(repoData[index], event)}
                  cursor="pointer"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={true}
                  animationBegin={0}
                  animationDuration={600}
                  animationEasing="ease-in-out"
                >
                  {repoData.map((entry, index) => (
                    <Cell 
                      key={`repo-cell-${index}`} 
                      fill={selectedRepos.includes(entry.fullName) ? '#00D4E4' : (entry.isSelected ? '#22C55E' : '#9D6FDB')}
                      style={{ 
                        transition: 'fill 0.3s ease',
                        filter: selectedRepos.includes(entry.fullName) ? 'brightness(1.1) drop-shadow(0 0 6px rgba(0, 212, 228, 0.5))' : 'none'
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          ) : null}
          
          {/* Hint para análisis de colaboración */}
          <p className={styles.chartHint}>
            Ctrl+Click para seleccionar múltiples repos y ver usuarios compartidos
          </p>
        </div>
      </div>

      {/* GRÁFICO 3: Top Usuarios */}
      <div 
        ref={userChartRef}
        className={`${styles.chartCard} ${styles.scrollReveal} ${userChartVisible ? styles.scrollRevealed : ''}`}
      >
        <div className={styles.titleRow}>
          <h3 className={styles.chartTitle}>
            <FiUsers className={styles.chartTitleIcon} /> Top Contribuidores
          </h3>
        </div>
        
        {/* Selector de tipo de colaborador - siempre visible */}
        <div className={styles.subtitleRow}>
          <p className={styles.chartSubtitleInline}>Mostrar</p>
          <div className={styles.metricDropdown} ref={collabDropdownRef}>
            <button
              className={styles.metricDropdownTrigger}
              onClick={() => setIsCollabDropdownOpen(prev => !prev)}
              onBlur={(e) => {
                if (!collabDropdownRef.current?.contains(e.relatedTarget)) {
                  setIsCollabDropdownOpen(false)
                }
              }}
            >
              <span className={styles.metricDropdownIcon}>
                {collabType === 'all' && <FiUsers size={14} />}
                {collabType === 'contributors' && <FiCode size={14} />}
                {collabType === 'reviewers' && <FiEye size={14} />}
              </span>
              <span>
                {collabType === 'all' && 'Todos'}
                {collabType === 'contributors' && 'Con commits'}
                {collabType === 'reviewers' && 'Reviewers'}
              </span>
              <ChevronDown size={14} className={`${styles.metricDropdownChevron} ${isCollabDropdownOpen ? styles.chevronOpen : ''}`} />
            </button>
            {isCollabDropdownOpen && (
              <div className={styles.metricDropdownMenu}>
                {[
                  { value: 'all', label: 'Todos', Icon: FiUsers, desc: 'Contributors + Reviewers' },
                  { value: 'contributors', label: 'Con commits', Icon: FiCode, desc: 'Han contribuido código' },
                  { value: 'reviewers', label: 'Reviewers', Icon: FiEye, desc: 'Solo revisan/triage' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`${styles.metricDropdownItem} ${collabType === opt.value ? styles.metricDropdownItemActive : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setCollabType(opt.value)
                      setIsCollabDropdownOpen(false)
                    }}
                    title={opt.desc}
                  >
                    <span className={styles.metricDropdownItemIcon}><opt.Icon size={14} /></span>
                    <span>{opt.label}</span>
                    {collabType === opt.value && <span className={styles.metricDropdownCheck}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Toggle para incluir bots */}
          <label className={`${styles.botToggle} ${includeBots ? styles.botToggleActive : ''}`} title="Incluir cuentas de bots como dependabot, github-actions, etc.">
            <input
              type="checkbox"
              checked={includeBots}
              onChange={(e) => setIncludeBots(e.target.checked)}
            />
            <span className={styles.botToggleSwitch}></span>
            <span className={styles.botToggleLabel}>Incluir bots</span>
          </label>
        </div>
        
        <div className={styles.chartContainer}>
          {/* Overlay de carga */}
          {(isUpdatingUsers || isFiltering) && (
            <div className={styles.chartLoadingOverlay}>
              <div className={styles.chartLoadingSpinner}></div>
              <span>Actualizando...</span>
            </div>
          )}
          
          {userChartVisible ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={userData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(75, 85, 99, 0.3)" vertical={false} />
                <XAxis dataKey="displayName" stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
                <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
                <Tooltip content={<CollaboratorTooltip />} cursor={false} />
                <Bar 
                  dataKey="score" 
                  radius={[4, 4, 0, 0]} 
                  name="Score Colaboración"
                  isAnimationActive={true} 
                  animationBegin={0} 
                  animationDuration={600} 
                  animationEasing="ease-in-out"
                  onClick={(data, index, event) => handleUserClick(userData[index], event)}
                  style={{ cursor: 'pointer' }}
                >
                  {userData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.isSelected ? '#22C55E' : '#00D4E4'}
                      style={{ 
                        transition: 'fill 0.3s ease',
                        filter: entry.isSelected ? 'brightness(1.1) drop-shadow(0 0 6px rgba(34, 197, 94, 0.5))' : 'none'
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : null}
          
          {/* Hint para análisis de colaboración */}
          <p className={styles.chartHint}>
            Click en un usuario para ver su red de colaboración
          </p>
        </div>
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
        
        {/* Si hay repo seleccionado, mostrar mensaje en vez del gráfico */}
        {selectedRepo ? (
          <div className={styles.repoLanguageMessage}>
            <div className={styles.repoLanguageIcon}>
              <FiPackage size={48} />
            </div>
            <p className={styles.repoLanguageText}>
              <strong>{selectedRepoInfo?.name}</strong> utiliza
            </p>
            <div className={styles.repoLanguageBadge}>
              {selectedRepoInfo?.language}
            </div>
            <p className={styles.repoLanguageHint}>
              Para ver la distribución completa de lenguajes, elimina el filtro de repositorio
            </p>
            <button 
              className={styles.repoLanguageButton}
              onClick={() => setFilter('repo', selectedRepo)}
            >
              Quitar filtro de repo
            </button>
          </div>
        ) : (
          <>
            <p className={styles.chartSubtitle}>Haz click en un segmento para filtrar</p>
            <div className={styles.chartContainer}>
              {isFiltering && (
                <div className={styles.chartLoadingOverlay}>
                  <div className={styles.chartLoadingSpinner}></div>
                  <span>Actualizando...</span>
                </div>
              )}
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
              animationBegin={0}
              animationDuration={800}
              animationEasing="ease-out"
              label={({ name, value, cx, cy, midAngle, outerRadius, index }) => {
                const RADIAN = Math.PI / 180
                const radius = outerRadius + 25
                const x = cx + radius * Math.cos(-midAngle * RADIAN)
                const y = cy + radius * Math.sin(-midAngle * RADIAN)
                return (
                  <text
                    key={`pie-label-${index}-${name}`}
                    x={x}
                    y={y}
                    fill="#9ca3af"
                    textAnchor={x > cx ? 'start' : 'end'}
                    dominantBaseline="central"
                    style={{ fontSize: '12px', fontWeight: 500, pointerEvents: 'none' }}
                  >
                    {`${name} (${value})`}
                  </text>
                )
              }}
              labelLine={{ stroke: 'rgba(156, 163, 175, 0.4)', strokeWidth: 1, pointerEvents: 'none' }}
            >
              {languageData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                  stroke="rgba(15, 20, 25, 0.6)"
                  strokeWidth={1}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        </div>
              ) : (
                <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#6b7280' }}>Cargando gráfico...</span>
                </div>
              )}
            </div>
        
        {/* Panel expandible para "Otros" lenguajes */}
        {showOthersPanel && othersLanguages.length > 0 && (
          <div className={styles.othersPanel}>
            <div className={styles.othersPanelHeader}>
              <h4 className={styles.othersPanelTitle}>🔬 Otros Lenguajes ({othersLanguages.length})</h4>
              <button 
                className={styles.othersPanelClose}
                onClick={() => setShowOthersPanel(false)}
                aria-label="Cerrar panel"
              >
                ✕
              </button>
            </div>
            <p className={styles.othersPanelSubtitle}>Click en un lenguaje para filtrar</p>
            <div className={styles.othersPanelGrid}>
              {othersLanguages.map((lang, index) => (
                <button
                  key={lang.name}
                  className={styles.othersPanelItem}
                  onClick={() => handleOthersLanguageSelect(lang.name)}
                >
                  <span className={styles.othersPanelLang}>{lang.name}</span>
                  <span className={styles.othersPanelCount}>{lang.value}</span>
                </button>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </section>
  )
}
