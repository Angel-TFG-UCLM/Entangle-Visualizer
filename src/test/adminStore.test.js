/**
 * Tests for adminStore - Admin panel state management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../services/api', () => ({
  adminAuthenticate: vi.fn(),
  adminHasPassword: vi.fn(),
  adminSetupPassword: vi.fn(),
  adminRunOperation: vi.fn(),
  adminGetActiveOperations: vi.fn(),
  adminGetOperationStatus: vi.fn(),
  adminCancelOperation: vi.fn(),
  adminGetHistory: vi.fn(),
  adminClearHistory: vi.fn(),
  adminGetDbStats: vi.fn(),
  adminPollOperation: vi.fn(),
}))

import useAdminStore from '../store/adminStore'
import {
  adminAuthenticate,
  adminHasPassword,
  adminSetupPassword,
  adminRunOperation,
  adminGetActiveOperations,
  adminGetHistory,
  adminClearHistory,
  adminGetDbStats,
  adminCancelOperation,
} from '../services/api'

describe('adminStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    useAdminStore.setState({
      isOpen: false,
      activeTab: 'operations',
      isAuthenticated: false,
      token: null,
      hasPassword: null,
      authError: null,
      isAuthLoading: false,
      activeOperations: [],
      pollingIntervals: {},
      history: [],
      historyLoading: false,
      dbStats: null,
      dbStatsLoading: false,
      error: null,
    })
  })

  afterEach(() => {
    // Cleanup pollings
    const { pollingIntervals } = useAdminStore.getState()
    Object.values(pollingIntervals).forEach(id => clearInterval(id))
    vi.useRealTimers()
  })

  // ── Panel ──
  it('openPanel sets isOpen true', () => {
    useAdminStore.getState().openPanel()
    expect(useAdminStore.getState().isOpen).toBe(true)
  })

  it('closePanel sets isOpen false and clears intervals', () => {
    useAdminStore.setState({ isOpen: true, pollingIntervals: { op1: 999 } })
    useAdminStore.getState().closePanel()
    expect(useAdminStore.getState().isOpen).toBe(false)
    expect(useAdminStore.getState().pollingIntervals).toEqual({})
  })

  it('togglePanel toggles isOpen', () => {
    useAdminStore.getState().togglePanel()
    expect(useAdminStore.getState().isOpen).toBe(true)
    useAdminStore.getState().togglePanel()
    expect(useAdminStore.getState().isOpen).toBe(false)
  })

  it('setActiveTab sets tab', () => {
    useAdminStore.getState().setActiveTab('history')
    expect(useAdminStore.getState().activeTab).toBe('history')
  })

  // ── Authentication ──
  it('checkHasPassword sets hasPassword on success', async () => {
    adminHasPassword.mockResolvedValueOnce({ has_password: true })
    const result = await useAdminStore.getState().checkHasPassword()
    expect(result).toBe(true)
    expect(useAdminStore.getState().hasPassword).toBe(true)
  })

  it('checkHasPassword sets false on error', async () => {
    adminHasPassword.mockRejectedValueOnce(new Error('fail'))
    const result = await useAdminStore.getState().checkHasPassword()
    expect(result).toBe(false)
    expect(useAdminStore.getState().hasPassword).toBe(false)
  })

  it('setupPassword calls api and sets hasPassword', async () => {
    adminSetupPassword.mockResolvedValueOnce({ success: true })
    await useAdminStore.getState().setupPassword('secret123')
    expect(adminSetupPassword).toHaveBeenCalledWith('secret123', null)
    expect(useAdminStore.getState().hasPassword).toBe(true)
    expect(useAdminStore.getState().isAuthLoading).toBe(false)
  })

  it('setupPassword sets authError on failure', async () => {
    adminSetupPassword.mockRejectedValueOnce({
      response: { data: { detail: 'Weak password' } },
    })
    await expect(useAdminStore.getState().setupPassword('123')).rejects.toBeTruthy()
    expect(useAdminStore.getState().authError).toBe('Weak password')
  })

  it('authenticate sets token and isAuthenticated on success', async () => {
    adminAuthenticate.mockResolvedValueOnce({ token: 'tok123' })
    adminGetActiveOperations.mockResolvedValueOnce({ operations: [] })
    adminGetHistory.mockResolvedValueOnce({ operations: [] })
    adminGetDbStats.mockResolvedValueOnce({ total: 0 })

    await useAdminStore.getState().authenticate('secret')
    expect(useAdminStore.getState().isAuthenticated).toBe(true)
    expect(useAdminStore.getState().token).toBe('tok123')
  })

  it('authenticate sets authError on failure', async () => {
    adminAuthenticate.mockRejectedValueOnce({
      response: { data: { detail: 'Wrong password' } },
    })
    await expect(useAdminStore.getState().authenticate('wrong')).rejects.toBeTruthy()
    expect(useAdminStore.getState().authError).toBe('Wrong password')
    expect(useAdminStore.getState().isAuthenticated).toBe(false)
  })

  it('logout resets auth state and clears pollings', () => {
    useAdminStore.setState({
      isAuthenticated: true,
      token: 'tok123',
      activeOperations: [{ operation_id: 'op1' }],
      history: [{ id: 'h1' }],
      dbStats: { total: 5 },
    })
    useAdminStore.getState().logout()
    const state = useAdminStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.token).toBeNull()
    expect(state.activeOperations).toEqual([])
    expect(state.isOpen).toBe(false)
  })

  // ── Operations ──
  it('runOperation throws if not authenticated', async () => {
    await expect(
      useAdminStore.getState().runOperation({ type: 'scrape' })
    ).rejects.toThrow('No autenticado')
  })

  it('runOperation adds to activeOperations on success', async () => {
    useAdminStore.setState({ token: 'tok123' })
    adminRunOperation.mockResolvedValueOnce({ operation_id: 'op1', status: 'running' })

    await useAdminStore.getState().runOperation({ type: 'scrape' })
    expect(useAdminStore.getState().activeOperations).toHaveLength(1)
    expect(useAdminStore.getState().activeOperations[0].operation_id).toBe('op1')
  })

  it('runOperation sets error on failure', async () => {
    useAdminStore.setState({ token: 'tok123' })
    adminRunOperation.mockRejectedValueOnce({
      response: { data: { detail: 'Rate limited' } },
    })
    await expect(
      useAdminStore.getState().runOperation({ type: 'scrape' })
    ).rejects.toBeTruthy()
    expect(useAdminStore.getState().error).toBe('Rate limited')
  })

  // ── History ──
  it('loadHistory loads operations', async () => {
    useAdminStore.setState({ token: 'tok123' })
    adminGetHistory.mockResolvedValueOnce({ operations: [{ id: 'h1' }, { id: 'h2' }] })

    await useAdminStore.getState().loadHistory()
    expect(useAdminStore.getState().history).toHaveLength(2)
    expect(useAdminStore.getState().historyLoading).toBe(false)
  })

  it('loadHistory does nothing without token', async () => {
    await useAdminStore.getState().loadHistory()
    expect(adminGetHistory).not.toHaveBeenCalled()
  })

  it('clearHistory empties history', async () => {
    useAdminStore.setState({ token: 'tok123', history: [{ id: 'h1' }] })
    adminClearHistory.mockResolvedValueOnce({})

    await useAdminStore.getState().clearHistory()
    expect(useAdminStore.getState().history).toEqual([])
  })

  // ── DB Stats ──
  it('loadDbStats loads stats', async () => {
    useAdminStore.setState({ token: 'tok123' })
    adminGetDbStats.mockResolvedValueOnce({ total_records: 500 })

    await useAdminStore.getState().loadDbStats()
    expect(useAdminStore.getState().dbStats).toEqual({ total_records: 500 })
    expect(useAdminStore.getState().dbStatsLoading).toBe(false)
  })

  it('cancelOperation calls api and updates status', async () => {
    useAdminStore.setState({
      token: 'tok123',
      activeOperations: [{ operation_id: 'op1', status: 'running' }],
    })
    adminCancelOperation.mockResolvedValueOnce({})

    await useAdminStore.getState().cancelOperation('op1')
    const op = useAdminStore.getState().activeOperations[0]
    expect(op.status).toBe('cancelling')
  })
})
