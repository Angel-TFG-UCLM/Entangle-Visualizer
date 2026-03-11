/**
 * Web Worker - Compute Detail Data del panel de entidad
 * =====================================================
 * Carga progresiva en 3 fases:
 *   Phase 1: datos básicos, radar, health, análisis, DNA (instantáneo)
 *   Phase 2: simulaciones de impacto, matriz de colaboración (medio)
 *   Phase 3: entidades similares (pesado - itera todos los nodos del tipo)
 */

// ============================================================================
// SIBLING ORG DETECTION — duplicate for worker (no shared scope)
// ============================================================================
function _areSiblingOrgs(loginA, loginB) {
  if (!loginA || !loginB) return false
  const la = loginA.toLowerCase(), lb = loginB.toLowerCase()
  if (la === lb) return true
  // PRONG 1 — Token-based: first token match (≥4 chars), one must be single-token
  const ta = la.split(/[-_.\s]+/).filter(Boolean)
  const tb = lb.split(/[-_.\s]+/).filter(Boolean)
  if (ta.length && tb.length && ta[0].length >= 4 && ta[0] === tb[0]) {
    if (ta.length === 1 || tb.length === 1) return true
  }
  // PRONG 2 — Prefix-based: shorter normalised prefix of longer, ratio ≤ 3
  const a = la.replace(/[-_\s.]+/g, ''), b = lb.replace(/[-_\s.]+/g, '')
  if (!a || !b) return false
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  if (s.length >= 4 && l.startsWith(s) && l.length / s.length <= 3.0) return true
  return false
}

// ============================================================================
// JENKS NATURAL BREAKS - clasificación data-driven (Fisher 1958)
// ============================================================================
// Misma implementación que computeLayout.worker.js.
// Encuentra k fronteras naturales minimizando la varianza intra-clase (SDCM).
function jenksNaturalBreaks(data, nClasses) {
  const sorted = [...data].sort((a, b) => a - b)
  const n = sorted.length
  if (n <= nClasses) {
    const step = n > 1 ? (sorted[n - 1] - sorted[0]) / nClasses : sorted[0]
    return {
      boundaries: Array.from({length: nClasses - 1}, (_, i) => sorted[0] + step * (i + 1)),
      sorted
    }
  }
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
  const classStarts = new Array(nClasses)
  classStarts[0] = 0
  let k = n
  for (let j = nClasses; j >= 2; j--) {
    classStarts[j - 1] = lower[k][j] - 1
    k = lower[k][j] - 1
  }
  const boundaries = []
  for (let c = 1; c < nClasses; c++) {
    boundaries.push((sorted[classStarts[c] - 1] + sorted[classStarts[c]]) / 2)
  }
  return { boundaries, sorted }
}

// ============================================================================
// PERCENTILE RANK - posición relativa en la distribución (0-1)
// ============================================================================
// Binary search: fracción de la población con valor inferior al dado.
// Incluye medio punto por empates (CDF mid-rank).
function percentileRank(sorted, value) {
  if (!sorted || sorted.length === 0) return 0
  const n = sorted.length
  // bisectLeft: primer índice donde sorted[i] >= value
  let lo = 0, hi = n
  while (lo < hi) { const m = (lo + hi) >> 1; sorted[m] < value ? lo = m + 1 : hi = m }
  // bisectRight: primer índice donde sorted[i] > value
  let lo2 = lo, hi2 = n
  while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; sorted[m] <= value ? lo2 = m + 1 : hi2 = m }
  // lo = count below, lo2-lo = count equal
  return (lo + 0.5 * (lo2 - lo)) / n
}

// ============================================================================
// POPULATION STATS - distribuciones por tipo para normalización data-driven
// ============================================================================
// Computa arrays ORDENADOS de cada métrica para toda la población del mismo tipo.
// Orgs (n≈127): exhaustivo. Repos (n≈866): exhaustivo. Users (n≈12641): eficiente.
function computePopulationStats(entityType, universeData, networkMetrics, idx) {
  if (!universeData) return {}

  if (entityType === 'org') {
    const crossPols = [], bridgePcts = [], influences = []
    const langCounts = [], busFacts = [], spreadCoeffs = []

    for (const org of (universeData.orgNodes || [])) {
      const repos = universeData.orgRepos?.[org.id] || []
      if (repos.length === 0) continue
      const users = new Map()
      repos.forEach(r => (universeData.repoUsers?.[r.id] || []).forEach(u => users.set(u.id, u)))
      const total = users.size
      if (total === 0) continue

      // Bridge %
      const bridges = Array.from(users.values()).filter(u => u.isBridge).length
      bridgePcts.push((bridges / total) * 100)

      // Influence (usuarios × repos)
      influences.push(total * repos.length)

      // Cross pollination
      let cross = 0
      users.forEach(user => {
        const uRepos = idx.userToRepos.get(user.id) || []
        for (const rid of uRepos) {
          if (idx.repoToOrg[rid] && idx.repoToOrg[rid] !== org.id) { cross++; break }
        }
      })
      crossPols.push((cross / total) * 100)

      // Language variety
      langCounts.push(new Set(repos.map(r => r.language).filter(Boolean)).size)

      // Bus factor promedio
      const repoNMs = repos.map(r => networkMetrics?.node_metrics?.[r.id]).filter(Boolean)
      busFacts.push(repoNMs.length > 0
        ? repoNMs.reduce((s, m) => s + (m.bus_factor || 1), 0) / repoNMs.length : 1)

      // Spread (coeficiente de variación)
      const counts = repos.map(r => (universeData.repoUsers?.[r.id] || []).length)
      const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1)
      const dev = counts.reduce((s, c) => s + Math.abs(c - avg), 0) / (counts.length || 1)
      spreadCoeffs.push(dev / (avg || 1))
    }

    return {
      crossPollinations: [...crossPols].sort((a, b) => a - b),
      bridgePcts:        [...bridgePcts].sort((a, b) => a - b),
      influences:        [...influences].sort((a, b) => a - b),
      langCounts:        [...langCounts].sort((a, b) => a - b),
      busFacts:          [...busFacts].sort((a, b) => a - b),
      spreadCoeffs:      [...spreadCoeffs].sort((a, b) => a - b),
    }
  }

  if (entityType === 'repo') {
    const orgDiversities = [], userCounts = [], bridgeRatios = []

    for (const repo of (universeData.repoNodes || [])) {
      const users = universeData.repoUsers?.[repo.id] || []
      userCounts.push(users.length)
      const bridges = users.filter(u => u.isBridge).length
      bridgeRatios.push(users.length > 0 ? bridges / users.length : 0)

      const orgSet = new Set()
      users.forEach(u => {
        const uRepos = idx.userToRepos.get(u.id) || []
        for (const rid of uRepos) {
          const oid = idx.repoToOrg[rid]
          if (oid) orgSet.add(oid)
        }
      })
      orgDiversities.push(orgSet.size)
    }

    return {
      orgDiversities: [...orgDiversities].sort((a, b) => a - b),
      userCounts:     [...userCounts].sort((a, b) => a - b),
      bridgeRatios:   [...bridgeRatios].sort((a, b) => a - b),
    }
  }

  if (entityType === 'user') {
    const orgSpans = [], langCounts = [], collabExposures = []

    for (const [uid, repoIds] of idx.userToRepos) {
      const orgs = new Set()
      const langs = new Set()
      let exposure = 0 // suma de (tamaño_repo - 1) como proxy de co-contributors
      for (const rid of repoIds) {
        const oid = idx.repoToOrg[rid]
        if (oid) orgs.add(oid)
        const repo = idx.repoNodeMap.get(rid)
        if (repo?.language) langs.add(repo.language)
        const s = idx.repoUserIdSets[rid]
        if (s) exposure += s.size - 1
      }
      orgSpans.push(orgs.size)
      langCounts.push(langs.size)
      collabExposures.push(exposure)
    }

    return {
      orgSpans:         [...orgSpans].sort((a, b) => a - b),
      langCounts:       [...langCounts].sort((a, b) => a - b),
      collabExposures:  [...collabExposures].sort((a, b) => a - b),
    }
  }

  return {}
}

