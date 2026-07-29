import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    const value = argv[i + 1]
    if (key && value) args[key] = value
  }
  return args
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
}

const PRIVATE_FIELDS = new Set([
  'email',
  'token',
  'secret',
  'password',
  'authorization',
  'connection_string',
  'api_key',
])

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_FIELDS.has(key.toLowerCase()))
      .map(([key, child]) => [key, sanitize(child)]),
  )
}

function metricScore(metric = {}) {
  return (
    (metric.collab_centrality_raw || 0) * 20 +
    (metric.collab_connectivity_raw || 0) * 10 +
    (metric.betweenness || 0) * 1_000_000 +
    (metric.degree || 0) * 100_000
  )
}

function buildCompactGraph(discovery, network) {
  const nodes = discovery.graph?.nodes || []
  const links = discovery.graph?.links || []
  const nodeMetrics = network.node_metrics || {}
  const nodeById = new Map(nodes.map(node => [node.id, node]))

  const ownsLinks = links.filter(link => link.type === 'owns')
  const contributionLinks = links.filter(link => link.type === 'contributed_to')
  const repoToOrg = new Map(ownsLinks.map(link => [link.target, link.source]))
  const repoContributors = new Map()

  for (const link of contributionLinks) {
    if (!repoToOrg.has(link.target)) continue
    const contributors = repoContributors.get(link.target) || []
    contributors.push(link.source)
    repoContributors.set(link.target, contributors)
  }

  const orgNodes = nodes.filter(node => node.type === 'org')
  const selectedOrgIds = new Set(
    orgNodes
      .filter(org => ownsLinks.some(link => link.source === org.id))
      .sort((a, b) => {
        const scoreA =
          metricScore(nodeMetrics[a.id]) +
          (a.graph_bridge_count || 0) * 200 +
          (a.graph_contributors_count || 0) * 20 +
          (a.total_stars || 0) / 10
        const scoreB =
          metricScore(nodeMetrics[b.id]) +
          (b.graph_bridge_count || 0) * 200 +
          (b.graph_contributors_count || 0) * 20 +
          (b.total_stars || 0) / 10
        return scoreB - scoreA
      })
      .slice(0, 18)
      .map(org => org.id),
  )

  const reposByOrg = new Map()
  for (const link of ownsLinks) {
    if (!selectedOrgIds.has(link.source)) continue
    const repo = nodeById.get(link.target)
    if (!repo) continue
    const repos = reposByOrg.get(link.source) || []
    repos.push(repo)
    reposByOrg.set(link.source, repos)
  }

  const selectedRepoIds = new Set()
  for (const repos of reposByOrg.values()) {
    repos
      .sort((a, b) => {
        const scoreA = (a.stars || 0) + (repoContributors.get(a.id)?.length || 0) * 80
        const scoreB = (b.stars || 0) + (repoContributors.get(b.id)?.length || 0) * 80
        return scoreB - scoreA
      })
      .slice(0, 7)
      .forEach(repo => selectedRepoIds.add(repo.id))
  }

  const userRepoCounts = new Map()
  for (const link of contributionLinks) {
    if (!selectedRepoIds.has(link.target)) continue
    const repoIds = userRepoCounts.get(link.source) || new Set()
    repoIds.add(link.target)
    userRepoCounts.set(link.source, repoIds)
  }

  const selectedUserIds = new Set(
    [...userRepoCounts.entries()]
      .map(([userId, repoIds]) => ({
        userId,
        repoCount: repoIds.size,
        node: nodeById.get(userId),
        metric: nodeMetrics[userId],
      }))
      .filter(entry => entry.node && !entry.node.isBot)
      .sort((a, b) => {
        const scoreA =
          a.repoCount * 1000 +
          (a.node.isBridge ? 500 : 0) +
          metricScore(a.metric)
        const scoreB =
          b.repoCount * 1000 +
          (b.node.isBridge ? 500 : 0) +
          metricScore(b.metric)
        return scoreB - scoreA
      })
      .slice(0, 180)
      .map(entry => entry.userId),
  )

  const selectedNodeIds = new Set([
    ...selectedOrgIds,
    ...selectedRepoIds,
    ...selectedUserIds,
  ])

  const compactNodes = nodes.filter(node => selectedNodeIds.has(node.id))
  const compactLinks = links.filter(
    link => selectedNodeIds.has(link.source) && selectedNodeIds.has(link.target),
  )

  const selectedBridgeUsers = (discovery.bridge_users || []).filter(user => {
    const id = user.id || `user_${user.login}`
    return selectedUserIds.has(id)
  })
  const connectedPairs = (discovery.connected_pairs || []).slice(0, 20).map(pair => ({
    repo_a: pair.repo_a,
    repo_b: pair.repo_b,
    shared_users_count: pair.shared_users_count ?? pair.shared_users?.length ?? 0,
    shared_users: (pair.shared_users || []).slice(0, 12),
  }))

  return {
    selectedNodeIds,
    collaboration: {
      ...sanitize(discovery),
      graph: {
        nodes: sanitize(compactNodes),
        links: sanitize(compactLinks),
      },
      bridge_users: sanitize(selectedBridgeUsers),
      connected_pairs: sanitize(connectedPairs),
      snapshot: {
        compact: true,
        nodes: compactNodes.length,
        links: compactLinks.length,
        source_nodes: nodes.length,
        source_links: links.length,
      },
    },
  }
}

