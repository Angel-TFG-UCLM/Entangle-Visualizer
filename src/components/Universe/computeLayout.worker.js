/**
 * Web Worker — Compute Layout del Quantum Universe
 * =================================================
 * Mueve la computación pesada de posicionamiento (O(n²~n³)) fuera del
 * hilo principal para que las animaciones CSS del loader no se congelen.
 */

// ============================================================================
// UTILIDADES
// ============================================================================

function seededRandom(seed) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646 }
}

// Vector3 mínimo — solo se necesita constructor + distanceTo
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
  distanceTo(v) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
}

// ============================================================================
// CONSTANTES
// ============================================================================

const REPO_MIN_ORBIT = 18
const REPO_MAX_ORBIT = 55
const USER_MIN_ORBIT = 4
const USER_MAX_ORBIT = 10

// ============================================================================
// LAYOUT: distribución basada en colaboración real
// ============================================================================

function computeLayout(graph, nodeMetrics) {
  if (!graph?.nodes?.length) return null

  const orgNodes = graph.nodes.filter(n => n.type === 'org')
  const repoNodes = graph.nodes.filter(n => n.type === 'repo')
  const userNodes = graph.nodes.filter(n => n.type === 'user')

  const orgRepos = {}
  const repoUsers = {}

  const repoMap = new Map(repoNodes.map(n => [n.id, n]))
  const userMap = new Map(userNodes.map(n => [n.id, n]))

  const repoOwner = {}

  graph.links.forEach(link => {
    if (link.type === 'owns') {
      if (!orgRepos[link.source]) orgRepos[link.source] = []
      const repo = repoMap.get(link.target)
      if (repo) {
        orgRepos[link.source].push(repo)
        repoOwner[link.target] = link.source
      }
    }
    if (link.type === 'contributed_to') {
      if (!repoUsers[link.target]) repoUsers[link.target] = []
      const user = userMap.get(link.source)
      if (user && !repoUsers[link.target].find(u => u.id === user.id)) {
        repoUsers[link.target].push(user)
      }
    }
  })

  // FASE 1: Grafo de colaboración inter-org
  const userOrgs = {}
  graph.links.forEach(link => {
    if (link.type === 'contributed_to') {
      const org = repoOwner[link.target]
      if (org) {
        if (!userOrgs[link.source]) userOrgs[link.source] = new Set()
        userOrgs[link.source].add(org)
      }
    }
  })

  const orgCollabMap = new Map()
  const orgNeighbors = {}
  Object.values(userOrgs).forEach(orgSet => {
    if (orgSet.size < 2) return
    const orgs = Array.from(orgSet)
    for (let i = 0; i < orgs.length; i++) {
      for (let j = i + 1; j < orgs.length; j++) {
        const key = orgs[i] < orgs[j] ? `${orgs[i]}|${orgs[j]}` : `${orgs[j]}|${orgs[i]}`
        orgCollabMap.set(key, (orgCollabMap.get(key) || 0) + 1)
        if (!orgNeighbors[orgs[i]]) orgNeighbors[orgs[i]] = new Map()
        if (!orgNeighbors[orgs[j]]) orgNeighbors[orgs[j]] = new Map()
        orgNeighbors[orgs[i]].set(orgs[j], (orgNeighbors[orgs[i]].get(orgs[j]) || 0) + 1)
        orgNeighbors[orgs[j]].set(orgs[i], (orgNeighbors[orgs[j]].get(orgs[i]) || 0) + 1)
      }
    }
  })

  // FASE 2: Score de centralidad por org
  const orgScore = {}
  let useBackendMetrics = false

  if (nodeMetrics) {
    const anyOrgHasMetrics = orgNodes.some(org =>
      nodeMetrics[org.id]?.collab_centrality !== undefined
    )
    if (anyOrgHasMetrics) {
      useBackendMetrics = true
      orgNodes.forEach(org => {
        orgScore[org.id] = nodeMetrics[org.id]?.collab_centrality ?? 0
      })
    }
  }

  if (!useBackendMetrics) {
    orgNodes.forEach(org => {
      const neighbors = orgNeighbors[org.id]
      if (!neighbors || neighbors.size === 0) {
        orgScore[org.id] = 0
      } else {
        let total = 0
        neighbors.forEach(count => { total += count })
        orgScore[org.id] = total
      }
    })
  }

  const sortedByScore = [...orgNodes].sort((a, b) => orgScore[b.id] - orgScore[a.id])

  if (sortedByScore.length > 0) {
    console.log(`[Layout Worker] Modo: ${useBackendMetrics ? 'BACKEND collab_centrality' : 'LOCAL orgScore'}`)
    console.log(`[Layout Worker] Top 5 orgs:`, sortedByScore.slice(0, 5).map(o => `${o.id}=${orgScore[o.id]}`))
  }

  // FASE 3: Posicionar orgs
  const repoCount = repoNodes.length
  const scaleFactor = repoCount > 200 ? Math.sqrt(repoCount / 200) : 1
  const positions = {}
  const rng = seededRandom(42)

  const CORE_RADIUS = 150 * scaleFactor
  const PERIPHERY_MIN = 500 * scaleFactor
  const PERIPHERY_MAX = 900 * scaleFactor

  const coreOrgs = []
  const midOrgs = []
  const isolatedOrgs = []

  if (useBackendMetrics) {
    sortedByScore.forEach(org => {
      const s = orgScore[org.id]
      if (s >= 40) coreOrgs.push(org)
      else if (s > 0) midOrgs.push(org)
      else isolatedOrgs.push(org)
    })
  } else {
    const maxScore = Math.max(...Object.values(orgScore), 1)
    sortedByScore.forEach(org => {
      const s = orgScore[org.id]
      if (s >= maxScore * 0.15) coreOrgs.push(org)
      else if (s > 0) midOrgs.push(org)
      else isolatedOrgs.push(org)
    })
  }

  console.log(`[Layout Worker] Zonas: core=${coreOrgs.length}, mid=${midOrgs.length}, isolated=${isolatedOrgs.length}`)

  const orgPositions = []
  const MIN_SEP = 80 * scaleFactor

  function placeOrg(org, rMin, rMax) {
    if (coreOrgs.length > 0 && coreOrgs[0] === org && !positions[org.id]) {
      const pos = new Vec3(0, 0, 0)
      positions[org.id] = pos
      orgPositions.push(pos)
      return
    }

    const neighbors = orgNeighbors[org.id]
    let attractCenter = null
    if (neighbors && neighbors.size > 0) {
      let wx = 0, wy = 0, wz = 0, wTotal = 0
      neighbors.forEach((count, neighborId) => {
        const np = positions[neighborId]
        if (np) {
          wx += np.x * count
          wy += np.y * count
          wz += np.z * count
          wTotal += count
        }
      })
      if (wTotal > 0) {
        attractCenter = new Vec3(wx / wTotal, wy / wTotal, wz / wTotal)
      }
    }

    let best = null
    let bestScore = -Infinity

    for (let attempt = 0; attempt < 80; attempt++) {
      const r = rMin + rng() * (rMax - rMin)
      const θ = rng() * Math.PI * 2
      const ψ = 0.3 + rng() * 2.2
      const yBias = (rng() - 0.45) * r * 0.5

      const candidate = new Vec3(
        r * Math.sin(ψ) * Math.cos(θ),
        yBias,
        r * Math.sin(ψ) * Math.sin(θ)
      )

      let minDist = Infinity
      for (const prev of orgPositions) {
        const d = candidate.distanceTo(prev)
        if (d < minDist) minDist = d
      }
      if (minDist < MIN_SEP * 0.5) continue

      let score = Math.min(minDist, MIN_SEP * 2)

      if (attractCenter) {
        const distToNeighbors = candidate.distanceTo(attractCenter)
        score -= distToNeighbors * 0.3
      }

      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }

    if (!best) {
      const r = rMin + rng() * (rMax - rMin)
      const θ = rng() * Math.PI * 2
      best = new Vec3(r * Math.cos(θ), (rng() - 0.5) * r * 0.4, r * Math.sin(θ))
    }

    positions[org.id] = best
    orgPositions.push(best)
  }

  coreOrgs.forEach(org => placeOrg(org, 0, CORE_RADIUS))
  midOrgs.forEach(org => placeOrg(org, CORE_RADIUS * 0.5, PERIPHERY_MIN))
  isolatedOrgs.forEach(org => placeOrg(org, PERIPHERY_MIN, PERIPHERY_MAX))

  // FASE 4: Repos en órbita alrededor de sus orgs
  const assignedRepos = new Set()
  const baseRepoMin = REPO_MIN_ORBIT * Math.max(1, scaleFactor * 0.7)
  const baseRepoMax = REPO_MAX_ORBIT * Math.max(1, scaleFactor * 0.7)

  Object.entries(orgRepos).forEach(([orgId, repos]) => {
    const c = positions[orgId]; if (!c) return
    const numRepos = repos.length

    const repoSpread = Math.max(1, Math.pow(numRepos / 4, 0.75))
    const rMin = baseRepoMin * repoSpread
    const rMax = baseRepoMax * repoSpread

    repos.forEach((repo, i) => {
      const baseAngle = (i / numRepos) * Math.PI * 2
      const angleJitter = (rng() - 0.5) * (Math.PI * 2 / Math.max(numRepos, 3)) * 0.8
      const a = baseAngle + angleJitter
      const orbitR = rMin + rng() * (rMax - rMin)
      const tilt = (rng() - 0.5) * Math.PI * 0.4

      positions[repo.id] = new Vec3(
        c.x + orbitR * Math.cos(a) * Math.cos(tilt),
        c.y + orbitR * Math.sin(tilt) + (rng() - 0.5) * 12,
        c.z + orbitR * Math.sin(a) * Math.cos(tilt)
      )
      assignedRepos.add(repo.id)
    })
  })

  const orphanRepos = repoNodes.filter(r => !assignedRepos.has(r.id))
  orphanRepos.forEach((repo, i) => {
    const a = (i / Math.max(orphanRepos.length, 1)) * Math.PI * 2 + rng() * 0.5
    const r2 = PERIPHERY_MIN * 0.5 + rng() * PERIPHERY_MIN * 0.4
    const yOff = (rng() - 0.5) * PERIPHERY_MIN * 0.25
    positions[repo.id] = new Vec3(
      r2 * Math.cos(a) + (rng() - 0.5) * 30,
      yOff,
      r2 * Math.sin(a) + (rng() - 0.5) * 30
    )
  })

  // FASE 5: Users
  const assignedUsers = new Set()
  const userRepoLinks = {}
  graph.links.forEach(link => {
    if (link.type === 'contributed_to') {
      if (!userRepoLinks[link.source]) userRepoLinks[link.source] = []
      userRepoLinks[link.source].push(link.target)
    }
  })

  userNodes.forEach(user => {
    if (assignedUsers.has(user.id)) return
    const linkedRepos = userRepoLinks[user.id] || []
    const repoPositions = linkedRepos.map(rid => positions[rid]).filter(Boolean)
    if (repoPositions.length === 0) return

    const rp = repoPositions[0]
    const repoId = linkedRepos[0]
    const repoUserCount = repoId && repoUsers[repoId] ? repoUsers[repoId].length : 1
    const densityScale = repoUserCount > 50
      ? 1 + Math.sqrt(repoUserCount) * 0.5
      : 1 + Math.log2(Math.max(repoUserCount, 1)) * 0.5
    const uR = (USER_MIN_ORBIT + rng() * (USER_MAX_ORBIT - USER_MIN_ORBIT)) * densityScale
    const θ = rng() * Math.PI * 2
    const φ = Math.acos(2 * rng() - 1)
    positions[user.id] = new Vec3(
      rp.x + uR * Math.sin(φ) * Math.cos(θ),
      rp.y + uR * Math.cos(φ),
      rp.z + uR * Math.sin(φ) * Math.sin(θ)
    )
    assignedUsers.add(user.id)
  })

  userNodes.filter(u => !assignedUsers.has(u.id)).forEach((user, i) => {
    const a = rng() * Math.PI * 2
    const r2 = PERIPHERY_MIN * 0.5 + rng() * PERIPHERY_MIN * 0.3
    positions[user.id] = new Vec3(
      r2 * Math.cos(a) + (rng() - 0.5) * 50,
      (rng() - 0.5) * PERIPHERY_MIN * 0.25,
      r2 * Math.sin(a) + (rng() - 0.5) * 50
    )
  })

  const connections = graph.links
    .filter(l => positions[l.source] && positions[l.target])
    .map(l => ({ source: l.source, target: l.target, type: l.type, start: positions[l.source], end: positions[l.target] }))

  const maxOrgScore = Math.max(...Object.values(orgScore), 1)
  const maxOrgNeighbors = Object.values(orgNeighbors).reduce((mx, m) => Math.max(mx, m.size), 1)

  const userDensity = {}
  userNodes.forEach(user => {
    const repos = userRepoLinks[user.id] || []
    if (repos.length === 0) { userDensity[user.id] = 1; return }
    const rid = repos[0]
    const count = rid && repoUsers[rid] ? repoUsers[rid].length : 1
    userDensity[user.id] = Math.max(0.15, 1.0 / Math.pow(count, 0.3))
  })

  return { orgNodes, repoNodes, userNodes, orgRepos, repoUsers, positions, connections, orgScore, orgNeighbors, maxOrgScore, maxOrgNeighbors, userDensity }
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = (e) => {
  const { graph, nodeMetrics, requestId } = e.data
  const t0 = performance.now()
  const result = computeLayout(graph, nodeMetrics)
  const elapsed = (performance.now() - t0).toFixed(1)

  if (!result) {
    self.postMessage({ result: null, requestId })
    return
  }

  // Serializar Vec3 → {x, y, z} para transferencia
  const positions = {}
  for (const key of Object.keys(result.positions)) {
    const v = result.positions[key]
    positions[key] = { x: v.x, y: v.y, z: v.z }
  }

  const connections = result.connections.map(c => ({
    source: c.source, target: c.target, type: c.type,
    start: { x: c.start.x, y: c.start.y, z: c.start.z },
    end: { x: c.end.x, y: c.end.y, z: c.end.z },
  }))

  // Serializar Maps → objetos planos
  const orgNeighbors = {}
  if (result.orgNeighbors) {
    for (const [orgId, neighborMap] of Object.entries(result.orgNeighbors)) {
      orgNeighbors[orgId] = neighborMap instanceof Map
        ? Object.fromEntries(neighborMap)
        : neighborMap
    }
  }

  console.log(`[Layout Worker] Cálculo completado en ${elapsed}ms`)

  self.postMessage({
    result: {
      orgNodes: result.orgNodes,
      repoNodes: result.repoNodes,
      userNodes: result.userNodes,
      orgRepos: result.orgRepos,
      repoUsers: result.repoUsers,
      positions,
      connections,
      orgScore: result.orgScore,
      orgNeighbors,
      maxOrgScore: result.maxOrgScore,
      maxOrgNeighbors: result.maxOrgNeighbors,
      userDensity: result.userDensity,
    },
    requestId,
  })
}
