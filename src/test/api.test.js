/**
 * Tests for api.js service layer
 * Mocks axios to test each API function in isolation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock axios before importing api.js
vi.mock('axios', () => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }
  return {
    default: {
      create: vi.fn(() => mockInstance),
      __mockInstance: mockInstance,
    },
  }
})

// Need to get the mock instance
import axios from 'axios'
const mockClient = axios.__mockInstance

import {
  checkHealth,
  getSimpleStats,
  getDashboardStats,
  refreshDashboardMetrics,
  getRepositories,
  getUsers,
  getUserProfile,
  getOrganizations,
  analyzeCollaboration,
  getUserCollaborationNetwork,
  discoverCollaboration,
  getNetworkMetrics,
  findQuantumPath,
  getFavorites,
  addFavorite,
  removeFavorite,
  getViews,
  saveView,
  deleteView,
  getViewData,
  searchEntities,
  getEntityDetail,
  exportUserData,
  importUserData,
  getFavoriteChildren,
  runFullPipeline,
  runRepositoryIngestion,
  runRepositoryEnrichment,
  runUserIngestion,
  runOrganizationIngestion,
  getTaskStatus,
  listTasks,
  sendChatMessage,
  adminHasPassword,
  adminSetupPassword,
  adminAuthenticate,
  adminRunOperation,
  adminGetActiveOperations,
  adminGetOperationStatus,
  adminCancelOperation,
  adminGetOperationLogs,
  adminGetHistory,
  adminClearHistory,
  adminGetDbStats,
} from '../services/api'

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Health Check ───

  describe('checkHealth', () => {
    it('returns online status on success', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { version: '1.0' } })
      const res = await checkHealth()
      expect(res.status).toBe('online')
      expect(res.message).toContain('conectado')
    })

    it('returns offline status on error', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('Network Error'))
      const res = await checkHealth()
      expect(res.status).toBe('offline')
    })
  })

  // ─── Stats ───

  describe('getSimpleStats', () => {
    it('returns stats data', async () => {
      const data = { repositories: 100, users: 50, organizations: 10 }
      mockClient.get.mockResolvedValueOnce({ data })
      const res = await getSimpleStats()
      expect(res).toEqual(data)
    })

    it('throws on error', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('fail'))
      await expect(getSimpleStats()).rejects.toThrow('fail')
    })
  })

  // ─── Dashboard ───

  describe('getDashboardStats', () => {
    it('returns dashboard data', async () => {
      const data = { kpis: {}, charts: {}, metadata: { cached: true, ageHours: 0.5 } }
      mockClient.get.mockResolvedValueOnce({ data })
      const res = await getDashboardStats()
      expect(res).toEqual(data)
    })

    it('passes filters as params', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { metadata: {} } })
      await getDashboardStats(true, { org: 'qiskit', language: 'Python' })
      expect(mockClient.get).toHaveBeenCalledWith('/dashboard/stats', {
        params: expect.objectContaining({
          force_refresh: true,
          org: 'qiskit',
          language: 'Python',
        }),
      })
    })

    it('throws on error', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('timeout'))
      await expect(getDashboardStats()).rejects.toThrow('timeout')
    })
  })

  describe('refreshDashboardMetrics', () => {
    it('returns refresh result', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { success: true } })
      const res = await refreshDashboardMetrics()
      expect(res.success).toBe(true)
    })
  })

  // ─── Entities ───

  describe('getRepositories', () => {
    it('returns repository list', async () => {
      mockClient.get.mockResolvedValueOnce({ data: [{ name: 'repo1' }] })
      const res = await getRepositories({ limit: 10 })
      expect(res).toHaveLength(1)
    })
  })

  describe('getUsers', () => {
    it('returns user list', async () => {
      mockClient.get.mockResolvedValueOnce({ data: [{ login: 'alice' }] })
      const res = await getUsers()
      expect(res).toHaveLength(1)
    })
  })

  describe('getUserProfile', () => {
    it('returns user profile', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { login: 'alice', name: 'Alice' } })
      const res = await getUserProfile('alice')
      expect(res.login).toBe('alice')
    })
  })

  describe('getOrganizations', () => {
    it('returns org list', async () => {
      mockClient.get.mockResolvedValueOnce({ data: [{ login: 'qiskit' }] })
      const res = await getOrganizations()
      expect(res).toHaveLength(1)
    })
  })

  // ─── Collaboration ───

  describe('analyzeCollaboration', () => {
    it('posts collaboration analysis request', async () => {
      const data = { mode: 'repos', shared_users: [] }
      mockClient.post.mockResolvedValueOnce({ data })
      const res = await analyzeCollaboration({ repos: ['a', 'b'] })
      expect(res.mode).toBe('repos')
    })
  })

  describe('getUserCollaborationNetwork', () => {
    it('returns user network', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { user: 'alice', repos: [] } })
      const res = await getUserCollaborationNetwork('alice')
      expect(res.user).toBe('alice')
    })
  })

  describe('discoverCollaboration', () => {
    it('returns discovery results', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { available: true, graph: {} } })
      const res = await discoverCollaboration()
      expect(res.available).toBe(true)
    })

    it('passes force and temporal filter', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { available: true } })
      await discoverCollaboration(true, { yearFrom: 2020, yearTo: 2024 })
      expect(mockClient.get).toHaveBeenCalledWith('/collaboration/discover', expect.objectContaining({
        params: expect.objectContaining({ force: true, year_from: 2020, year_to: 2024 }),
      }))
    })
  })

  describe('getNetworkMetrics', () => {
    it('returns network metrics', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { node_metrics: {}, global_metrics: {} } })
      const res = await getNetworkMetrics()
      expect(res).toHaveProperty('node_metrics')
    })
  })

  describe('findQuantumPath', () => {
    it('returns path result', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { found: true, path: ['a', 'b'] } })
      const res = await findQuantumPath('user_a', 'repo_b')
      expect(res.found).toBe(true)
    })
  })

  // ─── Favorites ───

  describe('getFavorites', () => {
    it('returns favorites array', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { favorites: [{ id: 'r1' }] } })
      const res = await getFavorites()
      expect(res).toHaveLength(1)
    })

    it('returns empty array on error', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('fail'))
      const res = await getFavorites()
      expect(res).toEqual([])
    })
  })

  describe('addFavorite', () => {
    it('adds a favorite', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { success: true } })
      const res = await addFavorite({ id: 'r1', type: 'repository', name: 'repo1' })
      expect(res.success).toBe(true)
    })
  })

  describe('removeFavorite', () => {
    it('removes a favorite', async () => {
      mockClient.delete.mockResolvedValueOnce({ data: { success: true } })
      const res = await removeFavorite('r1')
      expect(res.success).toBe(true)
    })
  })

  // ─── Views ───

  describe('getViews', () => {
    it('returns views array', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { views: [{ id: 'v1' }] } })
      const res = await getViews()
      expect(res).toHaveLength(1)
    })

    it('returns empty array on error', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('fail'))
      const res = await getViews()
      expect(res).toEqual([])
    })
  })

  describe('saveView', () => {
    it('saves a view', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { success: true, view: { id: 'v1' } } })
      const res = await saveView({ name: 'My View', entity_ids: ['r1'] })
      expect(res.success).toBe(true)
    })
  })

  describe('deleteView', () => {
    it('deletes a view', async () => {
      mockClient.delete.mockResolvedValueOnce({ data: { success: true } })
      const res = await deleteView('v1')
      expect(res.success).toBe(true)
    })
  })

  describe('getViewData', () => {
    it('returns view data', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { kpis: {}, charts: {} } })
      const res = await getViewData('v1', ['r1', 'r2'])
      expect(res).toHaveProperty('kpis')
    })
  })

  // ─── Search ───

  describe('searchEntities', () => {
    it('returns search results', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { results: [{ id: 'repo_a' }], count: 1 } })
      const res = await searchEntities('quantum')
      expect(res.count).toBe(1)
    })
  })

  describe('getEntityDetail', () => {
    it('returns entity detail', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { login: 'alice', _entity_type: 'user' } })
      const res = await getEntityDetail('user_alice')
      expect(res._entity_type).toBe('user')
    })
  })

  // ─── Export/Import ───

  describe('exportUserData', () => {
    it('exports favorites and views', async () => {
      // exportUserData calls getFavorites and getViews internally
      mockClient.get
        .mockResolvedValueOnce({ data: { favorites: [{ id: 'r1' }] } }) // getFavorites
        .mockResolvedValueOnce({ data: { views: [{ id: 'v1' }] } })     // getViews
      const res = await exportUserData()
      expect(res.version).toBe(1)
      expect(res.favorites).toHaveLength(1)
      expect(res.views).toHaveLength(1)
    })
  })

  describe('importUserData', () => {
    it('imports favorites and views', async () => {
      mockClient.post.mockResolvedValue({ data: { success: true } })
      const res = await importUserData({
        favorites: [{ id: 'r1', type: 'repository', name: 'repo1' }],
        views: [{ name: 'View 1', entity_ids: ['r1'] }],
      })
      expect(res.favorites).toBe(1)
      expect(res.views).toBe(1)
    })

    it('records errors per item', async () => {
      mockClient.post
        .mockRejectedValueOnce(new Error('dup'))
        .mockResolvedValueOnce({ data: { success: true } })
      const res = await importUserData({
        favorites: [{ id: 'r1', name: 'repo1' }],
        views: [{ name: 'V1', entity_ids: [] }],
      })
      expect(res.errors).toHaveLength(1)
      expect(res.views).toBe(1)
    })
  })

  // ─── Favorite Children ───

  describe('getFavoriteChildren', () => {
    it('returns children', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { parent_id: 'org_x', children: ['r1', 'r2'] } })
      const res = await getFavoriteChildren('org_x')
      expect(res.children).toHaveLength(2)
    })
  })

  // ─── Pipeline & Ingestion ───

  describe('runFullPipeline', () => {
    it('starts full pipeline', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { task_id: 't1', status: 'running' } })
      const res = await runFullPipeline('incremental', 4)
      expect(res.task_id).toBe('t1')
    })
  })

  describe('runRepositoryIngestion', () => {
    it('starts repo ingestion', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { task_id: 't2', status: 'running' } })
      const res = await runRepositoryIngestion({ mode: 'incremental' })
      expect(res.task_id).toBe('t2')
    })
  })

  describe('runRepositoryEnrichment', () => {
    it('starts repo enrichment', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { task_id: 't3', status: 'running' } })
      const res = await runRepositoryEnrichment()
      expect(res.task_id).toBe('t3')
    })
  })

  describe('runUserIngestion', () => {
    it('starts user ingestion', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { task_id: 't4', status: 'running' } })
      const res = await runUserIngestion()
      expect(res.task_id).toBe('t4')
    })
  })

  describe('runOrganizationIngestion', () => {
    it('starts org ingestion', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { task_id: 't5', status: 'running' } })
      const res = await runOrganizationIngestion()
      expect(res.task_id).toBe('t5')
    })
  })

  describe('getTaskStatus', () => {
    it('returns task status', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { status: 'running', progress: '50%' } })
      const res = await getTaskStatus('t1')
      expect(res.status).toBe('running')
    })

    it('returns not_found for 404', async () => {
      mockClient.get.mockRejectedValueOnce({ response: { status: 404 } })
      const res = await getTaskStatus('unknown')
      expect(res.status).toBe('not_found')
    })
  })

  describe('listTasks', () => {
    it('returns task list', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { total_tasks: 3, tasks: [{}, {}, {}] } })
      const res = await listTasks()
      expect(res.total_tasks).toBe(3)
    })
  })

  // ─── Chat ───

  describe('sendChatMessage', () => {
    it('sends message and returns reply', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { reply: 'Hello!', history: [], tools_used: [] } })
      const res = await sendChatMessage('Hi')
      expect(res.reply).toBe('Hello!')
    })
  })

  // ─── Admin ───

  describe('adminHasPassword', () => {
    it('checks password status', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { has_password: true } })
      const res = await adminHasPassword()
      expect(res.has_password).toBe(true)
    })
  })

  describe('adminSetupPassword', () => {
    it('sets up password', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { success: true, is_new: true } })
      const res = await adminSetupPassword('secret')
      expect(res.success).toBe(true)
    })
  })

  describe('adminAuthenticate', () => {
    it('authenticates admin', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { authenticated: true, token: 'tok123' } })
      const res = await adminAuthenticate('secret')
      expect(res.token).toBe('tok123')
    })
  })

  describe('adminRunOperation', () => {
    it('runs an operation', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { operation_id: 'op1', status: 'running' } })
      const res = await adminRunOperation('tok', { type: 'scrape' })
      expect(res.operation_id).toBe('op1')
    })
  })

  describe('adminGetActiveOperations', () => {
    it('gets active ops', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { count: 1, operations: [{ id: 'op1' }] } })
      const res = await adminGetActiveOperations('tok')
      expect(res.count).toBe(1)
    })
  })

  describe('adminGetOperationStatus', () => {
    it('gets operation status', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { status: 'running', progress: '80%' } })
      const res = await adminGetOperationStatus('tok', 'op1')
      expect(res.status).toBe('running')
    })
  })

  describe('adminCancelOperation', () => {
    it('cancels operation', async () => {
      mockClient.post.mockResolvedValueOnce({ data: { cancelled: true } })
      const res = await adminCancelOperation('tok', 'op1')
      expect(res.cancelled).toBe(true)
    })
  })

  describe('adminGetOperationLogs', () => {
    it('gets operation logs', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { logs: ['log1'], total: 1, next_index: 1 } })
      const res = await adminGetOperationLogs('tok', 'op1', 0)
      expect(res.total).toBe(1)
    })
  })

  describe('adminGetHistory', () => {
    it('gets history', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { count: 5, operations: [] } })
      const res = await adminGetHistory('tok', 50)
      expect(res.count).toBe(5)
    })
  })

  describe('adminClearHistory', () => {
    it('clears history', async () => {
      mockClient.delete.mockResolvedValueOnce({ data: { deleted: 10 } })
      const res = await adminClearHistory('tok')
      expect(res.deleted).toBe(10)
    })
  })

  describe('adminGetDbStats', () => {
    it('gets db stats', async () => {
      mockClient.get.mockResolvedValueOnce({ data: { total_records: 1000 } })
      const res = await adminGetDbStats('tok')
      expect(res.total_records).toBe(1000)
    })
  })
})
