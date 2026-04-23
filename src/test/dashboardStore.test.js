/**
 * Tests for dashboardStore - Main dashboard state management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock api and favoritesStore
vi.mock('../services/api', () => ({
  getDashboardStats: vi.fn(),
  refreshDashboardMetrics: vi.fn(),
  analyzeCollaboration: vi.fn(),
  discoverCollaboration: vi.fn(),
  getNetworkMetrics: vi.fn(),
  findQuantumPath: vi.fn(),
}))

vi.mock('../data/mockData', () => ({
  organizations: [{ login: 'mock_org' }],
  users: [{ login: 'mock_user' }],
  repositories: [{ full_name: 'mock/repo' }],
}))

import { useDashboardStore } from '../store/dashboardStore'

describe('dashboardStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to initial state
    useDashboardStore.setState({
      selectedOrg: null,
      selectedLanguage: null,
      selectedRepo: null,
      selectedDiscipline: null,
      collaborationMode: null,
      collaborationData: null,
      selectedRepos: [],
      selectedOrgs: [],
      selectedUser: null,
      isAnalyzing: false,
      isLoading: false,
      isFiltering: false,
      error: null,
      dataSource: 'mock',
      kpis: null,
      charts: null,
      graph: null,
      tables: null,
      filters: null,
      metadata: null,
      collaborationAvailable: false,
      collaborationDiscovery: null,
      showCollaborationGraph: false,
      isDiscovering: false,
      temporalFilter: null,
      temporalRange: null,
      sliderYear: null,
      activeNodeIds: null,
    })
  })

  it('has correct initial state', () => {
    const state = useDashboardStore.getState()
    expect(state.selectedOrg).toBeNull()
    expect(state.dataSource).toBe('mock')
    expect(state.isLoading).toBe(false)
    expect(state.data).toBeTruthy()
    expect(state.data.organizations).toHaveLength(1)
  })

  describe('loadFullData', () => {
    it('loads data from backend on success', async () => {
      const { getDashboardStats } = await import('../services/api')
      getDashboardStats.mockResolvedValueOnce({
        kpis: { totalRepos: 100, totalUsers: 50, totalOrgs: 10 },
        charts: { organizations: [], users: [], repositories: [] },
        graph: { organizations: [], users: [], repositories: [] },
        tables: { repositories: [], users: [] },
        filters: { organizations: [], languages: [] },
        metadata: { cached: false },
      })

      const result = await useDashboardStore.getState().loadFullData()

      expect(result).toBe(true)
      expect(useDashboardStore.getState().dataSource).toBe('backend')
      expect(useDashboardStore.getState().kpis.totalRepos).toBe(100)
      expect(useDashboardStore.getState().isLoading).toBe(false)
    })

    it('falls back to mock on error', async () => {
      const { getDashboardStats } = await import('../services/api')
      getDashboardStats.mockRejectedValueOnce(new Error('Network error'))

      const result = await useDashboardStore.getState().loadFullData()

      expect(result).toBe(false)
      expect(useDashboardStore.getState().dataSource).toBe('mock')
      expect(useDashboardStore.getState().error).toBe('Network error')
    })
  })

  describe('setFilter', () => {
    it('sets org filter', async () => {
      await useDashboardStore.getState().setFilter('org', 'qiskit')
      expect(useDashboardStore.getState().selectedOrg).toBe('qiskit')
    })

    it('toggles off same org filter', async () => {
      useDashboardStore.setState({ selectedOrg: 'qiskit' })
      await useDashboardStore.getState().setFilter('org', 'qiskit')
      expect(useDashboardStore.getState().selectedOrg).toBeNull()
    })

    it('sets language filter', async () => {
      await useDashboardStore.getState().setFilter('language', 'Python')
      expect(useDashboardStore.getState().selectedLanguage).toBe('Python')
    })

    it('sets repo filter', async () => {
      await useDashboardStore.getState().setFilter('repo', 'org/repo')
      expect(useDashboardStore.getState().selectedRepo).toBe('org/repo')
    })

    it('sets discipline filter', async () => {
      await useDashboardStore.getState().setFilter('discipline', 'quantum_algorithms')
      expect(useDashboardStore.getState().selectedDiscipline).toBe('quantum_algorithms')
    })

    it('clears repo when setting org', async () => {
      useDashboardStore.setState({ selectedRepo: 'old/repo' })
      await useDashboardStore.getState().setFilter('org', 'neworg')
      expect(useDashboardStore.getState().selectedRepo).toBeNull()
    })
  })

  describe('resetFilters', () => {
    it('resets all filters to null', async () => {
      useDashboardStore.setState({
        selectedOrg: 'qiskit',
        selectedLanguage: 'Python',
        selectedRepo: 'org/repo',
        selectedDiscipline: 'ml',
      })
      await useDashboardStore.getState().resetFilters()
      const state = useDashboardStore.getState()
      expect(state.selectedOrg).toBeNull()
      expect(state.selectedLanguage).toBeNull()
      expect(state.selectedRepo).toBeNull()
      expect(state.selectedDiscipline).toBeNull()
    })
  })

  describe('collaboration selection', () => {
    it('toggleRepoSelection adds and removes repos', () => {
      useDashboardStore.getState().toggleRepoSelection('org/repo1')
      expect(useDashboardStore.getState().selectedRepos).toContain('org/repo1')
      
      useDashboardStore.getState().toggleRepoSelection('org/repo1')
      expect(useDashboardStore.getState().selectedRepos).not.toContain('org/repo1')
    })

    it('toggleOrgSelection adds and removes orgs', () => {
      useDashboardStore.getState().toggleOrgSelection('qiskit')
      expect(useDashboardStore.getState().selectedOrgs).toContain('qiskit')
      
      useDashboardStore.getState().toggleOrgSelection('qiskit')
      expect(useDashboardStore.getState().selectedOrgs).not.toContain('qiskit')
    })

    it('clearCollaborationSelections resets all collaboration selections', () => {
      useDashboardStore.setState({
        selectedRepos: ['a', 'b'],
        selectedOrgs: ['c'],
        selectedUser: 'alice',
        collaborationMode: 'repos',
        collaborationData: { some: 'data' },
      })
      useDashboardStore.getState().clearCollaborationSelections()
      const state = useDashboardStore.getState()
      expect(state.selectedRepos).toEqual([])
      expect(state.selectedOrgs).toEqual([])
      expect(state.selectedUser).toBeNull()
      expect(state.collaborationMode).toBeNull()
    })
  })

  describe('temporal filter', () => {
    it('applyTemporalFilter clears when null', () => {
      useDashboardStore.setState({
        temporalFilter: { yearFrom: 2020, yearTo: 2024 },
        temporalRange: { min: 2015, max: 2024 },
        sliderYear: 2022,
        activeNodeIds: new Set(['a']),
      })
      useDashboardStore.getState().applyTemporalFilter(null)
      const state = useDashboardStore.getState()
      expect(state.temporalFilter).toBeNull()
      expect(state.activeNodeIds).toBeNull()
    })

    it('applyTemporalFilter skips when same filter', () => {
      const filter = { yearFrom: 2020, yearTo: 2024 }
      useDashboardStore.setState({ temporalFilter: filter })
      useDashboardStore.getState().applyTemporalFilter(filter)
      // Should not change — no-op
      expect(useDashboardStore.getState().temporalFilter).toEqual(filter)
    })

    it('setSliderYear resets at max', () => {
      useDashboardStore.setState({
        temporalRange: { min: 2015, max: 2024 },
        temporalFilter: { yearFrom: 2015, yearTo: 2020 },
        sliderYear: 2020,
      })
      useDashboardStore.getState().setSliderYear(2024)
      const state = useDashboardStore.getState()
      expect(state.temporalFilter).toBeNull()
      expect(state.sliderYear).toBe(2024)
      expect(state.activeNodeIds).toBeNull()
    })

    it('setSliderYear does nothing without temporalRange', () => {
      useDashboardStore.setState({ temporalRange: null })
      useDashboardStore.getState().setSliderYear(2020)
      expect(useDashboardStore.getState().sliderYear).toBeNull()
    })
  })

  describe('selectUserForAnalysis', () => {
    it('selects a user and clears other selections', () => {
      useDashboardStore.setState({
        selectedRepos: ['a', 'b'],
        selectedOrgs: ['c'],
      })
      useDashboardStore.getState().selectUserForAnalysis('alice')
      const state = useDashboardStore.getState()
      expect(state.selectedUser).toBe('alice')
      expect(state.collaborationMode).toBe('user')
      expect(state.selectedRepos).toEqual([])
      expect(state.selectedOrgs).toEqual([])
    })

    it('deselects user on toggle', () => {
      useDashboardStore.setState({ selectedUser: 'alice', collaborationMode: 'user' })
      useDashboardStore.getState().selectUserForAnalysis('alice')
      expect(useDashboardStore.getState().selectedUser).toBeNull()
    })
  })

  describe('collaboration graph', () => {
    it('openCollaborationGraph sets show true', () => {
      useDashboardStore.getState().openCollaborationGraph()
      expect(useDashboardStore.getState().showCollaborationGraph).toBe(true)
    })

    it('closeCollaborationGraph sets show false', () => {
      useDashboardStore.setState({ showCollaborationGraph: true })
      useDashboardStore.getState().closeCollaborationGraph()
      expect(useDashboardStore.getState().showCollaborationGraph).toBe(false)
    })
  })

  describe('discoverCollaboration', () => {
    it('discovers collaboration on success', async () => {
      const { discoverCollaboration } = await import('../services/api')
      discoverCollaboration.mockResolvedValueOnce({
        available: true,
        summary: '5 shared contributors',
        temporal_range: { min: 2018, max: 2024 },
        graph: { nodes: [], links: [] },
      })

      const result = await useDashboardStore.getState().discoverCollaboration()
      expect(result).toBe(true)
      expect(useDashboardStore.getState().collaborationAvailable).toBe(true)
      expect(useDashboardStore.getState().temporalRange).toEqual({ min: 2018, max: 2024 })
    })

    it('handles discovery error', async () => {
      const { discoverCollaboration } = await import('../services/api')
      discoverCollaboration.mockRejectedValueOnce(new Error('network'))

      const result = await useDashboardStore.getState().discoverCollaboration()
      expect(result).toBe(false)
      expect(useDashboardStore.getState().collaborationAvailable).toBe(false)
    })
  })

  describe('network metrics & lenses', () => {
    it('loadNetworkMetrics loads metrics', async () => {
      const { getNetworkMetrics } = await import('../services/api')
      getNetworkMetrics.mockResolvedValueOnce({ centrality: {} })

      const result = await useDashboardStore.getState().loadNetworkMetrics()
      expect(result).toBe(true)
      expect(useDashboardStore.getState().networkMetrics).toEqual({ centrality: {} })
    })

    it('loadNetworkMetrics handles error', async () => {
      const { getNetworkMetrics } = await import('../services/api')
      getNetworkMetrics.mockRejectedValueOnce(new Error('fail'))

      const result = await useDashboardStore.getState().loadNetworkMetrics()
      expect(result).toBe(false)
      expect(useDashboardStore.getState().metricsError).toBeTruthy()
    })

    it('setActiveLens toggles lens', () => {
      useDashboardStore.getState().setActiveLens('centrality')
      expect(useDashboardStore.getState().activeLens).toBe('centrality')
      useDashboardStore.getState().setActiveLens('centrality')
      expect(useDashboardStore.getState().activeLens).toBeNull()
    })
  })

  describe('quantum tunneling', () => {
    it('findQuantumPath loads path', async () => {
      const { findQuantumPath } = await import('../services/api')
      findQuantumPath.mockResolvedValueOnce({ path: ['a', 'b', 'c'], distance: 2 })

      const result = await useDashboardStore.getState().findQuantumPath('a', 'c')
      expect(result).toEqual({ path: ['a', 'b', 'c'], distance: 2 })
      expect(useDashboardStore.getState().tunnelingPath).toEqual({ path: ['a', 'b', 'c'], distance: 2 })
    })

    it('findQuantumPath returns null on missing args', async () => {
      const result = await useDashboardStore.getState().findQuantumPath(null, 'c')
      expect(result).toBeUndefined()
    })

    it('clearTunneling resets path', () => {
      useDashboardStore.setState({ tunnelingPath: { path: ['a'] } })
      useDashboardStore.getState().clearTunneling()
      expect(useDashboardStore.getState().tunnelingPath).toBeNull()
    })
  })

  describe('computed selectors', () => {
    it('isCollaborationModeActive checks selections', () => {
      expect(useDashboardStore.getState().isCollaborationModeActive()).toBe(false)
      useDashboardStore.setState({ selectedRepos: ['a', 'b'] })
      expect(useDashboardStore.getState().isCollaborationModeActive()).toBe(true)
    })

    it('getActiveFilters returns active filters array', () => {
      useDashboardStore.setState({ selectedOrg: 'qiskit', selectedLanguage: 'Python' })
      const filters = useDashboardStore.getState().getActiveFilters()
      expect(filters).toHaveLength(2)
      expect(filters[0]).toEqual({ type: 'org', value: 'qiskit' })
    })

    it('hasActiveFilters returns boolean', () => {
      expect(useDashboardStore.getState().hasActiveFilters()).toBe(false)
      useDashboardStore.setState({ selectedOrg: 'qiskit' })
      expect(useDashboardStore.getState().hasActiveFilters()).toBe(true)
    })
  })
})