self.onmessage = function (e) {
  const { selectedEntity, universeData, networkMetrics, requestId } = e.data
  if (!selectedEntity) { self.postMessage({ phase: 1, data: null, requestId }); return }

  // Phase 1 - core data + DNA (fast, <50ms)
  const core = computeCoreData(selectedEntity, universeData, networkMetrics)
  self.postMessage({ phase: 1, data: core, requestId })

  // Phase 2 - impact simulations + collab matrix (medium)
  const medium = computeMediumData(selectedEntity, universeData, networkMetrics, core)
  self.postMessage({ phase: 2, data: medium, requestId })

  // Phase 3 - similar entities (heavy - O(N) over all same-type nodes)
  const heavy = computeHeavyData(selectedEntity, universeData, networkMetrics, core)
  self.postMessage({ phase: 3, data: heavy, requestId })
}

// ============================================================================
// BUILD GLOBAL INDICES - O(n) una sola vez, reutilizados en todas partes
// ============================================================================
function buildIndices(universeData) {
  if (!universeData) return { repoToOrg: {}, userToRepos: new Map(), repoUserIdSets: {}, repoNodeMap: new Map(), orgNodeMap: new Map() }

  // repoId → orgId
  const repoToOrg = {}
  for (const [oid, repos] of Object.entries(universeData.orgRepos || {})) {
    for (const r of repos) repoToOrg[r.id] = oid
  }

  // userId → repoId[]
  const userToRepos = new Map()
  // repoId → Set<userId>
  const repoUserIdSets = {}
  for (const [rid, users] of Object.entries(universeData.repoUsers || {})) {
    const idSet = new Set()
    for (const u of users) {
      idSet.add(u.id)
      if (!userToRepos.has(u.id)) userToRepos.set(u.id, [])
      userToRepos.get(u.id).push(rid)
    }
    repoUserIdSets[rid] = idSet
  }

  // repoId → repo node (O(1) lookup)
  const repoNodeMap = new Map()
  for (const r of (universeData.repoNodes || [])) repoNodeMap.set(r.id, r)

  // orgId → org node (O(1) lookup)
  const orgNodeMap = new Map()
  for (const o of (universeData.orgNodes || [])) orgNodeMap.set(o.id, o)

  return { repoToOrg, userToRepos, repoUserIdSets, repoNodeMap, orgNodeMap }
}

