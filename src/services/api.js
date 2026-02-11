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
  timeout: 30000, // 30s timeout (Azure Container Apps cold start puede tardar)
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
 * Health Check: Verifica que el backend esté Online
 * @returns {Promise<{status: string, message: string}>}
 */
export async function checkHealth() {
  try {
    // FastAPI genera automáticamente /docs (Swagger UI)
    // El endpoint raíz "/" debería retornar info básica o redirigir
    const response = await apiClient.get('/');
    
    return {
      status: 'online',
      message: 'Backend conectado correctamente',
      data: response.data,
    };
  } catch (error) {
    return {
      status: 'offline',
      message: error.message || 'No se pudo conectar con el backend',
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

// Exportar la instancia de axios por si se necesita usar directamente
export default apiClient;
