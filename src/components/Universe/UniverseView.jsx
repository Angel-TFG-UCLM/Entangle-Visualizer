/**
 * ENTANGLE Quantum Field - Visualización 3D Cuántica
 * ====================================================
 *
 * Metáfora cuántica coherente con el proyecto ENTANGLE:
 *
 *   ◈ Organizaciones  = Procesadores Cuánticos  (toros de energía rotando)
 *   ◈ Repositorios    = Qubits                  (esferas + nubes de probabilidad)
 *   ◈ Usuarios        = Partículas Cuánticas    (orbitales alrededor de qubits)
 *   ◈ Bridge Users    = Partículas Entrelazadas  (dorado, pulso sincronizado)
 *   ◈ Conexiones      = Canales de Entrelazamiento (ondas sinusoidales)
 *   ◈ Fondo           = Vacío Cuántico           (lattice + fluctuaciones)
 *   ◈ Interacción     = Colapso de función de onda
 *
 * Stack: Three.js + React Three Fiber + drei + postprocessing (Bloom)
 */

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useDashboardStore, computeTemporalVisibility } from '../../store/dashboardStore'
import useFavoritesStore from '../../store/favoritesStore'
import { FiX, FiUsers, FiGitBranch, FiGrid, FiZap, FiUser, FiMaximize2, FiMinimize2, FiHelpCircle, FiChevronDown, FiChevronLeft, FiEye, FiEyeOff, FiSearch, FiTarget, FiActivity, FiLayers, FiShield, FiCrosshair, FiLoader, FiSettings, FiShare2, FiStar, FiCode, FiGlobe, FiExternalLink, FiHash, FiPercent, FiArrowRight, FiBarChart2, FiBookmark, FiTrendingUp, FiTrendingDown, FiAward, FiHeart, FiAlertTriangle, FiLink, FiCalendar, FiPlay } from 'react-icons/fi'
import BlackHoleExit from './BlackHoleExit'
import BigBangEntry from './BigBangEntry'
import styles from './UniverseView.module.css'

// ============================================================================
// CONSTANTES
// ============================================================================

const REPO_MIN_ORBIT = 18 // órbita mínima qubit→procesador
const REPO_MAX_ORBIT = 55 // órbita máxima qubit→procesador
const USER_MIN_ORBIT = 4  // órbita mínima partícula→qubit
const USER_MAX_ORBIT = 10 // órbita máxima partícula→qubit

// Generador pseudo-aleatorio con semilla (para reproducibilidad visual)
function seededRandom(seed) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646 }
}

// Algoritmo de Jenks Natural Breaks (Fisher-Jenks)
// Clasifica datos 1D en k grupos minimizando la varianza intra-grupo.
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
  return { boundaries, classStarts, sorted }
}

// ============================================================================
// LAYOUT: distribución basada en colaboración real
// ============================================================================
// Las organizaciones más colaborativas (con más contributors compartidos
// entre ellas) se colocan en el centro del universo. Las aisladas van a la
// periferia. Orgs que comparten muchos users se colocan cerca entre sí.
// El radio de repos se escala por cantidad → evita "soles" de densidad.
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

  // Mapa repo → org (para saber a qué org pertenece cada repo)
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

  // ================================================================
  // FASE 1: Construir grafo de colaboración inter-org
  // ================================================================
  // Para cada user, encontrar las orgs a las que contribuye
  const userOrgs = {} // user_id → Set<org_id>
  graph.links.forEach(link => {
    if (link.type === 'contributed_to') {
      const org = repoOwner[link.target]
      if (org) {
        if (!userOrgs[link.source]) userOrgs[link.source] = new Set()
        userOrgs[link.source].add(org)
      }
    }
  })

  // Contar pares de orgs que comparten contributors
  const orgCollabMap = new Map() // "orgA|orgB" → count
  const orgNeighbors = {} // org_id → Map<other_org_id, sharedCount>
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

  // ================================================================
  // FASE 2: Score de centralidad por org
  // ================================================================
  // Usar collab_centrality_raw (suma de contributors compartidos) del backend,
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
    // Fallback: calcular localmente desde el grafo
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

  // Debug: verificar distribución de zonas
  if (sortedByScore.length > 0) {
    console.log(`[Layout] Modo: ${useBackendMetrics ? 'BACKEND collab_centrality_raw' : 'LOCAL orgScore'}`)
    console.log(`[Layout] Top 10 orgs:`, sortedByScore.slice(0, 10).map(o => `${o.id}=${orgScore[o.id]}`))
    console.log(`[Layout] Bottom 5 orgs:`, sortedByScore.slice(-5).map(o => `${o.id}=${orgScore[o.id]}`))
  }

  // ================================================================
  // FASE 3: Posicionar orgs - MAPEO CONTINUO LOGARÍTMICO
  // ================================================================
  // Cada org recibe un radio proporcional a log(score).
  // Score alto → radio pequeño (centro), score bajo → radio grande (periferia).
  // Las zonas visuales (core/mid/isolated) se derivan de la posición final.
  const repoCount = repoNodes.length
  const scaleFactor = repoCount > 200 ? Math.sqrt(repoCount / 200) : 1
  const positions = {}
  const rng = seededRandom(42)

  // PERIPHERY_MAX: parametro de escala visual (tamano del universo). No define zonas.
  const PERIPHERY_MAX = 900 * scaleFactor

  const orgPositions = []
  const MIN_SEP = 55 * scaleFactor

  const nonZeroOrgs = sortedByScore.filter(o => orgScore[o.id] > 0)
  const maxScore = nonZeroOrgs.length > 0 ? orgScore[nonZeroOrgs[0].id] : 1

  // Pre-computar targetR para todas las orgs con colaboracion
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

  // Jenks Natural Breaks: fronteras derivadas de la distribucion real
  let CORE_BOUNDARY, MID_BOUNDARY
  if (allTargetRadii.length >= 6) {
    const { boundaries, classStarts } = jenksNaturalBreaks(allTargetRadii, 3)
    CORE_BOUNDARY = boundaries[0]
    MID_BOUNDARY = boundaries[1]
    const c1 = classStarts[1]
    const c2 = classStarts[2] - classStarts[1]
    const c3 = allTargetRadii.length - classStarts[2]
    console.log(`[Layout] Jenks Natural Breaks -> core<${CORE_BOUNDARY.toFixed(0)} (${c1} orgs), mid<${MID_BOUNDARY.toFixed(0)} (${c2} orgs), peripheral (${c3} orgs)`)
  } else {
    CORE_BOUNDARY = PERIPHERY_MAX * 0.25
    MID_BOUNDARY = PERIPHERY_MAX * 0.6
    console.log(`[Layout] Fallback (n<6): core<${CORE_BOUNDARY.toFixed(0)}, mid<${MID_BOUNDARY.toFixed(0)}`)
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
        attractCenter = new THREE.Vector3(wx / wTotal, wy / wTotal, wz / wTotal)
      }
    }

    let best = null
    let bestScore = -Infinity

    for (let attempt = 0; attempt < 80; attempt++) {
      const r = rMin + rng() * (rMax - rMin)
      const θ = rng() * Math.PI * 2
      const ψ = 0.3 + rng() * 2.2
      const yBias = (rng() - 0.45) * r * 0.5

      const candidate = new THREE.Vector3(
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
      best = new THREE.Vector3(r * Math.cos(θ), (rng() - 0.5) * r * 0.4, r * Math.sin(θ))
    }

    positions[org.id] = best
    orgPositions.push(best)
  }

  // Org #1 (mayor score): centro absoluto
  if (sortedByScore.length > 0 && orgScore[sortedByScore[0].id] > 0) {
    positions[sortedByScore[0].id] = new THREE.Vector3(0, 0, 0)
    orgPositions.push(positions[sortedByScore[0].id])
  }

  // Resto: usar targetR pre-computado
  const startIdx = (sortedByScore.length > 0 && orgScore[sortedByScore[0].id] > 0) ? 1 : 0
  for (let i = startIdx; i < sortedByScore.length; i++) {
    const org = sortedByScore[i]
    const score = orgScore[org.id]

    if (score > 0) {
      const targetR = orgTargetR[org.id]
      const band = Math.max(MIN_SEP, targetR * 0.15)
      placeOrg(org, Math.max(0, targetR - band), targetR + band)
    } else {
      placeOrg(org, MID_BOUNDARY, PERIPHERY_MAX)
    }
  }

  // Derivar zonas desde posiciones reales (para metadatos visuales)
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

  console.log(`[Layout] Distribución continua: core=${coreOrgs.length}, mid=${midOrgs.length}, isolated=${isolatedOrgs.length}`)
  console.log(`[Layout] Score: max=${maxScore}, nonZero=${nonZeroOrgs.length}/${sortedByScore.length}`)

  // ================================================================
  // FASE 4: Repos - órbita escalada por cantidad de repos
  // ================================================================
  const assignedRepos = new Set()
  const baseRepoMin = REPO_MIN_ORBIT * Math.max(1, scaleFactor * 0.7)
  const baseRepoMax = REPO_MAX_ORBIT * Math.max(1, scaleFactor * 0.7)

  Object.entries(orgRepos).forEach(([orgId, repos]) => {
    const c = positions[orgId]; if (!c) return
    const numRepos = repos.length

    // Escalar órbita solo por número de repos
    const repoSpread = Math.max(1, Math.pow(numRepos / 4, 0.75))
    const rMin = baseRepoMin * repoSpread
    const rMax = baseRepoMax * repoSpread

    repos.forEach((repo, i) => {
      const baseAngle = (i / numRepos) * Math.PI * 2
      const angleJitter = (rng() - 0.5) * (Math.PI * 2 / Math.max(numRepos, 3)) * 0.8
      const a = baseAngle + angleJitter
      const orbitR = rMin + rng() * (rMax - rMin)
      const tilt = (rng() - 0.5) * Math.PI * 0.4

      positions[repo.id] = new THREE.Vector3(
        c.x + orbitR * Math.cos(a) * Math.cos(tilt),
        c.y + orbitR * Math.sin(tilt) + (rng() - 0.5) * 12,
        c.z + orbitR * Math.sin(a) * Math.cos(tilt)
      )
      assignedRepos.add(repo.id)
    })
  })

  // Repos huérfanos (sin org) - dispersados en zona media-exterior
  const orphanRepos = repoNodes.filter(r => !assignedRepos.has(r.id))
  orphanRepos.forEach((repo, i) => {
    const a = (i / Math.max(orphanRepos.length, 1)) * Math.PI * 2 + rng() * 0.5
    const r2 = MID_BOUNDARY * 0.5 + rng() * MID_BOUNDARY * 0.4
    const yOff = (rng() - 0.5) * MID_BOUNDARY * 0.25
    positions[repo.id] = new THREE.Vector3(
      r2 * Math.cos(a) + (rng() - 0.5) * 30,
      yOff,
      r2 * Math.sin(a) + (rng() - 0.5) * 30
    )
  })

  // ================================================================
  // FASE 5: Users - bridge al centroide, non-bridge en órbita
  // ================================================================
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

    // Para TODOS los users: colocar cerca de su primer repo
    const rp = repoPositions[0]
    // Escalar órbita agresivamente para repos muy densos (evitar soles)
    const repoId = linkedRepos[0]
    const repoUserCount = repoId && repoUsers[repoId] ? repoUsers[repoId].length : 1
    // log2 base + sqrt para repos muy densos: 841 users → ~15x, 10 → ~2.7x, 1 → 1x
    const densityScale = repoUserCount > 50
      ? 1 + Math.sqrt(repoUserCount) * 0.5
      : 1 + Math.log2(Math.max(repoUserCount, 1)) * 0.5
    const uR = (USER_MIN_ORBIT + rng() * (USER_MAX_ORBIT - USER_MIN_ORBIT)) * densityScale
    const θ = rng() * Math.PI * 2
    const φ = Math.acos(2 * rng() - 1)
    positions[user.id] = new THREE.Vector3(
      rp.x + uR * Math.sin(φ) * Math.cos(θ),
      rp.y + uR * Math.cos(φ),
      rp.z + uR * Math.sin(φ) * Math.sin(θ)
    )
    assignedUsers.add(user.id)
  })

  // Users sin repos - zona exterior
  userNodes.filter(u => !assignedUsers.has(u.id)).forEach((user, i) => {
    const a = rng() * Math.PI * 2
    const r2 = MID_BOUNDARY * 0.5 + rng() * MID_BOUNDARY * 0.3
    positions[user.id] = new THREE.Vector3(
      r2 * Math.cos(a) + (rng() - 0.5) * 50,
      (rng() - 0.5) * MID_BOUNDARY * 0.25,
      r2 * Math.sin(a) + (rng() - 0.5) * 50
    )
  })

  const connections = graph.links
    .filter(l => positions[l.source] && positions[l.target])
    .map(l => ({ ...l, start: positions[l.source], end: positions[l.target] }))

  // Precomputar max para normalización de orgs
  const maxOrgScore = Math.max(...Object.values(orgScore), 1)
  const maxOrgNeighbors = Object.values(orgNeighbors).reduce((mx, m) => Math.max(mx, m.size), 1)

  // Pre-calcular densidad por user (inverso de cuántos users tiene su repo principal)
  // Valor 0-1 donde 1 = repo con pocos users, ~0.15 = repo con 841+ users
  const userDensity = {}
  userNodes.forEach(user => {
    const repos = userRepoLinks[user.id] || []
    if (repos.length === 0) { userDensity[user.id] = 1; return }
    const rid = repos[0]
    const count = rid && repoUsers[rid] ? repoUsers[rid].length : 1
    // 1 user → 1.0, 10 → 0.56, 50 → 0.38, 100 → 0.32, 841 → 0.19
    userDensity[user.id] = Math.max(0.15, 1.0 / Math.pow(count, 0.3))
  })

  return { orgNodes, repoNodes, userNodes, orgRepos, repoUsers, positions, connections, orgScore, orgNeighbors, maxOrgScore, maxOrgNeighbors, userDensity }
}

// ============================================================================
// RELATED IDS - entidades relacionadas con la seleccionada
// ============================================================================

function computeRelatedIds(entity, data) {
  if (!entity || !data) return null
  const ids = new Set([entity.id])
  if (entity.type === 'org') {
    const repos = data.orgRepos[entity.id] || []
    repos.forEach(r => { ids.add(r.id); (data.repoUsers[r.id] || []).forEach(u => ids.add(u.id)) })
  } else if (entity.type === 'repo') {
    (data.repoUsers[entity.id] || []).forEach(u => ids.add(u.id))
    Object.entries(data.orgRepos).forEach(([oid, repos]) => { if (repos.some(r => r.id === entity.id)) ids.add(oid) })
  } else if (entity.type === 'user') {
    Object.entries(data.repoUsers).forEach(([rid, users]) => {
      if (users.some(u => u.id === entity.id)) {
        ids.add(rid)
        Object.entries(data.orgRepos).forEach(([oid, repos]) => { if (repos.some(r => r.id === rid)) ids.add(oid) })
      }
    })
  }
  return ids
}

// ============================================================================
// VACÍO CUÁNTICO: Lattice hexagonal + fluctuaciones del vacío
// ============================================================================

function QuantumVacuum({ progressRef, progressKey }) {
  const fluctRef = useRef()
  const latticeRef = useRef()

  // Lattice grid (rejilla cuántica de fondo)
  const latticeGeo = useMemo(() => {
    const pts = []
    const size = 400
    const step = 30
    // Grid en XZ
    for (let x = -size; x <= size; x += step) {
      pts.push(x, -50, -size, x, -50, size)
    }
    for (let z = -size; z <= size; z += step) {
      pts.push(-size, -50, z, size, -50, z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])

  // Fluctuaciones del vacío - partículas virtuales apareciendo/desapareciendo
  const fluctCount = 400
  const fluctPositions = useMemo(() => {
    const arr = new Float32Array(fluctCount * 3)
    for (let i = 0; i < fluctCount; i++) {
      arr[i * 3]     = (Math.random() - 0.5) * 600
      arr[i * 3 + 1] = (Math.random() - 0.5) * 400
      arr[i * 3 + 2] = (Math.random() - 0.5) * 600
    }
    return arr
  }, [])

  const fluctPhases = useMemo(() => {
    const arr = new Float32Array(fluctCount)
    for (let i = 0; i < fluctCount; i++) arr[i] = Math.random()
    return arr
  }, [])

  // Material GPU - per-vertex twinkling sin CPU iterations
  const fluctMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      attribute float aPhase;
      uniform float uTime;
      uniform float uProgress;
      varying float vAlpha;
      void main() {
        float phase = aPhase * 6.28318;
        float life = sin(uTime * (0.5 + aPhase * 2.0) + phase);
        float sz = max(0.0, life) * 0.5 * uProgress;
        vAlpha = sz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(sz * 0.2 * (200.0 / max(-mv.z, 1.0)), 0.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(0.2, 0.4, 0.67, uOpacity * vAlpha * (1.0 - d));
      }
    `,
    transparent: true,
    depthWrite: false,
  }), [])

  // Animación: solo 3 uniform writes por frame (vs 400 iter antes)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const p = easeOutCubic(progressRef.current[progressKey])
    fluctMat.uniforms.uTime.value = t
    fluctMat.uniforms.uProgress.value = p
    fluctMat.uniforms.uOpacity.value = p > 0.01 ? 0.15 * p : 0

    // Lattice fade-in
    if (latticeRef.current) latticeRef.current.material.opacity = 0.025 * p
  })

  return (
    <>
      {/* Lattice cuántico */}
      <lineSegments ref={latticeRef} geometry={latticeGeo}>
        <lineBasicMaterial color="#00f7ff" transparent opacity={0} depthWrite={false} />
      </lineSegments>

      {/* Fluctuaciones del vacío - GPU twinkling */}
      <points ref={fluctRef} material={fluctMat} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={fluctPositions} itemSize={3} count={fluctCount} />
          <bufferAttribute attach="attributes-aPhase" array={fluctPhases} itemSize={1} count={fluctCount} />
        </bufferGeometry>
      </points>
    </>
  )
}

// ============================================================================
// PROCESADORES CUÁNTICOS (Orgs) - InstancedMesh: 4 draw calls en vez de 2800
// ============================================================================

function QuantumProcessors({ orgNodes, positions, onHover, onClick, progressRef, progressKey, highlightSet, lensData, lensRevealDelay = 100, activeNodeIdsRef }) {
  const torus1Ref = useRef()
  const torus2Ref = useRef()
  const coreRef = useRef()
  const hitRef = useRef()
  const n = orgNodes.length
  const visRef = useRef(null)

  const torusGeo = useMemo(() => new THREE.TorusGeometry(2.8, 0.25, 12, 48), [])
  const torusGeo2 = useMemo(() => new THREE.TorusGeometry(4, 0.12, 8, 48), [])
  const coreGeo = useMemo(() => new THREE.SphereGeometry(0.9, 16, 16), [])
  const hitGeo = useMemo(() => new THREE.SphereGeometry(6, 8, 8), [])

  const t1Mat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.7 }), [])
  const t2Mat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.25 }), [])
  const coreMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.6 }), [])
  const hitMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), [])

  const tmpObj = useMemo(() => new THREE.Object3D(), [])
  const tmpColor = useMemo(() => new THREE.Color(), [])
  const tmpColor2 = useMemo(() => new THREE.Color(), [])
  const orgBaseColor = useMemo(() => new THREE.Color('#00f7ff'), [])
  const orgTargetColor = useMemo(() => new THREE.Color(), [])
  const orgLensBlend = useRef(0)
  const lastOrgLens = useRef(null)
  const orgRevealTime = useRef(0)
  const ORG_BLEND_SPEED = 0.04

  useFrame(({ clock }) => {
    if (!torus1Ref.current || !torus2Ref.current || !coreRef.current || !hitRef.current) return
    const t = clock.getElapsedTime()
    const hasSel = highlightSet !== null
    const progress = progressRef.current[progressKey]

    // Smooth lens blend
    if (lensData !== lastOrgLens.current) {
      lastOrgLens.current = lensData
      orgLensBlend.current = lensData ? 0.0 : 1.0
      orgRevealTime.current = performance.now() + (lensRevealDelay || 100)
    }
    const oTarget = lensData ? 1.0 : 0.0
    if (performance.now() >= orgRevealTime.current) {
      orgLensBlend.current += (oTarget - orgLensBlend.current) * ORG_BLEND_SPEED
      if (Math.abs(oTarget - orgLensBlend.current) < 0.005) orgLensBlend.current = oTarget
    }
    const blend = orgLensBlend.current

    // === Temporal visibility lerp ===
    if (!visRef.current || visRef.current.length !== n) {
      visRef.current = new Float32Array(n)
      const initIds = activeNodeIdsRef?.current
      for (let vi = 0; vi < n; vi++) visRef.current[vi] = !initIds ? 1 : (initIds.get(orgNodes[vi]?.id) ?? 0)
    }
    const activeIds = activeNodeIdsRef?.current
    for (let vi = 0; vi < n; vi++) {
      const vTarget = !activeIds ? 1 : (activeIds.get(orgNodes[vi]?.id) ?? 0)
      visRef.current[vi] += (vTarget - visRef.current[vi]) * 0.015
      if (Math.abs(vTarget - visRef.current[vi]) < 0.005) visRef.current[vi] = vTarget
    }

    for (let i = 0; i < n; i++) {
      const pos = positions[orgNodes[i].id]
      if (!pos) continue

      const stagger = n > 1 ? i / (n - 1) : 0
      const localP = easeOutElastic(Math.min(Math.max((progress - stagger * 0.6) / 0.5, 0), 1))
      const isHighlighted = hasSel && highlightSet.has(orgNodes[i]?.id)
      // Lens-driven scale: brighter lens color → bigger entity
      const ld = lensData?.[orgNodes[i]?.id]
      const lensScaleFactor = (ld && blend > 0.01)
        ? 0.5 + ((ld.r + ld.g + ld.b) / 3) * 0.8
        : 1.0
      const appliedLensScale = 1.0 + (lensScaleFactor - 1.0) * blend
      const vis = visRef.current[i]
      const scale = (isHighlighted ? localP * 1.25 : localP) * appliedLensScale * (vis < 0.001 ? 0 : 1)
      const speed = 0.3 + i * 0.05

      // Torus 1 - rotación X,Y
      tmpObj.position.copy(pos)
      tmpObj.rotation.set(t * speed, t * speed * 0.7, 0)
      tmpObj.scale.setScalar(scale)
      tmpObj.updateMatrix()
      torus1Ref.current.setMatrixAt(i, tmpObj.matrix)

      // Torus 2 - rotación X,Z inversa
      tmpObj.rotation.set(t * speed * -0.5, 0, t * speed * 0.3)
      tmpObj.updateMatrix()
      torus2Ref.current.setMatrixAt(i, tmpObj.matrix)

      // Core - sin rotación
      tmpObj.rotation.set(0, 0, 0)
      tmpObj.updateMatrix()
      coreRef.current.setMatrixAt(i, tmpObj.matrix)

      // Hitbox - misma posición/escala que core
      hitRef.current.setMatrixAt(i, tmpObj.matrix)

      // Color con dimming via brillo (instanceColor × material.color = color final)
      const dim = hasSel && !isHighlighted ? 0.02 : 1
      const boost = hasSel && isHighlighted ? 1.6 : 1
      const visFade = vis * vis  // quadratic for smoother perceptual fade
      if (ld && blend > 0.01) {
        orgTargetColor.setRGB(ld.r, ld.g, ld.b)
        tmpColor.copy(orgBaseColor).lerp(orgTargetColor, blend)
      } else {
        tmpColor.copy(orgBaseColor)
      }
      const factor = dim * boost * visFade
      tmpColor2.copy(tmpColor).multiplyScalar(2 * factor)
      torus1Ref.current.setColorAt(i, tmpColor2)
      tmpColor2.copy(tmpColor).multiplyScalar(1.2 * factor)
      torus2Ref.current.setColorAt(i, tmpColor2)
      tmpColor2.copy(tmpColor).multiplyScalar(3 * factor)
      coreRef.current.setColorAt(i, tmpColor2)
    }

    torus1Ref.current.instanceMatrix.needsUpdate = true
    torus2Ref.current.instanceMatrix.needsUpdate = true
    coreRef.current.instanceMatrix.needsUpdate = true
    hitRef.current.instanceMatrix.needsUpdate = true
    if (torus1Ref.current.instanceColor) torus1Ref.current.instanceColor.needsUpdate = true
    if (torus2Ref.current.instanceColor) torus2Ref.current.instanceColor.needsUpdate = true
    if (coreRef.current.instanceColor) coreRef.current.instanceColor.needsUpdate = true
  })

  if (n === 0) return null

  return (
    <>
      <instancedMesh ref={torus1Ref} args={[torusGeo, t1Mat, n]} frustumCulled={false} />
      <instancedMesh ref={torus2Ref} args={[torusGeo2, t2Mat, n]} frustumCulled={false} />
      <instancedMesh ref={coreRef} args={[coreGeo, coreMat, n]} frustumCulled={false} />
      <instancedMesh ref={hitRef} args={[hitGeo, hitMat, n]} frustumCulled={false}
        onPointerOver={(e) => { e.stopPropagation(); const i = e.instanceId; if (i != null && orgNodes[i] && (!visRef.current || visRef.current[i] > 0.01)) onHover(orgNodes[i], positions[orgNodes[i].id]) }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null, null) }}
        onClick={(e) => { e.stopPropagation(); const i = e.instanceId; if (i != null && orgNodes[i] && (!visRef.current || visRef.current[i] > 0.01)) onClick(orgNodes[i], positions[orgNodes[i].id]) }}
      />
    </>
  )
}

// ============================================================================
// NUBES DE PROBABILIDAD - GPU orbital shader (11K iter/frame → 0)
// ============================================================================

const CLOUD_VERTEX = `
  attribute float aRadius;
  attribute float aTheta;
  attribute float aPhi;
  attribute float aSpeed;
  attribute float aVisible;
  uniform float uTime;
  uniform float uProgress;
  varying float vVisible;
  void main() {
    vVisible = aVisible;
    if (aVisible < 0.001) { gl_PointSize = 0.0; gl_Position = vec4(9999.0, 9999.0, 9999.0, 1.0); return; }
    float theta = aTheta + uTime * aSpeed;
    float phi = aPhi + uTime * 0.15;
    float r = aRadius * uProgress;
    vec3 offset = vec3(
      r * sin(phi) * cos(theta),
      r * sin(phi) * sin(theta),
      r * cos(phi)
    );
    vec4 mv = modelViewMatrix * vec4(position + offset, 1.0);
    gl_PointSize = 0.15 * (200.0 / max(-mv.z, 1.0));
    gl_Position = projectionMatrix * mv;
  }
`
const CLOUD_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vVisible;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float visFade = vVisible * vVisible;
    gl_FragColor = vec4(uColor * visFade, uOpacity * (1.0 - d * d) * visFade);
  }
`

function ProbabilityClouds({ repoNodes, positions, progressRef, progressKey, dimmed, activeNodeIdsRef }) {
  const ref = useRef()
  const PER_QUBIT = 10
  const visRef = useRef(null)

  const { centerArr, radiusArr, thetaArr, phiArr, speedArr, count } = useMemo(() => {
    const total = repoNodes.length * PER_QUBIT
    const centers = new Float32Array(total * 3)
    const radii = new Float32Array(total)
    const thetas = new Float32Array(total)
    const phis = new Float32Array(total)
    const speeds = new Float32Array(total)
    let vIdx = 0, sIdx = 0
    repoNodes.forEach(repo => {
      const c = positions[repo.id]; if (!c) return
      for (let i = 0; i < PER_QUBIT; i++) {
        const r = 1.2 + Math.random() * 1.8
        const θ = Math.random() * Math.PI * 2
        const φ = Math.acos(2 * Math.random() - 1)
        centers[vIdx] = c.x; centers[vIdx + 1] = c.y; centers[vIdx + 2] = c.z
        vIdx += 3
        radii[sIdx] = r; thetas[sIdx] = θ; phis[sIdx] = φ
        speeds[sIdx] = 0.3 + (i % 5) * 0.1
        sIdx++
      }
    })
    return { centerArr: centers, radiusArr: radii, thetaArr: thetas, phiArr: phis, speedArr: speeds, count: total }
  }, [repoNodes, positions])

  const visibleArr = useMemo(() => new Float32Array(count).fill(1), [count])

  const shaderMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#bd00ff').multiplyScalar(2) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uProgress: { value: 0 },
    },
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const p = easeOutCubic(progressRef.current[progressKey])
    shaderMat.uniforms.uTime.value = clock.getElapsedTime() * 0.4
    shaderMat.uniforms.uProgress.value = p
    shaderMat.uniforms.uOpacity.value = (dimmed ? 0.008 : 0.5) * p

    // === Temporal visibility per cloud particle ===
    const geo = ref.current?.geometry
    if (geo) {
      const visAttr = geo.attributes.aVisible
      if (visAttr) {
        const activeIds = activeNodeIdsRef?.current
        const n = repoNodes.length
        if (!visRef.current || visRef.current.length !== n) {
          visRef.current = new Float32Array(n)
          const initIds = activeNodeIdsRef?.current
          for (let ri = 0; ri < n; ri++) visRef.current[ri] = !initIds ? 1 : (initIds.get(repoNodes[ri]?.id) ?? 0)
        }
        let changed = false
        for (let ri = 0; ri < n; ri++) {
          const vTarget = !activeIds ? 1 : (activeIds.get(repoNodes[ri]?.id) ?? 0)
          visRef.current[ri] += (vTarget - visRef.current[ri]) * 0.015
          if (Math.abs(vTarget - visRef.current[ri]) < 0.005) visRef.current[ri] = vTarget
        }
        for (let ri = 0; ri < n; ri++) {
          const v = visRef.current[ri]
          const base = ri * PER_QUBIT
          for (let pi = 0; pi < PER_QUBIT; pi++) {
            if (visAttr.array[base + pi] !== v) { visAttr.array[base + pi] = v; changed = true }
          }
        }
        if (changed) visAttr.needsUpdate = true
      }
    }
  })

  if (repoNodes.length === 0) return null

  return (
    <points ref={ref} material={shaderMat} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={centerArr} itemSize={3} count={count} />
        <bufferAttribute attach="attributes-aRadius" array={radiusArr} itemSize={1} count={count} />
        <bufferAttribute attach="attributes-aTheta" array={thetaArr} itemSize={1} count={count} />
        <bufferAttribute attach="attributes-aPhi" array={phiArr} itemSize={1} count={count} />
        <bufferAttribute attach="attributes-aSpeed" array={speedArr} itemSize={1} count={count} />
        <bufferAttribute attach="attributes-aVisible" array={visibleArr} itemSize={1} count={count} />
      </bufferGeometry>
    </points>
  )
}

// ============================================================================
// QUBITS (Repos) - Esferas con ejes de Bloch
// ============================================================================

function Qubits({ repoNodes, positions, onHover, onClick, progressRef, progressKey, highlightSet, lensData, lensRevealDelay = 100, activeNodeIdsRef }) {
  const ref = useRef()
  const hitRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const visRef = useRef(null)
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(0.55, 16, 16), [])
  const hitGeo = useMemo(() => new THREE.SphereGeometry(2.5, 6, 6), [])
  const hitMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), [])
  const qubitMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#bd00ff').multiplyScalar(1.8),
    toneMapped: false, transparent: true, opacity: 0.85,
  }), [])
  const brightCol = useMemo(() => new THREE.Color(1, 1, 1), [])
  const boostCol = useMemo(() => new THREE.Color(1.8, 1.8, 2.2), []) // boost para seleccionados
  const dimCol = useMemo(() => new THREE.Color(0.02, 0.02, 0.03), [])
  const lensCol = useMemo(() => new THREE.Color(), [])
  const baseQubitCol = useMemo(() => new THREE.Color('#bd00ff').multiplyScalar(1.8), [])
  const whiteMat = useMemo(() => new THREE.Color(1, 1, 1), [])
  const qubitLensBlend = useRef(0)
  const lastQubitLens = useRef(null)
  const qubitRevealTime = useRef(0)
  const QUBIT_BLEND_SPEED = 0.04

  useFrame(({ clock }) => {
    if (!ref.current || repoNodes.length === 0) return
    const t = clock.getElapsedTime()
    const n = repoNodes.length
    const hasSel = highlightSet !== null

    // Smooth lens blend for qubits - delayed until canvas visible
    if (lensData !== lastQubitLens.current) {
      lastQubitLens.current = lensData
      qubitLensBlend.current = lensData ? 0.0 : 1.0
      qubitRevealTime.current = performance.now() + (lensRevealDelay || 100)
    }
    const qTarget = lensData ? 1.0 : 0.0
    if (performance.now() >= qubitRevealTime.current) {
      qubitLensBlend.current += (qTarget - qubitLensBlend.current) * QUBIT_BLEND_SPEED
      if (Math.abs(qTarget - qubitLensBlend.current) < 0.005) qubitLensBlend.current = qTarget
    }
    const blend = qubitLensBlend.current

    // Lerp material towards white when lens active so instanceColor hues
    // survive (purple mat has G=0, killing orange/yellow/green)
    if (blend > 0.01) {
      qubitMat.color.copy(baseQubitCol).lerp(whiteMat, blend)
    } else {
      qubitMat.color.copy(baseQubitCol)
    }

    // === Temporal visibility lerp ===
    const rn = repoNodes.length
    if (!visRef.current || visRef.current.length !== rn) {
      visRef.current = new Float32Array(rn)
      const initIds = activeNodeIdsRef?.current
      for (let vi = 0; vi < rn; vi++) visRef.current[vi] = !initIds ? 1 : (initIds.get(repoNodes[vi]?.id) ?? 0)
    }
    const activeIds = activeNodeIdsRef?.current
    for (let vi = 0; vi < rn; vi++) {
      const vTarget = !activeIds ? 1 : (activeIds.get(repoNodes[vi]?.id) ?? 0)
      visRef.current[vi] += (vTarget - visRef.current[vi]) * 0.015
      if (Math.abs(vTarget - visRef.current[vi]) < 0.005) visRef.current[vi] = vTarget
    }

    repoNodes.forEach((repo, i) => {
      const pos = positions[repo.id]; if (!pos) return
      const baseScale = Math.min(Math.max((repo.stars || 0) / 800, 0.7), 1.5)
      const progress = progressRef.current[progressKey]
      const stagger = n > 1 ? i / (n - 1) : 0
      const localP = easeOutElastic(Math.min(Math.max((progress - stagger * 0.5) / 0.6, 0), 1))
      const isHighlighted = hasSel && highlightSet.has(repo.id)
      // Boost de escala para qubits seleccionados
      const selScale = hasSel && isHighlighted ? 1.4 : 1.0
      // Lens-driven scale: brighter lens color → bigger entity
      const ld = lensData?.[repo.id]
      const lensScaleFactor = (ld && blend > 0.01)
        ? 0.5 + ((ld.r + ld.g + ld.b) / 3) * 1.0
        : 1.0
      const appliedLensScale = 1.0 + (lensScaleFactor - 1.0) * blend
      const vis = visRef.current[i]
      const visFade = vis * vis  // quadratic for smoother perceptual fade
      dummy.position.copy(pos)
      // Heisenberg uncertainty - micro-vibración cuántica
      dummy.position.x += Math.sin(t * 1.7 + i * 3.14) * 0.04
      dummy.position.y += Math.cos(t * 2.3 + i * 2.71) * 0.04
      dummy.position.z += Math.sin(t * 1.9 + i * 1.62) * 0.04
      dummy.scale.setScalar(baseScale * localP * selScale * appliedLensScale * (vis < 0.001 ? 0 : 1))
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
      if (hitRef.current) {
        dummy.scale.setScalar(vis > 0.01 && localP > 0.1 ? 1 : 0.001)
        dummy.updateMatrix()
        hitRef.current.setMatrixAt(i, dummy.matrix)
      }
      // Lens-aware coloring with smooth blend
      if (ld && blend > 0.01) {
        lensCol.setRGB(ld.r * visFade, ld.g * visFade, ld.b * visFade)
        // Lerp from base/selection color towards lens color
        const fromCol = hasSel ? (isHighlighted ? boostCol : dimCol) : brightCol
        lensCol.lerp(fromCol, 1.0 - blend)
        lensCol.multiplyScalar(visFade)
        ref.current.setColorAt(i, lensCol)
      } else {
        const baseCol = hasSel ? (isHighlighted ? boostCol : dimCol) : brightCol
        lensCol.copy(baseCol).multiplyScalar(visFade)
        ref.current.setColorAt(i, lensCol)
      }
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    if (hitRef.current) hitRef.current.instanceMatrix.needsUpdate = true
  })

  if (repoNodes.length === 0) return null

  return (
    <>
      <instancedMesh ref={ref} args={[sphereGeo, qubitMat, repoNodes.length]} />
      <instancedMesh
        ref={hitRef}
        args={[hitGeo, hitMat, repoNodes.length]}
        onPointerMove={(e) => {
          e.stopPropagation()
          const idx = e.instanceId
          if (idx !== undefined && repoNodes[idx] && (!visRef.current || visRef.current[idx] > 0.01)) onHover(repoNodes[idx], positions[repoNodes[idx].id])
        }}
        onPointerLeave={(e) => { e.stopPropagation(); onHover(null, null) }}
        onClick={(e) => {
          e.stopPropagation()
          const idx = e.instanceId
          if (idx !== undefined && repoNodes[idx] && (!visRef.current || visRef.current[idx] > 0.01)) onClick(repoNodes[idx], positions[repoNodes[idx].id])
        }}
      />
    </>
  )
}

// ============================================================================
// EJES DE BLOCH - líneas |0⟩↔|1⟩ por cada qubit
// ============================================================================

function BlochAxes({ repoNodes, positions, progressRef, progressKey, dimmed, activeNodeIdsRef }) {
  const matRef = useRef()
  const visRef = useRef(null)
  const gRef = useRef()
  const geometry = useMemo(() => {
    const pts = []
    const vis = []
    repoNodes.forEach(repo => {
      const pos = positions[repo.id]; if (!pos) return
      const scale = Math.min(Math.max((repo.stars || 0) / 800, 0.7), 1.5)
      const h = 1.8 * scale
      // Eje vertical |0⟩ → |1⟩ (2 vértices por repo)
      pts.push(pos.x, pos.y - h, pos.z, pos.x, pos.y + h, pos.z)
      vis.push(1.0, 1.0)  // aVisible por vértice
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    g.setAttribute('aVisible', new THREE.Float32BufferAttribute(new Float32Array(vis), 1))
    return g
  }, [repoNodes, positions])
  // Dispose geometry anterior cuando deps cambian + cleanup en unmount
  useEffect(() => () => geometry?.dispose(), [geometry])

  useFrame(() => {
    if (matRef.current) matRef.current.uniforms.uOpacity.value = 0.15 * easeOutCubic(progressRef?.current?.[progressKey] || 0) * (dimmed ? 0.04 : 1)
    // === Temporal visibility for Bloch axes ===
    const visAttr = geometry.attributes.aVisible
    if (visAttr) {
      const activeIds = activeNodeIdsRef?.current
      const n = repoNodes.length
      if (!visRef.current || visRef.current.length !== n) {
        visRef.current = new Float32Array(n)
        const initIds = activeNodeIdsRef?.current
        for (let ri = 0; ri < n; ri++) visRef.current[ri] = !initIds ? 1 : (initIds.get(repoNodes[ri]?.id) ?? 0)
      }
      let changed = false
      for (let ri = 0; ri < n; ri++) {
        const vTarget = !activeIds ? 1 : (activeIds.get(repoNodes[ri]?.id) ?? 0)
        visRef.current[ri] += (vTarget - visRef.current[ri]) * 0.015
        if (Math.abs(vTarget - visRef.current[ri]) < 0.005) visRef.current[ri] = vTarget
        const v = visRef.current[ri]
        const base = ri * 2 // 2 vértices por repo
        if (visAttr.array[base] !== v) { visAttr.array[base] = v; visAttr.array[base + 1] = v; changed = true }
      }
      if (changed) visAttr.needsUpdate = true
    }
  })

  if (repoNodes.length === 0) return null

  return (
    <lineSegments geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        vertexShader={`
          attribute float aVisible;
          varying float vVis;
          void main() {
            vVis = aVisible;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vVis;
          void main() {
            if (vVis < 0.001) discard;
            float visFade = vVis * vVis;
            gl_FragColor = vec4(uColor * visFade, uOpacity * visFade);
          }
        `}
        uniforms={{
          uColor: { value: new THREE.Color('#bd00ff').multiplyScalar(0.8) },
          uOpacity: { value: 0 },
        }}
      />
    </lineSegments>
  )
}

// ============================================================================
// Textura de glow para partículas (Points) - genera halo circular soft
// ============================================================================

function createGlowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)')
  g.addColorStop(0.75, 'rgba(255,255,255,0.08)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

// ============================================================================
// GLSL: Vertex/Fragment shaders para partículas cuánticas (GPU-driven)
// ============================================================================

const PARTICLE_VERTEX = /* glsl */`
  attribute float aIsBridge;
  attribute float aBrightness;
  attribute float aSeed;
  attribute vec3 aLensColor;
  attribute float aDensity;
  attribute float aVisible;
  uniform float uTime;
  uniform float uProgress;
  uniform float uBaseSize;
  uniform float uBridgeSize;
  uniform float uLensActive;
  uniform float uBridgeReveal;
  varying float vBrightness;
  varying float vIsBridge;
  varying float vGlow;
  varying vec3 vLensColor;
  varying float vLensActive;
  varying float vDensity;
  varying float vBridgeBlend;
  varying float vVisible;

  void main() {
    vBrightness = aBrightness;
    vIsBridge = aIsBridge;
    vLensColor = aLensColor;
    vLensActive = uLensActive;
    vDensity = aDensity;
    vVisible = aVisible;
    float p = smoothstep(0.0, 1.0, uProgress);

    // === STAGGERING PER-PARTICLE ===
    float stagger = fract(aSeed * 3.7) * 0.55;
    float localP = smoothstep(stagger, stagger + 0.45, p);

    // === CRITICAL: GPU clampea gl_PointSize mínimo a 1px ===
    if (localP < 0.001 || aVisible < 0.001) {
      gl_PointSize = 0.0;
      gl_Position = vec4(9999.0, 9999.0, 9999.0, 1.0);
      return;
    }

    // === BRIDGE REVEAL: bridges nacen verdes, transicionan a dorado ===
    // Driven por entanglement progress, staggered por seed
    float bStagger = fract(aSeed * 5.3) * 0.35;
    float bridgeBlend = aIsBridge > 0.5
      ? smoothstep(bStagger, bStagger + 0.5, uBridgeReveal)
      : 0.0;
    vBridgeBlend = bridgeBlend;

    // === Heisenberg jitter - incertidumbre cuántica ===
    float jx = sin(uTime * 3.14 + aSeed * 17.3) * 0.04;
    float jy = sin(uTime * 2.71 + aSeed * 31.7) * 0.04;
    float jz = sin(uTime * 1.62 + aSeed * 47.1) * 0.04;
    vec3 pos = position + vec3(jx, jy, jz);

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

    // === Bridge: pulso suave + brillo aleatorio por usuario ===
    float personalFlash = pow(max(cos(uTime * 0.8 + aSeed * 6.28), 0.0), 20.0);
    float bridgePulse = localP >= 0.99
      ? (1.0 + sin(uTime * 1.8 + aSeed) * 0.15 + personalFlash * 0.25)
      : localP;
    float normalPulse = localP * (1.0 + sin(uTime * 1.5 + aSeed) * 0.05);

    // === Lens mode: brighter lens color → bigger particles ===
    float lensBrightness = (aLensColor.r + aLensColor.g + aLensColor.b) / 3.0;
    float lensScale = mix(1.0, 0.5 + lensBrightness * 0.8, uLensActive);

    // Tamaño: blend suave de normal → bridge según bridgeBlend
    float normalSize = uBaseSize * normalPulse * lensScale;
    float bridgeSize = uBridgeSize * bridgePulse * lensScale;
    float size = mix(normalSize, bridgeSize, bridgeBlend);

    // Reducir tamaño en repos densos (bridges preservan tamaño mínimo)
    float densitySize = mix(aDensity, max(aDensity, 0.5), bridgeBlend);
    size *= (0.4 + densitySize * 0.6);

    // === Glow intensity - crece con la revelación del bridge ===
    vGlow = mix(1.0, 1.0 + personalFlash * 0.6, bridgeBlend);

    gl_PointSize = size * (350.0 / -mvPos.z);
    if (aVisible < 0.001) { gl_PointSize = 0.0; gl_Position = vec4(9999.0, 9999.0, 9999.0, 1.0); return; }
    gl_Position = projectionMatrix * mvPos;
  }
`

const PARTICLE_FRAGMENT = /* glsl */`
  uniform sampler2D uMap;
  uniform vec3 uColorNormal;
  uniform vec3 uColorBridge;
  varying float vBrightness;
  varying float vIsBridge;
  varying float vGlow;
  varying vec3 vLensColor;
  varying float vLensActive;
  varying float vDensity;
  varying float vBridgeBlend;
  varying float vVisible;

  void main() {
    float visFade = vVisible * vVisible;
    vec4 texel = texture2D(uMap, gl_PointCoord);
    // Bridge reveal: verde → dorado progresivo según vBridgeBlend
    vec3 baseCol = mix(uColorNormal, uColorBridge, vBridgeBlend);
    // Lens mode: blend towards per-particle analytical color
    vec3 col = mix(baseCol, vLensColor, vLensActive);
    // Halo radiante: centro más brillante, borde con color
    float d = length(gl_PointCoord - vec2(0.5));
    float core = smoothstep(0.4, 0.0, d);
    vec3 finalCol = col * vBrightness * vGlow * visFade + vec3(1.0) * core * 0.3 * vGlow * visFade;
    // Reducir opacidad en repos densos (bridges mantienen visibilidad)
    float densityAlpha = mix(vDensity, 1.0, vIsBridge * 0.7);
    float alpha = texel.a * vBrightness * 0.95 * densityAlpha * visFade;
    gl_FragColor = vec4(finalCol, alpha);
  }
`

// ============================================================================
// PARTÍCULAS CUÁNTICAS (Users) - 100% GPU via GLSL ShaderMaterial
// ============================================================================

function QuantumParticles({ userNodes, positions, onHover, onClick, progressRef, progressKey, highlightSet, lensData, lensRevealDelay = 100, userDensity, multiOrgColors, activeNodeIdsRef }) {
  const ref = useRef()
  const glowMap = useMemo(() => createGlowTexture(), [])

  const { normal, bridges, allUsers } = useMemo(() => {
    const n = [], b = [], all = []
    userNodes.forEach(u => {
      all.push(u)
      ;(u.isBridge ? b : n).push(u)
    })
    return { normal: n, bridges: b, allUsers: all }
  }, [userNodes])

  // Un único BufferGeometry con TODOS los users (normal + bridge)
  const geo = useMemo(() => {
    const count = allUsers.length
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    const isBridge = new Float32Array(count)
    const brightness = new Float32Array(count)
    const seeds = new Float32Array(count)
    const lensColors = new Float32Array(count * 3)
    const density = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const p = positions[allUsers[i].id]
      if (p) { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z }
      isBridge[i] = allUsers[i].isBridge ? 1.0 : 0.0
      brightness[i] = 1.0
      seeds[i] = i * 0.1 + 0.5
      density[i] = userDensity?.[allUsers[i].id] ?? 1.0
      // Default lens color: white (no tinting)
      lensColors[i * 3] = 1; lensColors[i * 3 + 1] = 1; lensColors[i * 3 + 2] = 1
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aIsBridge', new THREE.BufferAttribute(isBridge, 1))
    g.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const visible = new Float32Array(count).fill(1.0)
    g.setAttribute('aLensColor', new THREE.BufferAttribute(lensColors, 3))
    g.setAttribute('aDensity', new THREE.BufferAttribute(density, 1))
    g.setAttribute('aVisible', new THREE.BufferAttribute(visible, 1))
    return g
  }, [allUsers, positions, userDensity])
  // Dispose geometry anterior cuando deps cambian + cleanup en unmount
  useEffect(() => () => geo?.dispose(), [geo])

  // ShaderMaterial - toda animación en GPU
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uBaseSize: { value: 3.5 },
      uBridgeSize: { value: 5.0 },
      uMap: { value: glowMap },
      uColorNormal: { value: new THREE.Color('#00ff9f').multiplyScalar(2.0) },
      uColorBridge: { value: new THREE.Color('#ffbd00').multiplyScalar(2.5) },
      uLensActive: { value: 0.0 },
      uBridgeReveal: { value: 0.0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), [glowMap])

  // Solo actualizar 2 uniforms por frame - 0% CPU para partículas
  const lastHighlight = useRef(undefined)
  const lastLens = useRef(null)
  const lensBlendCurrent = useRef(0)
  const lensRevealTime = useRef(0) // time when color animation should start
  const LENS_BLEND_SPEED = 0.04

  // Pre-compute multi-org index: para cada user con ≥2 colores de org,
  // almacenar su índice en allUsers + seed aleatorio para timing
  const multiOrgIndex = useMemo(() => {
    if (!multiOrgColors) return null
    const index = []
    for (let i = 0; i < allUsers.length; i++) {
      const colors = multiOrgColors[allUsers[i].id]
      if (colors) {
        // Seed aleatorio por user para que la velocidad de transición varíe
        const seed = ((i * 7919 + 1013) % 997) / 997 // pseudo-random determinístico
        index.push({ idx: i, colors, seed })
      }
    }
    return index.length > 0 ? index : null
  }, [allUsers, multiOrgColors])
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.getElapsedTime()
    mat.uniforms.uProgress.value = progressRef.current[progressKey]
    // Bridge reveal driven by entanglement progress - bridges "se descubren" con las conexiones
    mat.uniforms.uBridgeReveal.value = easeOutCubic(progressRef.current.entanglement || 0)

    // Lens colors: update when lens data changes
    if (lensData !== lastLens.current) {
      const wasActive = lastLens.current !== null
      lastLens.current = lensData
      // Activating: start from 0 (original colors), animate to 1
      // Deactivating: start from 1 (lens colors), animate to 0
      lensBlendCurrent.current = lensData ? 0.0 : 1.0
      lensRevealTime.current = performance.now() + (lensRevealDelay || 100)
      // Only update color buffer when activating a new lens (keep old colors during deactivation for smooth fadeout)
      if (lensData) {
        const colors = geo.attributes.aLensColor
        for (let i = 0; i < allUsers.length; i++) {
          const ld = lensData[allUsers[i].id]
          if (ld) {
            colors.array[i * 3] = ld.r
            colors.array[i * 3 + 1] = ld.g
            colors.array[i * 3 + 2] = ld.b
          } else {
            colors.array[i * 3] = 0.5; colors.array[i * 3 + 1] = 0.5; colors.array[i * 3 + 2] = 0.5
          }
        }
        colors.needsUpdate = true
      }
    }

    // Smooth lens blend: wait for canvas to be visible, then lerp 0→1
    const target = lensData ? 1.0 : 0.0
    if (performance.now() >= lensRevealTime.current) {
      lensBlendCurrent.current += (target - lensBlendCurrent.current) * LENS_BLEND_SPEED
      if (Math.abs(target - lensBlendCurrent.current) < 0.005) lensBlendCurrent.current = target
    }
    mat.uniforms.uLensActive.value = lensBlendCurrent.current

    // Multi-org color cycling: transicionar entre colores de las orgs del user
    // Solo cuando la lente de comunidades está activa (lensBlendCurrent > 0.5)
    if (multiOrgIndex && lensBlendCurrent.current > 0.5) {
      const t = clock.getElapsedTime()
      const colors = geo.attributes.aLensColor
      let anyChanged = false
      for (let k = 0; k < multiOrgIndex.length; k++) {
        const { idx, colors: orgColors, seed } = multiOrgIndex[k]
        // Periodo de transición aleatorio: entre 2.5s y 5.5s por user
        const period = 2.5 + seed * 3.0
        // Fase desplazada por seed para que no todos cambien a la vez
        const phase = (t + seed * 100) / period
        const totalColors = orgColors.length
        // Índice del color actual y siguiente
        const ci = Math.floor(phase) % totalColors
        const ni = (ci + 1) % totalColors
        // Factor de blend dentro de la transición (smooth ease)
        const raw = phase - Math.floor(phase)
        // 70% del tiempo quieto en un color, 30% transicionando
        const holdFraction = 0.7
        let blend
        if (raw < holdFraction) {
          blend = 0
        } else {
          const tt = (raw - holdFraction) / (1 - holdFraction)
          blend = tt * tt * (3 - 2 * tt) // smoothstep
        }
        const c0 = orgColors[ci], c1 = orgColors[ni]
        const r = c0.r + (c1.r - c0.r) * blend
        const g = c0.g + (c1.g - c0.g) * blend
        const b = c0.b + (c1.b - c0.b) * blend
        colors.array[idx * 3]     = r
        colors.array[idx * 3 + 1] = g
        colors.array[idx * 3 + 2] = b
        anyChanged = true
      }
      if (anyChanged) colors.needsUpdate = true
    }

    // Highlight: solo cuando cambia la selección
    const hlChanged = lastHighlight.current !== highlightSet
    if (hlChanged) {
      lastHighlight.current = highlightSet
      const hasSel = highlightSet !== null
      const bright = geo.attributes.aBrightness
      for (let i = 0; i < allUsers.length; i++) {
        // Seleccionados brillan más (1.5), no seleccionados casi invisibles (0.02)
        bright.array[i] = !hasSel ? 1.0 : highlightSet.has(allUsers[i].id) ? 1.5 : 0.02
      }
      bright.needsUpdate = true
    }

    // === Temporal visibility lerp ===
    const activeIds = activeNodeIdsRef?.current
    const visAttr = geo.attributes.aVisible
    if (visAttr) {
      let visChanged = false
      for (let i = 0; i < allUsers.length; i++) {
        const vTarget = !activeIds ? 1 : (activeIds.get(allUsers[i].id) ?? 0)
        const diff = vTarget - visAttr.array[i]
        if (Math.abs(diff) > 0.005) {
          visAttr.array[i] += diff * 0.015
          visChanged = true
        } else if (visAttr.array[i] !== vTarget) {
          visAttr.array[i] = vTarget
          visChanged = true
        }
      }
      if (visChanged) visAttr.needsUpdate = true
    }
  })

  // Raycasting via Points nativo
  const handlePointer = useCallback((e) => {
    e.stopPropagation()
    const idx = e.index
    if (idx !== undefined && allUsers[idx]) {
      const activeIds = activeNodeIdsRef?.current
      if (activeIds && (activeIds.get(allUsers[idx].id) ?? 0) < 0.01) return
      onHover(allUsers[idx], positions[allUsers[idx].id])
    }
  }, [allUsers, positions, onHover, activeNodeIdsRef])

  const handleClick = useCallback((e) => {
    e.stopPropagation()
    const idx = e.index
    if (idx !== undefined && allUsers[idx]) {
      const activeIds = activeNodeIdsRef?.current
      if (activeIds && (activeIds.get(allUsers[idx].id) ?? 0) < 0.01) return
      onClick(allUsers[idx], positions[allUsers[idx].id])
    }
  }, [allUsers, positions, onClick, activeNodeIdsRef])

  const handleLeave = useCallback(() => onHover(null, null), [onHover])

  if (allUsers.length === 0) return null

  return (
    <points ref={ref} geometry={geo} material={mat}
      onPointerMove={handlePointer} onPointerLeave={handleLeave} onClick={handleClick} />
  )
}

// ============================================================================
// QUANTUM BONDS - espiral animada 100% GPU via GLSL
// ============================================================================

const BOND_VERTEX = /* glsl */`
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aSeed;
  attribute float aParticleIdx;
  attribute float aVisible;
  uniform float uTime;
  uniform float uProgress;
  varying float vPhase;
  varying float vParticle;
  varying float vVisible;

  void main() {
    float p = smoothstep(0.0, 1.0, uProgress);
    vVisible = aVisible;

    // === CRITICAL: GPU clampea gl_PointSize mínimo a 1px ===
    if (p < 0.001 || aVisible < 0.001) {
      gl_PointSize = 0.0;
      gl_Position = vec4(9999.0, 9999.0, 9999.0, 1.0);
      return;
    }

    // Múltiples partículas por bond con offsets distintos
    float phase = fract(uTime * 0.06 + aSeed + aParticleIdx * 0.33);
    vPhase = phase;
    vParticle = aParticleIdx;

    vec3 dir = aEnd - aStart;
    float len = length(dir);
    vec3 n = dir / max(len, 0.001);

    vec3 up = abs(n.y) < 0.9 ? vec3(-n.z, 0.0, n.x) : vec3(1.0, 0.0, 0.0);
    up = normalize(up);
    vec3 side = cross(n, up);

    // Doble hélice ADN-style (dos espirales entrelazadas)
    float helixOffset = aParticleIdx * 3.14159;
    float spiralAngle = phase * 12.566 + aSeed + helixOffset; // 4*PI = 2 vueltas
    float spiralR = 0.8 * sin(phase * 3.14159); // más amplia
    vec3 offset = (up * cos(spiralAngle) + side * sin(spiralAngle)) * spiralR;

    vec3 pos = aStart + dir * phase + offset;
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

    gl_PointSize = p * 2.0 * (200.0 / -mvPos.z);
    if (aVisible < 0.001) { gl_PointSize = 0.0; gl_Position = vec4(9999.0, 9999.0, 9999.0, 1.0); return; }
    gl_Position = projectionMatrix * mvPos;
  }
`

const BOND_FRAGMENT = /* glsl */`
  uniform float uOpacity;
  varying float vPhase;
  varying float vParticle;
  varying float vVisible;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float visFade = vVisible * vVisible;
    float glow = smoothstep(0.5, 0.0, d);
    // Color dual: verde-cyan, variando por partícula y fase
    vec3 colA = vec3(0.0, 1.0, 0.62);  // verde cuántico
    vec3 colB = vec3(0.0, 0.97, 1.0);  // cyan
    vec3 col = mix(colA, colB, sin(vPhase * 6.28 + vParticle * 3.14) * 0.5 + 0.5);
    float alpha = glow * uOpacity * (0.5 + 0.2 * sin(vPhase * 3.14159)) * visFade;
    gl_FragColor = vec4(col * 1.2 * visFade, alpha);
  }
`

function QuantumBonds({ repoUsers, positions, progressRef, progressKey, dimmed, activeNodeIdsRef }) {
  const ref = useRef()
  const visRef = useRef(null)

  const PARTICLES_PER_BOND = 1

  const bonds = useMemo(() => {
    const list = []
    const MAX_BONDS = 5000
    const entries = Object.entries(repoUsers)
    for (let e = 0; e < entries.length && list.length < MAX_BONDS; e++) {
      const [repoId, users] = entries[e]
      const rpos = positions[repoId]
      if (!rpos) continue
      for (let u = 0; u < users.length && list.length < MAX_BONDS; u++) {
        const upos = positions[users[u].id]
        if (!upos) continue
        list.push({ start: upos, end: rpos, seed: u * 7.13, repoId, userId: users[u].id })
      }
    }
    return list
  }, [repoUsers, positions])

  const { geo, mat } = useMemo(() => {
    const count = bonds.length * PARTICLES_PER_BOND
    if (bonds.length === 0) return { geo: null, mat: null }
    const g = new THREE.BufferGeometry()
    const starts = new Float32Array(count * 3)
    const ends = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const particleIdx = new Float32Array(count)
    const posArr = new Float32Array(count * 3)

    for (let i = 0; i < bonds.length; i++) {
      const b = bonds[i]
      for (let j = 0; j < PARTICLES_PER_BOND; j++) {
        const idx = i * PARTICLES_PER_BOND + j
        starts[idx * 3] = b.start.x; starts[idx * 3 + 1] = b.start.y; starts[idx * 3 + 2] = b.start.z
        ends[idx * 3] = b.end.x; ends[idx * 3 + 1] = b.end.y; ends[idx * 3 + 2] = b.end.z
        seeds[idx] = b.seed
        particleIdx[idx] = j
      }
    }

    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
    g.setAttribute('aStart', new THREE.BufferAttribute(starts, 3))
    g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 3))
    const visArr = new Float32Array(count).fill(1.0)
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    g.setAttribute('aParticleIdx', new THREE.BufferAttribute(particleIdx, 1))
    g.setAttribute('aVisible', new THREE.BufferAttribute(visArr, 1))

    const m = new THREE.ShaderMaterial({
      vertexShader: BOND_VERTEX,
      fragmentShader: BOND_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uOpacity: { value: 0.5 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    return { geo: g, mat: m }
  }, [bonds])
  // Dispose geometry + material anterior cuando deps cambian + cleanup en unmount
  useEffect(() => () => { geo?.dispose(); mat?.dispose() }, [geo, mat])

  // Solo 3 uniforms por frame + temporal visibility lerp
  useFrame(({ clock }) => {
    if (!mat) return
    const progress = progressRef.current[progressKey]
    mat.uniforms.uTime.value = clock.getElapsedTime()
    mat.uniforms.uProgress.value = progress
    mat.uniforms.uOpacity.value = (dimmed ? 0.008 : 0.35) * easeOutCubic(progress)

    // === Temporal visibility lerp ===
    if (geo) {
      const activeIds = activeNodeIdsRef?.current
      if (!visRef.current || visRef.current.length !== bonds.length) {
        visRef.current = new Float32Array(bonds.length)
        const initIds = activeNodeIdsRef?.current
        for (let i = 0; i < bonds.length; i++) visRef.current[i] = !initIds ? 1 : Math.min(initIds.get(bonds[i].repoId) ?? 0, initIds.get(bonds[i].userId) ?? 0)
      }
      const visAttr = geo.attributes.aVisible
      let visChanged = false
      for (let i = 0; i < bonds.length; i++) {
        const vTarget = !activeIds ? 1 : Math.min(activeIds.get(bonds[i].repoId) ?? 0, activeIds.get(bonds[i].userId) ?? 0)
        const diff = vTarget - visRef.current[i]
        if (Math.abs(diff) > 0.005) {
          visRef.current[i] += diff * 0.015
          visAttr.array[i] = visRef.current[i]
          visChanged = true
        } else if (visRef.current[i] !== vTarget) {
          visRef.current[i] = vTarget
          visAttr.array[i] = vTarget
          visChanged = true
        }
      }
      if (visChanged) visAttr.needsUpdate = true
    }
  })

  if (!geo || bonds.length === 0) return null

  return <points ref={ref} geometry={geo} material={mat} />
}

// ============================================================================
// ARCOS DE ENTRELAZAMIENTO ORG↔ORG - curvas cuadráticas entre procesadores
// ============================================================================

const ARC_VERTEX = `
  attribute float aT;
  attribute float aStrength;
  attribute float aVisible;
  varying float vT;
  varying float vStrength;
  varying float vVisible;
  uniform float uTime;
  uniform float uProgress;
  uniform float uOpacity;
  uniform float uBoost;
  void main() {
    vT = aT;
    vStrength = aStrength;
    vVisible = aVisible;
    // Descartar TODO cuando opacity es 0 (pre-animación) o visibility 0
    if (uOpacity < 0.001 || uProgress < 0.001 || aVisible < 0.001) {
      gl_PointSize = 0.0;
      gl_Position = vec4(9999.0, 9999.0, 9999.0, 1.0);
      return;
    }
    float vis = smoothstep(max(aT - 0.03, 0.001), aT + 0.01, uProgress);
    // Mover fuera del clip space cuando invisible
    if (vis < 0.001) {
      gl_PointSize = 0.0;
      gl_Position = vec4(9999.0, 9999.0, 9999.0, 1.0);
      return;
    }
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float baseSize = mix(1.2, 2.5, aStrength) * (1.0 + uBoost * 1.8);
    gl_PointSize = baseSize * vis * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const ARC_FRAGMENT = `
  varying float vT;
  varying float vStrength;
  varying float vVisible;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uBoost;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float visFade = vVisible * vVisible;
    float alpha = (1.0 - d * d) * uOpacity * mix(0.35, 0.8, vStrength) * visFade;
    // Gradiente cyan → púrpura a lo largo del arco
    vec3 cyan = vec3(0.0, 0.83, 0.89);
    vec3 purple = vec3(0.74, 0.44, 0.86);
    vec3 col = mix(cyan, purple, vT);
    // Pulso viajero sutil
    float pulse = smoothstep(0.0, 0.08, abs(vT - fract(uTime * 0.15))) *
                  smoothstep(0.0, 0.08, abs(vT - fract(uTime * 0.15 + 0.5)));
    alpha *= mix(1.0, 0.5, 1.0 - pulse);
    // Brillo extra cuando está resaltado
    float glow = 1.8 + uBoost * 1.2;
    gl_FragColor = vec4(col * glow * visFade, alpha);
  }
`

function OrgEntanglementArcs({ arcs, progressRef, progressKey, dimmed, collabHighlight, activeNodeIdsRef }) {
  const ref = useRef()
  const visRef = useRef(null)
  const POINTS_PER_ARC = 32

  const { geo, maxStrength } = useMemo(() => {
    if (arcs.length === 0) return { geo: null, maxStrength: 1 }
    const total = arcs.length * POINTS_PER_ARC
    const pos = new Float32Array(total * 3)
    const tArr = new Float32Array(total)
    const strArr = new Float32Array(total)
    const visArr = new Float32Array(total).fill(1.0)
    let maxS = 1

    arcs.forEach(arc => {
      if (arc.strength > maxS) maxS = arc.strength
    })

    let idx = 0
    arcs.forEach(arc => {
      const s = arc.start
      const e = arc.end
      // Punto de control elevado para la curva cuadrática
      const mid = {
        x: (s.x + e.x) / 2,
        y: (s.y + e.y) / 2 + Math.sqrt((e.x - s.x) ** 2 + (e.y - s.y) ** 2 + (e.z - s.z) ** 2) * 0.25,
        z: (s.z + e.z) / 2
      }
      const normStrength = Math.min(arc.strength / maxS, 1)

      for (let i = 0; i < POINTS_PER_ARC; i++) {
        const t = i / (POINTS_PER_ARC - 1)
        // Bezier cuadrático: B(t) = (1-t)²·S + 2(1-t)t·M + t²·E
        const omt = 1 - t
        pos[idx * 3] = omt * omt * s.x + 2 * omt * t * mid.x + t * t * e.x
        pos[idx * 3 + 1] = omt * omt * s.y + 2 * omt * t * mid.y + t * t * e.y
        pos[idx * 3 + 2] = omt * omt * s.z + 2 * omt * t * mid.z + t * t * e.z
        tArr[idx] = t
        strArr[idx] = normStrength
        idx++
      }
    })

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aT', new THREE.BufferAttribute(tArr, 1))
    g.setAttribute('aStrength', new THREE.BufferAttribute(strArr, 1))
    g.setAttribute('aVisible', new THREE.BufferAttribute(visArr, 1))
    return { geo: g, maxStrength: maxS }
  }, [arcs])
  // Dispose geometry anterior cuando deps cambian + cleanup en unmount
  useEffect(() => () => geo?.dispose(), [geo])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: ARC_VERTEX,
    fragmentShader: ARC_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0.7 },
      uBoost: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame(({ clock }) => {
    if (!mat) return
    mat.uniforms.uTime.value = clock.getElapsedTime()
    const p = easeOutCubic(progressRef.current[progressKey])
    mat.uniforms.uProgress.value = p
    mat.uniforms.uOpacity.value = p < 0.01 ? 0 : (collabHighlight ? 1.0 : (dimmed ? 0.015 : 0.7))
    // Smooth boost transition
    const targetBoost = collabHighlight ? 1.0 : 0.0
    mat.uniforms.uBoost.value += (targetBoost - mat.uniforms.uBoost.value) * 0.08

    // === Temporal visibility lerp ===
    if (geo) {
      const activeIds = activeNodeIdsRef?.current
      const nArcs = arcs.length
      if (!visRef.current || visRef.current.length !== nArcs) {
        visRef.current = new Float32Array(nArcs)
        const initIds = activeNodeIdsRef?.current
        for (let ai = 0; ai < nArcs; ai++) visRef.current[ai] = !initIds ? 1 : Math.min(initIds.get(arcs[ai].source) ?? 0, initIds.get(arcs[ai].target) ?? 0)
      }
      const visAttr = geo.attributes.aVisible
      let visChanged = false
      for (let ai = 0; ai < nArcs; ai++) {
        const vTarget = !activeIds ? 1 : Math.min(activeIds.get(arcs[ai].source) ?? 0, activeIds.get(arcs[ai].target) ?? 0)
        const diff = vTarget - visRef.current[ai]
        if (Math.abs(diff) > 0.005) {
          visRef.current[ai] += diff * 0.015
          visChanged = true
        } else if (visRef.current[ai] !== vTarget) {
          visRef.current[ai] = vTarget
          visChanged = true
        }
      }
      if (visChanged) {
        for (let ai = 0; ai < nArcs; ai++) {
          const v = visRef.current[ai]
          const base = ai * POINTS_PER_ARC
          for (let pi = 0; pi < POINTS_PER_ARC; pi++) visAttr.array[base + pi] = v
        }
        visAttr.needsUpdate = true
      }
    }
  })

  if (!geo || arcs.length === 0) return null
  return <points geometry={geo} material={mat} ref={ref} frustumCulled={false} />
}

// ============================================================================
// CANALES DE ENTRELAZAMIENTO - ondas sinusoidales entre entidades
// ============================================================================

// Shader para canales con intensidad variable por punto - TODO en GPU
// position = start del canal; aEnd, aPerp, aFraction, aStagger, aWaveAmp = atributos precalculados
// La onda sinusoidal que antes requería 1.33M iteraciones CPU/frame ahora corre en el vertex shader
const CHANNEL_VERTEX = `
  attribute vec3 aEnd;
  attribute vec3 aPerp;
  attribute float aFraction;
  attribute float aStagger;
  attribute float aWaveAmp;
  attribute float aIntensity;
  attribute float aVisible;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uDrawProgress;
  varying float vIntensity;
  varying float vDist;
  varying float vVisible;
  void main() {
    vIntensity = aIntensity;
    vVisible = aVisible;
    if (uOpacity < 0.001 || aVisible < 0.001) {
      gl_PointSize = 0.0;
      gl_Position = vec4(9999.0, 9999.0, 9999.0, 1.0);
      return;
    }
    float connP = clamp((uDrawProgress - aStagger * 0.5) / 0.6, 0.0, 1.0);
    vec3 dir = aEnd - position;
    float drawn = step(aFraction, connP);
    float actualProg = aFraction * connP;
    float wave = sin(actualProg * 3.14159265 * 3.0 + uTime * 3.0) * aWaveAmp * connP;
    vec3 drawnPos = position + dir * actualProg + aPerp * wave;
    vec3 tipPos = position + dir * connP;
    vec3 finalPos = mix(tipPos, drawnPos, drawn);
    vec4 mv = modelViewMatrix * vec4(finalPos, 1.0);
    float dist = -mv.z;
    vDist = dist;
    float basePx = mix(1.2, 3.0, aIntensity);
    float distScale = 200.0 / max(dist, 1.0);
    gl_PointSize = basePx * clamp(distScale, 0.2, 5.0);
    if (aVisible < 0.001) { gl_PointSize = 0.0; gl_Position = vec4(9999.0, 9999.0, 9999.0, 1.0); return; }
    gl_Position = projectionMatrix * mv;
  }
`
const CHANNEL_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vIntensity;
  varying float vDist;
  varying float vVisible;
  void main() {
    // Círculo suave
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float visFade = vVisible * vVisible;
    // Fade con distancia: de lejos los puntos se vuelven más tenues
    // evitando que la acumulación de overlap cree líneas gruesas
    float distFade = clamp(150.0 / max(vDist, 1.0), 0.15, 1.0);
    float alpha = (1.0 - d * d) * uOpacity * mix(0.25, 1.0, vIntensity) * distFade * visFade;
    gl_FragColor = vec4(uColor * mix(0.6, 1.8, vIntensity) * visFade, alpha);
  }
`

function EntanglementChannels({ connections, progressRef, progressKey, dimmed, highlightSet, starRepos, collabHighlight, activeNodeIdsRef }) {
  const ref = useRef()
  const lastHighlightRef = useRef(null)
  const lastDimmedRef = useRef(null)
  const lastCollabRef = useRef(null)
  const visRef = useRef(null)

  const POINTS_PER_CONN = 35

  // ===== useMemo: precalcular TODOS los atributos UNA sola vez =====
  // position = start, aEnd, aPerp, aFraction, aStagger, aWaveAmp → inmutables
  // aIntensity → se actualiza solo cuando cambia highlightSet (no cada frame)
  const { startArr, endArr, perpArr, fractionArr, staggerArr, waveAmpArr, intensityArr, count, connMeta, visArr } = useMemo(() => {
    const nConn = connections.length
    const total = nConn * POINTS_PER_CONN
    const starts = new Float32Array(total * 3)
    const ends = new Float32Array(total * 3)
    const perps = new Float32Array(total * 3)
    const fracs = new Float32Array(total)
    const stags = new Float32Array(total)
    const wamps = new Float32Array(total)
    const intens = new Float32Array(total)
    const meta = []

    let vIdx = 0, sIdx = 0

    for (let ci = 0; ci < nConn; ci++) {
      const conn = connections[ci]
      const sx = conn.start.x, sy = conn.start.y, sz = conn.start.z
      const ex = conn.end.x, ey = conn.end.y, ez = conn.end.z
      const isStar = starRepos ? starRepos.has(conn.target) : false
      meta.push({ sourceId: conn.source, targetId: conn.target, isStar })

      const dx = ex - sx, dy = ey - sy, dz = ez - sz
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const invLen = len > 0.001 ? 1 / len : 0
      const nx = dx * invLen, ny = dy * invLen, nz = dz * invLen

      let px = -nz, py = 0, pz = nx
      const pLen = Math.sqrt(px * px + py * py + pz * pz)
      if (pLen < 0.01) { px = 1; py = 0; pz = 0 }
      else { const pInv = 1 / pLen; px *= pInv; py *= pInv; pz *= pInv }

      const stagger = nConn > 1 ? ci / (nConn - 1) : 0
      const amp = Math.min(len * 0.04, 2.0)

      for (let i = 0; i < POINTS_PER_CONN; i++) {
        const frac = i / (POINTS_PER_CONN - 1)
        // position = start
        starts[vIdx] = sx; starts[vIdx + 1] = sy; starts[vIdx + 2] = sz
        ends[vIdx] = ex; ends[vIdx + 1] = ey; ends[vIdx + 2] = ez
        perps[vIdx] = px; perps[vIdx + 1] = py; perps[vIdx + 2] = pz
        vIdx += 3
        fracs[sIdx] = frac
        stags[sIdx] = stagger
        wamps[sIdx] = amp
        intens[sIdx] = isStar ? 1.0 : 0.3
        sIdx++
      }
    }

    return { startArr: starts, endArr: ends, perpArr: perps, fractionArr: fracs, staggerArr: stags, waveAmpArr: wamps, intensityArr: intens, count: total, connMeta: meta, visArr: new Float32Array(total).fill(1.0) }
  }, [connections, starRepos])

  // Material de shader personalizado - GPU calcula posiciones desde atributos + uniforms
  const shaderMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#00d4e4').multiplyScalar(1.5) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uDrawProgress: { value: 0 },
    },
    vertexShader: CHANNEL_VERTEX,
    fragmentShader: CHANNEL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  // useFrame: SOLO 3 uniform writes + intensidad condicional (vs 1.33M iters antes)
  useFrame(({ clock }) => {
    if (!ref.current || connections.length === 0) return
    const p = easeOutCubic(progressRef.current[progressKey])

    const baseOpacity = p < 0.01 ? 0 : (collabHighlight ? 0.03 : (dimmed ? (highlightSet ? 0.4 : 0.05) : 0.55))
    shaderMat.uniforms.uOpacity.value = baseOpacity
    shaderMat.uniforms.uTime.value = clock.getElapsedTime()
    shaderMat.uniforms.uDrawProgress.value = p

    if (p < 0.01) return

    // Actualizar intensidad SOLO cuando cambia el estado de highlight
    const hlChanged = highlightSet !== lastHighlightRef.current || dimmed !== lastDimmedRef.current || collabHighlight !== lastCollabRef.current
    if (hlChanged) {
      lastHighlightRef.current = highlightSet
      lastDimmedRef.current = dimmed
      lastCollabRef.current = collabHighlight

      const intAttr = ref.current.geometry.attributes.aIntensity
      const hasSel = highlightSet !== null
      const nConn = connections.length
      let idx = 0
      for (let ci = 0; ci < nConn; ci++) {
        const { sourceId, isStar } = connMeta[ci]
        let intensity
        if (hasSel) {
          const orgFocused = highlightSet.has(sourceId)
          intensity = orgFocused ? (isStar ? 1.0 : 0.65) : 0.04
        } else {
          intensity = isStar ? 1.0 : 0.3
        }
        for (let i = 0; i < POINTS_PER_CONN; i++) {
          intAttr.array[idx++] = intensity
        }
      }
      intAttr.needsUpdate = true
    }

    // === Temporal visibility lerp ===
    const activeIds = activeNodeIdsRef?.current
    const nConn = connections.length
    if (!visRef.current || visRef.current.length !== nConn) {
      visRef.current = new Float32Array(nConn)
      const initIds = activeNodeIdsRef?.current
      for (let ci = 0; ci < nConn; ci++) {
        const { sourceId, targetId } = connMeta[ci]
        visRef.current[ci] = !initIds ? 1 : Math.min(initIds.get(sourceId) ?? 0, initIds.get(targetId) ?? 0)
      }
    }
    const visAttr = ref.current.geometry.attributes.aVisible
    if (visAttr) {
      let visChanged = false
      for (let ci = 0; ci < nConn; ci++) {
        const { sourceId, targetId } = connMeta[ci]
        const vTarget = !activeIds ? 1 : Math.min(activeIds.get(sourceId) ?? 0, activeIds.get(targetId) ?? 0)
        const diff = vTarget - visRef.current[ci]
        if (Math.abs(diff) > 0.005) {
          visRef.current[ci] += diff * 0.015
          visChanged = true
        } else if (visRef.current[ci] !== vTarget) {
          visRef.current[ci] = vTarget
          visChanged = true
        }
      }
      if (visChanged) {
        for (let ci = 0; ci < nConn; ci++) {
          const v = visRef.current[ci]
          const base = ci * POINTS_PER_CONN
          for (let pi = 0; pi < POINTS_PER_CONN; pi++) visAttr.array[base + pi] = v
        }
        visAttr.needsUpdate = true
      }
    }
  })

  if (connections.length === 0) return null

  return (
    <points ref={ref} material={shaderMat} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={startArr} itemSize={3} count={count} />
        <bufferAttribute attach="attributes-aEnd" array={endArr} itemSize={3} count={count} />
        <bufferAttribute attach="attributes-aPerp" array={perpArr} itemSize={3} count={count} />
        <bufferAttribute attach="attributes-aFraction" array={fractionArr} itemSize={1} count={count} />
        <bufferAttribute attach="attributes-aStagger" array={staggerArr} itemSize={1} count={count} />
        <bufferAttribute attach="attributes-aWaveAmp" array={waveAmpArr} itemSize={1} count={count} />
        <bufferAttribute attach="attributes-aIntensity" array={intensityArr} itemSize={1} count={count} />
        <bufferAttribute attach="attributes-aVisible" array={visArr} itemSize={1} count={count} />
      </bufferGeometry>
    </points>
  )
}

// ============================================================================
// ENERGY RINGS - InstancedMesh (700 draw calls → 1, fix material.clone leak)
// ============================================================================

function EnergyRings({ orgNodes, positions, progressRef, progressKey, highlightSet, dimmed, activeNodeIdsRef }) {
  const meshRef = useRef()
  const visRef = useRef(null)
  const n = orgNodes.length
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.4, 0.6, 48), [])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  }), [])
  const tmpObj = useMemo(() => new THREE.Object3D(), [])
  const tmpColor = useMemo(() => new THREE.Color(), [])
  const baseColor = useMemo(() => new THREE.Color('#00f7ff').multiplyScalar(1.5), [])

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = clock.getElapsedTime()
    const p = easeOutCubic(progressRef.current[progressKey])
    const hasSel = highlightSet !== null

    // === Temporal visibility lerp ===
    if (!visRef.current || visRef.current.length !== n) {
      visRef.current = new Float32Array(n)
      const initIds = activeNodeIdsRef?.current
      for (let vi = 0; vi < n; vi++) visRef.current[vi] = !initIds ? 1 : (initIds.get(orgNodes[vi]?.id) ?? 0)
    }
    const activeIds = activeNodeIdsRef?.current
    for (let vi = 0; vi < n; vi++) {
      const vTarget = !activeIds ? 1 : (activeIds.get(orgNodes[vi]?.id) ?? 0)
      visRef.current[vi] += (vTarget - visRef.current[vi]) * 0.015
      if (Math.abs(vTarget - visRef.current[vi]) < 0.005) visRef.current[vi] = vTarget
    }

    for (let i = 0; i < n; i++) {
      const pos = positions[orgNodes[i].id]
      if (!pos) continue
      const vis = visRef.current[i]
      const visFade = vis * vis  // quadratic for smoother perceptual fade
      const phase = (t * 0.5 + i * 0.8) % 3
      const scale = (1 + phase * 6) * p
      const dim = (hasSel && !highlightSet.has(orgNodes[i]?.id) ? 0.02 : 1) * (dimmed && !hasSel ? 0.03 : 1)
      const fade = Math.max(0, 1 - phase / 3) * p * dim * visFade

      tmpObj.position.copy(pos)
      tmpObj.rotation.set(Math.PI / 2, 0, 0)
      tmpObj.scale.setScalar(fade < 0.001 ? 0 : scale)
      tmpObj.updateMatrix()
      meshRef.current.setMatrixAt(i, tmpObj.matrix)

      tmpColor.copy(baseColor).multiplyScalar(fade)
      meshRef.current.setColorAt(i, tmpColor)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true
  })

  if (n === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[ringGeo, ringMat, n]} frustumCulled={false} />
  )
}

// ============================================================================
// INTERFERENCE PATTERN - GPU shader (600 iter/frame → 0)
// ============================================================================

function InterferenceField({ progressRef, progressKey }) {
  const ref = useRef()
  const count = 600

  const { posArr, phaseArr } = useMemo(() => {
    const arr = new Float32Array(count * 3)
    const ph = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 500
      arr[i * 3 + 1] = (Math.random() - 0.5) * 300
      arr[i * 3 + 2] = -200
      ph[i] = Math.random() * Math.PI * 2
    }
    return { posArr: arr, phaseArr: ph }
  }, [])

  const shaderMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color('#2244ff').multiplyScalar(0.5) },
    },
    vertexShader: `
      attribute float aPhase;
      uniform float uTime;
      void main() {
        vec3 pos = position;
        pos.y += sin(uTime + aPhase) * 0.01 * uTime;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = 0.4 * (200.0 / max(-mv.z, 1.0));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(uColor, uOpacity * (1.0 - d * d));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame(({ clock }) => {
    const p = easeOutCubic(progressRef.current[progressKey])
    shaderMat.uniforms.uTime.value = clock.getElapsedTime()
    shaderMat.uniforms.uOpacity.value = 0.06 * p
  })

  return (
    <points ref={ref} material={shaderMat} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={posArr} itemSize={3} count={count} />
        <bufferAttribute attach="attributes-aPhase" array={phaseArr} itemSize={1} count={count} />
      </bufferGeometry>
    </points>
  )
}

// ============================================================================
// QUANTUM GENESIS - explosión inicial tipo Big Bang (enhanced)
// ============================================================================

function QuantumGenesis({ progressRef, progressKey }) {
  const flashRef = useRef()
  const wave1Ref = useRef()
  const wave2Ref = useRef()
  const wave3Ref = useRef()
  const innerGlowRef = useRef()
  const burstRef = useRef()

  // Pre-compute burst particle positions (radial explosion)
  const burstData = useMemo(() => {
    const count = 200
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0
      positions[i * 3 + 1] = 0
      positions[i * 3 + 2] = 0
      // Random direction, varying speed
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const speed = 30 + Math.random() * 120
      velocities[i * 3]     = Math.sin(phi) * Math.cos(theta) * speed
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed
      velocities[i * 3 + 2] = Math.cos(phi) * speed
      sizes[i] = 0.8 + Math.random() * 2.0
    }
    return { positions, velocities, sizes, count }
  }, [])

  useFrame((_, delta) => {
    const p = progressRef.current[progressKey]
    const done = p >= 1

    // Central flash sphere — bright, expanding fast, fading
    if (flashRef.current) {
      if (done || p < 0.001) {
        flashRef.current.visible = false
      } else {
        flashRef.current.visible = true
        const s = easeOutCubic(Math.min(p * 3, 1)) * 22
        flashRef.current.scale.setScalar(Math.max(s, 0.001))
        flashRef.current.material.opacity = Math.max(0, 1 - p * 1.5) * 0.90
      }
    }

    // Inner glow sphere — warm core that persists longer
    if (innerGlowRef.current) {
      if (done || p < 0.001) {
        innerGlowRef.current.visible = false
      } else {
        innerGlowRef.current.visible = true
        const s = easeOutCubic(Math.min(p * 2, 1)) * 8
        innerGlowRef.current.scale.setScalar(Math.max(s, 0.001))
        innerGlowRef.current.material.opacity = Math.max(0, 0.6 * (1 - p * 1.2))
      }
    }

    // Wave 1 — primary shockwave (fast, large)
    if (wave1Ref.current) {
      if (done || p < 0.001) {
        wave1Ref.current.visible = false
      } else {
        wave1Ref.current.visible = true
        const s = easeOutCubic(p) * 500
        wave1Ref.current.scale.setScalar(Math.max(s, 0.001))
        wave1Ref.current.material.opacity = Math.max(0, 0.25 * (1 - p))
      }
    }

    // Wave 2 — secondary shockwave (delayed, different shape)
    if (wave2Ref.current) {
      const wp = Math.max(0, (p - 0.1) / 0.9)
      if (done || wp <= 0) {
        wave2Ref.current.visible = false
      } else {
        wave2Ref.current.visible = true
        const s = easeOutCubic(wp) * 350
        wave2Ref.current.scale.setScalar(Math.max(s, 0.001))
        wave2Ref.current.material.opacity = Math.max(0, 0.18 * (1 - wp))
      }
    }

    // Wave 3 — tertiary ring (most delayed, slow)
    if (wave3Ref.current) {
      const wp = Math.max(0, (p - 0.25) / 0.75)
      if (done || wp <= 0) {
        wave3Ref.current.visible = false
      } else {
        wave3Ref.current.visible = true
        const s = easeOutCubic(wp) * 250
        wave3Ref.current.scale.setScalar(Math.max(s, 0.001))
        wave3Ref.current.material.opacity = Math.max(0, 0.15 * (1 - wp))
      }
    }

    // Particle burst — points exploding outward
    if (burstRef.current) {
      if (done || p < 0.001) {
        burstRef.current.visible = false
      } else {
        burstRef.current.visible = true
        const geo = burstRef.current.geometry
        const pos = geo.attributes.position
        const { velocities, count } = burstData
        const cappedDelta = Math.min(delta, 0.05)
        const drag = 0.97
        const fadeStart = 0.4
        for (let i = 0; i < count; i++) {
          if (p < 0.01) {
            pos.array[i * 3] = 0
            pos.array[i * 3 + 1] = 0
            pos.array[i * 3 + 2] = 0
          } else {
            const slowdown = Math.pow(drag, p * 60)
            pos.array[i * 3]     += velocities[i * 3]     * cappedDelta * slowdown
            pos.array[i * 3 + 1] += velocities[i * 3 + 1] * cappedDelta * slowdown
            pos.array[i * 3 + 2] += velocities[i * 3 + 2] * cappedDelta * slowdown
          }
        }
        pos.needsUpdate = true
        burstRef.current.material.opacity = p > fadeStart
          ? Math.max(0, 0.7 * (1 - (p - fadeStart) / (1 - fadeStart)))
          : Math.min(0.7, p * 10)
      }
    }
  })

  return (
    <group>
      {/* Central flash — bright white-cyan sphere */}
      <mesh ref={flashRef} visible={false}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#aaddff" toneMapped={false} transparent opacity={0} />
      </mesh>
      {/* Inner warm glow */}
      <mesh ref={innerGlowRef} visible={false}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial color="#00e5ff" toneMapped={false} transparent opacity={0} />
      </mesh>
      {/* Wave 1 — primary wireframe shockwave (icosahedron) */}
      <mesh ref={wave1Ref} visible={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00f7ff" wireframe transparent opacity={0} toneMapped={false} />
      </mesh>
      {/* Wave 2 — secondary shockwave (different geometry for variety) */}
      <mesh ref={wave2Ref} visible={false}>
        <octahedronGeometry args={[1, 1]} />
        <meshBasicMaterial color="#9D6FDB" wireframe transparent opacity={0} toneMapped={false} />
      </mesh>
      {/* Wave 3 — tertiary slow ring (smooth sphere wireframe) */}
      <mesh ref={wave3Ref} visible={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#00ff9f" wireframe transparent opacity={0} toneMapped={false} />
      </mesh>
      {/* Particle burst — points flying outward */}
      <points ref={burstRef} visible={false} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={burstData.positions.slice()} itemSize={3} count={burstData.count} />
        </bufferGeometry>
        <pointsMaterial color="#88ddff" size={1.5} transparent opacity={0} toneMapped={false} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  )
}

// ============================================================================
// TUNNELING PULSES - fotones viajando por canales de entrelazamiento
// ============================================================================

// Vector3 reutilizables para evitar allocations en useFrame (antes: 100 allocs/frame)
const _dir = new THREE.Vector3()
const _norm = new THREE.Vector3()
const _up = new THREE.Vector3()
const _perp = new THREE.Vector3()

function TunnelingPulses({ connections, startAnimation, dimmed, activeNodeIdsRef }) {
  const ref = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const PULSE_COUNT = Math.min(connections.length, 25)
  const animTimer = useRef(0) // tiempo acumulado desde startAnimation
  const DELAY_BEFORE_VISIBLE = 7.0 // esperar a que entanglement (6.5s) haya empezado

  const pulseData = useMemo(() =>
    Array.from({ length: PULSE_COUNT }, (_, i) => ({
      connIdx: i % connections.length,
      t: Math.random(),
      speed: 0.15 + Math.random() * 0.12,
    }))
  , [connections.length, PULSE_COUNT])

  const geo = useMemo(() => new THREE.SphereGeometry(0.18, 6, 6), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#aaddff').multiplyScalar(4),
    toneMapped: false, transparent: true, opacity: 0,
  }), [])
  const fadeRef = useRef(0) // opacity fade-in tracker

  useFrame((_, delta) => {
    if (!ref.current || connections.length === 0) return
    // No animar hasta que la animación principal empiece
    if (!startAnimation) {
      mat.opacity = 0
      fadeRef.current = 0
      animTimer.current = 0
      return
    }
    // Esperar a que las fases principales terminen antes de mostrar pulsos
    animTimer.current += delta
    if (animTimer.current < DELAY_BEFORE_VISIBLE) {
      mat.opacity = 0
      fadeRef.current = 0
      return
    }
    // Fade-in gradual (empieza DESPUÉS del delay)
    fadeRef.current = Math.min(fadeRef.current + delta * 0.5, 0.9)
    mat.opacity = fadeRef.current * (dimmed ? 0.04 : 1)

    pulseData.forEach((pulse, i) => {
      pulse.t += pulse.speed * delta
      if (pulse.t >= 1) {
        pulse.t -= 1
        pulse.connIdx = (pulse.connIdx + 1 + Math.floor(Math.random() * 3)) % connections.length
      }
      const conn = connections[pulse.connIdx]
      if (!conn) return
      // --- Temporal visibility: hide pulse if connection endpoints are invisible ---
      const activeIds = activeNodeIdsRef?.current
      if (activeIds) {
        const vis = Math.min(activeIds.get(conn.source) ?? 0, activeIds.get(conn.target) ?? 0)
        if (vis < 0.01) {
          dummy.scale.setScalar(0.001)
          dummy.updateMatrix()
          ref.current.setMatrixAt(i, dummy.matrix)
          return
        }
      }
      const { start, end } = conn
      _dir.subVectors(end, start)
      const len = _dir.length()
      _norm.copy(_dir).normalize()
      _up.set(0, 1, 0)
      _perp.crossVectors(_norm, _up).normalize()
      if (_perp.length() < 0.01) _perp.set(1, 0, 0)
      const t = pulse.t
      const wave = Math.sin(t * Math.PI * 3) * Math.min(len * 0.04, 2.0)
      dummy.position.set(
        start.x + _dir.x * t + _perp.x * wave,
        start.y + _dir.y * t + _perp.y * wave,
        start.z + _dir.z * t + _perp.z * wave,
      )
      const edgeFade = Math.sin(t * Math.PI)
      dummy.scale.setScalar(0.3 + edgeFade * 0.8)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })

  if (connections.length === 0) return null
  return <instancedMesh ref={ref} args={[geo, mat, PULSE_COUNT]} />
}

// ============================================================================
// DECOHERENCE SHOCKWAVES - ondas de decoherencia desde procesadores
// ============================================================================

function DecoherenceWaves({ orgNodes, positions, startAnimation, dimmed, activeNodeIdsRef }) {
  const MAX_WAVES = 3
  const wavesRef = useRef([])
  const waveState = useRef(
    Array.from({ length: MAX_WAVES }, () => ({ active: false, pos: new THREE.Vector3(), age: 0, orgId: null }))
  )
  const nextWave = useRef(4 + Math.random() * 4)

  const ringGeo = useMemo(() => new THREE.RingGeometry(0.9, 1, 64), [])
  const waveMats = useMemo(() =>
    Array.from({ length: MAX_WAVES }, () => new THREE.MeshBasicMaterial({
      color: '#00f7ff', transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false,
    }))
  , [])

  useFrame(({ clock }, delta) => {
    if (orgNodes.length === 0 || !startAnimation) return
    const t = clock.getElapsedTime()
    nextWave.current -= delta
    if (nextWave.current <= 0) {
      nextWave.current = 8 + Math.random() * 6
      const slot = waveState.current.find(w => !w.active)
      if (slot) {
        const orgIdx = Math.floor(Math.random() * orgNodes.length)
        const org = orgNodes[orgIdx]
        // --- Temporal visibility: skip spawning wave for invisible orgs ---
        const activeIds = activeNodeIdsRef?.current
        if (activeIds && (activeIds.get(org.id) ?? 0) < 0.01) { /* skip */ }
        else {
          const pos = positions[org.id]
          if (pos) { slot.active = true; slot.pos.copy(pos); slot.age = 0; slot.orgId = org.id }
        }
      }
    }
    waveState.current.forEach((wave, i) => {
      const mesh = wavesRef.current[i]
      if (!mesh) return
      if (!wave.active) { mesh.scale.setScalar(0.001); return }
      // --- Temporal visibility: hide wave if its org became invisible ---
      const activeIds2 = activeNodeIdsRef?.current
      if (activeIds2 && wave.orgId && (activeIds2.get(wave.orgId) ?? 0) < 0.01) {
        wave.active = false; mesh.scale.setScalar(0.001); return
      }
      wave.age += delta
      const duration = 3.5
      if (wave.age >= duration) { wave.active = false; mesh.scale.setScalar(0.001); return }
      const p = wave.age / duration
      mesh.position.copy(wave.pos)
      mesh.scale.setScalar(easeOutCubic(p) * 90)
      waveMats[i].opacity = 0.3 * Math.pow(1 - p, 2) * (dimmed ? 0.04 : 1)
      mesh.rotation.x = Math.PI / 2
      mesh.rotation.z = t * 0.08
    })
  })

  return (
    <>
      {Array.from({ length: MAX_WAVES }, (_, i) => (
        <mesh key={i} ref={el => wavesRef.current[i] = el} geometry={ringGeo} material={waveMats[i]} />
      ))}
    </>
  )
}

// ============================================================================
// HAWKING RADIATION - GPU shader (12.6K iter/frame → 0)
// ============================================================================

const HAWKING_VERTEX = `
  attribute float aTheta;
  attribute float aPhi;
  attribute float aSpeed;
  attribute float aOffset;
  attribute float aMaxR;
  attribute float aVisible;
  uniform float uTime;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    if (uOpacity < 0.001 || aVisible < 0.001) {
      gl_PointSize = 0.0;
      gl_Position = vec4(9999.0, 9999.0, 9999.0, 1.0);
      return;
    }
    float r = mod(uTime * aSpeed + aOffset, aMaxR);
    vec3 dir = vec3(sin(aPhi) * cos(aTheta), cos(aPhi), sin(aPhi) * sin(aTheta));
    vec3 finalPos = position + dir * r;
    vec4 mv = modelViewMatrix * vec4(finalPos, 1.0);
    float dist = -mv.z;
    gl_PointSize = 0.35 * (200.0 / max(dist, 1.0));
    gl_Position = projectionMatrix * mv;
    float visFade = aVisible * aVisible;
    vAlpha = uOpacity * visFade;
  }
`
const HAWKING_FRAGMENT = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float glow = exp(-d * d * 3.0);
    if (glow < 0.01) discard;
    gl_FragColor = vec4(uColor * glow, vAlpha * glow);
  }
`

function HawkingRadiation({ orgNodes, positions, startAnimation, dimmed, activeNodeIdsRef }) {
  const ref = useRef()
  const PER_ORG = 18
  const animTimer = useRef(0)
  const opacityRef = useRef(0)
  const visRef = useRef(null)
  const DELAY_BEFORE_VISIBLE = 4.0

  const { centerArr, thetaArr, phiArr, speedArr, offsetArr, maxRArr, total } = useMemo(() => {
    const n = orgNodes.length * PER_ORG
    const centers = new Float32Array(n * 3)
    const thetas = new Float32Array(n)
    const phis = new Float32Array(n)
    const speeds = new Float32Array(n)
    const offsets = new Float32Array(n)
    const maxRs = new Float32Array(n)
    let vIdx = 0, sIdx = 0
    orgNodes.forEach(org => {
      const c = positions[org.id]; if (!c) return
      for (let i = 0; i < PER_ORG; i++) {
        centers[vIdx] = c.x; centers[vIdx + 1] = c.y; centers[vIdx + 2] = c.z
        vIdx += 3
        thetas[sIdx] = Math.random() * Math.PI * 2
        phis[sIdx] = Math.acos(2 * Math.random() - 1)
        speeds[sIdx] = 0.3 + Math.random() * 0.5
        offsets[sIdx] = Math.random() * 12
        maxRs[sIdx] = 14 + Math.random() * 10
        sIdx++
      }
    })
    return { centerArr: centers, thetaArr: thetas, phiArr: phis, speedArr: speeds, offsetArr: offsets, maxRArr: maxRs, total: sIdx }
  }, [orgNodes, positions])

  const visibleArr = useMemo(() => new Float32Array(orgNodes.length * PER_ORG).fill(1), [orgNodes, PER_ORG])

  const shaderMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#00f7ff').multiplyScalar(2.0) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: HAWKING_VERTEX,
    fragmentShader: HAWKING_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame(({ clock }, dt) => {
    if (!ref.current || total === 0) return
    if (!startAnimation) { opacityRef.current = 0; animTimer.current = 0; shaderMat.uniforms.uOpacity.value = 0; return }
    animTimer.current += dt
    if (animTimer.current < DELAY_BEFORE_VISIBLE) { shaderMat.uniforms.uOpacity.value = 0; return }
    const target = dimmed ? 0.03 : 0.7
    opacityRef.current = Math.min(opacityRef.current + dt * 0.4, target)
    if (dimmed && opacityRef.current > target) opacityRef.current = Math.max(opacityRef.current - dt * 0.8, target)
    shaderMat.uniforms.uOpacity.value = opacityRef.current
    shaderMat.uniforms.uTime.value = clock.getElapsedTime()

    // === Temporal visibility per org radiation ===
    const geo = ref.current?.geometry
    if (geo) {
      const visAttr = geo.attributes.aVisible
      if (visAttr) {
        const activeIds = activeNodeIdsRef?.current
        const n = orgNodes.length
        if (!visRef.current || visRef.current.length !== n) {
          visRef.current = new Float32Array(n)
          const initIds = activeNodeIdsRef?.current
          for (let oi = 0; oi < n; oi++) visRef.current[oi] = !initIds ? 1 : (initIds.get(orgNodes[oi]?.id) ?? 0)
        }
        let changed = false
        for (let oi = 0; oi < n; oi++) {
          const vTarget = !activeIds ? 1 : (activeIds.get(orgNodes[oi]?.id) ?? 0)
          visRef.current[oi] += (vTarget - visRef.current[oi]) * 0.015
          if (Math.abs(vTarget - visRef.current[oi]) < 0.005) visRef.current[oi] = vTarget
        }
        for (let oi = 0; oi < n; oi++) {
          const v = visRef.current[oi]
          const base = oi * PER_ORG
          for (let pi = 0; pi < PER_ORG; pi++) {
            if (visAttr.array[base + pi] !== v) { visAttr.array[base + pi] = v; changed = true }
          }
        }
        if (changed) visAttr.needsUpdate = true
      }
    }
  })

  if (total === 0) return null

  return (
    <points ref={ref} material={shaderMat} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={centerArr} itemSize={3} count={total} />
        <bufferAttribute attach="attributes-aTheta" array={thetaArr} itemSize={1} count={total} />
        <bufferAttribute attach="attributes-aPhi" array={phiArr} itemSize={1} count={total} />
        <bufferAttribute attach="attributes-aSpeed" array={speedArr} itemSize={1} count={total} />
        <bufferAttribute attach="attributes-aOffset" array={offsetArr} itemSize={1} count={total} />
        <bufferAttribute attach="attributes-aMaxR" array={maxRArr} itemSize={1} count={total} />
        <bufferAttribute attach="attributes-aVisible" array={visibleArr} itemSize={1} count={total} />
      </bufferGeometry>
    </points>
  )
}

// ============================================================================
// CAMERA RIG
// ============================================================================

function CameraRig({ focusTarget, resetTrigger, selectedEntity, tourCameraRef }) {
  const controlsRef = useRef()
  const { camera, gl } = useThree()
  const target = useRef(new THREE.Vector3(0, 0, 0))
  const goal = useRef(new THREE.Vector3(0, 80, 260))
  const flying = useRef(false)

  useEffect(() => {
    if (focusTarget) {
      // Soporte para focus panorámico (tunnel path): { position, offset }
      if (focusTarget.position && focusTarget.offset) {
        target.current.set(focusTarget.position.x, focusTarget.position.y, focusTarget.position.z)
        goal.current.set(focusTarget.position.x, focusTarget.position.y, focusTarget.position.z)
          .add(focusTarget.offset)
        flying.current = true
      } else {
        target.current.copy(focusTarget)
        let offset
        if (selectedEntity?.type === 'user') offset = new THREE.Vector3(4, 2.5, 4)
        else if (selectedEntity?.type === 'repo') offset = new THREE.Vector3(10, 6, 10)
        else offset = new THREE.Vector3(18, 10, 18)
        goal.current.copy(focusTarget).add(offset)
        flying.current = true
      }
    }
  }, [focusTarget, selectedEntity])

  useEffect(() => {
    target.current.set(0, 0, 0)
    goal.current.set(0, 80, 260)
    flying.current = true
  }, [resetTrigger])

  //  Cancelar fly-to cuando el usuario arrastra (rotación / pan) 
  useEffect(() => {
    const canvas = gl.domElement
    const cancelFly = () => { flying.current = false }
    canvas.addEventListener('pointerdown', cancelFly)
    return () => canvas.removeEventListener('pointerdown', cancelFly)
  }, [gl])

  //  Zoom libre: comportamiento depende de si hay entidad seleccionada 
  // Sin selección: cámara + target viajan JUNTOS (navegación libre por el universo)
  // Con selección: solo la cámara se acerca/aleja del target fijo (zoom orbital)
  const selectedRef = useRef(selectedEntity)
  selectedRef.current = selectedEntity

  useEffect(() => {
    const canvas = gl.domElement
    const mouse = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()

    const handleWheel = (e) => {
      if (!controlsRef.current) return
      e.preventDefault()

      // Cancelar cualquier fly-to activo
      flying.current = false

      const currentTarget = controlsRef.current.target
      const dist = camera.position.distanceTo(currentTarget)
      const zoomIn = e.deltaY < 0
      const speed = Math.max(dist * 0.12, 3)
      const delta = zoomIn ? speed : -speed

      if (selectedRef.current) {
        // ★ Con entidad seleccionada: zoom orbital puro
        //   La cámara se acerca/aleja del target (que permanece fijo en la entidad)
        const dir = camera.position.clone().sub(currentTarget).normalize()
        camera.position.addScaledVector(dir, -delta)
      } else {
        // ★ Sin selección: navegación libre
        //   AMBOS, cámara Y target, viajan juntos por el universo
        const rect = canvas.getBoundingClientRect()
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouse, camera)
        const direction = raycaster.ray.direction.clone()
        camera.position.addScaledVector(direction, delta)
        currentTarget.addScaledVector(direction, delta)
      }

      controlsRef.current.update()
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [camera, gl])

  useFrame((_, delta) => {
    if (!controlsRef.current) return
    // Tour cinemático: interpolación lenta y dramática
    const tc = tourCameraRef?.current
    if (tc?.active) {
      const t = 1 - Math.exp(-1.6 * delta) // más lento que fly-to normal → cinemático
      camera.position.lerp(tc.position, t)
      controlsRef.current.target.lerp(tc.target, t)
      controlsRef.current.update()
      return
    }
    if (!flying.current) return
    // Damping exponencial independiente del frame rate:
    // a 60fps → t≈0.072, a 30fps → t≈0.139 (compensa frames largos automáticamente)
    const t = 1 - Math.exp(-4.5 * delta)
    controlsRef.current.target.lerp(target.current, t)
    camera.position.lerp(goal.current, t)
    controlsRef.current.update()
    if (camera.position.distanceTo(goal.current) < 0.5) flying.current = false
  })

  const tourActive = tourCameraRef?.current?.active
  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      enableZoom={false}
      enablePan={!selectedEntity && !tourActive}
      enableRotate={!tourActive}
      panSpeed={1.2}
      rotateSpeed={0.6}
      minDistance={0.5}
      maxDistance={6000}
    />
  )
}

// ============================================================================
// VIEWPORT LABELS - labels automáticos para entidades visibles al rotar con foco
// ============================================================================

const _projVec = new THREE.Vector3()
const AUTO_LABEL_COLORS = { org: '#00f7ff', repo: '#bd00ff', user: '#00ff9f' }
const AUTO_LABEL_ICONS = { org: '◈', repo: '⬡', user: '●' }

function ViewportLabels({ universeData, selectedEntity }) {
  const { camera } = useThree()
  const [visibleEntities, setVisibleEntities] = useState([])
  const lastUpdateRef = useRef(0)

  // Recopilar entidades relacionadas (las del highlightSet) UNA vez al cambiar selección
  const relatedEntities = useMemo(() => {
    if (!selectedEntity || !universeData) return []
    const { orgNodes, repoNodes, userNodes, orgRepos, repoUsers, positions } = universeData
    const entities = []
    const highlightIds = computeRelatedIds(selectedEntity, universeData)
    if (!highlightIds) return []

    // Excluir la propia entidad seleccionada (ya tiene FocusHighlight)
    const selId = selectedEntity.id

    for (const node of orgNodes) {
      if (node.id !== selId && highlightIds.has(node.id) && positions[node.id])
        entities.push({ id: node.id, type: 'org', name: node.name || node.login || node.id, pos: positions[node.id] })
    }
    for (const node of repoNodes) {
      if (node.id !== selId && highlightIds.has(node.id) && positions[node.id])
        entities.push({ id: node.id, type: 'repo', name: node.name || node.full_name || node.id, stars: node.stars, pos: positions[node.id] })
    }
    for (const node of userNodes) {
      if (node.id !== selId && highlightIds.has(node.id) && positions[node.id])
        entities.push({ id: node.id, type: 'user', name: node.login || node.id, isBridge: node.isBridge, pos: positions[node.id] })
    }
    return entities
  }, [selectedEntity, universeData])

  // Actualizar las entidades visibles periódicamente (cada ~250ms, no cada frame)
  useFrame(() => {
    const now = performance.now()
    if (now - lastUpdateRef.current < 250) return
    lastUpdateRef.current = now
    if (relatedEntities.length === 0) { setVisibleEntities([]); return }

    const visible = []
    const hw = window.innerWidth / 2
    const hh = window.innerHeight / 2

    for (let i = 0; i < relatedEntities.length; i++) {
      const ent = relatedEntities[i]
      _projVec.set(ent.pos.x, ent.pos.y, ent.pos.z)
      _projVec.project(camera)

      // Filtrar: dentro del viewport (con margen) y delante de la cámara
      if (_projVec.z > 1 || _projVec.z < -1) continue
      if (_projVec.x < -0.9 || _projVec.x > 0.9 || _projVec.y < -0.85 || _projVec.y > 0.85) continue

      // Distancia a la cámara para ordenar (más cerca = más prioridad)
      const dist = camera.position.distanceTo(ent.pos)

      // Coordenadas de pantalla para detección de overlap
      const sx = (1 + _projVec.x) * hw
      const sy = (1 - _projVec.y) * hh

      visible.push({ ...ent, screenDist: dist, sx, sy, ndc: { x: _projVec.x, y: _projVec.y, z: _projVec.z } })
    }

    // Ordenar: orgs primero, luego repos, luego users; dentro de cada tipo, por cercanía
    visible.sort((a, b) => {
      const typeOrder = { org: 0, repo: 1, user: 2 }
      const td = (typeOrder[a.type] || 3) - (typeOrder[b.type] || 3)
      if (td !== 0) return td
      return a.screenDist - b.screenDist
    })

    // Limitar cantidad y eliminar overlaps (distancia mínima en pantalla entre labels)
    const MAX_LABELS = 8
    const MIN_SCREEN_DIST = 70 // px mínimos entre labels
    const filtered = []
    for (const ent of visible) {
      if (filtered.length >= MAX_LABELS) break
      const overlaps = filtered.some(f => {
        const dx = f.sx - ent.sx, dy = f.sy - ent.sy
        return dx * dx + dy * dy < MIN_SCREEN_DIST * MIN_SCREEN_DIST
      })
      if (!overlaps) filtered.push(ent)
    }

    setVisibleEntities(filtered)
  })

  if (visibleEntities.length === 0) return null

  return (
    <group>
      {visibleEntities.map(ent => (
        <Html key={ent.id} position={[ent.pos.x, ent.pos.y, ent.pos.z]} center
          style={{ pointerEvents: 'none', transition: 'opacity 0.2s ease' }}
          zIndexRange={[0, 0]}
        >
          <div className={styles.autoLabel}>
            <span className={styles.autoLabelIcon} style={{ color: AUTO_LABEL_COLORS[ent.type] }}>
              {AUTO_LABEL_ICONS[ent.type]}
            </span>
            <span className={styles.autoLabelName}>{ent.name}</span>
            {ent.type === 'repo' && ent.stars > 0 && (
              <span className={styles.autoLabelStars}>⭐{ent.stars}</span>
            )}
            {ent.isBridge && <span className={styles.autoLabelBridge}>⚛</span>}
          </div>
        </Html>
      ))}
    </group>
  )
}

// ============================================================================
// LABEL FLOTANTE - estilo cuántico
// ============================================================================

function FloatingLabel({ entity, position }) {
  const [phase, setPhase] = useState('hidden') // hidden | show | exit
  const dataRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (entity && position) {
      clearTimeout(timerRef.current)
      dataRef.current = { entity, position }
      setPhase('show')
    } else if (dataRef.current) {
      setPhase('exit')
      timerRef.current = setTimeout(() => setPhase('hidden'), 160)
    }
    return () => clearTimeout(timerRef.current)
  }, [entity, position])

  if (phase === 'hidden' || !dataRef.current) return null

  const { entity: ent, position: pos } = dataRef.current
  const name = ent.name || ent.login || ent.full_name || ent.id
  const typeMap = { org: 'Organización (Procesador)', repo: 'Repositorio (Qubit)', user: 'Usuario (Partícula)' }
  const colorMap = { org: '#00f7ff', repo: '#bd00ff', user: '#00ff9f' }

  // Offset Y en unidades 3D para posicionar el label ENCIMA de la entidad
  // Org: hitbox r=6, torus R=4 → necesita ~7; Repo: hitbox r=2.5 → ~3.5; User: sprite → ~2
  const yOffset = ent.type === 'org' ? 7 : ent.type === 'repo' ? 3.5 : 2
  const offsetPos = [pos.x ?? pos[0] ?? 0, (pos.y ?? pos[1] ?? 0) + yOffset, pos.z ?? pos[2] ?? 0]

  return (
    <Html position={offsetPos} center={false} style={{ pointerEvents: 'none', transform: 'translate(-50%, -100%)' }}>
      <div className={`${styles.label3d} ${phase === 'show' ? styles.label3dEnter : styles.label3dExit}`}>
        <span className={styles.label3dType} style={{ color: colorMap[ent.type] }}>
          {typeMap[ent.type] || ''}
        </span>
        <span className={styles.label3dName}>{name}</span>
        {ent.stars > 0 && <span className={styles.label3dMeta}>⭐ {ent.stars}</span>}
        {ent.isBridge && (
          <span className={styles.label3dBridge}>⚛ Bridge User · {ent.repos_count} repos</span>
        )}
      </div>
    </Html>
  )
}

// ============================================================================
// FOCUS HIGHLIGHT - anillos de selección rotando
// ============================================================================

function FocusHighlight({ position, entityType }) {
  const groupRef = useRef()
  const color = entityType === 'org' ? '#00f7ff' : entityType === 'repo' ? '#bd00ff'
    : entityType === 'user' ? (/* bridge check in parent */ '#00ff9f') : '#00ff9f'
  const baseSize = entityType === 'org' ? 5.5 : entityType === 'repo' ? 2.8 : 1.6

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()
    groupRef.current.rotation.y = t * 0.6
    groupRef.current.rotation.x = Math.sin(t * 0.4) * 0.3
    groupRef.current.rotation.z = Math.cos(t * 0.25) * 0.15
    const pulse = 1 + Math.sin(t * 2.5) * 0.08
    groupRef.current.scale.setScalar(pulse)
  })

  return (
    <group ref={groupRef} position={position}>
      {/* Anillo principal horizontal */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[baseSize, baseSize * 0.04, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>
      {/* Anillo vertical perpendicular */}
      <mesh>
        <torusGeometry args={[baseSize * 0.85, baseSize * 0.03, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
      {/* Anillo inclinado */}
      <mesh rotation={[Math.PI / 3, Math.PI / 5, 0]}>
        <torusGeometry args={[baseSize * 0.95, baseSize * 0.025, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} />
      </mesh>
      {/* Punto central brillante */}
      <mesh>
        <sphereGeometry args={[baseSize * 0.08, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

// ============================================================================
// BUILD ANIMATION - progreso continuo por fase con easing
// ============================================================================

// Ease-out cubic para transiciones suaves
function easeOutCubic(t) { return 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3) }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 }
function easeOutElastic(t) {
  const c4 = (2 * Math.PI) / 3
  if (t <= 0) return 0
  if (t >= 1) return 1
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

// Fase timings: [inicio, duración] en segundos
// La explosión (genesis) va PRIMERO y sola - luego el resto emerge secuencialmente
const PHASE_TIMINGS = {
  genesis:      [0.0,  2.0],  // flash + onda expansiva (SOLO al inicio)
  vacuum:       [2.5,  2.0],  // lattice + fluctuaciones - emerge CON los procesadores, no antes
  processors:   [2.8,  1.8],  // orgs aparecen escalonadas
  qubits:       [4.0,  2.0],  // repos materializan
  particles:    [5.5,  1.5],  // users orbitan
  entanglement: [6.5,  1.8],  // conexiones se dibujan
}

function BuildDirector({ progressRef, startAnimation }) {
  const accumulated = useRef(0)

  useFrame((_, delta) => {
    const bp = progressRef.current
    if (!startAnimation) {
      accumulated.current = 0
      bp.genesis = 0; bp.vacuum = 0; bp.processors = 0
      bp.qubits = 0; bp.particles = 0; bp.entanglement = 0
      return
    }

    // Delta ya viene de R3F, capear a 50ms para prevenir saltos
    const cappedDelta = Math.min(delta, 0.05)
    accumulated.current += cappedDelta
    const elapsed = accumulated.current

    for (const [key, [start, dur]] of Object.entries(PHASE_TIMINGS)) {
      bp[key] = Math.min(Math.max((elapsed - start) / dur, 0), 1)
    }
  })

  return null
}

// ============================================================================
// LOD CONTROLLER - ajusta detalle por distancia de cámara
// ============================================================================
// lod: { level: 'far'|'mid'|'near', dist: number }
// far  (>400u): solo orgs + repos (clusters)
// mid  (120-400u): + bridge users + bonds
// near (<120u): todo - users individuales + bonds + effects

function useLOD() {
  const lodRef = useRef({ level: 'near', dist: 260 })
  const { camera } = useThree()

  useFrame(() => {
    const d = camera.position.length()
    let newLevel
    if (d > 400) newLevel = 'far'
    else if (d > 120) newLevel = 'mid'
    else newLevel = 'near'
    if (newLevel !== lodRef.current.level) lodRef.current = { level: newLevel, dist: d }
  })

  return lodRef
}

// ============================================================================
// FRONTERAS ZONALES - esferas wireframe para visualizar core/mid/isolated
// ============================================================================

const ZONE_CONFIGS = [
  { key: 'core',     color: '#00ff9f', label: 'Core',     radiusKey: 'coreRadius',    countKey: 'coreCount' },
  { key: 'mid',      color: '#4488ff', label: 'Mid',      radiusKey: 'peripheryMin',  countKey: 'midCount' },
  { key: 'isolated', color: '#aa44ff', label: 'Isolated', radiusKey: 'peripheryMax',  countKey: 'isolatedCount' },
]

function ZoneBoundary({ radius, color, label, count, visible }) {
  const groupRef = useRef()
  const meshRef = useRef()
  const wireRef = useRef()
  const labelRef = useRef()
  const blendRef = useRef(0) // 0=hidden, 1=fully visible
  // Memoizar wireframe geometry para evitar recrearla en cada render
  const wireGeo = useMemo(() => new THREE.SphereGeometry(radius, 24, 16), [radius])
  useEffect(() => () => wireGeo?.dispose(), [wireGeo])

  useFrame((_, delta) => {
    // Smooth blend hacia target (visible ? 1 : 0)
    const target = visible ? 1.0 : 0.0
    const speed = 1.8 // ~0.55s para transición completa
    blendRef.current += (target - blendRef.current) * Math.min(delta * speed, 0.12)
    // Snap a 0/1 cuando está muy cerca
    if (Math.abs(blendRef.current - target) < 0.005) blendRef.current = target

    const b = blendRef.current
    if (meshRef.current) meshRef.current.material.opacity = b * 0.07
    if (wireRef.current) wireRef.current.material.opacity = b * 0.18
    // Label opacity via CSS
    if (labelRef.current) labelRef.current.style.opacity = b
    // Rotación lenta para dar profundidad visual
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.03
      groupRef.current.rotation.x += delta * 0.01
    }
    // Scale: 0.85 → 1.0 durante la aparición
    if (groupRef.current) {
      const s = 0.85 + b * 0.15
      groupRef.current.scale.setScalar(s)
    }
  })

  return (
    <group ref={groupRef}>
      {/* Esfera sólida semi-transparente */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 48, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
      {/* Wireframe superpuesto */}
      <lineSegments ref={wireRef}>
        <wireframeGeometry args={[wireGeo]} />
        <lineBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
      </lineSegments>
      {/* Label flotante en la parte superior */}
      <Html
        position={[0, radius * 0.92, 0]}
        center
        style={{
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        <div ref={labelRef} style={{
          background: 'rgba(0,0,0,0.65)',
          border: `1px solid ${color}40`,
          borderRadius: 8,
          padding: '3px 10px',
          color: color,
          fontSize: 11,
          fontFamily: 'monospace',
          letterSpacing: 1,
          textTransform: 'uppercase',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: 0,
          transition: 'none',
        }}>
          <span style={{ opacity: 0.6 }}>◈</span>
          {label}
          <span style={{ opacity: 0.5, fontSize: 10 }}>({count} orgs)</span>
        </div>
      </Html>
    </group>
  )
}

function ZoneBoundaries({ zoneMeta, visible }) {
  return (
    <group>
      {ZONE_CONFIGS.map(({ key, color, label, radiusKey, countKey }) => (
        <ZoneBoundary
          key={key}
          radius={zoneMeta[radiusKey]}
          color={color}
          label={label}
          count={zoneMeta[countKey]}
          visible={visible}
        />
      ))}
    </group>
  )
}

// ============================================================================
// QUANTUM TUNNEL BEAM - Visualización 3D del camino más corto (Quantum Tunneling)
// ============================================================================
// Rayo de energía curvado + fotones viajando + halos en nodos intermedios

const _tunnelDummy = new THREE.Object3D()
// Colores pre-allocados para evitar crear objetos en useFrame (GC pressure)
const _haloColorA = new THREE.Color('#00f7ff')
const _haloColorB = new THREE.Color('#00ff9f')
const _haloColorC = new THREE.Color('#bd00ff')
const _haloResult = new THREE.Color()

function QuantumTunnelBeam({ tunnelPath, positions }) {
  const tubeRef = useRef()
  const glowRef = useRef()
  const halosRef = useRef()
  const fadeRef = useRef(0)
  const progressRef = useRef(0)  // draw-on progress 0→1
  const prevPathId = useRef(null) // para detectar nuevo path
  const HALO_GLOW_SPEED = 1.2
  const DRAW_DURATION = 1.6 // segundos para dibujar el rayo completo

  // Construir la curva CatmullRom a partir de las posiciones del path
  const { curve, pathPoints, totalLength } = useMemo(() => {
    if (!tunnelPath?.found || !tunnelPath.path || tunnelPath.path.length < 2) {
      return { curve: null, pathPoints: [], totalLength: 0 }
    }
    const pts = []
    for (const node of tunnelPath.path) {
      const pos = positions[node.id]
      if (pos) pts.push(new THREE.Vector3(pos.x, pos.y, pos.z))
    }
    if (pts.length < 2) return { curve: null, pathPoints: [], totalLength: 0 }

    const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3)
    return { curve: c, pathPoints: pts, totalLength: c.getLength() }
  }, [tunnelPath, positions])

  // Geometría del tubo principal
  const tubeGeo = useMemo(() => {
    if (!curve) return null
    const segments = Math.max(64, Math.floor(totalLength * 2))
    return new THREE.TubeGeometry(curve, segments, 0.4, 10, false)
  }, [curve, totalLength])
  // Dispose geometry anterior cuando cambia el tunnel path
  useEffect(() => () => tubeGeo?.dispose(), [tubeGeo])

  // Geometría del tubo glow exterior (más grueso)
  const glowGeo = useMemo(() => {
    if (!curve) return null
    const segments = Math.max(48, Math.floor(totalLength * 1.5))
    return new THREE.TubeGeometry(curve, segments, 1.2, 10, false)
  }, [curve, totalLength])
  // Dispose geometry anterior cuando cambia el tunnel path
  useEffect(() => () => glowGeo?.dispose(), [glowGeo])

  // Shader fragment compartido: degradado animado cyan ↔ verde ↔ morado + draw-on
  const TUNNEL_FRAG = `
    uniform float uTime;
    uniform float uOpacity;
    uniform float uProgress;
    uniform vec3 uCyan;
    uniform vec3 uGreen;
    uniform vec3 uPurple;
    varying vec2 vUv;

    // Mezcla suave 3 colores con fase desplazada a lo largo del tubo
    vec3 triGradient(float pos, float time) {
      // Onda que se desplaza visiblemente por el tubo
      float shift = pos - time * 0.18;
      // 3 fases separadas 120° (2π/3)
      float w1 = pow(max(sin(shift * 3.14159 * 2.0) * 0.5 + 0.5, 0.0), 1.5);
      float w2 = pow(max(sin(shift * 3.14159 * 2.0 + 2.094) * 0.5 + 0.5, 0.0), 1.5);
      float w3 = pow(max(sin(shift * 3.14159 * 2.0 + 4.189) * 0.5 + 0.5, 0.0), 1.5);
      float total = w1 + w2 + w3 + 0.001;
      return (uCyan * w1 + uGreen * w2 + uPurple * w3) / total;
    }

    void main() {
      // === Draw-on effect: revelado progresivo ===
      float drawMask = 1.0 - smoothstep(uProgress - 0.06, uProgress, vUv.x);
      if (drawMask < 0.005) discard;

      // Frente luminoso del dibujo (leading edge glow)
      float leading = smoothstep(uProgress - 0.12, uProgress - 0.02, vUv.x) * drawMask;

      // Color degradado animado a lo largo del tubo
      vec3 col = triGradient(vUv.x, uTime);

      // Onda de energía viajando por el tubo (movimiento visible)
      float wave = sin((vUv.x - uTime * 0.35) * 5.0) * 0.5 + 0.5;
      float wave2 = sin((vUv.x - uTime * 0.2) * 2.5 + 0.8) * 0.5 + 0.5;
      float energy = pow(wave * 0.55 + wave2 * 0.45, 1.8);

      // Bordes radiales suaves
      float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
      edge = pow(edge, 0.6);

      // Respiración global
      float breathe = 0.88 + sin(uTime * 0.35) * 0.12;

      float alpha = uOpacity * (0.35 + energy * 0.65) * edge * breathe * drawMask;

      // Brillo extra en el frente de dibujado
      col += col * leading * 2.5;
      alpha = min(alpha + leading * 0.4, 1.0);

      gl_FragColor = vec4(col * (0.55 + energy * 0.45), alpha);
    }
  `

  const TUNNEL_VERT = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  // Material del tubo principal
  const tubeMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uProgress: { value: 0 },
      uCyan:   { value: new THREE.Color('#00f7ff').multiplyScalar(2.2) },
      uGreen:  { value: new THREE.Color('#00ff9f').multiplyScalar(2.2) },
      uPurple: { value: new THREE.Color('#bd00ff').multiplyScalar(2.2) },
    },
    vertexShader: TUNNEL_VERT,
    fragmentShader: TUNNEL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), [])

  // Material del glow exterior (más tenue, mismo shader)
  const glowMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uProgress: { value: 0 },
      uCyan:   { value: new THREE.Color('#00f7ff').multiplyScalar(0.8) },
      uGreen:  { value: new THREE.Color('#00ff9f').multiplyScalar(0.8) },
      uPurple: { value: new THREE.Color('#bd00ff').multiplyScalar(0.8) },
    },
    vertexShader: TUNNEL_VERT,
    fragmentShader: TUNNEL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), [])

  // Material halos en nodos
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#00ffaa').multiplyScalar(3),
    toneMapped: false,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  }), [])

  const haloGeo = useMemo(() => new THREE.RingGeometry(1.5, 3.5, 24), [])

  // Resetear progreso cuando cambia el path (en useEffect, no en render body)
  const pathId = tunnelPath?.path?.map(n => n.id).join('-') || ''
  useEffect(() => {
    if (pathId !== prevPathId.current) {
      prevPathId.current = pathId
      progressRef.current = 0
    }
  }, [pathId])

  useFrame(({ clock }, delta) => {
    if (!curve) return
    const t = clock.getElapsedTime()

    // Fade in / fade out
    const targetFade = tunnelPath?.found ? 1 : 0
    fadeRef.current += (targetFade - fadeRef.current) * Math.min(delta * 3, 1)
    const fade = fadeRef.current

    // Animación draw-on: progreso de 0 a 1
    if (tunnelPath?.found && progressRef.current < 1) {
      progressRef.current = Math.min(progressRef.current + delta / DRAW_DURATION, 1)
    }
    const progress = tunnelPath?.found ? progressRef.current : 1 // al desaparecer, mostrar todo y dejar que fade lo oculte

    // Tubo principal
    tubeMat.uniforms.uTime.value = t
    tubeMat.uniforms.uOpacity.value = fade * 0.95
    tubeMat.uniforms.uProgress.value = progress

    // Glow exterior
    glowMat.uniforms.uTime.value = t
    glowMat.uniforms.uOpacity.value = fade * 0.35
    glowMat.uniforms.uProgress.value = progress

    // Halos en nodos — aparecen progresivamente con el draw-on
    if (halosRef.current && fade > 0.01 && pathPoints.length > 0) {
      haloMat.opacity = fade * 0.4
      // Ciclar color del halo con el tiempo (sin allocs por frame)
      const hueShift = (t * 0.15) % 1
      if (hueShift < 0.33) {
        _haloResult.copy(_haloColorA).lerp(_haloColorB, hueShift / 0.33)
      } else if (hueShift < 0.66) {
        _haloResult.copy(_haloColorB).lerp(_haloColorC, (hueShift - 0.33) / 0.33)
      } else {
        _haloResult.copy(_haloColorC).lerp(_haloColorA, (hueShift - 0.66) / 0.34)
      }
      haloMat.color.copy(_haloResult).multiplyScalar(3)

      pathPoints.forEach((pt, i) => {
        // Cada halo aparece cuando el draw-on llega a su posición
        const nodeProgress = pathPoints.length > 1 ? i / (pathPoints.length - 1) : 0
        const haloVisible = progress > nodeProgress ? Math.min((progress - nodeProgress) * 5, 1) : 0
        _tunnelDummy.position.copy(pt)
        const pulse = 1 + Math.sin(t * HALO_GLOW_SPEED + i * 2.0) * 0.2
        _tunnelDummy.scale.setScalar(pulse * haloVisible)
        _tunnelDummy.lookAt(pt.x, pt.y + 100, pt.z)
        _tunnelDummy.updateMatrix()
        halosRef.current.setMatrixAt(i, _tunnelDummy.matrix)
      })
      halosRef.current.instanceMatrix.needsUpdate = true
    }
  })

  if (!curve || !tubeGeo || !glowGeo || pathPoints.length < 2) return null

  return (
    <group>
      {/* Glow exterior difuso */}
      <mesh ref={glowRef} geometry={glowGeo} material={glowMat} frustumCulled={false} />
      {/* Rayo principal de energía */}
      <mesh ref={tubeRef} geometry={tubeGeo} material={tubeMat} frustumCulled={false} />
      {/* Halos en nodos del path */}
      <instancedMesh ref={halosRef} args={[haloGeo, haloMat, pathPoints.length]} frustumCulled={false} />
    </group>
  )
}

// ============================================================================
// ESCENA COMPLETA
// ============================================================================

const MOUNT_STAGES = 9 // Total de fases de montaje progresivo
const SCENE_READY_STAGE = 5 // Señalizar "listo" tras montar lo esencial (orgs+repos+users)
// Los stages 5-8 (channels, arcs, effects) se montan MIENTRAS el loader se desvanece
// Sus animaciones no empiezan hasta 5.5-6.5s después del Big Bang

// ============================================================================
// SIBLING ORG DETECTION — shared across tour waypoints, arcs, etc.
// ============================================================================
function areSiblingOrgs(o1, o2) {
  if (!o1 || !o2) return false
  const l1 = (o1.login || o1.name || '').toLowerCase()
  const l2 = (o2.login || o2.name || '').toLowerCase()
  if (!l1 || !l2) return false
  if (l1 === l2) return true
  // PRONG 1 — Token-based: first token match (≥4 chars), one must be single-token
  const t1 = l1.split(/[-_.\s]+/).filter(Boolean)
  const t2 = l2.split(/[-_.\s]+/).filter(Boolean)
  if (t1.length && t2.length && t1[0].length >= 4 && t1[0] === t2[0]) {
    if (t1.length === 1 || t2.length === 1) return true
  }
  // PRONG 2 — Prefix-based: shorter normalised prefix of longer, ratio ≤ 3
  const a = l1.replace(/[-_\s.]+/g, ''), b = l2.replace(/[-_\s.]+/g, '')
  if (!a || !b) return false
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  if (s.length >= 4 && l.startsWith(s) && l.length / s.length <= 3.0) return true
  return false
}

// ============================================================================
// CINEMATIC TOUR - Generador de waypoints narrativos
// ============================================================================

function generateTourWaypoints(universeData, temporalRange) {
  if (!universeData || !temporalRange) return []
  const { orgNodes, repoNodes, userNodes, positions, orgRepos, orgScore, connections } = universeData
  const yMin = temporalRange.min, yMax = temporalRange.max
  const total = repoNodes.length, totalOrgs = orgNodes.length
  const totalUsers = userNodes?.length || 0

  //  Helpers 
  const oName = (o) => o?.name || o?.login || '???'
  const camFor = (pos, dist = 55) => {
    if (!pos) return { camPos: [0, 200, 500], camTarget: [0, 0, 0] }
    return {
      camPos: [pos.x + dist * 0.7, pos.y + dist * 0.5, pos.z + dist],
      camTarget: [pos.x, pos.y, pos.z],
    }
  }

  //  1. Repos acumulados y nuevos por año 
  const reposByYear = {}
  const accumByYear = {}
  for (const r of repoNodes) {
    const y = r.pushed_at_year
    if (y != null) { ;(reposByYear[y] ??= []).push(r) }
  }
  for (let y = yMin; y <= yMax; y++) {
    accumByYear[y] = repoNodes.filter(r => r.pushed_at_year != null && r.pushed_at_year <= y).length
  }

  //  2. Org "primera aparición" = min(pushed_at_year) de sus repos 
  const orgFirstYear = {}
  const orgById = {}
  for (const o of orgNodes) orgById[o.id] = o
  for (const o of orgNodes) {
    const repos = orgRepos[o.id] || []
    let minY = Infinity
    for (const r of repos) {
      if (r.pushed_at_year != null && r.pushed_at_year < minY) minY = r.pushed_at_year
    }
    if (minY < Infinity) orgFirstYear[o.id] = minY
  }

  const orgsAppearingAt = {}
  for (const [id, y] of Object.entries(orgFirstYear)) {
    ;(orgsAppearingAt[y] ??= []).push(orgById[id])
  }

  //  3. Ranked orgs por repos 
  const orgsByRepos = [...orgNodes]
    .map(o => ({ org: o, count: (orgRepos[o.id] || []).length }))
    .sort((a, b) => b.count - a.count)

  //  4. Top starred repo 
  let topRepo = null, topStars = 0
  for (const r of repoNodes) {
    if ((r.stars || 0) > topStars) { topStars = r.stars; topRepo = r }
  }

  //  5. Año de mayor crecimiento 
  let peakYear = yMin + 1, peakGrowth = 0
  for (let y = yMin + 1; y <= yMax; y++) {
    const g = (accumByYear[y] || 0) - (accumByYear[y - 1] || 0)
    if (g > peakGrowth) { peakGrowth = g; peakYear = y }
  }

  //  6. Entanglement links 
  const entanglementLinks = connections?.filter(c => c.type === 'entangled_with') || []
  const entanglementCount = entanglementLinks.length

  //  7. Bridge users 
  const bridgeUsers = userNodes?.filter(u => u.isBridge) || []
  const bridgeCount = bridgeUsers.length

  //  8. Top languages 
  const langCount = {}
  for (const r of repoNodes) {
    const lang = r.language
    if (lang) langCount[lang] = (langCount[lang] || 0) + 1
  }
  const topLangs = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 5)

  //  9. Entrelazamiento más fuerte — excluyendo orgs "hermanas" 
  // Usa areSiblingOrgs() definido a nivel de módulo
  // Filtrar links inter-org genuinos (no hermanas)
  const genuineLinks = entanglementLinks.filter(c => {
    const o1 = orgById[c.source], o2 = orgById[c.target]
    return !areSiblingOrgs(o1, o2)
  })
  let strongestLink = null
  for (const c of genuineLinks) {
    if (!strongestLink || c.strength > strongestLink.strength) strongestLink = c
  }

  //  10. Estrellas total ecosistema 
  let totalStarsAll = 0
  for (const r of repoNodes) totalStarsAll += (r.stars || 0)

  //  11. Top 5 repos por estrellas 
  const topStarredRepos = [...repoNodes].sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 5)

  //  12. Org más central (mayor score) 
  let mostCentralOrg = null, maxScore = 0
  if (orgScore) {
    for (const [id, score] of Object.entries(orgScore)) {
      if (score > maxScore) { maxScore = score; mostCentralOrg = orgById[id] }
    }
  }

  //  13. Diversidad: orgs con >1 lenguaje en sus repos 
  const orgLangDiversity = {}
  for (const o of orgNodes) {
    const langs = new Set()
    for (const r of (orgRepos[o.id] || [])) { if (r.language) langs.add(r.language) }
    orgLangDiversity[o.id] = langs.size
  }

  //  14. Repos "huérfanos" con pocos contributors vs masivos 
  const midY = Math.round((yMin + yMax) / 2)

  //  15. Detección de orgs industriales clave para contexto narrativo 
  const keyOrgPatterns = [
    { key: 'ibm',     pattern: /\bqiskit\b|ibm.?quantum|ibm.?research/i, label: 'IBM / Qiskit' },
    { key: 'google',  pattern: /\bgoogle\b|quantumai|cirq/i,             label: 'Google' },
    { key: 'microsoft', pattern: /\bmicrosoft\b|azure.?quantum|qsharp/i, label: 'Microsoft' },
    { key: 'rigetti', pattern: /\brigetti\b|pyquil|forest/i,             label: 'Rigetti' },
    { key: 'dwave',   pattern: /\bd.?wave\b|dwavesys|ocean/i,           label: 'D-Wave' },
    { key: 'xanadu',  pattern: /\bxanadu\b|pennylane|strawberry/i,      label: 'Xanadu' },
    { key: 'zapata',  pattern: /\bzapata\b|orquestra/i,                  label: 'Zapata' },
  ]
  const keyOrgsFound = {}
  for (const { key, pattern, label } of keyOrgPatterns) {
    const org = orgNodes.find(o => pattern.test(o.login || '') || pattern.test(o.name || ''))
    if (org) keyOrgsFound[key] = { org, label, year: orgFirstYear[org.id] }
  }
  const keyOrgNamesList = Object.values(keyOrgsFound).map(v => v.label)
  const hasIndustryOrgs = keyOrgNamesList.length > 0

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTRUIR WAYPOINTS
  // ═══════════════════════════════════════════════════════════════════════════
  const waypoints = []

  //  WP 0: EL VACÍO — Oscuridad total 
  waypoints.push({
    year: yMin - 1,
    camPos: [0, 200, 600],
    camTarget: [0, 0, 0],
    duration: 18,
    isVoid: true,
    title: '',
    text: `En 1981, Richard Feynman imaginó por primera vez un ordenador que operase según las leyes de la mecánica cuántica. Durante las décadas siguientes, mentes como las de Shor y Grover transformaron esa intuición en algoritmos revolucionarios, mientras los laboratorios luchaban por construir los primeros qubits estables. Sin embargo, todo ese conocimiento vivía encerrado en papers académicos y laboratorios privados. En GitHub, hasta ${yMin}, el silencio era casi absoluto.`,
  })

  //  WP 1: PRELUDIO — "Y de pronto, un día…" 
  waypoints.push({
    year: yMin - 1,
    camPos: [0, 200, 600],
    camTarget: [0, 0, 0],
    duration: 12,
    isPreludio: true,
    triggerBigBangAt: 9,
    title: '',
    text: 'Entonces la industria decidió abrir sus puertas al mundo…',
  })

  //  WP 2: GÉNESIS — El Big Bang del ecosistema 
  // Calcular firstActiveYear aquí para usarlo en génesis y pioneros
  let firstActiveYear = yMin
  for (let y = yMin; y <= yMax; y++) {
    if ((reposByYear[y]?.length || 0) > 0) { firstActiveYear = y; break }
  }

  waypoints.push({
    year: firstActiveYear + 0.5,
    camPos: [0, 500, 1200],
    camTarget: [0, 0, 0],
    duration: 16,
    isGenesis: true,
    title: 'Génesis Open-Source',
    text: `Estamos en el año ${firstActiveYear} y comienza una nueva era para la computación cuántica: la era del código abierto. A lo largo de los próximos años, ${total.toLocaleString()} repositorios, ${totalOrgs} organizaciones y ${totalUsers.toLocaleString()} desarrolladores irán materializándose en este universo.${hasIndustryOrgs ? ` Gigantes tecnológicos como ${keyOrgNamesList.slice(0, 3).join(', ')} liderarán esta apertura, publicando herramientas que antes solo existían tras puertas cerradas.` : ''} Lo que durante décadas vivió confinado en laboratorios académicos está a punto de construirse de forma colaborativa y transparente.`,
  })

  //  WP 3: PRIMERAS FLUCTUACIONES — Pioneros reales 
  const firstRepos = reposByYear[firstActiveYear] || []
  const firstOrgs = orgsAppearingAt[firstActiveYear] || []
  const firstOrgNames = firstOrgs.slice(0, 3).map(o => oName(o)).join(', ')
  const firstRepoNames = firstRepos.slice(0, 4).map(r => r.full_name || r.name).join(', ')
  const firstOrgPos = firstOrgs[0] ? positions[firstOrgs[0].id] : null
  // Detectar si los primeros repos/orgs son de la industria o proyectos pequeños
  const firstOrgIsKey = firstOrgs.length > 0 && Object.values(keyOrgsFound).some(v => firstOrgs.some(o => o.id === v.org.id))
  waypoints.push({
    year: firstActiveYear + 0.5,
    ...(firstOrgPos ? camFor(firstOrgPos, 80) : { camPos: [0, 180, 450], camTarget: [0, 0, 0] }),
    duration: 12,
    title: 'Los Primeros Nodos',
    text: firstOrgs.length > 0
      ? (firstOrgIsKey
        ? `En ${firstActiveYear}, ${firstOrgs.length} organizaciones dan el primer paso publicando ${firstRepos.length} repositorios. Entre ellas, ${firstOrgNames} abren su código al mundo con proyectos como ${firstRepoNames}, sentando las bases técnicas sobre las que se construirá todo el ecosistema abierto de computación cuántica.`
        : `Los primeros ${firstRepos.length} repositorios que aparecen en ${firstActiveYear} no son de grandes corporaciones, sino proyectos pequeños y experimentales como ${firstRepoNames}. Organizaciones como ${firstOrgNames} representan iniciativas de investigación y prototipos tempranos que exploran el terreno, allanando el camino para que los grandes actores de la industria se sumen más adelante.`)
      : `En ${firstActiveYear} emergen los primeros ${firstRepos.length} repositorios: ${firstRepoNames}. Son proyectos experimentales y de investigación, pequeñas semillas plantadas antes de que la industria reconociera el potencial del open-source para acelerar la computación cuántica.`,
  })

  //  WP 3b: PRIMER GIGANTE — La primera gran org industrial en el ecosistema 
  // Encontrar la primera org industrial clave por año de aparición
  const keyOrgsByYear = Object.values(keyOrgsFound)
    .filter(v => v.year != null)
    .sort((a, b) => a.year - b.year)
  const firstKeyOrg = keyOrgsByYear[0]
  if (firstKeyOrg && firstKeyOrg.year > firstActiveYear) {
    const fkOrg = firstKeyOrg.org
    const fkPos = positions[fkOrg.id]
    const fkRepos = orgRepos[fkOrg.id] || []
    const fkStars = fkRepos.reduce((sum, r) => sum + (r.stars || 0), 0)
    const fkTopRepo = [...fkRepos].sort((a, b) => (b.stars || 0) - (a.stars || 0))[0]
    const fkLangs = [...new Set(fkRepos.map(r => r.language).filter(Boolean))].slice(0, 3)
    // Otras orgs clave que aparecen el mismo año o poco después
    const sameEraOrgs = keyOrgsByYear.filter(v => v.year <= firstKeyOrg.year + 1 && v.org.id !== fkOrg.id).map(v => v.label)
    waypoints.push({
      year: firstKeyOrg.year + 0.5,
      ...(fkPos ? camFor(fkPos, 55) : { camPos: [0, 200, 500], camTarget: [0, 0, 0] }),
      duration: 13,
      title: firstKeyOrg.label,
      text: `En ${firstKeyOrg.year}, ${firstKeyOrg.label} irrumpe en el ecosistema open-source cuántico aportando ${fkRepos.length} repositorios que acumulan ${fkStars.toLocaleString()} estrellas en GitHub.${fkTopRepo ? ` Su proyecto insignia, ${fkTopRepo.full_name || fkTopRepo.name}, alcanza las ${(fkTopRepo.stars || 0).toLocaleString()} ★ y se convierte en referencia para desarrolladores de todo el mundo.` : ''}${fkLangs.length > 0 ? ` Su stack tecnológico abarca ${fkLangs.join(', ')}.` : ''}${sameEraOrgs.length > 0 ? ` No están solos: en esta misma etapa también se incorporan ${sameEraOrgs.join(' y ')}, marcando el punto de inflexión en el que la industria apuesta decididamente por el open-source cuántico.` : ' Es el momento en que la industria apuesta decididamente por construir en abierto.'}`,
    })
  }

  //  WP 3: EPICENTRO — La org más importante por centralidad 
  const epicenterOrg = mostCentralOrg || orgsByRepos[0]?.org
  if (epicenterOrg) {
    const epicenterPos = positions[epicenterOrg.id]
    const epicenterRepos = orgRepos[epicenterOrg.id] || []
    const epicenterYear = orgFirstYear[epicenterOrg.id] || midY
    const epicenterStars = epicenterRepos.reduce((sum, r) => sum + (r.stars || 0), 0)
    const epicenterLangs = [...new Set(epicenterRepos.map(r => r.language).filter(Boolean))].slice(0, 3)
    const epicenterTopRepo = [...epicenterRepos].sort((a, b) => (b.stars || 0) - (a.stars || 0))[0]
    waypoints.push({
      year: Math.min(epicenterYear + 1, yMax),
      ...(epicenterPos ? camFor(epicenterPos, 45) : { camPos: [0, 150, 350], camTarget: [0, 0, 0] }),
      duration: 13,
      title: oName(epicenterOrg),
      text: `En el centro gravitacional de este universo se encuentra ${oName(epicenterOrg)}, la organización más conectada del ecosistema. Con ${epicenterRepos.length} repositorios y ${epicenterStars.toLocaleString()} estrellas acumuladas, actúa como un hub que atrae colaboradores y genera influencia en múltiples direcciones.${epicenterTopRepo ? ` Su proyecto más emblemático es ${epicenterTopRepo.name}, con ${(epicenterTopRepo.stars || 0).toLocaleString()} ★.` : ''}${epicenterLangs.length > 0 ? ` Su stack tecnológico incluye ${epicenterLangs.join(', ')}, reflejando la amplitud de su contribución al campo.` : ''}`,
    })
  }

  //  WP 4: QUBIT ESTELAR — El repo con más estrellas 
  if (topRepo && topStars > 50) {
    const trPos = positions[topRepo.id]
    const ownerOrg = orgNodes.find(o => (orgRepos[o.id] || []).some(r => r.id === topRepo.id))
    // Top 3 repos para contexto
    const top3Names = topStarredRepos.slice(0, 3).map(r => `${r.name} (${(r.stars || 0).toLocaleString()} ★)`).join(', ')
    waypoints.push({
      year: topRepo.pushed_at_year || midY + 1,
      ...(trPos ? camFor(trPos, 28) : { camPos: [100, 150, 250], camTarget: [0, 0, 0] }),
      duration: 12,
      title: `★ ${topRepo.name}`,
      text: `Si hay un repositorio que brilla con luz propia en este ecosistema, ese es ${topRepo.full_name || topRepo.name}. Con ${topStars.toLocaleString()} estrellas en GitHub${ownerOrg ? `, mantenido por ${oName(ownerOrg)}` : ''}${topRepo.language ? ` y escrito principalmente en ${topRepo.language}` : ''}, se ha convertido en el proyecto más influyente de la computación cuántica open-source. Junto a él, otros proyectos destacados son ${top3Names}. En conjunto, todo el ecosistema acumula ${totalStarsAll.toLocaleString()} estrellas, reflejo del interés global por estas tecnologías.`,
    })
  }

  //  WP 5: ENTRELAZAMIENTO — Overview general de la red de colaboración 
  if (genuineLinks.length > 0) {
    const genuineCount = genuineLinks.length
    // Contar orgs únicas involucradas en colaboraciones genuinas
    const collabOrgIds = new Set()
    for (const c of genuineLinks) { collabOrgIds.add(c.source); collabOrgIds.add(c.target) }
    const collabOrgCount = collabOrgIds.size
    // Top 3 pares más fuertes
    const strongPairs = genuineLinks
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3)
      .map(c => {
        const o1 = orgById[c.source], o2 = orgById[c.target]
        return `${oName(o1)} ↔ ${oName(o2)} (${c.strength})`
      }).join(', ')
    waypoints.push({
      year: midY + 1,
      camPos: [0, 400, 800],
      camTarget: [0, 0, 0],
      duration: 13,
      isEntanglement: true,
      title: 'Entrelazamiento',
      text: `La verdadera fortaleza de un ecosistema no está en sus nodos individuales, sino en cómo se conectan entre sí. Existen ${genuineCount} enlaces de colaboración real que unen a ${collabOrgCount} organizaciones independientes a través de desarrolladores que contribuyen en múltiples proyectos. Los vínculos más fuertes son ${strongPairs}. Cada arco luminoso que ves representa un puente genuino de talento entre equipos, evidencia de que la computación cuántica avanza como un esfuerzo colectivo y no como una carrera aislada.`,
    })
  }

  //  WP 6: USUARIOS PUENTE — Los conectores del ecosistema 
  if (bridgeCount > 0) {
    // Encontrar el bridge user que más repos tiene
    const topBridges = [...bridgeUsers].sort((a, b) => (b.repos_count || 0) - (a.repos_count || 0)).slice(0, 3)
    const topBridgeNames = topBridges.map(u => `${u.name || u.login} (${u.repos_count || 0} repos)`).join(', ')
    const bridgePct = ((bridgeCount / totalUsers) * 100).toFixed(1)
    const normalCount = totalUsers - bridgeCount
    waypoints.push({
      year: midY + 2,
      camPos: [0, 350, 700],
      camTarget: [0, 0, 0],
      duration: 13,
      isBridgeUsers: true,
      title: 'Usuarios Puente',
      text: `${totalUsers.toLocaleString()} desarrolladores pueblan este ecosistema, pero no todos desempeñan el mismo rol. Entre ellos destacan ${bridgeCount.toLocaleString()} usuarios puente, apenas el ${bridgePct}% del total, representados por los puntos dorados que destellan ante ti. Estos desarrolladores contribuyen simultáneamente a repositorios de múltiples organizaciones, tejiendo la red de colaboración que mantiene unido al ecosistema. Los más activos son ${topBridgeNames}. Sin estos conectores, los ${normalCount.toLocaleString()} desarrolladores restantes quedarían fragmentados en silos organizacionales inconexos.`,
    })
  }

  //  WP 7: INFLACIÓN CÓSMICA — El año del boom 
  const peakOrgs = (orgsAppearingAt[peakYear] || [])
    .sort((a, b) => (orgRepos[b.id]?.length || 0) - (orgRepos[a.id]?.length || 0))
    .slice(0, 4)
  const peakOrgNames = peakOrgs.map(o => oName(o)).join(', ')
  const prevYearAccum = accumByYear[peakYear - 1] || 0
  const growthPct = prevYearAccum > 0 ? ((peakGrowth / prevYearAccum) * 100).toFixed(0) : '∞'
  // Detectar hitos industriales clave en el año del boom
  const peakKeyOrgs = Object.values(keyOrgsFound).filter(v => v.year === peakYear).map(v => v.label)
  waypoints.push({
    year: peakYear,
    camPos: [250, 300, -200],
    camTarget: [0, 0, 0],
    duration: 13,
    title: 'Inflación Cósmica',
    text: `El año ${peakYear} marca el mayor salto en la historia del ecosistema: ${peakGrowth} nuevos repositorios irrumpen de golpe, un crecimiento del ${growthPct}% respecto al año anterior.${peakKeyOrgs.length > 0 ? ` No es casualidad: ${peakKeyOrgs.join(' y ')} ${peakKeyOrgs.length > 1 ? 'publican' : 'publica'} código abierto este año, catalizando la expansión.` : ''}${peakOrgNames ? ` Organizaciones como ${peakOrgNames} se incorporan al ecosistema, aportando nuevas perspectivas y herramientas.` : ''} En apenas doce meses, la cifra acumulada pasa de ${prevYearAccum} a ${accumByYear[peakYear] || 0} repositorios.`,
  })

  //  WP 8: BABEL CUÁNTICA — Diversidad de lenguajes 
  if (topLangs.length >= 3) {
    const langBreakdown = topLangs.slice(0, 5).map(([lang, count]) => `${lang} (${count})`).join(', ')
    const dominantPct = ((topLangs[0][1] / total) * 100).toFixed(0)
    const totalLangs = Object.keys(langCount).length
    waypoints.push({
      year: yMax - 1,
      camPos: [-300, 200, 200],
      camTarget: [0, 50, 0],
      duration: 12,
      title: 'Babel Cuántica',
      text: `La computación cuántica no habla un solo lenguaje. ${totalLangs} lenguajes de programación distintos coexisten en este ecosistema, cada uno aportando fortalezas únicas. ${topLangs[0][0]} domina con el ${dominantPct}% de los repositorios, pero la diversidad es imprescindible: ${langBreakdown}. Desde la simulación numérica de circuitos cuánticos hasta las interfaces de control de hardware real, cada lenguaje cubre una necesidad específica del campo.`,
    })
  }

  //  WP 9: PANORÁMICA FINAL — El universo completo 
  const topOrgNames = orgsByRepos.slice(0, 5).map(e => `${oName(e.org)} (${e.count})`).join(', ')
  waypoints.push({
    year: yMax,
    camPos: [0, 300, 650],
    camTarget: [0, 30, 0],
    duration: 14,
    isFinal: true,
    title: 'El Universo Cuántico',
    text: `De la imaginación de Feynman en 1981 a este universo de código abierto: ${total.toLocaleString()} repositorios, ${totalOrgs} organizaciones y ${totalUsers.toLocaleString()} desarrolladores conforman hoy el ecosistema cuántico open-source, conectados por ${genuineLinks.length} colaboraciones inter-organizacionales reales. Los mayores hubs son ${topOrgNames}. Lo que comenzó como una intuición teórica se ha transformado en un organismo vivo, descentralizado y en constante expansión, donde academia e industria construyen juntas el futuro de la computación.`,
  })

  //  Ordenar cronológicamente para progresión lineal 
  // El waypoint final (isFinal) siempre va al final independientemente del año
  waypoints.sort((a, b) => {
    if (a.isFinal) return 1
    if (b.isFinal) return -1
    return a.year - b.year
  })

  return waypoints
}

const QuantumScene = memo(function QuantumScene({ universeData, onSelect, setHovered, focusTarget, resetTrigger, selectedEntity, lensData, lensRevealDelay, searchHighlightSet, onSceneReady, startAnimation, showZones, entityFilter, tunnelPath, favoriteIdSet, multiOrgColors, activeNodeIdsRef, tourCameraRef }) {
  // === PROGRESO VIA REF - CERO re-renders de React desde el render-loop ===
  // BuildDirector escribe directo a este ref; los componentes lo leen en useFrame
  const bpRef = useRef({ genesis: 0, vacuum: 0, processors: 0, qubits: 0, particles: 0, entanglement: 0 })
  const pointerDownPos = useRef({ x: 0, y: 0, dragged: false })
  const isDraggingRef = useRef(false)
  const lod = useLOD()

  // Drag detection: registrar posición al presionar, marcar como drag si se mueve > 5px
  // Ocultar cursor durante rotación para UX más limpia
  // isDraggingRef suprime hover durante arrastre → evita re-renders (16 componentes × 60fps)
  const { gl } = useThree()
  useEffect(() => {
    const dom = gl.domElement
    const onDown = (e) => {
      pointerDownPos.current = { x: e.clientX, y: e.clientY, dragged: false }
      isDraggingRef.current = false
      if (e.button === 0) dom.style.cursor = 'none'
    }
    const onMove = (e) => {
      if (e.buttons === 0) return // Solo rastrear drag con botón pulsado
      const dp = pointerDownPos.current
      const dx = e.clientX - dp.x, dy = e.clientY - dp.y
      if (dx * dx + dy * dy > 25) {
        dp.dragged = true
        if (!isDraggingRef.current) {
          isDraggingRef.current = true
          // Limpiar hover al iniciar arrastre: elimina FloatingLabel y evita
          // que el último hover quede "congelado" durante la rotación
          setHovered(null)
        }
      }
    }
    const onUp = () => { isDraggingRef.current = false; dom.style.cursor = '' }
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [gl, setHovered])

  // ===== MONTAJE PROGRESIVO - cada stage monta un grupo de componentes =====
  // Esto evita que el hilo principal se bloquee al alocar todas las geometrías de golpe
  const [mountStage, setMountStage] = useState(0)

  useEffect(() => {
    if (!universeData) { setMountStage(0); return }
    if (mountStage >= MOUNT_STAGES) return
    // setTimeout con delay GENEROSO entre stages para que el browser pueda
    // procesar eventos y NUNCA dispare "la página no responde"
    // Delays más grandes DESPUÉS de stages pesados (particles, channels)
    const STAGE_DELAYS = [200, 300, 200, 500, 800, 600, 900, 200, 250, 200]
    const delay = STAGE_DELAYS[mountStage] || 300
    const id = setTimeout(() => setMountStage(s => s + 1), delay)
    return () => clearTimeout(id)
  }, [universeData, mountStage])

  // Señalizar escena lista cuando las fases esenciales (1-4) se han montado
  // Stages 5+ continúan montando en paralelo con el fade del loader
  useEffect(() => {
    if (mountStage >= SCENE_READY_STAGE) onSceneReady?.()
  }, [mountStage, onSceneReady])

  // Set de IDs para entity filter (org/repo/user-bridge/user-normal)
  const filterHighlightSet = useMemo(() => {
    if (entityFilter.size === 0 || !universeData) return null
    const ids = new Set()
    if (entityFilter.has('org')) {
      universeData.orgNodes.forEach(n => ids.add(n.id))
    }
    if (entityFilter.has('repo')) {
      universeData.repoNodes.forEach(n => ids.add(n.id))
    }
    if (entityFilter.has('user-bridge')) {
      universeData.userNodes.forEach(n => { if (n.isBridge) ids.add(n.id) })
    }
    if (entityFilter.has('user-normal')) {
      universeData.userNodes.forEach(n => { if (!n.isBridge) ids.add(n.id) })
    }
    if (entityFilter.has('collab')) {
      // Resaltar todas las orgs involucradas en arcos de colaboración
      universeData.orgNodes.forEach(n => ids.add(n.id))
    }
    return ids
  }, [entityFilter, universeData])

  // Combinar filtro de tipo con filtro de favoritos
  const combinedFilterSet = useMemo(() => {
    if (!filterHighlightSet && !favoriteIdSet) return null
    if (filterHighlightSet && !favoriteIdSet) return filterHighlightSet
    if (!filterHighlightSet && favoriteIdSet) return favoriteIdSet
    // Ambos activos: intersección
    const intersection = new Set()
    for (const id of filterHighlightSet) {
      if (favoriteIdSet.has(id)) intersection.add(id)
    }
    return intersection
  }, [filterHighlightSet, favoriteIdSet])

  // Set de IDs del tunnel path para highlight selectivo
  const tunnelHighlightSet = useMemo(() => {
    if (!tunnelPath?.found || !tunnelPath.path) return null
    const ids = new Set()
    tunnelPath.path.forEach(n => ids.add(n.id))
    return ids
  }, [tunnelPath])

  // Set de IDs relacionados para dimming selectivo
  // Prioridad: selectedEntity > searchHighlightSet > tunnelPath > entityFilter/favorites
  // Si hay selectedEntity + entityFilter activo, intersectar para que los filtros se apliquen
  const highlightSet = useMemo(() => {
    const entitySet = computeRelatedIds(selectedEntity, universeData)
    // Combinar selección con filtro de tipo: intersectar para que solo se muestren
    // las entidades relacionadas Y del tipo filtrado
    if (entitySet && combinedFilterSet) {
      const intersection = new Set()
      // Siempre incluir la propia entidad seleccionada para que no desaparezca
      if (selectedEntity) intersection.add(selectedEntity.id)
      for (const id of entitySet) {
        if (combinedFilterSet.has(id)) intersection.add(id)
      }
      return intersection
    }
    if (entitySet) return entitySet
    if (searchHighlightSet) return searchHighlightSet
    if (tunnelHighlightSet) return tunnelHighlightSet
    return combinedFilterSet
  }, [selectedEntity, universeData, searchHighlightSet, tunnelHighlightSet, combinedFilterSet])
  const dimmed = selectedEntity !== null || searchHighlightSet !== null || entityFilter.size > 0 || lensData !== null || tunnelPath?.found || favoriteIdSet !== null

  const handleHover = useCallback((entity, pos) => {
    //  Suprimir hover durante arrastre de cámara 
    // R3F dispara raycasting en cada pointermove → hits → setHovered → re-render
    // del padre (UniverseView) con ~16 hijos no-memoizados. Bloquear aquí elimina
    // esos re-renders innecesarios y el stuttering al rotar con entidad seleccionada.
    if (isDraggingRef.current) return
    // Bloquear interacción hasta que la animación de aparición haya terminado por completo
    if (bpRef.current.entanglement < 1.0) {
      setHovered(null)
      document.body.style.cursor = 'auto'
      return
    }
    // Bloquear hover sobre entidades no resaltadas cuando hay dimming activo
    // (lente, filtro de tipo, favoritos, búsqueda, tunneling, selección)
    if (entity && highlightSet && !highlightSet.has(entity.id)) {
      setHovered(null)
      document.body.style.cursor = 'auto'
      return
    }
    setHovered(entity ? { entity, pos } : null)
    document.body.style.cursor = entity ? 'pointer' : 'auto'
  }, [setHovered, highlightSet])

  // Wrapper de onSelect que bloquea selección durante animación y durante drag (rotación orbital)
  const guardedSelect = useCallback((entity, pos) => {
    if (bpRef.current.entanglement < 1.0) return
    if (pointerDownPos.current.dragged) return
    onSelect(entity, pos)
  }, [onSelect])

  // Conexiones largas (owns) para canales y pulsos
  const longConnections = useMemo(
    () => (universeData?.connections || []).filter(c => c.type !== 'contributed_to' && c.type !== 'entangled_with'),
    [universeData?.connections]
  )

  // Arcos de entrelazamiento org↔org (filtro siblings como safety-net)
  const entanglementArcs = useMemo(() => {
    const conns = (universeData?.connections || []).filter(c => c.type === 'entangled_with')
    if (!universeData?.orgNodes) return conns
    const oById = {}
    for (const o of universeData.orgNodes) oById[o.id] = o
    return conns.filter(c => {
      const o1 = oById[c.source], o2 = oById[c.target]
      return !areSiblingOrgs(o1, o2)
    })
  }, [universeData?.connections, universeData?.orgNodes])

  // Repo estrella por org
  const starRepos = useMemo(() => {
    if (!universeData) return new Set()
    const { orgRepos: oRepos, repoUsers: rUsers } = universeData
    const stars = new Set()
    Object.entries(oRepos || {}).forEach(([, repos]) => {
      if (!repos || repos.length === 0) return
      let best = null, bestCount = -1
      repos.forEach(r => {
        const count = (rUsers[r.id] || []).length
        if (count > bestCount) { bestCount = count; best = r.id }
      })
      if (best) stars.add(best)
    })
    return stars
  }, [universeData])

  if (!universeData) return null

  const { orgNodes, repoNodes, userNodes, orgRepos, repoUsers, positions, connections, userDensity } = universeData

  const showUsers = true
  const showEffects = true

  return (
    <>
      {/* Luz ambiental mínima */}
      <ambientLight intensity={0.05} />

      {/* Cámara */}
      <CameraRig focusTarget={focusTarget} resetTrigger={resetTrigger} selectedEntity={selectedEntity} tourCameraRef={tourCameraRef} />

      {/* Director de animación - escribe directo al ref, sin setState */}
      <BuildDirector progressRef={bpRef} startAnimation={startAnimation} />

      {/* Génesis cuántica - Big Bang inicial */}
      <QuantumGenesis progressRef={bpRef} progressKey="genesis" />

      {/* Vacío cuántico */}
      <QuantumVacuum progressRef={bpRef} progressKey="vacuum" />
      {showEffects && <InterferenceField progressRef={bpRef} progressKey="vacuum" />}

      {/* ===== MONTAJE PROGRESIVO - 9 stages con pausas >= 200ms entre cada uno ===== */}
      {/* group invisible → garantiza 0 fugas visuales pre-Big Bang (Bloom, GPU clamping, etc.) */}
      <group visible={startAnimation}>
      {/* Stage 1: Procesadores (orgs) - 701 materiales + geometría */}
      {mountStage >= 1 && (
        <QuantumProcessors orgNodes={orgNodes} positions={positions} onHover={handleHover} onClick={guardedSelect} progressRef={bpRef} progressKey="processors" highlightSet={highlightSet} lensData={lensData} lensRevealDelay={lensRevealDelay} activeNodeIdsRef={activeNodeIdsRef} />
      )}

      {/* Stage 2: Anillos de energía (orgs) */}
      {mountStage >= 2 && <EnergyRings orgNodes={orgNodes} positions={positions} progressRef={bpRef} progressKey="processors" highlightSet={highlightSet} dimmed={dimmed} activeNodeIdsRef={activeNodeIdsRef} />}

      {/* Stage 3: Qubits (repos) - 1122 instanced meshes */}
      {mountStage >= 3 && (
        <Qubits repoNodes={repoNodes} positions={positions} onHover={handleHover} onClick={guardedSelect} progressRef={bpRef} progressKey="qubits" highlightSet={highlightSet} lensData={lensData} lensRevealDelay={lensRevealDelay} activeNodeIdsRef={activeNodeIdsRef} />
      )}

      {/* Stage 4: Partículas (users) - 27K+ vertices × 6 atributos (MÁS PESADO) */}
      {mountStage >= 4 && showUsers && (
        <QuantumParticles userNodes={userNodes} positions={positions} onHover={handleHover} onClick={guardedSelect} progressRef={bpRef} progressKey="particles" highlightSet={highlightSet} lensData={lensData} lensRevealDelay={lensRevealDelay} userDensity={userDensity} multiOrgColors={multiOrgColors} activeNodeIdsRef={activeNodeIdsRef} />
      )}

      {/* Stage 5: Bonds (user-repo connections) */}
      {mountStage >= 5 && showUsers && <QuantumBonds repoUsers={repoUsers} positions={positions} progressRef={bpRef} progressKey="particles" dimmed={dimmed} activeNodeIdsRef={activeNodeIdsRef} />}

      {/* Stage 6: Canales de entrelazamiento (38K×35pts - PESADO) */}
      {mountStage >= 6 && <EntanglementChannels connections={longConnections} progressRef={bpRef} progressKey="entanglement" dimmed={dimmed} highlightSet={highlightSet} starRepos={starRepos} collabHighlight={entityFilter.has('collab')} activeNodeIdsRef={activeNodeIdsRef} />}

      {/* Stage 7: Arcos org↔org + nubes + ejes (ligeros) */}
      {mountStage >= 7 && entanglementArcs.length > 0 && <OrgEntanglementArcs arcs={entanglementArcs} progressRef={bpRef} progressKey="entanglement" dimmed={dimmed} collabHighlight={entityFilter.has('collab')} activeNodeIdsRef={activeNodeIdsRef} />}
      {mountStage >= 7 && showEffects && <ProbabilityClouds repoNodes={repoNodes} positions={positions} progressRef={bpRef} progressKey="qubits" dimmed={dimmed} activeNodeIdsRef={activeNodeIdsRef} />}
      {mountStage >= 7 && showEffects && <BlochAxes repoNodes={repoNodes} positions={positions} progressRef={bpRef} progressKey="qubits" dimmed={dimmed} activeNodeIdsRef={activeNodeIdsRef} />}

      {/* Stage 8: Efectos de ambiente - radiación + decoherencia + tunelización */}
      {/* Pasan startAnimation para no hacerse visibles durante la carga */}
      {mountStage >= 8 && showEffects && <HawkingRadiation orgNodes={orgNodes} positions={positions} startAnimation={startAnimation} dimmed={dimmed} activeNodeIdsRef={activeNodeIdsRef} />}
      {mountStage >= 8 && showEffects && <DecoherenceWaves orgNodes={orgNodes} positions={positions} startAnimation={startAnimation} dimmed={dimmed} activeNodeIdsRef={activeNodeIdsRef} />}
      {mountStage >= 8 && showEffects && <TunnelingPulses connections={longConnections} startAnimation={startAnimation} dimmed={dimmed} activeNodeIdsRef={activeNodeIdsRef} />}
      </group>

      {/* Highlight de selección - anillos rotando */}
      {selectedEntity && focusTarget && (
        <FocusHighlight position={focusTarget} entityType={selectedEntity.type} />
      )}

      {/* === QUANTUM TUNNEL BEAM - rayo 3D del shortest path === */}
      {tunnelPath?.found && positions && (
        <QuantumTunnelBeam tunnelPath={tunnelPath} positions={positions} />
      )}

      {/* === FRONTERAS ZONALES - siempre montadas, fade in/out via visible prop === */}
      {universeData?.zoneMeta && (
        <ZoneBoundaries zoneMeta={universeData.zoneMeta} visible={showZones} />
      )}

      {/* === BLOOM POSTPROCESSING - glow cuántico espectacular === */}
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.7}
          mipmapBlur
          levels={4}
          radius={0.85}
        />
      </EffectComposer>
    </>
  )
})

// ============================================================================
// PROCESAMIENTO ASÍNCRONO DE RESULTADOS DEL WORKER
// Convierte posiciones y conexiones en chunks con yields al browser
// para evitar bloquear el hilo principal con 27K+ nodos y 98K+ conexiones
// ============================================================================

function yieldToMain() {
  return new Promise(r => setTimeout(r, 8))
}

async function processLayoutResultAsync(result, requestIdRef) {
  const currentId = requestIdRef.current

  // Fase 1: Convertir posiciones {x,y,z} → THREE.Vector3 en chunks
  const positions = {}
  const posKeys = Object.keys(result.positions)
  const POS_CHUNK = 500
  for (let i = 0; i < posKeys.length; i += POS_CHUNK) {
    if (requestIdRef.current !== currentId) return null // resultado obsoleto
    const end = Math.min(i + POS_CHUNK, posKeys.length)
    for (let j = i; j < end; j++) {
      const v = result.positions[posKeys[j]]
      positions[posKeys[j]] = new THREE.Vector3(v.x, v.y, v.z)
    }
    if (end < posKeys.length) await yieldToMain()
  }

  // Fase 2: Mapear conexiones en chunks (sin spread)
  const connections = new Array(result.connections.length)
  const CONN_CHUNK = 1000
  for (let i = 0; i < result.connections.length; i += CONN_CHUNK) {
    if (requestIdRef.current !== currentId) return null
    const end = Math.min(i + CONN_CHUNK, result.connections.length)
    for (let j = i; j < end; j++) {
      const c = result.connections[j]
      connections[j] = {
        source: c.source,
        target: c.target,
        type: c.type,
        strength: c.strength || 0,
        start: positions[c.source] || new THREE.Vector3(c.start.x, c.start.y, c.start.z),
        end: positions[c.target] || new THREE.Vector3(c.end.x, c.end.y, c.end.z),
      }
    }
    if (end < result.connections.length) await yieldToMain()
  }

  if (requestIdRef.current !== currentId) return null

  return {
    orgNodes: result.orgNodes,
    repoNodes: result.repoNodes,
    userNodes: result.userNodes,
    orgRepos: result.orgRepos,
    repoUsers: result.repoUsers,
    orgScore: result.orgScore,
    orgNeighbors: result.orgNeighbors,
    maxOrgScore: result.maxOrgScore,
    maxOrgNeighbors: result.maxOrgNeighbors,
    userDensity: result.userDensity,
    zoneMeta: result.zoneMeta,
    positions,
    connections,
  }
}

// ============================================================================
// COMPONENTE EXPORTADO
// ============================================================================

export default function UniverseView() {
  const showCollaborationGraph = useDashboardStore(s => s.showCollaborationGraph)
  const collaborationDiscovery = useDashboardStore(s => s.collaborationDiscovery)
  const closeCollaborationGraph = useDashboardStore(s => s.closeCollaborationGraph)
  const activeLens = useDashboardStore(s => s.activeLens)
  const networkMetrics = useDashboardStore(s => s.networkMetrics)
  const isLoadingMetrics = useDashboardStore(s => s.isLoadingMetrics)
  const metricsLoadAttempted = useDashboardStore(s => s.metricsLoadAttempted)
  const setActiveLens = useDashboardStore(s => s.setActiveLens)
  const loadNetworkMetrics = useDashboardStore(s => s.loadNetworkMetrics)
  const findQuantumPathAction = useDashboardStore(s => s.findQuantumPath)
  const tunnelingPath = useDashboardStore(s => s.tunnelingPath)
  const isLoadingTunneling = useDashboardStore(s => s.isLoadingTunneling)
  const clearTunneling = useDashboardStore(s => s.clearTunneling)
  const temporalFilter = useDashboardStore(s => s.temporalFilter)
  const applyTemporalFilter = useDashboardStore(s => s.applyTemporalFilter)
  const isDiscovering = useDashboardStore(s => s.isDiscovering)
  const temporalRange = useDashboardStore(s => s.temporalRange)
  const storeSliderYear = useDashboardStore(s => s.sliderYear)
  const activeNodeIds = useDashboardStore(s => s.activeNodeIds)
  const setSliderYear = useDashboardStore(s => s.setSliderYear)
  // Estado local para slider fluido — computa visibilidad y escribe directamente a la ref
  const [localSlider, setLocalSlider] = useState(null)
  useEffect(() => {
    // Sincronizar slider local cuando el store cambia (reset, settings panel, etc.)
    if (storeSliderYear != null) setLocalSlider(storeSliderYear)
  }, [storeSliderYear])

  // Favoritos
  const toggleFavorite = useFavoritesStore(s => s.toggleFavorite)
  const isFavorite = useFavoritesStore(s => s.isFavorite)
  const favorites = useFavoritesStore(s => s.favorites)

  const [entering, setEntering] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const canvasWrapperRef = useRef(null)
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [detailExpanded, setDetailExpanded] = useState(false)
  const [detailTab, setDetailTab] = useState('info') // 'info' | 'red' | 'explorer'
  const [navHistory, setNavHistory] = useState([])    // stack de entidades previas
  const [pinnedEntity, setPinnedEntity] = useState(null)   // entidad fijada para comparar
  const [pinnedData, setPinnedData] = useState(null)       // snapshot de detailData de la entidad fijada
  const [panelClosing, setPanelClosing] = useState(false)  // animación de cierre
  const [detailLoading, setDetailLoading] = useState(false) // indicador de carga
  const [tooltipText, setTooltipText] = useState('')       // tooltip flotante
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const tooltipTimeout = useRef(null)
  const detailWorkerRef = useRef(null)
  const [hovered, setHovered] = useState(null)
  const [focusTarget, setFocusTarget] = useState(null)
  const [resetTrigger, setResetTrigger] = useState(0)
  const [sceneReady, setSceneReady] = useState(false)
  const [loaderVisible, setLoaderVisible] = useState(true)
  const [loaderFading, setLoaderFading] = useState(false)
  const [animationStarted, setAnimationStarted] = useState(false)
  const [uiVisible, setUiVisible] = useState(false)
  const [canvasMounted, setCanvasMounted] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [helpTab, setHelpTab] = useState('entities')
  const [showBots, setShowBots] = useState(false)
  const [showZones, setShowZones] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef(null)
  const [entityFilter, setEntityFilter] = useState(new Set()) // Set of 'org' | 'repo' | 'user-bridge' | 'user-normal'
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  // === Temporal filter local state ===
  const [showTemporalPanel, setShowTemporalPanel] = useState(false)
  const [tempYearFrom, setTempYearFrom] = useState(temporalFilter?.yearFrom ?? '')
  const [tempYearTo, setTempYearTo] = useState(temporalFilter?.yearTo ?? '')
  const temporalRef = useRef(null)

  // === Ref para visibilidad temporal - evita re-renders del Canvas memo'd ===
  const activeNodeIdsRef = useRef(null)
  // Solo sincronizar desde store cuando activeNodeIds cambie realmente
  // (settings panel, reset), NO en cada render (que sobreescribiría el cálculo local del slider)
  useEffect(() => { activeNodeIdsRef.current = activeNodeIds }, [activeNodeIds])

  // Handler del slider: computa visibilidad localmente y escribe a la ref → 0 re-renders del Canvas
  const handleSliderChange = useCallback((value) => {
    setLocalSlider(value)
    if (!temporalRange) return
    if (value >= temporalRange.max) {
      activeNodeIdsRef.current = null
      return
    }
    const state = useDashboardStore.getState()
    const nodes = state.collaborationDiscovery?.graph?.nodes
    const links = state.collaborationDiscovery?.graph?.links
    if (!nodes || !links) return
    activeNodeIdsRef.current = computeTemporalVisibility(nodes, links, temporalRange.min, value)
  }, [temporalRange])

  // === CINEMATIC TOUR ===
  const [tourActive, setTourActive] = useState(false)
  const [tourFading, setTourFading] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  const [tourBigBangFired, setTourBigBangFired] = useState(false)
  const [tourBigBangReplay, setTourBigBangReplay] = useState(0)
  const [tourEnded, setTourEnded] = useState(false)
  const [tourExiting, setTourExiting] = useState(false)
  const [tourPaused, setTourPaused] = useState(false)
  const tourCameraRef = useRef({ active: false, position: new THREE.Vector3(), target: new THREE.Vector3() })
  const tourRafRef = useRef(null)
  const tourFadeTimeoutRef = useRef(null)
  // tourWaypoints se computa más abajo, después de universeData
  const tourWaypointsRef = useRef([])
  // Pause system refs
  const tourPausedRef = useRef(false)
  const tourPauseAccumRef = useRef(0)
  const tourPauseStartRef = useRef(0)
  const tourT0Ref = useRef(0)
  const tourStepStartsRef = useRef([])
  const tourBigBangTriggeredRef = useRef(false)

  const stopTour = useCallback(() => {
    setTourActive(false)
    setTourFading(false)
    setTourExiting(false)
    setTourStep(0)
    setTourEnded(false)
    setTourBigBangFired(false)
    setTourPaused(false)
    tourPausedRef.current = false
    tourPauseAccumRef.current = 0
    tourBigBangTriggeredRef.current = false
    setEntityFilter(new Set()) // Limpiar filtro collab del tour
    tourCameraRef.current.active = false
    if (tourRafRef.current) { cancelAnimationFrame(tourRafRef.current); tourRafRef.current = null }
    if (tourFadeTimeoutRef.current) { clearTimeout(tourFadeTimeoutRef.current); tourFadeTimeoutRef.current = null }
    // Restaurar slider al máximo (todo visible)
    if (temporalRange) {
      setLocalSlider(temporalRange.max)
      activeNodeIdsRef.current = null
      setSliderYear(temporalRange.max)
    }
  }, [temporalRange, setSliderYear])

  const startTour = useCallback(() => {
    const tourWaypoints = tourWaypointsRef.current
    if (tourWaypoints.length === 0 || !temporalRange) return
    setSelectedEntity(null)
    setShowHelp(false)
    setTourFading(true) // Fade gradual de la UI

    // Tras completarse el fade, iniciar el engine del tour
    tourFadeTimeoutRef.current = setTimeout(() => {
      tourFadeTimeoutRef.current = null
      setTourActive(true)
      setTourBigBangFired(false)
      setTourStep(0)

      // Posición inicial del tour
      const wp0 = tourWaypoints[0]
      tourCameraRef.current.active = true
      tourCameraRef.current.position.set(...wp0.camPos)
      tourCameraRef.current.target.set(...wp0.camTarget)
      handleSliderChange(wp0.year)

      // Tiempos acumulados de cada step
      const stepStarts = [0]
      for (let i = 0; i < tourWaypoints.length; i++) stepStarts.push(stepStarts[i] + tourWaypoints[i].duration * 1000)
      const totalDur = stepStarts[stepStarts.length - 1]

      const t0 = performance.now()
      tourT0Ref.current = t0
      tourStepStartsRef.current = stepStarts
      tourPauseAccumRef.current = 0
      tourPausedRef.current = false
      setTourPaused(false)
      tourBigBangTriggeredRef.current = false
      let curStep = -1
      let lastSliderUI = 0
      let endedFlag = false
      const lastStepIdx = tourWaypoints.length - 1
      const lastStepStart = stepStarts[lastStepIdx]
      // Camera lerp state for smooth transitions between steps
      let lerpCamPos = [...wp0.camPos]
      let lerpCamTarget = [...wp0.camTarget]
      let targetCamPos = [...wp0.camPos]
      let targetCamTarget = [...wp0.camTarget]

      // Pre-compute genesis filter so void/preludio use it instead of null
      let genesisFilter = new Map()
      const genesisWp = tourWaypoints.find(w => w.isGenesis)
      if (genesisWp && temporalRange) {
        const _st = useDashboardStore.getState()
        const _n = _st.collaborationDiscovery?.graph?.nodes
        const _l = _st.collaborationDiscovery?.graph?.links
        if (_n && _l) genesisFilter = computeTemporalVisibility(_n, _l, temporalRange.min, genesisWp.year)
      }
      // Apply genesis filter immediately so visRef init uses correct targets
      activeNodeIdsRef.current = genesisFilter

      let postTourAngleOffset = 0
      let postTourInitialized = false

      const tick = (now) => {
        //  Si está pausado, mantener RAF pero no avanzar 
        if (tourPausedRef.current) {
          tourRafRef.current = requestAnimationFrame(tick)
          return
        }
        const el = now - t0 - tourPauseAccumRef.current

        //  Fase post-tour: rotación continua, botones visibles 
        if (el >= totalDur) {
          if (!endedFlag) { setTourEnded(true); setEntityFilter(new Set()); endedFlag = true }
          // Calcular offset inicial una vez para continuidad con la rotación del tour
          if (!postTourInitialized) {
            // Ángulo actual de la cámara al final del tour
            const camX = tourCameraRef.current.position.x
            const camZ = tourCameraRef.current.position.z
            const currentAngle = Math.atan2(camX, camZ)
            // El ángulo post-tour arranca desde sinceLastStep=0 → offset = currentAngle
            postTourAngleOffset = currentAngle
            postTourInitialized = true
          }
          // Cámara gira lentamente alrededor del universo (sentido horario)
          const sinceLastStep = (el - totalDur) / 1000
          const angle = postTourAngleOffset - sinceLastStep * 0.1
          const radius = 620
          tourCameraRef.current.position.set(
            Math.sin(angle) * radius,
            280,
            Math.cos(angle) * radius
          )
          tourCameraRef.current.target.set(0, 30, 0)
          tourRafRef.current = requestAnimationFrame(tick)
          return
        }

        // Step actual
        let s = 0
        while (s < tourWaypoints.length - 1 && el >= stepStarts[s + 1]) s++
        const wp = tourWaypoints[s]
        const nxt = tourWaypoints[s + 1]
        const t = Math.min((el - stepStarts[s]) / (wp.duration * 1000), 1)

        // Cambio de step → actualizar camera target + narrativa + filtros
        if (s !== curStep) {
          const prevWp = curStep >= 0 ? tourWaypoints[curStep] : null
          curStep = s
          setTourStep(s)
          // Smooth lerp targets for camera position + target
          targetCamPos = [...wp.camPos]
          targetCamTarget = [...wp.camTarget]
          // Aplicar/quitar filtros automáticos según el step
          if (wp.isEntanglement) {
            setEntityFilter(new Set(['collab']))
          } else if (wp.isBridgeUsers) {
            setEntityFilter(new Set(['user-bridge', 'user-normal']))
          } else if (prevWp?.isEntanglement || prevWp?.isBridgeUsers) {
            setEntityFilter(new Set())
          }
        }

        //  Lerp suave de posición base de cámara entre steps 
        const lerpSpeed = 0.03 // Suave, ~1s para transición completa
        lerpCamPos[0] += (targetCamPos[0] - lerpCamPos[0]) * lerpSpeed
        lerpCamPos[1] += (targetCamPos[1] - lerpCamPos[1]) * lerpSpeed
        lerpCamPos[2] += (targetCamPos[2] - lerpCamPos[2]) * lerpSpeed
        lerpCamTarget[0] += (targetCamTarget[0] - lerpCamTarget[0]) * lerpSpeed
        lerpCamTarget[1] += (targetCamTarget[1] - lerpCamTarget[1]) * lerpSpeed
        lerpCamTarget[2] += (targetCamTarget[2] - lerpCamTarget[2]) * lerpSpeed

        //  Rotación orbital cinemática continua (no se reinicia por step) 
        {
          const totalElapsedSec = el / 1000 // Tiempo total desde inicio del tour
          const orbitSpeed = 0.08 // rad/s — lenta y cinemática
          const angle = -totalElapsedSec * orbitSpeed
          const cx = lerpCamTarget[0], cy = lerpCamTarget[1], cz = lerpCamTarget[2]
          const dx = lerpCamPos[0] - cx, dz = lerpCamPos[2] - cz
          const radius = Math.sqrt(dx * dx + dz * dz)
          const baseAngle = Math.atan2(dx, dz)
          tourCameraRef.current.position.set(
            cx + Math.sin(baseAngle + angle) * radius,
            lerpCamPos[1],
            cz + Math.cos(baseAngle + angle) * radius
          )
          tourCameraRef.current.target.set(cx, cy, cz)
        }

        //  Trigger BigBang mid-step durante el preludio 
        if (wp.isPreludio && !tourBigBangTriggeredRef.current && wp.triggerBigBangAt) {
          const stepElapsed = (el - stepStarts[s]) / 1000
          if (stepElapsed >= wp.triggerBigBangAt) {
            setTourBigBangFired(true)
            setTourBigBangReplay(r => r + 1)
            tourBigBangTriggeredRef.current = true
          }
        }

        //  Durante void/preludio: overlay negro cubre la escena 
        // Usar filtro de génesis (no null) para que las entidades estén
        // pre-condicionadas al año correcto antes de que se levante el overlay
        if (wp.isVoid || wp.isPreludio) {
          activeNodeIdsRef.current = genesisFilter
          tourRafRef.current = requestAnimationFrame(tick)
          return
        }

        //  Durante génesis: filtrar al primer año con datos reales 
        if (wp.isGenesis) {
          if (temporalRange) {
            const st = useDashboardStore.getState()
            const nodes = st.collaborationDiscovery?.graph?.nodes
            const links = st.collaborationDiscovery?.graph?.links
            if (nodes && links) {
              activeNodeIdsRef.current = computeTemporalVisibility(nodes, links, temporalRange.min, wp.year)
            }
          }
          if (now - lastSliderUI > 80) {
            setLocalSlider(wp.year)
            lastSliderUI = now
          }
          tourRafRef.current = requestAnimationFrame(tick)
          return
        }

        //  Último step: mantener slider en max 
        if (s === lastStepIdx) {
          if (now - lastSliderUI > 80) {
            setLocalSlider(temporalRange.max)
            lastSliderUI = now
          }
          activeNodeIdsRef.current = null
          tourRafRef.current = requestAnimationFrame(tick)
          return
        }

        // Interpolar slider (año)
        if (nxt) {
          const year = wp.year + (nxt.year - wp.year) * easeInOutCubic(t)
          // Actualizar la ref de visibilidad en cada frame (sin re-render)
          if (temporalRange && year < temporalRange.max) {
            const st = useDashboardStore.getState()
            const nodes = st.collaborationDiscovery?.graph?.nodes
            const links = st.collaborationDiscovery?.graph?.links
            if (nodes && links) activeNodeIdsRef.current = computeTemporalVisibility(nodes, links, temporalRange.min, year)
          } else {
            activeNodeIdsRef.current = null
          }
          // Throttle React setState del slider (~12fps) para mover la barra visual
          if (now - lastSliderUI > 80) {
            setLocalSlider(year)
            lastSliderUI = now
          }
        }

        tourRafRef.current = requestAnimationFrame(tick)
      }
      tourRafRef.current = requestAnimationFrame(tick)
    }, 1300) // Esperar 1.3s para que la animación de fade complete
  }, [temporalRange, handleSliderChange, stopTour])

  // Salir del tour con transición suave (secuencial: cámara → UI)
  const exitTourSmooth = useCallback(() => {
    if (tourRafRef.current) { cancelAnimationFrame(tourRafRef.current); tourRafRef.current = null }
    // Fase 1: Fade-out del overlay del tour + mover cámara al centro
    tourCameraRef.current.position.set(0, 280, 600)
    tourCameraRef.current.target.set(0, 30, 0)
    setTourEnded(false)
    setTourFading(false)
    setTourBigBangFired(false)
    setEntityFilter(new Set())
    setTourExiting(true) // Inicia fade-out del overlay
    // Restaurar slider al máximo durante la transición
    if (temporalRange) {
      setLocalSlider(temporalRange.max)
      activeNodeIdsRef.current = null
      setSliderYear(temporalRange.max)
    }
    // Fase 2: Tras la cámara centrarse (~1.6s), revelar la UI
    tourFadeTimeoutRef.current = setTimeout(() => {
      setTourActive(false) // Quita tourHideElement → activa tourRevealElement
      tourCameraRef.current.active = false
      setTourStep(0)
      // Fase 3: Limpieza final tras completar el fade-in de la UI
      setTimeout(() => {
        setTourExiting(false)
        tourFadeTimeoutRef.current = null
      }, 1500)
    }, 1600)
  }, [temporalRange, setSliderYear])

  // Reiniciar el tour desde el principio
  const restartTour = useCallback(() => {
    if (tourRafRef.current) { cancelAnimationFrame(tourRafRef.current); tourRafRef.current = null }
    if (tourFadeTimeoutRef.current) { clearTimeout(tourFadeTimeoutRef.current); tourFadeTimeoutRef.current = null }
    setTourEnded(false)
    setTourActive(false)
    setTourFading(false)
    setTourExiting(false)
    setTourStep(0)
    setTourBigBangFired(false)
    setTourPaused(false)
    tourPausedRef.current = false
    tourPauseAccumRef.current = 0
    tourBigBangTriggeredRef.current = false
    setEntityFilter(new Set()) // Limpiar filtro collab del tour
    tourCameraRef.current.active = false
    // Pequeño delay para que el estado se limpie, luego relanzar
    setTimeout(() => startTour(), 150)
  }, [startTour])

  //  Controles manuales del tour: pausa, siguiente, anterior 
  const toggleTourPause = useCallback(() => {
    if (!tourActive || tourEnded) return
    if (tourPausedRef.current) {
      // Reanudar — acumular tiempo pausado
      tourPauseAccumRef.current += performance.now() - tourPauseStartRef.current
      tourPausedRef.current = false
      setTourPaused(false)
    } else {
      // Pausar — registrar momento
      tourPauseStartRef.current = performance.now()
      tourPausedRef.current = true
      setTourPaused(true)
    }
  }, [tourActive, tourEnded])

  const tourGoNext = useCallback(() => {
    if (!tourActive || tourEnded) return
    const stepStarts = tourStepStartsRef.current
    const wps = tourWaypointsRef.current
    if (!stepStarts.length || !wps.length) return
    const now = performance.now()
    const currentEl = tourPausedRef.current
      ? tourPauseStartRef.current - tourT0Ref.current - tourPauseAccumRef.current
      : now - tourT0Ref.current - tourPauseAccumRef.current
    let s = 0
    while (s < wps.length - 1 && currentEl >= stepStarts[s + 1]) s++
    const nextStep = Math.min(s + 1, wps.length - 1)
    if (nextStep === s) return // ya estamos en el último
    const targetEl = stepStarts[nextStep]
    if (tourPausedRef.current) {
      tourPauseAccumRef.current = tourPauseStartRef.current - tourT0Ref.current - targetEl
    } else {
      tourPauseAccumRef.current = now - tourT0Ref.current - targetEl
    }
  }, [tourActive, tourEnded])

  const tourGoPrev = useCallback(() => {
    if (!tourActive || tourEnded) return
    const stepStarts = tourStepStartsRef.current
    const wps = tourWaypointsRef.current
    if (!stepStarts.length || !wps.length) return
    const now = performance.now()
    const currentEl = tourPausedRef.current
      ? tourPauseStartRef.current - tourT0Ref.current - tourPauseAccumRef.current
      : now - tourT0Ref.current - tourPauseAccumRef.current
    let s = 0
    while (s < wps.length - 1 && currentEl >= stepStarts[s + 1]) s++
    const prevStep = Math.max(s - 1, 0)
    if (prevStep === s) return // ya estamos en el primero
    const targetEl = stepStarts[prevStep]
    // Si retrocedemos antes del preludio, resetear el BigBang
    if (prevStep <= 1) {
      tourBigBangTriggeredRef.current = false
      setTourBigBangFired(false)
    }
    if (tourPausedRef.current) {
      tourPauseAccumRef.current = tourPauseStartRef.current - tourT0Ref.current - targetEl
    } else {
      tourPauseAccumRef.current = now - tourT0Ref.current - targetEl
    }
  }, [tourActive, tourEnded])

  // Escape cancela tour, flechas izq/der navegan, espacio pausa
  useEffect(() => {
    if (!tourActive && !tourFading) return
    const handleKey = (e) => {
      if (e.key === 'Escape') stopTour()
      if (tourActive && !tourEnded) {
        if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggleTourPause() }
        if (e.key === 'ArrowRight') tourGoNext()
        if (e.key === 'ArrowLeft') tourGoPrev()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [tourActive, tourFading, tourEnded, stopTour, toggleTourPause, tourGoNext, tourGoPrev])

  // Cleanup al desmontar
  useEffect(() => () => {
    if (tourRafRef.current) cancelAnimationFrame(tourRafRef.current)
    if (tourFadeTimeoutRef.current) clearTimeout(tourFadeTimeoutRef.current)
  }, [])

  // Cerrar panel temporal al hacer clic fuera
  useEffect(() => {
    if (!showTemporalPanel) return
    const handleClickOutside = (e) => {
      if (temporalRef.current && !temporalRef.current.contains(e.target)) {
        setShowTemporalPanel(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showTemporalPanel])

  // Cerrar dropdown de ajustes al hacer clic fuera
  useEffect(() => {
    if (!showSettings) return
    const handleClickOutside = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSettings])
  const [showTunneling, setShowTunneling] = useState(false)
  const [tunnelingSource, setTunnelingSource] = useState('')
  const [tunnelingTarget, setTunnelingTarget] = useState('')
  const [sourceResults, setSourceResults] = useState([])
  const [targetResults, setTargetResults] = useState([])
  const [sourceInputFocused, setSourceInputFocused] = useState(false)
  const [targetInputFocused, setTargetInputFocused] = useState(false)

  // === Search bar state ===
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchEntity, setSearchEntity] = useState(null) // entidad seleccionada desde búsqueda

  // handleSearchClear se define temprano para usarse en el handler de ESC
  const handleSearchClear = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
    setSearchEntity(null)
  }, [])

  // === Black Hole Gravitational Collapse Exit ===
  const handleExit = useCallback(() => {
    if (isExiting) return
    setIsExiting(true)
    // Restaurar scrollbar al inicio de la salida para evitar salto visual al cerrar
    const html = document.documentElement
    html.style.overflow = ''
    html.style.scrollbarGutter = ''
    // BlackHoleExit Canvas component handles all visuals + calls onComplete
  }, [isExiting])

  const handleExitComplete = useCallback(() => {
    closeCollaborationGraph()
    setIsExiting(false)
  }, [closeCollaborationGraph])

  // === Lens transition state ===
  const [lensTransitioning, setLensTransitioning] = useState(false)
  const [lensLoadingLabel, setLensLoadingLabel] = useState('')
  const [lensTransitionColor, setLensTransitionColor] = useState('#ffffff')
  const lensTransitionRef = useRef(false) // ref to avoid stale closure in async
  const lensWithOverlay = useRef(false) // whether current activation used overlay (needs delay)

  // Filtrar bots del grafo si están desactivados
  const filteredGraph = useMemo(() => {
    const graph = collaborationDiscovery?.graph
    if (!graph || showBots) return graph
    const botIds = new Set(
      graph.nodes.filter(n => n.isBot).map(n => n.id)
    )
    if (botIds.size === 0) return graph
    return {
      nodes: graph.nodes.filter(n => !botIds.has(n.id)),
      links: graph.links.filter(l => !botIds.has(l.source) && !botIds.has(l.target)),
    }
  }, [collaborationDiscovery, showBots])

  const botCount = useMemo(() => {
    const nodes = collaborationDiscovery?.graph?.nodes
    if (!nodes) return 0
    return nodes.filter(n => n.isBot).length
  }, [collaborationDiscovery])

  // === Layout computation via Web Worker (no bloquea el hilo principal) ===
  const layoutWorkerRef = useRef(null)
  const layoutRequestIdRef = useRef(0)
  const [universeData, setUniverseData] = useState(null)

  // Compute tour waypoints when universe data or temporal range change
  useEffect(() => {
    if (universeData && temporalRange) {
      tourWaypointsRef.current = generateTourWaypoints(universeData, temporalRange)
    }
  }, [universeData, temporalRange])

  // Set de IDs de favoritos para filtrado rápido
  // Herencia: si una org es favorita, sus repos y users también se incluyen
  const favoriteIdSet = useMemo(() => {
    if (!showFavoritesOnly || favorites.length === 0) return null
    const ids = new Set(favorites.map(f => f.id))
    if (universeData) {
      // Expandir orgs favoritas → sus repos → sus users
      // type puede ser 'organization' o 'org' según la fuente
      favorites.filter(f => f.type === 'organization' || f.type === 'org').forEach(fav => {
        const orgRepos = universeData.orgRepos?.[fav.id] || []
        orgRepos.forEach(repo => {
          ids.add(repo.id)
          const users = universeData.repoUsers?.[repo.id] || []
          users.forEach(u => ids.add(u.id))
        })
      })
      // Expandir repos favoritos → sus users
      favorites.filter(f => f.type === 'repo' || f.type === 'repository').forEach(fav => {
        const users = universeData.repoUsers?.[fav.id] || []
        users.forEach(u => ids.add(u.id))
      })
    }
    return ids
  }, [showFavoritesOnly, favorites, universeData])

  // Crear/destruir Web Worker
  useEffect(() => {
    const worker = new Worker(
      new URL('./computeLayout.worker.js', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (e) => {
      const { result, requestId } = e.data
      if (requestId !== layoutRequestIdRef.current) return
      if (!result) { setUniverseData(null); return }
      // Procesar en chunks asíncronos para no bloquear el hilo principal
      processLayoutResultAsync(result, layoutRequestIdRef).then(processed => {
        if (processed) setUniverseData(processed)
      })
    }
    layoutWorkerRef.current = worker
    return () => { worker.terminate(); layoutWorkerRef.current = null }
  }, [])

  // Enviar datos al worker cuando cambian las dependencias del grafo
  // IMPORTANTE: esperar a que las métricas se carguen antes de computar el layout
  // para evitar doble computación (sin métricas → con métricas) que cambia posiciones
  useEffect(() => {
    if (!filteredGraph?.nodes?.length) { setUniverseData(null); return }
    // Si las métricas se están cargando o aún no se ha intentado cargarlas, esperar
    if (isLoadingMetrics || (!networkMetrics && !metricsLoadAttempted)) return
    const id = ++layoutRequestIdRef.current
    layoutWorkerRef.current?.postMessage({
      graph: filteredGraph,
      nodeMetrics: networkMetrics?.node_metrics ?? null,
      requestId: id,
    })
  }, [filteredGraph, networkMetrics, isLoadingMetrics, metricsLoadAttempted])

  //  Ocultar scrollbar del body al entrar al universo (incluida pantalla de carga) 
  useEffect(() => {
    if (showCollaborationGraph) {
      const html = document.documentElement
      const prevOverflow = html.style.overflow
      const prevGutter = html.style.scrollbarGutter
      html.style.overflow = 'hidden'
      html.style.scrollbarGutter = 'auto'
      return () => { html.style.overflow = prevOverflow; html.style.scrollbarGutter = prevGutter }
    }
  }, [showCollaborationGraph])

  useEffect(() => {
    if (showCollaborationGraph) {
      requestAnimationFrame(() => setEntering(true))
      setIsExiting(false)
      setSceneReady(false)
      setLoaderVisible(true)
      setLoaderFading(false)
      setAnimationStarted(false)
      setCanvasMounted(false)
      // Retrasar montaje del Canvas 1 frame para que el loader se pinte primero
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setCanvasMounted(true))
      })
    } else {
      setEntering(false); setIsExiting(false); setSelectedEntity(null); setHovered(null); setFocusTarget(null)
      setSceneReady(false); setLoaderVisible(true); setLoaderFading(false); setAnimationStarted(false); setUiVisible(false)
      setCanvasMounted(false)
    }
  }, [showCollaborationGraph])

  //  Tooltip – delegación global sobre data-tip 
  useEffect(() => {
    const onOver = (e) => {
      const el = e.target.closest('[data-tip]')
      if (el) {
        clearTimeout(tooltipTimeout.current)
        const rect = el.getBoundingClientRect()
        setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 })
        setTooltipText(el.getAttribute('data-tip'))
      }
    }
    const onOut = (e) => {
      const el = e.target.closest('[data-tip]')
      if (el && !el.contains(e.relatedTarget)) {
        tooltipTimeout.current = setTimeout(() => setTooltipText(''), 120)
      }
    }
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
    }
  }, [])

  //  Cierre animado del panel 
  const closePanelTimerRef = useRef(null)
  const handleClosePanel = useCallback(() => {
    setPanelClosing(true)
    if (closePanelTimerRef.current) clearTimeout(closePanelTimerRef.current)
    closePanelTimerRef.current = setTimeout(() => {
      setSelectedEntity(null)
      setResetTrigger(t => t + 1)
      setNavHistory([])
      setDetailTab('info')
      setPinnedEntity(null)
      setPinnedData(null)
      setPanelClosing(false)
      setDetailExpanded(false)
      closePanelTimerRef.current = null
    }, 280)
  }, [])
  // Cleanup del timer de cierre en unmount
  useEffect(() => () => { if (closePanelTimerRef.current) clearTimeout(closePanelTimerRef.current) }, [])

  useEffect(() => {
    if (!showCollaborationGraph) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (searchEntity) { handleSearchClear() }
        else if (detailExpanded) { setDetailExpanded(false) }
        else if (selectedEntity) { handleClosePanel() }
        else handleExit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCollaborationGraph, selectedEntity, searchEntity, handleExit, handleSearchClear, handleClosePanel, detailExpanded])

  // Mapeo de filtro activo → tipos de entidad permitidos para selección
  const allowedTypes = useMemo(() => {
    if (entityFilter.size === 0) return null // sin filtro → todo permitido
    const types = new Set()
    if (entityFilter.has('org') || entityFilter.has('collab')) types.add('org')
    if (entityFilter.has('repo')) types.add('repo')
    if (entityFilter.has('user-normal') || entityFilter.has('user-bridge')) types.add('user')
    return types.size > 0 ? types : null
  }, [entityFilter])

  const handleSelect = useCallback((entity, pos) => {
    if (allowedTypes && !allowedTypes.has(entity.type)) return // bloquear selección fuera del filtro
    setSelectedEntity(entity)
    if (pos) setFocusTarget(pos)
  }, [allowedTypes])

  const handleReset = useCallback(() => {
    setSelectedEntity(null)
    setResetTrigger(t => t + 1)
    setNavHistory([])
    setDetailTab('info')
  }, [])

  // Navegar a una entidad desde dentro del panel (push a historial)
  const navigateToEntity = useCallback((entity) => {
    if (!entity || !universeData) return
    setNavHistory(prev => selectedEntity ? [...prev, selectedEntity] : prev)
    setSelectedEntity(entity)
    setDetailTab('info')
    const pos = universeData.positions?.[entity.id]
    if (pos) setFocusTarget(pos)
  }, [universeData, selectedEntity])

  // Volver al nodo anterior del historial
  const navigateBack = useCallback(() => {
    setNavHistory(prev => {
      if (prev.length === 0) return prev
      const newHist = [...prev]
      const prevEntity = newHist.pop()
      setSelectedEntity(prevEntity)
      setDetailTab('info')
      const pos = universeData?.positions?.[prevEntity.id]
      if (pos) setFocusTarget(pos)
      return newHist
    })
  }, [universeData])

  //  WEB WORKER: computation off-main-thread (progressive) 
  const [detailData, setDetailData] = useState(null)
  const detailRequestIdRef = useRef(0)
  useEffect(() => {
    const w = new Worker(
      new URL('./computeDetailData.worker.js', import.meta.url)
    )
    w.onmessage = (e) => {
      const { phase, data, requestId } = e.data
      // Descartar resultados obsoletos si el usuario seleccionó otra entidad
      if (requestId !== detailRequestIdRef.current) return
      if (phase === 1) {
        // Core data + DNA - show panel immediately
        setDetailData(data)
        setDetailLoading(false)
      } else if (phase === 2) {
        // Medium features (impact sims + collab matrix) - merge
        setDetailData(prev => prev ? { ...prev, ...data } : data)
      } else if (phase === 3) {
        // Heavy features (similar entities) - merge + mark complete
        setDetailData(prev => prev ? { ...prev, ...data, _advancedLoaded: true } : data)
      }
    }
    detailWorkerRef.current = w
    return () => w.terminate()
  }, [])

  useEffect(() => {
    if (!selectedEntity) { setDetailData(null); setDetailLoading(false); return }
    setDetailLoading(true)
    setDetailData(null)
    const id = ++detailRequestIdRef.current
    detailWorkerRef.current?.postMessage({ selectedEntity, universeData, networkMetrics, requestId: id })
  }, [selectedEntity, universeData, networkMetrics])
  // Pin / unpin para modo comparación
  const handlePinToggle = useCallback(() => {
    if (pinnedEntity?.id === selectedEntity?.id) {
      setPinnedEntity(null)
      setPinnedData(null)
    } else {
      setPinnedEntity(selectedEntity)
      setPinnedData(detailData)
    }
  }, [pinnedEntity, selectedEntity, detailData])

  const handleSceneReady = useCallback(() => setSceneReady(true), [])

  // === FLUJO DE CARGA OPTIMIZADO ===
  // 1. sceneReady (todas las geometrías montadas) → empezar fade del loader
  useEffect(() => {
    if (sceneReady && loaderVisible && !loaderFading) {
      const t = setTimeout(() => setLoaderFading(true), 300)
      return () => clearTimeout(t)
    }
  }, [sceneReady, loaderVisible, loaderFading])

  // 2. Cuando el fade CSS termina → ocultar loader completamente
  useEffect(() => {
    if (loaderFading) {
      const t = setTimeout(() => setLoaderVisible(false), 1100)
      return () => clearTimeout(t)
    }
  }, [loaderFading])

  // 3. Cuando el loader desaparece → arrancar animación del Big Bang
  //    El usuario ve el proceso de construcción FRESCO desde el inicio
  //    Guardar: no re-activar durante el tour (startTour lo pone a false)
  useEffect(() => {
    if (!loaderVisible && sceneReady && !animationStarted && !tourActive) {
      setAnimationStarted(true)
    }
  }, [loaderVisible, sceneReady, animationStarted, tourActive])

  // 4. Mostrar UI después de que TODAS las fases de animación hayan terminado
  // entanglement (última fase) empieza a 6.5s y dura 1.8s → finaliza a ~8.3s
  // Guardar: no ocultar UI durante el tour (el overlay necesita uiVisible=true)
  useEffect(() => {
    if (animationStarted) {
      const t = setTimeout(() => setUiVisible(true), 8500)
      return () => clearTimeout(t)
    } else if (!tourActive) {
      setUiVisible(false)
    }
  }, [animationStarted, tourActive])

  // Auto-load network metrics when universe opens (solo 1 intento)
  useEffect(() => {
    if (showCollaborationGraph && !networkMetrics && !isLoadingMetrics && !metricsLoadAttempted) {
      loadNetworkMetrics()
    }
  }, [showCollaborationGraph, networkMetrics, isLoadingMetrics, metricsLoadAttempted, loadNetworkMetrics])

  // === LENS TRANSITION HANDLER ===
  const LENS_NAMES = { communities: 'Comunidades', centrality: 'Centralidad', busFactor: 'Resiliencia', intensity: 'Intensidad' }
  const LENS_COLORS = { communities: '#6c5ce7', centrality: '#00b4d8', busFactor: '#ff6b6b', intensity: '#ffd166' }

  const handleLensClick = useCallback(async (lensId) => {
    if (lensTransitionRef.current) return // prevent double-click
    lensTransitionRef.current = true

    const isDeactivating = activeLens === lensId
    const isSwitching = activeLens && !isDeactivating // switching from one lens to another

    // Deactivating or switching: no overlay needed, just animate colors back/to new lens
    if (isDeactivating) {
      lensWithOverlay.current = false
      setActiveLens(lensId) // toggles to null
      lensTransitionRef.current = false
      return
    }

    if (isSwitching) {
      // Switching between lenses: quick transition without overlay
      lensWithOverlay.current = false
      setActiveLens(lensId)
      lensTransitionRef.current = false
      return
    }

    // Activating a lens for the first time: show overlay
    lensWithOverlay.current = true
    setLensTransitioning(true)
    setLensTransitionColor(LENS_COLORS[lensId] || '#ffffff')
    setLensLoadingLabel(
      !networkMetrics
        ? 'Analizando red cuántica...'
        : `Renderizando ${LENS_NAMES[lensId] || lensId}...`
    )

    try {
      // Wait for CSS fade-out transition (500ms)
      await new Promise(r => setTimeout(r, 550))

      // Ensure metrics are loaded
      if (!networkMetrics) {
        setLensLoadingLabel('Procesando estructura de red...')
        const success = await loadNetworkMetrics()
        if (!success) {
          return
        }
        setLensLoadingLabel(`Renderizando ${LENS_NAMES[lensId] || lensId}...`)
        await new Promise(r => setTimeout(r, 300))
      }

      // Apply lens AND reveal simultaneously - color animation starts after canvas de-blurs
      setActiveLens(lensId)
    } finally {
      // Garantizar reset del estado incluso si hay excepción
      setLensTransitioning(false)
      setLensLoadingLabel('')
      lensTransitionRef.current = false
    }
  }, [activeLens, networkMetrics, loadNetworkMetrics, setActiveLens])

  // Compute per-node lens color data based on active lens
  const lensData = useMemo(() => {
    if (!activeLens || !networkMetrics?.node_metrics) return null
    const nm = networkMetrics.node_metrics
    const map = {}
    const hexToRgb = (hex) => {
      const c = new THREE.Color(hex)
      return { r: c.r, g: c.g, b: c.b }
    }

    // Percentile rank via sorted array — spreads skewed distributions uniformly across [0,1]
    const percentileRank = (sorted, value) => {
      if (sorted.length <= 1) return 0.5
      let lo = 0, hi = sorted.length
      while (lo < hi) { const mid = (lo + hi) >> 1; sorted[mid] < value ? lo = mid + 1 : hi = mid }
      return lo / (sorted.length - 1)
    }

    if (activeLens === 'communities') {
      Object.entries(nm).forEach(([id, m]) => {
        if (m.community_color) map[id] = hexToRgb(m.community_color)
      })
    } else if (activeLens === 'centrality') {
      // Data-driven: percentile rank of betweenness → brightness gradient
      // Material lerps to white when active, so colors render directly
      // Separate percentile ranks per entity type to avoid cross-type compression
      const repoEntries = [], otherEntries = []
      Object.entries(nm).forEach(([id, m]) => {
        if (id.startsWith('repo_')) repoEntries.push([id, m])
        else otherEntries.push([id, m])
      })
      const repoVals = repoEntries.map(([, m]) => m.betweenness || 0).sort((a, b) => a - b)
      const otherVals = otherEntries.map(([, m]) => m.betweenness || 0).sort((a, b) => a - b)
      repoEntries.forEach(([id, m]) => {
        const t = percentileRank(repoVals, m.betweenness || 0)
        const b = 0.05 + t * t * 1.8
        map[id] = { r: b * 0.3, g: b * 0.85, b: b }
      })
      otherEntries.forEach(([id, m]) => {
        const t = percentileRank(otherVals, m.betweenness || 0)
        const b = 0.03 + t * t * 0.35
        map[id] = { r: b * 0.7, g: b * 0.95, b: b }
      })
    } else if (activeLens === 'busFactor') {
      // Resiliencia: repos colored by contributor distribution level
      // Material lerps to white when lens active, so these colors appear as-is
      const riskBrightness = {
        critical: { r: 1.8, g: 0.2, b: 0.15 },   // pilar clave (1 contributor)
        high:     { r: 1.8, g: 0.9, b: 0.1 },     // núcleo reducido (2)
        medium:   { r: 1.6, g: 1.5, b: 0.15 },    // equilibrado (3-4)
        low:      { r: 0.2, g: 1.6, b: 0.4 },     // alta resiliencia (5+)
      }
      Object.entries(nm).forEach(([id, m]) => {
        if (m.bus_factor_risk && riskBrightness[m.bus_factor_risk]) {
          map[id] = riskBrightness[m.bus_factor_risk]
        } else if (m.bus_factor_risk) {
          // Unknown risk → neutral medium brightness
          map[id] = { r: 0.5, g: 0.5, b: 0.5 }
        } else {
          // Orgs and users: dim down to let repos stand out
          map[id] = { r: 0.06, g: 0.06, b: 0.08 }
        }
      })
    } else if (activeLens === 'intensity') {
      // Data-driven: percentile rank of degree → brightness gradient
      // Material lerps to white when active, so colors render directly
      // Separate percentile ranks per entity type to avoid cross-type compression
      const repoEntries = [], otherEntries = []
      Object.entries(nm).forEach(([id, m]) => {
        if (id.startsWith('repo_')) repoEntries.push([id, m])
        else otherEntries.push([id, m])
      })
      const repoVals = repoEntries.map(([, m]) => m.degree || 0).sort((a, b) => a - b)
      const otherVals = otherEntries.map(([, m]) => m.degree || 0).sort((a, b) => a - b)
      repoEntries.forEach(([id, m]) => {
        const t = percentileRank(repoVals, m.degree || 0)
        const b = 0.05 + t * t * 1.8
        map[id] = { r: b, g: b * 0.65, b: b * 0.08 }
      })
      otherEntries.forEach(([id, m]) => {
        const t = percentileRank(otherVals, m.degree || 0)
        const b = 0.03 + t * t * 0.35
        map[id] = { r: b, g: b * 0.7, b: b * 0.15 }
      })
    }
    return Object.keys(map).length > 0 ? map : null
  }, [activeLens, networkMetrics])

  // ====================================================================
  // MULTI-ORG COLOR MAP: users que participan en ≥2 orgs → colores de comunidad
  // Para animar transición entre colores de cada org en la lente de comunidades
  // ====================================================================
  const multiOrgColors = useMemo(() => {
    if (activeLens !== 'communities' || !universeData || !networkMetrics?.node_metrics) return null
    const nm = networkMetrics.node_metrics
    const { orgRepos, repoUsers } = universeData
    // Construir user → Set<orgId>
    const userOrgMap = {}
    Object.entries(orgRepos).forEach(([orgId, repos]) => {
      repos.forEach(r => {
        (repoUsers[r.id] || []).forEach(u => {
          if (!userOrgMap[u.id]) userOrgMap[u.id] = new Set()
          userOrgMap[u.id].add(orgId)
        })
      })
    })
    const hexToRgb = (hex) => { const c = new THREE.Color(hex); return { r: c.r, g: c.g, b: c.b } }
    const result = {}
    Object.entries(userOrgMap).forEach(([userId, orgSet]) => {
      if (orgSet.size < 2) return
      const colors = []
      const seen = new Set()
      orgSet.forEach(orgId => {
        const orgMetric = nm[orgId]
        const hex = orgMetric?.community_color
        if (hex && !seen.has(hex)) { seen.add(hex); colors.push(hexToRgb(hex)) }
      })
      if (colors.length >= 2) result[userId] = colors
    })
    return Object.keys(result).length > 0 ? result : null
  }, [activeLens, universeData, networkMetrics])

  // ====================================================================
  // AUTOCOMPLETE: construido desde universeData (siempre disponible)
  // Ordenado por relevancia: bridges > más conexiones > alfabético
  // ====================================================================
  const searchableNodes = useMemo(() => {
    if (!universeData) return []
    const nodes = []

    // Orgs
    ;(universeData.orgNodes || []).forEach(org => {
      const repoCount = (universeData.orgRepos?.[org.id] || []).length
      nodes.push({
        id: org.id,
        label: org.login || org.name || org.id,
        type: 'org',
        relevance: 100 + repoCount * 10, // orgs siempre arriba, más repos = más relevante
      })
    })

    // Repos
    ;(universeData.repoNodes || []).forEach(repo => {
      const userCount = (universeData.repoUsers?.[repo.id] || []).length
      const stars = repo.stars || 0
      nodes.push({
        id: repo.id,
        label: repo.full_name || repo.name || repo.id,
        type: 'repo',
        relevance: 50 + userCount * 5 + Math.min(stars / 100, 20),
      })
    })

    // Users - pre-build reverse index userId→repoCount (O(R*A) una sola vez)
    const userRepoCount = new Map()
    for (const [, users] of Object.entries(universeData.repoUsers || {})) {
      for (const u of users) {
        userRepoCount.set(u.id, (userRepoCount.get(u.id) || 0) + 1)
      }
    }
    ;(universeData.userNodes || []).forEach(user => {
      const repoCount = userRepoCount.get(user.id) || 0
      nodes.push({
        id: user.id,
        label: user.login || user.id,
        type: 'user',
        isBridge: user.isBridge,
        relevance: (user.isBridge ? 80 : 0) + repoCount * 8,
      })
    })

    // Ordenar por relevancia descendente
    nodes.sort((a, b) => b.relevance - a.relevance)
    return nodes
  }, [universeData])

  const filterNodes = useCallback((query) => {
    if (!query || query.length < 1) return []
    const q = query.toLowerCase()
    const matches = searchableNodes.filter(n => n.label.toLowerCase().includes(q))
    // Agrupar por tipo: orgs primero, luego repos, luego users
    const typeOrder = { org: 0, repo: 1, user: 2 }
    matches.sort((a, b) => {
      const td = typeOrder[a.type] - typeOrder[b.type]
      if (td !== 0) return td
      return b.relevance - a.relevance
    })
    return matches
  }, [searchableNodes])

  // === SEARCH HIGHLIGHT: calcular set de IDs relacionados con la búsqueda ===
  const searchHighlightSet = useMemo(() => {
    if (!searchEntity || !universeData) return null
    // Encontrar la entidad real en universeData
    const allNodes = [
      ...(universeData.orgNodes || []),
      ...(universeData.repoNodes || []),
      ...(universeData.userNodes || []),
    ]
    const entity = allNodes.find(n => n.id === searchEntity.id) || searchEntity
    return computeRelatedIds(entity, universeData)
  }, [searchEntity, universeData])

  const handleSearchSelect = useCallback((node) => {
    setSearchQuery(node.label)
    setSearchResults([])
    setSearchFocused(false)
    // Buscar entidad real en universeData y seleccionarla como searchEntity
    const entity =
      universeData?.orgNodes?.find(n => n.id === node.id) ||
      universeData?.repoNodes?.find(n => n.id === node.id) ||
      universeData?.userNodes?.find(n => n.id === node.id)
    if (entity) {
      setSearchEntity({ ...entity, type: node.type })
      // Enfocar cámara en la entidad
      const pos = universeData?.positions?.[node.id]
      if (pos) setFocusTarget(pos)
    }
  }, [universeData])

  const handleSearchChange = useCallback((e) => {
    const val = e.target.value
    setSearchQuery(val)
    setSearchResults(filterNodes(val))
    if (!val) setSearchEntity(null)
  }, [filterNodes])

  const handleTunnelingSearch = useCallback(async () => {
    if (!tunnelingSource || !tunnelingTarget) return
    // Buscar ID del nodo por label o ID directo
    const findNode = (text) =>
      searchableNodes.find(n => n.label === text) ||
      searchableNodes.find(n => n.id === text) ||
      searchableNodes.find(n => n.label.toLowerCase() === text.toLowerCase())
    const src = findNode(tunnelingSource)
    const tgt = findNode(tunnelingTarget)
    if (src && tgt) {
      const result = await findQuantumPathAction(src.id, tgt.id)
      // Auto-focus: vista panorámica que muestra todo el path
      if (result?.found && result.path?.length >= 2 && universeData?.positions) {
        // Calcular bounding box de todas las posiciones del path
        let minX = Infinity, minY = Infinity, minZ = Infinity
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
        let count = 0
        for (const node of result.path) {
          const p = universeData.positions[node.id]
          if (!p) continue
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
          minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
          count++
        }
        if (count >= 2) {
          const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2
          const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ
          const maxDim = Math.max(sx, sy, sz, 25) // mínimo 25 para paths cortos
          const dist = maxDim * 1.1 // factor de alejamiento para ver todo holgadamente
          setFocusTarget({
            position: { x: cx, y: cy, z: cz },
            offset: new THREE.Vector3(dist * 0.45, dist * 0.35, dist * 0.55)
          })
        }
      }
    }
  }, [tunnelingSource, tunnelingTarget, searchableNodes, findQuantumPathAction, universeData])

  if (!showCollaborationGraph) return null

  const metrics = collaborationDiscovery?.metrics

  // Clase CSS para elementos de UI durante/después del tour
  // Fase 1 (tourExiting + tourActive): overlay se desvanece, UI sigue oculta
  // Fase 2 (tourExiting + !tourActive): UI aparece gradualmente
  const tourUIClass = (tourExiting && !tourActive)
    ? styles.tourRevealElement
    : (tourFading || tourActive) ? styles.tourHideElement : ''

  return (
    <div className={`${styles.universe} ${entering ? styles.universeVisible : ''} ${isExiting ? styles.universeExiting : ''}`}>
      {/* Black Hole Gravitational Collapse — Canvas2D particle simulation */}
      <BlackHoleExit active={isExiting} onComplete={handleExitComplete} wrapperRef={canvasWrapperRef} />
      {/* Big Bang Genesis — Canvas2D particle explosion overlay */}
      <BigBangEntry active={animationStarted && !isExiting} wrapperRef={canvasWrapperRef} replay={tourBigBangReplay} />
      <div ref={canvasWrapperRef} className={`${styles.canvasWrapper} ${lensTransitioning ? styles.canvasTransitioning : ''}`}>
        {canvasMounted && (
        <Canvas
          camera={{ position: [0, 80, 260], fov: 60, near: 0.1, far: 8000 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
          dpr={[1, 1.5]}
          raycaster={{ params: { Points: { threshold: 3 } } }}
          onCreated={({ gl }) => gl.setClearColor('#020208')}
          frameloop={(animationStarted || tourActive) ? 'always' : 'demand'}
        >
          <QuantumScene
            universeData={universeData}
            onSelect={handleSelect}
            setHovered={setHovered}
            focusTarget={focusTarget}
            resetTrigger={resetTrigger}
            selectedEntity={selectedEntity}
            lensData={lensData}
            lensRevealDelay={lensWithOverlay.current ? 600 : 100}
            searchHighlightSet={searchHighlightSet}
            onSceneReady={handleSceneReady}
            startAnimation={animationStarted}
            showZones={showZones}
            entityFilter={entityFilter}
            tunnelPath={tunnelingPath}
            favoriteIdSet={favoriteIdSet}
            multiOrgColors={multiOrgColors}
            activeNodeIdsRef={activeNodeIdsRef}
            tourCameraRef={tourCameraRef}
          />
          {/* Label flotante - fuera de QuantumScene para no causar re-renders de la escena 3D */}
          <FloatingLabel entity={hovered?.entity ?? null} position={hovered?.pos ?? null} />
          {/* Auto-labels de viewport: muestran entidades relacionadas visibles al rotar con foco */}
          {selectedEntity && universeData && (
            <ViewportLabels universeData={universeData} selectedEntity={selectedEntity} />
          )}
        </Canvas>
        )}
      </div>

      {/* === QUANTUM LOADING OVERLAY - pantalla de carga inicial === */}
      {loaderVisible && (
        <div className={`${styles.quantumLoader} ${loaderFading ? styles.quantumLoaderHide : ''}`}>
          <div className={styles.loaderPulseRing} />
          <div className={styles.loaderPulseRing2} />
          <div className={styles.loaderScanline} />
          <div className={styles.loaderContent}>
            <img src="/logo.png" alt="ENTANGLE" className={styles.loaderLogo} />
            <p className={styles.loaderSub}>Quantum Software Ecosystem Analysis</p>
            <div className={styles.loaderSpinnerWrap}>
              {/* Átomo SVG realista con órbitas elípticas y electrones brillantes */}
              <svg className={styles.loaderAtomSVG} viewBox="-60 -60 120 120" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  {/* Glow filters para núcleo y electrones */}
                  <radialGradient id="nucleusGrad">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                    <stop offset="35%" stopColor="#00e5ff" stopOpacity="0.7" />
                    <stop offset="70%" stopColor="#0088aa" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="transparent" />
                  </radialGradient>
                  <filter id="glowNucleus" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="glowElectron" x="-200%" y="-200%" width="500%" height="500%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="glowOrbit" x="-10%" y="-10%" width="120%" height="120%">
                    <feGaussianBlur stdDeviation="0.8" />
                  </filter>
                </defs>

                {/* Órbita 1: cyan - horizontal inclinada */}
                <ellipse className={styles.svgOrbit1} cx="0" cy="0" rx="46" ry="16"
                  fill="none" stroke="rgba(0,212,228,0.18)" strokeWidth="0.7"
                  transform="rotate(-20)" filter="url(#glowOrbit)" />
                {/* Órbita 2: purple - 60° */}
                <ellipse className={styles.svgOrbit2} cx="0" cy="0" rx="42" ry="14"
                  fill="none" stroke="rgba(157,111,219,0.16)" strokeWidth="0.7"
                  transform="rotate(40)" filter="url(#glowOrbit)" />
                {/* Órbita 3: green - 120° */}
                <ellipse className={styles.svgOrbit3} cx="0" cy="0" rx="44" ry="15"
                  fill="none" stroke="rgba(0,255,159,0.14)" strokeWidth="0.7"
                  transform="rotate(100)" filter="url(#glowOrbit)" />

                {/* Electrón 1: cyan */}
                <g className={styles.svgElectronGroup1} style={{ transformOrigin: '0 0' }}>
                  <g transform="rotate(-20)">
                    <circle cx="46" cy="0" r="2.8" fill="#00e5ff" filter="url(#glowElectron)" opacity="0.95" />
                    <circle cx="46" cy="0" r="1.2" fill="#ffffff" opacity="0.9" />
                  </g>
                </g>
                {/* Electrón 2: purple */}
                <g className={styles.svgElectronGroup2} style={{ transformOrigin: '0 0' }}>
                  <g transform="rotate(40)">
                    <circle cx="42" cy="0" r="2.4" fill="#9D6FDB" filter="url(#glowElectron)" opacity="0.9" />
                    <circle cx="42" cy="0" r="1" fill="#ffffff" opacity="0.85" />
                  </g>
                </g>
                {/* Electrón 3: green */}
                <g className={styles.svgElectronGroup3} style={{ transformOrigin: '0 0' }}>
                  <g transform="rotate(100)">
                    <circle cx="44" cy="0" r="2" fill="#00ff9f" filter="url(#glowElectron)" opacity="0.85" />
                    <circle cx="44" cy="0" r="0.9" fill="#ffffff" opacity="0.8" />
                  </g>
                </g>

                {/* Núcleo central con glow */}
                <circle cx="0" cy="0" r="6" fill="url(#nucleusGrad)" filter="url(#glowNucleus)" className={styles.svgNucleus} />
                <circle cx="0" cy="0" r="2.5" fill="rgba(255,255,255,0.85)" className={styles.svgNucleus} />
              </svg>
            </div>
            {/* Mensajes cíclicos - puro CSS, sin JS setInterval */}
            <div className={styles.loaderMessages}>
              <p className={styles.loaderMsgItem} style={{ animationDelay: '0s' }}>Colapsando funciones de onda...</p>
              <p className={styles.loaderMsgItem} style={{ animationDelay: '1.6s' }}>Calculando posiciones orbitales...</p>
              <p className={styles.loaderMsgItem} style={{ animationDelay: '3.2s' }}>Entrelazando nodos cuánticos...</p>
              <p className={styles.loaderMsgItem} style={{ animationDelay: '4.8s' }}>Materializando el universo...</p>
            </div>
          </div>
        </div>
      )}

      {/* === LENS TRANSITION OVERLAY - Atom spinner === */}
      {lensTransitioning && (
        <div className={styles.lensTransitionOverlay}>
          <svg className={styles.lensAtomSpinner} viewBox="0 0 120 120" width="90" height="90">
            <ellipse cx="60" cy="60" rx="50" ry="18" fill="none" stroke={`${lensTransitionColor}50`} strokeWidth="1.5" className={styles.lensAtomOrbit1} />
            <ellipse cx="60" cy="60" rx="50" ry="18" fill="none" stroke={`${lensTransitionColor}40`} strokeWidth="1.5" className={styles.lensAtomOrbit2} />
            <ellipse cx="60" cy="60" rx="50" ry="18" fill="none" stroke={`${lensTransitionColor}30`} strokeWidth="1.5" className={styles.lensAtomOrbit3} />
            <circle r="4" fill={lensTransitionColor} filter="url(#lensGlow)">
              <animateMotion dur="2s" repeatCount="indefinite" path="M 110,60 A 50,18 0 1,1 10,60 A 50,18 0 1,1 110,60" />
            </circle>
            <circle r="3.5" fill={lensTransitionColor} opacity="0.7" filter="url(#lensGlow)">
              <animateMotion dur="2.6s" repeatCount="indefinite" path="M 95,82.7 A 50,18 60 1,1 25,37.3 A 50,18 60 1,1 95,82.7" />
            </circle>
            <circle r="3" fill={lensTransitionColor} opacity="0.5" filter="url(#lensGlow)">
              <animateMotion dur="3.2s" repeatCount="indefinite" path="M 25,82.7 A 50,18 120 1,1 95,37.3 A 50,18 120 1,1 25,82.7" />
            </circle>
            <circle cx="60" cy="60" r="6" fill={`${lensTransitionColor}80`} className={styles.lensAtomCore} />
            <circle cx="60" cy="60" r="3" fill="rgba(255,255,255,0.7)" />
            <defs>
              <filter id="lensGlow" x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation="4" result="g" />
                <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
          </svg>
          <span className={styles.lensTransitionLabel}>{lensLoadingLabel}</span>
        </div>
      )}

      {/* Header */}
      <div className={`${styles.universeUI} ${uiVisible ? styles.universeUIVisible : ''}`}>
      <header className={`${styles.header} ${tourUIClass}`}>
        <div className={styles.headerLeft}>
          <div className={styles.headerBrand}>
            <span className={styles.headerAtom}>⚛</span>
            <div className={styles.headerTitleGroup}>
              <h2>ENTANGLE</h2>
              <span className={styles.headerTag}>Quantum Field</span>
            </div>
          </div>
          <div className={styles.headerDividerV} />
          <span className={styles.headerSub}>Grafo de colaboración cuántica</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.settingsWrapper} ref={settingsRef}>
            <button
              className={`${styles.settingsBtn} ${showSettings ? styles.settingsBtnActive : ''}`}
              onClick={() => setShowSettings(s => !s)}
              data-tip="Ajustes"
            >
              <FiSettings size={14} />
              <span>Ajustes</span>
            </button>
            {showSettings && (
              <div className={styles.settingsDropdown}>
                <div className={styles.settingsSection}>
                  <span className={styles.settingsSectionTitle}>Visualización</span>
                  <button
                    className={`${styles.settingsItem} ${showZones ? styles.settingsItemActive : ''}`}
                    onClick={() => setShowZones(z => !z)}
                  >
                    <FiTarget size={12} />
                    <span>Fronteras zonales</span>
                    <span className={`${styles.settingsToggleIndicator} ${showZones ? styles.settingsToggleOn : ''}`} />
                  </button>
                  {botCount > 0 && (
                    <button
                      className={`${styles.settingsItem} ${showBots ? styles.settingsItemActive : ''}`}
                      onClick={() => { setShowBots(b => !b); setSelectedEntity(null); setResetTrigger(t => t + 1) }}
                    >
                      {showBots ? <FiEye size={12} /> : <FiEyeOff size={12} />}
                      <span>{showBots ? 'Bots visibles' : `Bots ocultos (${botCount})`}</span>
                      <span className={`${styles.settingsToggleIndicator} ${showBots ? styles.settingsToggleOn : ''}`} />
                    </button>
                  )}
                  {favorites.length > 0 && (
                    <button
                      className={`${styles.settingsItem} ${showFavoritesOnly ? styles.settingsItemActive : ''}`}
                      onClick={() => setShowFavoritesOnly(f => !f)}
                    >
                      <FiStar size={12} />
                      <span>{showFavoritesOnly ? `Solo favoritos (${favorites.length})` : `Filtrar favoritos (${favorites.length})`}</span>
                      <span className={`${styles.settingsToggleIndicator} ${showFavoritesOnly ? styles.settingsToggleOn : ''}`} />
                    </button>
                  )}
                </div>
                <div className={styles.settingsDivider} />
                <div className={styles.settingsSection}>
                  <span className={styles.settingsSectionTitle}>Resaltar entidades</span>
                  {[
                    { key: 'org', icon: <FiGrid size={12} />, label: 'Organizaciones', color: '#00f7ff' },
                    { key: 'repo', icon: <FiGitBranch size={12} />, label: 'Repositorios', color: '#bd00ff' },
                    { key: 'user-normal', icon: <FiUser size={12} />, label: 'Usuarios', color: '#00ff9f' },
                    { key: 'user-bridge', icon: <FiZap size={12} />, label: 'Bridge users', color: '#ffbd00' },
                    { key: 'collab', icon: <FiShare2 size={12} />, label: 'Colaboración org↔org', color: '#ff6b6b' },
                  ].map(({ key, icon, label, color }) => (
                    <button
                      key={key}
                      className={`${styles.settingsItem} ${entityFilter.has(key) ? styles.settingsItemActive : ''}`}
                      style={entityFilter.has(key) ? { '--filter-color': color } : undefined}
                      onClick={() => setEntityFilter(prev => {
                        const next = new Set(prev)
                        next.has(key) ? next.delete(key) : next.add(key)
                        return next
                      })}
                    >
                      {icon}
                      <span>{label}</span>
                      <span
                        className={styles.settingsFilterDot}
                        style={{ background: entityFilter.has(key) ? color : 'rgba(255,255,255,0.15)' }}
                      />
                    </button>
                  ))}
                </div>
                <div className={styles.settingsDivider} />
                <div className={styles.settingsSection}>
                  <span className={styles.settingsSectionTitle}><FiCalendar size={10} style={{ marginRight: 4 }} />Filtro temporal</span>
                  <div className={styles.temporalFilterRow}>
                    <div className={styles.temporalInputGroup}>
                      <label className={styles.temporalLabel}>Desde</label>
                      <input
                        type="number"
                        className={styles.temporalInput}
                        placeholder="2015"
                        min={2008}
                        max={2030}
                        value={tempYearFrom}
                        onChange={e => setTempYearFrom(e.target.value)}
                      />
                    </div>
                    <span className={styles.temporalDash}>–</span>
                    <div className={styles.temporalInputGroup}>
                      <label className={styles.temporalLabel}>Hasta</label>
                      <input
                        type="number"
                        className={styles.temporalInput}
                        placeholder="2025"
                        min={2008}
                        max={2030}
                        value={tempYearTo}
                        onChange={e => setTempYearTo(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className={styles.temporalActions}>
                    <button
                      className={styles.temporalApplyBtn}
                      disabled={!tempYearFrom && !tempYearTo}
                      onClick={() => {
                        const yf = tempYearFrom ? parseInt(tempYearFrom) : undefined
                        const yt = tempYearTo ? parseInt(tempYearTo) : undefined
                        if (!yf && !yt) return
                        applyTemporalFilter({ yearFrom: yf, yearTo: yt })
                        setShowSettings(false)
                      }}
                    >
                      Aplicar
                    </button>
                    {temporalFilter && (
                      <button
                        className={styles.temporalClearBtn}
                        onClick={() => {
                          setTempYearFrom('')
                          setTempYearTo('')
                          applyTemporalFilter(null)
                          setShowSettings(false)
                        }}
                      >
                        <FiX size={10} /> Quitar
                      </button>
                    )}
                  </div>
                  {temporalFilter && (
                    <div className={styles.temporalActiveTag}>
                      <FiCalendar size={9} />
                      <span>{temporalFilter.yearFrom || '∞'} – {temporalFilter.yearTo || '∞'}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button className={styles.resetBtn} onClick={handleReset} data-tip="Vista general"><FiMaximize2 size={14} /></button>
          <button className={styles.closeBtn} onClick={handleExit}><FiX size={18} /><span>ESC</span></button>
        </div>
      </header>

      {/* === BARRA DE BÚSQUEDA CON AUTOCOMPLETE === */}
      <div className={`${styles.searchBar} ${tourUIClass}`}>
        <div className={styles.searchInputWrapper}>
          <FiSearch size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Buscar organización, repositorio o usuario..."
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => {
              setSearchFocused(true)
              if (searchQuery) setSearchResults(filterNodes(searchQuery))
            }}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { handleSearchClear(); e.target.blur() }
              if (e.key === 'Enter' && searchResults.length > 0) handleSearchSelect(searchResults[0])
            }}
          />
          {searchQuery && (
            <button className={styles.searchClearBtn} onClick={handleSearchClear}>
              <FiX size={12} />
            </button>
          )}
        </div>
        {searchFocused && searchResults.length > 0 && (() => {
          const typeLabels = { org: 'Organizaciones (Procesadores)', repo: 'Repositorios (Qubits)', user: 'Usuarios (Partículas)' }
          const typeIcons = { org: '⊛', repo: '◉', user: '•' }
          let lastType = null
          return (
            <div className={styles.searchDropdown}>
              <div className={styles.searchResultCount}>{searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''}</div>
              {searchResults.map(n => {
                const showHeader = n.type !== lastType
                lastType = n.type
                return (
                  <div key={n.id}>
                    {showHeader && (
                      <div className={styles.searchGroupHeader}>
                        <span className={styles.searchGroupIcon} data-type={n.type}>{typeIcons[n.type]}</span>
                        <span>{typeLabels[n.type]}</span>
                        <span className={styles.searchGroupCount}>
                          {searchResults.filter(r => r.type === n.type).length}
                        </span>
                      </div>
                    )}
                    <div
                      className={`${styles.searchOption} ${searchEntity?.id === n.id ? styles.searchOptionActive : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleSearchSelect(n)
                      }}
                    >
                      <span className={styles.searchOptionIcon} data-type={n.type}>
                        {typeIcons[n.type]}
                      </span>
                      <span className={styles.searchOptionLabel}>{n.label}</span>
                      {n.isBridge && <span className={styles.searchBridgeTag}>⚛ bridge</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* === BARRA DE LENTES ANALÍTICAS === */}
      <div className={`${styles.lensToolbar} ${tourUIClass}`}>
        <span className={styles.lensLabel}>Lentes</span>
        {[
          { id: 'communities', icon: <FiLayers size={13} />, name: 'Comunidades', color: '#6c5ce7' },
          { id: 'centrality', icon: <FiActivity size={13} />, name: 'Centralidad', color: '#00b4d8' },
          { id: 'busFactor', icon: <FiShield size={13} />, name: 'Resiliencia', color: '#ff6b6b' },
          { id: 'intensity', icon: <FiZap size={13} />, name: 'Intensidad', color: '#ffd166' },
        ].map(lens => (
          <button
            key={lens.id}
            className={`${styles.lensBtn} ${activeLens === lens.id ? styles.lensBtnActive : ''}`}
            style={activeLens === lens.id ? { '--lens-color': lens.color, borderColor: lens.color, color: lens.color } : { '--lens-color': lens.color }}
            onClick={() => handleLensClick(lens.id)}
            disabled={lensTransitioning}
            data-tip={lensTransitioning ? 'Procesando...' : lens.name}
          >
            {lensTransitioning && activeLens === lens.id ? <FiLoader size={13} className={styles.lensSpinner} /> : lens.icon}
            <span>{lens.name}</span>
          </button>
        ))}
        <div className={styles.lensDivider} />
        <button
          className={`${styles.lensBtn} ${showTunneling ? styles.lensBtnActive : ''}`}
          style={showTunneling ? { '--lens-color': '#00ffaa', borderColor: '#00ffaa', color: '#00ffaa' } : { '--lens-color': '#00ffaa' }}
          onClick={() => setShowTunneling(t => !t)}
          data-tip="Quantum Tunneling - encontrar camino entre entidades"
        >
          <FiCrosshair size={13} />
          <span>Túnel</span>
        </button>
      </div>

      {/* === QUANTUM TUNNELING PANEL === */}
      {showTunneling && (
        <div className={styles.tunnelingPanel}>
          {/* Encabezado del panel */}
          <div className={styles.tunnelingPanelHeader}>
            <div className={styles.tunnelingPanelTitle}>
              <FiCrosshair size={14} />
              <span>Quantum Tunneling</span>
            </div>
            <button className={styles.tunnelingPanelClose} onClick={() => { setShowTunneling(false); clearTunneling() }}>
              <FiX size={14} />
            </button>
          </div>

          {/* Inputs de búsqueda */}
          <div className={styles.tunnelingFields}>
            <div className={styles.tunnelingFieldRow}>
              <div className={styles.tunnelingFieldDot} style={{ background: '#00ffaa' }} />
              <div className={styles.tunnelingInputWrapper}>
                <input
                  className={styles.tunnelingInput}
                  placeholder="Entidad origen..."
                  value={tunnelingSource}
                  onChange={(e) => {
                    setTunnelingSource(e.target.value)
                    setSourceResults(filterNodes(e.target.value))
                  }}
                  onFocus={() => {
                    setSourceInputFocused(true)
                    if (tunnelingSource) setSourceResults(filterNodes(tunnelingSource))
                  }}
                  onBlur={() => setTimeout(() => setSourceInputFocused(false), 200)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTunnelingSearch()}
                />
                {sourceInputFocused && sourceResults.length > 0 && (
                  <div className={styles.tunnelingDropdown}>
                    {sourceResults.map(n => (
                      <div key={n.id} className={styles.tunnelingOption}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setTunnelingSource(n.label)
                          setSourceResults([])
                          setSourceInputFocused(false)
                        }}>
                        <span className={styles.tunnelingOptionType} data-type={n.type}>
                          {n.type === 'org' ? '⊛' : n.type === 'repo' ? '◉' : '•'}
                        </span>
                        <span className={styles.tunnelingOptionLabel}>{n.label}</span>
                        {n.isBridge && <span className={styles.tunnelingBridgeTag}>⚛ bridge</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.tunnelingFieldConnector}>
              <svg width="2" height="20" viewBox="0 0 2 20"><line x1="1" y1="0" x2="1" y2="20" stroke="rgba(0,255,170,0.25)" strokeWidth="2" strokeDasharray="3 3" /></svg>
            </div>

            <div className={styles.tunnelingFieldRow}>
              <div className={styles.tunnelingFieldDot} style={{ background: '#bd00ff' }} />
              <div className={styles.tunnelingInputWrapper}>
                <input
                  className={styles.tunnelingInput}
                  placeholder="Entidad destino..."
                  value={tunnelingTarget}
                  onChange={(e) => {
                    setTunnelingTarget(e.target.value)
                    setTargetResults(filterNodes(e.target.value))
                  }}
                  onFocus={() => {
                    setTargetInputFocused(true)
                    if (tunnelingTarget) setTargetResults(filterNodes(tunnelingTarget))
                  }}
                  onBlur={() => setTimeout(() => setTargetInputFocused(false), 200)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTunnelingSearch()}
                />
                {targetInputFocused && targetResults.length > 0 && (
                  <div className={styles.tunnelingDropdown}>
                    {targetResults.map(n => (
                      <div key={n.id} className={styles.tunnelingOption}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setTunnelingTarget(n.label)
                          setTargetResults([])
                          setTargetInputFocused(false)
                        }}>
                        <span className={styles.tunnelingOptionType} data-type={n.type}>
                          {n.type === 'org' ? '⊛' : n.type === 'repo' ? '◉' : '•'}
                        </span>
                        <span className={styles.tunnelingOptionLabel}>{n.label}</span>
                        {n.isBridge && <span className={styles.tunnelingBridgeTag}>⚛ bridge</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Botón de búsqueda */}
          <button className={styles.tunnelingSearchBtn} onClick={handleTunnelingSearch} disabled={isLoadingTunneling || !tunnelingSource || !tunnelingTarget}>
            {isLoadingTunneling ? (
              <><FiLoader size={13} className={styles.lensSpinner} /> <span>Buscando...</span></>
            ) : (
              <><FiZap size={13} /> <span>Encontrar camino</span></>
            )}
          </button>

          {/* === Resultado del tunneling === */}
          {tunnelingPath && (
            <div className={styles.tunnelingResult}>
              {tunnelingPath.found ? (
                <>
                  <div className={styles.tunnelingResultHeader}>
                    <div className={styles.tunnelingResultBadge}>
                      <FiZap size={12} />
                      <span>{tunnelingPath.length} salto{tunnelingPath.length !== 1 ? 's' : ''}</span>
                    </div>
                    {tunnelingPath.edges && tunnelingPath.edges.length > 0 && (
                      <div className={styles.tunnelingResultBadge} data-variant="secondary">
                        <FiLink size={10} />
                        <span>{tunnelingPath.edges.length} conexiones</span>
                      </div>
                    )}
                    <button onClick={clearTunneling} className={styles.tunnelingCloseBtn}><FiX size={12} /></button>
                  </div>
                  <div className={styles.tunnelingTimeline}>
                    {tunnelingPath.path.map((node, idx) => {
                      const colorMap = { org: '#00f7ff', repo: '#bd00ff', user: '#00ff9f' }
                      const typeLabel = { org: 'Organización', repo: 'Repositorio', user: 'Usuario' }
                      const isFirst = idx === 0
                      const isLast = idx === tunnelingPath.path.length - 1
                      return (
                        <div key={node.id} className={styles.tunnelingTimelineStep} style={{ '--step-delay': `${idx * 80}ms` }}>
                          {/* Línea vertical de conexión (no en el último) */}
                          {!isLast && (
                            <div className={styles.tunnelingTimelineLine} style={{ '--line-color': colorMap[node.type] || '#555' }} />
                          )}
                          {/* Dot del timeline */}
                          <div className={`${styles.tunnelingTimelineDot} ${isFirst || isLast ? styles.tunnelingTimelineDotEndpoint : ''}`}
                            style={{ '--dot-color': colorMap[node.type] || '#fff' }} />
                          {/* Card del nodo */}
                          <button
                            className={styles.tunnelingTimelineCard}
                            style={{ '--card-color': colorMap[node.type] || '#fff' }}
                            onClick={() => {
                              const pos = universeData?.positions?.[node.id]
                              if (pos) setFocusTarget(pos)
                            }}
                          >
                            {node.avatar_url && (
                              <img src={node.avatar_url} alt="" className={styles.tunnelingCardAvatar} />
                            )}
                            <div className={styles.tunnelingCardInfo}>
                              <span className={styles.tunnelingCardName}>{node.name}</span>
                              <span className={styles.tunnelingCardType}>{typeLabel[node.type] || node.type}</span>
                            </div>
                            <FiExternalLink size={10} className={styles.tunnelingCardGo} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className={styles.tunnelingNoPath}>
                  <FiAlertTriangle size={14} />
                  <span>No existe canal cuántico entre estas entidades</span>
                  <button onClick={clearTunneling} className={styles.tunnelingCloseBtn}><FiX size={12} /></button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Leyenda cuántica */}
      <div className={`${styles.legend} ${tourUIClass}`}>
        <div className={styles.legendCard}>
          <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#00f7ff', boxShadow: '0 0 10px #00f7ff' }} /><span>Orgs</span><span className={styles.legendType}>Procesadores</span></div>
          <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#bd00ff', boxShadow: '0 0 10px #bd00ff' }} /><span>Repos</span><span className={styles.legendType}>Qubits</span></div>
          <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#00ff9f', boxShadow: '0 0 10px #00ff9f' }} /><span>Users</span><span className={styles.legendType}>Partículas</span></div>
          <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#ffbd00', boxShadow: '0 0 10px #ffbd00' }} /><span>Bridge</span><span className={styles.legendType}>Entrelazadas</span></div>
          <div className={styles.legendItem}><span className={styles.legendLine} style={{ background: 'linear-gradient(90deg, #00d4e4, #bd70db)' }} /><span>Canales</span><span className={styles.legendType}>Collab</span></div>
        </div>
      </div>

      {/* Métricas - conteos reales del grafo renderizado */}
      <div className={`${styles.metricsFloat} ${tourUIClass}`}>
        {temporalFilter && (
          <div className={`${styles.metricPill} ${styles.temporalBadge}`}>
            <FiCalendar size={11} style={{ color: '#ff9f43' }} />
            <span className={styles.metricValue2}>{temporalFilter.yearFrom || '∞'}–{temporalFilter.yearTo || '∞'}</span>
          </div>
        )}
        <div className={styles.metricPill}><FiGlobe size={11} style={{ color: '#00f7ff' }} /><span className={styles.metricValue2}>{universeData?.orgNodes?.length || 0}</span><span className={styles.metricLabel2}>orgs</span></div>
        <div className={styles.metricPill}><FiGrid size={11} /><span className={styles.metricValue2}>{universeData?.repoNodes?.length || 0}</span><span className={styles.metricLabel2}>repos</span></div>
        <div className={styles.metricPill}><FiUsers size={11} /><span className={styles.metricValue2}>{universeData?.userNodes?.length || 0}</span><span className={styles.metricLabel2}>users</span></div>
        <div className={styles.metricPill}><FiGitBranch size={11} /><span className={styles.metricValue2}>{metrics?.connected_repo_pairs || 0}</span><span className={styles.metricLabel2}>canales</span></div>
        <div className={styles.metricPill}><FiZap size={11} style={{ color: '#ffbd00' }} /><span className={styles.metricValue2}>{metrics?.bridge_users_count || 0}</span><span className={styles.metricLabel2}>bridge</span></div>
      </div>

      {/* Panel de detalle - PRO */}
      {(selectedEntity || panelClosing) && (() => {
        // While loading or closing, show skeleton or use stale data
        const hasData = detailData && !detailLoading
        const {
          entityColor = selectedEntity?.type === 'org' ? '#00f7ff' : selectedEntity?.type === 'repo' ? '#bd00ff' : '#00ff9f',
          nm, community, centrality = 0, connectivity = 0,
          orgReposList = [], orgTotalUsers = 0, orgBridgeCount = 0, orgSortedRepos = [], orgLangs = [],
          orgTotalStars = 0, orgAvgStars = 0, orgBridgePct = 0, orgTopContributors = [], orgEntangledOrgs = [],
          orgCrossPollination = 0, orgLangBreakdown = [],
          repoUsers = [], repoBridgeUsers = [], repoNormalUsers = [], repoOwnerOrg, repoOrgDiversity = [], repoHubScore = 0,
          userRepos = [], userOrgs = [], userLangs = [], userTotalStars = 0, expertise = [], userCoContributors = [],
          networkRole, zoneInfo, analysisText, radarAxes = [],
          knowledgeFlows = [], keyDependencies = [], healthScore, healthBreakdown = [],
          impactSimulations = [], collabMatrix, similarEntities = [], collabDNA,
          _advancedLoaded = false,
        } = detailData || {}
        const isPinned = pinnedEntity?.id === selectedEntity?.id

        return (
        <aside className={`${styles.detailPanel} ${detailExpanded ? styles.detailPanelExpanded : ''} ${panelClosing ? (detailExpanded ? styles.detailPanelExpandedClosing : styles.detailPanelClosing) : ''} ${tourUIClass}`}>
          {/* === TOOLBAR === */}
          <div className={styles.detailToolbar}>
            {navHistory.length > 0 && (
              <button className={styles.detailToolBtn} onClick={navigateBack} data-tip="Volver">
                <FiChevronLeft size={14} />
              </button>
            )}
            <div className={styles.detailToolbarSpacer} />
            <button
              className={`${styles.detailToolBtn} ${styles.detailFavBtn} ${isFavorite(`${selectedEntity.type === 'org' ? 'org' : selectedEntity.type === 'repo' ? 'repo' : 'user'}_${selectedEntity.login || selectedEntity.full_name || selectedEntity.id}`) ? styles.detailFavBtnActive : ''}`}
              onClick={() => {
                const prefix = selectedEntity.type === 'org' ? 'org' : selectedEntity.type === 'repo' ? 'repo' : 'user'
                const entityId = `${prefix}_${selectedEntity.login || selectedEntity.full_name || selectedEntity.id}`
                toggleFavorite({
                  id: entityId,
                  type: selectedEntity.type === 'org' ? 'organization' : selectedEntity.type,
                  name: selectedEntity.name || selectedEntity.login || selectedEntity.full_name,
                  avatar_url: selectedEntity.avatar_url,
                })
              }}
              data-tip={isFavorite(`${selectedEntity.type === 'org' ? 'org' : selectedEntity.type === 'repo' ? 'repo' : 'user'}_${selectedEntity.login || selectedEntity.full_name || selectedEntity.id}`) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            >
              <FiStar size={13} />
            </button>
            <button
              className={`${styles.detailToolBtn} ${isPinned ? styles.detailToolBtnActive : ''}`}
              onClick={handlePinToggle}
              data-tip={isPinned ? 'Dejar de comparar' : 'Fijar para comparar'}
            >
              <FiBookmark size={13} />
            </button>
            <button
              className={styles.detailToolBtn}
              onClick={() => setDetailExpanded(e => !e)}
              data-tip={detailExpanded ? 'Compactar' : 'Expandir'}
            >
              {detailExpanded ? <FiMinimize2 size={13} /> : <FiMaximize2 size={13} />}
            </button>
            <button className={styles.detailToolBtn} onClick={handleClosePanel}>
              <FiX size={14} />
            </button>
          </div>

          {/* === LOADING OVERLAY === */}
          {detailLoading && (
            <div className={styles.detailLoadingOverlay}>
              <FiLoader size={22} className={styles.detailLoadingSpinner} />
              <span className={styles.detailLoadingText}>Analizando entidad…</span>
            </div>
          )}

          {hasData && (<>
          <div className={styles.detailLayout}>
          <div className={styles.detailSidebar}>

          {/* === HEADER CON AVATAR === */}
          <div className={styles.detailHeader}>
            {selectedEntity.avatar_url ? (
              <img src={selectedEntity.avatar_url} alt="" className={styles.detailAvatar} style={{ borderColor: entityColor }} />
            ) : (
              <div className={styles.detailIcon} style={{
                background: `${entityColor}22`,
                color: entityColor,
              }}>
                {selectedEntity.type === 'org' && <FiGrid size={20} />}
                {selectedEntity.type === 'repo' && <FiGitBranch size={20} />}
                {selectedEntity.type === 'user' && <FiUser size={20} />}
              </div>
            )}
            <div className={styles.detailHeaderText}>
              <h3>{selectedEntity.name || selectedEntity.login || selectedEntity.full_name}</h3>
              <span className={styles.detailType} style={{ color: entityColor }}>
                {{ org: 'Organización (Procesador)', repo: 'Repositorio (Qubit)', user: 'Usuario (Partícula)' }[selectedEntity.type]}
              </span>
            </div>
          </div>

          {/* === HANDLE / LOGIN === */}
          <div className={styles.detailHandle}>
            <span>@{selectedEntity.login || selectedEntity.full_name || selectedEntity.id}</span>
            {(selectedEntity.type === 'org' || selectedEntity.type === 'user') && selectedEntity.login && (
              <a href={`https://github.com/${selectedEntity.login}`} target="_blank" rel="noopener noreferrer" className={styles.detailGhLink} data-tip="Ver en GitHub">
                <FiExternalLink size={11} />
              </a>
            )}
            {selectedEntity.type === 'repo' && selectedEntity.full_name && (
              <a href={`https://github.com/${selectedEntity.full_name}`} target="_blank" rel="noopener noreferrer" className={styles.detailGhLink} data-tip="Ver en GitHub">
                <FiExternalLink size={11} />
              </a>
            )}
          </div>

          {/* === BADGE BRIDGE === */}
          {selectedEntity.isBridge && (
            <div className={styles.detailBridge}
              data-tip="Un usuario 'puente' contribuye a repositorios de múltiples organizaciones, conectando equipos que de otra forma no colaborarían">
              <FiZap size={12} />
              <span>Bridge User (Entrelazada)</span>
              <span className={styles.detailBridgeHint}>Conecta {userOrgs.length} organizaciones</span>
            </div>
          )}

          {/* === NETWORK ROLE + ZONE BADGE === */}
          {networkRole && (
            <div className={styles.detailRoleBadge} style={{ '--role-color': networkRole.color }}
              data-tip="Clasificación automática basada en centralidad y conectividad en la red de colaboración">
              <span className={styles.detailRoleIcon}>{networkRole.icon}</span>
              <div className={styles.detailRoleText}>
                <span className={styles.detailRoleLabel}>{networkRole.label}</span>
                <span className={styles.detailRoleDesc}>{networkRole.desc}</span>
                {zoneInfo && (
                  <span className={styles.detailZoneTag} style={{ '--zone-color': zoneInfo.color }}>
                    {zoneInfo.icon} {zoneInfo.label}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* === COLLABORATION RADAR - perfil pentagonal === */}
          {radarAxes.length === 5 && (
            <div className={styles.detailRadar}
              data-tip="Perfil de colaboración: muestra las fortalezas relativas en 5 dimensiones clave">
              <svg viewBox="-80 -25 360 260" className={styles.detailRadarSvg}>
                {/* Grid pentagonal - 3 niveles */}
                {[1, 0.66, 0.33].map((scale, si) => (
                  <polygon key={si}
                    points={radarAxes.map((_, i) => {
                      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
                      return `${100 + Math.cos(angle) * 70 * scale},${100 + Math.sin(angle) * 70 * scale}`
                    }).join(' ')}
                    fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1"
                  />
                ))}
                {/* Ejes */}
                {radarAxes.map((_, i) => {
                  const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
                  return <line key={i} x1="100" y1="100"
                    x2={100 + Math.cos(angle) * 70} y2={100 + Math.sin(angle) * 70}
                    stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
                })}
                {/* Área rellena */}
                <polygon
                  points={radarAxes.map((ax, i) => {
                    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
                    const r = Math.max(ax.value, 0.05) * 70
                    return `${100 + Math.cos(angle) * r},${100 + Math.sin(angle) * r}`
                  }).join(' ')}
                  fill={`${entityColor}18`} stroke={entityColor} strokeWidth="1.5" strokeLinejoin="round"
                />
                {/* Puntos en vértices */}
                {radarAxes.map((ax, i) => {
                  const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
                  const r = Math.max(ax.value, 0.05) * 70
                  return <circle key={i} cx={100 + Math.cos(angle) * r} cy={100 + Math.sin(angle) * r}
                    r="2.5" fill={entityColor} opacity="0.9" />
                })}
                {/* Labels - posicionados dinámicamente sin cortes */}
                {radarAxes.map((ax, i) => {
                  const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
                  const cosA = Math.cos(angle)
                  const sinA = Math.sin(angle)
                  const lx = 100 + cosA * 98
                  const ly = 100 + sinA * 98
                  // Dynamic textAnchor based on position
                  const anchor = cosA < -0.1 ? 'end' : cosA > 0.1 ? 'start' : 'middle'
                  const baseline = sinA < -0.3 ? 'auto' : sinA > 0.3 ? 'hanging' : 'middle'
                  return (
                    <g key={i}>
                      <text x={lx} y={ly} textAnchor={anchor} dominantBaseline={baseline}
                        fill="rgba(255,255,255,0.7)" fontSize="11" fontFamily="monospace" fontWeight="500" style={{ cursor: 'default' }}>
                        {ax.label}
                      </text>
                      <text x={lx} y={ly + (sinA < -0.3 ? -12 : 12)} textAnchor={anchor} dominantBaseline={baseline}
                        fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="monospace">
                        {Math.round(ax.value * 100)}%
                      </text>
                      {/* Invisible hit area for tooltip */}
                      <rect x={lx - 30} y={ly - 10} width="60" height="20" fill="transparent" style={{ cursor: 'help' }}
                        data-tip={ax.tip} />
                    </g>
                  )
                })}
              </svg>
            </div>
          )}

          {/* === PINNED COMPARE BAR === */}
          {pinnedEntity && pinnedData && pinnedEntity.id !== selectedEntity.id && (
            <div className={styles.detailCompareBar}>
              <div className={styles.detailCompareHeader}>
                <FiBookmark size={10} />
                <span>vs {pinnedEntity.name || pinnedEntity.login || pinnedEntity.full_name?.split('/')[1]}</span>
                <button className={styles.detailCompareClose} onClick={() => { setPinnedEntity(null); setPinnedData(null) }}><FiX size={10} /></button>
              </div>
              <div className={styles.detailCompareMetrics}>
                <div className={styles.detailCompareRow}>
                  <span className={styles.detailCompareLabel}>Centralidad</span>
                  <div className={styles.detailCompareDual}>
                    <div className={styles.detailCompareDualBar}>
                      <div style={{ width: `${centrality}%`, background: entityColor }} />
                    </div>
                    <span className={styles.detailCompareVal}>{centrality}%</span>
                    <span className={styles.detailCompareDelta} style={{ color: centrality >= pinnedData.centrality ? '#00ff9f' : '#ff6b6b' }}>
                      {centrality >= pinnedData.centrality ? <FiTrendingUp size={9} /> : <FiTrendingDown size={9} />}
                      {Math.abs(centrality - pinnedData.centrality).toFixed(0)}
                    </span>
                  </div>
                </div>
                <div className={styles.detailCompareRow}>
                  <span className={styles.detailCompareLabel}>Conectividad</span>
                  <div className={styles.detailCompareDual}>
                    <div className={styles.detailCompareDualBar}>
                      <div style={{ width: `${connectivity}%`, background: entityColor }} />
                    </div>
                    <span className={styles.detailCompareVal}>{connectivity}%</span>
                    <span className={styles.detailCompareDelta} style={{ color: connectivity >= pinnedData.connectivity ? '#00ff9f' : '#ff6b6b' }}>
                      {connectivity >= pinnedData.connectivity ? <FiTrendingUp size={9} /> : <FiTrendingDown size={9} />}
                      {Math.abs(connectivity - pinnedData.connectivity).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/*  COLLABORATION DNA  */}
          {detailExpanded && !collabDNA && !_advancedLoaded && radarAxes.length >= 3 && (
            <div className={styles.detailDNA}>
              <p className={styles.detailSectionTitle}><FiHash size={10} /> Collaboration DNA</p>
              <div className={styles.detailSkeleton}><div className={styles.detailSkeletonShimmer} /></div>
            </div>
          )}
          {collabDNA && detailExpanded && (
            <div className={styles.detailDNA}>
              <p className={styles.detailSectionTitle} data-tip="Huella visual única generada a partir del perfil colaborativo de esta entidad"><FiHash size={10} /> Collaboration DNA</p>
              <svg viewBox="0 0 200 60" className={styles.detailDNASvg}>
                {/* Background grid */}
                {Array.from({ length: 20 }, (_, i) => (
                  <line key={`g${i}`} x1={i * 10} y1={0} x2={i * 10} y2={60} stroke="rgba(255,255,255,0.03)" />
                ))}
                {/* DNA double helix based on radar values */}
                {collabDNA.values.map((v, i) => {
                  const colors = ['#00f7ff', '#bd00ff', '#00ff9f', '#ffbd00', '#ff6b6b']
                  const segs = 40
                  return Array.from({ length: segs }, (_, s) => {
                    const x = (s / segs) * 200
                    const phase = (i * 1.2) + ((collabDNA.seed % 100) / 100) * Math.PI
                    const y1 = 30 + Math.sin((s / segs) * Math.PI * 4 + phase) * (10 + v * 18)
                    const y2 = 30 - Math.sin((s / segs) * Math.PI * 4 + phase) * (10 + v * 18)
                    const opacity = 0.15 + v * 0.55
                    return (
                      <g key={`${i}-${s}`}>
                        <circle cx={x} cy={y1} r={1 + v * 1.5} fill={colors[i % 5]} opacity={opacity * 0.8} />
                        <circle cx={x} cy={y2} r={1 + v * 1.5} fill={colors[i % 5]} opacity={opacity * 0.4} />
                        {s % 8 === 0 && <line x1={x} y1={y1} x2={x} y2={y2} stroke={colors[i % 5]} strokeWidth={0.5} opacity={opacity * 0.3} />}
                      </g>
                    )
                  })
                })}
                {/* Central axis */}
                <line x1={0} y1={30} x2={200} y2={30} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
              </svg>
              <div className={styles.detailDNALabels}>
                {collabDNA.labels.map((label, i) => {
                  const colors = ['#00f7ff', '#bd00ff', '#00ff9f', '#ffbd00', '#ff6b6b']
                  return (
                    <span key={i} className={styles.detailDNALabel} style={{ color: colors[i % 5] }}>
                      <span className={styles.detailDNADot} style={{ background: colors[i % 5] }} />
                      {label}: {Math.round(collabDNA.values[i] * 100)}%
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          </div>{/* end detailSidebar */}
          <div className={styles.detailMain}>

          {/* === TABS === */}
          <div className={styles.detailTabs}>
            <button className={`${styles.detailTabBtn} ${detailTab === 'info' ? styles.detailTabActive : ''}`}
              onClick={() => setDetailTab('info')} style={{ '--tab-color': entityColor }}
              data-tip="Información general: métricas, repositorios y lenguajes">
              <FiBarChart2 size={11} /> Info
            </button>
            <button className={`${styles.detailTabBtn} ${detailTab === 'red' ? styles.detailTabActive : ''}`}
              onClick={() => setDetailTab('red')} style={{ '--tab-color': entityColor }}
              data-tip="Métricas de red: centralidad, conectividad y comunidad">
              <FiActivity size={11} /> Red
            </button>
            <button className={`${styles.detailTabBtn} ${detailTab === 'explorer' ? styles.detailTabActive : ''}`}
              onClick={() => setDetailTab('explorer')} style={{ '--tab-color': entityColor }}
              data-tip="Explorar conexiones: usuarios, repos y organizaciones relacionadas">
              <FiSearch size={11} /> Explorar
            </button>
          </div>

          {/* === TAB: INFO === */}
          {detailTab === 'info' && (
            <div className={styles.detailBody}>
              {/*  ORG INFO  */}
              {selectedEntity.type === 'org' && (
                <>
                  <div className={styles.detailStatsGrid}>
                    <div className={styles.detailStatCard} data-tip="Número total de repositorios en esta organización">
                      <FiGitBranch size={14} className={styles.detailStatIcon} style={{ color: '#bd00ff' }} />
                      <span className={styles.detailStatValue}>{orgReposList.length}</span>
                      <span className={styles.detailStatLabel}>Repositorios</span>
                    </div>
                    <div className={styles.detailStatCard} data-tip="Usuarios únicos que contribuyen a repos de esta org">
                      <FiUsers size={14} className={styles.detailStatIcon} style={{ color: '#00ff9f' }} />
                      <span className={styles.detailStatValue}>{orgTotalUsers}</span>
                      <span className={styles.detailStatLabel}>Contributors</span>
                    </div>
                    <div className={styles.detailStatCard} data-tip="Usuarios que contribuyen a múltiples organizaciones - conectores clave de la red">
                      <FiZap size={14} className={styles.detailStatIcon} style={{ color: '#ffbd00' }} />
                      <span className={styles.detailStatValue}>{orgBridgeCount}</span>
                      <span className={styles.detailStatLabel}>Bridge Users</span>
                    </div>
                    <div className={styles.detailStatCard} data-tip="Suma total de estrellas de todos los repositorios">
                      <FiStar size={14} className={styles.detailStatIcon} style={{ color: '#ffd166' }} />
                      <span className={styles.detailStatValue}>{orgTotalStars}</span>
                      <span className={styles.detailStatLabel}>Estrellas total</span>
                    </div>
                  </div>

                  {/* Mini stats fila */}
                  <div className={styles.detailMiniStats}>
                    <span data-tip="Lenguajes de programación distintos usados en los repositorios"><FiCode size={10} /> {orgLangs.length} lenguajes</span>
                    <span data-tip="Promedio de estrellas por repositorio"><FiStar size={10} /> ~{orgAvgStars} avg ★</span>
                    <span data-tip="Porcentaje de usuarios que son bridge (conectan múltiples orgs)"><FiPercent size={10} /> {orgBridgePct}% bridge</span>
                    <span data-tip="Tasa de polinización cruzada: colaboradores compartidos con otras orgs"><FiShare2 size={10} /> {orgCrossPollination}% cross</span>
                  </div>

                  {/* Language breakdown bars */}
                  {orgLangBreakdown.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiCode size={10} /> Stack tecnológico</p>
                      <div className={styles.detailLangBars}>
                        {orgLangBreakdown.slice(0, detailExpanded ? 12 : 6).map(({ lang, count, pct }) => (
                          <div key={lang} className={styles.detailLangBarRow}>
                            <span className={styles.detailLangBarLabel}>{lang}</span>
                            <div className={styles.detailLangBarTrack}>
                              <div className={styles.detailLangBarFill} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={styles.detailLangBarPct}>{pct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {orgSortedRepos.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiGitBranch size={10} /> Repositorios <span className={styles.detailCount}>{orgSortedRepos.length}</span></p>
                      <div className={styles.detailRepoList}>
                        {orgSortedRepos.slice(0, detailExpanded ? 20 : 6).map(r => {
                          const uc = (universeData?.repoUsers[r.id] || []).length
                          return (
                            <div key={r.id} className={styles.detailRepoItem} onClick={() => navigateToEntity(r)} style={{ cursor: 'pointer' }}>
                              <span className={styles.detailRepoName}>{r.name || r.full_name?.split('/')[1] || r.id}</span>
                              <span className={styles.detailRepoMeta}>
                                {r.language && <span className={styles.detailLangDot} style={{ background: '#bd00ff' }} />}
                                {r.language && <span>{r.language}</span>}
                                {r.stars > 0 && <><FiStar size={9} /> {r.stars}</>}
                                <FiUsers size={9} /> {uc}
                                <FiArrowRight size={8} className={styles.detailNavArrow} />
                              </span>
                            </div>
                          )
                        })}
                        {orgSortedRepos.length > (detailExpanded ? 20 : 6) && <span className={styles.detailChipMore}>+{orgSortedRepos.length - (detailExpanded ? 20 : 6)} más</span>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/*  REPO INFO  */}
              {selectedEntity.type === 'repo' && (
                <>
                  {repoOwnerOrg && (
                    <div className={styles.detailOwnerBadge} onClick={() => navigateToEntity(repoOwnerOrg)} style={{ cursor: 'pointer' }}>
                      <FiGrid size={11} style={{ color: '#00f7ff' }} />
                      <span>{repoOwnerOrg.name || repoOwnerOrg.login}</span>
                      <FiArrowRight size={9} className={styles.detailNavArrow} />
                    </div>
                  )}

                  <div className={styles.detailStatsGrid}>
                    {selectedEntity.stars > 0 && (
                      <div className={styles.detailStatCard} data-tip="Estrellas en GitHub - indicador de popularidad del repositorio">
                        <FiStar size={14} className={styles.detailStatIcon} style={{ color: '#ffd166' }} />
                        <span className={styles.detailStatValue}>{selectedEntity.stars}</span>
                        <span className={styles.detailStatLabel}>Estrellas</span>
                      </div>
                    )}
                    <div className={styles.detailStatCard} data-tip="Número de usuarios únicos que contribuyen a este repositorio">
                      <FiUsers size={14} className={styles.detailStatIcon} style={{ color: '#00ff9f' }} />
                      <span className={styles.detailStatValue}>{repoUsers.length}</span>
                      <span className={styles.detailStatLabel}>Contributors</span>
                    </div>
                    {repoBridgeUsers.length > 0 && (
                      <div className={styles.detailStatCard} data-tip="Usuarios puente: contribuyen a múltiples organizaciones, conectando la red">
                        <FiZap size={14} className={styles.detailStatIcon} style={{ color: '#ffbd00' }} />
                        <span className={styles.detailStatValue}>{repoBridgeUsers.length}</span>
                        <span className={styles.detailStatLabel}>Bridge</span>
                      </div>
                    )}
                    {selectedEntity.language && (
                      <div className={styles.detailStatCard} data-tip="Lenguaje de programación principal del repositorio">
                        <FiCode size={14} className={styles.detailStatIcon} style={{ color: '#bd00ff' }} />
                        <span className={styles.detailStatValue} style={{ fontSize: 12 }}>{selectedEntity.language}</span>
                        <span className={styles.detailStatLabel}>Lenguaje</span>
                      </div>
                    )}
                  </div>

                  {/* Diversidad de orgs */}
                  {repoOrgDiversity.length > 1 && (
                    <div className={styles.detailMiniStats}>
                      <span data-tip="Organizaciones distintas cuyos miembros contribuyen a este repo"><FiGlobe size={10} /> Contributors de {repoOrgDiversity.length} orgs</span>
                      <span data-tip="Porcentaje de contribuidores que son bridge users"><FiPercent size={10} /> {repoUsers.length > 0 ? ((repoBridgeUsers.length / repoUsers.length) * 100).toFixed(0) : 0}% bridge</span>
                      {repoHubScore > 1 && <span data-tip="Puntuación de hub: cuántas organizaciones conecta este repositorio"><FiAward size={10} /> Hub score: {repoHubScore}</span>}
                    </div>
                  )}

                  {repoBridgeUsers.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiZap size={10} /> Bridge Users <span className={styles.detailCount}>{repoBridgeUsers.length}</span></p>
                      <div className={styles.detailUserList}>
                        {repoBridgeUsers.slice(0, detailExpanded ? 20 : 8).map(u => (
                          <div key={u.id} className={styles.detailUserItem} onClick={() => navigateToEntity(u)} style={{ cursor: 'pointer' }}>
                            <FiZap size={10} style={{ color: '#ffbd00' }} />
                            <span>{u.login || u.id}</span>
                            <FiArrowRight size={8} className={styles.detailNavArrow} />
                          </div>
                        ))}
                        {repoBridgeUsers.length > (detailExpanded ? 20 : 8) && <span className={styles.detailChipMore}>+{repoBridgeUsers.length - (detailExpanded ? 20 : 8)} más</span>}
                      </div>
                    </div>
                  )}

                  {repoNormalUsers.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiUser size={10} /> Contributors <span className={styles.detailCount}>{repoNormalUsers.length}</span></p>
                      <div className={styles.detailUserList}>
                        {repoNormalUsers.slice(0, detailExpanded ? 30 : 10).map(u => (
                          <div key={u.id} className={styles.detailUserItem} onClick={() => navigateToEntity(u)} style={{ cursor: 'pointer' }}>
                            <FiUser size={10} style={{ color: '#00ff9f', opacity: 0.5 }} />
                            <span>{u.login || u.id}</span>
                            <FiArrowRight size={8} className={styles.detailNavArrow} />
                          </div>
                        ))}
                        {repoNormalUsers.length > (detailExpanded ? 30 : 10) && <span className={styles.detailChipMore}>+{repoNormalUsers.length - (detailExpanded ? 30 : 10)} más</span>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/*  USER INFO  */}
              {selectedEntity.type === 'user' && (
                <>
                  <div className={styles.detailStatsGrid}>
                    <div className={styles.detailStatCard} data-tip="Repositorios en los que este usuario contribuye">
                      <FiGitBranch size={14} className={styles.detailStatIcon} style={{ color: '#bd00ff' }} />
                      <span className={styles.detailStatValue}>{userRepos.length}</span>
                      <span className={styles.detailStatLabel}>Repositorios</span>
                    </div>
                    <div className={styles.detailStatCard} data-tip="Organizaciones en las que participa este usuario">
                      <FiGlobe size={14} className={styles.detailStatIcon} style={{ color: '#00f7ff' }} />
                      <span className={styles.detailStatValue}>{userOrgs.length}</span>
                      <span className={styles.detailStatLabel}>Organizaciones</span>
                    </div>
                    <div className={styles.detailStatCard} data-tip="Total de estrellas de los repositorios a los que contribuye">
                      <FiStar size={14} className={styles.detailStatIcon} style={{ color: '#ffd166' }} />
                      <span className={styles.detailStatValue}>{userTotalStars}</span>
                      <span className={styles.detailStatLabel}>★ en sus repos</span>
                    </div>
                    {expertise > 0 && (
                      <div className={styles.detailStatCard} data-tip="Nivel de expertise basado en diversidad de repos, orgs y lenguajes">
                        <FiActivity size={14} className={styles.detailStatIcon} style={{ color: '#a29bfe' }} />
                        <span className={styles.detailStatValue}>{expertise}</span>
                        <span className={styles.detailStatLabel}>Expertise</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.detailMiniStats}>
                    <span data-tip="Lenguajes de programación distintos en los que trabaja"><FiCode size={10} /> {userLangs.length} lenguajes</span>
                    <span data-tip="Usuarios con los que comparte al menos un repositorio"><FiUsers size={10} /> {userCoContributors.length} co-contributors</span>
                  </div>

                  {userRepos.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiGitBranch size={10} /> Contribuye a <span className={styles.detailCount}>{userRepos.length}</span></p>
                      <div className={styles.detailRepoList}>
                        {userRepos.slice(0, detailExpanded ? 20 : 8).map(r => (
                          <div key={r.id} className={styles.detailRepoItem} onClick={() => navigateToEntity(r)} style={{ cursor: 'pointer' }}>
                            <span className={styles.detailRepoName}>{r.name || r.full_name?.split('/')[1] || r.id}</span>
                            <span className={styles.detailRepoMeta}>
                              {r.language && <span className={styles.detailLangDot} style={{ background: '#bd00ff' }} />}
                              {r.language && <span>{r.language}</span>}
                              {r.stars > 0 && <><FiStar size={9} /> {r.stars}</>}
                              <FiArrowRight size={8} className={styles.detailNavArrow} />
                            </span>
                          </div>
                        ))}
                        {userRepos.length > (detailExpanded ? 20 : 8) && <span className={styles.detailChipMore}>+{userRepos.length - (detailExpanded ? 20 : 8)} más</span>}
                      </div>
                    </div>
                  )}

                  {userOrgs.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiGrid size={10} /> Organizaciones <span className={styles.detailCount}>{userOrgs.length}</span></p>
                      <div className={styles.detailChips}>
                        {userOrgs.map(o => (
                          <span key={o.id} className={`${styles.detailChip} ${styles.detailChipClickable}`}
                            style={{ borderColor: 'rgba(0,247,255,0.3)', color: '#00f7ff' }}
                            onClick={() => navigateToEntity(o)}>
                            {o.name || o.login || o.id} <FiArrowRight size={8} />
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/*  ANALYSIS SUMMARY (shared all types)  */}
              {analysisText && (
                <div className={styles.detailAnalysis}>
                  <p className={styles.detailSectionTitle} data-tip="Resumen generado automáticamente del perfil de colaboración"><FiAward size={10} /> Resumen de análisis</p>
                  <p className={styles.detailAnalysisText}>{analysisText}</p>
                </div>
              )}

              {/*  HEALTH SCORE (orgs only)  */}
              {healthScore !== null && (
                <div className={styles.detailHealthSection}>
                  <p className={styles.detailSectionTitle} data-tip="Puntuación 0-100 que mide la salud del ecosistema colaborativo de esta organización"><FiHeart size={10} /> Salud colaborativa</p>
                  <div className={styles.detailHealthGauge}>
                    <svg viewBox="0 0 120 68" className={styles.detailHealthSvg}>
                      {/* Arco semicircular - envuelve el número */}
                      <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" strokeLinecap="round" />
                      <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none"
                        stroke={healthScore >= 67 ? '#00ff9f' : healthScore >= 33 ? '#ffd166' : '#ff6b6b'}
                        strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={`${healthScore * 1.57} 200`}
                      />
                      {/* Número centrado dentro del arco */}
                      <text x="60" y="44" textAnchor="middle" fill="white" fontSize="22" fontWeight="bold" fontFamily="monospace">{healthScore}</text>
                      <text x="60" y="56" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="monospace">/ 100</text>
                    </svg>
                  </div>
                  <div className={styles.detailHealthBreakdown}>
                    {healthBreakdown.map(({ label, value, color, tip }) => (
                      <div key={label} className={styles.detailHealthRow} data-tip={tip}>
                        <span className={styles.detailHealthLabel}>{label}</span>
                        <div className={styles.detailHealthBarTrack}>
                          <div className={styles.detailHealthBarFill} style={{ width: `${value}%`, background: color }} />
                        </div>
                        <span className={styles.detailHealthVal}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/*  COLLABORATION MATRIX (orgs, expanded)  */}
              {detailExpanded && !collabMatrix && !_advancedLoaded && selectedEntity.type === 'org' && orgReposList.length >= 2 && orgReposList.length <= 15 && (
                <div className={styles.detailSection}>
                  <p className={styles.detailSectionTitle}><FiLayers size={10} /> Matriz de colaboración</p>
                  <div className={styles.detailSkeleton} style={{ height: 120 }}><div className={styles.detailSkeletonShimmer} /></div>
                </div>
              )}
              {collabMatrix && detailExpanded && (
                <div className={styles.detailSection}>
                  <p className={styles.detailSectionTitle} data-tip="Heatmap que muestra cuántos contribuidores comparten entre repos - indica transferencia de conocimiento interna"><FiLayers size={10} /> Matriz de colaboración</p>
                  <p className={styles.detailSectionHint}>Contributors compartidos entre repos</p>
                  <div className={styles.detailMatrixWrap}>
                    <div className={styles.detailMatrix} style={{ gridTemplateColumns: `48px repeat(${collabMatrix.labels.length}, 1fr)` }}>
                      {/* Header row */}
                      <div className={styles.detailMatrixCorner} />
                      {collabMatrix.labels.map((label, i) => (
                        <div key={`h${i}`} className={styles.detailMatrixHeader} data-tip={label}>
                          {label.length > 6 ? label.slice(0, 5) + '…' : label}
                        </div>
                      ))}
                      {/* Data rows */}
                      {collabMatrix.matrix.map((row, i) => (
                        <>{/* Fragment for row */}
                          <div key={`l${i}`} className={styles.detailMatrixRowLabel} data-tip={collabMatrix.labels[i]}>
                            {collabMatrix.labels[i].length > 6 ? collabMatrix.labels[i].slice(0, 5) + '…' : collabMatrix.labels[i]}
                          </div>
                          {row.map((val, j) => {
                            const isdiag = i === j
                            const intensity = isdiag ? 0.15 : Math.min(val / collabMatrix.maxShared, 1)
                            return (
                              <div key={`${i}-${j}`}
                                className={`${styles.detailMatrixCell} ${isdiag ? styles.detailMatrixDiag : ''}`}
                                style={{ '--intensity': intensity, '--cell-color': isdiag ? 'rgba(255,255,255,0.05)' : `rgba(0,247,255,${0.1 + intensity * 0.6})` }}
                                data-tip={isdiag ? `${val} contributors` : `${val} shared entre ${collabMatrix.labels[i]} y ${collabMatrix.labels[j]}`}>
                                {val > 0 ? val : ''}
                              </div>
                            )
                          })}
                        </>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === TAB: RED (métricas de red) === */}
          {detailTab === 'red' && (
            <div className={styles.detailBody}>
              {nm ? (
                <>
                  <div className={`${styles.detailStatsGrid} ${styles.detailStatsGridCentered}`}>
                    <div className={styles.detailStatCard} data-tip="Qué tan central es esta entidad en la red global de colaboración (0-100%)">
                      <FiTarget size={14} className={styles.detailStatIcon} style={{ color: '#00b4d8' }} />
                      <span className={styles.detailStatValue}>{centrality}%</span>
                      <span className={styles.detailStatLabel}>Centralidad</span>
                    </div>
                    <div className={styles.detailStatCard} data-tip="Fuerza y cantidad de conexiones directas con otras entidades (0-100%)">
                      <FiShare2 size={14} className={styles.detailStatIcon} style={{ color: '#a29bfe' }} />
                      <span className={styles.detailStatValue}>{connectivity}%</span>
                      <span className={styles.detailStatLabel}>Conectividad</span>
                    </div>
                  </div>

                  <div className={styles.detailSection}>
                    <p className={styles.detailSectionTitle}><FiTarget size={10} /> Centralidad colaborativa</p>
                    <div className={styles.metricRow}>
                      <div className={styles.metricBarWrap}>
                        <div className={styles.metricBar} style={{ width: `${centrality}%`, background: 'linear-gradient(90deg, #0077b6, #00b4d8)' }} />
                      </div>
                      <span className={styles.metricValue}>{centrality}%</span>
                    </div>
                    <p className={styles.metricDetail}>
                      {{
                        org: `${nm.collab_centrality_raw ?? 0} contributors compartidos con otras orgs`,
                        repo: `${nm.collab_centrality_raw ?? 0} organizaciones representadas`,
                        user: `${nm.collab_centrality_raw ?? 0} organizaciones distintas`,
                      }[selectedEntity.type] || ''}
                    </p>
                  </div>

                  <div className={styles.detailSection}>
                    <p className={styles.detailSectionTitle}><FiShare2 size={10} /> Conectividad</p>
                    <div className={styles.metricRow}>
                      <div className={styles.metricBarWrap}>
                        <div className={styles.metricBar} style={{ width: `${connectivity}%`, background: 'linear-gradient(90deg, #6c5ce7, #a29bfe)' }} />
                      </div>
                      <span className={styles.metricValue}>{connectivity}%</span>
                    </div>
                    <p className={styles.metricDetail}>
                      {{
                        org: `${nm.collab_connectivity_raw ?? 0} organizaciones vecinas`,
                        repo: `${nm.collab_connectivity_raw ?? 0} contributors`,
                        user: `${nm.collab_connectivity_raw ?? 0} repositorios`,
                      }[selectedEntity.type] || ''}
                    </p>
                  </div>

                  {community && (
                    <div className={styles.communityBadge} style={{ '--community-color': nm.community_color }}>
                      <span className={styles.communityDot} style={{ background: nm.community_color }} />
                      <span>{community.label}</span>
                      <span className={styles.communitySize}>{community.size} nodos</span>
                    </div>
                  )}

                  {nm.bus_factor_risk && (
                    <div className={`${styles.busFactor} ${styles[`busFactor${nm.bus_factor_risk.charAt(0).toUpperCase() + nm.bus_factor_risk.slice(1)}`]}`}>
                      <div className={styles.busFactorHeader}>
                        <FiShield size={12} />
                        <span>Resiliencia: {nm.bus_factor} {nm.bus_factor === 1 ? 'pilar clave' : nm.bus_factor <= 2 ? 'núcleo reducido' : nm.bus_factor <= 4 ? 'equilibrado' : 'alta resiliencia'}</span>
                        <span className={styles.busFactorRisk}>{{ critical: 'PILAR CLAVE', high: 'NÚCLEO', medium: 'EQUILIBRADO', low: 'DISTRIBUIDO' }[nm.bus_factor_risk] || nm.bus_factor_risk.toUpperCase()}</span>
                      </div>
                      {nm.top_contributors && nm.top_contributors.length > 0 && (
                        <div className={styles.busFactorContribs}>
                          {nm.top_contributors.slice(0, 5).map((c, i) => (
                            <div key={i} className={styles.busFactorContrib}>
                              <span>@{c.login}</span>
                              <div className={styles.busFactorContribBar}>
                                <div style={{ width: `${c.percentage}%` }} />
                              </div>
                              <span>{c.percentage}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/*  KEY DEPENDENCIES - nodos críticos  */}
                  {keyDependencies.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle} data-tip="Usuarios críticos cuya marcha tendría mayor impacto en la red de colaboración"><FiAlertTriangle size={10} /> Dependencias clave <span className={styles.detailCount}>{keyDependencies.length}</span></p>
                      <p className={styles.detailSectionHint}>Usuarios cuya marcha tendría mayor impacto</p>
                      <div className={styles.detailDepsList}>
                        {keyDependencies.map(u => (
                          <div key={u.id} className={styles.detailDepsItem} onClick={() => navigateToEntity(u)} style={{ cursor: 'pointer' }}>
                            <div className={styles.detailDepsLeft}>
                              {u.isBridge ? <FiZap size={10} style={{ color: '#ffbd00' }} /> : <FiUser size={10} style={{ color: '#00ff9f', opacity: 0.5 }} />}
                              <span>{u.login || u.id}</span>
                            </div>
                            <div className={styles.detailDepsRight}>
                              {u.soleConnections > 0 && (
                                <span className={styles.detailDepsBadge} data-tip={`Único puente a ${u.soleConnections} org(s)`}>
                                  <FiAlertTriangle size={8} /> {u.soleConnections} sole bridge{u.soleConnections > 1 ? 's' : ''}
                                </span>
                              )}
                              {u.repoCount > 0 && (
                                <span className={styles.detailDepsRepos}>{u.repoCount} repos</span>
                              )}
                              <FiArrowRight size={8} className={styles.detailNavArrow} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/*  IMPACT SIMULATION  */}
                  {detailExpanded && impactSimulations.length === 0 && !_advancedLoaded && keyDependencies.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiAlertTriangle size={10} /> ¿Qué pasaría si…?</p>
                      <div className={styles.detailSkeleton} style={{ height: 80 }}><div className={styles.detailSkeletonShimmer} /></div>
                    </div>
                  )}
                  {impactSimulations.length > 0 && detailExpanded && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle} data-tip="Simulación del impacto que tendría la pérdida de usuarios clave en la red de colaboración"><FiAlertTriangle size={10} /> ¿Qué pasaría si…?</p>
                      <p className={styles.detailSectionHint}>Impacto simulado si un usuario clave se va</p>
                      <div className={styles.detailImpactList}>
                        {impactSimulations.map((sim, i) => (
                          <div key={i} className={`${styles.detailImpactCard} ${styles['detailImpact' + sim.severity.charAt(0).toUpperCase() + sim.severity.slice(1)]}`}>
                            <div className={styles.detailImpactHeader}>
                              <span className={styles.detailImpactUser}>
                                {sim.user.isBridge ? <FiZap size={10} style={{ color: '#ffbd00' }} /> : <FiUser size={10} />}
                                @{sim.user.login}
                              </span>
                              <span className={`${styles.detailImpactBadge} ${styles['detailImpactBadge' + sim.severity.charAt(0).toUpperCase() + sim.severity.slice(1)]}`}>
                                {sim.severity === 'critical' ? '⚠ Crítico' : sim.severity === 'high' ? '⚡ Alto' : '◉ Moderado'}
                              </span>
                            </div>
                            <div className={styles.detailImpactMetrics}>
                              {sim.orgConnectionsLost > 0 && (
                                <div className={styles.detailImpactMetric}>
                                  <span className={styles.detailImpactVal} style={{ color: '#ff6b6b' }}>-{sim.orgConnectionsLost}</span>
                                  <span>conexiones org</span>
                                </div>
                              )}
                              <div className={styles.detailImpactMetric}>
                                <span className={styles.detailImpactVal} style={{ color: '#ffbd00' }}>{sim.bridgeConnectionsLost}</span>
                                <span>orgs afectadas</span>
                              </div>
                              <div className={styles.detailImpactMetric}>
                                <span className={styles.detailImpactVal} style={{ color: '#bd00ff' }}>{sim.reposAffected}</span>
                                <span>repos</span>
                              </div>
                              {sim.healthDelta !== 0 && (
                                <div className={styles.detailImpactMetric}>
                                  <span className={styles.detailImpactVal} style={{ color: '#ff6b6b' }}>{sim.healthDelta}</span>
                                  <span>health</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.detailEmptyState}>
                  <FiActivity size={20} style={{ opacity: 0.3 }} />
                  <span>No hay métricas de red para esta entidad</span>
                </div>
              )}
            </div>
          )}

          {/* === TAB: EXPLORAR (relaciones navegables) === */}
          {detailTab === 'explorer' && (
            <div className={styles.detailBody}>
              {/*  ORG EXPLORER  */}
              {selectedEntity.type === 'org' && (
                <>
                  {/* Top contributors de la org */}
                  {orgTopContributors.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiUsers size={10} /> Top Contributors <span className={styles.detailCount}>{orgTopContributors.length}</span></p>
                      <div className={styles.detailUserList}>
                        {orgTopContributors.slice(0, detailExpanded ? 25 : 10).map(u => (
                          <div key={u.id} className={styles.detailUserItem} onClick={() => navigateToEntity(u)} style={{ cursor: 'pointer' }}>
                            {u.isBridge ? <FiZap size={10} style={{ color: '#ffbd00' }} /> : <FiUser size={10} style={{ color: '#00ff9f', opacity: 0.5 }} />}
                            <span>{u.login || u.id}</span>
                            <span className={styles.detailUserMeta}>{u.repoCount} repos</span>
                            <FiArrowRight size={8} className={styles.detailNavArrow} />
                          </div>
                        ))}
                        {orgTopContributors.length > (detailExpanded ? 25 : 10) && <span className={styles.detailChipMore}>+{orgTopContributors.length - (detailExpanded ? 25 : 10)} más</span>}
                      </div>
                    </div>
                  )}

                  {/* Orgs entrelazadas */}
                  {orgEntangledOrgs.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiShare2 size={10} /> Orgs conectadas <span className={styles.detailCount}>{orgEntangledOrgs.length}</span></p>
                      <div className={styles.detailUserList}>
                        {orgEntangledOrgs.slice(0, detailExpanded ? 20 : 8).map(o => (
                          <div key={o.id} className={styles.detailUserItem} onClick={() => navigateToEntity(o)} style={{ cursor: 'pointer' }}>
                            <FiGrid size={10} style={{ color: '#00f7ff' }} />
                            <span>{o.name || o.login || o.id}</span>
                            <span className={styles.detailUserMeta}>{o.sharedCount} compartidos</span>
                            <FiArrowRight size={8} className={styles.detailNavArrow} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/*  KNOWLEDGE FLOWS: flujos internos de conocimiento  */}
                  {knowledgeFlows.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle} data-tip="Pares de repositorios que comparten más contribuidores - indica transferencia de conocimiento"><FiLink size={10} /> Flujos de conocimiento <span className={styles.detailCount}>{knowledgeFlows.length}</span></p>
                      <p className={styles.detailSectionHint}>Pares de repos que comparten más contributors</p>
                      <div className={styles.detailFlowsList}>
                        {knowledgeFlows.map((flow, i) => {
                          const maxShared = knowledgeFlows[0]?.shared || 1
                          return (
                            <div key={i} className={styles.detailFlowItem}>
                              <div className={styles.detailFlowPair}>
                                <span className={styles.detailFlowRepo} onClick={() => navigateToEntity(flow.repoA)} style={{ cursor: 'pointer' }}>
                                  {flow.repoA.name || flow.repoA.full_name?.split('/')[1]}
                                </span>
                                <span className={styles.detailFlowArrow}>⇄</span>
                                <span className={styles.detailFlowRepo} onClick={() => navigateToEntity(flow.repoB)} style={{ cursor: 'pointer' }}>
                                  {flow.repoB.name || flow.repoB.full_name?.split('/')[1]}
                                </span>
                              </div>
                              <div className={styles.detailFlowBar}>
                                <div className={styles.detailFlowBarFill} style={{ width: `${(flow.shared / maxShared) * 100}%` }} />
                              </div>
                              <span className={styles.detailFlowCount}>{flow.shared}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/*  REPO EXPLORER  */}
              {selectedEntity.type === 'repo' && (
                <>
                  {/* Orgs representadas */}
                  {repoOrgDiversity.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiGrid size={10} /> Organizaciones representadas <span className={styles.detailCount}>{repoOrgDiversity.length}</span></p>
                      <div className={styles.detailUserList}>
                        {repoOrgDiversity.map(o => (
                          <div key={o.id} className={styles.detailUserItem} onClick={() => navigateToEntity(o)} style={{ cursor: 'pointer' }}>
                            <FiGrid size={10} style={{ color: '#00f7ff' }} />
                            <span>{o.name || o.login || o.id}</span>
                            <FiArrowRight size={8} className={styles.detailNavArrow} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Todos los contributors con info */}
                  {repoUsers.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiUsers size={10} /> Todos los contributors <span className={styles.detailCount}>{repoUsers.length}</span></p>
                      <div className={styles.detailUserList}>
                        {repoUsers.slice(0, detailExpanded ? 50 : 15).map(u => (
                          <div key={u.id} className={styles.detailUserItem} onClick={() => navigateToEntity(u)} style={{ cursor: 'pointer' }}>
                            {u.isBridge ? <FiZap size={10} style={{ color: '#ffbd00' }} /> : <FiUser size={10} style={{ color: '#00ff9f', opacity: 0.5 }} />}
                            <span>{u.login || u.id}</span>
                            {u.isBridge && <span className={styles.detailBridgeMini}>bridge</span>}
                            <FiArrowRight size={8} className={styles.detailNavArrow} />
                          </div>
                        ))}
                        {repoUsers.length > (detailExpanded ? 50 : 15) && <span className={styles.detailChipMore}>+{repoUsers.length - (detailExpanded ? 50 : 15)} más</span>}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/*  USER EXPLORER  */}
              {selectedEntity.type === 'user' && (
                <>
                  {/* Lenguajes */}
                  {userLangs.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiCode size={10} /> Stack tecnológico</p>
                      <div className={styles.detailChips}>
                        {userLangs.map(lang => (
                          <span key={lang} className={styles.detailChip} style={{ borderColor: 'rgba(162,155,254,0.3)' }}>{lang}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Co-contributors */}
                  {userCoContributors.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiUsers size={10} /> Co-contributors <span className={styles.detailCount}>{userCoContributors.length}</span></p>
                      <div className={styles.detailUserList}>
                        {userCoContributors.slice(0, detailExpanded ? 25 : 10).map(u => (
                          <div key={u.id} className={styles.detailUserItem} onClick={() => navigateToEntity(u)} style={{ cursor: 'pointer' }}>
                            {u.isBridge ? <FiZap size={10} style={{ color: '#ffbd00' }} /> : <FiUser size={10} style={{ color: '#00ff9f', opacity: 0.5 }} />}
                            <span>{u.login || u.id}</span>
                            <span className={styles.detailUserMeta}>{u.sharedRepos} repos</span>
                            <FiArrowRight size={8} className={styles.detailNavArrow} />
                          </div>
                        ))}
                        {userCoContributors.length > (detailExpanded ? 25 : 10) && <span className={styles.detailChipMore}>+{userCoContributors.length - (detailExpanded ? 25 : 10)} más</span>}
                      </div>
                    </div>
                  )}

                  {/* Orgs navegables */}
                  {userOrgs.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}><FiGrid size={10} /> Saltar a organización</p>
                      <div className={styles.detailUserList}>
                        {userOrgs.map(o => (
                          <div key={o.id} className={styles.detailUserItem} onClick={() => navigateToEntity(o)} style={{ cursor: 'pointer' }}>
                            <FiGrid size={10} style={{ color: '#00f7ff' }} />
                            <span>{o.name || o.login || o.id}</span>
                            <FiArrowRight size={8} className={styles.detailNavArrow} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/*  SIMILAR ENTITIES  */}
              {detailExpanded && similarEntities.length === 0 && !_advancedLoaded && radarAxes.length >= 3 && (
                <div className={styles.detailSection}>
                  <p className={styles.detailSectionTitle}><FiCrosshair size={10} /> Entidades similares</p>
                  <div className={styles.detailSkeleton}><div className={styles.detailSkeletonShimmer} /></div>
                </div>
              )}
              {similarEntities.length > 0 && detailExpanded && (
                <div className={styles.detailSection}>
                  <p className={styles.detailSectionTitle} data-tip="Entidades con perfil de colaboración similar basado en distancia euclidiana del radar"><FiCrosshair size={10} /> Entidades similares</p>
                  <p className={styles.detailSectionHint}>Perfiles de radar parecidos al actual</p>
                  <div className={styles.detailSimilarList}>
                    {similarEntities.map((sim, i) => (
                      <div key={i} className={styles.detailSimilarItem}
                        onClick={() => {
                          const entity = selectedEntity.type === 'org'
                            ? universeData?.orgNodes?.find(o => o.id === sim.entity.id)
                            : selectedEntity.type === 'repo'
                            ? universeData?.repoNodes?.find(r => r.id === sim.entity.id)
                            : null
                          if (entity) navigateToEntity(entity)
                        }}
                        style={{ cursor: 'pointer' }}>
                        <div className={styles.detailSimilarLeft}>
                          {selectedEntity.type === 'org' && <FiGrid size={10} style={{ color: '#00f7ff' }} />}
                          {selectedEntity.type === 'repo' && <FiGitBranch size={10} style={{ color: '#bd00ff' }} />}
                          {selectedEntity.type === 'user' && <FiUser size={10} style={{ color: '#00ff9f' }} />}
                          <span className={styles.detailSimilarName}>{sim.entity.name}</span>
                        </div>
                        <div className={styles.detailSimilarRight}>
                          <div className={styles.detailSimilarBarTrack}>
                            <div className={styles.detailSimilarBarFill} style={{ width: `${sim.similarity}%`, background: sim.similarity > 80 ? '#00ff9f' : sim.similarity > 60 ? '#ffd166' : '#a29bfe' }} />
                          </div>
                          <span className={styles.detailSimilarPct}>{sim.similarity}%</span>
                          <FiArrowRight size={8} className={styles.detailNavArrow} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          </div>{/* end detailMain */}
          </div>{/* end detailLayout */}

          {/* === NAV BREADCRUMB === */}
          {navHistory.length > 0 && (
            <div className={styles.detailBreadcrumb}>
              {navHistory.slice(-3).map((e, i) => (
                <span key={i} className={styles.detailBreadcrumbItem}>
                  {e.name || e.login || e.full_name?.split('/')[1]}
                  <FiArrowRight size={8} />
                </span>
              ))}
              <span className={styles.detailBreadcrumbCurrent}>
                {selectedEntity.name || selectedEntity.login || selectedEntity.full_name?.split('/')[1]}
              </span>
            </div>
          )}
          </>)}{/* end hasData */}
        </aside>
        )
      })()}

      {/* Floating tooltip */}
      {tooltipText && (
        <div className={styles.floatingTooltip}
          style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          {tooltipText}
        </div>
      )}

      {/* Botones de acción inferiores */}
      <div className={`${styles.bottomActions} ${tourUIClass}`}>
        {!tourActive && !tourFading && temporalRange && (
          <button className={styles.tourBtn} onClick={startTour}>
            <FiPlay size={13} />
            <span>Tour Cósmico</span>
          </button>
        )}
        <button className={styles.helpBtn} onClick={() => setShowHelp(h => !h)}>
          <FiHelpCircle size={15} />
          <span>Guía del Universo</span>
        </button>
      </div>

      {/* Panel de ayuda - Completo */}
      {showHelp && (
        <aside className={styles.helpPanel}>
          <div className={styles.helpHeader}>
            <div className={styles.helpHeaderLeft}>
              <span className={styles.helpHeaderIcon}>⚛</span>
              <div>
                <h3>Guía del Universo Cuántico</h3>
                <span className={styles.helpHeaderSub}>Todo lo que necesitas saber</span>
              </div>
            </div>
            <button className={styles.helpClose} onClick={() => setShowHelp(false)}><FiX size={14} /></button>
          </div>
          
          {/* Tabs de navegación */}
          <div className={styles.helpTabs}>
            {[
              { id: 'entities', label: 'Entidades', icon: '◉' },
              { id: 'quantum', label: 'Fenómenos', icon: '∿' },
              { id: 'analysis', label: 'Análisis', icon: '⬡' },
              { id: 'lenses', label: 'Lentes', icon: '◎' },
              { id: 'controls', label: 'Controles', icon: '⌘' },
            ].map(tab => (
              <button
                key={tab.id}
                className={`${styles.helpTabBtn} ${helpTab === tab.id ? styles.helpTabActive : ''}`}
                onClick={() => setHelpTab(tab.id)}
              >
                <span className={styles.helpTabIcon}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.helpBody}>
            {/* ===== TAB: ENTIDADES ===== */}
            {helpTab === 'entities' && (
              <div className={styles.helpSection}>
                <p className={styles.helpIntro}>
                  Cada elemento visual del universo es una <strong>analogía con la física cuántica</strong>. Las entidades del ecosistema de software (organizaciones, repositorios, desarrolladores) se representan como partículas y sistemas cuánticos interconectados.
                </p>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,247,255,0.12)', color: '#00f7ff' }}>⊛</div>
                  <div>
                    <h4>Organizaciones <span className={styles.helpCardTag}>Procesadores Cuánticos</span></h4>
                    <p>Los <strong>anillos rotando</strong> representan organizaciones de GitHub. Como un procesador cuántico real, cada organización contiene y gestiona repositorios (qubits). Sus <em>torus concéntricos</em> giran a diferentes velocidades, simulando los campos magnéticos de un procesador real. El <strong>núcleo central</strong> brilla con la firma cromática de la organización.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(189,0,255,0.12)', color: '#bd00ff' }}>◉</div>
                  <div>
                    <h4>Repositorios <span className={styles.helpCardTag}>Qubits</span></h4>
                    <p>Las <strong>esferas violetas</strong> son repositorios - la unidad de información del ecosistema. El qubit es la unidad de información cuántica; análogamente, cada repositorio almacena el conocimiento del proyecto. Las <em>nubes de probabilidad</em> que los rodean representan su campo de influencia, y su tamaño varía según la actividad del repositorio.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,255,159,0.12)', color: '#00ff9f' }}>•</div>
                  <div>
                    <h4>Desarrolladores <span className={styles.helpCardTag}>Partículas Cuánticas</span></h4>
                    <p>Los <strong>puntos verdes</strong> son desarrolladores que <em>orbitan</em> los repositorios a los que contribuyen, como electrones orbitando un átomo. Su posición orbital no es fija - vibran constantemente (principio de incertidumbre de Heisenberg). El radio orbital refleja su nivel de actividad en el repositorio.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,189,0,0.12)', color: '#ffbd00' }}>⚛</div>
                  <div>
                    <h4>Bridge Users <span className={styles.helpCardTag}>Partículas Entrelazadas</span></h4>
                    <p>Los <strong>puntos dorados</strong> que destellan simultáneamente son <em>bridge users</em> - desarrolladores que trabajan en repositorios de <strong>múltiples organizaciones</strong>. Su destello sincronizado visualiza el entrelazamiento cuántico: correlación instantánea sin importar la distancia. Son las entidades más valiosas del ecosistema porque transfieren conocimiento entre organizaciones.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,212,228,0.12)', color: '#00d4e4' }}>∿</div>
                  <div>
                    <h4>Canales de Entrelazamiento <span className={styles.helpCardTag}>Colaboraciones</span></h4>
                    <p>Las <strong>ondas sinuosas</strong> entre entidades representan relaciones de colaboración directa. Como canales cuánticos que transmiten información entre organizaciones, estas líneas ondulantes visualizan cómo los desarrolladores conectan repositorios y organizaciones entre sí. La <em>intensidad del color</em> y la <em>amplitud de la onda</em> reflejan la fuerza de la conexión.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB: FENÓMENOS CUÁNTICOS ===== */}
            {helpTab === 'quantum' && (
              <div className={styles.helpSection}>
                <p className={styles.helpIntro}>
                  El universo está lleno de <strong>fenómenos cuánticos</strong> que dan vida al espacio entre las entidades. Cada efecto visual tiene un análogo en la física cuántica real.
                </p>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(100,100,255,0.1)', color: '#6666ff' }}>≋</div>
                  <div>
                    <h4>Vacío Cuántico</h4>
                    <p>La <strong>rejilla de fondo</strong> y las partículas que parpadean aleatoriamente representan las <em>fluctuaciones del vacío cuántico</em>. En la mecánica cuántica, incluso el espacio vacío bulle con energía - pares de partículas aparecen y desaparecen constantemente. La rejilla oscila sutilmente, simulando el tejido del espacio-tiempo.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,255,200,0.12)', color: '#ffffaa' }}>✦</div>
                  <div>
                    <h4>Quantum Genesis</h4>
                    <p>El <strong>destello blanco inicial</strong> simula el Big Bang que da origen al universo cuántico. Al entrar en la visualización, todas las entidades nacen desde un punto singular y se expanden siguiendo una animación cinética que distribuye organizaciones, repositorios y usuarios a sus posiciones finales. La opacidad y escala aumentan <em>progresivamente</em> (entanglement phase).</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(189,0,255,0.1)', color: '#dd88ff' }}>☁</div>
                  <div>
                    <h4>Nubes de Probabilidad</h4>
                    <p>Los <strong>halos difusos</strong> alrededor de cada repositorio (qubit) son sus <em>nubes de probabilidad</em>. En mecánica cuántica, la posición de un electrón no es un punto fijo sino una distribución de probabilidad. Las partículas de la nube orbitan con velocidades aleatorias, pulsando con un brillo tenue que refleja la superposición de estados del repositorio.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,247,255,0.1)', color: '#00f7ff' }}>◎</div>
                  <div>
                    <h4>Anillos de Energía</h4>
                    <p>Los <strong>anillos brillantes</strong> alrededor de las organizaciones (procesadores) representan sus <em>niveles de energía</em>. Como un átomo con sus capas electrónicas, cada organización emite anillos que reflejan su nivel de actividad. Los colores heredan la firma cromática de la organización, y los anillos pulsan sutilmente con el ritmo del ecosistema.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,215,0,0.1)', color: '#ffd700' }}>⊕</div>
                  <div>
                    <h4>Efecto Túnel Cuántico</h4>
                    <p>Las <strong>esferas doradas que viajan</strong> por los canales de entrelazamiento son <em>fotones</em> atravesando barreras de potencial. En la física real, una partícula puede "tunelizar" a través de una barrera que clásicamente sería impenetrable. Aquí, los fotones viajan entre entidades conectadas, visualizando la transferencia activa de información por los canales.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,200,255,0.1)', color: '#00c8ff' }}>○</div>
                  <div>
                    <h4>Ondas de Decoherencia</h4>
                    <p>Los <strong>anillos expansivos</strong> que emanan periódicamente de las organizaciones simulan la <em>decoherencia cuántica</em> - el proceso por el que un sistema cuántico pierde su coherencia al interactuar con el entorno. Las ondas se expanden y desvanecen, representando cómo la información cuántica se disipa al exterior del sistema.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,100,100,0.1)', color: '#ff8888' }}>❋</div>
                  <div>
                    <h4>Radiación de Hawking</h4>
                    <p>Las <strong>micropartículas</strong> que emanan constantemente de cada organización simulan la <em>radiación de Hawking</em> - la emisión térmica predicha por Stephen Hawking para los agujeros negros. Las partículas nacen cerca de la organización y se alejan lentamente, desapareciendo al salir de su campo gravitatorio. Representan la actividad constante del ecosistema.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,200,50,0.1)', color: '#ffcc44' }}>↕</div>
                  <div>
                    <h4>Incertidumbre de Heisenberg</h4>
                    <p>La <strong>micro-vibración constante</strong> de todas las entidades refleja el <em>principio de incertidumbre de Heisenberg</em>: en el mundo cuántico no existen posiciones absolutamente fijas. No puedes conocer simultáneamente la posición y el momento de una partícula con precisión infinita. Cada nodo vibra sutilmente como recordatorio de esta ley fundamental.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(100,150,255,0.1)', color: '#88aaff' }}>⩕</div>
                  <div>
                    <h4>Campo de Interferencia</h4>
                    <p>La <strong>rejilla ondulante</strong> del fondo es un <em>patrón de interferencia</em> - el resultado de ondas cuánticas superponiéndose constructiva y destructivamente. Como el famoso experimento de la doble rendija, las crestas y valles forman un patrón periódico que pulsa lentamente, recordando que las partículas cuánticas se comportan también como ondas.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB: ANÁLISIS ===== */}
            {helpTab === 'analysis' && (
              <div className={styles.helpSection}>
                <p className={styles.helpIntro}>
                  El universo cuántico no es solo una visualización estética - cada entidad se analiza con <strong>métricas de red avanzadas</strong> que revelan la estructura profunda de la colaboración.
                </p>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(108,92,231,0.12)', color: '#6c5ce7' }}>⬡</div>
                  <div>
                    <h4>Radar de Colaboración</h4>
                    <p>El <strong>pentágono interactivo</strong> del panel de detalle muestra 5 ejes de colaboración: <em>Actividad</em> (commits, PRs), <em>Diversidad</em> (repos distintos), <em>Impacto</em> (influencia en el ecosistema), <em>Consistencia</em> (regularidad temporal), y <em>Alcance</em> (organizaciones distintas). Cada eje se normaliza de 0 a 1 y se compara con la media global.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,180,216,0.12)', color: '#00b4d8' }}>⊕</div>
                  <div>
                    <h4>Centralidad de Red</h4>
                    <p>La <strong>centralidad</strong> mide la importancia estructural de una entidad dentro del grafo. Usa algoritmos como <em>betweenness centrality</em> (cuántos caminos mínimos pasan por ella) y <em>degree centrality</em> (número de conexiones). Las entidades con alta centralidad son críticas para la conectividad: si desaparecen, el ecosistema se fragmenta.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,107,107,0.12)', color: '#ff6b6b' }}>⚠</div>
                  <div>
                    <h4>Resiliencia</h4>
                    <p>La <strong>Resiliencia</strong> mide <em>cuántos contribuidores clave sostienen un proyecto</em>. Un valor de 1 indica un <span style={{color:'#ff6b6b'}}>pilar clave</span>: un contribuidor esencial que mantiene vivo el proyecto. Con 2 se forma un <span style={{color:'#ff8800'}}>núcleo reducido</span>, con 3-4 el conocimiento está <span style={{color:'#ffdd00'}}>equilibrado</span>, y con 5+ hay <span style={{color:'#00ff88'}}>alta resiliencia</span>. Se muestra con barras de contribución por usuario. Los pilares clave son valiosos — diversificar contribuidores aumentaría la resiliencia del proyecto.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(108,92,231,0.12)', color: '#a29bfe' }}>⬢</div>
                  <div>
                    <h4>Comunidades</h4>
                    <p>El algoritmo de <strong>detección de comunidades</strong> identifica clusters de entidades densamente conectadas entre sí pero escasamente conectadas con el resto. Cada comunidad recibe un <em>color único</em> y las entidades se agrupan visualmente. Las fronteras zonales (activables desde Ajustes) delimitan estas comunidades con esferas translúcidas.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,255,159,0.12)', color: '#00ff9f' }}>◈</div>
                  <div>
                    <h4>Roles de Red</h4>
                    <p>Cada usuario recibe un <strong>rol de red</strong> basado en sus métricas de conectividad: <em>Hub Central</em> (muchas conexiones directas), <em>Puente</em> (conecta comunidades disjuntas), <em>Especialista</em> (contribuciones intensas en pocos repos), <em>Explorador</em> (contribuciones dispersas en muchos repos), o <em>Colaborador</em> (participación regular). El rol se muestra con un badge cromático en el panel de detalle.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,189,0,0.12)', color: '#ffbd00' }}>⇋</div>
                  <div>
                    <h4>Cross-Pollination</h4>
                    <p>La tasa de <strong>polinización cruzada</strong> mide qué porcentaje de usuarios contribuyen a repositorios de <em>múltiples organizaciones</em>, transfiriendo prácticas y conocimiento entre equipos. Una tasa alta indica un ecosistema saludable donde las ideas fluyen libremente. Se calcula como: bridge users / total users × 100.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(162,155,254,0.12)', color: '#a29bfe' }}>🧬</div>
                  <div>
                    <h4>ADN de Colaboración</h4>
                    <p>El <strong>ADN de Colaboración</strong> es una visualización única que codifica el <em>patrón de contribución</em> de cada entidad como una cadena genética. Cada segmento de color representa un tipo de actividad (commits, issues, PRs, reviews), y la secuencia revela el estilo de trabajo del desarrollador o equipo - ¿es más revisor, más codificador, o muy equilibrado?</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,100,100,0.12)', color: '#ff6b6b' }}>💥</div>
                  <div>
                    <h4>Simulación de Impacto</h4>
                    <p>La <strong>simulación de impacto</strong> responde a la pregunta: <em>"¿Qué pasaría si este usuario dejara de contribuir?"</em> Calcula qué repositorios perderían mantenimiento, cuántas conexiones se romperían, y cuánto se fragmentaría la red. Se clasifica como impacto <span style={{color:'#ff6b6b'}}>crítico</span>, <span style={{color:'#ffbd00'}}>alto</span> o <span style={{color:'#a29bfe'}}>moderado</span>.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,220,200,0.12)', color: '#00ddc8' }}>≈</div>
                  <div>
                    <h4>Entidades Similares</h4>
                    <p>El motor de <strong>similitud</strong> encuentra entidades con patrones de colaboración parecidos usando métricas como co-contribución (repos en común), distribución de lenguajes, nivel de actividad y conexiones. El porcentaje de similitud indica qué tan intercambiables son dos entidades en el grafo. Útil para encontrar candidatos de backup o colaboradores afines.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,255,150,0.12)', color: '#00ff96' }}>♥</div>
                  <div>
                    <h4>Salud del Proyecto</h4>
                    <p>El <strong>gauge de salud</strong> (arco semicircular) muestra un score compuesto de 0-100 que evalúa la sostenibilidad del proyecto. Combina métricas de: <em>diversidad de contribuidores</em>, <em>actividad reciente</em>, <em>distribución de commits</em> y <em>resiliencia</em>. A mayor puntaje, más resiliente es el proyecto ante la pérdida de contribuidores clave.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,189,0,0.12)', color: '#ffd166' }}>→</div>
                  <div>
                    <h4>Flujos de Conocimiento</h4>
                    <p>Los <strong>flujos de conocimiento</strong> rastrean cómo los desarrolladores llevan prácticas, herramientas y patrones de un repositorio a otro. Una barra de flujo A → B indica que desarrolladores que trabajan en A también contribuyen a B, creando un canal de transferencia de conocimiento. La anchura de la barra refleja el volumen de flujo.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB: LENTES ===== */}
            {helpTab === 'lenses' && (
              <div className={styles.helpSection}>
                <p className={styles.helpIntro}>
                  Las <strong>lentes analíticas</strong> transforman la visualización del universo para revelar diferentes dimensiones de la red de colaboración. Cada lente aplica un algoritmo de coloreo y dimensionado que resalta un aspecto específico.
                </p>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(108,92,231,0.12)', color: '#6c5ce7' }}><FiLayers size={18} /></div>
                  <div>
                    <h4>Lente de Comunidades</h4>
                    <p>Colorea cada entidad según la <strong>comunidad</strong> a la que pertenece (algoritmo Louvain/modularity). Las entidades del mismo color forman clusters de trabajo estrecho. Permite identificar <em>silos organizacionales</em>, equipos que trabajan aislados, y los <em>bridge users</em> que los conectan. Las fronteras zonales se habilitan automáticamente para delimitar cada comunidad en el espacio 3D.</p>
                    <p style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(108,92,231,0.08)', borderRadius: 8, borderLeft: '3px solid #6c5ce7', fontSize: '11.5px', lineHeight: 1.5 }}>
                      <strong style={{ color: '#a29bfe' }}>✦ Transición multi-org:</strong> los usuarios que contribuyen a <strong>más de una organización</strong> transicionan suavemente entre los colores de comunidad de cada org a la que pertenecen. El ritmo de transición varía aleatoriamente por usuario para dar una sensación orgánica, observa cómo sus partículas <em>parpadean</em> entre colores revelando visualmente los puentes humanos entre comunidades.
                    </p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,180,216,0.12)', color: '#00b4d8' }}><FiActivity size={18} /></div>
                  <div>
                    <h4>Lente de Centralidad</h4>
                    <p>Visualiza la <strong>betweenness centrality</strong> de cada entidad - cuántos caminos mínimos de la red pasan por ella. Las entidades más centrales se ven <em>más grandes y brillantes</em>, las periféricas se oscurecen y encogen. Se aplica a <strong>todos los tipos</strong>: organizaciones, repositorios y usuarios. Usa percentil rank (distribución uniforme), así que siempre verás un gradiente claro de oscuro a brillante independientemente de la distribución de los datos.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,107,107,0.12)', color: '#ff6b6b' }}><FiShield size={18} /></div>
                  <div>
                    <h4>Lente de Resiliencia</h4>
                    <p>Colorea los <strong>repositorios</strong> según su distribución de contribuidores clave. <span style={{color:'#ff3333'}}>Rojo</span> = pilar clave (1 contribuidor principal), <span style={{color:'#ff8800'}}>naranja</span> = núcleo reducido (2), <span style={{color:'#ffdd00'}}>amarillo</span> = equilibrado (3-4), <span style={{color:'#00ff88'}}>verde</span> = alta resiliencia (5+). Organizaciones y usuarios se atenúan para que los repos destaquen. Los repos más destacados tienen contribuidores esenciales que los sostienen.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(255,209,102,0.12)', color: '#ffd166' }}><FiZap size={18} /></div>
                  <div>
                    <h4>Lente de Intensidad</h4>
                    <p>Visualiza la <strong>degree centrality</strong> - el número de conexiones directas de cada entidad. Las entidades más conectadas se ven más grandes y con un brillo dorado cálido, las poco conectadas se oscurecen. Usa percentil rank para distribución uniforme del gradiente. Complementa la lente de Centralidad: <em>degree</em> mide conexiones directas, <em>betweenness</em> mide importancia como puente.</p>
                  </div>
                </div>

                <div className={styles.helpCard}>
                  <div className={styles.helpCardIcon} style={{ background: 'rgba(0,255,170,0.12)', color: '#00ffaa' }}><FiCrosshair size={18} /></div>
                  <div>
                    <h4>Quantum Tunneling</h4>
                    <p>El <strong>efecto túnel</strong> permite encontrar el <em>camino más corto</em> entre dos entidades cualesquiera del universo. Escribe el origen y destino en los campos de búsqueda y el algoritmo BFS encontrará la cadena de conexiones más corta. El resultado muestra cada salto entre entidades y su tipo (org → repo → user → repo → org). Si no hay camino, las entidades están en componentes desconectados del grafo.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ===== TAB: CONTROLES ===== */}
            {helpTab === 'controls' && (
              <div className={styles.helpSection}>
                <p className={styles.helpIntro}>
                  Controles de navegación e interacción con el universo cuántico. Toda interacción sigue la metáfora cuántica.
                </p>

                <div className={styles.helpControlGrid}>
                  <div className={styles.helpControlCard}>
                    <div className={styles.helpControlKey}>Click</div>
                    <div>
                      <strong>Colapso de Función de Onda</strong>
                      <p>Al hacer click en una entidad, "colapsa su función de onda" revelando toda su información: radar de colaboración, estadísticas, métricas de red, resiliencia, ADN, y más. La cámara se acerca suavemente a la entidad seleccionada.</p>
                    </div>
                  </div>

                  <div className={styles.helpControlCard}>
                    <div className={styles.helpControlKey}>Scroll</div>
                    <div>
                      <strong>Control de Zoom</strong>
                      <p>La rueda del ratón controla el nivel de zoom. El sistema de <em>Level of Detail</em> (LOD) ajusta automáticamente la complejidad visual según la distancia: de lejos se ven solo puntos, de cerca se ven los detalles completos de cada entidad.</p>
                    </div>
                  </div>

                  <div className={styles.helpControlCard}>
                    <div className={styles.helpControlKey}>Arrastrar</div>
                    <div>
                      <strong>Rotación Orbital</strong>
                      <p>Arrastra con el ratón para orbitar alrededor del universo. La cámara sigue una órbita esférica centrada en el punto de interés seleccionado, o en el centro del universo si no hay selección.</p>
                    </div>
                  </div>

                  <div className={styles.helpControlCard}>
                    <div className={styles.helpControlKey}>ESC</div>
                    <div>
                      <strong>Deselección / Salir</strong>
                      <p>Cierra el panel de detalle si hay una entidad seleccionada. Si no hay nada seleccionado, cierra la visualización completa y vuelve al dashboard principal.</p>
                    </div>
                  </div>

                  <div className={styles.helpControlCard}>
                    <div className={styles.helpControlKey}><FiSearch size={13} /></div>
                    <div>
                      <strong>Búsqueda</strong>
                      <p>La barra superior permite buscar cualquier entidad por nombre. Los resultados se agrupan por tipo (organizaciones, repositorios, usuarios) y los bridge users se marcan con una etiqueta dorada. Seleccionar un resultado centra la cámara en la entidad.</p>
                    </div>
                  </div>

                  <div className={styles.helpControlCard}>
                    <div className={styles.helpControlKey}><FiSettings size={13} /></div>
                    <div>
                      <strong>Ajustes</strong>
                      <p>El menú de ajustes permite: activar/desactivar <em>fronteras zonales</em>, mostrar/ocultar <em>bots</em>, y <em>resaltar</em> tipos específicos de entidades con filtros de color para organizaciones, repositorios, usuarios normales, bridge users y canales de colaboración.</p>
                    </div>
                  </div>

                  <div className={styles.helpControlCard}>
                    <div className={styles.helpControlKey}><FiBookmark size={13} /></div>
                    <div>
                      <strong>Pin & Compare</strong>
                      <p>En el panel de detalle, usa el botón <em>pin</em> para anclar una entidad y luego selecciona otra para compararlas lado a lado. Las barras muestran las métricas de ambas entidades superpuestas con un delta que indica la diferencia.</p>
                    </div>
                  </div>

                  <div className={styles.helpControlCard}>
                    <div className={styles.helpControlKey}><FiMaximize2 size={13} /></div>
                    <div>
                      <strong>Expandir Panel</strong>
                      <p>El panel de detalle puede expandirse a vista completa con el botón de maximizar, mostrando un layout de 2 columnas con todas las métricas, matriz de colaboración, flujos de conocimiento y análisis completo de la entidad.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* === TIMELINE SLIDER - barra temporal inferior === */}
      {(uiVisible || tourActive || tourFading || tourExiting) && temporalRange && (
        <div className={`${styles.timelineSlider} ${tourActive ? styles.timelineSliderTourMode : ''} ${tourUIClass}`}>
          <div className={styles.timelineTrack}>
            <span className={styles.timelineLabel}>{temporalRange.min}</span>
            <input
              type="range"
              className={styles.timelineInput}
              min={temporalRange.min}
              max={temporalRange.max}
              step={0.02}
              value={localSlider ?? temporalRange.max}
              onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
              onMouseUp={() => { if (localSlider != null) setSliderYear(localSlider) }}
              onTouchEnd={() => { if (localSlider != null) setSliderYear(localSlider) }}
            />
            <span className={styles.timelineLabel}>{temporalRange.max}</span>
          </div>
          <div className={styles.timelineYear}>
            {localSlider != null && localSlider < temporalRange.max ? (
              <>
                <span className={styles.timelineYearRange}>{temporalRange.min} – {Math.floor(localSlider)}</span>
                <button className={styles.timelineClear} onClick={() => { setLocalSlider(temporalRange.max); activeNodeIdsRef.current = null; setSliderYear(temporalRange.max) }} data-tip="Mostrar todo">✕</button>
              </>
            ) : (
              <span className={styles.timelineYearAll}>Todo el rango temporal</span>
            )}
          </div>
        </div>
      )}

      <div className={`${styles.interactionHint} ${tourUIClass}`}>
        <span>Click · Colapso de función de onda</span>
        <span className={styles.hintDivider}>|</span>
        <span>Scroll · Zoom</span>
        <span className={styles.hintDivider}>|</span>
        <span>Arrastrar · Órbita</span>
      </div>

      {/* === FADE TO BLACK — transición de entrada al tour === */}
      {tourFading && !tourActive && (
        <div className={styles.tourFadeToBlack} />
      )}

      {/* === CINEMATIC TOUR OVERLAY === */}
      {(tourActive || tourExiting) && tourWaypointsRef.current.length > 0 && (() => {
        const currentWp = tourWaypointsRef.current[tourStep]
        return (
        <div className={`${styles.tourOverlay} ${(currentWp?.isVoid || currentWp?.isPreludio) ? styles.tourOverlayVoid : ''} ${tourExiting ? styles.tourOverlayExiting : ''}`}>
          {/* Letterbox bars - hidden during void/preludio for total blackness */}
          {!currentWp?.isVoid && !currentWp?.isPreludio && <div className={styles.tourLetterboxTop} />}
          {!currentWp?.isVoid && !currentWp?.isPreludio && <div className={styles.tourLetterboxBottom} />}

          {/* VOID PHASE — total darkness + centered poetic text */}
          {currentWp?.isVoid && (
            <div className={styles.tourVoidNarrative} key={`void-${tourStep}`}>
              <p className={styles.tourVoidLine} style={{ animationDelay: '1s', animationPlayState: tourPaused ? 'paused' : 'running' }}>{currentWp.text}</p>
            </div>
          )}

          {/* PRELUDIO — "Y de pronto, un día…" dramatic centered text */}
          {currentWp?.isPreludio && !tourBigBangFired && (
            <div className={styles.tourPreludioNarrative} key={`preludio-${tourStep}`}>
              <p className={styles.tourPreludioText} style={{ animationPlayState: tourPaused ? 'paused' : 'running' }}>{currentWp.text}</p>
            </div>
          )}

          {/* GÉNESIS — post-BigBang narrative with glow */}
          {currentWp?.isGenesis && (
            <div className={styles.tourGenesisNarrative} key={`genesis-${tourStep}`} style={{ animationPlayState: tourPaused ? 'paused' : 'running' }}>
              <h2 className={styles.tourGenesisTitle}>{currentWp.title}</h2>
              <p className={styles.tourGenesisText}>{currentWp.text}</p>
            </div>
          )}

          {/* NORMAL WAYPOINTS — standard narrative */}
          {!currentWp?.isVoid && !currentWp?.isPreludio && !currentWp?.isGenesis && (
            <div className={styles.tourNarrative} key={tourStep}>
              <h2 className={styles.tourTitle}>{currentWp?.title}</h2>
              <p className={styles.tourText}>{currentWp?.text}</p>
            </div>
          )}

          <div className={styles.tourProgress}>
            {tourWaypointsRef.current.map((_, i) => (
              <div key={i} className={`${styles.tourDot} ${i <= tourStep ? styles.tourDotActive : ''} ${i === tourStep ? styles.tourDotCurrent : ''}`} />
            ))}
          </div>
          {/* Controles manuales: prev, pause/play, next */}
          {!tourEnded && (
            <div className={styles.tourControls}>
              <button className={styles.tourControlBtn} onClick={tourGoPrev} title="Anterior (←)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button className={styles.tourControlBtn} onClick={toggleTourPause} title={tourPaused ? 'Reanudar (Espacio)' : 'Pausar (Espacio)'}>
                {tourPaused
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>
                }
              </button>
              <button className={styles.tourControlBtn} onClick={tourGoNext} title="Siguiente (→)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          )}
          {!tourEnded && (
            <button className={styles.tourSkip} onClick={stopTour}>
              Saltar tour ✕
            </button>
          )}
          {tourEnded && (
            <div className={styles.tourEndActions}>
              <button className={styles.tourEndBtn} onClick={restartTour}>
                ↻ Reiniciar tour
              </button>
              <button className={`${styles.tourEndBtn} ${styles.tourEndBtnExit}`} onClick={exitTourSmooth}>
                Salir del tour
              </button>
            </div>
          )}
        </div>
        )
      })()}

      </div>{/* cierre universeUI */}
    </div>
  )
}
