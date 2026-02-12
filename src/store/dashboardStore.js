/**
 * Dashboard Store - Gestión de Estado Global con Zustand
 * =======================================================
 * 
 * Arquitectura: Single Source of Truth para filtros y drill-down interactivo
 * Patrón: Observer Pattern - Los componentes se suscriben a cambios específicos
 * 
 * IMPORTANTE: El backend pre-calcula todas las métricas y las cachea en MongoDB.
 * El frontend NO carga todos los documentos raw, sino métricas pre-agregadas.
 * Esto permite escalar a miles de documentos sin problemas de rendimiento.
 * 
 * Flujo de Datos:
 * 1. loadFullData() → GET /dashboard/stats (métricas pre-calculadas)
 * 2. Backend sirve desde caché MongoDB (~0ms) o recalcula si expiró
 * 3. Store actualiza: charts, graph, tables, filters, kpis
 * 4. Componentes renderizan datos ya filtrados/agregados
 * 
 * @module dashboardStore
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { shallow } from 'zustand/shallow'
import { organizations, users, repositories } from '../data/mockData'

/**
 * Estado inicial del dashboard
 * Representa "sin filtros aplicados" - vista global con datos mock
 */
const initialState = {
  selectedOrg: null,        // string | null - login de la organización (filtro simple)
  selectedLanguage: null,   // string | null - lenguaje de programación
  selectedRepo: null,       // string | null - full_name del repositorio (filtro simple)
  dataSource: 'mock',       // 'mock' | 'backend' - origen de los datos actuales
  
  // === SELECCIÓN MÚLTIPLE PARA ANÁLISIS DE COLABORACIÓN ===
  selectedRepos: [],        // string[] - repos seleccionados para comparación
  selectedOrgs: [],         // string[] - orgs seleccionadas para comparación
  selectedUser: null,       // string | null - usuario seleccionado para ver su red
  collaborationMode: null,  // 'user' | 'repos' | 'orgs' | null - modo de análisis activo
  collaborationData: null,  // Resultado del análisis de colaboración
  isAnalyzing: false,       // Estado de carga del análisis
  
  // === AUTO-DISCOVERY DE COLABORACIÓN ===
  collaborationAvailable: false,   // bool - si se detectó colaboración real
  collaborationDiscovery: null,    // Resultado completo del discover endpoint
  showCollaborationGraph: false,   // bool - si mostrar la vista fullscreen del grafo
  isDiscovering: false,            // Estado de carga del discovery
  
  // Datos legacy (mockData para fallback offline)
  data: {
    organizations,
    users,
    repositories,
  },
  
  // Datos pre-calculados del backend (nueva arquitectura)
  kpis: null,               // { totalRepos, totalUsers, totalOrgs, avgStars, avgExpertise, topLanguage }
  charts: null,             // { organizations, repositories, users, languageDistribution }
  graph: null,              // { organizations, repositories, users } - nodos pre-filtrados
  tables: null,             // { repositories, users } - top 20 para tablas
  filters: null,            // { organizations, languages } - listas para dropdowns
  metadata: null,           // { cached, calculatedAt, expiresAt, ageHours }
  
  // Estado de carga
  isLoading: false,
  isFiltering: false,       // Estado de carga específico para filtros (no resetea animaciones)
  error: null,
}

/**
 * Hook principal del Dashboard Store
 * 
 * @returns {Object} Estado y acciones del dashboard
 */
