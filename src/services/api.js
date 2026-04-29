/**
 * ENTANGLE API CLIENT
 * ===================
 * Service Layer para comunicación con el Backend FastAPI.
 * 
 * Arquitectura: Separación de responsabilidades - Los componentes NO hacen fetch directamente.
 * Esta capa abstrae axios y centraliza la configuración (baseURL, headers, interceptors).
 */

import axios from 'axios';

// === CONFIGURACIÓN BASE ===
// Lee la URL del backend desde variables de entorno
// - Desarrollo (npm run dev): usa .env.development → http://localhost:8000
// - Producción (npm run build): usa .env.production → Azure URL
const BASE_URL = import.meta.env.VITE_API_URL;

// Validación: asegurar que la variable de entorno esté definida
if (!BASE_URL) {
  console.error('❌ ERROR: VITE_API_URL no está definida en las variables de entorno');
  throw new Error('VITE_API_URL no configurada. Revisa tus archivos .env');
}

console.log(`🔗 API Client configurado para: ${BASE_URL}`);

// Instancia configurada de Axios
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 60000, // 60s timeout (cálculos pesados de dashboard pueden tardar ~35s)
  headers: {
    'Content-Type': 'application/json',
  },
});

// === INTERCEPTORES ===
// Request Interceptor: Agregar tokens de autenticación en el futuro
apiClient.interceptors.request.use(
  (config) => {
    // Aquí podrías agregar: config.headers.Authorization = `Bearer ${token}`
    console.log(`[API Request] ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Response Interceptor: Manejo centralizado de errores
apiClient.interceptors.response.use(
  (response) => {
    console.log(`[API Response] ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    if (error.response) {
      // El servidor respondió con un status code fuera del rango 2xx
      console.error(`[API Error] ${error.response.status} - ${error.response.data?.message || error.message}`);
    } else if (error.request) {
      // La request se hizo pero no hubo respuesta (red caída, CORS, etc.)
      console.error('[API Error] No response received:', error.request);
    } else {
      // Error al configurar la request
      console.error('[API Error] Request setup failed:', error.message);
    }
    return Promise.reject(error);
  }
);

// === FUNCIONES DE API ===

/**
 * Health Check: Verifica que el backend esté Online y mide latencia
 * @returns {Promise<{status: string, message: string, latencyMs: number, timestamp: string, data: object}>}
 */
export async function checkHealth() {
  const startedAt = performance.now();
  try {
    // FastAPI genera automáticamente /docs (Swagger UI)
    // El endpoint raíz "/" debería retornar info básica o redirigir
    const response = await apiClient.get('/');
    const latencyMs = Math.round(performance.now() - startedAt);
    return {
      status: 'online',
      message: 'Backend conectado correctamente',
      latencyMs,
      timestamp: new Date().toISOString(),
      data: response.data,
    };
  } catch (error) {
    return {
      status: 'offline',
      message: error.message || 'No se pudo conectar con el backend',
      latencyMs: Math.round(performance.now() - startedAt),
      timestamp: new Date().toISOString(),
      error: error,
    };
  }
}

/**
 * Obtener estadísticas simples (Simple counts - Legacy)
 * Endpoint: GET /stats
 * @returns {Promise<{repositories: number, users: number, organizations: number}>}
 */
export async function getSimpleStats() {
  try {
    const response = await apiClient.get('/stats');
    return response.data;
  } catch (error) {
    console.error('[getSimpleStats] Error:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas completas del dashboard con sistema de caché inteligente
 * 
 * Endpoint: GET /dashboard/stats
 * 
 * Respuesta COMPLETA (pre-calculada en backend):
 * - kpis: { totalRepos, totalUsers, totalOrgs, avgStars, avgExpertise, topLanguage }
 * - charts: { organizations, repositories, users, languageDistribution }
 * - graph: { organizations, repositories, users } (nodos pre-filtrados para el grafo)
 * - tables: { repositories, users } (top 20 para tablas de detalle)
 * - filters: { organizations, languages } (listas para dropdowns)
 * - metadata: { cached, calculatedAt, expiresAt, ageHours }
 * 
 * Caché Backend: Los datos se cachean en MongoDB por 1h.
 * Si el caché está fresco, la respuesta es instantánea (~0ms).
 * 
 * @param {boolean} forceRefresh - Si true, fuerza recálculo ignorando caché
 * @param {Object} filters - Filtros opcionales { org, language, repo, collabType, includeBots }
 * @returns {Promise<Object>} Dashboard stats completo
 */
export async function getDashboardStats(forceRefresh = false, filters = {}) {
  try {
    const params = {};
    
    if (forceRefresh) params.force_refresh = true;
    if (filters.org) params.org = filters.org;
    if (filters.language) params.language = filters.language;
    if (filters.repo) params.repo = filters.repo;
    if (filters.collabType) params.collab_type = filters.collabType;
    if (filters.includeBots !== undefined) params.include_bots = filters.includeBots;
    if (filters.discipline) params.discipline = filters.discipline;
    
    const response = await apiClient.get('/dashboard/stats', { params });
    
    // Log para debugging (ver si viene de caché o calculado)
    if (response.data.metadata?.cached) {
      console.log(`📊 Dashboard stats from CACHE (${response.data.metadata.ageHours}h old)`);
    } else if (response.data.metadata?.activeFilters) {
      console.log('📊 Dashboard stats FILTERED:', response.data.metadata.activeFilters);
    } else {
      console.log('📊 Dashboard stats CALCULATED fresh');
    }
    
    return response.data;
  } catch (error) {
    console.error('[getDashboardStats] Error:', error);
    // Propagar el error para que el componente pueda manejarlo con retry
    throw error;
  }
}

/**
 * Fuerza el recálculo de métricas del dashboard
 * Útil después de ingestas/enriquecimientos
 * @returns {Promise<Object>} Dashboard stats recalculado
 */
export async function refreshDashboardMetrics() {
  try {
    const response = await apiClient.post('/dashboard/refresh-metrics');
    console.log('🔄 Dashboard metrics refreshed');
    return response.data;
  } catch (error) {
    console.error('[refreshDashboardMetrics] Error:', error);
    throw error;
  }
}

/**
 * Obtener lista de repositorios
 * Endpoint esperado: GET /api/v1/repositories
 * @param {Object} params - Query parameters (page, limit, etc.)
 * @returns {Promise<Array>}
 */
export async function getRepositories(params = {}) {
  try {
    const response = await apiClient.get('/repositories', { params });
    return response.data;
  } catch (error) {
    console.error('[getRepositories] Error:', error);
    throw error;
  }
}

/**
 * Obtener lista de usuarios
 * Endpoint esperado: GET /api/v1/users
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>}
 */
export async function getUsers(params = {}) {
  try {
    const response = await apiClient.get('/users', { params });
    return response.data;
  } catch (error) {
    console.error('[getUsers] Error:', error);
    throw error;
  }
}

/**
 * Obtener perfil completo de un usuario por login.
 * Usado cuando el usuario no está en el top 10 del dashboard.
 * Endpoint: GET /api/v1/users/profile/:login
 * @param {string} login - Login del usuario
 * @returns {Promise<Object>}
 */
export async function getUserProfile(login) {
  try {
    const response = await apiClient.get(`/users/profile/${encodeURIComponent(login)}`);
    return response.data;
  } catch (error) {
    console.error('[getUserProfile] Error:', error);
    throw error;
  }
}

/**
 * Obtener lista de organizaciones
 * Endpoint esperado: GET /api/v1/organizations
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>}
 */
export async function getOrganizations(params = {}) {
  try {
    const response = await apiClient.get('/organizations', { params });
    return response.data;
  } catch (error) {
    console.error('[getOrganizations] Error:', error);
    throw error;
  }
}

// === COLLABORATION ANALYSIS ===

/**
 * Analizar colaboraciones entre repos, orgs o de un usuario específico
 * 
 * Modos:
 * 1. user: Ver red de colaboración de un usuario (con quién trabaja y dónde)
 * 2. repos: Encontrar usuarios compartidos entre 2+ repos
 * 3. orgs: Encontrar usuarios compartidos entre 2+ organizaciones
 * 
 * @param {Object} params - { user?, repos?, orgs? }
 * @returns {Promise<Object>} { mode, shared_users, collaboration_graph, metrics }
 */
export async function analyzeCollaboration(params = {}) {
  try {
    const queryParams = {};
    
    if (params.user) {
      queryParams.user = params.user;
    }
    if (params.repos && params.repos.length >= 2) {
      queryParams.repos = params.repos;
    }
    if (params.orgs && params.orgs.length >= 2) {
      queryParams.orgs = params.orgs;
    }
    
    const response = await apiClient.post('/collaboration/analyze', null, { 
      params: queryParams,
      // FastAPI espera arrays como ?repos=a&repos=b (repeat), no ?repos[]=a&repos[]=b
      paramsSerializer: { indexes: null }
    });
    console.log(`🔗 Collaboration analysis: ${response.data.mode} mode`);
    return response.data;
  } catch (error) {
    console.error('[analyzeCollaboration] Error:', error);
    throw error;
  }
}

/**
 * Obtener red de colaboración de un usuario específico (shortcut GET)
 * @param {string} userLogin - Login del usuario
 * @returns {Promise<Object>} Red de colaboración del usuario
 */
export async function getUserCollaborationNetwork(userLogin) {
  try {
    const response = await apiClient.get(`/collaboration/user/${userLogin}`);
    console.log(`🔗 User collaboration network: ${userLogin}`);
    return response.data;
  } catch (error) {
    console.error('[getUserCollaborationNetwork] Error:', error);
    throw error;
  }
}

/**
 * Auto-descubre patrones de colaboración analizando toda la BBDD.
 * Busca bridge users, repos conectados, colaboración cross-org.
 * 
 * @param {boolean} forceRefresh - Si true, ignora caché y recalcula el grafo
 * @param {Object} [temporalFilter] - Filtro temporal opcional
 * @param {number} [temporalFilter.yearFrom] - Año inicio (incluido)
 * @param {number} [temporalFilter.yearTo] - Año fin (incluido)
 * @returns {Promise<Object>} { available, summary, graph, metrics, bridge_users, connected_pairs, temporal_filter }
 */
export async function discoverCollaboration(forceRefresh = false, temporalFilter = null) {
  try {
    const params = forceRefresh ? { force: true } : {};
    if (temporalFilter?.yearFrom) params.year_from = temporalFilter.yearFrom;
    if (temporalFilter?.yearTo) params.year_to = temporalFilter.yearTo;
    const response = await apiClient.get('/collaboration/discover', {
      params,
      timeout: 120000, // 2 min - la construcción del grafo completo puede tardar
    });
    console.log(`🔍 Collaboration discovery: available=${response.data.available}, forced=${forceRefresh}, temporal=${temporalFilter ? `${temporalFilter.yearFrom || '∞'}–${temporalFilter.yearTo || '∞'}` : 'none'}`);
    return response.data;
  } catch (error) {
    console.error('[discoverCollaboration] Error:', error);
    throw error;
  }
}

/**
 * Obtiene métricas de red de colaboración (centralidad, comunidades, bus factor).
 * Timeout extendido: la computación de grafos con ~30K nodos puede tardar ~90s.
 * 
 * @param {boolean} forceRefresh - Si forzar recálculo
 * @param {Object} [temporalFilter] - Filtro temporal opcional
 * @param {number} [temporalFilter.yearFrom] - Año inicio (incluido)
 * @param {number} [temporalFilter.yearTo] - Año fin (incluido)
 * @returns {Promise<Object>} { node_metrics, communities, global_metrics }
 */
export async function getNetworkMetrics(forceRefresh = false, temporalFilter = null) {
  try {
    const params = { force_refresh: forceRefresh };
    if (temporalFilter?.yearFrom) params.year_from = temporalFilter.yearFrom;
    if (temporalFilter?.yearTo) params.year_to = temporalFilter.yearTo;
    const response = await apiClient.get('/collaboration/network-metrics', {
      params,
      timeout: 180000, // 3 minutos - la computación de NetworkX es pesada
    });
    console.log(`📊 Network metrics: ${Object.keys(response.data.node_metrics || {}).length} nodes analyzed`);
    return response.data;
  } catch (error) {
    console.error('[getNetworkMetrics] Error:', error);
    throw error;
  }
}

/**
 * Encuentra el camino más corto entre dos entidades de la red (Quantum Tunneling).
 * Timeout extendido: construye grafo completo para cada búsqueda.
 * 
 * @param {string} source - ID del nodo origen (ej: user_octocat)
 * @param {string} target - ID del nodo destino (ej: repo_qiskit/qiskit)
 * @returns {Promise<Object>} { found, path, edges, length, description }
 */
export async function findQuantumPath(source, target) {
  try {
    const response = await apiClient.get('/collaboration/quantum-tunneling', {
      params: { source, target },
      timeout: 120000, // 2 minutos - reconstruye el grafo
    });
    console.log(`🔮 Quantum tunneling: ${source} → ${target}, found=${response.data.found}`);
    return response.data;
  } catch (error) {
    console.error('[findQuantumPath] Error:', error);
    throw error;
  }
}

// ============================================================================
// FAVORITOS Y VISTAS PERSONALIZADAS
// ============================================================================

/**
 * Obtiene todos los favoritos guardados
 */
export async function getFavorites() {
  try {
    const response = await apiClient.get('/favorites');
    return response.data.favorites || [];
  } catch (error) {
    console.error('[getFavorites] Error:', error);
    return [];
  }
}

/**
 * Añade una entidad a favoritos
 * @param {{ id: string, type: string, name: string, avatar_url?: string }} favorite
 */
export async function addFavorite(favorite) {
  try {
    const response = await apiClient.post('/favorites', favorite);
    return response.data;
  } catch (error) {
    console.error('[addFavorite] Error:', error);
    throw error;
  }
}

/**
 * Elimina un favorito por su ID
 * @param {string} entityId
 */
export async function removeFavorite(entityId) {
  try {
    const response = await apiClient.delete(`/favorites/${encodeURIComponent(entityId)}`);
    return response.data;
  } catch (error) {
    console.error('[removeFavorite] Error:', error);
    throw error;
  }
}

/**
 * Obtiene todas las vistas personalizadas
 */
export async function getViews() {
  try {
    const response = await apiClient.get('/views');
    return response.data.views || [];
  } catch (error) {
    console.error('[getViews] Error:', error);
    return [];
  }
}

/**
 * Crea o actualiza una vista personalizada
 * @param {{ id?: string, name: string, entity_ids: string[], color?: string }} view
 */
export async function saveView(view) {
  try {
    const response = await apiClient.post('/views', view);
    return response.data;
  } catch (error) {
    console.error('[saveView] Error:', error);
    throw error;
  }
}

/**
 * Elimina una vista personalizada
 * @param {string} viewId
 */
export async function deleteView(viewId) {
  try {
    const response = await apiClient.delete(`/views/${viewId}`);
    return response.data;
  } catch (error) {
    console.error('[deleteView] Error:', error);
    throw error;
  }
}

/**
 * Obtiene datos del dashboard filtrados para una vista
 * @param {string} viewId
 * @param {string[]} [entityIds] - IDs opcionales si no se quiere usar los de la vista guardada
 */
export async function getViewData(viewId, entityIds = null) {
  try {
    const body = entityIds ? { entity_ids: entityIds } : {};
    const response = await apiClient.post(`/views/${viewId}/data`, body, {
      timeout: 60000,
    });
    return response.data;
  } catch (error) {
    console.error('[getViewData] Error:', error);
    throw error;
  }
}

/**
 * Exporta favoritos y vistas como objeto JSON (para descarga)
 */
export async function exportUserData() {
  try {
    const [favorites, views] = await Promise.all([getFavorites(), getViews()]);
    return {
      version: 1,
      exported_at: new Date().toISOString(),
      favorites,
      views,
    };
  } catch (error) {
    console.error('[exportUserData] Error:', error);
    throw error;
  }
}

/**
 * Importa favoritos y vistas desde un objeto JSON
 * @param {{ favorites: Array, views: Array }} data
 */
export async function importUserData(data) {
  try {
    const results = { favorites: 0, views: 0, errors: [] };
    
    if (data.favorites?.length) {
      for (const fav of data.favorites) {
        try {
          await addFavorite(fav);
          results.favorites++;
        } catch (e) {
          results.errors.push(`Favorito ${fav.name}: ${e.message}`);
        }
      }
    }
    
    if (data.views?.length) {
      for (const view of data.views) {
        try {
          await saveView(view);
          results.views++;
        } catch (e) {
          results.errors.push(`Vista ${view.name}: ${e.message}`);
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('[importUserData] Error:', error);
    throw error;
  }
}

/**
 * Búsqueda unificada de entidades (usuarios, repos, orgs)
 * Endpoint: GET /search/entities?q=...&limit=15
 * @param {string} query - Texto de búsqueda (min 2 chars)
 * @param {number} [limit=15] - Máximo de resultados
 * @returns {Promise<{query: string, count: number, results: Array}>}
 */
export async function searchEntities(query, limit = 15) {
  try {
    const response = await apiClient.get('/search/entities', {
      params: { q: query, limit },
    });
    return response.data;
  } catch (error) {
    console.error('[searchEntities] Error:', error);
    throw error;
  }
}

/**
 * Obtiene los detalles completos de una entidad por su ID con prefijo
 * @param {string} entityId - ID con prefijo (user_login, repo_owner/name, org_login)
 * @returns {Promise<Object>} Datos completos de la entidad desde la BBDD
 */
export async function getEntityDetail(entityId) {
  try {
    const response = await apiClient.get(`/search/entity/${encodeURIComponent(entityId)}`);
    return response.data;
  } catch (error) {
    console.error('[getEntityDetail] Error:', error);
    throw error;
  }
}

/**
 * Obtiene los hijos jerárquicos de un favorito (org→repos, repo→users)
 * Endpoint: GET /favorites/{entity_id}/children
 * @param {string} entityId - ID con prefijo (org_login, repo_full_name)
 * @returns {Promise<{parent_id: string, children: Array}>}
 */
export async function getFavoriteChildren(entityId) {
  try {
    const response = await apiClient.get(`/favorites/${encodeURIComponent(entityId)}/children`);
    return response.data;
  } catch (error) {
    console.error('[getFavoriteChildren] Error:', error);
    throw error;
  }
}

// ============================================================================
// PIPELINE & INGESTION MANAGEMENT
// ============================================================================

/**
 * Ejecuta el pipeline completo (ingesta + enriquecimiento de repos, users, orgs).
 * Endpoint: POST /pipeline/run-all
 * 
 * @param {'incremental'|'from_scratch'} mode - Modo de ejecución
 *   - 'incremental': Solo datos nuevos/actualizados desde la última ingesta
 *   - 'from_scratch': Limpia todas las colecciones y reingesta desde cero
 * @param {number} [maxWorkers=4] - Workers paralelos para búsqueda segmentada (1-8)
 * @returns {Promise<{task_id: string, status: string, mode: string, message: string}>}
 */
export async function runFullPipeline(mode = 'incremental', maxWorkers = 4) {
  try {
    const response = await apiClient.post('/pipeline/run-all', null, {
      params: { mode, max_workers: maxWorkers },
      timeout: 10000, // Solo espera al ACK, no al pipeline completo
    });
    console.log(`🚀 Pipeline iniciado (modo: ${mode}):`, response.data.task_id);
    return response.data;
  } catch (error) {
    console.error('[runFullPipeline] Error:', error);
    throw error;
  }
}

/**
 * Ejecuta la ingesta de repositorios individualmente.
 * Endpoint: POST /ingestion/repositories
 * 
 * @param {Object} options - Opciones de ingesta
 * @param {'incremental'|'from_scratch'|'full'} [options.mode='incremental'] - Modo de ingesta
 * @param {number|null} [options.maxResults=null] - Límite de repos (null = todos)
 * @param {number} [options.maxWorkers=4] - Workers paralelos (1-8)
 * @returns {Promise<{task_id: string, status: string}>}
 */
export async function runRepositoryIngestion({ mode = 'incremental', maxResults = null, maxWorkers = 4 } = {}) {
  try {
    const params = {
      incremental: mode === 'incremental',
      from_scratch: mode === 'from_scratch',
      max_workers: maxWorkers,
    };
    if (maxResults) params.max_results = maxResults;

    const response = await apiClient.post('/ingestion/repositories', null, { params, timeout: 10000 });
    console.log(`📥 Ingesta de repos iniciada (modo: ${mode}):`, response.data.task_id);
    return response.data;
  } catch (error) {
    console.error('[runRepositoryIngestion] Error:', error);
    throw error;
  }
}

/**
 * Ejecuta el enriquecimiento de repositorios individualmente.
 * Endpoint: POST /enrichment/repositories
 * 
 * @param {Object} options - Opciones de enriquecimiento
 * @param {boolean} [options.forceReenrich=false] - Re-enriquecer incluso repos completos
 * @param {number|null} [options.maxRepos=null] - Límite de repos (null = todos)
 * @param {number} [options.batchSize=10] - Tamaño de lote
 * @returns {Promise<{task_id: string, status: string}>}
 */
export async function runRepositoryEnrichment({ forceReenrich = false, maxRepos = null, batchSize = 10 } = {}) {
  try {
    const params = { force_reenrich: forceReenrich, batch_size: batchSize };
    if (maxRepos) params.max_repos = maxRepos;

    const response = await apiClient.post('/enrichment/repositories', null, { params, timeout: 10000 });
    console.log(`🔄 Enriquecimiento de repos iniciado:`, response.data.task_id);
    return response.data;
  } catch (error) {
    console.error('[runRepositoryEnrichment] Error:', error);
    throw error;
  }
}

/**
 * Ejecuta la ingesta de usuarios.
 * Endpoint: POST /ingestion/users
 * 
 * @param {Object} options - Opciones
 * @param {boolean} [options.fromScratch=false] - Limpiar y reingestar
 * @param {number} [options.batchSize=50] - Tamaño de lote
 * @returns {Promise<{task_id: string, status: string}>}
 */
export async function runUserIngestion({ fromScratch = false, batchSize = 50 } = {}) {
  try {
    const params = { from_scratch: fromScratch, batch_size: batchSize };
    const response = await apiClient.post('/ingestion/users', null, { params, timeout: 10000 });
    console.log(`👤 Ingesta de usuarios iniciada:`, response.data.task_id);
    return response.data;
  } catch (error) {
    console.error('[runUserIngestion] Error:', error);
    throw error;
  }
}

/**
 * Ejecuta la ingesta de organizaciones.
 * Endpoint: POST /ingestion/organizations
 * 
 * @param {Object} options - Opciones
 * @param {boolean} [options.fromScratch=false] - Limpiar y reingestar
 * @returns {Promise<{task_id: string, status: string}>}
 */
export async function runOrganizationIngestion({ fromScratch = false } = {}) {
  try {
    const params = { from_scratch: fromScratch };
    const response = await apiClient.post('/ingestion/organizations', null, { params, timeout: 10000 });
    console.log(`🏢 Ingesta de orgs iniciada:`, response.data.task_id);
    return response.data;
  } catch (error) {
    console.error('[runOrganizationIngestion] Error:', error);
    throw error;
  }
}

/**
 * Consulta el estado de una tarea en ejecución (ingesta, enriquecimiento o pipeline).
 * Endpoint: GET /ingestion/status/{taskId}
 * 
 * @param {string} taskId - ID de la tarea obtenido al iniciar la operación
 * @returns {Promise<{status: 'running'|'completed'|'completed_with_errors'|'failed', progress: string, ...}>}
 */
export async function getTaskStatus(taskId) {
  try {
    const response = await apiClient.get(`/ingestion/status/${encodeURIComponent(taskId)}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return { status: 'not_found', progress: 'Tarea no encontrada' };
    }
    console.error('[getTaskStatus] Error:', error);
    throw error;
  }
}

/**
 * Lista todas las tareas registradas en el backend.
 * Endpoint: GET /tasks
 * 
 * @returns {Promise<{total_tasks: number, tasks: Array<{task_id, status, started_at, progress}>}>}
 */
export async function listTasks() {
  try {
    const response = await apiClient.get('/tasks');
    return response.data;
  } catch (error) {
    console.error('[listTasks] Error:', error);
    throw error;
  }
}

/**
 * Polling helper: consulta el estado de una tarea cada `interval` ms hasta que termine.
 * 
 * @param {string} taskId - ID de la tarea
 * @param {function} onUpdate - Callback llamado con cada actualización de estado
 * @param {number} [interval=5000] - Intervalo de polling en ms
 * @returns {Promise<object>} - Estado final de la tarea
 */
export async function pollTaskUntilDone(taskId, onUpdate = () => {}, interval = 5000) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getTaskStatus(taskId);
        onUpdate(status);

        if (['completed', 'completed_with_errors', 'failed', 'not_found'].includes(status.status)) {
          resolve(status);
        } else {
          setTimeout(poll, interval);
        }
      } catch (err) {
        reject(err);
      }
    };
    poll();
  });
}

// Exportar la instancia de axios por si se necesita usar directamente
export default apiClient;


// ============================================================================
// CHAT API — Asistente IA del ecosistema cuántico
// ============================================================================

/**
 * Envía un mensaje al agente de IA via streaming SSE.
 * Permite recibir pasos de razonamiento en tiempo real y cancelar.
 * 
 * @param {string} message - Pregunta del usuario
 * @param {Array|null} history - Historial de conversación previo
 * @param {Object} callbacks - Callbacks para los distintos eventos
 * @param {function} callbacks.onThinking - ({tool, description, round}) => void
 * @param {function} callbacks.onToolResult - ({tool, summary}) => void
 * @param {function} callbacks.onReply - ({content, history, tools_used}) => void
 * @param {function} callbacks.onError - (errorMsg) => void
 * @param {function} [callbacks.onAction] - ({action, data}) => void — acción del agente en el frontend
 * @param {AbortSignal} [signal] - AbortController signal para cancelar
 * @returns {Promise<void>}
 */
export async function sendChatMessageStream(message, history = null, callbacks = {}, signal = null) {
  const url = `${BASE_URL}/chat/stream`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Error desconocido');
    callbacks.onError?.(errText);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Tiempo mínimo (ms) que cada mensaje de estado permanece visible
  // antes de que el siguiente lo sobreescriba.
  const MIN_STATUS_MS = 400;
  let lastStatusTs = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // Parsear líneas SSE (formato: "data: {...}\n\n")
    const lines = buffer.split('\n\n');
    buffer = lines.pop(); // último fragmento incompleto

    for (const line of lines) {
      const stripped = line.replace(/^data:\s*/, '').trim();
      if (!stripped) continue;

      try {
        const event = JSON.parse(stripped);

        // Para eventos intermedios (no reply/error), garantizar que el
        // mensaje de estado anterior se haya mostrado al menos MIN_STATUS_MS
        // antes de reemplazarlo. Esto evita que mensajes consecutivos que
        // llegan en un mismo chunk se vean como un flash imperceptible.
        const isIntermediate = event.type !== 'reply' && event.type !== 'error';
        if (isIntermediate && lastStatusTs > 0) {
          const gap = Date.now() - lastStatusTs;
          if (gap < MIN_STATUS_MS) {
            await new Promise(r => setTimeout(r, MIN_STATUS_MS - gap));
          }
        }

        switch (event.type) {
          case 'thinking':
            callbacks.onThinking?.(event);
            break;
          case 'tool_result':
            callbacks.onToolResult?.(event);
            break;
          case 'status':
            callbacks.onStatus?.(event);
            break;
          case 'routing':
            callbacks.onRouting?.(event);
            break;
          case 'action':
            callbacks.onAction?.(event);
            break;
          case 'reply':
            callbacks.onReply?.(event);
            break;
          case 'error':
            callbacks.onError?.(event.content);
            break;
        }

        if (isIntermediate) {
          lastStatusTs = Date.now();
        }

        // Ceder control al navegador para que React renderice
        await new Promise(r => setTimeout(r, 0));
      } catch (e) {
        console.warn('[SSE] Error parsing event:', stripped, e);
      }
    }
  }
}

/**
 * Envía un mensaje al agente de IA (versión no-streaming, fallback).
 * @param {string} message - Pregunta del usuario
 * @param {Array|null} history - Historial de conversación previo
 * @returns {Promise<{reply: string, history: Array, tools_used: string[]}>}
 */
export async function sendChatMessage(message, history = null) {
  const response = await apiClient.post('/chat', { message, history }, { timeout: 120000 });
  return response.data;
}


// ============================================================================
// ADMIN API — Panel de administración protegido
// ============================================================================

/**
 * Comprueba si ya hay una contraseña de admin configurada.
 * @returns {Promise<{has_password: boolean}>}
 */
export async function adminHasPassword() {
  const response = await apiClient.get('/admin/has-password');
  return response.data;
}

/**
 * Configura la contraseña de admin (primera vez o cambio).
 * @param {string} password - Nueva contraseña
 * @param {string|null} currentPassword - Contraseña actual (requerida si ya existe una)
 * @returns {Promise<{success: boolean, message: string, is_new: boolean}>}
 */
export async function adminSetupPassword(password, currentPassword = null) {
  const payload = { password };
  if (currentPassword) payload.current_password = currentPassword;
  const response = await apiClient.post('/admin/setup-password', payload);
  return response.data;
}

/**
 * Autentica como admin con contraseña.
 * @param {string} password
 * @returns {Promise<{authenticated: boolean, token: string}>}
 */
export async function adminAuthenticate(password) {
  const response = await apiClient.post('/admin/auth', { password });
  return response.data;
}

/**
 * Ejecuta una operación (ingesta, enriquecimiento o pipeline).
 * @param {string} token - Token de sesión admin
 * @param {Object} operation - Datos de la operación
 * @returns {Promise<Object>} - Datos de la operación iniciada
 */
export async function adminRunOperation(token, operation) {
  const response = await apiClient.post('/admin/operations/run', operation, {
    params: { token },
    timeout: 15000,
  });
  return response.data;
}

/**
 * Obtiene las operaciones activas.
 * @param {string} token
 * @returns {Promise<{count: number, operations: Array}>}
 */
export async function adminGetActiveOperations(token) {
  const response = await apiClient.get('/admin/operations/active', { params: { token } });
  return response.data;
}

/**
 * Obtiene el estado de una operación específica.
 * @param {string} token
 * @param {string} operationId
 * @returns {Promise<Object>}
 */
export async function adminGetOperationStatus(token, operationId) {
  const response = await apiClient.get(`/admin/operations/${encodeURIComponent(operationId)}`, {
    params: { token },
  });
  return response.data;
}

/**
 * Cancela una operación en curso.
 * @param {string} token
 * @param {string} operationId
 * @returns {Promise<Object>}
 */
export async function adminCancelOperation(token, operationId) {
  const response = await apiClient.post(`/admin/operations/${encodeURIComponent(operationId)}/cancel`, null, {
    params: { token },
  });
  return response.data;
}

/**
 * Obtiene los logs en tiempo real de una operación.
 * Usa `since` para polling incremental (solo logs nuevos).
 * @param {string} token
 * @param {string} operationId
 * @param {number} since - Índice desde el que obtener logs
 * @returns {Promise<{logs: Array, total: number, next_index: number}>}
 */
export async function adminGetOperationLogs(token, operationId, since = 0) {
  const response = await apiClient.get(`/admin/operations/${encodeURIComponent(operationId)}/logs`, {
    params: { token, since },
  });
  return response.data;
}

/**
 * Obtiene el historial de operaciones.
 * @param {string} token
 * @param {number} limit
 * @param {string|null} operationType
 * @returns {Promise<{count: number, operations: Array}>}
 */
export async function adminGetHistory(token, limit = 50, operationType = null) {
  const params = { token, limit };
  if (operationType) params.operation_type = operationType;
  const response = await apiClient.get('/admin/history', { params });
  return response.data;
}

/**
 * Limpia el historial de operaciones.
 * @param {string} token
 * @returns {Promise<{deleted: number}>}
 */
export async function adminClearHistory(token) {
  const response = await apiClient.delete('/admin/history', { params: { token } });
  return response.data;
}

/**
 * Obtiene estadísticas de la base de datos.
 * @param {string} token
 * @returns {Promise<Object>}
 */
export async function adminGetDbStats(token) {
  const response = await apiClient.get('/admin/db-stats', { params: { token } });
  return response.data;
}

/**
 * Polling helper para operaciones admin: consulta estado cada `interval` ms.
 * @param {string} token
 * @param {string} operationId
 * @param {function} onUpdate
 * @param {number} interval
 * @returns {Promise<Object>}
 */
export async function adminPollOperation(token, operationId, onUpdate = () => {}, interval = 2000) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await adminGetOperationStatus(token, operationId);
        onUpdate(status);

        if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status.status)) {
          resolve(status);
        } else {
          setTimeout(poll, interval);
        }
      } catch (err) {
        reject(err);
      }
    };
    poll();
  });
}