function computeCoreData(selectedEntity, universeData, networkMetrics) {
  if (!selectedEntity) return null
  const entityColor = selectedEntity.type === 'org' ? '#00f7ff' : selectedEntity.type === 'repo' ? '#bd00ff' : '#00ff9f'
  const nm = networkMetrics?.node_metrics?.[selectedEntity.id]
  const community = nm ? networkMetrics.communities?.find(c => c.id === nm.community_id) : null
  const centrality = nm?.collab_centrality ?? 0
  const connectivity = nm?.collab_connectivity ?? 0

  // ── Indices globales (O(n) una vez) ──
  const idx = buildIndices(universeData)

  // ── Distribuciones de población para normalización data-driven ──
  const pop = computePopulationStats(selectedEntity.type, universeData, networkMetrics, idx)

  // ORG data
  let orgReposList = [], orgTotalUsers = 0, orgBridgeCount = 0, orgSortedRepos = []
  let orgLangs = [], orgTotalStars = 0, orgAvgStars = 0, orgBridgePct = 0
  let orgTopContributors = [], orgEntangledOrgs = []
  let orgCrossPollination = 0, orgLangBreakdown = []
  let knowledgeFlows = [], keyDependencies = []
  let healthScore = null, healthBreakdown = []

  if (selectedEntity.type === 'org') {
    orgReposList = universeData?.orgRepos[selectedEntity.id] || []
    const orgAllUsers = orgReposList.reduce((acc, r) => {
      (universeData?.repoUsers[r.id] || []).forEach(u => acc.set(u.id, u)); return acc
    }, new Map())
    orgTotalUsers = orgAllUsers.size
    orgBridgeCount = Array.from(orgAllUsers.values()).filter(u => u.isBridge).length
    orgSortedRepos = [...orgReposList].sort((a, b) =>
      (universeData?.repoUsers[b.id] || []).length - (universeData?.repoUsers[a.id] || []).length
    )
    orgLangs = [...new Set(orgReposList.map(r => r.language).filter(Boolean))]
    orgTotalStars = orgReposList.reduce((s, r) => s + (r.stars || 0), 0)
    orgAvgStars = orgReposList.length > 0 ? (orgTotalStars / orgReposList.length).toFixed(1) : 0
    orgBridgePct = orgTotalUsers > 0 ? ((orgBridgeCount / orgTotalUsers) * 100).toFixed(0) : 0

    const orgUserRepoCounts = new Map()
    orgReposList.forEach(r => {
      (universeData?.repoUsers[r.id] || []).forEach(u => {
        orgUserRepoCounts.set(u.id, (orgUserRepoCounts.get(u.id) || 0) + 1)
      })
    })
    orgTopContributors = Array.from(orgAllUsers.values())
      .map(u => ({ ...u, repoCount: orgUserRepoCounts.get(u.id) || 0 }))
      .sort((a, b) => b.repoCount - a.repoCount)

    // Orgs entrelazadas - usando índices globales O(U × repos_per_user)
    if (universeData) {
      const sharedMap = new Map()
      orgAllUsers.forEach((user) => {
        const uRepos = idx.userToRepos.get(user.id) || []
        for (const rid of uRepos) {
          const oid = idx.repoToOrg[rid]
          if (oid && oid !== selectedEntity.id) {
            sharedMap.set(oid, (sharedMap.get(oid) || 0) + 1)
          }
        }
      })
      const selLogin = selectedEntity.login || selectedEntity.name || ''
      orgEntangledOrgs = Array.from(sharedMap.entries())
        .map(([oid, count]) => {
          const org = idx.orgNodeMap.get(oid)
          return org ? { ...org, sharedCount: count } : null
        })
        .filter(o => o && !_areSiblingOrgs(selLogin, o.login || o.name || ''))
        .sort((a, b) => b.sharedCount - a.sharedCount)

      // Cross-pollination: % de contributors que también contribuyen a otras orgs
      // Excluye orgs hermanas (misma entidad organizacional)
      if (orgAllUsers.size > 0) {
        const selLogin2 = selectedEntity.login || selectedEntity.name || ''
        let crossCount = 0
        orgAllUsers.forEach((user) => {
          const uRepos = idx.userToRepos.get(user.id) || []
          for (const rid of uRepos) {
            const oid = idx.repoToOrg[rid]
            if (oid && oid !== selectedEntity.id) {
              const extOrg = idx.orgNodeMap.get(oid)
              const extLogin = extOrg ? (extOrg.login || extOrg.name || '') : ''
              if (!_areSiblingOrgs(selLogin2, extLogin)) { crossCount++; break }
            }
          }
        })
        orgCrossPollination = ((crossCount / orgAllUsers.size) * 100).toFixed(0)
      }
    }

    // Language breakdown con porcentajes
    const langCount = {}
    orgReposList.forEach(r => { if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1 })
    const langTotal = orgReposList.length || 1
    orgLangBreakdown = Object.entries(langCount)
      .map(([lang, count]) => ({ lang, count, pct: ((count / langTotal) * 100).toFixed(0) }))
      .sort((a, b) => b.count - a.count)

    // ─── KNOWLEDGE FLOWS: pares de repos que comparten más contributors ───
    if (orgReposList.length > 1 && universeData) {
      const pairs = []
      for (let i = 0; i < orgReposList.length; i++) {
        for (let j = i + 1; j < orgReposList.length; j++) {
          const a = orgReposList[i], b = orgReposList[j]
          const setA = idx.repoUserIdSets[a.id], setB = idx.repoUserIdSets[b.id]
          if (!setA || !setB) continue
          let shared = 0
          // Iterate smaller set for performance
          const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA]
          smaller.forEach(uid => { if (larger.has(uid)) shared++ })
          if (shared > 0) pairs.push({ repoA: a, repoB: b, shared })
        }
      }
      knowledgeFlows = pairs.sort((a, b) => b.shared - a.shared).slice(0, 6)
    }

    // ─── KEY DEPENDENCIES: usuarios cuya marcha tendría mayor impacto ───
    if (universeData) {
      // Mapa: orgId externo → set de userIds que la conectan
      const extOrgConnectors = new Map()
      orgAllUsers.forEach((user) => {
        const uRepos = idx.userToRepos.get(user.id) || []
        for (const rid of uRepos) {
          const oid = idx.repoToOrg[rid]
          if (oid && oid !== selectedEntity.id) {
            if (!extOrgConnectors.has(oid)) extOrgConnectors.set(oid, new Set())
            extOrgConnectors.get(oid).add(user.id)
          }
        }
      })
      // Criticidad proporcional: repoCount normalizado por repos de la org,
      // soleConnections normalizado por total de conexiones externas.
      const totalExtOrgs = extOrgConnectors.size || 1
      const totalRepos = orgReposList.length || 1
      keyDependencies = Array.from(orgAllUsers.values()).map(user => {
        const repoCount = orgUserRepoCounts.get(user.id) || 0
        let soleConnections = 0
        extOrgConnectors.forEach((connectors) => {
          if (connectors.has(user.id) && connectors.size === 1) soleConnections++
        })
        // Criticidad proporcional: impacto relativo al scope de la org
        const repoPct = repoCount / totalRepos
        const solePct = soleConnections / totalExtOrgs
        const criticality = repoPct * 0.4 + solePct * 0.6 // peso mayor a conexiones únicas
        return { ...user, repoCount, soleConnections, criticality }
      })
      .filter(u => u.criticality > 0)
      .sort((a, b) => b.criticality - a.criticality)
      .slice(0, 5)
    }

    // ─── HEALTH SCORE: 100% data-driven (percentile rank) ───
    // Cada componente = percentile rank de esta org en la distribución de todas las orgs.
    // Score final = media de percentiles (todas las dimensiones pesan igual).
    if (orgReposList.length > 0 && pop.crossPollinations) {
      const diversityScore = percentileRank(pop.crossPollinations, Number(orgCrossPollination)) * 100
      const bridgeNetworkScore = percentileRank(pop.bridgePcts, Number(orgBridgePct)) * 100
      const langVarietyScore = percentileRank(pop.langCounts, orgLangs.length) * 100
      // Distribución de contributors entre repos
      const repoUserCounts = orgReposList.map(r => (universeData?.repoUsers[r.id] || []).length)
      const avgContrib = repoUserCounts.reduce((a, b) => a + b, 0) / (repoUserCounts.length || 1)
      const spreadDev = repoUserCounts.reduce((s, c) => s + Math.abs(c - avgContrib), 0) / (repoUserCounts.length || 1)
      const spreadCoeff = spreadDev / (avgContrib || 1)
      // Para spread, menor coeficiente = mejor distribución → invertir percentil
      const spreadScore = (1 - percentileRank(pop.spreadCoeffs, spreadCoeff)) * 100
      // Resiliencia basada en bus factor promedio
      const repoNMs = orgReposList.map(r => networkMetrics?.node_metrics?.[r.id]).filter(Boolean)
      const avgBF = repoNMs.length > 0
        ? repoNMs.reduce((s, m) => s + (m.bus_factor || 1), 0) / repoNMs.length
        : 1
      const resilienceScore = percentileRank(pop.busFacts, avgBF) * 100
      healthBreakdown = [
        { label: 'Diversidad', value: Math.round(diversityScore), color: '#00ff9f', tip: `Polinización cruzada - percentil ${Math.round(diversityScore)} entre todas las organizaciones. Mayor diversidad = ecosistema más rico.` },
        { label: 'Resiliencia', value: Math.round(resilienceScore), color: '#ff6b6b', tip: `Bus factor promedio - percentil ${Math.round(resilienceScore)}. Más alto = menor riesgo de perder mantenedores clave.` },
        { label: 'Red Bridge', value: Math.round(bridgeNetworkScore), color: '#ffbd00', tip: `Proporción de usuarios puente - percentil ${Math.round(bridgeNetworkScore)}. Más bridges = mejor integración en la red.` },
        { label: 'Tech Stack', value: Math.round(langVarietyScore), color: '#bd00ff', tip: `Variedad de lenguajes - percentil ${Math.round(langVarietyScore)}. Mayor diversidad tecnológica = equipo más versátil.` },
        { label: 'Distribución', value: Math.round(spreadScore), color: '#00b4d8', tip: `Uniformidad de contribuidores - percentil ${Math.round(spreadScore)}. Más uniforme = menos repos abandonados.` },
      ]
      // Media aritmética de percentiles (todas las dimensiones contribuyen por igual)
      healthScore = Math.round((diversityScore + resilienceScore + bridgeNetworkScore + langVarietyScore + spreadScore) / 5)
    }
  }

  // REPO data
  let repoUsers = [], repoBridgeUsers = [], repoNormalUsers = [], repoOwnerOrg = null, repoOrgDiversity = []

  if (selectedEntity.type === 'repo') {
    repoUsers = universeData?.repoUsers[selectedEntity.id] || []
    repoBridgeUsers = repoUsers.filter(u => u.isBridge)
    repoNormalUsers = repoUsers.filter(u => !u.isBridge)
    repoOwnerOrg = idx.orgNodeMap.get(idx.repoToOrg[selectedEntity.id]) || null

    // Diversidad de orgs - usando índices globales O(users × repos_per_user)
    if (universeData) {
      const orgMap = new Map()
      repoUsers.forEach(u => {
        const uRepos = idx.userToRepos.get(u.id) || []
        for (const rid of uRepos) {
          const oid = idx.repoToOrg[rid]
          if (oid) {
            const org = idx.orgNodeMap.get(oid)
            if (org) orgMap.set(oid, org)
          }
        }
      })
      repoOrgDiversity = Array.from(orgMap.values())

      // Key dependencies para repos: usuarios que son único representante de su org
      const repOrgReps = new Map() // orgId → Set<userId> (de este repo)
      repoUsers.forEach(u => {
        const uRepos = idx.userToRepos.get(u.id) || []
        for (const rid of uRepos) {
          const oid = idx.repoToOrg[rid]
          if (oid && oid !== (repoOwnerOrg?.id || '')) {
            if (!repOrgReps.has(oid)) repOrgReps.set(oid, new Set())
            repOrgReps.get(oid).add(u.id)
          }
        }
      })
      const totalExtOrgsRepo = repOrgReps.size || 1
      keyDependencies = repoUsers.map(u => {
        let soleConnections = 0
        repOrgReps.forEach((reps) => {
          if (reps.has(u.id) && reps.size === 1) soleConnections++
        })
        // Criticidad proporcional: bridge flag + fracción de org connections que dependen solo de este usuario
        const bridgeFactor = u.isBridge ? 0.3 : 0
        const solePct = soleConnections / totalExtOrgsRepo
        const criticality = bridgeFactor + solePct * 0.7
        return { ...u, soleConnections, criticality }
      })
      .filter(u => u.criticality > 0)
      .sort((a, b) => b.criticality - a.criticality)
      .slice(0, 5)
    }
  }

  // USER data
  let userRepos = [], userOrgs = [], userLangs = [], userTotalStars = 0, userCoContributors = []
  const expertise = selectedEntity.quantum_expertise_score || 0

  if (selectedEntity.type === 'user' && universeData) {
    // Usando índice userToRepos + repoNodeMap: O(repos_per_user) en vez de O(R²)
    const uRepoIds = idx.userToRepos.get(selectedEntity.id) || []
    userRepos = uRepoIds.map(rid => idx.repoNodeMap.get(rid)).filter(Boolean)

    // Usando índice repoToOrg + orgNodeMap: O(repos_per_user) en vez de O(R×O×R_per_org)
    const userOrgSet = new Map()
    for (const repo of userRepos) {
      const oid = idx.repoToOrg[repo.id]
      if (oid) {
        const org = idx.orgNodeMap.get(oid)
        if (org) userOrgSet.set(oid, org)
      }
    }
    userOrgs = Array.from(userOrgSet.values())
    userLangs = [...new Set(userRepos.map(r => r.language).filter(Boolean))]
    userTotalStars = userRepos.reduce((s, r) => s + (r.stars || 0), 0)

    // Co-contributors - usando repoUserIdSets para lookup O(1)
    const coMap = new Map()
    userRepos.forEach(r => {
      (universeData.repoUsers[r.id] || []).forEach(u => {
        if (u.id !== selectedEntity.id) {
          coMap.set(u.id, { ...u, sharedRepos: (coMap.get(u.id)?.sharedRepos || 0) + 1 })
        }
      })
    })
    userCoContributors = Array.from(coMap.values()).sort((a, b) => b.sharedRepos - a.sharedRepos)
  }

  // ─── COLLABORATION RADAR: perfil de 5 ejes (100% data-driven) ───
  // Cada eje = percentile rank de esta entidad en la distribución de su tipo.
  // Centralidad y Conectividad ya son percentiles del backend.
  // Los demás ejes usan percentileRank contra pop (distribuciones calculadas).
  const radarAxes = []
  if (selectedEntity.type === 'org') {
    const cpPctl = percentileRank(pop.crossPollinations || [], Number(orgCrossPollination))
    const bpPctl = percentileRank(pop.bridgePcts || [], Number(orgBridgePct))
    const infPctl = percentileRank(pop.influences || [], orgTotalUsers * orgReposList.length)
    radarAxes.push(
      { label: 'Centralidad', value: centrality / 100, tip: `Percentil ${Math.round(centrality)} - contributors compartidos con otras orgs (puentes inter-org)` },
      { label: 'Conectividad', value: connectivity / 100, tip: `Percentil ${Math.round(connectivity)} - nº de organizaciones vecinas con las que comparte contributors` },
      { label: 'Diversidad', value: cpPctl, tip: `Percentil ${Math.round(cpPctl * 100)} - polinización cruzada relativa a todas las orgs` },
      { label: 'Puente', value: bpPctl, tip: `Percentil ${Math.round(bpPctl * 100)} - proporción de bridge users vs. población` },
      { label: 'Influencia', value: infPctl, tip: `Percentil ${Math.round(infPctl * 100)} - impacto (contributors × repos) relativo` },
    )
  } else if (selectedEntity.type === 'repo') {
    const divPctl = percentileRank(pop.orgDiversities || [], repoOrgDiversity.length)
    const brPctl = percentileRank(pop.bridgeRatios || [], repoUsers.length > 0 ? repoBridgeUsers.length / repoUsers.length : 0)
    const alcPctl = percentileRank(pop.userCounts || [], repoUsers.length)
    radarAxes.push(
      { label: 'Centralidad', value: centrality / 100, tip: `Percentil ${Math.round(centrality)} - diversidad de orgs representadas entre sus contributors` },
      { label: 'Conectividad', value: connectivity / 100, tip: `Percentil ${Math.round(connectivity)} - nº de contributors directos` },
      { label: 'Diversidad', value: divPctl, tip: `Percentil ${Math.round(divPctl * 100)} - organizaciones distintas que contribuyen` },
      { label: 'Puente', value: brPctl, tip: `Percentil ${Math.round(brPctl * 100)} - ratio de bridge users vs. población` },
      { label: 'Alcance', value: alcPctl, tip: `Percentil ${Math.round(alcPctl * 100)} - contribuidores únicos relativo` },
    )
  } else {
    // Para co-contributors, usar collaboration exposure como proxy eficiente
    let userCollabExposure = 0
    userRepos.forEach(r => {
      const s = idx.repoUserIdSets[r.id]
      if (s) userCollabExposure += s.size - 1
    })
    const osPctl = percentileRank(pop.orgSpans || [], userOrgs.length)
    const cePctl = percentileRank(pop.collabExposures || [], userCollabExposure)
    const vlPctl = percentileRank(pop.langCounts || [], userLangs.length)
    radarAxes.push(
      { label: 'Centralidad', value: centrality / 100, tip: `Percentil ${Math.round(centrality)} - nº de orgs distintas a las que contribuye (alcance inter-org)` },
      { label: 'Conectividad', value: connectivity / 100, tip: `Percentil ${Math.round(connectivity)} - nº de repos a los que contribuye` },
      { label: 'Org Span', value: osPctl, tip: `Percentil ${Math.round(osPctl * 100)} - organizaciones en las que participa vs. población` },
      { label: 'Colaboración', value: cePctl, tip: `Percentil ${Math.round(cePctl * 100)} - exposición colaborativa (repos compartidos)` },
      { label: 'Versatilidad', value: vlPctl, tip: `Percentil ${Math.round(vlPctl * 100)} - diversidad de lenguajes vs. población` },
    )
  }

  // ─── ZONE CLASSIFICATION (from position & Jenks boundaries) ───
  let zoneInfo = null
  const pos = universeData?.positions?.[selectedEntity.id]
  const zm = universeData?.zoneMeta
  if (pos && zm) {
    const dist = Math.sqrt((pos.x || 0) ** 2 + (pos.y || 0) ** 2 + (pos.z || 0) ** 2)
    if (dist <= zm.coreRadius) {
      zoneInfo = { key: 'core', label: 'Zona Core', icon: '⬡', color: '#00ff9f', desc: `Radio ${Math.round(dist)} - Núcleo de alta colaboración` }
    } else if (dist <= zm.peripheryMin) {
      zoneInfo = { key: 'mid', label: 'Zona Intermedia', icon: '⬢', color: '#4488ff', desc: `Radio ${Math.round(dist)} - Actividad moderada` }
    } else {
      zoneInfo = { key: 'isolated', label: 'Zona Periférica', icon: '◯', color: '#aa44ff', desc: `Radio ${Math.round(dist)} - Órbita exterior` }
    }
  }

  // ─── NETWORK ROLE CLASSIFICATION (100% DATA-DRIVEN) ───
  // Aplica Jenks Natural Breaks (k=3) sobre collab_centrality_raw y
  // collab_connectivity_raw por separado, filtrando por tipo de entidad.
  // Resultado: 3 clusters por dimensión (high/mid/low) → matriz 3×3 → rol.
  // CERO umbrales arbitrarios. Las fronteras emergen de la distribución real.
  let networkRole = null
  if (nm) {
    const rawC = nm.collab_centrality_raw ?? 0
    const rawConn = nm.collab_connectivity_raw ?? 0

    // Recoger todos los raw values de entidades activas del mismo tipo
    const typePrefix = selectedEntity.type + '_'
    const allCent = []
    const allConn = []
    const allMetrics = networkMetrics?.node_metrics || {}
    for (const nid in allMetrics) {
      if (!nid.startsWith(typePrefix)) continue
      const nv = allMetrics[nid]
      const c = nv.collab_centrality_raw ?? 0
      const cn = nv.collab_connectivity_raw ?? 0
      if (c > 0 || cn > 0) {
        allCent.push(c)
        allConn.push(cn)
      }
    }

    // Clasificar con Jenks si hay suficientes datos, sino tertiles simples
    let centClass = 'none', connClass = 'none'

    if (rawC === 0 && rawConn === 0) {
      // Sin actividad colaborativa medible
      centClass = 'none'
      connClass = 'none'
    } else if (allCent.length >= 6) {
      const centBreaks = jenksNaturalBreaks(allCent, 3)
      const connBreaks = jenksNaturalBreaks(allConn, 3)
      centClass = rawC >= centBreaks.boundaries[1] ? 'high'
                : rawC >= centBreaks.boundaries[0] ? 'mid' : 'low'
      connClass = rawConn >= connBreaks.boundaries[1] ? 'high'
                : rawConn >= connBreaks.boundaries[0] ? 'mid' : 'low'
    } else {
      // Fallback: tertiles simples para n < 6
      const sortedC = [...allCent].sort((a, b) => a - b)
      const sortedCn = [...allConn].sort((a, b) => a - b)
      const t1c = sortedC[Math.floor(sortedC.length / 3)] || 0
      const t2c = sortedC[Math.floor(2 * sortedC.length / 3)] || 0
      const t1cn = sortedCn[Math.floor(sortedCn.length / 3)] || 0
      const t2cn = sortedCn[Math.floor(2 * sortedCn.length / 3)] || 0
      centClass = rawC >= t2c ? 'high' : rawC >= t1c ? 'mid' : 'low'
      connClass = rawConn >= t2cn ? 'high' : rawConn >= t1cn ? 'mid' : 'low'
    }

    // Matriz de roles: (centClass × connClass) → rol
    // Los nombres son creativos pero las FRONTERAS son 100% data-driven.
    const ROLE_MATRIX = {
      'high_high': { key: 'hub',      label: 'Hub Central',        icon: '⊛', color: '#ffd166', desc: 'Máxima centralidad y conectividad - núcleo de la red' },
      'high_mid':  { key: 'hub_minor', label: 'Hub Colaborativo',   icon: '⊛', color: '#ffd166', desc: 'Alta centralidad con conectividad significativa' },
      'high_low':  { key: 'bridge',   label: 'Puente Estratégico',  icon: '⚡', color: '#ff6b6b', desc: 'Alta centralidad con conexiones selectivas - une clusters' },
      'mid_high':  { key: 'connector', label: 'Conector Denso',     icon: '◉', color: '#00b4d8', desc: 'Red densa de colaboración - muchas conexiones activas' },
      'mid_mid':   { key: 'active',   label: 'Nodo Activo',         icon: '◈', color: '#06d6a0', desc: 'Participación equilibrada en la red de colaboración' },
      'mid_low':   { key: 'focused',  label: 'Nodo Focalizado',     icon: '◈', color: '#06d6a0', desc: 'Centralidad notable con conexiones concentradas' },
      'low_high':  { key: 'social',   label: 'Conector Social',     icon: '◉', color: '#00b4d8', desc: 'Muchas conexiones pero centralidad baja - red local amplia' },
      'low_mid':   { key: 'emerging', label: 'Nodo Emergente',      icon: '◇', color: '#a29bfe', desc: 'Actividad incipiente con conectividad creciente' },
      'low_low':   { key: 'nascent',  label: 'Nodo Incipiente',     icon: '◇', color: '#a29bfe', desc: 'Primeras interacciones en la red de colaboración' },
      'none_none': { key: 'isolated', label: 'Nodo Aislado',        icon: '○', color: '#666',    desc: 'Sin actividad colaborativa medible' },
    }

    const roleKey = `${centClass}_${connClass}`
    networkRole = ROLE_MATRIX[roleKey] || ROLE_MATRIX['none_none']
  }

  // ─── REPO HUB SCORE ───
  const repoHubScore = selectedEntity.type === 'repo' ? repoOrgDiversity.length : 0

  // ─── ANALYSIS SUMMARY TEXT ───
  let analysisText = ''
  const name = selectedEntity.name || selectedEntity.login || selectedEntity.full_name?.split('/')[1] || selectedEntity.id
  if (selectedEntity.type === 'org') {
    const roleLabel = networkRole?.label || 'entidad'
    // Cross-pollination clasificada por percentil en la población
    const cpPctl = percentileRank(pop.crossPollinations || [], Number(orgCrossPollination))
    const crossNote = cpPctl >= 0.75
      ? `Alta cross-pollination (${orgCrossPollination}%, p${Math.round(cpPctl * 100)}): sus contributors participan activamente en otras organizaciones.`
      : cpPctl >= 0.25
      ? `Cross-pollination moderada (${orgCrossPollination}%, p${Math.round(cpPctl * 100)}): cierto intercambio de talento con el ecosistema.`
      : `Baja cross-pollination (${orgCrossPollination}%, p${Math.round(cpPctl * 100)}): ecosistema relativamente cerrado.`
    const bridgeNote = orgBridgeCount > 0 ? ` ${orgBridgeCount} bridge users conectan con ${orgEntangledOrgs.length} org${orgEntangledOrgs.length !== 1 ? 's' : ''} externas.` : ''
    analysisText = `${name} es un ${roleLabel} con ${orgTotalUsers} contributors en ${orgReposList.length} repos. ${crossNote}${bridgeNote}`
  } else if (selectedEntity.type === 'repo') {
    // Hub score clasificado por percentil en la población de repos
    const hubPctl = percentileRank(pop.orgDiversities || [], repoHubScore)
    const hubNote = hubPctl >= 0.75 ? `Hub de colaboración inter-org (p${Math.round(hubPctl * 100)}) con contributors de ${repoHubScore} organizaciones.` : hubPctl >= 0.25 ? `Diversidad moderada (p${Math.round(hubPctl * 100)}): contributors de ${repoHubScore} organizaciones.` : `Diversidad baja (p${Math.round(hubPctl * 100)}): actividad concentrada.`
    const bridgeNote = repoBridgeUsers.length > 0 ? ` ${repoBridgeUsers.length} bridge users (${repoUsers.length > 0 ? ((repoBridgeUsers.length / repoUsers.length) * 100).toFixed(0) : 0}%) amplifican su alcance.` : ''
    analysisText = `${name}: ${repoUsers.length} contributors. ${hubNote}${bridgeNote}`
  } else if (selectedEntity.type === 'user') {
    const spanNote = userOrgs.length > 1 ? `Activo en ${userOrgs.length} organizaciones, alcanzando ${userCoContributors.length} co-contributors.` : `Concentrado en ${userOrgs.length} organización con ${userCoContributors.length} co-contributors.`
    const bridgeNote = selectedEntity.isBridge ? ' Partícula entrelazada: funciona como puente entre organizaciones.' : ''
    analysisText = `${name} contribuye a ${userRepos.length} repos. ${spanNote}${bridgeNote}`
  }

  // ─── COLLABORATION DNA: huella visual generativa (instantáneo, depende solo de radar) ───
  const collabDNA = radarAxes.length >= 3 ? {
    values: radarAxes.map(a => a.value),
    labels: radarAxes.map(a => a.label),
    seed: selectedEntity.id.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0),
    centrality,
    connectivity,
    entityType: selectedEntity.type,
  } : null

  // ─── IMPACT SIMULATION, COLLAB MATRIX, SIMILAR ENTITIES → Phases 2-3 ───

  return {
    entityColor, nm, community, centrality, connectivity,
    orgReposList, orgTotalUsers, orgBridgeCount, orgSortedRepos, orgLangs,
    orgTotalStars, orgAvgStars, orgBridgePct, orgTopContributors, orgEntangledOrgs,
    orgCrossPollination, orgLangBreakdown,
    repoUsers, repoBridgeUsers, repoNormalUsers, repoOwnerOrg, repoOrgDiversity, repoHubScore,
    userRepos, userOrgs, userLangs, userTotalStars, expertise, userCoContributors,
    networkRole, zoneInfo, analysisText, radarAxes, collabDNA,
    knowledgeFlows, keyDependencies, healthScore, healthBreakdown,
    _idx: idx, _pop: pop, // pass indices and population stats to Phases 2-3
  }
}