export const useDashboardStore = create(
  devtools(
    (set, get) => ({
      // ============================================================================
      // ESTADO
      // ============================================================================
      ...initialState,

      // ============================================================================
      // ACCIONES
      // ============================================================================

      /**
       * Carga TODOS los datos del dashboard desde el backend (métricas pre-calculadas).
       * 
       * El backend pre-calcula:
       * - KPIs: totales, promedios
       * - Charts: top 10 orgs, repos, users + distribución de lenguajes
       * - Graph: nodos pre-filtrados (15 orgs, 25 repos, 40 users)
       * - Tables: top 20 repos y users para detalle
       * - Filters: listas para dropdowns
       * 
       * Si el backend está offline, mantiene los mockData como fallback.
       * 
       * @param {boolean} forceRefresh - Si true, fuerza recálculo ignorando caché
       * @returns {Promise<boolean>} true si se cargaron datos reales, false si se mantienen mock
       */
      loadFullData: async (forceRefresh = false) => {
        set({ isLoading: true, error: null }, false, 'loadFullData/start')
        
        try {
          const { getDashboardStats } = await import('../services/api')
          const stats = await getDashboardStats(forceRefresh)
          
          // Normalizar users en graph y tables: organizations puede venir como objetos
          const normalizeUserOrgs = (users) => {
            if (!Array.isArray(users)) return []
            return users.map(user => ({
              ...user,
              organizations: Array.isArray(user.organizations)
                ? user.organizations.map(org => typeof org === 'string' ? org : (org?.login || org?.name || ''))
                : [],
            }))
          }
          
          // Preparar datos para el store
          const graphData = stats.graph ? {
            organizations: stats.graph.organizations || [],
            repositories: stats.graph.repositories || [],
            users: normalizeUserOrgs(stats.graph.users),
          } : null
          
          const tablesData = stats.tables ? {
            repositories: stats.tables.repositories || [],
            users: normalizeUserOrgs(stats.tables.users),
          } : null
          
          // También actualizar data legacy para compatibilidad con componentes existentes
          // Usamos los datos de graph como "data" para que los componentes funcionen
          const legacyData = {
            organizations: stats.graph?.organizations || stats.charts?.organizations || [],
            users: normalizeUserOrgs(stats.graph?.users || stats.charts?.users || []),
            repositories: stats.graph?.repositories || stats.charts?.repositories || [],
          }
          
          set({
            kpis: stats.kpis,
            charts: stats.charts,
            graph: graphData,
            tables: tablesData,
            filters: stats.filters,
            metadata: stats.metadata,
            data: legacyData,
            dataSource: 'backend',
            isLoading: false,
            error: null,
          }, false, 'loadFullData/success')
          
          console.log(`✅ Métricas cargadas: ${stats.kpis?.totalRepos} repos, ${stats.kpis?.totalUsers} users, ${stats.kpis?.totalOrgs} orgs`)
          console.log(`   📊 Charts: ${stats.charts?.organizations?.length} orgs, ${stats.charts?.repositories?.length} repos`)
          console.log(`   🔗 Graph: ${graphData?.organizations?.length} orgs, ${graphData?.repositories?.length} repos, ${graphData?.users?.length} users`)
          
          // Auto-detectar colaboración después de cargar datos
          setTimeout(() => get().discoverCollaboration(), 500)
          
          return true
        } catch (error) {
          console.warn('⚠️ Error al cargar métricas del backend, manteniendo mockData:', error.message)
          set({
            isLoading: false,
            error: error.message,
            dataSource: 'mock',
          }, false, 'loadFullData/error')
          return false
        }
      },

      /**
       * Refresca las métricas forzando recálculo en el backend.
       * Útil después de ingestas/enriquecimientos.
       */
      refreshMetrics: async () => {
        return get().loadFullData(true)
      },

      /**
       * Legacy: fetchDashboardData - Mantener por compatibilidad
       * Ahora simplemente llama a loadFullData
       */
      fetchDashboardData: async () => {
        return get().loadFullData(false)
      },

      /**
       * Establece un filtro con lógica de toggle
       * 
       * Comportamiento inteligente:
       * - Si el valor es diferente al actual: aplica el filtro
       * - Si el valor es igual al actual: remueve el filtro (toggle off)
       * - Limpia filtros incompatibles (ej: al seleccionar org, limpia repo específico)
       * 
       * @param {string} filterType - Tipo de filtro: 'org' | 'language' | 'repo'
       * @param {string|null} value - Valor del filtro o null para limpiar
       * 
       * @example
       * // Seleccionar organización IBM
       * setFilter('org', 'IBM')
       * 
       * // Hacer click de nuevo en IBM -> toggle off (limpiar filtro)
       * setFilter('org', 'IBM') // selectedOrg vuelve a null
       */
      setFilter: async (filterType, value) => {
        const state = get()
        const currentValue = state[`selected${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`]
        
        // Toggle: Si se selecciona el mismo valor, limpiar
        const shouldClear = currentValue === value
        
        let newOrg = state.selectedOrg
        let newLanguage = state.selectedLanguage
        let newRepo = state.selectedRepo
        
        switch (filterType) {
          case 'org':
            newOrg = shouldClear ? null : value
            newRepo = shouldClear ? state.selectedRepo : null
            break
          
          case 'language':
            newLanguage = shouldClear ? null : value
            break
          
          case 'repo':
            newRepo = shouldClear ? null : value
            break
          
          default:
            console.warn(`Tipo de filtro desconocido: ${filterType}`)
            return
        }
        
        // Actualizar estado de filtros primero
        set({
          selectedOrg: newOrg,
          selectedLanguage: newLanguage,
          selectedRepo: newRepo,
        }, false, `setFilter/${filterType}/${value}`)
        
        // Recargar datos del backend con los nuevos filtros
        const hasFilters = newOrg || newLanguage || newRepo
        
        if (hasFilters) {
          // Con filtros: llamar al backend para datos filtrados
          // Usamos isFiltering para mostrar overlay sin resetear animaciones
          set({ isFiltering: true }, false, 'setFilter/loading')
          try {
            const { getDashboardStats } = await import('../services/api')
            const stats = await getDashboardStats(false, {
              org: newOrg,
              language: newLanguage,
              repo: newRepo
            })
            
            // Normalizar users en charts
            const normalizeUserOrgs = (users) => {
              if (!Array.isArray(users)) return []
              return users.map(user => ({
                ...user,
                organizations: Array.isArray(user.organizations)
                  ? user.organizations.map(org => typeof org === 'string' ? org : (org?.login || org?.name || ''))
                  : [],
              }))
            }
            
            // Actualizar solo charts (los datos filtrados)
            set({
              charts: {
                ...stats.charts,
                users: normalizeUserOrgs(stats.charts?.users || [])
              },
              kpis: stats.kpis,
              isFiltering: false,
            }, false, 'setFilter/filteredDataLoaded')
            
            console.log(`🔍 Datos filtrados cargados: org=${newOrg}, language=${newLanguage}, repo=${newRepo}`)
          } catch (error) {
            console.warn('Error cargando datos filtrados:', error)
            set({ isFiltering: false }, false, 'setFilter/error')
          }
        } else {
          // Sin filtros: recargar datos base desde caché
          set({ isFiltering: true }, false, 'setFilter/restoringBase')
          try {
            const { getDashboardStats } = await import('../services/api')
            const stats = await getDashboardStats(false)
            
            const normalizeUserOrgs = (users) => {
              if (!Array.isArray(users)) return []
              return users.map(user => ({
                ...user,
                organizations: Array.isArray(user.organizations)
                  ? user.organizations.map(org => typeof org === 'string' ? org : (org?.login || org?.name || ''))
                  : [],
              }))
            }
            
            set({
              charts: {
                ...stats.charts,
                users: normalizeUserOrgs(stats.charts?.users || [])
              },
              kpis: stats.kpis,
              isFiltering: false,
            }, false, 'setFilter/baseDataRestored')
            
            console.log('🔍 Filtros limpiados, datos base restaurados')
          } catch (error) {
            console.warn('Error restaurando datos base:', error)
            set({ isFiltering: false }, false, 'setFilter/restoreError')
          }
        }
      },

      /**
       * Limpia todos los filtros y vuelve a la vista global
       * 
       * @example
       * resetFilters() // Vuelve al estado inicial sin filtros
       */
      resetFilters: async () => {
        set({
          selectedOrg: null,
          selectedLanguage: null,
          selectedRepo: null,
          isFiltering: true,
        }, false, 'resetFilters')
        
        // Recargar datos base
        try {
          const { getDashboardStats } = await import('../services/api')
          const stats = await getDashboardStats(false)
          
          const normalizeUserOrgs = (users) => {
            if (!Array.isArray(users)) return []
            return users.map(user => ({
              ...user,
              organizations: Array.isArray(user.organizations)
                ? user.organizations.map(org => typeof org === 'string' ? org : (org?.login || org?.name || ''))
                : [],
            }))
          }
          
          set({
            charts: {
              ...stats.charts,
              users: normalizeUserOrgs(stats.charts?.users || [])
            },
            kpis: stats.kpis,
            isFiltering: false,
          }, false, 'resetFilters/dataRestored')
        } catch (error) {
          console.warn('Error restaurando datos:', error)
          set({ isFiltering: false }, false, 'resetFilters/error')
        }
      },

      // ============================================================================
      // ANÁLISIS DE COLABORACIÓN - SELECCIÓN MÚLTIPLE
      // ============================================================================

      /**
       * Toggle selección de repo para análisis de colaboración
       * Permite seleccionar múltiples repos para comparar usuarios compartidos
       * 
       * @param {string} repoFullName - full_name del repositorio (owner/name)
       */
      toggleRepoSelection: (repoFullName) => {
        const state = get()
        const currentSelection = state.selectedRepos
        
        const isSelected = currentSelection.includes(repoFullName)
        const newSelection = isSelected
          ? currentSelection.filter(r => r !== repoFullName)
          : [...currentSelection, repoFullName]
        
        set({
          selectedRepos: newSelection,
          collaborationMode: newSelection.length >= 2 ? 'repos' : null,
          // Limpiar otras selecciones de colaboración
          selectedOrgs: newSelection.length > 0 ? [] : state.selectedOrgs,
          selectedUser: newSelection.length > 0 ? null : state.selectedUser,
        }, false, `toggleRepoSelection/${repoFullName}`)
        
        // Auto-trigger análisis si hay 2+ repos
        if (newSelection.length >= 2) {
          get().analyzeCollaboration()
        } else {
          set({ collaborationData: null }, false, 'clearCollaborationData')
        }
      },

      /**
       * Toggle selección de org para análisis de colaboración  
       * Permite seleccionar múltiples orgs para comparar usuarios compartidos
       * 
       * @param {string} orgLogin - login de la organización
       */
      toggleOrgSelection: (orgLogin) => {
        const state = get()
        const currentSelection = state.selectedOrgs
        
        const isSelected = currentSelection.includes(orgLogin)
        const newSelection = isSelected
          ? currentSelection.filter(o => o !== orgLogin)
          : [...currentSelection, orgLogin]
        
        set({
          selectedOrgs: newSelection,
          collaborationMode: newSelection.length >= 2 ? 'orgs' : null,
          // Limpiar otras selecciones de colaboración
          selectedRepos: newSelection.length > 0 ? [] : state.selectedRepos,
          selectedUser: newSelection.length > 0 ? null : state.selectedUser,
        }, false, `toggleOrgSelection/${orgLogin}`)
        
        // Auto-trigger análisis si hay 2+ orgs
        if (newSelection.length >= 2) {
          get().analyzeCollaboration()
        } else {
          set({ collaborationData: null }, false, 'clearCollaborationData')
        }
      },

      /**
       * Seleccionar un usuario para ver su red de colaboración
       * 
       * @param {string|null} userLogin - login del usuario o null para limpiar
       */
      selectUserForAnalysis: (userLogin) => {
        const state = get()
        
        // Toggle: si ya está seleccionado, deseleccionar
        const newUser = state.selectedUser === userLogin ? null : userLogin
        
        set({
          selectedUser: newUser,
          collaborationMode: newUser ? 'user' : null,
          // Limpiar otras selecciones de colaboración
          selectedRepos: newUser ? [] : state.selectedRepos,
          selectedOrgs: newUser ? [] : state.selectedOrgs,
        }, false, `selectUserForAnalysis/${userLogin}`)
        
        // Auto-trigger análisis si hay usuario
        if (newUser) {
          get().analyzeCollaboration()
        } else {
          set({ collaborationData: null }, false, 'clearCollaborationData')
        }
      },

      /**
       * Ejecuta el análisis de colaboración basado en las selecciones actuales
       */
      analyzeCollaboration: async () => {
        const state = get()
        
        // Determinar qué analizar
        const hasRepos = state.selectedRepos.length >= 2
        const hasOrgs = state.selectedOrgs.length >= 2
        const hasUser = !!state.selectedUser
        
        if (!hasRepos && !hasOrgs && !hasUser) {
          console.log('⚠️ Nada que analizar - no hay selecciones válidas')
          return
        }
        
        set({ isAnalyzing: true }, false, 'analyzeCollaboration/start')
        
        try {
          const { analyzeCollaboration } = await import('../services/api')
          
          let result
          if (hasUser) {
            result = await analyzeCollaboration({ user: state.selectedUser })
          } else if (hasRepos) {
            result = await analyzeCollaboration({ repos: state.selectedRepos })
          } else if (hasOrgs) {
            result = await analyzeCollaboration({ orgs: state.selectedOrgs })
          }
          
          set({
            collaborationData: result,
            collaborationMode: result?.mode || null,
            isAnalyzing: false,
          }, false, 'analyzeCollaboration/success')
          
          console.log(`✅ Análisis de colaboración: ${result?.mode} - ${result?.shared_users?.length || 0} usuarios compartidos`)
        } catch (error) {
          console.error('Error en análisis de colaboración:', error)
          set({ isAnalyzing: false, collaborationData: null }, false, 'analyzeCollaboration/error')
        }
      },

      /**
       * Limpia todas las selecciones de colaboración
       */
      clearCollaborationSelections: () => {
        set({
          selectedRepos: [],
          selectedOrgs: [],
          selectedUser: null,
          collaborationMode: null,
          collaborationData: null,
          isAnalyzing: false,
        }, false, 'clearCollaborationSelections')
      },

      // ============================================================================
      // AUTO-DISCOVERY DE COLABORACIÓN
      // ============================================================================

      /**
       * Auto-detecta patrones de colaboración analizando toda la BBDD.
       * Se llama automáticamente después de loadFullData() si el backend está online.
       * 
       * Si encuentra colaboración real, establece collaborationAvailable = true
       * y el banner aparecerá en la UI invitando al usuario a explorar el grafo.
       */
      discoverCollaboration: async () => {
        set({ isDiscovering: true }, false, 'discoverCollaboration/start')
        
        try {
          const { discoverCollaboration } = await import('../services/api')
          const result = await discoverCollaboration()
          
          set({
            collaborationAvailable: result.available,
            collaborationDiscovery: result,
            isDiscovering: false,
          }, false, 'discoverCollaboration/success')
          
          if (result.available) {
            console.log(`🔍 ¡Colaboración detectada! ${result.summary}`)
          } else {
            console.log('🔍 No se detectó colaboración entre los datos actuales')
          }
          
          return result.available
        } catch (error) {
          console.warn('⚠️ Error en auto-discovery de colaboración:', error.message)
          set({
            collaborationAvailable: false,
            collaborationDiscovery: null,
            isDiscovering: false,
          }, false, 'discoverCollaboration/error')
          return false
        }
      },

      /**
       * Abre la vista fullscreen del grafo de colaboración
       */
      openCollaborationGraph: () => {
        set({ showCollaborationGraph: true }, false, 'openCollaborationGraph')
      },

      /**
       * Cierra la vista fullscreen del grafo de colaboración
       */
      closeCollaborationGraph: () => {
        set({ showCollaborationGraph: false }, false, 'closeCollaborationGraph')
      },

      /**
       * Verifica si el modo de análisis de colaboración está activo
       */
      isCollaborationModeActive: () => {
        const state = get()
        return !!(
          state.selectedRepos.length >= 2 ||
          state.selectedOrgs.length >= 2 ||
          state.selectedUser
        )
      },

      // ============================================================================
      // SELECTORES COMPUTADOS
      // ============================================================================
      // Nota: Estos selectores están aquí por conveniencia, pero también se pueden
      // usar como hooks separados (ver más abajo)

      /**
       * Obtiene resumen del estado actual de filtros
       * Útil para debugging y breadcrumbs
       */
      getActiveFilters: () => {
        const state = get()
        const active = []
        
        if (state.selectedOrg) active.push({ type: 'org', value: state.selectedOrg })
        if (state.selectedLanguage) active.push({ type: 'language', value: state.selectedLanguage })
        if (state.selectedRepo) active.push({ type: 'repo', value: state.selectedRepo })
        
        return active
      },

      /**
       * Verifica si hay algún filtro activo
       * @returns {boolean}
       */
      hasActiveFilters: () => {
        const state = get()
        return !!(state.selectedOrg || state.selectedLanguage || state.selectedRepo)
      },
    }),
    {
      name: 'entangle-dashboard-store',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)

// ============================================================================
// SELECTORES INTELIGENTES (Custom Hooks)
// ============================================================================
// Estos hooks encapsulan la lógica de filtrado y se reutilizan en componentes

/**
 * Hook: Filtra repositorios según los filtros activos
 * 
 * Lógica de negocio:
 * 1. Si hay org seleccionada: solo repos de esa org
 * 2. Si hay lenguaje seleccionado: solo repos de ese lenguaje
 * 3. Si hay repo específico: solo ese repo
 * 4. Combina filtros con AND lógico
 * 
 * @param {Array} repositories - Array completo de repositorios
 * @returns {Array} Repositorios filtrados
 * 
 * @example
 * const FilteredReposList = () => {
 *   const filteredRepos = useFilteredRepositories(allRepositories)
 *   return <ul>{filteredRepos.map(r => <li>{r.name}</li>)}</ul>
 * }
 */
export const useFilteredRepositories = () => {
  return useDashboardStore((state) => {
    const repositories = state.data.repositories
    if (!repositories || repositories.length === 0) return []

    let filtered = repositories

    // Filtro 1: Organización
    if (state.selectedOrg) {
      filtered = filtered.filter(repo => 
        repo.owner?.login === state.selectedOrg ||
        repo.organization?.login === state.selectedOrg
      )
    }

    // Filtro 2: Lenguaje
    if (state.selectedLanguage) {
      filtered = filtered.filter(repo => 
        repo.primary_language?.name === state.selectedLanguage ||
        repo.language === state.selectedLanguage
      )
    }

    // Filtro 3: Repositorio específico
    if (state.selectedRepo) {
      filtered = filtered.filter(repo => repo.full_name === state.selectedRepo)
    }

    return filtered
  }, shallow)
}

/**
 * Hook: Filtra usuarios según los filtros activos
 * 
 * Lógica de negocio:
 * 1. Si hay org seleccionada: solo usuarios de esa org (campo company)
 * 2. Si hay repo seleccionado: usuarios que contribuyen a ese repo
 * 3. Ordena por quantum_expertise_score descendente
 * 
 * @param {Array} users - Array completo de usuarios
 * @param {Array} repositories - Array de repositorios (para filtrar por colaboradores)
 * @returns {Array} Usuarios filtrados y ordenados
 */
export const useFilteredUsers = () => {
  return useDashboardStore((state) => {
    const users = state.data.users
    const repositories = state.data.repositories
    if (!users || users.length === 0) return []

    let filtered = users

    // Filtro 1: Organización (via company field)
    if (state.selectedOrg) {
      filtered = filtered.filter(user => 
        user.company === state.selectedOrg ||
        user.organizations?.some(org => (typeof org === 'string' ? org : org?.login) === state.selectedOrg)
      )
    }

    // Filtro 2: Repositorio específico (colaboradores)
    if (state.selectedRepo && repositories.length > 0) {
      const selectedRepoObj = repositories.find(r => r.full_name === state.selectedRepo)
      if (selectedRepoObj?.collaborators) {
        const collaboratorLogins = selectedRepoObj.collaborators.map(c => c.login)
        filtered = filtered.filter(user => collaboratorLogins.includes(user.login))
      }
    }

    // Ordenar por expertise quantum (mayor a menor)
    return filtered.sort((a, b) => 
      (b.quantum_expertise_score || 0) - (a.quantum_expertise_score || 0)
    )
  }, shallow)
}

/**
 * Hook: Filtra organizaciones según los filtros activos
 * 
 * Lógica de negocio:
 * 1. Si hay org seleccionada: solo esa organización
 * 2. Si hay lenguaje seleccionado: orgs que tienen repos en ese lenguaje
 * 3. Ordena por total_repositories descendente
 * 
 * @param {Array} organizations - Array completo de organizaciones
 * @param {Array} repositories - Array de repositorios (para filtrar por lenguaje)
 * @returns {Array} Organizaciones filtradas y ordenadas
 */
export const useFilteredOrganizations = () => {
  return useDashboardStore((state) => {
    const organizations = state.data.organizations
    const repositories = state.data.repositories
    if (!organizations || organizations.length === 0) return []

    let filtered = organizations

    // Filtro 1: Organización específica
    if (state.selectedOrg) {
      filtered = filtered.filter(org => org.login === state.selectedOrg)
    }

    // Filtro 2: Lenguaje (orgs que tienen repos en ese lenguaje)
    if (state.selectedLanguage && repositories.length > 0) {
      const orgsWithLanguage = new Set(
        repositories
          .filter(r => 
            r.primary_language?.name === state.selectedLanguage ||
            r.language === state.selectedLanguage
          )
          .map(r => r.owner?.login || r.organization?.login)
          .filter(Boolean)
      )
      
      filtered = filtered.filter(org => orgsWithLanguage.has(org.login))
    }

    // Ordenar por número de repositorios
    return filtered.sort((a, b) => 
      (b.total_repositories || 0) - (a.total_repositories || 0)
    )
  }, shallow)
}

/**
 * Hook: Calcula estadísticas agregadas basadas en filtros
 * 
 * @param {Object} data - Objeto con { repositories, users, organizations }
 * @returns {Object} KPIs calculados
 * 
 * @example
 * const stats = useFilteredStats({ repositories, users, organizations })
 * // stats = { totalRepos: 5, avgStars: 234.5, topLanguage: 'Python', ... }
 */
export const useFilteredStats = (data) => {
  // Suscribirse al store para obtener filtros actuales
  return useDashboardStore((state) => {
    // Validar datos de entrada
    const repositories = data?.repositories || []
    const users = data?.users || []
    const organizations = data?.organizations || []

    // --- Filtrar repositorios ---
    let filteredRepos = repositories
    if (state.selectedOrg) {
      filteredRepos = filteredRepos.filter(repo => 
        repo.owner?.login === state.selectedOrg ||
        repo.organization?.login === state.selectedOrg
      )
    }
    if (state.selectedLanguage) {
      filteredRepos = filteredRepos.filter(repo => 
        repo.primary_language?.name === state.selectedLanguage ||
        repo.language === state.selectedLanguage
      )
    }
    if (state.selectedRepo) {
      filteredRepos = filteredRepos.filter(repo => repo.full_name === state.selectedRepo)
    }

    // --- Filtrar usuarios ---
    let filteredUsers = users
    if (state.selectedOrg) {
      filteredUsers = filteredUsers.filter(user => 
        user.company === state.selectedOrg ||
        user.organizations?.some(org => (typeof org === 'string' ? org : org?.login) === state.selectedOrg)
      )
    }
    if (state.selectedRepo && repositories.length > 0) {
      const selectedRepoObj = repositories.find(r => r.full_name === state.selectedRepo)
      if (selectedRepoObj?.collaborators) {
        const collaboratorLogins = selectedRepoObj.collaborators.map(c => c.login)
        filteredUsers = filteredUsers.filter(user => collaboratorLogins.includes(user.login))
      }
    }

    // --- Filtrar organizaciones ---
    let filteredOrgs = organizations
    if (state.selectedOrg) {
      filteredOrgs = filteredOrgs.filter(org => org.login === state.selectedOrg)
    }
    if (state.selectedLanguage && repositories.length > 0) {
      const orgsWithLanguage = new Set(
        repositories
          .filter(r => 
            r.primary_language?.name === state.selectedLanguage ||
            r.language === state.selectedLanguage
          )
          .map(r => r.owner?.login || r.organization?.login)
          .filter(Boolean)
      )
      filteredOrgs = filteredOrgs.filter(org => orgsWithLanguage.has(org.login))
    }

    // --- Calcular KPIs ---
    const totalRepos = filteredRepos.length
    const totalUsers = filteredUsers.length
    const totalOrgs = filteredOrgs.length

    const avgStars = totalRepos > 0
      ? filteredRepos.reduce((sum, r) => sum + (r.stargazer_count || r.stars || 0), 0) / totalRepos
      : 0

    const avgExpertise = totalUsers > 0
      ? filteredUsers.reduce((sum, u) => sum + (u.quantum_expertise_score || 0), 0) / totalUsers
      : 0

    // Top lenguaje
    const languageCounts = {}
    filteredRepos.forEach(repo => {
      const lang = repo.primary_language?.name || repo.language
      if (lang) {
        languageCounts[lang] = (languageCounts[lang] || 0) + 1
      }
    })
    const topLanguage = Object.entries(languageCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A'

    return {
      totalRepos,
      totalUsers,
      totalOrgs,
      avgStars: Math.round(avgStars),
      avgExpertise: avgExpertise.toFixed(2),
      topLanguage,
      languageDistribution: languageCounts,
    }
  })
}

// ============================================================================
// UTILIDADES DE DEBUGGING
// ============================================================================

/**
 * Hook para obtener el estado completo (solo para debugging)
 * NO usar en producción - puede causar re-renders innecesarios
 */
export const useDebugStore = () => {
  if (process.env.NODE_ENV !== 'development') {
    console.warn('useDebugStore solo debe usarse en desarrollo')
  }
  return useDashboardStore()
}
