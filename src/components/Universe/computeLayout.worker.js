/**
 * Web Worker - Compute Layout del Quantum Universe
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

// Vector3 mínimo - solo se necesita constructor + distanceTo
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
  distanceTo(v) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
}

// ============================================================================
// ALGORITMO DE JENKS NATURAL BREAKS (Fisher-Jenks)
// ============================================================================
// Clasifica datos 1D en k grupos minimizando la varianza intra-grupo (SDCM).
// Las fronteras de zona emergen de la distribución real de los datos,
// sin constantes arbitrarias. O(n^2 * k) - trivial para n~127, k=3.
// Ref: Fisher, W.D. (1958) "On Grouping for Maximum Homogeneity"

function jenksNaturalBreaks(data, nClasses) {
  const sorted = [...data].sort((a, b) => a - b)
  const n = sorted.length

  if (n <= nClasses) {
    const step = n > 1 ? (sorted[n - 1] - sorted[0]) / nClasses : sorted[0]
    return {
      boundaries: Array.from({length: nClasses - 1}, (_, i) => sorted[0] + step * (i + 1)),
      classStarts: Array.from({length: nClasses}, (_, i) => Math.min(i, n - 1)),
      sorted
    }
  }

  // DP: lower[i][j] = inicio optimo de clase j para los i primeros elementos
  // vari[i][j] = SDCM minima para esa clasificacion
  const lower = Array.from({length: n + 1}, () => new Int32Array(nClasses + 1))
  const vari = Array.from({length: n + 1}, () => {
    const r = new Float64Array(nClasses + 1); r.fill(Infinity); return r
  })

  for (let j = 1; j <= nClasses; j++) { lower[1][j] = 1; vari[1][j] = 0 }

  for (let l = 2; l <= n; l++) {
    let sum = 0, sumSq = 0, w = 0
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1
      const val = sorted[i3 - 1]
      w++; sum += val; sumSq += val * val
      const v = sumSq - (sum * sum) / w
      if (i3 > 1) {
        for (let j = 2; j <= nClasses; j++) {
          const cost = v + vari[i3 - 1][j - 1]
          if (cost < vari[l][j]) { lower[l][j] = i3; vari[l][j] = cost }
        }
      }
    }
    lower[l][1] = 1
    vari[l][1] = sumSq - (sum * sum) / w
  }

  // Backtrack: indice de inicio de cada clase (0-based)
  const classStarts = new Array(nClasses)
  classStarts[0] = 0
  let k = n
  for (let j = nClasses; j >= 2; j--) {
    classStarts[j - 1] = lower[k][j] - 1
    k = lower[k][j] - 1
  }

  // Frontera = punto medio entre ultimo de clase C y primero de clase C+1
  const boundaries = []
  for (let c = 1; c < nClasses; c++) {
    boundaries.push((sorted[classStarts[c] - 1] + sorted[classStarts[c]]) / 2)
  }

  return { boundaries, classStarts, sorted }
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
  // IMPORTANTE: usar collab_centrality_raw (suma de contributors compartidos),
  // NO collab_centrality (percentil 0-100 que distorsiona la clasificación zonal)
  const orgScore = {}
  let useBackendMetrics = false

  if (nodeMetrics) {
    const anyOrgHasMetrics = orgNodes.some(org =>
      nodeMetrics[org.id]?.collab_centrality_raw !== undefined
    )
    if (anyOrgHasMetrics) {
      useBackendMetrics = true
      orgNodes.forEach(org => {
        orgScore[org.id] = nodeMetrics[org.id]?.collab_centrality_raw ?? 0
      })
    }
  }

  if (!useBackendMetrics) {
    // Fallback local: calcular score de colaboración con penalización cuántica
    // para que orgs quantum-focused (Qiskit, quantumlib, etc.) dominen el centro
    // y mega-orgs no cuánticas (Microsoft, Google) queden en periferia.
    orgNodes.forEach(org => {
      const neighbors = orgNeighbors[org.id]
      let rawCollab = 0
      if (neighbors && neighbors.size > 0) {
        neighbors.forEach(count => { rawCollab += count })
      }
      // Quantum relevance weighting (mirrors backend logic)
      const qfs = org.quantum_focus_score ?? 0
      const isQ = org.is_quantum_focused ?? false
      let quantumFactor
      if (isQ) {
        quantumFactor = 1.0 + (qfs / 100)  // [1.0 .. 2.0]
      } else {
        quantumFactor = Math.max(0.05, qfs / 200)  // [0.05 .. 0.5]
      }
      orgScore[org.id] = Math.round(rawCollab * quantumFactor)
    })
  }

  const sortedByScore = [...orgNodes].sort((a, b) => orgScore[b.id] - orgScore[a.id])

  if (sortedByScore.length > 0) {
    console.log(`[Layout Worker] Modo: ${useBackendMetrics ? 'BACKEND collab_centrality_raw' : 'LOCAL orgScore'}`)
    console.log(`[Layout Worker] Top 10 orgs:`, sortedByScore.slice(0, 10).map(o => `${o.id}=${orgScore[o.id]}`))
    console.log(`[Layout Worker] Bottom 5 orgs:`, sortedByScore.slice(-5).map(o => `${o.id}=${orgScore[o.id]}`))
  }

  // FASE 3: Posicionar orgs
  const repoCount = repoNodes.length
  const scaleFactor = repoCount > 200 ? Math.sqrt(repoCount / 200) : 1
  const positions = {}
  const rng = seededRandom(42)

  // PERIPHERY_MAX: parametro de escala visual (define el tamano del universo).
  // NO es una frontera de zona - solo el lienzo maximo de posicionamiento.
  const PERIPHERY_MAX = 900 * scaleFactor

  const orgPositions = []
  const MIN_SEP = 55 * scaleFactor

  // Mapeo CONTINUO logaritmico: radio proporcional a log(score)
  const nonZeroOrgs = sortedByScore.filter(o => orgScore[o.id] > 0)
  const maxScore = nonZeroOrgs.length > 0 ? orgScore[nonZeroOrgs[0].id] : 1

  // Pre-computar targetR para TODAS las orgs con colaboracion (antes del placement)
  // Esto permite alimentar el algoritmo de Jenks con la distribucion completa.
  const orgTargetR = {}
  const allTargetRadii = []
  for (const org of nonZeroOrgs) {
    const score = orgScore[org.id]
    const normalized = Math.log(1 + score) / Math.log(1 + maxScore)
    const curved = Math.pow(normalized, 0.7)
    const tr = PERIPHERY_MAX * (1 - curved)
    orgTargetR[org.id] = tr
    allTargetRadii.push(tr)
  }

  // JENKS NATURAL BREAKS: fronteras de zona derivadas de la distribucion real.
  // El algoritmo (Fisher 1958) minimiza la varianza intra-clase (SDCM),
  // encontrando los cortes naturales donde la distribucion de radios se
  // separa por si sola. Cero constantes arbitrarias - todo lo define el dato.
  let CORE_BOUNDARY, MID_BOUNDARY
  if (allTargetRadii.length >= 6) {
    const { boundaries, classStarts } = jenksNaturalBreaks(allTargetRadii, 3)
    CORE_BOUNDARY = boundaries[0]
    MID_BOUNDARY = boundaries[1]
    const c1 = classStarts[1]
    const c2 = classStarts[2] - classStarts[1]
    const c3 = allTargetRadii.length - classStarts[2]
    console.log(`[Layout Worker] Jenks Natural Breaks -> core<${CORE_BOUNDARY.toFixed(0)} (${c1} orgs), mid<${MID_BOUNDARY.toFixed(0)} (${c2} orgs), peripheral (${c3} orgs)`)
  } else {
    CORE_BOUNDARY = PERIPHERY_MAX * 0.25
    MID_BOUNDARY = PERIPHERY_MAX * 0.6
    console.log(`[Layout Worker] Fallback (n<6): core<${CORE_BOUNDARY.toFixed(0)}, mid<${MID_BOUNDARY.toFixed(0)}`)
  }

  function placeOrg(org, rMin, rMax) {
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

  // Org #1 (mayor score): centro absoluto
  if (sortedByScore.length > 0 && orgScore[sortedByScore[0].id] > 0) {
    positions[sortedByScore[0].id] = new Vec3(0, 0, 0)
    orgPositions.push(positions[sortedByScore[0].id])
  }

  // Resto: usar targetR pre-computado (ya alimentó a Jenks)
  const startIdx = (sortedByScore.length > 0 && orgScore[sortedByScore[0].id] > 0) ? 1 : 0
  for (let i = startIdx; i < sortedByScore.length; i++) {
    const org = sortedByScore[i]
    const score = orgScore[org.id]

    if (score > 0) {
      const targetR = orgTargetR[org.id]
      const band = Math.max(MIN_SEP, targetR * 0.15)
      placeOrg(org, Math.max(0, targetR - band), targetR + band)
    } else {
      // Sin colaboracion inter-org -> mas alla de la frontera natural
      placeOrg(org, MID_BOUNDARY, PERIPHERY_MAX)
    }
  }

  // Derivar zonas desde posiciones reales (para metadatos visuales y fronteras)
  const coreOrgs = []
  const midOrgs = []
  const isolatedOrgs = []
  sortedByScore.forEach(org => {
    const p = positions[org.id]
    if (!p) { isolatedOrgs.push(org); return }
    const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
    if (r <= CORE_BOUNDARY) coreOrgs.push(org)
    else if (r <= MID_BOUNDARY) midOrgs.push(org)
    else isolatedOrgs.push(org)
  })

  console.log(`[Layout Worker] Distribución continua: core=${coreOrgs.length}, mid=${midOrgs.length}, isolated=${isolatedOrgs.length}`)
  console.log(`[Layout Worker] Score: max=${maxScore}, nonZero=${nonZeroOrgs.length}/${sortedByScore.length}`)

  // FASE 4: Repos en órbita alrededor de sus orgs - ponderados por nº de contribuidores
  // Repos con más contribuidores orbitan más cerca de su org ("planetas masivos"),
  // repos con pocos contribuidores orbitan más lejos ("satélites periféricos").
  const assignedRepos = new Set()
  const baseRepoMin = REPO_MIN_ORBIT * Math.max(1, scaleFactor * 0.7)
  const baseRepoMax = REPO_MAX_ORBIT * Math.max(1, scaleFactor * 0.7)

  Object.entries(orgRepos).forEach(([orgId, repos]) => {
    const c = positions[orgId]; if (!c) return
    const numRepos = repos.length

    const repoSpread = Math.max(1, Math.pow(numRepos / 4, 0.75))
    const rMin = baseRepoMin * repoSpread
    const rMax = baseRepoMax * repoSpread

    // Calcular contributorCount para cada repo de esta org
    const repoContribs = repos.map(repo => {
      const users = repoUsers[repo.id]
      return { repo, count: users ? users.length : 0 }
    })
    const maxContribs = Math.max(...repoContribs.map(r => r.count), 1)

    repoContribs.forEach(({ repo, count }, i) => {
      const baseAngle = (i / numRepos) * Math.PI * 2
      const angleJitter = (rng() - 0.5) * (Math.PI * 2 / Math.max(numRepos, 3)) * 0.8
      const a = baseAngle + angleJitter

      // Normalizar: 1.0 = máx contribuidores → órbita cercana, 0 → órbita lejana
      const importance = maxContribs > 1 ? count / maxContribs : 0.5
      // Invertir: más importante = radio más pequeño
      const orbitR = rMax - (rMax - rMin) * importance + (rng() - 0.5) * (rMax - rMin) * 0.15
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
    const r2 = MID_BOUNDARY * 0.5 + rng() * MID_BOUNDARY * 0.4
    const yOff = (rng() - 0.5) * MID_BOUNDARY * 0.25
    positions[repo.id] = new Vec3(
      r2 * Math.cos(a) + (rng() - 0.5) * 30,
      yOff,
      r2 * Math.sin(a) + (rng() - 0.5) * 30
    )
  })

  // FASE 5: Users - posicionados en centroide de sus repos
  // Si un user contribuye a 1 repo → orbita ese repo (como antes)
  // Si contribuye a N repos de la misma org → centroide de esos repos (más cerca del org center)
  // Si contribuye a repos de distintas orgs → centroide ponderado ("bridge developer")
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

    // Calcular centroide de todos los repos a los que contribuye
    let cx = 0, cy = 0, cz = 0
    for (const rp of repoPositions) {
      cx += rp.x; cy += rp.y; cz += rp.z
    }
    cx /= repoPositions.length
    cy /= repoPositions.length
    cz /= repoPositions.length

    // Para 1 repo: orbita normal alrededor del repo
    // Para N repos: orbita alrededor del centroide con radio menor (cluster)
    const isMultiRepo = repoPositions.length > 1
    const primaryRepoId = linkedRepos[0]
    const repoUserCount = primaryRepoId && repoUsers[primaryRepoId] ? repoUsers[primaryRepoId].length : 1
    const densityScale = repoUserCount > 50
      ? 1 + Math.sqrt(repoUserCount) * 0.5
      : 1 + Math.log2(Math.max(repoUserCount, 1)) * 0.5

    // Multi-repo users orbitan más cerca de su centroide (radio reducido)
    const radiusScale = isMultiRepo ? 0.6 : 1.0
    const uR = (USER_MIN_ORBIT + rng() * (USER_MAX_ORBIT - USER_MIN_ORBIT)) * densityScale * radiusScale
    const θ = rng() * Math.PI * 2
    const φ = Math.acos(2 * rng() - 1)
    positions[user.id] = new Vec3(
      cx + uR * Math.sin(φ) * Math.cos(θ),
      cy + uR * Math.cos(φ),
      cz + uR * Math.sin(φ) * Math.sin(θ)
    )
    assignedUsers.add(user.id)
  })

  userNodes.filter(u => !assignedUsers.has(u.id)).forEach((user, i) => {
    const a = rng() * Math.PI * 2
    const r2 = MID_BOUNDARY * 0.5 + rng() * MID_BOUNDARY * 0.3
    positions[user.id] = new Vec3(
      r2 * Math.cos(a) + (rng() - 0.5) * 50,
      (rng() - 0.5) * MID_BOUNDARY * 0.25,
      r2 * Math.sin(a) + (rng() - 0.5) * 50
    )
  })

  const connections = graph.links
    .filter(l => positions[l.source] && positions[l.target])
    .map(l => ({ source: l.source, target: l.target, type: l.type, strength: l.strength || 0, start: positions[l.source], end: positions[l.target] }))

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

  // Metadatos de zonas para el toggle de fronteras
  const zoneMeta = {
    coreRadius: CORE_BOUNDARY,
    peripheryMin: MID_BOUNDARY,
    peripheryMax: PERIPHERY_MAX,
    coreCount: coreOrgs.length,
    midCount: midOrgs.length,
    isolatedCount: isolatedOrgs.length,
  }

  return { orgNodes, repoNodes, userNodes, orgRepos, repoUsers, positions, connections, orgScore, orgNeighbors, maxOrgScore, maxOrgNeighbors, userDensity, zoneMeta }
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
    source: c.source, target: c.target, type: c.type, strength: c.strength || 0,
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
      zoneMeta: result.zoneMeta,
    },
    requestId,
  })
}
