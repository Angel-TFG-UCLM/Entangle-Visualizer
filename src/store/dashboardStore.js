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

// AbortController para prevenir condiciones de carrera en filtros concurrentes
let filterAbortController = null

/**
 * Calcula el Set de node IDs visibles para un rango temporal dado.
 * Replica la lógica del backend (bridge users, connected repos) client-side.
 * @param {Array} nodes - graph.nodes del discover response
 * @param {Array} links - graph.links del discover response
 * @param {number|null} yearFrom - año mínimo (inclusive)
 * @param {number|null} yearTo - año máximo (inclusive), puede ser decimal para visibilidad fraccional
 * @returns {Map<string,number>|null} Map de node ID → visibilidad (0.0-1.0), o null si no hay filtro
 */
export function computeTemporalVisibility(nodes, links, yearFrom, yearTo) {
  if (!nodes || !links || nodes.length === 0) return null
  if (yearFrom == null && yearTo == null) return null

  const yearToFloor = yearTo != null ? Math.floor(yearTo) : null
  const yearFrac = yearTo != null ? yearTo - yearToFloor : 0 // fracción dentro del año

  const visible = new Map()

  // 1. Repos: visibilidad según pushed_at_year vs rango temporal
  //    - year <= yearToFloor → 1.0 (completamente visible)
  //    - year === yearToFloor + 1 → fracción (aparición progresiva)
  //    - year > yearToFloor + 1 → 0 (oculto)
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.type !== 'repo') continue
    const y = n.pushed_at_year
    if (y == null) continue
    if (yearFrom != null && y < yearFrom) continue
    let v = 0
    if (yearToFloor == null || y <= yearToFloor) {
      v = 1.0
    } else if (y === yearToFloor + 1 && yearFrac > 0) {
      v = yearFrac // slider entre años → aparición gradual
    }
    if (v > 0) visible.set(n.id, v)
  }

  // 2. Users: visibilidad = max de sus repos visibles (vía links contributed_to)
  for (let i = 0; i < links.length; i++) {
    const link = links[i]
    if (link.type !== 'contributed_to') continue
    const rv = visible.get(link.target) // visibilidad del repo
    if (rv == null) continue
    const prev = visible.get(link.source) ?? 0
    if (rv > prev) visible.set(link.source, rv)
  }

  // 3. Orgs: visibilidad = max de sus repos visibles (vía links owns)
  for (let i = 0; i < links.length; i++) {
    const link = links[i]
    if (link.type !== 'owns') continue
    const rv = visible.get(link.target) // visibilidad del repo
    if (rv == null) continue
    const prev = visible.get(link.source) ?? 0
    if (rv > prev) visible.set(link.source, rv)
  }

  return visible
}

/**
 * Estado inicial del dashboard
 * Representa "sin filtros aplicados" - vista global con datos mock
 */
