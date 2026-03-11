/**
 * ADMIN STORE — Estado global para el panel de administración
 * ============================================================
 * Zustand store que gestiona:
 * - Autenticación (token de sesión)
 * - Operaciones activas con polling
 * - Historial de operaciones
 * - Estado del panel (abierto/cerrado)
 */

import { create } from 'zustand'
import {
  adminAuthenticate,
  adminHasPassword,
  adminSetupPassword,
  adminRunOperation,
  adminGetActiveOperations,
  adminGetOperationStatus,
  adminCancelOperation,
  adminGetHistory,
  adminClearHistory,
  adminGetDbStats,
  adminPollOperation,
} from '../services/api'

const useAdminStore = create((set, get) => ({
  // ── Estado del panel ──
  isOpen: false,
  activeTab: 'operations', // 'operations' | 'active' | 'history' | 'settings'

  // ── Autenticación ──
  isAuthenticated: false,
  token: null,
  hasPassword: null, // null = no comprobado, true/false
  authError: null,
  isAuthLoading: false,

  // ── Operaciones activas ──
  activeOperations: [],
  pollingIntervals: {}, // operationId -> intervalId

  // ── Historial ──
  history: [],
  historyLoading: false,

  // ── DB Stats ──
  dbStats: null,
  dbStatsLoading: false,

  // ── Errores generales ──
  error: null,

  // ════════════════════════════════════════════════════════════════
  // PANEL
  // ════════════════════════════════════════════════════════════════

  openPanel: () => set({ isOpen: true }),
  closePanel: () => {
    // Limpiar todos los pollings al cerrar
    const { pollingIntervals } = get()
    Object.values(pollingIntervals).forEach(id => clearInterval(id))
    set({ isOpen: false, pollingIntervals: {} })
  },
  togglePanel: () => {
    const { isOpen } = get()
    if (isOpen) get().closePanel()
    else set({ isOpen: true })
  },
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ════════════════════════════════════════════════════════════════
  // AUTENTICACIÓN
  // ════════════════════════════════════════════════════════════════

  checkHasPassword: async () => {
    try {
      const result = await adminHasPassword()
      set({ hasPassword: result.has_password })
      return result.has_password
    } catch {
      set({ hasPassword: false })
      return false
    }
  },

  setupPassword: async (password, currentPassword = null) => {
    set({ isAuthLoading: true, authError: null })
    try {
      const result = await adminSetupPassword(password, currentPassword)
      set({ isAuthLoading: false, hasPassword: true })
      return result
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al configurar contraseña'
      set({ isAuthLoading: false, authError: msg })
      throw err
    }
  },

  authenticate: async (password) => {
    set({ isAuthLoading: true, authError: null })
    try {
      const result = await adminAuthenticate(password)
      set({
        isAuthenticated: true,
        token: result.token,
        isAuthLoading: false,
        authError: null,
      })
      // Cargar datos iniciales
      get().loadActiveOperations()
      get().loadHistory()
      get().loadDbStats()
      return result
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error de autenticación'
      set({ isAuthLoading: false, authError: msg })
      throw err
    }
  },

  logout: () => {
    const { pollingIntervals } = get()
    Object.values(pollingIntervals).forEach(id => clearInterval(id))
    set({
      isAuthenticated: false,
      token: null,
      activeOperations: [],
      history: [],
      dbStats: null,
      pollingIntervals: {},
      isOpen: false,
    })
  },

  // ════════════════════════════════════════════════════════════════
  // OPERACIONES
  // ════════════════════════════════════════════════════════════════

  runOperation: async (operationConfig) => {
    const { token } = get()
    if (!token) throw new Error('No autenticado')

    set({ error: null })
    try {
      const result = await adminRunOperation(token, operationConfig)

      // Añadir a activas
      set(state => ({
        activeOperations: [...state.activeOperations, result],
      }))

      // Iniciar polling
      get().startPolling(result.operation_id)

      return result
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al iniciar operación'
      set({ error: msg })
      throw err
    }
  },

  loadActiveOperations: async () => {
    const { token } = get()
    if (!token) return

    try {
      const result = await adminGetActiveOperations(token)
      set({ activeOperations: result.operations })

      // Iniciar polling para las que están running
      result.operations.forEach(op => {
        if (op.status === 'running') {
          get().startPolling(op.operation_id)
        }
      })
    } catch (err) {
      console.error('[AdminStore] Error cargando operaciones activas:', err)
    }
  },

  startPolling: (operationId) => {
    const { token, pollingIntervals } = get()
    if (!token || pollingIntervals[operationId]) return

    const intervalId = setInterval(async () => {
      try {
        const status = await adminGetOperationStatus(token, operationId)

        set(state => ({
          activeOperations: state.activeOperations.map(op =>
            op.operation_id === operationId ? { ...op, ...status } : op
          ),
        }))

        // Si terminó, detener polling y actualizar historial
        if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status.status)) {
          get().stopPolling(operationId)
          get().loadHistory()
          get().loadDbStats()
        }
      } catch {
        // Silenciar errores de polling
      }
    }, 2000)

    set(state => ({
      pollingIntervals: { ...state.pollingIntervals, [operationId]: intervalId },
    }))
  },

  stopPolling: (operationId) => {
    const { pollingIntervals } = get()
    if (pollingIntervals[operationId]) {
      clearInterval(pollingIntervals[operationId])
      set(state => {
        const updated = { ...state.pollingIntervals }
        delete updated[operationId]
        return { pollingIntervals: updated }
      })
    }
  },

  cancelOperation: async (operationId) => {
    const { token } = get()
    if (!token) return

    try {
      await adminCancelOperation(token, operationId)
      set(state => ({
        activeOperations: state.activeOperations.map(op =>
          op.operation_id === operationId ? { ...op, status: 'cancelling', progress_message: 'Cancelando...' } : op
        ),
      }))
    } catch (err) {
      console.error('[AdminStore] Error cancelando operación:', err)
    }
  },

  // ════════════════════════════════════════════════════════════════
  // HISTORIAL
  // ════════════════════════════════════════════════════════════════

  loadHistory: async () => {
    const { token } = get()
    if (!token) return

    set({ historyLoading: true })
    try {
      const result = await adminGetHistory(token, 50)
      set({ history: result.operations, historyLoading: false })
    } catch {
      set({ historyLoading: false })
    }
  },

  clearHistory: async () => {
    const { token } = get()
    if (!token) return

    try {
      await adminClearHistory(token)
      set({ history: [] })
    } catch (err) {
      console.error('[AdminStore] Error limpiando historial:', err)
    }
  },

  // ════════════════════════════════════════════════════════════════
  // DB STATS
  // ════════════════════════════════════════════════════════════════

  loadDbStats: async () => {
    const { token } = get()
    if (!token) return

    set({ dbStatsLoading: true })
    try {
      const result = await adminGetDbStats(token)
      set({ dbStats: result, dbStatsLoading: false })
    } catch {
      set({ dbStatsLoading: false })
    }
  },
}))

export default useAdminStore
