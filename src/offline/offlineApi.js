import snapshot from './generatedSnapshot.json'

const STORAGE_KEY = 'entangle.offlineState.v1'
const ADMIN_TOKEN = 'offline-preservation-admin'
const filterIndex = snapshot.filterIndex || {
  organizations: [],
  repositories: [],
  users: [],
  repoToOrg: {},
  repoUsers: {},
  disciplines: {},
}
const filterOrganizations = new Map(
  filterIndex.organizations.map(org => [org.id, org]),
)
const filterRepositories = new Map(
  filterIndex.repositories.map(repo => [repo.id, repo]),
)
const filterUsers = new Map(
  filterIndex.users.map(user => [user.id, user]),
)
const userRepos = new Map()
for (const [repoId, userIds] of Object.entries(filterIndex.repoUsers || {})) {
  for (const userId of userIds) {
    const repos = userRepos.get(userId) || []
    repos.push(repoId)
    userRepos.set(userId, repos)
  }
}
const supportedLanguages = [
  ...new Set(filterIndex.repositories.map(repo => repo.language).filter(Boolean)),
  ...(filterIndex.repositories.some(repo => !repo.language) ? ['Unknown'] : []),
].sort()
const supportedDisciplines = [
  ...new Set(
    Object.values(filterIndex.disciplines)
      .map(metric => metric.discipline)
      .filter(Boolean),
  ),
].sort()

function clone(value) {
  return structuredClone(value)
}

function readState() {
  const fallback = {
    favorites: [],
    views: [],
    adminPasswordConfigured: false,
    operations: [],
    history: [],
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...fallback, ...JSON.parse(raw) }

    const persisted = localStorage.getItem('quantum-universe-favorites')
    if (!persisted) return fallback
    const cached = JSON.parse(persisted)?.state || {}
    return {
      ...fallback,
      favorites: Array.isArray(cached.favorites) ? cached.favorites : [],
      views: Array.isArray(cached.views) ? cached.views : [],
    }
  } catch {
    return fallback
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The demo remains usable when storage is unavailable.
  }
}

function updateState(mutator) {
  const state = readState()
  const updated = mutator(state) || state
  writeState(updated)
  return updated
}

function parseBody(data) {
  if (!data) return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return {}
    }
  }
  return data
}

function normalizePath(url = '/') {
  const pathname = new URL(url, 'https://offline.entangle.local').pathname
  return pathname.replace(/^\/api\/v1/, '') || '/'
}

function success(config, data, status = 200) {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Created',
    headers: { 'x-entangle-mode': 'offline-preservation' },
    config,
    request: null,
  }
}

function requestError(config, message, status = 404) {
  const error = new Error(message)
  error.config = config
  error.response = {
    data: { detail: message },
    status,
    statusText: status === 404 ? 'Not Found' : 'Bad Request',
    headers: {},
    config,
  }
  throw error
}

function ownerLogin(repo) {
  return repo.owner?.login || repo.organization?.login || repo.org || ''
}

function repositoryLanguage(repo) {
  return repo.language || repo.primary_language?.name || repo.primary_language || 'Unknown'
}

function filterArray(value, predicate) {
  return Array.isArray(value) ? value.filter(predicate) : value
}

function filterChartGroups(groups, predicate) {
  if (Array.isArray(groups)) return groups.filter(predicate)
  if (!groups || typeof groups !== 'object') return groups
  return Object.fromEntries(
    Object.entries(groups).map(([key, value]) => [key, filterArray(value, predicate)]),
  )
}

