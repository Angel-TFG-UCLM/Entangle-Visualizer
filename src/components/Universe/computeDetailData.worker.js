/**
 * Web Worker — Compute Detail Data del panel de entidad
 * =====================================================
 * Carga progresiva en 3 fases:
 *   Phase 1: datos básicos, radar, health, análisis, DNA (instantáneo)
 *   Phase 2: simulaciones de impacto, matriz de colaboración (medio)
 *   Phase 3: entidades similares (pesado — itera todos los nodos del tipo)
 */

self.onmessage = function (e) {
  const { selectedEntity, universeData, networkMetrics } = e.data
  if (!selectedEntity) { self.postMessage({ phase: 1, data: null }); return }

  // Phase 1 — core data + DNA (fast, <50ms)
  const core = computeCoreData(selectedEntity, universeData, networkMetrics)
  self.postMessage({ phase: 1, data: core })

  // Phase 2 — impact simulations + collab matrix (medium)
  const medium = computeMediumData(selectedEntity, universeData, networkMetrics, core)
  self.postMessage({ phase: 2, data: medium })

  // Phase 3 — similar entities (heavy — O(N) over all same-type nodes)
  const heavy = computeHeavyData(selectedEntity, universeData, networkMetrics, core)
  self.postMessage({ phase: 3, data: heavy })
}

