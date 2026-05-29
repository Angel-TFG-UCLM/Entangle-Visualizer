/**
 * Charts Section - Visualizaciones Interactivas con Recharts
 * ===========================================================
 * 
 * Dashboard de gráficos científicos para análisis del ecosistema quantum
 * 
 * Características:
 * - Gráfico 1: Top Organizaciones (filtrable por Quantum Focus/repos/estrellas/contribuidores)
 * - Gráfico 2: Top Repositorios (filtrable por estrellas/usuarios/commits)
 * - Gráfico 3: Top Usuarios (por commits y followers)
 * - Integración total con Zustand store para filtrado cruzado
 * 
 * @module ChartsSection
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { 
  FiUsers, FiCode, FiEye, FiPackage, FiStar, FiGitBranch, FiUserCheck, FiTarget 
} from 'react-icons/fi'
import { Building2, GitFork, User, ExternalLink, X, MapPin, Calendar, Globe, Shield, BookOpen, Tag, GitCommit, GitPullRequest, AlertCircle, Scale, Archive, Eye, Users, Code, Briefcase, Mail, Clock, Cpu, Zap, Bot, Network, ArrowRight } from 'lucide-react'
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
import useFavoritesStore from '../../store/favoritesStore'
import { useTranslation } from 'react-i18next'
import styles from './ChartsSection.module.css'

// Paleta de colores del diseño Entangle
// NOTA: Magenta (#FF3CAC) reservado SOLO para selección activa (filtro click)
const COLORS = {
  primary: '#00D4E4',   // Cyan
  secondary: '#9D6FDB', // Purple
  tertiary: '#F97316',  // Orange
  quaternary: '#3B82F6', // Blue
  quinary: '#EC4899',   // Pink
  selected: '#FF3CAC',  // Magenta - solo para selección
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
 * Tick customizado para ejes X con labels escalonados (alternando arriba/abajo)
 * Evita solapamiento sin rotar el texto a 45°
 */
function StaggeredTick({ x, y, payload, index, fill }) {
  const offset = index % 2 === 0 ? 0 : 18
  const name = payload?.value || ''
  const displayName = name.length > 16 ? name.slice(0, 14) + '…' : name
  return (
    <text
      x={x}
      y={y + 12 + offset}
      textAnchor="middle"
      fill={fill || '#9ca3af'}
      style={{ fontSize: '12px' }}
    >
      {displayName}
    </text>
  )
}

/**
 * Hook para animaciones de scroll con Intersection Observer
 * Devuelve [ref, isVisible] - cuando el elemento entra en el viewport, isVisible se vuelve true
 */
function useScrollAnimation(threshold = 0.3) {
  const [isVisible, setIsVisible] = useState(false)
  const observerRef = useRef(null)

  // Callback ref: se ejecuta cada vez que el elemento se monta/desmonta
  const ref = useCallback((node) => {
    // Limpiar observer anterior
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (!node || isVisible) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin: '0px' }
    )
    observer.observe(node)
    observerRef.current = observer
  }, [threshold, isVisible])

  return [ref, isVisible]
}

/**
 * Componente FilterBadge con animaciones de entrada/salida/cambio
 * Maneja su propio ciclo de vida para permitir animaciones de salida
 */
