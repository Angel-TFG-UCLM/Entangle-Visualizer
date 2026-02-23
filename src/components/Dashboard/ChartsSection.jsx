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
import { Building2, GitFork, User, ExternalLink, X, MapPin, Calendar, Globe, Shield, BookOpen, Tag, GitCommit, GitPullRequest, AlertCircle, Scale, Archive, Eye, Users, Code, Briefcase, Mail, Clock, Cpu, Zap } from 'lucide-react'
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
  
  // Estado para panel de detalle de entidad (aparece al click en barra)
  const [detailEntity, setDetailEntity] = useState(null) // { type: 'org'|'repo'|'user', data: {...} }
  const [detailClosing, setDetailClosing] = useState(false)
  
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
  const storeCharts = useDashboardStore(state => state.charts)
  const storeTables = useDashboardStore(state => state.tables)
  const isLoading = useDashboardStore(state => state.isLoading)
  const isFiltering = useDashboardStore(state => state.isFiltering)

  // Vista activa: si hay una vista de favoritos, sus datos tienen prioridad
  const activeViewId = useFavoritesStore(s => s.activeViewId)
  const activeViewData = useFavoritesStore(s => s.activeViewData)
  const viewActive = activeViewId && activeViewData
  const charts = viewActive ? (activeViewData.charts || null) : storeCharts
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
        displayName: org.name || org.login,
        repositories: org.quantum_repositories_count || org.public_repos || 0,
        stars: org.total_stars || 0,
        description: org.description || null,
        avatar_url: org.avatar_url || null,
        members_count: org.members_count || 0,
        quantum_focus_score: org.quantum_focus_score || 0,
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
        top_languages: org.top_languages || [],
        is_quantum_focused: org.is_quantum_focused || false,
        top_quantum_contributors: org.top_quantum_contributors || [],
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
    .sort((a, b) => b.repositories - a.repositories)
    .slice(0, 10)
  }, [charts?.organizations, organizations, repositories, selectedOrg])

  // GRÁFICO 2: Top Repos (por métrica seleccionada)
  const repoMetricLabels = {
    stargazer_count: 'Estrellas',
    fork_count: 'Forks',
    collaborators_count: 'Contribuidores',
  }
  const repoData = useMemo(() => {
    const metricLabels = repoMetricLabels
    
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
        rawName: repo.name || '',
        description: repo.description || null,
        language: repo.primary_language?.name || repo.primary_language || null,
        owner: repo.owner?.login || null,
        stargazer_count: (repo.stargazer_count ?? 0) || 0,
        fork_count: (repo.fork_count ?? 0) || 0,
        collaborators_count: (repo.collaborators_count ?? 0) || 0,
        [metricLabels[repoMetric]]: (repo[repoMetric] ?? 0) || 0,
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
        user.contributions_last_year ||
        user.contributions_to_quantum || // Campo de mockData
        (
          (user.total_commit_contributions || 0) +
          (user.total_pr_contributions || 0) +
          (user.total_pr_review_contributions || 0) +
          (user.total_issue_contributions || 0)
        )
      const repos = user.relevant_repos_count || user.quantum_repos_count || user.public_repos || 0
      // Score: raíz cuadrada de (contribuciones × repos) para balancear ambas métricas
      // Multiplicamos repos por 100 para darle más peso a la diversidad
      const collaborationScore = Math.round(Math.sqrt(contributions * (repos * 100)))
      
      return {
        login: user.login,
        name: user.name || user.login,
        displayName: user.login,
        avatar_url: user.avatar_url || null,
        score: collaborationScore,
        contributions,
        repos,
        organizations: user.organizations || [],
        has_commits: user.has_commits ?? true,
        is_mentionable: user.is_mentionable ?? false,
        commits: user.total_commit_contributions || 0,
        prs: user.total_pr_contributions || 0,
        reviews: user.total_pr_review_contributions || 0,
        issues: user.total_issue_contributions || 0,
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
        isSelected: selectedUser === user.login,
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
  const openEntityDetail = useCallback((type, data) => {
    setDetailClosing(false)
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
      if (isNaN(d.getTime())) return null
      return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { return null }
  }, [])

  // Helper: time ago for detail panel
  const timeAgo = useCallback((dateStr) => {
    if (!dateStr) return null
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return null
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
      // Ctrl+Click = seleccionar usuario para análisis
      selectUserForAnalysis(data.login)
    } else if (e?.shiftKey) {
      // Shift + Click = abrir panel de detalle
      openEntityDetail('user', data)
    } else {
      // Click normal = análisis de colaboración
      selectUserForAnalysis(data.login)
    }
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
            <p><span style={{color: '#00D4E4'}}>Repositorios:</span> <strong>{data.repositories.toLocaleString()}</strong></p>
            <p><span style={{color: '#F59E0B'}}>Estrellas:</span> <strong>{data.stars.toLocaleString()}</strong></p>
            {data.total_unique_contributors > 0 && (
              <p><span style={{color: '#9D6FDB'}}>Contributors:</span> <strong>{data.total_unique_contributors.toLocaleString()}</strong></p>
            )}
          </div>
          <span className={styles.tooltipFooter}>click para filtrar · ctrl+click para comparar</span>
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
            <p><span style={{color: '#F59E0B'}}>Estrellas:</span> <strong>{data.stargazer_count.toLocaleString()}</strong></p>
            <p><span style={{color: '#9D6FDB'}}>Forks:</span> <strong>{data.fork_count.toLocaleString()}</strong></p>
            <p><span style={{color: '#00D4E4'}}>Contribuidores:</span> <strong>{data.collaborators_count.toLocaleString()}</strong></p>
          </div>
          {data.owner && (
            <p className={styles.tooltipOwner}>
              <span style={{color: '#6b7280'}}>Org:</span> {data.owner}
            </p>
          )}
          <span className={styles.tooltipFooter}>click para filtrar · ctrl+click para comparar</span>
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
            <p><span style={{color: '#00D4E4'}}>Score:</span> <strong>{data.score.toLocaleString()}</strong></p>
            <p><span style={{color: '#9D6FDB'}}>Contribuciones:</span> <strong>{data.contributions.toLocaleString()}</strong></p>
            <p><span style={{color: '#F97316'}}>Repos:</span> <strong>{data.repos}</strong></p>
          </div>
          {(data.commits > 0 || data.prs > 0 || data.reviews > 0) && (
            <div className={styles.tooltipBreakdown}>
              {data.commits > 0 && <span className={styles.tooltipBreakdownItem}>
                <span style={{color: '#22C55E'}}>Commits</span> {data.commits.toLocaleString()}
              </span>}
              {data.prs > 0 && <span className={styles.tooltipBreakdownItem}>
                <span style={{color: '#3B82F6'}}>PRs</span> {data.prs.toLocaleString()}
              </span>}
              {data.reviews > 0 && <span className={styles.tooltipBreakdownItem}>
                <span style={{color: '#F59E0B'}}>Reviews</span> {data.reviews.toLocaleString()}
              </span>}
              {data.issues > 0 && <span className={styles.tooltipBreakdownItem}>
                <span style={{color: '#EF4444'}}>Issues</span> {data.issues.toLocaleString()}
              </span>}
            </div>
          )}
          {orgsList.length > 0 && (
            <div className={styles.tooltipOrgsList}>
              <span className={styles.tooltipOrgsLabel}>Organizaciones:</span>
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
            click para ver red de colaboración
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
                <Tooltip content={<OrgTooltip />} cursor={false} />
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
            Click para ver detalles · Ctrl+Click para comparar
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
                <Tooltip content={<RepoTooltip />} cursor={false} />
                <Bar 
                  dataKey={repoMetricLabels[repoMetric]}
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
            Click para ver detalles · Ctrl+Click para comparar
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
            Click para ver detalles · Ctrl+Click para ver red de colaboración
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

      {/* Panel de detalle de entidad (aparece al click en barra) */}
      {(detailEntity || detailClosing) && (() => {
        const entity = detailEntity
        if (!entity) return null
        const { type, data } = entity

        const typeConfig = {
          org: { 
            label: 'Organización', 
            color: '#00D4E4', 
            Icon: Building2,
            github: `https://github.com/${data.name}` 
          },
          repo: { 
            label: 'Repositorio', 
            color: '#9D6FDB', 
            Icon: GitFork,
            github: `https://github.com/${data.fullName}` 
          },
          user: { 
            label: 'Contribuidor', 
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
            onClick={closeEntityDetail}
          >
            <aside 
              className={`${styles.entityDetailCard} ${detailClosing ? styles.entityDetailCardClosing : ''}`}
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
                    title="Ver en GitHub"
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
                if (type === 'org' && data.is_verified) badges.push({ icon: Shield, label: 'Verificada', color: '#22C55E' })
                if (type === 'org' && data.is_quantum_focused) badges.push({ icon: Zap, label: 'Quantum Focus', color: '#F59E0B' })
                if (type === 'repo' && data.is_fork) badges.push({ icon: GitFork, label: 'Fork', color: '#9D6FDB' })
                if (type === 'repo' && data.is_archived) badges.push({ icon: Archive, label: 'Archivado', color: '#EF4444' })
                if (type === 'user' && data.is_hireable) badges.push({ icon: Briefcase, label: 'Disponible', color: '#22C55E' })
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
                      <span className={styles.entityDetailStatLabel}>Repos Quantum</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#F59E0B' }}>{(data.stars || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Estrellas</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#9D6FDB' }}>{(data.total_unique_contributors || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Contributors</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#00ff9f' }}>{(data.total_repositories_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Repos Totales</span>
                    </div>
                  </>
                )}
                {type === 'repo' && (
                  <>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#F59E0B' }}>{(data.stargazer_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Estrellas</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#9D6FDB' }}>{(data.fork_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Forks</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#00D4E4' }}>{(data.collaborators_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Contribuidores</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#00ff9f' }}>{(data.watchers_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Watchers</span>
                    </div>
                  </>
                )}
                {type === 'user' && (
                  <>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#00D4E4' }}>{(data.score || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Collab Score</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#9D6FDB' }}>{(data.contributions || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Contrib.</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#F59E0B' }}>{(data.followers_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Followers</span>
                    </div>
                    <div className={styles.entityDetailStat}>
                      <span className={styles.entityDetailStatValue} style={{ color: '#00ff9f' }}>{(data.public_repos_count || data.repos || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailStatLabel}>Repos</span>
                    </div>
                  </>
                )}
              </div>

              {/* === ORG SPECIFIC SECTIONS === */}
              {/* Org: Repos overview - always show when we have total_repositories_count */}
              {type === 'org' && data.total_repositories_count > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>Repositorios</h4>
                  <div className={styles.entityDetailProgressRow}>
                    <div className={styles.entityDetailProgressBar}>
                      <div className={styles.entityDetailProgressFill} style={{ width: `${Math.min(100, ((data.repositories || 0) / data.total_repositories_count) * 100)}%` }} />
                    </div>
                    <span className={styles.entityDetailProgressValue}>
                      {data.repositories || 0}<small>/{data.total_repositories_count}</small>
                    </span>
                  </div>
                  <span className={styles.entityDetailProgressHint}>
                    {data.repositories || 0} repos quantum de {data.total_repositories_count} totales
                    {data.quantum_focus_score > 0 && ` · ${data.quantum_focus_score.toFixed(1)}% enfoque quantum`}
                  </span>
                </div>
              )}

              {/* Org: Info section - ALWAYS show, combine all org metadata */}
              {type === 'org' && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>Información</h4>
                  {data.created_at && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Calendar size={12} /> Creada</span>
                      <span className={styles.entityDetailMetaValuePlain}>{formatDetailDate(data.created_at)}{timeAgo(data.created_at) && <small> ({timeAgo(data.created_at)})</small>}</span>
                    </div>
                  )}
                  {data.location && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><MapPin size={12} /> Ubicación</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.location}</span>
                    </div>
                  )}
                  {data.email && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Mail size={12} /> Email</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.email}</span>
                    </div>
                  )}
                  {data.total_unique_contributors > 0 && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Users size={12} /> Contributors</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.total_unique_contributors.toLocaleString()} contribuidores únicos en sus repos</span>
                    </div>
                  )}
                </div>
              )}

              {type === 'org' && Array.isArray(data.top_languages) && data.top_languages.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>Lenguajes principales</h4>
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
                            {count != null && <span className={styles.entityDetailLangCount}>{count} repos</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {type === 'org' && Array.isArray(data.top_quantum_contributors) && data.top_quantum_contributors.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>Top contribuidores quantum ({data.top_quantum_contributors.length})</h4>
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
                        <Globe size={13} /> Sitio web
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
                  <h4 className={styles.entityDetailSectionTitle}>Actividad del repositorio</h4>
                  <div className={styles.entityDetailActivityGrid}>
                    <div className={styles.entityDetailActivityItem}>
                      <GitCommit size={13} style={{ color: '#22C55E' }} />
                      <span className={styles.entityDetailActivityValue}>{(data.commits_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailActivityLabel}>Commits</span>
                    </div>
                    <div className={styles.entityDetailActivityItem}>
                      <GitPullRequest size={13} style={{ color: '#3B82F6' }} />
                      <span className={styles.entityDetailActivityValue}>{(data.pull_requests_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailActivityLabel}>PRs</span>
                    </div>
                    <div className={styles.entityDetailActivityItem}>
                      <AlertCircle size={13} style={{ color: '#EF4444' }} />
                      <span className={styles.entityDetailActivityValue}>{(data.issues_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailActivityLabel}>Issues</span>
                    </div>
                    <div className={styles.entityDetailActivityItem}>
                      <Tag size={13} style={{ color: '#F59E0B' }} />
                      <span className={styles.entityDetailActivityValue}>{(data.releases_count || 0).toLocaleString()}</span>
                      <span className={styles.entityDetailActivityLabel}>Releases</span>
                    </div>
                  </div>
                  {(data.merged_pull_requests_count > 0 || data.open_pull_requests_count > 0 || data.open_issues_count > 0) && (
                    <div className={styles.entityDetailSubStats}>
                      {data.merged_pull_requests_count > 0 && (
                        <span className={styles.entityDetailSubStat}><span style={{ color: '#9D6FDB' }}>{data.merged_pull_requests_count}</span> merged</span>
                      )}
                      {data.open_pull_requests_count > 0 && (
                        <span className={styles.entityDetailSubStat}><span style={{ color: '#22C55E' }}>{data.open_pull_requests_count}</span> PRs abiertos</span>
                      )}
                      {data.open_issues_count > 0 && (
                        <span className={styles.entityDetailSubStat}><span style={{ color: '#F59E0B' }}>{data.open_issues_count}</span> issues abiertas</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {type === 'repo' && Array.isArray(data.repository_topics) && data.repository_topics.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>Topics ({data.repository_topics.length})</h4>
                  <div className={styles.entityDetailTopics}>
                    {data.repository_topics.slice(0, 12).map((topic, i) => (
                      <span key={i} className={styles.entityDetailTopic}>{topic}</span>
                    ))}
                  </div>
                </div>
              )}

              {type === 'repo' && Array.isArray(data.languages) && data.languages.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>Lenguajes ({data.languages.length})</h4>
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
                      <span className={styles.entityDetailMetaLabel}><Code size={12} /> Lenguaje principal</span>
                      <button className={styles.entityDetailMetaValue} onClick={() => { setFilter('language', data.language); closeEntityDetail() }}>
                        {data.language}
                      </button>
                    </div>
                  )}
                  {data.owner && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Building2 size={12} /> Organización</span>
                      <button className={styles.entityDetailMetaValue} onClick={() => { setFilter('org', data.owner); closeEntityDetail() }}>
                        {data.owner}
                      </button>
                    </div>
                  )}
                  {data.license_info?.name && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Scale size={12} /> Licencia</span>
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
                      <span className={styles.entityDetailMetaLabel}><Tag size={12} /> Última release</span>
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
                  <h4 className={styles.entityDetailSectionTitle}>Cronología</h4>
                  <div className={styles.entityDetailTimeline}>
                    {data.created_at && (
                      <div className={styles.entityDetailTimelineItem}>
                        <Calendar size={11} />
                        <span className={styles.entityDetailTimelineLabel}>Creado</span>
                        <span className={styles.entityDetailTimelineValue}>{formatDetailDate(data.created_at)}</span>
                      </div>
                    )}
                    {data.pushed_at && (
                      <div className={styles.entityDetailTimelineItem}>
                        <Clock size={11} />
                        <span className={styles.entityDetailTimelineLabel}>Último push</span>
                        <span className={styles.entityDetailTimelineValue}>{formatDetailDate(data.pushed_at)}{timeAgo(data.pushed_at) && <small> ({timeAgo(data.pushed_at)})</small>}</span>
                      </div>
                    )}
                    {data.updated_at && (
                      <div className={styles.entityDetailTimelineItem}>
                        <Clock size={11} />
                        <span className={styles.entityDetailTimelineLabel}>Actualizado</span>
                        <span className={styles.entityDetailTimelineValue}>{formatDetailDate(data.updated_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* === USER SPECIFIC SECTIONS === */}
              {/* User contribution breakdown */}
              {type === 'user' && (data.commits > 0 || data.prs > 0 || data.reviews > 0 || data.issues > 0) && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>Desglose de contribuciones</h4>
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
                </div>
              )}

              {/* User profile info */}
              {type === 'user' && (data.company || data.location || data.created_at || data.following_count > 0) && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>Perfil</h4>
                  {data.company && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Briefcase size={12} /> Empresa</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.company}</span>
                    </div>
                  )}
                  {data.location && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><MapPin size={12} /> Ubicación</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.location}</span>
                    </div>
                  )}
                  {data.created_at && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Calendar size={12} /> Miembro desde</span>
                      <span className={styles.entityDetailMetaValuePlain}>{formatDetailDate(data.created_at)}</span>
                    </div>
                  )}
                  {data.following_count > 0 && (
                    <div className={styles.entityDetailMetaRow}>
                      <span className={styles.entityDetailMetaLabel}><Users size={12} /> Following</span>
                      <span className={styles.entityDetailMetaValuePlain}>{data.following_count.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              {/* User top languages */}
              {type === 'user' && Array.isArray(data.top_languages) && data.top_languages.length > 0 && (
                <div className={styles.entityDetailSection}>
                  <h4 className={styles.entityDetailSectionTitle}>Lenguajes principales</h4>
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
                  <h4 className={styles.entityDetailSectionTitle}>Organizaciones ({data.organizations.length})</h4>
                  <div className={styles.entityDetailOrgChips}>
                    {data.organizations.map((org, i) => {
                      const orgLogin = typeof org === 'string' ? org : org?.login
                      if (!orgLogin) return null
                      return (
                        <button key={i} className={styles.entityDetailOrgChip} onClick={() => { setFilter('org', orgLogin); closeEntityDetail() }} title={`Filtrar por ${orgLogin}`}>
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
                        <Globe size={13} /> Sitio web
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
                    <Building2 size={14} /> Filtrar por esta organización
                  </button>
                )}
                {type === 'repo' && (
                  <div className={styles.entityDetailFooterButtons}>
                    <button 
                      className={styles.entityDetailActionBtn}
                      onClick={() => { setFilter('repo', data.fullName); closeEntityDetail() }}
                    >
                      <BookOpen size={14} /> Filtrar por este repositorio
                    </button>
                    {data.homepage_url && (
                      <a href={data.homepage_url.startsWith('http') ? data.homepage_url : `https://${data.homepage_url}`} target="_blank" rel="noopener noreferrer" className={styles.entityDetailActionBtnSecondary}>
                        <Globe size={14} /> Sitio web
                      </a>
                    )}
                  </div>
                )}
                {type === 'user' && (
                  <button 
                    className={styles.entityDetailActionBtn}
                    onClick={() => { selectUserForAnalysis(data.login); closeEntityDetail() }}
                  >
                    <Users size={14} /> Ver red de colaboración
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