const initialState = {
  selectedOrg: null,        // string | null - login de la organización (filtro simple)
  selectedLanguage: null,   // string | null - lenguaje de programación
  selectedRepo: null,       // string | null - full_name del repositorio (filtro simple)
  selectedDiscipline: null, // string | null - disciplina interdisciplinar (e.g. 'quantum_algorithms')
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
  autoStartTour: false,            // bool - arrancar tour cósmico automáticamente al abrir
  isDiscovering: false,            // Estado de carga del discovery
  
  // === FILTRO TEMPORAL ===
  temporalFilter: null,            // null | { yearFrom: number, yearTo: number }
  temporalRange: null,             // { min, max } rango de años disponibles en los datos
  sliderYear: null,                // number | null - posición actual del slider temporal
  activeNodeIds: null,             // Set | null - IDs de nodos visibles (null = todos)
  
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
            organizations: stats.graph?.organizations || (Array.isArray(stats.charts?.organizations) ? stats.charts.organizations : []),
            users: normalizeUserOrgs(stats.graph?.users || (Array.isArray(stats.charts?.users) ? stats.charts.users : stats.charts?.users?.byContributions) || []),
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
          console.log(`   📊 Charts: organizations=${typeof stats.charts?.organizations === 'object' ? Object.keys(stats.charts.organizations).join(',') : '?'}, repos keys=${typeof stats.charts?.repositories === 'object' ? Object.keys(stats.charts.repositories).join(',') : '?'}`)
          console.log(`   🔗 Graph: ${graphData?.organizations?.length} orgs, ${graphData?.repositories?.length} repos, ${graphData?.users?.length} users`)
          
          // Auto-detectar colaboración después de cargar datos
          // Si es forceRefresh, forzar también recalculación del grafo
          setTimeout(() => get().discoverCollaboration(forceRefresh), 500)
          
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
       * Refresca las métricas forzando invalidación de TODAS las cachés
       * del backend y recálculo completo.
       * 
       * Flujo: POST /dashboard/refresh-metrics (invalida) → loadFullData(true) (recalcula)
       */
      refreshMetrics: async () => {
        // 1. Invalidar todas las cachés del backend (discover, network-metrics, stats, counts)
        try {
          const { refreshDashboardMetrics } = await import('../services/api')
          await refreshDashboardMetrics()
          console.log('🧹 Todas las cachés del backend invalidadas')
        } catch (e) {
          console.warn('⚠️ Error al invalidar cachés (continuando con recálculo):', e.message)
        }
        // 2. Invalidar caché local de vistas
        try {
          const { useFavoritesStore } = await import('./favoritesStore')
          useFavoritesStore.getState().clearViewDataCache()
        } catch (_) { /* si falla, no bloquea */ }
        // 3. Recargar datos frescos (fuerza recálculo en backend)
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
        let newDiscipline = state.selectedDiscipline
        
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
          
          case 'discipline':
            newDiscipline = shouldClear ? null : value
            break
          
          default:
            console.warn(`Tipo de filtro desconocido: ${filterType}`)
            return
        }
        
        // Actualizar estado de filtros + activar loader inmediatamente
        set({
          selectedOrg: newOrg,
          selectedLanguage: newLanguage,
          selectedRepo: newRepo,
          selectedDiscipline: newDiscipline,
          isFiltering: true,
        }, false, `setFilter/${filterType}/${value}`)
        
        // Si hay una vista activa, los filtros se aplican localmente en ChartsSection
        // No necesitamos llamar al backend — los datos de la vista ya están en memoria
        try {
          const favStore = (await import('./favoritesStore')).default
          if (favStore.getState().activeViewId) {
            set({ isFiltering: false }, false, 'setFilter/viewLocal')
            console.log(`🔍 Vista activa: filtro local aplicado (${filterType}=${shouldClear ? 'null' : value})`)
            return
          }
        } catch { /* continuar con flujo normal */ }
        
        // Recargar datos del backend con los nuevos filtros
        const hasFilters = newOrg || newLanguage || newRepo || newDiscipline
        
        // Cancelar cualquier petición de filtro anterior en vuelo
        if (filterAbortController) {
          filterAbortController.abort()
        }
        filterAbortController = new AbortController()
        const currentController = filterAbortController
        
        if (hasFilters) {
          // Con filtros: llamar al backend para datos filtrados
          // Usamos isFiltering para mostrar overlay sin resetear animaciones
          // isFiltering ya está en true desde el set() inicial
          try {
            const { getDashboardStats } = await import('../services/api')
            const stats = await getDashboardStats(false, {
              org: newOrg,
              language: newLanguage,
              repo: newRepo,
              discipline: newDiscipline
            })
            
            // Verificar que esta petición no fue cancelada por una más reciente
            if (currentController.signal.aborted) return
            
            // Normalizar users en charts (soporta dict {byContributions, byRepos} y arrays)
            const normalizeUserOrgs = (users) => {
              if (users && typeof users === 'object' && !Array.isArray(users)) {
                const result = {}
                for (const [k, v] of Object.entries(users)) {
                  result[k] = normalizeUserOrgs(v)
                }
                return result
              }
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
                users: normalizeUserOrgs(stats.charts?.users)
              },
              kpis: stats.kpis,
              isFiltering: false,
            }, false, 'setFilter/filteredDataLoaded')
            
            console.log(`🔍 Datos filtrados cargados: org=${newOrg}, language=${newLanguage}, repo=${newRepo}, discipline=${newDiscipline}`)
          } catch (error) {
            if (currentController.signal.aborted) return
            console.warn('Error cargando datos filtrados:', error)
            set({ isFiltering: false }, false, 'setFilter/error')
          }
        } else {
          // Sin filtros: recargar datos base desde caché
          // isFiltering ya está en true desde el set() inicial
          try {
            const { getDashboardStats } = await import('../services/api')
            const stats = await getDashboardStats(false)
            
            // Verificar que esta petición no fue cancelada
            if (currentController.signal.aborted) return
            
            const normalizeUserOrgs = (users) => {
              if (users && typeof users === 'object' && !Array.isArray(users)) {
                const result = {}
                for (const [k, v] of Object.entries(users)) {
                  result[k] = normalizeUserOrgs(v)
                }
                return result
              }
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
                users: normalizeUserOrgs(stats.charts?.users)
              },
              kpis: stats.kpis,
              isFiltering: false,
            }, false, 'setFilter/baseDataRestored')
            
            console.log('🔍 Filtros limpiados, datos base restaurados')
          } catch (error) {
            if (currentController.signal.aborted) return
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
          selectedDiscipline: null,
          isFiltering: true,
        }, false, 'resetFilters')
        
        // Si hay vista activa, los filtros se aplican localmente → no recargar backend
        try {
          const favStore = (await import('./favoritesStore')).default
          if (favStore.getState().activeViewId) {
            set({ isFiltering: false }, false, 'resetFilters/viewLocal')
            console.log('🔍 Vista activa: filtros locales limpiados')
            return
          }
        } catch { /* continuar */ }
        
        // Recargar datos base
        try {
          const { getDashboardStats } = await import('../services/api')
          const stats = await getDashboardStats(false)
          
          const normalizeUserOrgs = (users) => {
            if (users && typeof users === 'object' && !Array.isArray(users)) {
              const result = {}
              for (const [k, v] of Object.entries(users)) {
                result[k] = normalizeUserOrgs(v)
              }
              return result
            }
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
              users: normalizeUserOrgs(stats.charts?.users)
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
          /* IMPORTANTE: en lugar de nulificar collaborationData (lo que
             cierra el modal y deja al usuario sin saber qué pasó), construimos
             un resultado vacío sintético con la misma "mode" y un flag de
             error. El modal queda abierto mostrando el empty-state con un
             mensaje claro en lugar de cerrarse sin previo aviso. */
          const fallbackMode = hasUser
            ? 'user_focus'
            : hasRepos
              ? 'repos_comparison'
              : 'orgs_comparison'
          const fallbackSelections = hasUser
            ? [state.selectedUser]
            : hasRepos
              ? state.selectedRepos
              : state.selectedOrgs
          set({
            isAnalyzing: false,
            collaborationData: {
              mode: fallbackMode,
              selections: fallbackSelections,
              shared_users: [],
              collaboration_graph: { nodes: [], links: [] },
              metrics: {},
              error: error?.response?.status === 404
                ? 'not_found'
                : (error?.message || 'unknown'),
            },
            collaborationMode: fallbackMode,
          }, false, 'analyzeCollaboration/error')
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
       * 
       * @param {boolean} forceRefresh - Forzar recálculo
       * @param {Object|null} temporalFilter - { yearFrom, yearTo } o null
       */
      discoverCollaboration: async (forceRefresh = false, temporalFilter = null) => {
        set({ isDiscovering: true }, false, 'discoverCollaboration/start')
        
        try {
          const { discoverCollaboration } = await import('../services/api')
          const result = await discoverCollaboration(forceRefresh, temporalFilter)
          
          const tRange = result.temporal_range || null
          set({
            collaborationAvailable: result.available,
            collaborationDiscovery: result,
            isDiscovering: false,
            temporalFilter: temporalFilter,
            temporalRange: tRange,
            sliderYear: tRange?.max || null,
            activeNodeIds: null, // sin filtro temporal al cargar
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
       * @param {{ autoTour?: boolean }} opts
       */
      openCollaborationGraph: (opts = {}) => {
        set({ showCollaborationGraph: true, autoStartTour: !!opts.autoTour }, false, 'openCollaborationGraph')
      },

      /**
       * Cierra la vista fullscreen del grafo de colaboración
       */
      closeCollaborationGraph: () => {
        set({ showCollaborationGraph: false, autoStartTour: false }, false, 'closeCollaborationGraph')
      },

      /**
       * Aplica un filtro temporal calcúlando visibilidad client-side (instantáneo).
       * @param {Object|null} filter - { yearFrom: number, yearTo: number } o null para quitar filtro
       */
      applyTemporalFilter: (filter) => {
        const state = get()
        const prev = state.temporalFilter
        if (JSON.stringify(prev) === JSON.stringify(filter)) return

        if (!filter) {
          // Quitar filtro → mostrar todo
          set({
            temporalFilter: null,
            sliderYear: state.temporalRange?.max || null,
            activeNodeIds: null,
          }, false, 'applyTemporalFilter/clear')
          return
        }

        const nodes = state.collaborationDiscovery?.graph?.nodes
        const links = state.collaborationDiscovery?.graph?.links
        if (!nodes || !links) return

        const activeNodeIds = computeTemporalVisibility(nodes, links, filter.yearFrom, filter.yearTo)
        set({
          temporalFilter: filter,
          sliderYear: filter.yearTo || state.temporalRange?.max || null,
          activeNodeIds,
        }, false, 'applyTemporalFilter')
      },

      /**
       * Establece el año del slider temporal (solo para settings panel y reset).
       * @param {number|null} year - año entero, o null para reset
       */
      setSliderYear: (year) => {
        const state = get()
        const range = state.temporalRange
        if (!range) return

        if (year == null || year >= range.max) {
          set({
            sliderYear: range.max,
            temporalFilter: null,
            activeNodeIds: null,
          }, false, 'setSliderYear/max')
          return
        }

        const intYear = Math.floor(year)
        const nodes = state.collaborationDiscovery?.graph?.nodes
        const links = state.collaborationDiscovery?.graph?.links
        if (!nodes || !links) return

        const activeNodeIds = computeTemporalVisibility(nodes, links, range.min, intYear)
        set({
          sliderYear: intYear,
          temporalFilter: { yearFrom: range.min, yearTo: intYear },
          activeNodeIds,
        }, false, 'setSliderYear')
      },

      // ============================================================================
      // ANÁLISIS DE RED & LENTES ANALÍTICAS
      // ============================================================================
      
      // Estado de lentes y métricas de red
      activeLens: null,              // null | 'centrality' | 'communities' | 'busFactor' | 'intensity' | 'disciplines'
      networkMetrics: null,          // Resultado completo de /collaboration/network-metrics
      isLoadingMetrics: false,
      metricsError: null,
      metricsLoadAttempted: false,   // Evita reintentos infinitos
      
      // Quantum Tunneling state
      tunnelingPath: null,           // Resultado del path finding
      isLoadingTunneling: false,
      
      /**
       * Carga métricas de red completas (centralidad, comunidades, bus factor, etc.)
       * @param {boolean} forceRefresh - Forzar recálculo del backend
       * @param {Object|null} temporalFilter - { yearFrom, yearTo } o null
       */
      loadNetworkMetrics: async (forceRefresh = false, temporalFilter = null) => {
        if (get().isLoadingMetrics) return
        set({ isLoadingMetrics: true, metricsError: null, metricsLoadAttempted: true }, false, 'loadNetworkMetrics/start')
        
        try {
          const { getNetworkMetrics } = await import('../services/api')
          const metrics = await getNetworkMetrics(forceRefresh, temporalFilter)
          set({ 
            networkMetrics: metrics, 
            isLoadingMetrics: false 
          }, false, 'loadNetworkMetrics/success')
          return true
        } catch (error) {
          console.error('[loadNetworkMetrics] Error:', error)
          set({ 
            isLoadingMetrics: false, 
            metricsError: error.message || 'Error al cargar métricas de red'
          }, false, 'loadNetworkMetrics/error')
          return false
        }
      },
      
      /**
       * Activa/desactiva una lente analítica en el universo
       * Si se pulsa la lente activa, se desactiva (toggle)
       * @param {'centrality'|'communities'|'busFactor'|'intensity'|'disciplines'|null} lens
       */
      setActiveLens: (lens) => {
        const current = get().activeLens
        const newLens = current === lens ? null : lens
        set({ activeLens: newLens }, false, `setActiveLens/${newLens || 'none'}`)
      },
      
      /**
       * Encuentra el camino más corto entre dos entidades (Quantum Tunneling)
       * @param {string} source - ID del nodo origen
       * @param {string} target - ID del nodo destino
       */
      findQuantumPath: async (source, target) => {
        if (!source || !target) return
        set({ isLoadingTunneling: true }, false, 'findQuantumPath/start')
        
        try {
          const { findQuantumPath } = await import('../services/api')
          const result = await findQuantumPath(source, target)
          set({ 
            tunnelingPath: result, 
            isLoadingTunneling: false 
          }, false, 'findQuantumPath/success')
          return result
        } catch (error) {
          console.error('[findQuantumPath] Error:', error)
          set({ isLoadingTunneling: false }, false, 'findQuantumPath/error')
          return null
        }
      },
      
      /**
       * Limpia el camino de tunneling activo
       */
      clearTunneling: () => {
        set({ tunnelingPath: null }, false, 'clearTunneling')
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