// ============================================================================
// BUILD GLOBAL INDICES — O(n) una sola vez, reutilizados en todas partes
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

    // Orgs entrelazadas — usando índices globales O(U × repos_per_user)
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
      orgEntangledOrgs = Array.from(sharedMap.entries())
        .map(([oid, count]) => {
          const org = idx.orgNodeMap.get(oid)
          return org ? { ...org, sharedCount: count } : null
        })
        .filter(Boolean)
        .sort((a, b) => b.sharedCount - a.sharedCount)

      // Cross-pollination: % de contributors que también contribuyen a otras orgs
      if (orgAllUsers.size > 0) {
        let crossCount = 0
        orgAllUsers.forEach((user) => {
          const uRepos = idx.userToRepos.get(user.id) || []
          for (const rid of uRepos) {
            const oid = idx.repoToOrg[rid]
            if (oid && oid !== selectedEntity.id) { crossCount++; break }
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
      keyDependencies = Array.from(orgAllUsers.values()).map(user => {
        const repoCount = orgUserRepoCounts.get(user.id) || 0
        let soleConnections = 0
        extOrgConnectors.forEach((connectors) => {
          if (connectors.has(user.id) && connectors.size === 1) soleConnections++
        })
        const criticality = repoCount * 2 + soleConnections * 10
        return { ...user, repoCount, soleConnections, criticality }
      })
      .filter(u => u.criticality > 2)
      .sort((a, b) => b.criticality - a.criticality)
      .slice(0, 5)
    }

    // ─── HEALTH SCORE: puntuación de salud colaborativa ───
    if (orgReposList.length > 0) {
      const diversityScore = Math.min(Number(orgCrossPollination) * 1.5, 100)
      const bridgeNetworkScore = Math.min(Number(orgBridgePct) * 2, 100)
      const langVarietyScore = Math.min((orgLangs.length / 5) * 100, 100)
      // Distribución de contributors entre repos
      const repoUserCounts = orgReposList.map(r => (universeData?.repoUsers[r.id] || []).length)
      const avgContrib = repoUserCounts.reduce((a, b) => a + b, 0) / (repoUserCounts.length || 1)
      const spreadDev = repoUserCounts.reduce((s, c) => s + Math.abs(c - avgContrib), 0) / (repoUserCounts.length || 1)
      const spreadScore = Math.max(0, 100 - (spreadDev / (avgContrib || 1)) * 50)
      // Resiliencia basada en bus factor promedio
      const repoNMs = orgReposList.map(r => networkMetrics?.node_metrics?.[r.id]).filter(Boolean)
      const avgBF = repoNMs.length > 0
        ? repoNMs.reduce((s, m) => s + (m.bus_factor || 1), 0) / repoNMs.length
        : 1
      const resilienceScore = Math.min(avgBF * 25, 100)
      healthBreakdown = [
        { label: 'Diversidad', value: Math.round(diversityScore), color: '#00ff9f', tip: 'Polinización cruzada: cuántos usuarios se comparten con otras organizaciones. Mayor diversidad = ecosistema más rico.' },
        { label: 'Resiliencia', value: Math.round(resilienceScore), color: '#ff6b6b', tip: 'Bus factor promedio: cuántas personas necesitan irse para que un repo quede sin mantenedores. Más alto = menos riesgo.' },
        { label: 'Red Bridge', value: Math.round(bridgeNetworkScore), color: '#ffbd00', tip: 'Proporción de usuarios puente que conectan esta org con otras. Más bridges = mejor integración en la red.' },
        { label: 'Tech Stack', value: Math.round(langVarietyScore), color: '#bd00ff', tip: 'Variedad de lenguajes de programación usados. Mayor diversidad tecnológica = equipo más versátil.' },
        { label: 'Distribución', value: Math.round(spreadScore), color: '#00b4d8', tip: 'Uniformidad en la distribución de contribuidores entre repos. Más uniforme = menos repos abandonados.' },
      ]
      healthScore = Math.round(
        diversityScore * 0.25 + resilienceScore * 0.25 + bridgeNetworkScore * 0.2 +
        langVarietyScore * 0.15 + spreadScore * 0.15
      )
    }
  }

  // REPO data
  let repoUsers = [], repoBridgeUsers = [], repoNormalUsers = [], repoOwnerOrg = null, repoOrgDiversity = []

  if (selectedEntity.type === 'repo') {
    repoUsers = universeData?.repoUsers[selectedEntity.id] || []
    repoBridgeUsers = repoUsers.filter(u => u.isBridge)
    repoNormalUsers = repoUsers.filter(u => !u.isBridge)
    repoOwnerOrg = idx.orgNodeMap.get(idx.repoToOrg[selectedEntity.id]) || null

    // Diversidad de orgs — usando índices globales O(users × repos_per_user)
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
      keyDependencies = repoUsers.map(u => {
        let soleConnections = 0
        repOrgReps.forEach((reps) => {
          if (reps.has(u.id) && reps.size === 1) soleConnections++
        })
        const criticality = (u.isBridge ? 5 : 0) + soleConnections * 10
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

    // Co-contributors — usando repoUserIdSets para lookup O(1)
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

  // ─── COLLABORATION RADAR: perfil de 5 ejes ───
  // Escala logarítmica para evitar saturación trivial: logScale(value, max)
  // Da resolución en valores bajos, comprime valores altos sin saturar al 100% fácilmente
  const logScale = (val, max) => Math.min(Math.log(1 + val) / Math.log(1 + max), 1)

  const radarAxes = []
  if (selectedEntity.type === 'org') {
    radarAxes.push(
      { label: 'Centralidad', value: centrality / 100, tip: 'Importancia de esta organización en toda la red de colaboración' },
      { label: 'Conectividad', value: connectivity / 100, tip: 'Cantidad y fuerza de conexiones con otras entidades' },
      { label: 'Diversidad', value: Math.min(Number(orgCrossPollination) / 100, 1), tip: 'Polinización cruzada: usuarios compartidos con otras orgs' },
      { label: 'Puente', value: logScale(Number(orgBridgePct), 80), tip: 'Porcentaje de usuarios puente que conectan múltiples organizaciones' },
      { label: 'Influencia', value: logScale(orgTotalUsers * orgReposList.length, 2000), tip: 'Impacto basado en la cantidad de contribuidores y repositorios' },
    )
  } else if (selectedEntity.type === 'repo') {
    radarAxes.push(
      { label: 'Centralidad', value: centrality / 100, tip: 'Importancia de este repositorio en la red de colaboración' },
      { label: 'Conectividad', value: connectivity / 100, tip: 'Fuerza de las conexiones con otros repositorios y usuarios' },
      { label: 'Diversidad', value: logScale(repoOrgDiversity.length, 500), tip: 'Cantidad de organizaciones distintas cuyos miembros contribuyen' },
      { label: 'Puente', value: repoUsers.length > 0 ? repoBridgeUsers.length / repoUsers.length : 0, tip: 'Proporción de contribuidores que conectan múltiples organizaciones' },
      { label: 'Alcance', value: logScale(repoUsers.length, 80), tip: 'Número total de contribuidores únicos' },
    )
  } else {
    radarAxes.push(
      { label: 'Centralidad', value: centrality / 100, tip: 'Importancia de este usuario en la red de colaboración' },
      { label: 'Conectividad', value: connectivity / 100, tip: 'Fuerza de conexiones con otros colaboradores' },
      { label: 'Org Span', value: logScale(userOrgs.length, 15), tip: 'Número de organizaciones en las que participa' },
      { label: 'Colaboración', value: logScale(userCoContributors.length, 20000), tip: 'Cantidad de co-contribuidores con los que trabaja' },
      { label: 'Versatilidad', value: logScale(userLangs.length, 12), tip: 'Diversidad de lenguajes de programación utilizados' },
    )
  }

  // ─── NETWORK ROLE CLASSIFICATION ───
  let networkRole = null
  if (nm) {
    const highC = centrality > 50, highConn = connectivity > 50
    if (highC && highConn) networkRole = { key: 'hub', label: 'Hub Central', icon: '⊛', color: '#ffd166', desc: 'Altamente conectado y central — núcleo de colaboración' }
    else if (highC && !highConn) networkRole = { key: 'bridge', label: 'Puente Estratégico', icon: '⚡', color: '#ff6b6b', desc: 'Pocas conexiones pero muy estratégicas — une clusters' }
    else if (!highC && highConn) networkRole = { key: 'local', label: 'Conector Local', icon: '◉', color: '#00b4d8', desc: 'Bien conectado en su zona pero no central globalmente' }
    else networkRole = { key: 'peripheral', label: 'Periférico', icon: '·', color: '#a29bfe', desc: 'En la periferia de la red — potencial de integración' }
  }

  // ─── REPO HUB SCORE ───
  const repoHubScore = selectedEntity.type === 'repo' ? repoOrgDiversity.length : 0

  // ─── ANALYSIS SUMMARY TEXT ───
  let analysisText = ''
  const name = selectedEntity.name || selectedEntity.login || selectedEntity.full_name?.split('/')[1] || selectedEntity.id
  if (selectedEntity.type === 'org') {
    const roleLabel = networkRole?.label || 'entidad'
    const crossNote = orgCrossPollination > 50
      ? `Alta cross-pollination (${orgCrossPollination}%): sus contributors participan activamente en otras organizaciones.`
      : orgCrossPollination > 20
      ? `Cross-pollination moderada (${orgCrossPollination}%): cierto intercambio de talento con el ecosistema.`
      : `Baja cross-pollination (${orgCrossPollination}%): ecosistema relativamente cerrado.`
    const bridgeNote = orgBridgeCount > 0 ? ` ${orgBridgeCount} bridge users conectan con ${orgEntangledOrgs.length} org${orgEntangledOrgs.length !== 1 ? 's' : ''} externas.` : ''
    analysisText = `${name} es un ${roleLabel} con ${orgTotalUsers} contributors en ${orgReposList.length} repos. ${crossNote}${bridgeNote}`
  } else if (selectedEntity.type === 'repo') {
    const hubNote = repoHubScore > 2 ? `Hub de colaboración inter-org con contributors de ${repoHubScore} organizaciones.` : repoHubScore === 2 ? `Atrae contributors de 2 organizaciones.` : 'Actividad concentrada en una organización.'
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
    networkRole, analysisText, radarAxes, collabDNA,
    knowledgeFlows, keyDependencies, healthScore, healthBreakdown,
    _idx: idx, // pass indices to Phases 2-3 to avoid rebuilding
  }
}

// ============================================================================
// PHASE 2 — Medium features (impact sims + collab matrix)
// ============================================================================

function computeMediumData(selectedEntity, universeData, networkMetrics, core) {
  const { keyDependencies, healthScore, orgSortedRepos, orgReposList, radarAxes, centrality, connectivity, _idx: idx } = core
  const logScale = (val, max) => Math.min(Math.log(1 + val) / Math.log(1 + max), 1)

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

      // Impacto en health score (solo orgs)
      let healthDelta = 0
      if (healthScore !== null && selectedEntity.type === 'org') {
        const factor = user.isBridge ? 8 : 3
        healthDelta = -Math.min(factor + orgConnectionsLost * 5, healthScore)
      }

      return {
        user: { id: user.id, login: user.login || user.id, isBridge: user.isBridge },
        reposAffected,
        bridgeConnectionsLost,
        orgConnectionsLost,
        healthDelta,
        severity: orgConnectionsLost > 0 ? 'critical' : reposAffected > 2 ? 'high' : 'moderate'
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
// PHASE 3 — Heavy features (similar entities — O(N) all same-type nodes)
// ============================================================================

function computeHeavyData(selectedEntity, universeData, networkMetrics, core) {
  const { radarAxes, centrality, connectivity, _idx: idx } = core
  const logScale = (val, max) => Math.min(Math.log(1 + val) / Math.log(1 + max), 1)

  // ─── SIMILAR ENTITIES: buscar entidades con perfil radar parecido ───
  let similarEntities = []
  if (radarAxes.length >= 3 && universeData && networkMetrics?.node_metrics && idx) {
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
        return [ec / 100, econn / 100, Math.min(eCross / 100, 1), logScale(eBridgePct, 80), logScale(eTotal * eRepos.length, 2000)]
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
        return [ec / 100, econn / 100, logScale(orgSet.size, 500), eUsers.length > 0 ? eBridges.length / eUsers.length : 0, logScale(eUsers.length, 80)]
      } else if (entity.type === 'user' && selectedEntity.type === 'user') {
        // O(repos_per_user) en vez de O(R × U_per_repo)
        const eRepoIds = idx.userToRepos.get(entity.id) || []
        const eRepos = eRepoIds.map(rid => idx.repoNodeMap.get(rid)).filter(Boolean)
        const eOrgs = new Set()
        for (const repo of eRepos) {
          const oid = idx.repoToOrg[repo.id]
          if (oid) eOrgs.add(oid)
        }
        const eLangs = new Set(eRepos.map(r => r.language).filter(Boolean))
        const counted = new Set()
        let eCoCount = 0
        for (const r of eRepos) {
          const s = idx.repoUserIdSets[r.id]
          if (s) s.forEach(uid => {
            if (uid !== entity.id && !counted.has(uid)) { counted.add(uid); eCoCount++ }
          })
        }
        return [ec / 100, econn / 100, logScale(eOrgs.size, 15), logScale(eCoCount, 20000), logScale(eLangs.size, 12)]
      }
      return null
    }

    // Deduplicar usuarios una sola vez
    const allEntities = selectedEntity.type === 'org'
      ? (universeData.orgNodes || [])
      : selectedEntity.type === 'repo'
      ? (universeData.repoNodes || [])
      : Array.from(idx.userToRepos.keys()).map(uid => {
          // Find user object from any repo — O(1) per user
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