// ============================================================================
// PHASE 2 - Medium features (impact sims + collab matrix)
// ============================================================================

function computeMediumData(selectedEntity, universeData, networkMetrics, core) {
  const { keyDependencies, healthScore, orgSortedRepos, orgReposList, radarAxes, centrality, connectivity, _idx: idx } = core

  // ─── IMPACT SIMULATION: ¿Qué pasaría si un usuario clave se va? ───
  let impactSimulations = []
  if (keyDependencies.length > 0 && universeData && idx) {
    // Pre-build org repo set for this entity (for org type)
    const orgRepoIdSet = selectedEntity.type === 'org'
      ? new Set((universeData.orgRepos[selectedEntity.id] || []).map(r => r.id))
      : null

    impactSimulations = keyDependencies.slice(0, 3).map(user => {
      let reposAffected = 0, bridgeConnectionsLost = 0, orgConnectionsLost = 0
      const connectedOrgsViaUser = new Set()

      // Use userToRepos index instead of iterating ALL repoUsers
      const uRepos = idx.userToRepos.get(user.id) || []
      for (const rid of uRepos) {
        const oid = idx.repoToOrg[rid]
        if (oid && oid !== selectedEntity.id) connectedOrgsViaUser.add(oid)
        if (selectedEntity.type === 'org') {
          if (orgRepoIdSet.has(rid)) reposAffected++
        } else {
          reposAffected++
        }
      }

      // ¿Cuántas de esas conexiones de org se pierden totalmente?
      // Pre-build other users set (excluding current user)
      let otherUserIds
      if (selectedEntity.type === 'org') {
        otherUserIds = new Set()
        for (const r of (universeData.orgRepos[selectedEntity.id] || [])) {
          const s = idx.repoUserIdSets[r.id]
          if (s) s.forEach(uid => { if (uid !== user.id) otherUserIds.add(uid) })
        }
      } else if (selectedEntity.type === 'repo') {
        otherUserIds = new Set()
        const s = idx.repoUserIdSets[selectedEntity.id]
        if (s) s.forEach(uid => { if (uid !== user.id) otherUserIds.add(uid) })
      } else {
        otherUserIds = new Set()
      }

      connectedOrgsViaUser.forEach(oid => {
        let otherConnects = false
        // Check if any other user has repos in oid
        for (const otherUid of otherUserIds) {
          const otherRepos = idx.userToRepos.get(otherUid) || []
          for (const rid of otherRepos) {
            if (idx.repoToOrg[rid] === oid) { otherConnects = true; break }
          }
          if (otherConnects) break
        }
        if (!otherConnects) orgConnectionsLost++
      })

      bridgeConnectionsLost = connectedOrgsViaUser.size

      // Impacto en health score proporcional al scope
      let healthDelta = 0
      if (healthScore !== null && selectedEntity.type === 'org') {
        // Impacto proporcional: pérdida de org connections + bridge status
        const totalConnectableOrgs = new Set()
        const allOrgUsers = (universeData.orgRepos[selectedEntity.id] || []).reduce((acc, r) => {
          (universeData.repoUsers?.[r.id] || []).forEach(u => acc.set(u.id, u)); return acc
        }, new Map())
        allOrgUsers.forEach(u => {
          const uRepos = idx.userToRepos.get(u.id) || []
          for (const rid of uRepos) {
            const oid = idx.repoToOrg[rid]
            if (oid && oid !== selectedEntity.id) totalConnectableOrgs.add(oid)
          }
        })
        const orgConnPct = totalConnectableOrgs.size > 0 ? orgConnectionsLost / totalConnectableOrgs.size : 0
        const repoPct = orgReposList.length > 0 ? reposAffected / orgReposList.length : 0
        healthDelta = -Math.round(healthScore * (orgConnPct * 0.6 + repoPct * 0.4))
      }

      // Severidad proporcional al scope de la entidad
      const totalReposForSeverity = selectedEntity.type === 'org' ? orgReposList.length : (core.repoUsers?.length || 1)
      const repoImpactRatio = reposAffected / (totalReposForSeverity || 1)
      return {
        user: { id: user.id, login: user.login || user.id, isBridge: user.isBridge },
        reposAffected,
        bridgeConnectionsLost,
        orgConnectionsLost,
        healthDelta,
        severity: orgConnectionsLost > 0 ? 'critical' : repoImpactRatio > 0.3 ? 'high' : 'moderate'
      }
    })
  }

  // ─── COLLABORATION MATRIX: heatmap de colaboración entre repos ───
  let collabMatrix = null
  if (selectedEntity.type === 'org' && orgReposList.length >= 2 && orgReposList.length <= 15 && universeData && idx) {
    const repos = orgSortedRepos.slice(0, 8)
    const matrix = []
    let maxShared = 1
    for (let i = 0; i < repos.length; i++) {
      const row = []
      const setI = idx.repoUserIdSets[repos[i].id]
      for (let j = 0; j < repos.length; j++) {
        if (i === j) { row.push(setI ? setI.size : 0); continue }
        const setJ = idx.repoUserIdSets[repos[j].id]
        if (!setI || !setJ) { row.push(0); continue }
        let shared = 0
        const [smaller, larger] = setI.size <= setJ.size ? [setI, setJ] : [setJ, setI]
        smaller.forEach(uid => { if (larger.has(uid)) shared++ })
        row.push(shared)
        if (shared > maxShared) maxShared = shared
      }
      matrix.push(row)
    }
    collabMatrix = {
      labels: repos.map(r => r.name || r.full_name?.split('/')[1] || r.id),
      repoIds: repos.map(r => r.id),
      matrix,
      maxShared,
    }
  }

  return { impactSimulations, collabMatrix }
}