function FilterBadge({ value, onClear, label }) {
  const { t } = useTranslation()
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
        title={t('charts.removeFilter')}
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
  const { t } = useTranslation()
  const { 
    selectedOrg, 
    selectedLanguage, 
    selectedRepo, 
    selectedDiscipline,
    setFilter, 
    resetFilters,
    // Selección múltiple para análisis de colaboración
    selectedRepos,
    selectedOrgs,
    selectedUser,
    toggleRepoSelection,
    toggleOrgSelection,
    selectUserForAnalysis,
    collaborationMode,
    collaborationData,
    isAnalyzing,
    clearCollaborationSelections,
    analyzeCollaboration,
  } = useDashboardStore()
  
  // Estados para métricas y hover
  const [repoMetric, setRepoMetric] = useState('stargazer_count')
  const [isMetricDropdownOpen, setIsMetricDropdownOpen] = useState(false)
  const metricDropdownRef = useRef(null)
  const [orgMetric, setOrgMetric] = useState('quantum_focus_score')
  const [isOrgMetricDropdownOpen, setIsOrgMetricDropdownOpen] = useState(false)
  const orgMetricDropdownRef = useRef(null)
  const [userMetric, setUserMetric] = useState('score') // 'score' (colaboración) o 'repos' (multi-repo)
  const [isUserMetricDropdownOpen, setIsUserMetricDropdownOpen] = useState(false)
  const userMetricDropdownRef = useRef(null)
  const [hoveredPieIndex, setHoveredPieIndex] = useState(null)
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null)
  const [showOthersPanel, setShowOthersPanel] = useState(false) // Panel para "Otros" lenguajes
  const [otrosPopover, setOtrosPopover] = useState(null) // { x, y, items } - popover para disciplinas agrupadas en "Otros"
  
  // Estado para tipo de colaborador (solo aplica cuando hay repo seleccionado)
  const [collabType, setCollabType] = useState('all') // 'all', 'contributors', 'reviewers'
  const [includeBots, setIncludeBots] = useState(false) // Excluir bots por defecto
  const [isCollabDropdownOpen, setIsCollabDropdownOpen] = useState(false)
  const collabDropdownRef = useRef(null)
  const [isUpdatingUsers, setIsUpdatingUsers] = useState(false) // Estado de carga para colaboradores
  
  // Estado para panel de detalle de entidad (aparece al click en barra)
  const [detailEntity, setDetailEntity] = useState(null) // { type: 'org'|'repo'|'user', data: {...} }
  const [detailClosing, setDetailClosing] = useState(false)
  
  // Animaciones de scroll
  const [orgChartRef, orgChartVisible] = useScrollAnimation(0.3)
  const [repoChartRef, repoChartVisible] = useScrollAnimation(0.3)
  const [userChartRef, userChartVisible] = useScrollAnimation(0.3)
  const [pieChartRef, pieChartVisible] = useScrollAnimation(0.3)
  const [disciplineChartRef, disciplineChartVisible] = useScrollAnimation(0.3)

  // Refs para aplicar transiciones CSS inline a las barras SVG
  const orgBarContainerRef = useRef(null)
  const repoBarContainerRef = useRef(null)
  const pieContainerRef = useRef(null)

  // Control para animación de Recharts (solo animar la primera vez en scroll)
  const [hasAnimatedOrgBars, setHasAnimatedOrgBars] = useState(false)
  const [hasAnimatedPie, setHasAnimatedPie] = useState(false)
  const [hasAnimatedDisciplinePie, setHasAnimatedDisciplinePie] = useState(false)
  
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

  // Discipline pie: same one-shot animation guard as the language pie above.
  // Sin esto, los re-renders globales (p.ej. polling del badge de backend) re-
  // disparaban la animaciÃ³n de Recharts cada pocos segundos y los labels de
  // las disciplinas parpadeaban.
  useEffect(() => {
    if (disciplineChartVisible && !hasAnimatedDisciplinePie) {
      const timer = setTimeout(() => setHasAnimatedDisciplinePie(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [disciplineChartVisible, hasAnimatedDisciplinePie])

  // Cerrar popover de "Otros" al hacer click fuera o pulsar Escape
  useEffect(() => {
    if (!otrosPopover) return
    const handleClick = () => setOtrosPopover(null)
    const handleKey = (e) => { if (e.key === 'Escape') setOtrosPopover(null) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [otrosPopover])

  // Protección contra datos no disponibles
  // NUEVA ARQUITECTURA: El backend ahora maneja el filtrado dinámico
  // Los datos en charts/tables ya vienen filtrados cuando hay filtros activos
  const storeCharts = useDashboardStore(state => state.charts)
  const storeTables = useDashboardStore(state => state.tables)
  const isLoading = useDashboardStore(state => state.isLoading)
  const isFiltering = useDashboardStore(state => state.isFiltering)
  const networkMetrics = useDashboardStore(state => state.networkMetrics)
  const loadNetworkMetrics = useDashboardStore(state => state.loadNetworkMetrics)
  const isLoadingMetrics = useDashboardStore(state => state.isLoadingMetrics)
  const metricsError = useDashboardStore(state => state.metricsError)

  // Auto-load network metrics for discipline pie chart
  // Wait until main dashboard data has loaded (!isLoading), then trigger if needed.
  // Retry on error after a delay.
  useEffect(() => {
    if (isLoading || isLoadingMetrics || networkMetrics) return
    // If there was an error, retry after 5s
    if (metricsError) {
      const timer = setTimeout(() => loadNetworkMetrics(), 5000)
      return () => clearTimeout(timer)
    }
    // First load: small delay to let dashboard finish settling
    const timer = setTimeout(() => loadNetworkMetrics(), 800)
    return () => clearTimeout(timer)
  }, [isLoading, isLoadingMetrics, networkMetrics, metricsError, loadNetworkMetrics])

  // Vista activa: si hay una vista de favoritos, sus datos tienen prioridad
  const activeViewId = useFavoritesStore(s => s.activeViewId)
  const activeViewData = useFavoritesStore(s => s.activeViewData)
  const viewActive = activeViewId && activeViewData

  // Cuando hay vista activa + filtros, aplicar filtrado LOCAL sobre datos de la vista
  const viewFilteredCharts = useMemo(() => {
    if (!viewActive || (!selectedOrg && !selectedLanguage && !selectedRepo)) return null
    const src = activeViewData.charts || {}
    
    // Obtener repos como array (pueden venir como objeto o array)
    let allRepos = []
    if (Array.isArray(src.repositories)) {
      allRepos = src.repositories
    } else if (src.repositories) {
      const seen = new Map()
      ;['byStars', 'byForks', 'byCollaborators'].forEach(k => {
        ;(src.repositories[k] || []).forEach(r => {
          const key = r.full_name || r.name
          if (key && !seen.has(key)) seen.set(key, r)
        })
      })
      allRepos = Array.from(seen.values())
    }

    // Filtrar repos por org/language (NO por selectedRepo: el repo seleccionado solo se marca, igual que sin vista)
    let filteredRepos = allRepos
    if (selectedOrg) {
      filteredRepos = filteredRepos.filter(r =>
        (r.owner?.login || '') === selectedOrg ||
        (r.organization?.login || '') === selectedOrg
      )
    }
    if (selectedLanguage) {
      filteredRepos = filteredRepos.filter(r => {
        const lang = r.primary_language?.name || r.primary_language || r.language || ''
        return lang === selectedLanguage
      })
    }

    // Repos como objeto por métrica (re-sort de los filtrados)
    const reposByMetric = {
      byStars: [...filteredRepos].sort((a, b) => (b.stargazer_count || 0) - (a.stargazer_count || 0)).slice(0, 10),
      byForks: [...filteredRepos].sort((a, b) => (b.fork_count || 0) - (a.fork_count || 0)).slice(0, 10),
      byCollaborators: [...filteredRepos].sort((a, b) => (b.collaborators_count || 0) - (a.collaborators_count || 0)).slice(0, 10),
    }

    // Filtrar users
    let filteredUsers = Array.isArray(src.users) ? src.users : []
    if (selectedRepo) {
      // Cuando hay repo seleccionado, mostrar SOLO sus colaboradores (mismo comportamiento que sin vista)
      // Los repos de la vista traen el campo "collaborators" desde el backend
      const targetRepo = allRepos.find(r => (r.full_name || '') === selectedRepo)
      if (targetRepo && Array.isArray(targetRepo.collaborators)) {
        const collabLogins = new Set(targetRepo.collaborators.map(c => c.login || ''))
        filteredUsers = filteredUsers.filter(u => collabLogins.has(u.login))
      }
    }
    if (selectedOrg) {
      filteredUsers = filteredUsers.filter(u => {
        const orgs = u.organizations || []
        return orgs.some(o => (typeof o === 'string' ? o : (o?.login || '')) === selectedOrg)
      })
    }

    // Recalcular distribución de lenguajes desde repos filtrados
    const langCounts = {}
    filteredRepos.forEach(r => {
      const lang = r.primary_language?.name || r.primary_language || r.language || ''
      if (lang) langCounts[lang] = (langCounts[lang] || 0) + 1
    })
    const langDist = Object.entries(langCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    return {
      ...src,
      repositories: reposByMetric,
      users: filteredUsers,
      languageDistribution: langDist,
      // organizations se mantiene sin filtrar (el chart de orgs muestra cuál está seleccionada via isSelected)
    }
  }, [viewActive, activeViewData, selectedOrg, selectedLanguage, selectedRepo])

  const charts = viewActive 
    ? (viewFilteredCharts || activeViewData.charts || null) 
    : storeCharts
  const tables = viewActive ? (activeViewData.tables || null) : storeTables
  
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

  // Efecto para recargar colaboradores cuando cambia collabType o includeBots
  // También re-aplica filtros locales cuando cambian los filtros globales (org, language, repo)
  const isFirstRenderRef = useRef(true)
  const prevLocalFiltersRef = useRef({ collabType, includeBots })
  const prevGlobalFiltersRef = useRef({ selectedOrg, selectedLanguage, selectedRepo, selectedDiscipline })
  
  useEffect(() => {
    // Skip la primera ejecución: los datos iniciales ya los cargó loadFullData()
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      prevLocalFiltersRef.current = { collabType, includeBots }
      prevGlobalFiltersRef.current = { selectedOrg, selectedLanguage, selectedRepo, selectedDiscipline }
      return
    }
    
    // Detectar si cambiaron los filtros LOCALES (collabType o includeBots)
    const localChanged = prevLocalFiltersRef.current.collabType !== collabType ||
                          prevLocalFiltersRef.current.includeBots !== includeBots
    
    // Detectar si cambiaron los filtros GLOBALES (org, language, repo, discipline)
    const globalChanged = prevGlobalFiltersRef.current.selectedOrg !== selectedOrg ||
                          prevGlobalFiltersRef.current.selectedLanguage !== selectedLanguage ||
                          prevGlobalFiltersRef.current.selectedRepo !== selectedRepo ||
                          prevGlobalFiltersRef.current.selectedDiscipline !== selectedDiscipline
    
    prevLocalFiltersRef.current = { collabType, includeBots }
    prevGlobalFiltersRef.current = { selectedOrg, selectedLanguage, selectedRepo, selectedDiscipline }
    
    // Determinar si hay filtros locales activos (no-default)
    const hasActiveLocalFilters = collabType !== 'all' || includeBots
    
    // Disparar si:
    // 1. Cambiaron filtros locales, O
    // 2. Cambiaron filtros globales Y hay filtros locales activos
    //    (para re-aplicar collabType/includeBots con el nuevo org/language/repo)
    if (!localChanged && !(globalChanged && hasActiveLocalFilters)) return

    // Si hay vista activa, no llamar al backend (datos locales)
    if (viewActive) return
    
    let cancelled = false
    
    const loadFilteredCollaborators = async () => {
      setIsUpdatingUsers(true)
      try {
        const { getDashboardStats } = await import('../../services/api')
        const filters = {}
        
        // Añadir filtro de tipo de colaborador
        if (collabType !== 'all') {
          filters.collabType = collabType
        }
        
        // Añadir filtro de bots
        filters.includeBots = includeBots
        
        // Incluir filtros globales activos
        if (selectedRepo) filters.repo = selectedRepo
        if (selectedOrg) filters.org = selectedOrg
        if (selectedLanguage) filters.language = selectedLanguage
        if (selectedDiscipline) filters.discipline = selectedDiscipline
        
        console.log('🔄 Recargando contribuidores con filtros:', filters)
        const stats = await getDashboardStats(false, filters)
        
        if (!cancelled) {
          // Actualizar solo los usuarios en el store (soporta dict y array)
          useDashboardStore.setState(state => ({
            charts: {
              ...state.charts,
              users: stats.charts?.users || state.charts?.users || {}
            }
          }))
          const usersCount = Array.isArray(stats.charts?.users) 
            ? stats.charts.users.length 
            : (stats.charts?.users?.byContributions?.length || 0)
          console.log('✅ Contribuidores actualizados:', usersCount, 'usuarios')
        }
      } catch (error) {
        console.warn('Error cargando colaboradores filtrados:', error)
      } finally {
        if (!cancelled) setIsUpdatingUsers(false)
      }
    }
    
    loadFilteredCollaborators()
    
    return () => { cancelled = true }
  }, [collabType, includeBots, selectedRepo, selectedOrg, selectedLanguage, selectedDiscipline])

  // Reset collabType solo cuando el repo se deselecciona (transición de valor a null)
  const prevSelectedRepoRef = useRef(selectedRepo)
  useEffect(() => {
    const hadRepo = prevSelectedRepoRef.current
    prevSelectedRepoRef.current = selectedRepo
    if (hadRepo && !selectedRepo) {
      setCollabType('all')
      setIncludeBots(false)
    }
  }, [selectedRepo])

  // Auto-reset métricas de análisis cruzado cuando los datos están vacíos
  // Solo si NO hay un filtro activo (evitar que al hacer click en una barra se resetee la métrica)
  useEffect(() => {
    if (selectedOrg || selectedRepo || selectedLanguage) return
    if (!charts?.organizations || Array.isArray(charts.organizations)) return
    if (orgMetric === 'shared_users_count' && (!charts.organizations.bySharedUsers || charts.organizations.bySharedUsers.length === 0)) {
      setOrgMetric('quantum_focus_score')
    }
  }, [charts?.organizations, orgMetric, selectedOrg, selectedRepo, selectedLanguage])
  
  useEffect(() => {
    if (selectedOrg || selectedRepo || selectedLanguage) return
    if (!charts?.repositories || Array.isArray(charts.repositories)) return
    if (repoMetric === 'shared_collaborators_count' && (!charts.repositories.bySharedCollaborators || charts.repositories.bySharedCollaborators.length === 0)) {
      setRepoMetric('stargazer_count')
    }
  }, [charts?.repositories, repoMetric, selectedOrg, selectedRepo, selectedLanguage])

  // GRÁFICO 1: Top Organizaciones por número de repos
  // Usa datos pre-calculados si están disponibles
  // Métricas disponibles para organizaciones
  const orgMetricLabels = {
    quantum_focus_score: t('charts.metricQuantumFocus'),
    repositories: t('charts.metricReposQuantum'),
    stars: t('charts.metricStars'),
    total_unique_contributors: t('charts.metricContributors'),
    shared_users_count: t('charts.metricCollaborative'),
  }

  const orgData = useMemo(() => {
    let mapped = []
    
    // Mapeo de métrica a clave del backend
    const orgMetricToKey = {
      quantum_focus_score: 'byQuantumFocus',
      repositories: 'byRepos',
      stars: 'byStars',
      total_unique_contributors: 'byContributors',
      shared_users_count: 'bySharedUsers',
    }
    
    // El backend envía un objeto {byRepos, byStars, byQuantumFocus, byContributors}
    // o un array simple (fallback legacy)
    let sourceOrgs = []
    if (charts?.organizations) {
      if (Array.isArray(charts.organizations)) {
        sourceOrgs = charts.organizations
      } else {
        const orgKey = orgMetricToKey[orgMetric]
        sourceOrgs = charts.organizations[orgKey] || []
        // Solo fallback a byRepos si la métrica no es de análisis cruzado
        if (sourceOrgs.length === 0 && orgKey !== 'bySharedUsers') {
          sourceOrgs = charts.organizations.byRepos || []
        }
      }
    }
    
    if (sourceOrgs.length > 0) {
      mapped = sourceOrgs.map(org => ({
        name: org.login,
        displayName: org.name || org.login,
        repositories: org.quantum_repositories_count || org.public_repos || 0,
        stars: org.total_stars || 0,
        description: org.description || null,
        avatar_url: org.avatar_url || null,
        members_count: org.members_count || 0,
        quantum_focus_score: Math.round((org.quantum_focus_score || 0) * 10) / 10,
        location: org.location || null,
        is_verified: org.is_verified || false,
        created_at: org.created_at || null,
        website_url: org.website_url || null,
        twitter_username: org.twitter_username || null,
        email: org.email || null,
        quantum_contributors_count: org.quantum_contributors_count || 0,
        total_repositories_count: org.total_repositories_count || 0,
        total_members_count: org.total_members_count || 0,
        total_unique_contributors: org.total_unique_contributors || 0,
        shared_users_count: org.shared_users_count || 0,
        top_languages: org.top_languages || [],
        is_quantum_focused: org.is_quantum_focused || false,
        top_quantum_contributors: org.top_quantum_contributors || [],
        isSelected: selectedOrg === org.login,
      }))
    } else {
      // Fallback: calcular desde datos raw (solo con mockData o pocos datos)
      // No aplica para métricas de análisis cruzado (no tienen datos raw equivalentes)
      if (orgMetric === 'shared_users_count') {
        mapped = []
      } else {
      mapped = organizations.map(org => {
        const orgRepos = repositories.filter(r => 
          r.owner?.login === org.login || r.organization?.login === org.login
        )
        return {
          name: org.login,
          displayName: org.name || org.login,
          repositories: orgRepos.length,
          stars: orgRepos.reduce((sum, r) => sum + (r.stargazer_count || 0), 0),
          description: org.description || null,
          avatar_url: org.avatar_url || null,
          members_count: 0,
          quantum_focus_score: 0,
          location: org.location || null,
          is_verified: false,
          created_at: org.created_at || null,
          website_url: null,
          twitter_username: null,
          email: null,
          quantum_contributors_count: 0,
          total_repositories_count: 0,
          total_members_count: 0,
          total_unique_contributors: 0,
          top_languages: [],
          is_quantum_focused: false,
          top_quantum_contributors: [],
          isSelected: selectedOrg === org.login,
        }
      })
      }
    }

    // El backend ya envía top 10 ordenado por la métrica correcta,
    // pero mantenemos sort como safety (y para el fallback legacy/array)
    const sortKey = orgMetric
    return mapped
      .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
      .slice(0, 10)
  }, [charts?.organizations, organizations, repositories, selectedOrg, orgMetric])

  // GRÁFICO 2: Top Repos (por métrica seleccionada)
  const repoMetricLabels = {
    stargazer_count: t('charts.metricStars'),
    fork_count: 'Forks',
    collaborators_count: t('charts.metricContributors'),
    shared_collaborators_count: t('charts.metricCollaborative'),
  }
  const repoData = useMemo(() => {
    // Mapeo de métrica a clave del backend
    const metricToKey = {
      stargazer_count: 'byStars',
      fork_count: 'byForks',
      collaborators_count: 'byCollaborators',
      shared_collaborators_count: 'bySharedCollaborators',
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
    
    // Fallback si no hay datos (no aplicable para métricas de colaboración cruzada)
    if (sourceRepos.length === 0 && repoMetric !== 'shared_collaborators_count') {
      sourceRepos = chartRepos
    }

    return sourceRepos
      .map(repo => ({
        name: (repo.name || '').length > 15 ? repo.name.slice(0, 15) + '...' : (repo.name || ''),
        fullName: repo.full_name,
        rawName: repo.name || '',
        description: repo.description || null,
        language: repo.primary_language?.name || repo.primary_language || null,
        owner: repo.owner?.login || null,
        stargazer_count: (repo.stargazer_count ?? 0) || 0,
        fork_count: (repo.fork_count ?? 0) || 0,
        collaborators_count: (repo.collaborators_count ?? 0) || 0,
        shared_collaborators_count: (repo.shared_collaborators_count ?? 0) || 0,
        url: repo.url || null,
        homepage_url: repo.homepage_url || null,
        repository_topics: repo.repository_topics || [],
        created_at: repo.created_at || null,
        updated_at: repo.updated_at || null,
        pushed_at: repo.pushed_at || null,
        commits_count: repo.commits_count || 0,
        issues_count: repo.issues_count || 0,
        open_issues_count: repo.open_issues_count || 0,
        pull_requests_count: repo.pull_requests_count || 0,
        merged_pull_requests_count: repo.merged_pull_requests_count || 0,
        open_pull_requests_count: repo.open_pull_requests_count || 0,
        releases_count: repo.releases_count || 0,
        latest_release: repo.latest_release || null,
        license_info: repo.license_info || null,
        is_fork: repo.is_fork || false,
        is_archived: repo.is_archived || false,
        watchers_count: repo.watchers_count || 0,
        languages: repo.languages || [],
        default_branch: repo.default_branch_ref_name || 'main',
        isSelected: selectedRepo === repo.full_name,
      }))
      .sort((a, b) => (b[repoMetric] || 0) - (a[repoMetric] || 0))
      .slice(0, 10)
  }, [charts?.repositories, chartRepos, repoMetric, selectedRepo])

  // GRÁFICO 3: Top Usuarios por score de colaboración o por multi-repo
  const userMetricLabels = {
    score: t('charts.collaboration'),
    repos: t('charts.multiRepo'),
  }

  // Mapa login → discipline info (desde node_metrics) — debe ir ANTES de userData
  // Nota: node_metrics usa keys con prefijo "user_<login>", strip para usar login plano
  const disciplineMap = useMemo(() => {
    const nm = networkMetrics?.node_metrics
    if (!nm) return {}
    const map = {}
    for (const [nodeId, m] of Object.entries(nm)) {
      if (m.discipline) {
        // Strip "user_" prefix to match plain login used in charts.users
        const login = nodeId.startsWith('user_') ? nodeId.slice(5) : nodeId
        map[login] = {
          discipline: m.discipline,
          discipline_color: m.discipline_color,
          discipline_label: m.discipline_label,
          discipline_confidence: m.discipline_confidence,
          discipline_top_colors: m.discipline_top_colors || null,
        }
      }
    }
    return map
  }, [networkMetrics])

  // Helper: transformar un user raw del backend al formato de display para el chart
  const mapUserToDisplay = useCallback((user, metric, discMap, selUser) => {
    // contributionsCollection de GitHub solo cubre el último año.
    // Fallback: contributions_to_quantum_repos (all-time desde extracted_from)
    const githubContribs = (user.total_commit_contributions || 0) + (user.total_pr_contributions || 0) +
      (user.total_pr_review_contributions || 0) + (user.total_issue_contributions || 0)
    const contributions = user.total_contributions ||
      user.contributions_last_year ||
      user.contributions_to_quantum ||
      githubContribs ||
      user.contributions_to_quantum_repos ||
      0
    const repos = user.relevant_repos_count || user.quantum_repos_count || user.public_repos_count || 0
    // Usar collab_score del backend si existe (consistente con el sort), sino calcular en cliente
    const collaborationScore = user.collab_score || Math.round(Math.sqrt(contributions * (repos * 100)))
    return {
      login: user.login,
      name: user.name || user.login,
      displayName: user.login,
      avatar_url: user.avatar_url || null,
      score: metric === 'repos' ? repos : collaborationScore,
      contributions,
      repos,
      organizations: user.organizations || [],
      has_commits: user.has_commits ?? true,
      is_mentionable: user.is_mentionable ?? false,
      commits: user.total_commit_contributions || 0,
      prs: user.total_pr_contributions || 0,
      reviews: user.total_pr_review_contributions || 0,
      issues: user.total_issue_contributions || 0,
      contributions_to_quantum_repos: user.contributions_to_quantum_repos || 0,
      bio: user.bio || null,
      company: user.company || null,
      location: user.location || null,
      created_at: user.created_at || null,
      followers_count: user.followers_count || 0,
      following_count: user.following_count || 0,
      public_repos_count: user.public_repos_count || 0,
      top_languages: user.top_languages || [],
      quantum_expertise_score: user.quantum_expertise_score || 0,
      url: user.url || null,
      website_url: user.website_url || null,
      twitter_username: user.twitter_username || null,
      is_hireable: user.is_hireable || false,
      is_enriched: user.is_enriched ?? true,
      isSelected: selUser === user.login,
      ...(discMap[user.login] || {}),
    }
  }, [])

  // Mapa completo login → user raw data para lookups (bridge profiles, filtro por disciplina)
  const allUsersMap = useMemo(() => {
    let sourceUsers = []
    if (charts?.users) {
      if (Array.isArray(charts.users)) {
        sourceUsers = charts.users
      } else {
        // Combinar ambos arrays para tener todos los usuarios posibles
        const byContrib = charts.users.byContributions || []
        const byRepos = charts.users.byRepos || []
        const seen = new Set()
        sourceUsers = []
        for (const u of [...byContrib, ...byRepos]) {
          if (u.login && !seen.has(u.login)) {
            seen.add(u.login)
            sourceUsers.push(u)
          }
        }
      }
    }
    if (sourceUsers.length === 0) sourceUsers = chartUsers
    const map = {}
    for (const user of sourceUsers) {
      if (user.login) map[user.login] = user
    }
    return map
  }, [charts?.users, chartUsers])

  const userData = useMemo(() => {
    let sourceUsers = []

    // Usar datos del backend (ya filtrados por disciplina si el filtro está activo)
    if (charts?.users) {
      if (Array.isArray(charts.users)) {
        sourceUsers = charts.users
      } else {
        const userMetricToKey = { score: 'byContributions', repos: 'byRepos' }
        sourceUsers = charts.users[userMetricToKey[userMetric]] || charts.users.byContributions || []
      }
    }
    if (sourceUsers.length === 0) {
      sourceUsers = chartUsers
    }

    const usersWithScore = sourceUsers.map(user => mapUserToDisplay(user, userMetric, disciplineMap, selectedUser))

    return usersWithScore
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  }, [charts?.users, chartUsers, selectedUser, userMetric, disciplineMap, mapUserToDisplay])

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
        { name: t('charts.others'), value: othersValue, _isOthers: true }
      ],
      othersLanguages: others // Guardamos para mostrar en tooltip
    }
  }, [charts?.languageDistribution, repositories, t])

  // Colores para PieChart: 6 colores principales + gris para "Otros"
  const PIE_COLORS = ['#00D4E4', '#9D6FDB', '#F97316', '#3B82F6', '#EC4899', '#00ff9f', '#6B7280']
  const CHART_COLORS = ['#00D4E4', '#9D6FDB', '#F97316', '#3B82F6', '#EC4899']

  // ── GRÁFICO 5: Datos de disciplinas (desde network metrics) ──
  const DISCIPLINE_COLORS = {
    quantum_software: '#6c5ce7',
    quantum_physics: '#00b4d8',
    quantum_hardware: '#ff6b6b',
    classical_tooling: '#ffd166',
    education_research: '#00ff9f',
    multidisciplinary: '#e879f9',
  }
  const DISCIPLINE_LABELS = {
    quantum_software: t('charts.disciplines.quantumSoftware'),
    quantum_physics: t('charts.disciplines.quantumPhysics'),
    quantum_hardware: t('charts.disciplines.quantumHardware'),
    classical_tooling: t('charts.disciplines.classicalTooling'),
    education_research: t('charts.disciplines.education'),
    multidisciplinary: t('charts.disciplines.multidisciplinary'),
  }
  const DISCIPLINE_ICONS = {
    quantum_software: Code,
    quantum_physics: Zap,
    quantum_hardware: Cpu,
    classical_tooling: GitFork,
    education_research: BookOpen,
    multidisciplinary: Network,
  }
  const DISCIPLINE_DESCRIPTIONS = {
    quantum_software: t('charts.disciplineDesc.quantumSoftware'),
    quantum_physics: t('charts.disciplineDesc.quantumPhysics'),
    quantum_hardware: t('charts.disciplineDesc.quantumHardware'),
    classical_tooling: t('charts.disciplineDesc.classicalTooling'),
    education_research: t('charts.disciplineDesc.education'),
    multidisciplinary: t('charts.disciplineDesc.multidisciplinary'),
  }
  const DISCIPLINE_EMOJIS = {
    quantum_software: '💻',
    quantum_physics: '⚛️',
    quantum_hardware: '🔧',
    classical_tooling: '🛠️',
    education_research: '📚',
    multidisciplinary: '🌐',
  }
  // Disciplina: preferir datos filtrados del backend, fallback client-side, fallback global
  const disciplineAnalysis = useMemo(() => {
    // 1. Backend returned filtered discipline distribution
    if (charts?.disciplineDistribution?.distribution &&
        Object.keys(charts.disciplineDistribution.distribution).length > 0) {
      return charts.disciplineDistribution
    }

    // 2. Backend returned collaborator logins + frontend has networkMetrics → compute client-side
    const backendLogins = charts?.filteredCollaboratorLogins
    if (backendLogins?.length > 0 && networkMetrics?.node_metrics) {
      const loginsSet = new Set(backendLogins)
      const distribution = {}
      for (const [nodeId, metrics] of Object.entries(networkMetrics.node_metrics)) {
        if (nodeId.startsWith('user_')) {
          const login = nodeId.slice(5)
          if (loginsSet.has(login) && metrics.discipline) {
            distribution[metrics.discipline] = (distribution[metrics.discipline] || 0) + 1
          }
        }
      }
      const total = Object.values(distribution).reduce((s, v) => s + v, 0)
      if (total > 0) {
        const distribution_pct = {}
        for (const [k, v] of Object.entries(distribution)) {
          distribution_pct[k] = Math.round(v / total * 1000) / 10
        }
        return { distribution, distribution_pct, total_classified: total }
      }
    }

    // 3. Fallback to global networkMetrics
    return networkMetrics?.discipline_analysis
  }, [charts?.disciplineDistribution, charts?.filteredCollaboratorLogins, networkMetrics])

  const disciplinePieData = useMemo(() => {
    if (!disciplineAnalysis?.distribution) return []
    const all = Object.entries(disciplineAnalysis.distribution)
      .map(([key, count]) => ({
        name: DISCIPLINE_LABELS[key] || key,
        value: count,
        key,
        fill: DISCIPLINE_COLORS[key] || '#888',
        pct: disciplineAnalysis.distribution_pct?.[key] || 0,
      }))
      .sort((a, b) => b.value - a.value)

    // Agrupar sectores pequeños (<5%) en "Otros"
    const MIN_PCT = 5
    const main = []
    const others = []
    for (const d of all) {
      if (d.pct < MIN_PCT) {
        others.push(d)
      } else {
        main.push(d)
      }
    }
    if (others.length > 0) {
      const othersValue = others.reduce((s, d) => s + d.value, 0)
      const othersPct = others.reduce((s, d) => s + d.pct, 0)
      main.push({
        name: t('charts.others'),
        value: othersValue,
        key: '_others',
        fill: '#6B7280',
        pct: Math.round(othersPct * 10) / 10,
        _otherItems: others,
      })
    }
    return main
  }, [disciplineAnalysis, t])

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
        const fillColor = entry.isSelected ? '#FF3CAC' : '#00D4E4'
        const opacity = entry.isSelected ? 1 : 0.85
        rect.style.transition = 'fill 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s cubic-bezier(0.4,0,0.2,1), filter 0.4s ease'
        rect.style.fill = fillColor
        rect.style.opacity = opacity
        rect.style.filter = entry.isSelected ? 'brightness(1.1) drop-shadow(0 0 8px rgba(255, 60, 172, 0.5))' : 'none'
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
        const fillColor = entry.isSelected ? '#FF3CAC' : '#9D6FDB'
        const opacity = entry.isSelected ? 1 : 0.85
        rect.style.transition = 'fill 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s cubic-bezier(0.4,0,0.2,1), filter 0.4s ease'
        rect.style.fill = fillColor
        rect.style.opacity = opacity
        rect.style.filter = entry.isSelected ? 'brightness(1.1) drop-shadow(0 0 8px rgba(255, 60, 172, 0.5))' : 'none'
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
        const baseColor = PIE_COLORS[index] || PIE_COLORS[PIE_COLORS.length - 1]

        let opacity = 0.85
        if (hasSelectedLanguage) {
          opacity = isSelected ? 1 : 0.35
        } else if (isHovered) {
          opacity = 1
        }

        const fillColor = isSelected ? '#FF3CAC' : baseColor
        const strokeColor = isSelected ? '#FF3CAC' : 'rgba(15, 20, 25, 0.6)'
        const strokeWidth = isSelected ? 2 : 1
        const cssFilter = isSelected
          ? 'brightness(1.15) drop-shadow(0 0 12px rgba(255, 60, 172, 0.8))'
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

  // Ref para capturar el último evento nativo de click (Recharts no siempre pasa el event)
  const lastClickEventRef = useRef(null)
  useEffect(() => {
    const handler = (e) => { lastClickEventRef.current = e }
    window.addEventListener('click', handler, true) // capture phase
    return () => window.removeEventListener('click', handler, true)
  }, [])

  // Handlers
  // Click normal: abrir panel de detalle
  // Ctrl/Cmd + Click: selección múltiple / filtro
  const openEntityDetail = useCallback(async (type, data) => {
    setDetailClosing(false)
    // Si es un usuario con datos incompletos (no está en top 10), fetch del backend
    if (type === 'user' && data?.login && !data._fetched) {
      const hasFullData = (data.contributions > 0 || data.score > 0 || data.commits > 0 || data.followers_count > 0)
      if (!hasFullData) {
        try {
          const { getUserProfile } = await import('../../services/api')
          const profile = await getUserProfile(data.login)
          if (profile) {
            const merged = {
              ...data,
              ...profile,
              // Recalcular campos derivados
              contributions: profile.total_contributions || data.contributions || 0,
              repos: profile.relevant_repos_count || data.repos || 0,
              commits: profile.total_commit_contributions || 0,
              prs: profile.total_pr_contributions || 0,
              reviews: profile.total_pr_review_contributions || 0,
              issues: profile.total_issue_contributions || 0,
              contributions_to_quantum_repos: profile.contributions_to_quantum_repos || 0,
              is_enriched: profile.is_enriched ?? true,
              _fetched: true,
            }
            const contribs = merged.contributions
            const reps = merged.repos
            merged.score = Math.round(Math.sqrt(contribs * (reps * 100)))
            setDetailEntity({ type, data: merged })
            return
          }
        } catch {
          // Silenciar — se muestra con datos parciales
        }
      }
    }
    setDetailEntity({ type, data })
  }, [])

  const closeEntityDetail = useCallback(() => {
    setDetailClosing(true)
    setTimeout(() => {
      setDetailEntity(null)
      setDetailClosing(false)
    }, 250)
  }, [])

  // Helper: format date for detail panel
  const formatDetailDate = useCallback((dateStr) => {
    if (!dateStr) return null
    try {
      const d = new Date(dateStr)
      if (Number.isNaN(d.getTime())) return null
      return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { return null }
  }, [])

  // Helper: time ago for detail panel
  const timeAgo = useCallback((dateStr) => {
    if (!dateStr) return null
    try {
      const d = new Date(dateStr)
      if (Number.isNaN(d.getTime())) return null
      const diffMs = Date.now() - d.getTime()
      const days = Math.floor(diffMs / 86400000)
      if (days < 1) return 'hoy'
      if (days < 30) return `hace ${days}d`
      if (days < 365) return `hace ${Math.floor(days / 30)}m`
      return `hace ${Math.floor(days / 365)}a`
    } catch { return null }
  }, [])

  const handleOrgClick = (data, event) => {
    if (!data?.name) return
    const e = event || lastClickEventRef.current
    
    if (e?.ctrlKey || e?.metaKey) {
      // Ctrl/Cmd + Click = selección múltiple para análisis
      toggleOrgSelection(data.name)
    } else if (e?.shiftKey) {
      // Shift + Click = abrir panel de detalle
      openEntityDetail('org', data)
    } else {
      // Click normal = filtrar (comportamiento original)
      setFilter('org', data.name)
    }
  }

  const handleRepoClick = (data, event) => {
    if (!data?.fullName) return
    const e = event || lastClickEventRef.current
    
    if (e?.ctrlKey || e?.metaKey) {
      // Ctrl/Cmd + Click = selección múltiple para análisis
      toggleRepoSelection(data.fullName)
    } else if (e?.shiftKey) {
      // Shift + Click = abrir panel de detalle
      openEntityDetail('repo', data)
    } else {
      // Click normal = filtrar (comportamiento original)
      setFilter('repo', data.fullName)
    }
  }

  // Click en usuario
  const handleUserClick = (data, event) => {
    if (!data?.login) return
    const e = event || lastClickEventRef.current
    
    if (e?.ctrlKey || e?.metaKey) {
      // Ctrl+Click = ver red de colaboración del usuario
      selectUserForAnalysis(data.login)
    } else if (e?.shiftKey) {
      // Shift + Click = abrir panel de detalle
      openEntityDetail('user', data)
    } else {
      // Click normal = abrir panel de detalle (igual que shift)
      openEntityDetail('user', data)
    }
  }

  const handleLanguageClick = (entry, index) => {
    if (entry && entry.name) {
      if (entry._isOthers) {
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

  // Custom tooltip para Organizaciones - info rica
  const OrgTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className={styles.customTooltip}>
          <div className={styles.tooltipHeader}>
            {data.avatar_url && (
              <img src={data.avatar_url} alt="" className={styles.tooltipAvatar} />
            )}
            <div>
              <p className={styles.tooltipLabel}>{data.displayName || data.name}</p>
              {data.displayName !== data.name && (
                <span className={styles.tooltipHandle}>@{data.name}</span>
              )}
            </div>
          </div>
          {data.description && (
            <p className={styles.tooltipDesc}>
              {data.description.length > 80 ? data.description.slice(0, 80) + '...' : data.description}
            </p>
          )}
          <div className={styles.tooltipStats}>
            <p><span style={{color: '#FF3CAC'}}>{t('charts.quantumFocus')}:</span> <strong>{(data.quantum_focus_score || 0).toLocaleString()}%</strong></p>
            <p><span style={{color: '#00D4E4'}}>{t('charts.repositories')}:</span> <strong>{data.repositories.toLocaleString()}</strong></p>
            <p><span style={{color: '#F59E0B'}}>{t('charts.metricStars')}:</span> <strong>{data.stars.toLocaleString()}</strong></p>
            {data.total_unique_contributors > 0 && (
              <p><span style={{color: '#9D6FDB'}}>{t('charts.metricContributors')}:</span> <strong>{data.total_unique_contributors.toLocaleString()}</strong></p>
            )}
          </div>
          <span className={styles.tooltipFooter}>{t('charts.clickToFilter')}</span>
        </div>
      )
    }
    return null
  }

  // Custom tooltip para Repositorios - info rica
  const RepoTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className={styles.customTooltip}>
          <p className={styles.tooltipLabel}>{data.fullName || data.name}</p>
          {data.description && (
            <p className={styles.tooltipDesc}>
              {data.description.length > 80 ? data.description.slice(0, 80) + '...' : data.description}
            </p>
          )}
          {data.language && (
            <span className={styles.tooltipLangBadge}>{data.language}</span>
          )}
          <div className={styles.tooltipStats}>
            <p><span style={{color: '#F59E0B'}}>{t('charts.metricStars')}:</span> <strong>{data.stargazer_count.toLocaleString()}</strong></p>
            <p><span style={{color: '#9D6FDB'}}>{t('charts.forks')}:</span> <strong>{data.fork_count.toLocaleString()}</strong></p>
            <p><span style={{color: '#00D4E4'}}>{t('charts.metricContributors')}:</span> <strong>{data.collaborators_count.toLocaleString()}</strong></p>
          </div>
          {data.owner && (
            <p className={styles.tooltipOwner}>
              <span style={{color: '#6b7280'}}>{t('charts.orgLabel')}</span> {data.owner}
            </p>
          )}
          <span className={styles.tooltipFooter}>{t('charts.clickToFilter')}</span>
        </div>
      )
    }
    return null
  }
  
  // Tooltip especial para Colaboradores con información detallada
  const CollaboratorTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      // Formatear lista de orgs
      const orgsList = Array.isArray(data.organizations) 
        ? data.organizations.map(o => typeof o === 'string' ? o : o?.login).filter(Boolean)
        : []
      
      return (
        <div className={styles.customTooltip}>
          <div className={styles.tooltipHeader}>
            {data.avatar_url && (
              <img src={data.avatar_url} alt="" className={styles.tooltipAvatar} />
            )}
            <div>
              <p className={styles.tooltipLabel}>{data.name}</p>
              {data.name !== data.login && (
                <span className={styles.tooltipHandle}>@{data.login}</span>
              )}
            </div>
          </div>
          <div className={styles.tooltipStats}>
            <p><span style={{color: '#00D4E4'}}>{t('charts.scoreLabel')}</span> <strong>{data.score.toLocaleString()}</strong></p>
            <p><span style={{color: '#9D6FDB'}}>{t('charts.contributions')}:</span> <strong>{data.contributions.toLocaleString()}</strong></p>
            <p><span style={{color: '#F97316'}}>{t('charts.reposShort')}:</span> <strong>{data.repos}</strong></p>
          </div>
          {(data.commits > 0 || data.prs > 0 || data.reviews > 0) && (
            <div className={styles.tooltipBreakdown}>
              {data.commits > 0 && <span className={styles.tooltipBreakdownItem}>
                <span style={{color: '#22C55E'}}>{t('charts.commits')}</span> {data.commits.toLocaleString()}
              </span>}
              {data.prs > 0 && <span className={styles.tooltipBreakdownItem}>
                <span style={{color: '#3B82F6'}}>{t('charts.prs')}</span> {data.prs.toLocaleString()}
              </span>}
              {data.reviews > 0 && <span className={styles.tooltipBreakdownItem}>
                <span style={{color: '#F59E0B'}}>{t('charts.reviews')}</span> {data.reviews.toLocaleString()}
              </span>}
              {data.issues > 0 && <span className={styles.tooltipBreakdownItem}>
                <span style={{color: '#EF4444'}}>{t('charts.issues')}</span> {data.issues.toLocaleString()}
              </span>}
            </div>
          )}
          {orgsList.length > 0 && (
            <div className={styles.tooltipOrgsList}>
              <span className={styles.tooltipOrgsLabel}>{t('charts.organizations')}:</span>
              <div className={styles.tooltipOrgsChips}>
                {orgsList.slice(0, 4).map((o, i) => (
                  <span key={i} className={styles.tooltipOrgChip}>{o}</span>
                ))}
                {orgsList.length > 4 && (
                  <span className={styles.tooltipOrgChip}>+{orgsList.length - 4}</span>
                )}
              </div>
            </div>
          )}
          <span className={styles.tooltipFooter}>
            {t('charts.hintClickDetails')}
          </span>
        </div>
      )
    }
    return null
  }

  // Tooltip para el gráfico de disciplinas (mismo estilo que los demás)
  const DisciplineTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      const isOtros = d.key === '_others'
      return (
        <div className={styles.customTooltip}>
          <div className={styles.tooltipHeader}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: `${d.fill}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: d.fill }} />
            </div>
            <div>
              <p className={styles.tooltipLabel}>{d.name}</p>
            </div>
          </div>
          <div className={styles.tooltipStats}>
            <p><span style={{ color: d.fill }}>{t('charts.users')}:</span> <strong>{d.value.toLocaleString()}</strong></p>
            <p><span style={{ color: '#9ca3af' }}>{t('charts.percentage')}:</span> <strong>{d.pct.toFixed(1)}%</strong></p>
          </div>
          {isOtros && d._otherItems?.length > 0 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 4px' }}>{t('charts.includes')}:</p>
              {d._otherItems.map((item, i) => (
                <p key={i} style={{ fontSize: 11, margin: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.fill, flexShrink: 0 }} />
                  <span style={{ color: '#e5e7eb' }}>{item.name}:</span>
                  <strong style={{ color: item.fill }}>{item.value}</strong>
                  <span style={{ color: '#6b7280', fontSize: 10 }}>({item.pct.toFixed(1)}%)</span>
                </p>
              ))}
            </div>
          )}
          <span className={styles.tooltipFooter}>
            {isOtros
              ? t('charts.clickToViewDisciplines')
              : selectedDiscipline === d.key ? t('charts.clickToRemoveFilter') : t('charts.clickToFilterContributors')}
          </span>
        </div>
      )
    }
    return null
  }

  // Click en sector del pie de disciplinas → filtrar contribuidores via backend
  // Recharts pasa (entry, index, event) al onClick del Pie
  const handleDisciplineSliceClick = useCallback((entry, _index, event) => {
    // entry puede ser el objeto Recharts (con payload) o nuestro dato directo
    const key = entry?.key || entry?.payload?.key
    if (!key) return
    if (key === '_others') {
      // Mostrar popover interactivo con las disciplinas agrupadas
      const items = entry?._otherItems || entry?.payload?._otherItems || []
      if (items.length > 0 && event) {
        const rect = event.currentTarget?.closest?.('svg')?.getBoundingClientRect?.()
        const x = event.clientX - (rect?.left || 0)
        const y = event.clientY - (rect?.top || 0)
        setOtrosPopover(prev => prev ? null : { x, y, items })
      }
      return
    }
    setOtrosPopover(null)
    setFilter('discipline', key)
  }, [setFilter])

  // Tooltip especial para PieChart que muestra detalle de "Otros"
  const PieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const entry = payload[0]
      const isOtros = entry.payload?._isOthers === true
      
      return (
        <div className={styles.customTooltip}>
          <p className={styles.tooltipLabel}>
            <span className={styles.tooltipMeasure}>⊕</span> {entry.name}
          </p>
          <p style={{ color: entry.payload.fill }}>
            ⟨{t('charts.reposShort')}| = <strong>{entry.value.toLocaleString()}</strong>
          </p>
          {isOtros && othersLanguages.length > 0 && (
            <div className={styles.tooltipOthers}>
              <p className={styles.tooltipOthersTitle}>{t('charts.includes')}:</p>
              <div className={styles.tooltipOthersList}>
                {othersLanguages.slice(0, 10).map((lang, i) => (
                  <span key={i} className={styles.tooltipOthersItem}>
                    {lang.name}: {lang.value}
                  </span>
                ))}
                {othersLanguages.length > 10 && (
                  <span className={styles.tooltipOthersMore}>
                    +{othersLanguages.length - 10} {t('charts.more')}...
                  </span>
                )}
              </div>
            </div>
          )}
          <span className={styles.tooltipFooter}>
            {isOtros ? t('charts.languagesGrouped', { count: othersLanguages.length }) : t('charts.clickFilter')}
          </span>
        </div>
      )
    }
    return null
  }

  // Estado de cierre animado para el panel de comparación
  const [comparisonClosing, setComparisonClosing] = useState(false)
  const [floatingClosing, setFloatingClosing] = useState(false)
  const [excludeBotsComparison, setExcludeBotsComparison] = useState(true)
  const showComparisonResults = (collaborationData && !isAnalyzing) || isAnalyzing

  // Cierre animado del indicador flotante
  const dismissFloating = useCallback(() => {
    setFloatingClosing(true)
    setTimeout(() => {
      clearCollaborationSelections()
      setFloatingClosing(false)
    }, 350)
  }, [clearCollaborationSelections])

  // Animación de salida del flotante al abrir el modal
  const prevShowResults = useRef(false)
  useEffect(() => {
    if (showComparisonResults && !prevShowResults.current) {
      setFloatingClosing(true)
      const t = setTimeout(() => setFloatingClosing(false), 350)
      return () => clearTimeout(t)
    }
    prevShowResults.current = showComparisonResults
  }, [showComparisonResults])

  // Filtrado de bots en resultados de colaboración
  const isBotLogin = useCallback((login) => {
    if (!login) return false
    const low = login.toLowerCase()
    if (low.endsWith('[bot]')) return true
    const botPatterns = ['dependabot', 'github-actions', 'renovate', 'codecov', 'mergify', 'greenkeeper', 'snyk-bot', 'imgbot', 'stale', 'allcontributors']
    return botPatterns.some(p => low.includes(p))
  }, [])

  const filteredSharedUsers = useMemo(() => {
    if (!collaborationData?.shared_users) return []
    if (!excludeBotsComparison) return collaborationData.shared_users
    return collaborationData.shared_users.filter(u => !isBotLogin(u.login))
  }, [collaborationData, excludeBotsComparison, isBotLogin])

  const filteredMetrics = useMemo(() => {
    if (!collaborationData?.metrics) return collaborationData?.metrics || {}
    // En modo user_focus, las métricas son diferentes (total_repos, total_co_collaborators, total_organizations)
    if (collaborationData.mode === 'user_focus') {
      if (!excludeBotsComparison) return collaborationData.metrics
      const botCount = (collaborationData.shared_users || []).filter(u => isBotLogin(u.login)).length
      return {
        ...collaborationData.metrics,
        total_co_collaborators: (collaborationData.metrics.total_co_collaborators ?? 0) - botCount
      }
    }
    if (!excludeBotsComparison) return collaborationData.metrics
    const botCount = (collaborationData.shared_users || []).filter(u => isBotLogin(u.login)).length
    return {
      ...collaborationData.metrics,
      shared_users_count: (collaborationData.metrics.shared_users_count ?? 0) - botCount,
      collaboration_density: collaborationData.metrics.total_unique_users > 0
        ? Math.round(((collaborationData.metrics.shared_users_count ?? 0) - botCount) / collaborationData.metrics.total_unique_users * 100)
        : 0
    }
  }, [collaborationData, excludeBotsComparison, isBotLogin])
  
  const closeComparison = useCallback(() => {
    setComparisonClosing(true)
    setTimeout(() => {
      // En modo user_focus, limpiar también selectedUser
      const isUserMode = useDashboardStore.getState().collaborationData?.mode === 'user_focus'
      useDashboardStore.setState({
        collaborationData: null,
        isAnalyzing: false,
        ...(isUserMode ? { selectedUser: null, collaborationMode: null } : {})
      }, false, 'closeComparisonModal')
      setComparisonClosing(false)
    }, 250)
  }, [])

  // Escape para cerrar panel de comparación
  useEffect(() => {
    if (!showComparisonResults) return
    const handleKey = (e) => { if (e.key === 'Escape') closeComparison() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showComparisonResults, closeComparison])

  // Bloquear scroll del dashboard cuando el panel de comparación está abierto
  useEffect(() => {
    if (showComparisonResults) {
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
    } else {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
  }, [showComparisonResults])

  return (
    <section className={styles.chartsSection}>
      {/* ═══ Indicador flotante de selección (Ctrl+Click) ═══ */}
      {((selectedOrgs.length > 0 || selectedRepos.length > 0) && !showComparisonResults || floatingClosing) && (
        <div className={`${styles.comparisonFloatingIndicator} ${floatingClosing ? styles.comparisonFloatingClosing : ''}`}>
          <Zap size={14} className={styles.comparisonFloatingIcon} />
          <div className={styles.comparisonFloatingChips}>
            {selectedOrgs.map(org => (
              <span key={org} className={styles.comparisonFloatingChip} role="button" tabIndex={0} onClick={() => toggleOrgSelection(org)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleOrgSelection(org) }}>
                {org} <X size={10} />
              </span>
            ))}
            {selectedRepos.map(repo => (
              <span key={repo} className={styles.comparisonFloatingChip} role="button" tabIndex={0} onClick={() => toggleRepoSelection(repo)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleRepoSelection(repo) }}>
                {repo.split('/')[1] || repo} <X size={10} />
              </span>
            ))}
          </div>
          {(selectedOrgs.length < 2 && selectedRepos.length < 2) ? (
            <span className={styles.comparisonFloatingHint}>
              {selectedOrgs.length > 0 ? t('charts.comparisonHintOrg') : t('charts.comparisonHintRepo')}
            </span>
          ) : (
            <button
              className={styles.comparisonFloatingAnalyzeBtn}
              onClick={analyzeCollaboration}
            >
              <Users size={13} /> {t('charts.analyze')}
            </button>
          )}
          <button className={styles.comparisonFloatingClose} onClick={dismissFloating}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ═══ Overlay modal de resultados de colaboración ═══ */}
      {(showComparisonResults && !comparisonClosing) || comparisonClosing ? (
        <div
          className={`${styles.comparisonOverlay} ${comparisonClosing ? styles.comparisonOverlayClosing : ''}`}
          role="button"
          tabIndex={0}
          onClick={(e) => { if (e.target === e.currentTarget) closeComparison() }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeComparison() }}
        >
          <div className={`${styles.comparisonPanel} ${comparisonClosing ? styles.comparisonPanelClosing : ''}`}>
            {isAnalyzing ? (
              <div className={styles.comparisonLoading}>
                <div className={styles.chartLoadingSpinner}></div>
                <span>{t('charts.analyzing')}</span>
              </div>
            ) : collaborationData ? (
              <>
                <div className={styles.comparisonHeader}>
                  <div className={styles.comparisonHeaderLeft}>
                    {collaborationData.mode === 'user_focus' ? (
                      <Network size={18} className={styles.comparisonHeaderIcon} />
                    ) : (
                      <Users size={18} className={styles.comparisonHeaderIcon} />
                    )}
                    <div>
                      <h3 className={styles.comparisonTitle}>
                        {collaborationData.mode === 'user_focus'
                          ? t('charts.collabNetwork')
                          : collaborationData.mode === 'repos_comparison' 
                            ? t('charts.sharedUsersBetweenRepos') 
                            : t('charts.sharedUsersBetweenOrgs')}
                      </h3>
                      <p className={styles.comparisonSubtitle}>
                        {collaborationData.mode === 'user_focus'
                          ? `@${collaborationData.selections?.[0] || selectedUser}`
                          : collaborationData.selections?.join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className={styles.comparisonHeaderActions}>
                    <span className={styles.comparisonEscHint}>ESC</span>
                    <button className={styles.comparisonCloseBtn} onClick={closeComparison}>
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Chips de selección + Toggle de bots */}
                <div className={styles.comparisonToolbar}>
                  <div className={styles.comparisonChips}>
                    {collaborationData.mode === 'user_focus' ? (
                      <span className={`${styles.comparisonChip} ${styles.comparisonChipUser}`} role="button" tabIndex={0} onClick={closeComparison} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeComparison() }}>
                        <User size={11} /> @{collaborationData.selections?.[0] || selectedUser} <X size={11} />
                      </span>
                    ) : (
                      <>
                        {selectedOrgs.map(org => (
                          <span key={org} className={styles.comparisonChip} role="button" tabIndex={0} onClick={() => toggleOrgSelection(org)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleOrgSelection(org) }}>
                            <Building2 size={11} /> {org} <X size={11} />
                          </span>
                        ))}
                        {selectedRepos.map(repo => (
                          <span key={repo} className={styles.comparisonChip} role="button" tabIndex={0} onClick={() => toggleRepoSelection(repo)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleRepoSelection(repo) }}>
                            <BookOpen size={11} /> {repo.split('/')[1] || repo} <X size={11} />
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                  <label className={`${styles.comparisonBotToggle} ${!excludeBotsComparison ? styles.comparisonBotToggleActive : ''}`}>
                    <Bot size={13} className={styles.comparisonBotIcon} />
                    <span className={styles.comparisonBotLabel}>{excludeBotsComparison ? t('charts.withoutBots') : t('charts.withBots')}</span>
                    <button
                      className={`${styles.comparisonBotSwitch} ${!excludeBotsComparison ? styles.comparisonBotSwitchOn : ''}`}
                      onClick={() => setExcludeBotsComparison(v => !v)}
                      aria-label={excludeBotsComparison ? t('charts.includeBots') : t('charts.excludeBots')}
                    >
                      <span className={styles.comparisonBotSwitchThumb} />
                    </button>
                  </label>
                </div>

                {/* Métricas rápidas — adaptadas según el modo */}
                <div className={styles.comparisonMetrics}>
                  {collaborationData.mode === 'user_focus' ? (
                    <>
                      <div className={styles.comparisonMetric}>
                        <span className={styles.comparisonMetricValue} style={{ color: '#9D6FDB' }}>
                          {filteredMetrics.total_repos ?? 0}
                        </span>
                        <span className={styles.comparisonMetricLabel}>{t('charts.compRepos')}</span>
                      </div>
                      <div className={styles.comparisonMetric}>
                        <span className={styles.comparisonMetricValue} style={{ color: '#00D4E4' }}>
                          {filteredMetrics.total_co_collaborators ?? 0}
                        </span>
                        <span className={styles.comparisonMetricLabel}>{t('charts.compCoCollaborators')}</span>
                      </div>
                      <div className={styles.comparisonMetric}>
                        <span className={styles.comparisonMetricValue} style={{ color: '#F97316' }}>
                          {filteredMetrics.total_organizations ?? 0}
                        </span>
                        <span className={styles.comparisonMetricLabel}>{t('charts.compOrganizations')}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={styles.comparisonMetric}>
                        <span className={styles.comparisonMetricValue}>
                          {filteredMetrics.total_unique_users ?? 0}
                        </span>
                        <span className={styles.comparisonMetricLabel}>{t('charts.compUniqueUsers')}</span>
                      </div>
                      <div className={styles.comparisonMetric}>
                        <span className={styles.comparisonMetricValue} style={{ color: '#9D6FDB' }}>
                          {filteredMetrics.shared_users_count ?? 0}
                        </span>
                        <span className={styles.comparisonMetricLabel}>{t('charts.compInCommon')}</span>
                      </div>
                      <div className={styles.comparisonMetric}>
                        <span className={styles.comparisonMetricValue} style={{ color: '#00D4E4' }}>
                          {filteredMetrics.collaboration_density ?? 0}%
                        </span>
                        <span className={styles.comparisonMetricLabel}>{t('charts.compDensity')}</span>
                      </div>
                      <div className={styles.comparisonMetric}>
                        <span className={styles.comparisonMetricValue}>
                          {collaborationData.mode === 'repos_comparison'
                            ? filteredMetrics.total_repos_analyzed ?? 0
                            : filteredMetrics.total_orgs_analyzed ?? 0}
                        </span>
                        <span className={styles.comparisonMetricLabel}>
                          {collaborationData.mode === 'repos_comparison' ? t('charts.compRepos') : t('charts.compOrganizations')}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Lista de co-colaboradores (user_focus) o usuarios compartidos (repos/orgs) */}
                {filteredSharedUsers.length > 0 ? (
                  <div className={styles.comparisonUsers}>
                    <h4 className={styles.comparisonUsersTitle}>
                      {collaborationData.mode === 'user_focus' ? (
                        <><Network size={14} /> {t('charts.topCoCollaborators')} ({filteredSharedUsers.length}{(filteredMetrics.total_co_collaborators ?? 0) > filteredSharedUsers.length ? ` ${t('charts.of')} ${filteredMetrics.total_co_collaborators}` : ''})</>
                      ) : (
                        <><FiUsers size={14} /> {t('charts.usersInCommon')} ({filteredSharedUsers.length})
                          <span className={styles.comparisonSharedHint}>
                            {t('charts.contributeToN', { n: 2, type: collaborationData.mode === 'repos_comparison' ? 'repos' : 'orgs' })}
                          </span>
                        </>
                      )}
                      {excludeBotsComparison && collaborationData.shared_users?.length !== filteredSharedUsers.length && (
                        <span className={styles.comparisonBotFilteredHint}>
                          ({collaborationData.shared_users.length - filteredSharedUsers.length} {t('charts.botsHidden')})
                        </span>
                      )}
                    </h4>
                    <div className={styles.comparisonUsersList}>
                      {filteredSharedUsers.map((user, i) => (
                        <div
                          key={user.login}
                          className={`${styles.comparisonUserCard} ${collaborationData.mode === 'user_focus' ? styles.comparisonUserCardFocus : ''}`}
                          role="button"
                          tabIndex={0}
                          style={{ animationDelay: `${i * 40}ms` }}
                          onClick={() => { closeComparison(); setTimeout(() => selectUserForAnalysis(user.login), 280) }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { closeComparison(); setTimeout(() => selectUserForAnalysis(user.login), 280) } }}
                          title={t('charts.viewCollabNetwork', { user: user.login })}
                        >
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" className={styles.comparisonUserAvatar} />
                          ) : (
                            <div className={styles.comparisonUserAvatarPlaceholder}>
                              <User size={14} />
                            </div>
                          )}
                          <div className={styles.comparisonUserInfo}>
                            <span className={styles.comparisonUserName}>
                              {user.name || user.login}
                            </span>
                            {user.name && user.name !== user.login && (
                              <span className={styles.comparisonUserLogin}>@{user.login}</span>
                            )}
                          </div>
                          <div className={styles.comparisonUserMeta}>
                            {collaborationData.mode === 'user_focus' ? (
                              <>
                                <span className={styles.comparisonUserShared}>
                                  {user.shared_repos?.length ?? user.shared_count ?? 0} {t('charts.reposShort')}
                                </span>
                                {user.total_shared_contributions > 0 && (
                                  <span className={styles.comparisonUserContribs}>
                                    <GitCommit size={10} /> {user.total_shared_contributions.toLocaleString()}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className={styles.comparisonUserShared}>
                                {t('charts.inNofTotal', { count: user.shared_count, total: collaborationData.mode === 'repos_comparison'
                                  ? (filteredMetrics.total_repos_analyzed ?? '?')
                                  : (filteredMetrics.total_orgs_analyzed ?? '?'), type: collaborationData.mode === 'repos_comparison' ? 'repos' : 'orgs' })}
                              </span>
                            )}
                            {user.quantum_expertise_score > 0 && (
                              <span className={styles.comparisonUserScore}>
                                <Zap size={10} /> {user.quantum_expertise_score}
                              </span>
                            )}
                          </div>
                          {/* En user_focus, mostrar repos compartidos como tags */}
                          {collaborationData.mode === 'user_focus' && user.shared_repos?.length > 0 && (
                            <div className={styles.comparisonUserRepos}>
                              {user.shared_repos.slice(0, 3).map(r => (
                                <span key={r.full_name || r.name} className={styles.comparisonUserRepoTag}>
                                  <BookOpen size={9} /> {r.name}
                                </span>
                              ))}
                              {user.shared_repos.length > 3 && (
                                <span className={styles.comparisonUserRepoMore}>
                                  +{user.shared_repos.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={styles.comparisonEmpty}>
                    <FiUsers size={32} />
                    <p>{collaborationData.mode === 'user_focus'
                      ? t('charts.noCoCollaborators')
                      : t('charts.noSharedUsers')}
                    </p>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* GRÁFICO 1: Top Organizaciones */}
      <div 
        ref={orgChartRef}
        className={`${styles.chartCard} ${styles.scrollReveal} ${orgChartVisible ? styles.scrollRevealed : ''}`}
      >
        <div className={styles.titleRow}>
          <h3 className={styles.chartTitle}>📊 {t('charts.chart1')}</h3>
          <FilterBadge 
            value={selectedOrg}
            label={t('charts.filtering')}
            onClear={() => setFilter('org', selectedOrg)}
          />
        </div>
        <div className={styles.subtitleRow}>
          <p className={styles.chartSubtitleInline}>{t('charts.sortedBy')}</p>
          <div className={styles.metricDropdown} ref={orgMetricDropdownRef}>
            <button
              className={styles.metricDropdownTrigger}
              onClick={() => setIsOrgMetricDropdownOpen(prev => !prev)}
              onBlur={(e) => {
                if (!orgMetricDropdownRef.current?.contains(e.relatedTarget)) {
                  setIsOrgMetricDropdownOpen(false)
                }
              }}
            >
              <span className={styles.metricDropdownIcon}>
                {orgMetric === 'quantum_focus_score' && <FiTarget size={14} />}
                {orgMetric === 'repositories' && <FiPackage size={14} />}
                {orgMetric === 'stars' && <FiStar size={14} />}
                {orgMetric === 'total_unique_contributors' && <FiUsers size={14} />}
                {orgMetric === 'shared_users_count' && <Network size={14} />}
              </span>
              <span>{orgMetricLabels[orgMetric]}</span>
              <ChevronDown size={14} className={`${styles.metricDropdownChevron} ${isOrgMetricDropdownOpen ? styles.chevronOpen : ''}`} />
            </button>
              <div className={`${styles.metricDropdownMenu} ${!isOrgMetricDropdownOpen ? styles.metricDropdownMenuHidden : ''}`}>
                {[
                  { value: 'quantum_focus_score', label: t('charts.metricQuantumFocus'), Icon: FiTarget },
                  { value: 'repositories', label: t('charts.metricReposQuantum'), Icon: FiPackage },
                  { value: 'stars', label: t('charts.metricStars'), Icon: FiStar },
                  { value: 'total_unique_contributors', label: t('charts.metricContributors'), Icon: FiUsers },
                  { value: 'shared_users_count', label: t('charts.metricCollaborative'), Icon: Network },
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`${styles.metricDropdownItem} ${orgMetric === opt.value ? styles.metricDropdownItemActive : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setOrgMetric(opt.value)
                      setIsOrgMetricDropdownOpen(false)
                    }}
                  >
                    <span className={styles.metricDropdownItemIcon}><opt.Icon size={14} /></span>
                    <span>{opt.label}</span>
                    {orgMetric === opt.value && <span className={styles.metricDropdownCheck}>✓</span>}
                  </button>
                ))}
              </div>
          </div>
        </div>
        <div className={styles.chartContainer}>
          {isFiltering && (
            <div className={styles.chartLoadingOverlay}>
              <div className={styles.chartLoadingSpinner}></div>
              <span>{t('charts.updating')}</span>
            </div>
          )}
          {orgChartVisible ? (
            <div ref={orgBarContainerRef}>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={orgData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(75, 85, 99, 0.3)" vertical={false} />
                <XAxis dataKey="name" stroke="#6b7280" tick={<StaggeredTick />} interval={0} />
                <YAxis 
                  stroke="#6b7280" 
                  tick={{ fill: '#9ca3af' }} 
                  domain={[0, 'dataMax']}
                  tickFormatter={orgMetric === 'quantum_focus_score' ? (v) => `${v}%` : undefined}
                />
                <Tooltip content={<OrgTooltip />} cursor={false} />
                <Bar 
                  dataKey={orgMetric} 
                  fill="#00D4E4"
                  onClick={(data, index, event) => handleOrgClick(data, event)}
                  cursor="pointer"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={true}
                  animationBegin={0}
                  animationDuration={600}
                  animationEasing="ease-in-out"
                >
                  {orgData.map((entry, index) => (
                    <Cell 
                      key={`org-cell-${index}`} 
                      fill={selectedOrgs.includes(entry.name) ? '#9D6FDB' : (entry.isSelected ? '#FF3CAC' : '#00D4E4')}
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
          
          {/* Hint de interacciones */}
          <p className={styles.chartHint}>
            <span><span className={styles.kbdKey}>Click</span> {t('charts.hintFilter')}</span>
            <span>·</span>
            <span><span className={styles.kbdKey}>Shift</span>+<span className={styles.kbdKey}>Click</span> {t('charts.hintDetails')}</span>
            <span>·</span>
            <span><span className={styles.kbdKey}>Ctrl</span>+<span className={styles.kbdKey}>Click</span> {t('charts.hintCompare')}</span>
          </p>
        </div>
      </div>

      {/* GRÁFICO 2: Top Repositorios */}
      <div 
        ref={repoChartRef}
        className={`${styles.chartCard} ${styles.scrollReveal} ${repoChartVisible ? styles.scrollRevealed : ''}`}
      >
        <div className={styles.titleRow}>
          <h3 className={styles.chartTitle}>⭐ {t('charts.chart2')}</h3>
          <FilterBadge 
            value={selectedRepo}
            label={t('charts.repository')}
            onClear={() => setFilter('repo', selectedRepo)}
          />
        </div>
        <div className={styles.subtitleRow}>
          <p className={styles.chartSubtitleInline}>{t('charts.filteredBy')}</p>
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
                {repoMetric === 'shared_collaborators_count' && <Network size={14} />}
              </span>
              <span>{repoMetricLabels[repoMetric]}</span>
              <ChevronDown size={14} className={`${styles.metricDropdownChevron} ${isMetricDropdownOpen ? styles.chevronOpen : ''}`} />
            </button>
              <div className={`${styles.metricDropdownMenu} ${!isMetricDropdownOpen ? styles.metricDropdownMenuHidden : ''}`}>
                {[
                  { value: 'stargazer_count', label: t('charts.metricStars'), Icon: FiStar },
                  { value: 'fork_count', label: 'Forks', Icon: FiGitBranch },
                  { value: 'collaborators_count', label: t('charts.metricContributors'), Icon: FiUserCheck },
                  { value: 'shared_collaborators_count', label: t('charts.metricCollaborative'), Icon: Network },
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
          </div>
        </div>
        <div className={styles.chartContainer}>
          {isFiltering && (
            <div className={styles.chartLoadingOverlay}>
              <div className={styles.chartLoadingSpinner}></div>
              <span>{t('charts.updating')}</span>
            </div>
          )}
          {repoChartVisible ? (
            <div ref={repoBarContainerRef}>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={repoData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(75, 85, 99, 0.3)" vertical={false} />
                <XAxis dataKey="name" stroke="#6b7280" tick={<StaggeredTick />} interval={0} />
                <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
                <Tooltip content={<RepoTooltip />} cursor={false} />
                <Bar 
                  dataKey={repoMetric}
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
                      fill={selectedRepos.includes(entry.fullName) ? '#00D4E4' : (entry.isSelected ? '#FF3CAC' : '#9D6FDB')}
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
          
          {/* Hint de interacciones */}
          <p className={styles.chartHint}>
            <span><span className={styles.kbdKey}>Click</span> {t('charts.hintFilter')}</span>
            <span>·</span>
            <span><span className={styles.kbdKey}>Shift</span>+<span className={styles.kbdKey}>Click</span> {t('charts.hintDetails')}</span>
            <span>·</span>
            <span><span className={styles.kbdKey}>Ctrl</span>+<span className={styles.kbdKey}>Click</span> {t('charts.hintCompare')}</span>
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
            <FiUsers className={styles.chartTitleIcon} /> {t('charts.chart3')}
          </h3>
        </div>
        
        {/* Selector de métrica de ordenación + tipo de colaborador */}
        <div className={styles.subtitleRow}>
          <p className={styles.chartSubtitleInline}>{t('charts.sortedBy')}</p>
          <div className={styles.metricDropdown} ref={userMetricDropdownRef}>
            <button
              className={styles.metricDropdownTrigger}
              onClick={() => setIsUserMetricDropdownOpen(prev => !prev)}
              onBlur={(e) => {
                if (!userMetricDropdownRef.current?.contains(e.relatedTarget)) {
                  setIsUserMetricDropdownOpen(false)
                }
              }}
            >
              <span className={styles.metricDropdownIcon}>
                {userMetric === 'score' && <Zap size={14} />}
                {userMetric === 'repos' && <Network size={14} />}
              </span>
              <span>{userMetricLabels[userMetric]}</span>
              <ChevronDown size={14} className={`${styles.metricDropdownChevron} ${isUserMetricDropdownOpen ? styles.chevronOpen : ''}`} />
            </button>
              <div className={`${styles.metricDropdownMenu} ${!isUserMetricDropdownOpen ? styles.metricDropdownMenuHidden : ''}`}>
                {[
                  { value: 'score', label: t('charts.collaboration'), Icon: Zap },
                  { value: 'repos', label: t('charts.multiRepo'), Icon: Network },
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`${styles.metricDropdownItem} ${userMetric === opt.value ? styles.metricDropdownItemActive : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setUserMetric(opt.value)
                      setIsUserMetricDropdownOpen(false)
                    }}
                  >
                    <span className={styles.metricDropdownItemIcon}><opt.Icon size={14} /></span>
                    <span>{opt.label}</span>
                    {userMetric === opt.value && <span className={styles.metricDropdownCheck}>✓</span>}
                  </button>
                ))}
              </div>
          </div>
          <span style={{ margin: '0 4px', color: 'rgba(156,163,175,0.5)' }}>·</span>
          <p className={styles.chartSubtitleInline}>{t('charts.show')}</p>
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
                {collabType === 'all' && t('charts.collabAll')}
                {collabType === 'contributors' && t('charts.withCommits')}
                {collabType === 'reviewers' && t('charts.collabReviewers')}
              </span>
              <ChevronDown size={14} className={`${styles.metricDropdownChevron} ${isCollabDropdownOpen ? styles.chevronOpen : ''}`} />
            </button>
              <div className={`${styles.metricDropdownMenu} ${!isCollabDropdownOpen ? styles.metricDropdownMenuHidden : ''}`}>
                {[
                  { value: 'all', label: t('charts.collabAll'), Icon: FiUsers, desc: t('charts.collabAllDesc') },
                  { value: 'contributors', label: t('charts.withCommits'), Icon: FiCode, desc: t('charts.haveContributed') },
                  { value: 'reviewers', label: t('charts.collabReviewers'), Icon: FiEye, desc: t('charts.collabReviewersDesc') },
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
          </div>
          
          {/* Toggle para incluir bots */}
          <label className={`${styles.comparisonBotToggle} ${includeBots ? styles.comparisonBotToggleActive : ''}`} title={t('charts.botToggleHint')}>
            <Bot size={13} className={styles.comparisonBotIcon} />
            <span className={styles.comparisonBotLabel}>{includeBots ? t('charts.withBots') : t('charts.withoutBots')}</span>
            <button
              className={`${styles.comparisonBotSwitch} ${includeBots ? styles.comparisonBotSwitchOn : ''}`}
              onClick={(e) => { e.preventDefault(); setIncludeBots(v => !v) }}
              aria-label={includeBots ? t('charts.excludeBots') : t('charts.includeBots')}
            >
              <span className={styles.comparisonBotSwitchThumb} />
            </button>
          </label>
        </div>
        
        <div className={styles.chartContainer}>
          {/* Overlay de carga */}
          {(isUpdatingUsers || isFiltering) && (
            <div className={styles.chartLoadingOverlay}>
              <div className={styles.chartLoadingSpinner}></div>
              <span>{t('charts.updating')}</span>
            </div>
          )}
          
          {userChartVisible ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={userData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(75, 85, 99, 0.3)" vertical={false} />
                <XAxis dataKey="displayName" stroke="#6b7280" tick={<StaggeredTick />} interval={0} />
                <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af' }} />
                <Tooltip content={<CollaboratorTooltip />} cursor={false} />
                <Bar 
                  dataKey="score" 
                  radius={[4, 4, 0, 0]} 
                  name={userMetric === 'repos' ? t('charts.reposShort') : `Score ${t('charts.collaboration')}`}
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
                      fill={entry.isSelected ? '#FF3CAC' : '#00ff9f'}
                      style={{ 
                        transition: 'fill 0.3s ease',
                        filter: entry.isSelected ? 'brightness(1.1) drop-shadow(0 0 6px rgba(255, 60, 172, 0.5))' : 'none'
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : null}
          
          {/* Hint de interacciones */}
          <p className={styles.chartHint}>
            <span><span className={styles.kbdKey}>Click</span> {t('charts.hintDetails')}</span>
            <span>·</span>
            <span><span className={styles.kbdKey}>Ctrl</span>+<span className={styles.kbdKey}>Click</span> {t('charts.hintCollabNetwork')}</span>
          </p>
        </div>
      </div>

      {/* GRÁFICO 4: Distribución de Lenguajes */}
      <div 
        ref={pieChartRef}
        className={`${styles.chartCard} ${styles.scrollReveal} ${pieChartVisible ? styles.scrollRevealed : ''}`}
      >
        <div className={styles.titleRow}>
          <h3 className={styles.chartTitle}>🔬 {t('charts.chart4')}</h3>
          <FilterBadge 
            value={selectedLanguage}
            label={t('charts.filtering')}
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
              <strong>{selectedRepoInfo?.name}</strong> {t('charts.uses')}
            </p>
            <div className={styles.repoLanguageBadge}>
              {selectedRepoInfo?.language}
            </div>
            <p className={styles.repoLanguageHint}>
              {t('charts.removeRepoFilterHint')}
            </p>
            <button 
              className={styles.repoLanguageButton}
              onClick={() => setFilter('repo', selectedRepo)}
            >
              {t('charts.removeRepoFilter')}
            </button>
          </div>
        ) : (
          <>
            <p className={styles.chartSubtitle}>{t('charts.clickSegmentToFilter')}</p>
            <div className={styles.chartContainer}>
              {isFiltering && (
                <div className={styles.chartLoadingOverlay}>
                  <div className={styles.chartLoadingSpinner}></div>
                  <span>{t('charts.updating')}</span>
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
                  <span style={{ color: '#6b7280' }}>{t('charts.loadingChart')}</span>
                </div>
              )}
            </div>
        
        {/* Panel expandible para "Otros" lenguajes */}
        {showOthersPanel && othersLanguages.length > 0 && (
          <div className={styles.othersPanel}>
            <div className={styles.othersPanelHeader}>
              <h4 className={styles.othersPanelTitle}>🔬 {t('charts.otherLanguages')} ({othersLanguages.length})</h4>
              <button 
                className={styles.othersPanelClose}
                onClick={() => setShowOthersPanel(false)}
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
            <p className={styles.othersPanelSubtitle}>{t('charts.clickLanguageToFilter')}</p>
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

      {/* GRÁFICO 5: Distribución por Disciplina Interdisciplinar */}
      {disciplinePieData.length > 0 && (
        <div
          ref={disciplineChartRef}
          className={`${styles.chartCard} ${styles.chartCardWide} ${styles.scrollReveal} ${disciplineChartVisible ? styles.scrollRevealed : ''}`}
        >
          <div className={styles.titleRow}>
            <h3 className={styles.chartTitle}>{t('charts.chart5')}</h3>
            {selectedDiscipline && (
              <button
                className={styles.activeFilterBadge}
                onClick={() => setFilter('discipline', selectedDiscipline)}
                title={t('charts.removeDisciplineFilter')}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: DISCIPLINE_COLORS[selectedDiscipline] || '#888', display: 'inline-block' }} />
                {DISCIPLINE_LABELS[selectedDiscipline] || selectedDiscipline}
                <span style={{ marginLeft: 4, opacity: 0.6 }}>✕</span>
              </button>
            )}
          </div>
          <p className={styles.chartSubtitle}>
            {t('charts.disciplineAutoClassification')}
            {disciplineAnalysis?.cross_discipline_index != null && (
              <span style={{ marginLeft: 8, color: '#00ff9f', fontWeight: 600 }}>
                — {t('charts.crossDisciplineIndex')}: {disciplineAnalysis.cross_discipline_index.toFixed(1)}%
              </span>
            )}
          </p>
          <div className={styles.disciplineLayout}>
            <div className={styles.chartContainer}>
              {isFiltering && (
                <div className={styles.chartLoadingOverlay}>
                  <div className={styles.chartLoadingSpinner}></div>
                  <span>{t('charts.updating')}</span>
                </div>
              )}
              {/* Caso especial: una sola disciplina → display tipo spotlight */}
              {disciplinePieData.length === 1 && !disciplinePieData[0]._otherItems ? (() => {
                const sole = disciplinePieData[0]
                const DIcon = DISCIPLINE_ICONS[sole.key] || Zap
                return (
                  <div className={styles.singleDisciplineDisplay}>
                    <div className={styles.singleDisciplineGlow} style={{ background: sole.fill }} />
                    <div className={styles.singleDisciplineIconWrap} style={{ background: `${sole.fill}18`, borderColor: `${sole.fill}55` }}>
                      <DIcon size={48} style={{ color: sole.fill }} />
                    </div>
                    <span className={styles.singleDisciplineEmoji}>{DISCIPLINE_EMOJIS[sole.key] || '⚛️'}</span>
                    <h4 className={styles.singleDisciplineName} style={{ color: sole.fill }}>{sole.name}</h4>
                    <div className={styles.singleDisciplineStats}>
                      <span className={styles.singleDisciplineCount} style={{ color: sole.fill }}>{sole.value.toLocaleString()}</span>
                      <span className={styles.singleDisciplineCountLabel}>{t('charts.collaborators')}</span>
                    </div>
                    <p className={styles.singleDisciplineDesc}>
                      {DISCIPLINE_DESCRIPTIONS[sole.key] || t('charts.disciplineDefault')}
                    </p>
                    <div className={styles.singleDisciplineBadge} style={{ borderColor: `${sole.fill}44`, background: `${sole.fill}12` }}>
                      <span style={{ color: sole.fill, fontWeight: 600 }}>100%</span>
                      <span style={{ color: '#9ca3af' }}>{t('charts.contributorsInCategory')}</span>
                    </div>
                    {selectedDiscipline === sole.key ? (
                      <button
                        className={styles.singleDisciplineButton}
                        style={{ borderColor: `${sole.fill}55`, color: sole.fill }}
                        onClick={() => setFilter('discipline', sole.key)}
                      >
                        {t('charts.removeDisciplineFilter')}
                      </button>
                    ) : (
                      <button
                        className={styles.singleDisciplineButton}
                        style={{ borderColor: `${sole.fill}55`, color: sole.fill }}
                        onClick={() => setFilter('discipline', sole.key)}
                      >
                        {t('charts.filterBy', { name: sole.name })}
                      </button>
                    )}
                  </div>
                )
              })() : (
              /* Caso normal: múltiples disciplinas → pie chart */
              <>
              {disciplineChartVisible ? (
                <div style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={420}>
                  <PieChart>
                    <Pie
                      data={disciplinePieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={140}
                      innerRadius={50}
                      dataKey="value"
                      isAnimationActive={!hasAnimatedDisciplinePie}
                      animationBegin={0}
                      animationDuration={800}
                      animationEasing="ease-out"
                      style={{ cursor: 'pointer' }}
                      onClick={handleDisciplineSliceClick}
                      label={({ name, value, cx, cy, midAngle, outerRadius, index }) => {
                        const RADIAN = Math.PI / 180
                        const radius = outerRadius + 30
                        const x = cx + radius * Math.cos(-midAngle * RADIAN)
                        const y = cy + radius * Math.sin(-midAngle * RADIAN)
                        return (
                          <text
                            key={`disc-label-${index}`}
                            x={x} y={y}
                            fill="#9ca3af"
                            textAnchor={x > cx ? 'start' : 'end'}
                            dominantBaseline="central"
                            style={{ fontSize: '11px', fontWeight: 500, pointerEvents: 'none' }}
                          >
                            {`${name} (${value})`}
                          </text>
                        )
                      }}
                      labelLine={{ stroke: 'rgba(156, 163, 175, 0.4)', strokeWidth: 1, pointerEvents: 'none' }}
                    >
                      {disciplinePieData.map((entry, index) => {
                        const isSelected = selectedDiscipline === entry.key
                        const isDimmed = selectedDiscipline && !isSelected
                        return (
                          <Cell
                            key={`disc-cell-${index}`}
                            fill={entry.fill}
                            stroke={isSelected ? entry.fill : 'rgba(15, 20, 25, 0.6)'}
                            strokeWidth={isSelected ? 3 : 1}
                            style={{
                              cursor: 'pointer',
                              opacity: isDimmed ? 0.35 : 1,
                              filter: isSelected ? `brightness(1.2) drop-shadow(0 0 8px ${entry.fill}88)` : 'none',
                              transition: 'opacity 0.3s ease, filter 0.3s ease',
                            }}
                          />
                        )
                      })}
                    </Pie>
                    <Tooltip content={<DisciplineTooltip />} cursor={false} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Popover interactivo para disciplinas agrupadas en "Otros" */}
                {otrosPopover && (
                  <div
                    style={{
                      position: 'absolute',
                      left: Math.min(otrosPopover.x, 280),
                      top: Math.max(otrosPopover.y - 20, 0),
                      zIndex: 50,
                      background: 'rgba(15, 20, 30, 0.96)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      minWidth: 200,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                      backdropFilter: 'blur(12px)',
                    }}
                    role="presentation"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {t('charts.filterByDiscipline')}
                    </p>
                    {otrosPopover.items.map((item, i) => (
                      <div
                        key={i}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setOtrosPopover(null); setFilter('discipline', item.key) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setOtrosPopover(null); setFilter('discipline', item.key) } }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 8px', margin: '2px 0', borderRadius: 6,
                          cursor: 'pointer', transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.fill, flexShrink: 0 }} />
                        <span style={{ color: '#e5e7eb', fontSize: 12, flex: 1 }}>{item.name}</span>
                        <strong style={{ color: item.fill, fontSize: 12 }}>{item.value}</strong>
                        <span style={{ color: '#6b7280', fontSize: 10 }}>({item.pct.toFixed(1)}%)</span>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              ) : (
                <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#6b7280' }}>{t('charts.loadingChart')}</span>
                </div>
              )}
              </>
              )}
            </div>

            {/* Bridge profiles (usuarios que cruzan disciplinas) */}
            {disciplineAnalysis?.bridge_profiles?.length > 0 && (
              <div className={styles.bridgePanel}>
                <div className={styles.bridgePanelHeader}>
                  <div className={styles.bridgePanelHeaderIcon}>
                    <Network size={16} />
                  </div>
                  <div>
                    <div className={styles.bridgePanelTitle}>{t('charts.interdisciplinaryBridges')}</div>
                    <div className={styles.bridgePanelCount}>
                      {t('charts.multidisciplinaryUsers', { count: disciplineAnalysis.bridge_profiles.length })}
                    </div>
                  </div>
                </div>
                <div className={styles.bridgePanelBody}>
                  {disciplineAnalysis.bridge_profiles.map((bp, i) => {
                    const avatarUrl = allUsersMap[bp.login]?.avatar_url || userData.find(u => u.login === bp.login)?.avatar_url || null
                    const disciplineKeys = bp.repos_per_discipline ? Object.keys(bp.repos_per_discipline) : []
                    const isTop3 = i < 3
                    return (
                      <div
                        key={i}
                        className={styles.bridgeProfileRow}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click() }}
                        onClick={() => {
                          const userMatch = userData.find(u => u.login === bp.login)
                          if (userMatch) {
                            openEntityDetail('user', { ...userMatch, bridge_repos_per_discipline: bp.repos_per_discipline })
                          } else {
                            const fullUser = allUsersMap[bp.login]
                            if (fullUser) {
                              const mapped = mapUserToDisplay(fullUser, userMetric, disciplineMap, selectedUser)
                              openEntityDetail('user', { ...mapped, bridge_repos_per_discipline: bp.repos_per_discipline })
                            } else {
                              const discInfo = disciplineMap[bp.login] || {}
                              openEntityDetail('user', {
                                login: bp.login, name: bp.login, avatar_url: null,
                                score: 0, contributions: 0, repos: bp.total_repos || 0,
                                organizations: [], commits: 0, prs: 0, reviews: 0, issues: 0,
                                bio: null, company: null, location: null, top_languages: [],
                                ...discInfo, bridge_repos_per_discipline: bp.repos_per_discipline,
                              })
                            }
                          }
                        }}
                      >
                        <span className={`${styles.bridgeRank} ${isTop3 ? styles.bridgeRankTop : styles.bridgeRankNormal}`}>
                          {i + 1}
                        </span>
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={bp.login}
                            className={styles.bridgeAvatar}
                            loading="lazy"
                          />
                        ) : (
                          <span className={styles.bridgeAvatarFallback}>
                            {bp.login.charAt(0)}
                          </span>
                        )}
                        <div className={styles.bridgeProfileInfo}>
                          <div className={styles.bridgeProfileMeta}>
                            <span className={styles.bridgeProfileLogin}>@{bp.login}</span>
                            <span className={styles.bridgeProfileRepoCount}>
                              {bp.total_repos || 0} {t('charts.reposShort')}
                            </span>
                          </div>
                          <div className={styles.bridgeDisciplineTags}>
                            {disciplineKeys.map(disc => (
                              <span
                                key={disc}
                                className={styles.bridgeDisciplineTag}
                                style={{
                                  background: `${DISCIPLINE_COLORS[disc] || '#888'}15`,
                                  color: DISCIPLINE_COLORS[disc] || '#888',
                                  border: `1px solid ${DISCIPLINE_COLORS[disc] || '#888'}30`,
                                }}
                              >
                                <span
                                  className={styles.bridgeDisciplineTagDot}
                                  style={{ background: DISCIPLINE_COLORS[disc] || '#888' }}
                                />
                                {DISCIPLINE_LABELS[disc] || disc}
                                <span className={styles.bridgeDisciplineTagCount}>
                                  {bp.repos_per_discipline[disc]}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <p className={styles.chartHint}>
            <span><span className={styles.kbdKey}>Click</span> {t('charts.hintClickSector')}</span>
            <span>·</span>
            <span><span className={styles.kbdKey}>Click</span> {t('charts.hintClickBridge')}</span>
          </p>
        </div>
      )}

      {/* Panel de detalle de entidad (aparece al click en barra) */}
      {(detailEntity || detailClosing) && (() => {
        const entity = detailEntity
        if (!entity) return null
        const { type, data } = entity

        const typeConfig = {
          org: { 
            label: t('charts.entityOrg'), 
            color: '#00D4E4', 
            Icon: Building2,
            github: `https://github.com/${data.name}` 
          },
          repo: { 
            label: t('charts.entityRepo'), 
            color: '#9D6FDB', 
            Icon: GitFork,
            github: `https://github.com/${data.fullName}` 
          },
          user: { 
            label: t('charts.entityContributor'), 
            color: '#00ff9f', 
            Icon: User,
            github: `https://github.com/${data.login}` 
          },
        }
        const config = typeConfig[type]
        if (!config) return null
        const TypeIcon = config.Icon

        return (
          <div 
            className={`${styles.entityDetailOverlay} ${detailClosing ? styles.entityDetailOverlayClosing : ''}`}
            role="button"
            tabIndex={0}
            onClick={closeEntityDetail}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeEntityDetail() }}
          >
            <aside 
              className={`${styles.entityDetailCard} ${detailClosing ? styles.entityDetailCardClosing : ''}`}
              role="presentation"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className={styles.entityDetailHeader} style={{ borderColor: config.color }}>
                <div className={styles.entityDetailHeaderLeft}>
                  {data.avatar_url ? (
                    <img src={data.avatar_url} alt="" className={styles.entityDetailAvatar} />
                  ) : (
                    <div className={styles.entityDetailIconWrap} style={{ background: `${config.color}20` }}>
                      <TypeIcon size={20} style={{ color: config.color }} />
                    </div>
                  )}
                  <div>
                    <h3 className={styles.entityDetailName}>
                      {type === 'user' ? (data.name || data.login) : (data.displayName || data.fullName || data.name)}
                    </h3>
                    <span className={styles.entityDetailType} style={{ color: config.color }}>
                      {config.label}
                    </span>
                  </div>
                </div>
                <div className={styles.entityDetailActions}>
                  <a 
                    href={config.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.entityDetailGithubLink}
                    title={t('charts.viewOnGitHub')}
                  >
                    <ExternalLink size={16} />
                  </a>
                  <button className={styles.entityDetailClose} onClick={closeEntityDetail}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Description */}
              {data.description && (
                <p className={styles.entityDetailDesc}>{data.description}</p>
              )}

              {/* User bio */}
              {type === 'user' && data.bio && (
                <p className={styles.entityDetailDesc}>{data.bio}</p>
              )}

              {/* Badges row */}
              {(() => {
                const badges = []
                if (type === 'org' && data.is_verified) badges.push({ icon: Shield, label: t('charts.badgeVerified'), color: '#22C55E' })
                if (type === 'org' && data.is_quantum_focused) badges.push({ icon: Zap, label: 'Quantum Focus', color: '#F59E0B' })
                if (type === 'repo' && data.is_fork) badges.push({ icon: GitFork, label: 'Fork', color: '#9D6FDB' })
                if (type === 'repo' && data.is_archived) badges.push({ icon: Archive, label: t('charts.badgeArchived'), color: '#EF4444' })
                if (type === 'user' && data.is_hireable) badges.push({ icon: Briefcase, label: t('charts.badgeHireable'), color: '#22C55E' })
                if (type === 'user' && data.quantum_expertise_score > 0) badges.push({ icon: Cpu, label: `QE ${data.quantum_expertise_score.toFixed(1)}`, color: '#00D4E4' })
                if (badges.length === 0) return null
                return (
                  <div className={styles.entityDetailBadges}>
                    {badges.map((b, i) => (
                      <span key={i} className={styles.entityDetailBadge} style={{ color: b.color, borderColor: `${b.color}40`, background: `${b.color}10` }}>
                        <b.icon size={11} /> {b.label}
                      </span>
                    ))}
                  </div>
                )
              })()}

              {/* Stats Grid */}
              <div className={styles.entityDetailStats}>
                {type === 'org' && (
                  <>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#00D4E4' }}>{(data.repositories || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>{t('charts.metricReposQuantum')}</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#F59E0B' }}>{(data.stars || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>{t('charts.metricStars')}</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#9D6FDB' }}>{(data.total_unique_contributors || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>{t('charts.metricContributors')}</span>
                    </div>
                    {data.shared_users_count > 0 ? (
                      <div className={styles.entityDetailStat}>
                        <span className={styles.entityDetailStatValue} style={{ color: '#00ff9f' }}>{(data.shared_users_count || 0).toLocaleString()}</span>
                        <span className={styles.entityDetailStatLabel}>{t('charts.crossOrg')}</span>
                      </div>
                    ) : (
                      <div className={styles.entityDetailStat}>
                        <span className={styles.entityDetailStatValue} style={{ color: '#00ff9f' }}>{(data.total_repositories_count || 0).toLocaleString()}</span>
                        <span className={styles.entityDetailStatLabel}>{t('charts.totalRepos')}</span>
                      </div>
                    )}
                  </>
                )}
                {type === 'repo' && (
                  <>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#F59E0B' }}>{(data.stargazer_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>{t('charts.metricStars')}</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#9D6FDB' }}>{(data.fork_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>{t('charts.forks')}</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#00D4E4' }}>{(data.collaborators_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>{t('charts.metricContributors')}</span>
                    </div>
                    {data.shared_collaborators_count > 0 ? (
                      <div className={styles.entityDetailStat}>
                        <span className={styles.entityDetailStatValue} style={{ color: '#00ff9f' }}>{(data.shared_collaborators_count || 0).toLocaleString()}</span>
                        <span className={styles.entityDetailStatLabel}>{t('charts.crossRepo')}</span>
                      </div>
                    ) : (
                      <div className={styles.entityDetailStat}>
                        <span className={styles.entityDetailStatValue} style={{ color: '#00ff9f' }}>{(data.watchers_count || 0).toLocaleString()}</span>
                        <span className={styles.entityDetailStatLabel}>{t('charts.watchers')}</span>
                      </div>
                    )}
                  </>
                )}
                {type === 'user' && (
                  <>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#00D4E4' }}>{(data.score || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>{t('charts.collabScore')}</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#9D6FDB' }}>{(data.contributions || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>{t('charts.contrib')}</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#F59E0B' }}>{(data.followers_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>{t('charts.followers')}</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#00ff9f' }}>{(data.repos_count || data.public_repos_count || data.repos || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>{t('charts.reposShort')}</span>
                    </div>
                  </>
                )}
              </div>

              {/* === ORG SPECIFIC SECTIONS === */}
              {/* Org: Repos overview - always show when we have total_repositories_count */}
              {type === 'org' && data.total_repositories_count > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.repositories')}</h4>
                  <div className={styles.entityDetailProgressRow}>
                    <div className={styles.entityDetailProgressBar}>
                      <div className={styles.entityDetailProgressFill} style={{ width: `${Math.min(100, ((data.repositories || 0) / data.total_repositories_count) * 100)}%` }} />
                    </div>
                    <span className={styles.entityDetailProgressValue}>
                      {data.repositories || 0}<small>/{data.total_repositories_count}</small>
                    </span>
                  </div>
                  <span className={styles.entityDetailProgressHint}>
                    {data.repositories || 0} {t('charts.quantumReposOf')} {data.total_repositories_count} {t('charts.total')}
                    {data.quantum_focus_score > 0 && ` · ${data.quantum_focus_score.toFixed(1)}% ${t('charts.quantumFocus')}`}
                  </span>
                </div>
              )}

              {/* Org: Info section - ALWAYS show, combine all org metadata */}
              {type === 'org' && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.information')}</h4>
                  {data.created_at && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Calendar size={12} /> {t('charts.created')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{formatDetailDate(data.created_at)}{timeAgo(data.created_at) && <small> ({timeAgo(data.created_at)})</small>}</span>
                    </div>
                  )}
                  {data.location && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><MapPin size={12} /> {t('charts.locationLabel')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.location}</span>
                    </div>
                  )}
                  {data.email && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Mail size={12} /> {t('charts.emailLabel')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.email}</span>
                    </div>
                  )}
                  {data.total_unique_contributors > 0 && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Users size={12} /> {t('charts.metricContributors')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.total_unique_contributors.toLocaleString()} {t('charts.uniqueContributors')}</span>
                    </div>
                  )}
                </div>
              )}

              {type === 'org' && Array.isArray(data.top_languages) && data.top_languages.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.mainLanguages')}</h4>
                  {/* Language bar visualization */}
                  <div className={styles.entityDetailLangBarWrap}>
                    <div className={styles.entityDetailLangBar}>
                      {data.top_languages.slice(0, 6).map((lang, i) => {
                        const langName = typeof lang === 'string' ? lang : lang?.name
                        const pct = lang?.percentage || 0
                        if (!langName || pct < 1) return null
                        const langColors = { Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6', 'C++': '#f34b7d', C: '#555555', Java: '#b07219', Julia: '#a270ba', Rust: '#dea584', Go: '#00ADD8', Ruby: '#701516', 'Jupyter Notebook': '#DA5B0B', HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051', Qiskit: '#6929C4' }
                        return <div key={i} style={{ width: `${pct}%`, background: langColors[langName] || `hsl(${i * 55}, 60%, 55%)`, minWidth: '4px' }} title={`${langName}: ${pct.toFixed(1)}%`} />
                      })}
                    </div>
                    <div className={styles.entityDetailLangLabels}>
                      {data.top_languages.slice(0, 5).map((lang, i) => {
                        const langName = typeof lang === 'string' ? lang : lang?.name
                        const pct = lang?.percentage
                        const count = lang?.repo_count
                        if (!langName) return null
                        return (
                          <button key={i} className={styles.entityDetailLangItem} onClick={() => { setFilter('language', langName); closeEntityDetail() }}>
                            <span className={styles.entityDetailLangName}>{langName}</span>
                            {pct != null && <span className={styles.entityDetailLangPct}>{pct.toFixed(0)}%</span>}
                            {count != null && <span className={styles.entityDetailLangCount}>{count} {t('charts.reposShort')}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {type === 'org' && Array.isArray(data.top_quantum_contributors) && data.top_quantum_contributors.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.topQuantumContributors')} ({data.top_quantum_contributors.length})</h4>
                  <div className={styles.entityDetailContribList}>
                    {data.top_quantum_contributors.map((c, i) => {
                      const login = typeof c === 'string' ? c : c?.login
                      if (!login) return null
                      return (
                        <button key={i} className={styles.entityDetailContribItem} onClick={() => { selectUserForAnalysis(login); closeEntityDetail() }}>
                          <User size={12} />
                          <span>{login}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* === ORG SOCIAL LINKS === */}
              {type === 'org' && (data.website_url || data.twitter_username) && (
                <div className={styles.entityDetailSection}>
                  <div className={styles.entityDetailLinks}>
                    {data.website_url && (
                      <a href={data.website_url.startsWith('http') ? data.website_url : `https://${data.website_url}`} target="_blank" rel="noopener noreferrer" className={styles.entityDetailLink}>
                        <Globe size={13} /> {t('charts.website')}
                      </a>
                    )}
                    {data.twitter_username && (
                      <a href={`https://x.com/${data.twitter_username}`} target="_blank" rel="noopener noreferrer" className={styles.entityDetailLink}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> @{data.twitter_username}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* === REPO SPECIFIC SECTIONS === */}
              {type === 'repo' && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.repoActivity')}</h4>
                  <div className={styles.entityDetailActivityGrid}>
                    <div className={styles.entityDetailActivityItem}>
                      <GitCommit size={13} style={{ color: '#22C55E' }} />
                      <span className={styles.entityDetailActivityValue}>{(data.commits_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailActivityLabel}>{t('charts.commits')}</span>
                    </div>
                    <div className={styles.entityDetailActivityItem}>
                      <GitPullRequest size={13} style={{ color: '#3B82F6' }} />
                      <span className={styles.entityDetailActivityValue}>{(data.pull_requests_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailActivityLabel}>{t('charts.prs')}</span>
                    </div>
                    <div className={styles.entityDetailActivityItem}>
                      <AlertCircle size={13} style={{ color: '#EF4444' }} />
                      <span className={styles.entityDetailActivityValue}>{(data.issues_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailActivityLabel}>{t('charts.issues')}</span>
                    </div>
                    <div className={styles.entityDetailActivityItem}>
                      <Tag size={13} style={{ color: '#F59E0B' }} />
                      <span className={styles.entityDetailActivityValue}>{(data.releases_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailActivityLabel}>{t('charts.releases')}</span>
                    </div>
                  </div>
                  {(data.merged_pull_requests_count > 0 || data.open_pull_requests_count > 0 || data.open_issues_count > 0) && (
                    <div className={styles.entityDetailSubStats}>
                      {data.merged_pull_requests_count > 0 && (
                        <span className={styles.entityDetailSubStat}><span style={{ color: '#9D6FDB' }}>{data.merged_pull_requests_count}</span> {t('charts.merged')}</span>
                      )}
                      {data.open_pull_requests_count > 0 && (
                        <span className={styles.entityDetailSubStat}><span style={{ color: '#22C55E' }}>{data.open_pull_requests_count}</span> {t('charts.openPRs')}</span>
                      )}
                      {data.open_issues_count > 0 && (
                        <span className={styles.entityDetailSubStat}><span style={{ color: '#F59E0B' }}>{data.open_issues_count}</span> {t('charts.openIssues')}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {type === 'repo' && Array.isArray(data.repository_topics) && data.repository_topics.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.topics')} ({data.repository_topics.length})</h4>
                  <div className={styles.entityDetailTopics}>
                    {data.repository_topics.slice(0, 12).map((topic, i) => (
                      <span key={i} className={styles.entityDetailTopic}>{topic}</span>
                    ))}
                  </div>
                </div>
              )}

              {type === 'repo' && Array.isArray(data.languages) && data.languages.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.languages')} ({data.languages.length})</h4>
                  <div className={styles.entityDetailLangBarWrap}>
                    {(() => {
                      const totalSize = data.languages.reduce((sum, l) => sum + (l.size || 0), 0)
                      if (totalSize === 0) return null
                      return (
                        <>
                          <div className={styles.entityDetailLangBar}>
                            {data.languages.map((l, i) => {
                              const pct = ((l.size || 0) / totalSize) * 100
                              if (pct < 1) return null
                              const langColors = { Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6', 'C++': '#f34b7d', C: '#555555', Java: '#b07219', Julia: '#a270ba', Rust: '#dea584', Go: '#00ADD8', Ruby: '#701516', Jupyter: '#DA5B0B', HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051' }
                              return <div key={i} style={{ width: `${pct}%`, background: langColors[l.name] || `hsl(${i * 60}, 60%, 55%)`, minWidth: '4px' }} title={`${l.name}: ${pct.toFixed(1)}%`} />
                            })}
                          </div>
                          <div className={styles.entityDetailLangLabels}>
                            {data.languages.filter(l => ((l.size || 0) / totalSize) * 100 >= 3).map((l, i) => (
                              <button key={i} className={styles.entityDetailLangItem} onClick={() => { setFilter('language', l.name); closeEntityDetail() }}>
                                <span className={styles.entityDetailLangName}>{l.name}</span>
                                <span className={styles.entityDetailLangPct}>{(((l.size || 0) / totalSize) * 100).toFixed(1)}%</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* Repo metadata */}
              {type === 'repo' && (
                <div className={styles.entityDetailSection}>
                  {data.language && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Code size={12} /> {t('charts.mainLanguage')}</span>
                      <button className={styles.entityDetailMetaValue} onClick={() => { setFilter('language', data.language); closeEntityDetail() }}>
                        {data.language}
                      </button>
                    </div>
                  )}
                  {data.owner && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Building2 size={12} /> {t('charts.entityOrg')}</span>
                      <button className={styles.entityDetailMetaValue} onClick={() => { setFilter('org', data.owner); closeEntityDetail() }}>
                        {data.owner}
                      </button>
                    </div>
                  )}
                  {data.license_info?.name && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Scale size={12} /> {t('charts.license')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.license_info.spdx_id || data.license_info.name}</span>
                    </div>
                  )}
                  {data.default_branch && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><GitFork size={12} /> Branch</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.default_branch}</span>
                    </div>
                  )}
                  {data.latest_release?.tag_name && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Tag size={12} /> {t('charts.latestRelease')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>
                        {data.latest_release.tag_name}
                        {data.latest_release.published_at && timeAgo(data.latest_release.published_at) && <small> ({timeAgo(data.latest_release.published_at)})</small>}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Repo timeline */}
              {type === 'repo' && (data.created_at || data.pushed_at) && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.timeline')}</h4>
                  <div className={styles.entityDetailTimeline}>
                    {data.created_at && (
                      <div className={styles.entityDetailTimelineItem}>
                        <Calendar size={11} />
                        <span className={styles.entityDetailTimelineLabel}>{t('charts.created')}</span>
                        <span className={styles.entityDetailTimelineValue}>{formatDetailDate(data.created_at)}</span>
                      </div>
                    )}
                    {data.pushed_at && (
                      <div className={styles.entityDetailTimelineItem}>
                        <Clock size={11} />
                        <span className={styles.entityDetailTimelineLabel}>{t('charts.lastPush')}</span>
                        <span className={styles.entityDetailTimelineValue}>{formatDetailDate(data.pushed_at)}{timeAgo(data.pushed_at) && <small> ({timeAgo(data.pushed_at)})</small>}</span>
                      </div>
                    )}
                    {data.updated_at && (
                      <div className={styles.entityDetailTimelineItem}>
                        <Clock size={11} />
                        <span className={styles.entityDetailTimelineLabel}>{t('charts.updated')}</span>
                        <span className={styles.entityDetailTimelineValue}>{formatDetailDate(data.updated_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* === USER SPECIFIC SECTIONS === */}
              {/* User discipline classification */}
              {type === 'user' && (() => {
                // Intentar obtener disciplina del propio data o del disciplineMap
                const discInfo = data.discipline ? data : (disciplineMap[data.login] || null)
                if (!discInfo?.discipline) return null
                const discColor = discInfo.discipline_color || DISCIPLINE_COLORS[discInfo.discipline] || '#888'
                const discLabel = discInfo.discipline_label || DISCIPLINE_LABELS[discInfo.discipline] || discInfo.discipline
                const isMulti = discInfo.discipline === 'multidisciplinary'
                const topColors = discInfo.discipline_top_colors || []
                // Check bridge profile data
                const bridgeData = data.bridge_repos_per_discipline || 
                  disciplineAnalysis?.bridge_profiles?.find(bp => bp.login === data.login)?.repos_per_discipline || null

                return (
                  <div className={styles.entityDetailSection}>
                    <h4 className={styles.entityDetailSectionTitle}>{t('charts.discipline')}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: bridgeData ? 8 : 0 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 12px', borderRadius: 6,
                        background: `${discColor}18`,
                        color: discColor,
                        border: `1px solid ${discColor}44`,
                        fontSize: 12, fontWeight: 600,
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: discColor }} />
                        {discLabel}
                      </span>
                      {discInfo.discipline_confidence > 0 && (
                        <span style={{ fontSize: 11, color: '#6b7280' }}>
                          {(discInfo.discipline_confidence * 100).toFixed(0)}% {t('charts.confidence')}
                        </span>
                      )}
                    </div>
                    {isMulti && topColors.length >= 2 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {topColors.map((tc, i) => {
                          const cLabel = DISCIPLINE_LABELS[tc.discipline] || tc.discipline
                          const cColor = tc.color || DISCIPLINE_COLORS[tc.discipline] || '#888'
                          return (
                            <span key={i} style={{
                              padding: '2px 8px', borderRadius: 4, fontSize: 10,
                              background: `${cColor}22`, color: cColor,
                              border: `1px solid ${cColor}44`,
                            }}>
                              {cLabel}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {bridgeData && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                        {Object.entries(bridgeData).map(([disc, count]) => (
                          <span key={disc} style={{
                            padding: '2px 7px', borderRadius: 4, fontSize: 10,
                            background: `${DISCIPLINE_COLORS[disc] || '#888'}22`,
                            color: DISCIPLINE_COLORS[disc] || '#888',
                            border: `1px solid ${DISCIPLINE_COLORS[disc] || '#888'}44`,
                          }}>
                            {DISCIPLINE_LABELS[disc] || disc}: {count} {t('charts.reposShort')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* User contribution breakdown */}
              {type === 'user' && (data.contributions > 0 || data.commits > 0 || data.prs > 0 || data.reviews > 0 || data.issues > 0) && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.contributionBreakdown')}</h4>
                  {(data.commits > 0 || data.prs > 0 || data.reviews > 0 || data.issues > 0) ? (
                    <div className={styles.entityDetailBreakdown}>
                      {[
                        { key: 'commits', label: 'Commits', color: '#22C55E', icon: GitCommit },
                        { key: 'prs', label: 'Pull Requests', color: '#3B82F6', icon: GitPullRequest },
                        { key: 'reviews', label: 'Reviews', color: '#F59E0B', icon: Eye },
                        { key: 'issues', label: 'Issues', color: '#EF4444', icon: AlertCircle },
                      ].filter(item => data[item.key] > 0).map(item => (
                        <div key={item.key} className={styles.entityDetailBreakdownRow}>
                          <span className={styles.entityDetailBreakdownLabel} style={{ color: item.color }}>
                            <item.icon size={11} /> {item.label}
                          </span>
                          <div className={styles.entityDetailBreakdownBar}>
                            <div style={{ width: `${data.contributions > 0 ? Math.min(100, (data[item.key] / data.contributions) * 100) : 0}%`, background: item.color }} />
                          </div>
                          <span className={styles.entityDetailBreakdownValue}>{data[item.key].toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#9ca3af', padding: '4px 0' }}>
                      {data.contributions_to_quantum_repos > 0 ? (
                        <>Total: <strong style={{ color: '#00D4E4' }}>{(data.contributions || 0).toLocaleString()}</strong> {t('charts.quantumContributions')}<br/>
                        <small style={{ color: '#6b7280' }}>{t('charts.breakdownNotAvailable')}</small></>
                      ) : (
                        <>Total: <strong style={{ color: '#00D4E4' }}>{(data.contributions || 0).toLocaleString()}</strong> {t('charts.repoContributions')}</>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* User profile info */}
              {type === 'user' && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.profile')}</h4>
                  {data.company && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Briefcase size={12} /> {t('charts.company')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.company}</span>
                    </div>
                  )}
                  {data.location && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><MapPin size={12} /> {t('charts.locationLabel')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.location}</span>
                    </div>
                  )}
                  {data.created_at && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Calendar size={12} /> {t('charts.memberSince')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{formatDetailDate(data.created_at)}</span>
                    </div>
                  )}
                  {data.followers_count > 0 && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Users size={12} /> {t('charts.followersLabel')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.followers_count.toLocaleString()}</span>
                    </div>
                  )}
                  {data.following_count > 0 && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Users size={12} /> {t('charts.followingLabel')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.following_count.toLocaleString()}</span>
                    </div>
                  )}
                  {data.has_commits != null && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><GitCommit size={12} /> {t('charts.roleLabel')}</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.has_commits ? t('charts.roleContributor') : data.is_mentionable ? t('charts.roleReviewer') : t('charts.roleMember')}</span>
                    </div>
                  )}
                  {!data.company && !data.location && !data.created_at && data.followers_count === 0 && data.following_count === 0 && (
                    <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', padding: '4px 0' }}>
                      {t('charts.profileNotEnriched')}
                    </div>
                  )}
                </div>
              )}

              {/* User top languages */}
              {type === 'user' && Array.isArray(data.top_languages) && data.top_languages.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.mainLanguages')}</h4>
                  <div className={styles.entityDetailLangList}>
                    {data.top_languages.slice(0, 6).map((lang, i) => {
                      const langName = typeof lang === 'string' ? lang : lang?.name
                      if (!langName) return null
                      return (
                        <button key={i} className={styles.entityDetailLangItem} onClick={() => { setFilter('language', langName); closeEntityDetail() }}>
                          <span className={styles.entityDetailLangName}>{langName}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* User organizations */}
              {type === 'user' && Array.isArray(data.organizations) && data.organizations.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>{t('charts.organizations')} ({data.organizations.length})</h4>
                  <div className={styles.entityDetailOrgChips}>
                    {data.organizations.map((org, i) => {
                      const orgLogin = typeof org === 'string' ? org : org?.login
                      if (!orgLogin) return null
                      return (
                        <button key={i} className={styles.entityDetailOrgChip} onClick={() => { setFilter('org', orgLogin); closeEntityDetail() }} title={t('charts.filterByOrg', { name: orgLogin })}>
                          {orgLogin}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* === SOCIAL LINKS (user/repo only — org links already in org section) === */}
              {type !== 'org' && (data.website_url || data.twitter_username) && (
                <div className={styles.entityDetailSection}>
                  <div className={styles.entityDetailLinks}>
                    {data.website_url && (
                      <a href={data.website_url.startsWith('http') ? data.website_url : `https://${data.website_url}`} target="_blank" rel="noopener noreferrer" className={styles.entityDetailLink}>
                        <Globe size={13} /> {t('charts.website')}
                      </a>
                    )}
                    {data.twitter_username && (
                      <a href={`https://x.com/${data.twitter_username}`} target="_blank" rel="noopener noreferrer" className={styles.entityDetailLink}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> @{data.twitter_username}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className={styles.entityDetailFooter}>
                {type === 'org' && (
                  <button 
                    className={styles.entityDetailActionBtn}
                    onClick={() => { setFilter('org', data.name); closeEntityDetail() }}
                  >
                    <Building2 size={14} /> {t('charts.filterByThisOrg')}
                  </button>
                )}
                {type === 'repo' && (
                  <div className={styles.entityDetailFooterButtons}>
                    <button 
                      className={styles.entityDetailActionBtn}
                      onClick={() => { setFilter('repo', data.fullName); closeEntityDetail() }}
                    >
                      <BookOpen size={14} /> {t('charts.filterByRepo')}
                    </button>
                    {data.homepage_url && (
                      <a href={data.homepage_url.startsWith('http') ? data.homepage_url : `https://${data.homepage_url}`} target="_blank" rel="noopener noreferrer" className={styles.entityDetailActionBtnSecondary}>
                        <Globe size={14} /> {t('charts.website')}
                      </a>
                    )}
                  </div>
                )}
                {type === 'user' && (
                  <button 
                    className={styles.entityDetailActionBtn}
                    onClick={() => { selectUserForAnalysis(data.login); closeEntityDetail() }}
                  >
                    <Users size={14} /> {t('charts.viewCollabNetworkShort')}
                  </button>
                )}
              </div>
            </aside>
          </div>
        )
      })()}
    </section>
  )
}