function uniqueBy(items, keySelector) {
  const result = []
  const seen = new Set()
  for (const item of items) {
    const key = keySelector(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function chartItems(groups) {
  if (Array.isArray(groups)) return groups
  if (!groups || typeof groups !== 'object') return []
  return Object.values(groups).flatMap(value => (Array.isArray(value) ? value : []))
}

export function getOfflineDashboard(filters = {}) {
  const dashboard = clone(snapshot.dashboard)
  dashboard.filters = {
    ...(dashboard.filters || {}),
    languages: supportedLanguages,
    disciplines: supportedDisciplines,
  }
  dashboard.charts = {
    ...(dashboard.charts || {}),
    languageDistribution: (dashboard.charts?.languageDistribution || []).filter(item =>
      supportedLanguages.includes(item.language || item.name),
    ),
  }
  const graph = dashboard.graph || { organizations: [], repositories: [], users: [] }
  const selectedOrg = filters.org || null
  const selectedLanguage = filters.language || null
  const selectedRepo = filters.repo || null
  const selectedDiscipline = filters.discipline || null
  const hasFilters = selectedOrg || selectedLanguage || selectedRepo || selectedDiscipline

  if (!hasFilters) {
    dashboard.data = dashboard.graph
    dashboard.metadata = {
      ...(dashboard.metadata || {}),
      cached: true,
      source: 'offline-snapshot',
      offline: true,
      activeFilters: null,
    }
    return dashboard
  }

  const chartRepos = uniqueBy(
    chartItems(dashboard.charts?.repositories),
    repo => repo.full_name,
  )
  const chartRepoByName = new Map(chartRepos.map(repo => [repo.full_name, repo]))
  const candidateRepositories = uniqueBy(
    [
      ...filterIndex.repositories.map(repo => ({
        ...repo,
        ...chartRepoByName.get(repo.full_name),
        owner: { login: repo.org },
        organization: { login: repo.org },
        primary_language:
          chartRepoByName.get(repo.full_name)?.primary_language ?? repo.language,
        language: repo.language,
        stargazer_count: repo.stars,
      })),
      ...(graph.repositories || []),
    ],
    repo => repo.full_name,
  )

  const disciplineUserIds = selectedDiscipline
    ? new Set(
        Object.entries(filterIndex.disciplines || {})
          .filter(([nodeId, metric]) =>
            nodeId.startsWith('user_') && metric.discipline === selectedDiscipline,
          )
          .map(([nodeId]) => nodeId),
      )
    : null
  const disciplineRepoIds = disciplineUserIds
    ? new Set(
        [...disciplineUserIds].flatMap(userId => userRepos.get(userId) || []),
      )
    : null

  const repositories = candidateRepositories.filter(repo => {
    if (selectedOrg && ownerLogin(repo) !== selectedOrg) return false
    if (
      selectedLanguage &&
      repositoryLanguage(repo) !== selectedLanguage
    ) return false
    if (selectedRepo && repo.full_name !== selectedRepo) return false
    if (
      disciplineRepoIds &&
      !disciplineRepoIds.has(`repo_${repo.full_name}`)
    ) return false
    return true
  })
  const allowedRepos = new Set(repositories.map(repo => repo.full_name))
  const allowedOrgs = new Set(repositories.map(ownerLogin).filter(Boolean))

  const organizationCandidates = uniqueBy([
    ...filterIndex.organizations,
    ...(graph.organizations || []),
    ...chartItems(dashboard.charts?.organizations),
  ], org => org.login)
  const organizations = organizationCandidates.filter(org => {
    if (selectedOrg) return org.login === selectedOrg
    if (selectedLanguage || selectedRepo || selectedDiscipline) {
      return allowedOrgs.has(org.login)
    }
    return true
  })
  const matchingRepoIds = new Set(repositories.map(repo => `repo_${repo.full_name}`))
  const matchingUserIds = new Set()
  for (const repoId of matchingRepoIds) {
    for (const userId of filterIndex.repoUsers[repoId] || []) {
      if (disciplineUserIds && !disciplineUserIds.has(userId)) continue
      matchingUserIds.add(userId)
    }
  }
  if (
    disciplineUserIds &&
    matchingRepoIds.size === 0 &&
    !selectedOrg &&
    !selectedLanguage &&
    !selectedRepo
  ) {
    disciplineUserIds.forEach(userId => matchingUserIds.add(userId))
  }
  const users = [...matchingUserIds].map(entityFromDashboard).filter(Boolean)

  dashboard.graph = { organizations, repositories, users }
  dashboard.data = dashboard.graph
  dashboard.charts = {
    ...dashboard.charts,
    organizations: filterChartGroups(
      dashboard.charts?.organizations,
      org => organizations.some(item => item.login === org.login),
    ),
    repositories: filterChartGroups(
      dashboard.charts?.repositories,
      repo => !hasFilters || allowedRepos.has(repo.full_name),
    ),
    users: filterChartGroups(
      dashboard.charts?.users,
      user => users.some(item => item.login === user.login),
    ),
    languageDistribution: Object.entries(
      repositories.reduce((counts, repo) => {
        const language = repositoryLanguage(repo)
        counts[language] = (counts[language] || 0) + 1
        return counts
      }, {}),
    )
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
  }
  if (
    Object.values(dashboard.charts.organizations || {}).every(
      value => !Array.isArray(value) || value.length === 0,
    )
  ) {
    dashboard.charts.organizations = {
      byRepos: organizations.slice(0, 10),
      byStars: [...organizations]
        .sort((a, b) => (b.total_stars || 0) - (a.total_stars || 0))
        .slice(0, 10),
      byQuantumFocus: [...organizations]
        .sort((a, b) => (b.quantum_focus_score || 0) - (a.quantum_focus_score || 0))
        .slice(0, 10),
    }
  }
  if (
    Object.values(dashboard.charts.repositories || {}).every(
      value => !Array.isArray(value) || value.length === 0,
    )
  ) {
    dashboard.charts.repositories = {
      byStars: [...repositories]
        .sort((a, b) => (b.stargazer_count || b.stars || 0) - (a.stargazer_count || a.stars || 0))
        .slice(0, 10),
      byForks: repositories.slice(0, 10),
      byCollaborators: repositories.slice(0, 10),
    }
  }
  if (
    Object.values(dashboard.charts.users || {}).every(
      value => !Array.isArray(value) || value.length === 0,
    )
  ) {
    dashboard.charts.users = {
      byContributions: users.slice(0, 10),
      byRepos: [...users]
        .sort((a, b) => (b.repos_count || 0) - (a.repos_count || 0))
        .slice(0, 10),
    }
  }
  dashboard.tables = {
    repositories: hasFilters
      ? repositories.slice(0, 20)
      : dashboard.tables?.repositories || repositories.slice(0, 20),
    users: hasFilters ? users.slice(0, 20) : dashboard.tables?.users || users.slice(0, 20),
  }
  dashboard.kpis = hasFilters
    ? {
        ...dashboard.kpis,
        totalRepos: repositories.length,
        totalUsers: users.length,
        totalOrgs: organizations.length,
      }
    : dashboard.kpis
  dashboard.metadata = {
    ...(dashboard.metadata || {}),
    cached: true,
    source: 'offline-snapshot',
    offline: true,
    activeFilters: hasFilters ? filters : null,
  }
  return dashboard
}

function graphNode(entityId) {
  return snapshot.collaboration.graph.nodes.find(node => node.id === entityId) || null
}

function entityFromDashboard(entityId) {
  const dashboard = snapshot.dashboard
  if (entityId.startsWith('org_')) {
    const login = entityId.slice(4)
    const entity = (
      dashboard.graph?.organizations?.find(item => item.login === login) ||
      filterOrganizations.get(entityId) ||
      graphNode(entityId)
    )
    return entity ? { ...entity, id: entityId, type: 'org' } : null
  }
  if (entityId.startsWith('repo_')) {
    const fullName = entityId.slice(5)
    const indexed = filterRepositories.get(entityId)
    const entity = (
      dashboard.graph?.repositories?.find(item => item.full_name === fullName) ||
      (indexed
        ? {
            ...indexed,
            owner: { login: indexed.org },
            organization: { login: indexed.org },
            primary_language: indexed.language,
            stargazer_count: indexed.stars,
          }
        : null) ||
      graphNode(entityId)
    )
    return entity ? { ...entity, id: entityId, type: 'repo' } : null
  }
  if (entityId.startsWith('user_')) {
    const login = entityId.slice(5)
    const indexed = filterUsers.get(entityId)
    if (indexed) {
      const organizations = [
        ...new Set(
          (userRepos.get(entityId) || [])
            .map(repoId => filterIndex.repoToOrg[repoId])
            .filter(Boolean)
            .map(orgId => orgId.replace(/^org_/, '')),
        ),
      ]
      return {
        ...indexed,
        id: entityId,
        type: 'user',
        organizations,
        connected_orgs: organizations,
        discipline: filterIndex.disciplines[entityId]?.discipline || null,
      }
    }
    const entity =
      dashboard.graph?.users?.find(item => item.login === login) ||
      graphNode(entityId)
    return entity ? { ...entity, id: entityId, type: 'user' } : null
  }
  return null
}

function apiEntityType(type) {
  if (type === 'repo') return 'repository'
  if (type === 'org') return 'organization'
  return type
}

function toApiEntity(entity) {
  if (!entity) return entity
  const type = apiEntityType(entity.type)
  return { ...entity, type, _entity_type: type }
}

function contributorsForRepo(repoId) {
  return filterIndex.repoUsers[repoId] || []
}

function reposForOrg(orgId) {
  return Object.entries(filterIndex.repoToOrg)
    .filter(([, ownerId]) => ownerId === orgId)
    .map(([repoId]) => repoId)
}

function sharedUsersForRepos(repoIds) {
  const sets = repoIds.map(repoId => new Set(contributorsForRepo(repoId)))
  if (sets.length === 0) return []
  return [...sets[0]].filter(userId => sets.every(set => set.has(userId)))
}

function sharedUsersForOrganizations(orgs) {
  const organizationSets = orgs.map(org => {
    const orgId = org.startsWith('org_') ? org : `org_${org}`
    const contributors = new Set()
    for (const repoId of reposForOrg(orgId)) {
      for (const userId of contributorsForRepo(repoId)) contributors.add(userId)
    }
    return contributors
  })
  if (organizationSets.length === 0) return []
  return [...organizationSets[0]].filter(userId =>
    organizationSets.every(set => set.has(userId)),
  )
}

export function analyzeOfflineCollaboration(params = {}) {
  if (params.user) {
    const userId = params.user.startsWith('user_') ? params.user : `user_${params.user}`
    const repoIds = userRepos.get(userId) || []
    const coCollaborators = new Map()
    for (const repoId of repoIds) {
      for (const coUserId of contributorsForRepo(repoId)) {
        if (coUserId === userId) continue
        const sharedRepos = coCollaborators.get(coUserId) || []
        sharedRepos.push(repoId)
        coCollaborators.set(coUserId, sharedRepos)
      }
    }
    const rankedCollaborators = [...coCollaborators.entries()]
      .sort((a, b) => b[1].length - a[1].length)
    const visibleCollaborators = rankedCollaborators.slice(0, 100)
    const organizationIds = new Set(
      repoIds.map(repoId => filterIndex.repoToOrg[repoId]).filter(Boolean),
    )
    const nodeIds = new Set([
      userId,
      ...repoIds,
      ...organizationIds,
      ...visibleCollaborators.map(([coUserId]) => coUserId),
    ])
    const links = []
    for (const repoId of repoIds) {
      const ownerId = filterIndex.repoToOrg[repoId]
      if (ownerId) links.push({ source: ownerId, target: repoId, type: 'owns' })
      links.push({ source: userId, target: repoId, type: 'contributed_to' })
    }
    for (const [coUserId, sharedRepoIds] of visibleCollaborators) {
      for (const repoId of sharedRepoIds) {
        links.push({ source: coUserId, target: repoId, type: 'contributed_to' })
      }
    }

    return {
      mode: 'user_focus',
      selections: [params.user.replace(/^user_/, '')],
      shared_users: visibleCollaborators
        .map(([coUserId, sharedRepoIds]) => {
          const user = entityFromDashboard(coUserId)
          if (!user) return null
          return {
            ...user,
            shared_count: sharedRepoIds.length,
            shared_repos: sharedRepoIds
              .map(entityFromDashboard)
              .filter(Boolean),
            total_shared_contributions: 0,
          }
        })
        .filter(Boolean),
      collaboration_graph: {
        nodes: [...nodeIds].map(entityFromDashboard).filter(Boolean),
        links,
      },
      metrics: {
        total_repos: repoIds.length,
        total_co_collaborators: coCollaborators.size,
        total_organizations: organizationIds.size,
        offline_snapshot: true,
      },
    }
  }

  const mode = params.orgs?.length ? 'orgs_comparison' : 'repos_comparison'
  const selections = params.orgs?.length ? params.orgs : params.repos || []
  const repoIds = params.orgs?.length
    ? params.orgs.flatMap(org =>
        reposForOrg(org.startsWith('org_') ? org : `org_${org}`),
      )
    : selections.map(repo => (repo.startsWith('repo_') ? repo : `repo_${repo}`))
  const unitContributorSets = params.orgs?.length
    ? params.orgs.map(org => {
        const contributors = new Set()
        for (const repoId of reposForOrg(org.startsWith('org_') ? org : `org_${org}`)) {
          contributorsForRepo(repoId).forEach(userId => contributors.add(userId))
        }
        return contributors
      })
    : repoIds.map(repoId => new Set(contributorsForRepo(repoId)))
  const sharedUserIds =
    mode === 'orgs_comparison'
      ? sharedUsersForOrganizations(params.orgs)
      : sharedUsersForRepos(repoIds)
  const uniqueUserIds = new Set(unitContributorSets.flatMap(set => [...set]))
  const sharedUsers = sharedUserIds
    .map(userId => {
      const user = entityFromDashboard(userId)
      if (!user) return null
      return {
        ...user,
        shared_count: unitContributorSets.filter(set => set.has(userId)).length,
      }
    })
    .filter(Boolean)
  const nodeIds = new Set([...repoIds, ...sharedUserIds])
  for (const repoId of repoIds) {
    const ownerId = filterIndex.repoToOrg[repoId]
    if (ownerId) nodeIds.add(ownerId)
  }
  const links = []
  for (const repoId of repoIds) {
    const ownerId = filterIndex.repoToOrg[repoId]
    if (ownerId) links.push({ source: ownerId, target: repoId, type: 'owns' })
    for (const userId of sharedUserIds) {
      if (contributorsForRepo(repoId).includes(userId)) {
        links.push({ source: userId, target: repoId, type: 'contributed_to' })
      }
    }
  }

  return {
    mode,
    selections,
    shared_users: sharedUsers,
    collaboration_graph: {
      nodes: [...nodeIds].map(entityFromDashboard).filter(Boolean),
      links,
    },
    metrics: {
      total_unique_users: uniqueUserIds.size,
      shared_users_count: sharedUserIds.length,
      collaboration_density:
        uniqueUserIds.size > 0
          ? Math.round((sharedUserIds.length / uniqueUserIds.size) * 100)
          : 0,
      ...(mode === 'repos_comparison'
        ? { total_repos_analyzed: repoIds.length }
        : { total_orgs_analyzed: params.orgs.length }),
      offline_snapshot: true,
    },
  }
}

export function findOfflinePath(source, target) {
  const adjacency = new Map()
  for (const link of snapshot.collaboration.graph.links) {
    if (!adjacency.has(link.source)) adjacency.set(link.source, [])
    if (!adjacency.has(link.target)) adjacency.set(link.target, [])
    adjacency.get(link.source).push({ id: link.target, link })
    adjacency.get(link.target).push({ id: link.source, link })
  }

  const queue = [source]
  const previous = new Map([[source, null]])
  const previousLink = new Map()

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === target) break
    for (const neighbor of adjacency.get(current) || []) {
      if (previous.has(neighbor.id)) continue
      previous.set(neighbor.id, current)
      previousLink.set(neighbor.id, neighbor.link)
      queue.push(neighbor.id)
    }
  }

  if (!previous.has(target)) {
    return { found: false, path: [], edges: [], length: 0 }
  }

  const ids = []
  const edges = []
  let cursor = target
  while (cursor) {
    ids.unshift(cursor)
    const link = previousLink.get(cursor)
    if (link) edges.unshift(link)
    cursor = previous.get(cursor)
  }

  return {
    found: true,
    path: ids.map(graphNode).filter(Boolean),
    edges,
    length: Math.max(0, ids.length - 1),
    description: `Offline snapshot path with ${Math.max(0, ids.length - 1)} hops`,
  }
}

function viewData(entityIds = []) {
  const selectedOrgIds = new Set(entityIds.filter(id => id.startsWith('org_')))
  const selectedRepoIds = new Set(entityIds.filter(id => id.startsWith('repo_')))
  const selectedUserIds = new Set(entityIds.filter(id => id.startsWith('user_')))

  for (const orgId of [...selectedOrgIds]) {
    for (const repoId of reposForOrg(orgId)) selectedRepoIds.add(repoId)
  }
  for (const userId of [...selectedUserIds]) {
    for (const repoId of userRepos.get(userId) || []) selectedRepoIds.add(repoId)
  }
  for (const repoId of [...selectedRepoIds]) {
    for (const userId of contributorsForRepo(repoId)) selectedUserIds.add(userId)
    const owner =
      filterIndex.repoToOrg[repoId] ||
      snapshot.collaboration.graph.links.find(
        link => link.type === 'owns' && link.target === repoId,
      )?.source
    if (owner) selectedOrgIds.add(owner)
  }

  const dashboard = clone(snapshot.dashboard)
  const graph = dashboard.graph || { organizations: [], repositories: [], users: [] }
  const organizations = [...selectedOrgIds]
    .map(entityFromDashboard)
    .filter(Boolean)
  const repositories = [...selectedRepoIds]
    .map(entityFromDashboard)
    .filter(Boolean)
  const users = [...selectedUserIds]
    .map(entityFromDashboard)
    .filter(Boolean)
  const orgLogins = new Set(
    organizations.map(org => org.login || org.id?.replace(/^org_/, '')),
  )
  const repoNames = new Set(
    repositories.map(repo => repo.full_name || repo.id?.replace(/^repo_/, '')),
  )
  const userLogins = new Set(
    users.map(user => user.login || user.id?.replace(/^user_/, '')),
  )

  dashboard.graph = { organizations, repositories, users }
  dashboard.data = dashboard.graph
  dashboard.charts = {
    ...dashboard.charts,
    organizations: filterChartGroups(
      dashboard.charts?.organizations,
      org => orgLogins.has(org.login),
    ),
    repositories: filterChartGroups(
      dashboard.charts?.repositories,
      repo => repoNames.has(repo.full_name),
    ),
    users: filterChartGroups(
      dashboard.charts?.users,
      user => userLogins.has(user.login),
    ),
  }
  dashboard.tables = {
    repositories: repositories.slice(0, 20),
    users: users.slice(0, 20),
  }
  dashboard.kpis = {
    ...dashboard.kpis,
    totalRepos: repositories.length,
    totalUsers: users.length,
    totalOrgs: organizations.length,
  }
  dashboard.metadata = {
    ...(dashboard.metadata || {}),
    source: 'offline-snapshot',
    offline: true,
    activeViewEntities: entityIds,
  }
  return dashboard
}

function searchOffline(query, limit = 15) {
  const normalized = String(query || '').trim().toLowerCase()
  if (!normalized) return []
  return [
    ...filterIndex.organizations,
    ...filterIndex.repositories,
    ...filterIndex.users,
  ]
    .filter(node => {
      const label = node.login || node.full_name || node.name || node.id
      return label.toLowerCase().includes(normalized)
    })
    .sort((a, b) => {
      const bridgeDelta = Number(Boolean(b.isBridge)) - Number(Boolean(a.isBridge))
      if (bridgeDelta) return bridgeDelta
      return (b.stars || b.repos_count || 0) - (a.stars || a.repos_count || 0)
    })
    .slice(0, limit)
    .map(node => ({
      id: node.id,
      type: apiEntityType(node.type),
      _entity_type: apiEntityType(node.type),
      name: node.name || node.full_name || node.login,
      login: node.login,
      full_name: node.full_name,
      avatar_url: node.avatar_url || null,
      description: node.description || null,
    }))
}

function updateOperations(state) {
  const now = Date.now()
  const stillActive = []
  for (const operation of state.operations) {
    if (operation.status !== 'running') {
      stillActive.push(operation)
      continue
    }
    const elapsed = Math.max(0, now - new Date(operation.started_at).getTime())
    const progress = Math.min(100, Math.round((elapsed / 12_000) * 100))
    const updated = {
      ...operation,
      progress,
      progress_percent: progress,
      progress_message:
        progress < 35
          ? 'Consultando la instantánea preservada...'
          : progress < 75
            ? 'Reconstruyendo métricas y relaciones...'
            : 'Verificando integridad del resultado...',
      eta_seconds: Math.max(0, Math.ceil((12_000 - elapsed) / 1000)),
      status: progress >= 100 ? 'completed' : 'running',
      completed_at: progress >= 100 ? new Date().toISOString() : null,
    }
    if (updated.status === 'completed') state.history.unshift(updated)
    else stillActive.push(updated)
  }
  state.operations = stillActive
  return state
}

function operationLogs(operation) {
  const stages = [
    'Inicializando ejecución de demostración sin conexiones externas',
    'Cargando manifiesto de snapshot 2026-07',
    'Validando 1.565 repositorios y 27.061 colaboradores agregados',
    'Reconstruyendo comunidades, puentes y métricas de resiliencia',
    'Publicando resultado determinista en memoria local',
  ]
  const visible = Math.max(1, Math.ceil(((operation.progress || 0) / 100) * stages.length))
  return stages.slice(0, visible).map((message, index) => ({
    index,
    timestamp: new Date(
      new Date(operation.started_at).getTime() + index * 1700,
    ).toISOString(),
    level: index === stages.length - 1 ? 'success' : 'info',
    message,
  }))
}

function createOperation(config = {}) {
  const now = new Date()
  return {
    operation_id: `offline-op-${now.getTime()}`,
    operation_type: config.type || config.operation_type || 'pipeline',
    entity: config.entity || null,
    mode: config.mode || 'snapshot-replay',
    status: 'running',
    progress: 3,
    progress_percent: 3,
    progress_message: 'Preparando ejecución preservada...',
    eta_seconds: 12,
    started_at: now.toISOString(),
    offline: true,
  }
}

export async function offlineAxiosAdapter(config) {
  const method = String(config.method || 'get').toLowerCase()
  const route = normalizePath(config.url)
  const params = config.params || {}
  const body = parseBody(config.data)

  if (method === 'get' && route === '/') {
    return success(config, {
      service: 'Entangle preservation runtime',
      version: snapshot.manifest.schemaVersion,
      mode: 'offline',
      snapshot: snapshot.manifest.sourceSnapshotDate,
    })
  }
  if (method === 'get' && route === '/stats') {
    const { totalRepos, totalUsers, totalOrgs } = snapshot.dashboard.kpis
    return success(config, {
      repositories: totalRepos,
      users: totalUsers,
      organizations: totalOrgs,
    })
  }
  if (method === 'get' && route === '/dashboard/stats') {
    return success(config, getOfflineDashboard(params))
  }
  if (method === 'post' && route === '/dashboard/refresh-metrics') {
    return success(config, {
      refreshed: true,
      mode: 'offline',
      message: 'Snapshot deterministically reloaded',
    })
  }
  if (method === 'get' && route === '/repositories') {
    return success(config, snapshot.dashboard.graph?.repositories || [])
  }
  if (method === 'get' && route === '/users') {
    return success(config, snapshot.dashboard.graph?.users || [])
  }
  if (method === 'get' && route.startsWith('/users/profile/')) {
    const login = decodeURIComponent(route.slice('/users/profile/'.length))
    const user = entityFromDashboard(`user_${login}`)
    return user ? success(config, user) : requestError(config, 'User not found')
  }
  if (method === 'get' && route === '/organizations') {
    return success(config, snapshot.dashboard.graph?.organizations || [])
  }
  if (method === 'post' && route === '/collaboration/analyze') {
    return success(config, analyzeOfflineCollaboration(params))
  }
  if (method === 'get' && route.startsWith('/collaboration/user/')) {
    const login = decodeURIComponent(route.slice('/collaboration/user/'.length))
    return success(config, analyzeOfflineCollaboration({ user: login }))
  }
  if (method === 'get' && route === '/collaboration/discover') {
    return success(config, clone(snapshot.collaboration))
  }
  if (method === 'get' && route === '/collaboration/network-metrics') {
    return success(config, clone(snapshot.network))
  }
  if (method === 'get' && route === '/collaboration/quantum-tunneling') {
    return success(config, findOfflinePath(params.source, params.target))
  }

  if (route === '/favorites' && method === 'get') {
    return success(config, { favorites: readState().favorites })
  }
  if (route === '/favorites' && method === 'post') {
    const favorite = { ...body, added_at: body.added_at || new Date().toISOString() }
    const state = updateState(current => {
      current.favorites = [
        ...current.favorites.filter(item => item.id !== favorite.id),
        favorite,
      ]
      return current
    })
    return success(config, { favorite, count: state.favorites.length }, 201)
  }
  if (route.startsWith('/favorites/') && route.endsWith('/children') && method === 'get') {
    const entityId = decodeURIComponent(
      route.slice('/favorites/'.length, -'/children'.length),
    )
    let childIds = []
    if (entityId.startsWith('org_')) childIds = reposForOrg(entityId)
    if (entityId.startsWith('repo_')) childIds = contributorsForRepo(entityId)
    return success(config, {
      parent_id: entityId,
      children: childIds.map(entityFromDashboard).filter(Boolean).map(toApiEntity),
    })
  }
  if (route.startsWith('/favorites/') && method === 'delete') {
    const entityId = decodeURIComponent(route.slice('/favorites/'.length))
    updateState(current => {
      current.favorites = current.favorites.filter(item => item.id !== entityId)
      return current
    })
    return success(config, { deleted: true, id: entityId })
  }

  if (route === '/views' && method === 'get') {
    return success(config, { views: readState().views })
  }
  if (route === '/views' && method === 'post') {
    const view = {
      ...body,
      id: body.id || `offline-view-${Date.now()}`,
      color: body.color || '#00ffaa',
      created_at: body.created_at || new Date().toISOString(),
    }
    updateState(current => {
      current.views = [...current.views.filter(item => item.id !== view.id), view]
      return current
    })
    return success(config, { view }, 201)
  }
  if (route.startsWith('/views/') && route.endsWith('/data') && method === 'post') {
    const viewId = route.slice('/views/'.length, -'/data'.length)
    const view = readState().views.find(item => item.id === viewId)
    const entityIds = body.entity_ids || view?.entity_ids || []
    return success(config, viewData(entityIds))
  }
  if (route.startsWith('/views/') && method === 'delete') {
    const viewId = route.slice('/views/'.length)
    updateState(current => {
      current.views = current.views.filter(item => item.id !== viewId)
      return current
    })
    return success(config, { deleted: true, id: viewId })
  }

  if (route === '/search/entities' && method === 'get') {
    const results = searchOffline(params.q, params.limit || 15)
    return success(config, { query: params.q, count: results.length, results })
  }
  if (route.startsWith('/search/entity/') && method === 'get') {
    const entityId = decodeURIComponent(route.slice('/search/entity/'.length))
    const entity = entityFromDashboard(entityId)
    return entity ? success(config, toApiEntity(entity)) : requestError(config, 'Entity not found')
  }

  if (route === '/chat' && method === 'post') {
    const { buildOfflineReply } = await import('./offlineChat')
    return success(config, buildOfflineReply(body.message, false, body.session_id))
  }
  if (route === '/chat/research' && method === 'post') {
    const { buildOfflineReply } = await import('./offlineChat')
    return success(config, buildOfflineReply(body.message, true, body.session_id))
  }
  if (route.startsWith('/chat/session/') && method === 'delete') {
    return success(config, {
      deleted: true,
      session_id: decodeURIComponent(route.slice('/chat/session/'.length)),
    })
  }

  if (route === '/admin/has-password' && method === 'get') {
    return success(config, { has_password: readState().adminPasswordConfigured })
  }
  if (route === '/admin/setup-password' && method === 'post') {
    updateState(current => {
      current.adminPasswordConfigured = true
      return current
    })
    return success(config, {
      success: true,
      message: 'Offline demo access configured locally',
      is_new: true,
    })
  }
  if (route === '/admin/auth' && method === 'post') {
    if (!body.password) return requestError(config, 'Password is required', 400)
    return success(config, { authenticated: true, token: ADMIN_TOKEN, offline: true })
  }
  if (route === '/admin/operations/run' && method === 'post') {
    if (params.token !== ADMIN_TOKEN) return requestError(config, 'Unauthorized', 401)
    const operation = createOperation(body)
    updateState(current => {
      current.operations.push(operation)
      return current
    })
    return success(config, operation, 201)
  }
  if (route === '/admin/operations/active' && method === 'get') {
    const state = updateState(updateOperations)
    return success(config, { count: state.operations.length, operations: state.operations })
  }
  if (route.startsWith('/admin/operations/') && route.endsWith('/logs') && method === 'get') {
    const operationId = decodeURIComponent(
      route.slice('/admin/operations/'.length, -'/logs'.length),
    )
    const state = updateState(updateOperations)
    const operation = [...state.operations, ...state.history].find(
      item => item.operation_id === operationId,
    )
    if (!operation) return requestError(config, 'Operation not found')
    const logs = operationLogs(operation)
    const since = Number(params.since || 0)
    return success(config, {
      logs: logs.slice(since),
      total: logs.length,
      next_index: logs.length,
    })
  }
  if (route.startsWith('/admin/operations/') && route.endsWith('/cancel') && method === 'post') {
    const operationId = decodeURIComponent(
      route.slice('/admin/operations/'.length, -'/cancel'.length),
    )
    const state = updateState(current => {
      current.operations = current.operations.filter(operation => {
        if (operation.operation_id !== operationId) return true
        current.history.unshift({
          ...operation,
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        return false
      })
      return current
    })
    return success(config, {
      cancelled: true,
      operation_id: operationId,
      remaining: state.operations.length,
    })
  }
  if (route.startsWith('/admin/operations/') && method === 'get') {
    const operationId = decodeURIComponent(route.slice('/admin/operations/'.length))
    const state = updateState(updateOperations)
    const operation = [...state.operations, ...state.history].find(
      item => item.operation_id === operationId,
    )
    return operation ? success(config, operation) : requestError(config, 'Operation not found')
  }
  if (route === '/admin/history' && method === 'get') {
    const state = updateState(updateOperations)
    return success(config, {
      count: state.history.length,
      operations: state.history.slice(0, Number(params.limit || 50)),
    })
  }
  if (route === '/admin/history' && method === 'delete') {
    const count = readState().history.length
    updateState(current => {
      current.history = []
      return current
    })
    return success(config, { deleted: count })
  }
  if (route === '/admin/db-stats' && method === 'get') {
    const calculatedAt =
      snapshot.dashboard.metadata?.calculatedAt || snapshot.manifest.sourceSnapshotDate
    return success(config, {
      offline: true,
      database: 'preservation-snapshot',
      collections: {
        repositories: {
          count: snapshot.dashboard.kpis.totalRepos,
          last_updated: calculatedAt,
        },
        users: {
          count: snapshot.dashboard.kpis.totalUsers,
          last_updated: calculatedAt,
        },
        organizations: {
          count: snapshot.dashboard.kpis.totalOrgs,
          last_updated: calculatedAt,
        },
      },
      snapshot: snapshot.manifest,
    })
  }

  if (
    method === 'post' &&
    (route === '/pipeline/run-all' ||
      route.startsWith('/ingestion/') ||
      route.startsWith('/enrichment/'))
  ) {
    const operation = createOperation({
      type: route.includes('pipeline') ? 'pipeline' : route.split('/')[1],
      entity: route.split('/')[2] || null,
      mode: params.mode || (params.from_scratch ? 'from_scratch' : 'incremental'),
    })
    updateState(current => {
      current.operations.push(operation)
      return current
    })
    return success(config, {
      task_id: operation.operation_id,
      status: operation.status,
      mode: operation.mode,
      message: operation.progress_message,
    })
  }
  if (route.startsWith('/ingestion/status/') && method === 'get') {
    const operationId = decodeURIComponent(route.slice('/ingestion/status/'.length))
    const state = updateState(updateOperations)
    const operation = [...state.operations, ...state.history].find(
      item => item.operation_id === operationId,
    )
    return operation
      ? success(config, operation)
      : success(config, { status: 'not_found', progress: 'Tarea no encontrada' })
  }
  if (route === '/tasks' && method === 'get') {
    const state = updateState(updateOperations)
    const tasks = [...state.operations, ...state.history]
    return success(config, { total_tasks: tasks.length, tasks })
  }

  return requestError(config, `Offline route not implemented: ${method.toUpperCase()} ${route}`)
}

export function getOfflineSnapshot() {
  return clone(snapshot)
}
