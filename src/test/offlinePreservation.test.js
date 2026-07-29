import { beforeEach, describe, expect, it } from 'vitest'
import {
  analyzeOfflineCollaboration,
  findOfflinePath,
  getOfflineDashboard,
  getOfflineSnapshot,
  offlineAxiosAdapter,
} from '../offline/offlineApi'
import { buildOfflineReply } from '../offline/offlineChat'
import { useDashboardStore } from '../store/dashboardStore'

beforeEach(() => {
  localStorage.clear()
})

describe('offline preservation snapshot', () => {
  it('keeps the verified production-scale KPIs and compact Universe', () => {
    const snapshot = getOfflineSnapshot()
    expect(snapshot.dashboard.kpis).toMatchObject({
      totalRepos: 1565,
      totalUsers: 27061,
      totalOrgs: 439,
      topLanguage: 'Python',
    })
    expect(snapshot.collaboration.graph.nodes).toHaveLength(300)
    expect(snapshot.collaboration.graph.links.length).toBeGreaterThan(1000)
    expect(Object.keys(snapshot.network.node_metrics)).toHaveLength(300)
  })

  it('filters dashboard data locally using the existing API contract', () => {
    const snapshot = getOfflineSnapshot()
    const repo = snapshot.dashboard.graph.repositories[0]
    const org = repo.owner?.login || repo.organization?.login || repo.org
    const filtered = getOfflineDashboard({ org })

    expect(filtered.metadata.source).toBe('offline-snapshot')
    expect(filtered.metadata.activeFilters.org).toBe(org)
    expect(filtered.graph.repositories.every(item => {
      const owner = item.owner?.login || item.organization?.login || item.org
      return owner === org
    })).toBe(true)
  })

  it('returns the preserved rankings untouched when no filter is active', () => {
    const snapshot = getOfflineSnapshot()
    const dashboard = getOfflineDashboard()

    expect(dashboard.charts.organizations.byRepos).toHaveLength(
      snapshot.dashboard.charts.organizations.byRepos.length,
    )
    expect(dashboard.charts.users.byContributions).toHaveLength(
      snapshot.dashboard.charts.users.byContributions.length,
    )
  })

  it('supports language and discipline filters with enriched snapshot data', () => {
    const dashboard = getOfflineDashboard()

    expect(dashboard.filters.languages.length).toBeGreaterThan(30)
    expect(dashboard.filters.disciplines).toHaveLength(6)
    for (const language of dashboard.filters.languages) {
      const filtered = getOfflineDashboard({ language })
      expect(filtered.graph.repositories.length, language).toBeGreaterThan(0)
      expect(
        filtered.graph.repositories.every(
          repo =>
            (repo.primary_language?.name ||
              repo.primary_language ||
              repo.language ||
              'Unknown') === language,
        ),
        language,
      ).toBe(true)
    }
    for (const discipline of dashboard.filters.disciplines) {
      const filtered = getOfflineDashboard({ discipline })
      expect(filtered.graph.users.length, discipline).toBeGreaterThan(0)
    }
  })

  it('analyzes collaboration and finds a graph path offline', () => {
    const snapshot = getOfflineSnapshot()
    const contribution = snapshot.collaboration.graph.links.find(
      link => link.type === 'contributed_to',
    )
    const analysis = analyzeOfflineCollaboration({
      user: contribution.source.replace(/^user_/, ''),
    })

    const path = findOfflinePath(contribution.source, contribution.target)

    expect(analysis.mode).toBe('user_focus')
    expect(analysis.collaboration_graph.nodes.length).toBeGreaterThan(1)
    expect(path.found).toBe(true)
    expect(path.length).toBe(1)
    expect(path.path.map(node => node.id)).toEqual([
      contribution.source,
      contribution.target,
    ])
  })

  it('intersects contributors at organization level', () => {
    const snapshot = getOfflineSnapshot()
    const repoOwner = new Map(
      snapshot.collaboration.graph.links
        .filter(link => link.type === 'owns')
        .map(link => [link.target, link.source]),
    )
    const reposByUser = new Map()
    for (const link of snapshot.collaboration.graph.links) {
      if (link.type !== 'contributed_to') continue
      const repos = reposByUser.get(link.source) || []
      repos.push(link.target)
      reposByUser.set(link.source, repos)
    }
    const bridge = [...reposByUser.entries()].find(([, repoIds]) => {
      const orgs = new Set(repoIds.map(repoId => repoOwner.get(repoId)).filter(Boolean))
      return orgs.size >= 2
    })

    const orgs = [
      ...new Set(bridge[1].map(repoId => repoOwner.get(repoId)).filter(Boolean)),
    ].slice(0, 2)
    const analysis = analyzeOfflineCollaboration({
      orgs: orgs.map(orgId => orgId.replace(/^org_/, '')),
    })

    expect(analysis.mode).toBe('orgs_comparison')
    expect(analysis.shared_users.map(user => user.id)).toContain(bridge[0])
  })

  it('builds user-focus collaboration from the full relationship index', () => {
    const analysis = analyzeOfflineCollaboration({ user: 'IceKhan13' })
    const nodeIds = new Set(analysis.collaboration_graph.nodes.map(node => node.id))

    expect(analysis.mode).toBe('user_focus')
    expect(analysis.metrics.total_repos).toBeGreaterThan(0)
    expect(analysis.metrics.total_co_collaborators).toBeGreaterThan(0)
    expect(analysis.shared_users.every(user => user.login !== 'IceKhan13')).toBe(true)
    expect(analysis.shared_users[0].shared_repos.length).toBeGreaterThan(0)
    expect(
      analysis.collaboration_graph.links.every(
        link => nodeIds.has(link.source) && nodeIds.has(link.target),
      ),
    ).toBe(true)
  })

  it('searches entities outside the compact Universe graph', async () => {
    const response = await offlineAxiosAdapter({
      method: 'get',
      url: '/search/entities',
      params: { q: 'IceKhan13', limit: 15 },
    })

    expect(response.data.results.some(item => item.login === 'IceKhan13')).toBe(true)
  })

  it('normalizes search and child entity types for FavoritesPanel', async () => {
    const search = await offlineAxiosAdapter({
      method: 'get',
      url: '/search/entities',
      params: { q: 'QuantumTomography', limit: 15 },
    })
    const children = await offlineAxiosAdapter({
      method: 'get',
      url: '/favorites/org_BBN-Q/children',
    })

    expect(search.data.results[0].type).toBe('repository')
    expect(search.data.results[0]._entity_type).toBe('repository')
    expect(children.data.children.every(child => child.type === 'repository')).toBe(true)
  })

  it('does not return global discipline users for an empty combined filter', () => {
    const filtered = getOfflineDashboard({
      repo: 'BBN-Q/QuantumTomography.jl',
      discipline: 'classical_tooling',
    })

    expect(filtered.graph.repositories).toHaveLength(0)
    expect(filtered.graph.users).toHaveLength(0)
  })

  it('exposes only language chart values backed by the filter index', () => {
    const dashboard = getOfflineDashboard()
    const chartLanguages = dashboard.charts.languageDistribution.map(
      item => item.language || item.name,
    )

    expect(chartLanguages.every(language => dashboard.filters.languages.includes(language))).toBe(true)
    expect(chartLanguages).not.toContain('Ruby')
  })

  it('recalculates language distribution from filtered repositories', () => {
    const filtered = getOfflineDashboard({ org: 'Qiskit' })
    const chartTotal = filtered.charts.languageDistribution.reduce(
      (sum, item) => sum + item.value,
      0,
    )

    expect(chartTotal).toBe(filtered.graph.repositories.length)
  })

  it('uses the same normalized value for the Unknown language filter', () => {
    const dashboard = getOfflineDashboard()
    if (!dashboard.filters.languages.includes('Unknown')) return
    const filtered = getOfflineDashboard({ language: 'Unknown' })

    expect(filtered.graph.repositories.length).toBeGreaterThan(0)
    expect(
      filtered.graph.repositories.every(
        repo => !repo.language && !repo.primary_language,
      ),
    ).toBe(true)
  })

  it('preserves collaborators for ranked repositories outside discovery', () => {
    const filtered = getOfflineDashboard({ repo: 'QuipNetwork/hashsigs-rs' })

    expect(filtered.graph.repositories).toHaveLength(1)
    expect(filtered.graph.users.length).toBeGreaterThan(0)
  })

  it('persists favorites through the offline Axios adapter', async () => {
    await offlineAxiosAdapter({
      method: 'post',
      url: '/favorites',
      data: JSON.stringify({ id: 'org_Qiskit', type: 'org', name: 'Qiskit' }),
    })
    const response = await offlineAxiosAdapter({ method: 'get', url: '/favorites' })

    expect(response.data.favorites).toHaveLength(1)
    expect(response.data.favorites[0].id).toBe('org_Qiskit')
  })

  it('seeds offline favorites from the existing Zustand cache', async () => {
    localStorage.setItem(
      'quantum-universe-favorites',
      JSON.stringify({
        state: {
          favorites: [{ id: 'org_Qiskit', type: 'org', name: 'Qiskit' }],
          views: [],
        },
        version: 0,
      }),
    )
    const response = await offlineAxiosAdapter({ method: 'get', url: '/favorites' })

    expect(response.data.favorites).toEqual([
      { id: 'org_Qiskit', type: 'org', name: 'Qiskit' },
    ])
  })

  it('combines every entity in a custom offline view', async () => {
    const snapshot = getOfflineSnapshot()
    const orgIds = snapshot.collaboration.graph.nodes
      .filter(node => node.type === 'org')
      .slice(0, 2)
      .map(node => node.id)
    await offlineAxiosAdapter({
      method: 'post',
      url: '/views',
      data: JSON.stringify({
        id: 'multi-org',
        name: 'Multi org',
        entity_ids: orgIds,
      }),
    })
    const response = await offlineAxiosAdapter({
      method: 'post',
      url: '/views/multi-org/data',
      data: '{}',
    })

    expect(response.data.kpis.totalOrgs).toBeGreaterThanOrEqual(2)
    expect(response.data.kpis.totalOrgs).toBe(response.data.graph.organizations.length)
    expect(response.data.kpis.totalRepos).toBe(response.data.graph.repositories.length)
    expect(response.data.kpis.totalUsers).toBe(response.data.graph.users.length)
    expect(response.data.metadata.activeViewEntities).toEqual(orgIds)
  })

  it('resolves full-index repository ownership in custom views', async () => {
    await offlineAxiosAdapter({
      method: 'post',
      url: '/views',
      data: JSON.stringify({
        id: 'full-index-repo',
        name: 'Full index repo',
        entity_ids: ['repo_BBN-Q/QuantumTomography.jl'],
      }),
    })
    const response = await offlineAxiosAdapter({
      method: 'post',
      url: '/views/full-index-repo/data',
      data: '{}',
    })

    expect(response.data.kpis.totalRepos).toBe(1)
    expect(response.data.kpis.totalOrgs).toBe(1)
    expect(response.data.graph.organizations[0].login).toBe('BBN-Q')
  })

  it('clears provider-specific comparison state before reconnecting', () => {
    useDashboardStore.setState({
      selectedRepos: ['a', 'b'],
      selectedOrgs: ['org'],
      selectedUser: 'user',
      collaborationMode: 'repos_comparison',
      collaborationData: { mode: 'repos_comparison' },
      isAnalyzing: true,
    })

    useDashboardStore.getState().resetCollaborationState()
    const state = useDashboardStore.getState()
    expect(state.selectedRepos).toEqual([])
    expect(state.selectedOrgs).toEqual([])
    expect(state.selectedUser).toBeNull()
    expect(state.collaborationMode).toBeNull()
    expect(state.collaborationData).toBeNull()
    expect(state.isAnalyzing).toBe(false)
  })
})

describe('offline AI', () => {
  it('uses real snapshot metrics for deterministic dashboard answers', () => {
    const reply = buildOfflineReply('Resume el ecosistema')

    expect(reply.intent).toBe('DASHBOARD')
    expect(reply.content).toContain('1.565')
    expect(reply.content).toContain('27.061')
    expect(reply.offline).toBe(true)
  })

  it('can request the preserved Universe action', () => {
    const reply = buildOfflineReply('Abre el universo')

    expect(reply.intent).toBe('UNIVERSE')
    expect(reply.action).toMatchObject({
      action: 'OPEN_UNIVERSE',
      data: { autoTour: true },
    })
  })
})