function buildNetworkSubset(network, selectedNodeIds) {
  const nodeMetrics = Object.fromEntries(
    Object.entries(network.node_metrics || {})
      .filter(([nodeId]) => selectedNodeIds.has(nodeId))
      .map(([nodeId, metric]) => [nodeId, sanitize(metric)]),
  )

  return {
    communities: sanitize(network.communities || []),
    global_metrics: sanitize(network.global_metrics || {}),
    discipline_analysis: sanitize(network.discipline_analysis || {}),
    node_metrics: nodeMetrics,
    snapshot: {
      compact: true,
      node_metrics: Object.keys(nodeMetrics).length,
      source_node_metrics: Object.keys(network.node_metrics || {}).length,
    },
  }
}

function flattenGroups(groups) {
  if (Array.isArray(groups)) return groups
  if (!groups || typeof groups !== 'object') return []
  return Object.values(groups).flatMap(value => (Array.isArray(value) ? value : []))
}

function buildFilterIndex(discovery, network, dashboard) {
  const nodes = discovery.graph?.nodes || []
  const links = discovery.graph?.links || []
  const repoToOrg = {}
  const repoUsers = {}

  for (const link of links) {
    if (link.type === 'owns') repoToOrg[link.target] = link.source
    if (link.type === 'contributed_to') {
      if (!repoUsers[link.target]) repoUsers[link.target] = []
      repoUsers[link.target].push(link.source)
    }
  }

  const disciplines = {}
  for (const [nodeId, metric] of Object.entries(network.node_metrics || {})) {
    if (!nodeId.startsWith('user_') || !metric?.discipline) continue
    disciplines[nodeId] = {
      discipline: metric.discipline,
      discipline_label: metric.discipline_label || null,
      discipline_color: metric.discipline_color || null,
    }
  }

  const organizations = nodes
    .filter(node => node.type === 'org')
    .map(node => ({
          id: node.id,
          type: node.type,
          login: node.login,
          name: node.name,
          avatar_url: node.avatar_url || null,
          description: node.description || null,
          location: node.location || null,
          quantum_focus_score: node.quantum_focus_score || 0,
          quantum_repos_count: node.quantum_repos_count || 0,
          total_stars: node.total_stars || 0,
          graph_contributors_count: node.graph_contributors_count || 0,
          graph_bridge_count: node.graph_bridge_count || 0,
        }))
  const repositories = nodes
    .filter(node => node.type === 'repo')
    .map(node => ({
          id: node.id,
          type: node.type,
          name: node.name,
          full_name: node.full_name,
          stars: node.stars || 0,
          language: node.language || null,
          org: node.org || null,
          pushed_at_year: node.pushed_at_year || null,
        }))
  const users = nodes
    .filter(node => node.type === 'user')
    .map(node => ({
          id: node.id,
          type: node.type,
          login: node.login,
          name: node.name || node.login,
          avatar_url: node.avatar_url || null,
          repos_count: node.repos_count || 0,
          orgs_count: node.orgs_count || 0,
          isBridge: Boolean(node.isBridge),
          isBot: Boolean(node.isBot),
          quantum_expertise_score: node.quantum_expertise_score || 0,
        }))

  const organizationIds = new Set(organizations.map(org => org.id))
  for (const org of flattenGroups(dashboard.charts?.organizations)) {
    const login = org.login
    if (!login) continue
    const id = `org_${login}`
    if (organizationIds.has(id)) continue
    organizationIds.add(id)
    organizations.push({
      id,
      type: 'org',
      login,
      name: org.name || login,
      avatar_url: org.avatar_url || null,
      description: org.description || null,
      location: org.location || null,
      quantum_focus_score: org.quantum_focus_score || 0,
      quantum_repos_count: org.quantum_repositories_count || org.quantum_repos_count || 0,
      total_stars: org.total_stars || 0,
      graph_contributors_count: org.quantum_contributors_count || 0,
      graph_bridge_count: org.shared_users_count || 0,
    })
  }

  const repositoryIds = new Set(repositories.map(repo => repo.id))
  for (const repo of flattenGroups(dashboard.charts?.repositories)) {
    if (!repo.full_name) continue
    const id = `repo_${repo.full_name}`
    if (!repositoryIds.has(id)) {
      repositoryIds.add(id)
      repositories.push({
        id,
        type: 'repo',
        name: repo.name || repo.full_name.split('/').at(-1),
        full_name: repo.full_name,
        stars: repo.stargazer_count || repo.stars || 0,
        language: repo.primary_language || repo.language || null,
        org: repo.owner?.login || repo.organization?.login || null,
        pushed_at_year: repo.pushed_at ? new Date(repo.pushed_at).getUTCFullYear() : null,
      })
    }
    const owner = repo.owner?.login || repo.organization?.login
    if (owner) {
      repoToOrg[id] = `org_${owner}`
      if (!organizationIds.has(`org_${owner}`)) {
        organizationIds.add(`org_${owner}`)
        organizations.push({
          id: `org_${owner}`,
          type: 'org',
          login: owner,
          name: owner,
          avatar_url: repo.owner?.avatar_url || null,
          description: null,
          location: null,
          quantum_focus_score: 0,
          quantum_repos_count: 0,
          total_stars: 0,
          graph_contributors_count: 0,
          graph_bridge_count: 0,
        })
      }
    }
  }

  const userIds = new Set(users.map(user => user.id))
  for (const user of flattenGroups(dashboard.charts?.users)) {
    if (!user.login) continue
    const id = `user_${user.login}`
    if (userIds.has(id)) continue
    userIds.add(id)
    users.push({
      id,
      type: 'user',
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url || null,
      repos_count: user.public_repos || user.relevant_repos_count || 0,
      orgs_count: user.organizations?.length || 0,
      isBridge: Boolean(user.is_bridge),
      isBot: Boolean(user.is_bot),
      quantum_expertise_score: user.quantum_expertise_score || 0,
    })
  }

  for (const repo of dashboard.graph?.repositories || []) {
    if (!repo.full_name) continue
    const repoId = `repo_${repo.full_name}`
    const owner = repo.owner?.login || repo.organization?.login
    if (owner) repoToOrg[repoId] = `org_${owner}`
    if (!repoUsers[repoId]) repoUsers[repoId] = []
    for (const collaborator of repo.collaborators || []) {
      const login = typeof collaborator === 'string' ? collaborator : collaborator.login
      if (!login) continue
      const userId = `user_${login}`
      if (!repoUsers[repoId].includes(userId)) repoUsers[repoId].push(userId)
      if (!userIds.has(userId)) {
        userIds.add(userId)
        users.push({
          id: userId,
          type: 'user',
          login,
          name: collaborator.name || login,
          avatar_url: collaborator.avatar_url || null,
          repos_count: 1,
          orgs_count: owner ? 1 : 0,
          isBridge: false,
          isBot: false,
          quantum_expertise_score: collaborator.quantum_expertise_score || 0,
        })
      }
    }
  }

  return {
    organizations: sanitize(organizations),
    repositories: sanitize(repositories),
    users: sanitize(users),
    repoToOrg,
    repoUsers,
    disciplines,
    counts: {
      organizations: organizations.length,
      repositories: repositories.length,
      users: users.length,
      contributions: links.filter(link => link.type === 'contributed_to').length,
    },
  }
}