// ============================================================================
// PHASE 3 - Heavy features (similar entities - O(N) all same-type nodes)
// ============================================================================

function computeHeavyData(selectedEntity, universeData, networkMetrics, core) {
  const { radarAxes, centrality, connectivity, _idx: idx, _pop: pop } = core

  // ─── SIMILAR ENTITIES: buscar entidades con perfil radar parecido ───
  // Usa el MISMO percentileRank que el radar del entity seleccionado,
  // garantizando consistencia en la comparación euclídea.
  let similarEntities = []
  if (radarAxes.length >= 3 && universeData && networkMetrics?.node_metrics && idx && pop) {
    const myVector = radarAxes.map(a => a.value)
    const candidates = []

    const computeRadar = (entity) => {
      const enm = networkMetrics.node_metrics[entity.id]
      if (!enm) return null
      const ec = enm.collab_centrality ?? 0
      const econn = enm.collab_connectivity ?? 0

      if (entity.type === 'org' && selectedEntity.type === 'org') {
        const eRepos = universeData.orgRepos[entity.id] || []
        const eAllUsers = eRepos.reduce((acc, r) => {
          (universeData.repoUsers[r.id] || []).forEach(u => acc.set(u.id, u)); return acc
        }, new Map())
        const eTotal = eAllUsers.size
        const eBridge = Array.from(eAllUsers.values()).filter(u => u.isBridge).length
        const eBridgePct = eTotal > 0 ? (eBridge / eTotal) * 100 : 0
        let crossCount = 0
        eAllUsers.forEach(user => {
          const uRepos = idx.userToRepos.get(user.id) || []
          for (const rid of uRepos) {
            const oid = idx.repoToOrg[rid]
            if (oid && oid !== entity.id) { crossCount++; break }
          }
        })
        const eCross = eTotal > 0 ? (crossCount / eTotal) * 100 : 0
        return [
          ec / 100, econn / 100,
          percentileRank(pop.crossPollinations || [], eCross),
          percentileRank(pop.bridgePcts || [], eBridgePct),
          percentileRank(pop.influences || [], eTotal * eRepos.length)
        ]
      } else if (entity.type === 'repo' && selectedEntity.type === 'repo') {
        const eUsers = universeData.repoUsers[entity.id] || []
        const eBridges = eUsers.filter(u => u.isBridge)
        const orgSet = new Set()
        eUsers.forEach(u => {
          const uRepos = idx.userToRepos.get(u.id) || []
          for (const rid of uRepos) {
            const oid = idx.repoToOrg[rid]
            if (oid) orgSet.add(oid)
          }
        })
        return [
          ec / 100, econn / 100,
          percentileRank(pop.orgDiversities || [], orgSet.size),
          percentileRank(pop.bridgeRatios || [], eUsers.length > 0 ? eBridges.length / eUsers.length : 0),
          percentileRank(pop.userCounts || [], eUsers.length)
        ]
      } else if (entity.type === 'user' && selectedEntity.type === 'user') {
        const eRepoIds = idx.userToRepos.get(entity.id) || []
        const eRepos = eRepoIds.map(rid => idx.repoNodeMap.get(rid)).filter(Boolean)
        const eOrgs = new Set()
        let eExposure = 0
        for (const repo of eRepos) {
          const oid = idx.repoToOrg[repo.id]
          if (oid) eOrgs.add(oid)
          const s = idx.repoUserIdSets[repo.id]
          if (s) eExposure += s.size - 1
        }
        const eLangs = new Set(eRepos.map(r => r.language).filter(Boolean))
        return [
          ec / 100, econn / 100,
          percentileRank(pop.orgSpans || [], eOrgs.size),
          percentileRank(pop.collabExposures || [], eExposure),
          percentileRank(pop.langCounts || [], eLangs.size)
        ]
      }
      return null
    }

    // Deduplicar usuarios una sola vez
    const allEntities = selectedEntity.type === 'org'
      ? (universeData.orgNodes || [])
      : selectedEntity.type === 'repo'
      ? (universeData.repoNodes || [])
      : Array.from(idx.userToRepos.keys()).map(uid => {
          // Find user object from any repo - O(1) per user
          for (const rid of (idx.userToRepos.get(uid) || [])) {
            const users = universeData.repoUsers[rid]
            if (users) { const u = users.find(u => u.id === uid); if (u) return { ...u, type: 'user' } }
          }
          return null
        }).filter(Boolean)

    for (const entity of allEntities) {
      if (entity.id === selectedEntity.id) continue
      const vec = computeRadar(entity)
      if (!vec) continue
      let dist = 0
      for (let i = 0; i < myVector.length && i < vec.length; i++) {
        dist += (myVector[i] - vec[i]) ** 2
      }
      dist = Math.sqrt(dist)
      const similarity = Math.max(0, Math.round((1 - dist / Math.sqrt(myVector.length)) * 100))
      candidates.push({ entity: { id: entity.id, name: entity.name || entity.login || entity.full_name?.split('/')[1] || entity.id, type: entity.type || selectedEntity.type }, similarity, radarValues: vec })
    }
    similarEntities = candidates.sort((a, b) => b.similarity - a.similarity).slice(0, 5)
  }

  return { similarEntities }
}
