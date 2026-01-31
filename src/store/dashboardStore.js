/**
 * Dashboard Store - Gestión de Estado Global con Zustand
 * =======================================================
 * 
 * Arquitectura: Single Source of Truth para filtros y drill-down interactivo
 * Patrón: Observer Pattern - Los componentes se suscriben a cambios específicos
 * 
 * Flujo de Datos:
 * 1. Usuario hace click en elemento (gráfico, tabla, etc.)
 * 2. Se ejecuta setFilter con tipo de filtro y valor
 * 3. Store actualiza estado (con toggle si es el mismo valor)
 * 4. Selectores recalculan datos filtrados automáticamente
 * 5. Componentes suscritos se re-renderizan con nueva data
 * 
 * @module dashboardStore
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { organizations, users, repositories } from '../data/mockData'

/**
 * Estado inicial del dashboard
 * Representa "sin filtros aplicados" - vista global
 */
const initialState = {
  selectedOrg: null,        // string | null - login de la organización
  selectedLanguage: null,   // string | null - lenguaje de programación
  selectedRepo: null,       // string | null - full_name del repositorio
  data: {
    organizations,
    users,
    repositories,
  },
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

      // Estado para datos del backend (API real)
      kpis: null,                     // { totalRepos, totalUsers, totalOrgs }
      topLanguages: [],               // [{ name, count, percentage }, ...]
      topOrganizations: [],           // [{ name, repoCount, totalStars }, ...]
      isLoading: false,               // Estado de carga de fetchDashboardData
      error: null,                    // Error de la última llamada a API
      metadata: null,                 // { cached, calculatedAt, expiresAt }

      // ============================================================================
      // ACCIONES
      // ============================================================================

      /**
       * Obtiene datos del dashboard desde el backend con caché inteligente
       * 
       * Flujo:
       * 1. Llama a api.getDashboardStats() → GET /dashboard/stats
       * 2. Backend consulta caché MongoDB (24h TTL)
       * 3. Si caché fresco → respuesta instantánea
       * 4. Si expirado → recalcula con agregaciones
       * 5. Actualiza estado del store con los datos
       * 
       * @example
       * const { fetchDashboardData, isLoading } = useDashboardStore()
       * await fetchDashboardData()
       */
      fetchDashboardData: async () => {
        set({ isLoading: true, error: null }, false, 'fetchDashboardData/start')
        
        try {
          const { getDashboardStats } = await import('../services/api')
          const data = await getDashboardStats()
          
          // Actualizar estado con datos del backend
          set({
            kpis: data.kpis,
            topLanguages: data.topLanguages || [],
            topOrganizations: data.topOrganizations || [],
            metadata: data.metadata,
            isLoading: false,
            error: null
          }, false, 'fetchDashboardData/success')
          
          return data
        } catch (error) {
          console.error('[fetchDashboardData] Error:', error)
          
          set({
            isLoading: false,
            error: error.message || 'Error al cargar datos del dashboard'
          }, false, 'fetchDashboardData/error')
          
          throw error
        }
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
      setFilter: (filterType, value) => {
        set((state) => {
          const currentValue = state[`selected${filterType.charAt(0).toUpperCase() + filterType.slice(1)}`]
          
          // Toggle: Si se selecciona el mismo valor, limpiar
          const shouldClear = currentValue === value
          
          switch (filterType) {
            case 'org':
              return {
                selectedOrg: shouldClear ? null : value,
                // Al cambiar de organización, limpiar repo específico
                selectedRepo: shouldClear ? state.selectedRepo : null,
              }
            
            case 'language':
              return {
                selectedLanguage: shouldClear ? null : value,
              }
            
            case 'repo':
              return {
                selectedRepo: shouldClear ? null : value,
                // Al seleccionar repo específico, inferir su lenguaje
                // (esto se puede mejorar recibiendo el objeto completo)
              }
            
            default:
              console.warn(`Tipo de filtro desconocido: ${filterType}`)
              return state
          }
        }, false, `setFilter/${filterType}/${value}`)
      },

      /**
       * Limpia todos los filtros y vuelve a la vista global
       * 
       * @example
       * resetFilters() // Vuelve al estado inicial sin filtros
       */
      resetFilters: () => {
        set(initialState, false, 'resetFilters')
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
export const useFilteredRepositories = (repositories) => {
  return useDashboardStore((state) => {
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
  })
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
export const useFilteredUsers = (users, repositories = []) => {
  return useDashboardStore((state) => {
    if (!users || users.length === 0) return []

    let filtered = users

    // Filtro 1: Organización (via company field)
    if (state.selectedOrg) {
      filtered = filtered.filter(user => 
        user.company === state.selectedOrg ||
        user.organizations?.includes(state.selectedOrg)
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
  })
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
export const useFilteredOrganizations = (organizations, repositories = []) => {
  return useDashboardStore((state) => {
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
  })
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
        user.organizations?.includes(state.selectedOrg)
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