const args = parseArgs(process.argv.slice(2))
for (const required of ['dashboard', 'collaboration', 'network', 'out']) {
  if (!args[required]) {
    throw new Error(`Missing --${required} argument`)
  }
}

const dashboard = sanitize(readJson(args.dashboard))
const discovery = readJson(args.collaboration)
const network = readJson(args.network)
const { selectedNodeIds, collaboration } = buildCompactGraph(discovery, network)
const networkSubset = buildNetworkSubset(network, selectedNodeIds)
const filterIndex = buildFilterIndex(discovery, network, dashboard)

dashboard.metadata = {
  ...(dashboard.metadata || {}),
  source: 'offline-snapshot',
  snapshotDate: '2026-07-29T00:00:00Z',
  publicFieldsSanitized: true,
}

const output = {
  manifest: {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'Entangle public API',
    sourceSnapshotDate: dashboard.metadata.calculatedAt || '2026-07-14T16:14:01.244',
    publicFieldsSanitized: true,
    description:
      'Compact preservation snapshot derived from the public Entangle dashboard, collaboration graph and network metrics.',
  },
  dashboard,
  collaboration,
  network: networkSubset,
  filterIndex,
}

const outputPath = path.resolve(args.out)
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`)

console.log(
  JSON.stringify(
    {
      output: outputPath,
      dashboard: dashboard.kpis,
      universeNodes: collaboration.graph.nodes.length,
      universeLinks: collaboration.graph.links.length,
      networkMetrics: Object.keys(networkSubset.node_metrics).length,
      filterIndex: filterIndex.counts,
    },
    null,
    2,
  ),
)
