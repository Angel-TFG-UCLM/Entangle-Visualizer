/**
 * ENTANGLE Quantum Field — Visualización 3D Cuántica
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

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useDashboardStore } from '../../store/dashboardStore'
import { FiX, FiUsers, FiGitBranch, FiGrid, FiZap, FiUser, FiMaximize2, FiHelpCircle, FiChevronDown, FiEye, FiEyeOff, FiSearch, FiTarget, FiActivity, FiLayers, FiShield, FiCrosshair, FiLoader } from 'react-icons/fi'
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
  // Usar collab_centrality del backend (percentil 0-100) si está disponible,
  // sino calcular localmente desde el grafo
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
    console.log(`[Layout] Modo: ${useBackendMetrics ? 'BACKEND collab_centrality' : 'LOCAL orgScore'}`)
    console.log(`[Layout] Top 5 orgs:`, sortedByScore.slice(0, 5).map(o => `${o.id}=${orgScore[o.id]}`))
  }

  // ================================================================
  // FASE 3: Posicionar orgs — colaborativas al centro, aisladas fuera
  // ================================================================
  const repoCount = repoNodes.length
  const scaleFactor = repoCount > 200 ? Math.sqrt(repoCount / 200) : 1
  const positions = {}
  const rng = seededRandom(42)

  // Rangos de distancia al centro (ampliados para acomodar órbitas de repos)
  const CORE_RADIUS = 150 * scaleFactor     // orgs top → dentro de este radio
  const PERIPHERY_MIN = 500 * scaleFactor   // orgs aisladas → desde aquí
  const PERIPHERY_MAX = 900 * scaleFactor   // hasta aquí

  // Separar orgs en 3 zonas según el score
  const coreOrgs = []      // alta colaboración → centro
  const midOrgs = []       // colaboración moderada → zona media
  const isolatedOrgs = []  // sin colaboración → periferia

  if (useBackendMetrics) {
    // Backend: percentil 0-100 → umbrales fijos
    sortedByScore.forEach(org => {
      const s = orgScore[org.id]
      if (s >= 40) coreOrgs.push(org)
      else if (s > 0) midOrgs.push(org)
      else isolatedOrgs.push(org)
    })
  } else {
    // Local: umbrales relativos al máximo
    const maxScore = Math.max(...Object.values(orgScore), 1)
    sortedByScore.forEach(org => {
      const s = orgScore[org.id]
      if (s >= maxScore * 0.15) coreOrgs.push(org)
      else if (s > 0) midOrgs.push(org)
      else isolatedOrgs.push(org)
    })
  }

  console.log(`[Layout] Zonas: core=${coreOrgs.length}, mid=${midOrgs.length}, isolated=${isolatedOrgs.length}`)

  // Colocar la org más importante en el centro
  const orgPositions = []
  const MIN_SEP = 80 * scaleFactor // separación mínima entre orgs

  function placeOrg(org, rMin, rMax) {
    // La primera org en coreOrgs (mayor centralidad) → centro exacto
    if (coreOrgs.length > 0 && coreOrgs[0] === org && !positions[org.id]) {
      const pos = new THREE.Vector3(0, 0, 0)
      positions[org.id] = pos
      orgPositions.push(pos)
      return
    }

    // Intentar colocar cerca de orgs con las que colabora (atracción)
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

      // Separación mínima de orgs ya colocadas
      let minDist = Infinity
      for (const prev of orgPositions) {
        const d = candidate.distanceTo(prev)
        if (d < minDist) minDist = d
      }
      if (minDist < MIN_SEP * 0.5) continue // demasiado cerca

      // Puntuación: balance entre separación y atracción a vecinos
      let score = Math.min(minDist, MIN_SEP * 2) // bonificar separación hasta cierto punto

      if (attractCenter) {
        // Penalizar distancia al centroide de vecinos colaborativos
        const distToNeighbors = candidate.distanceTo(attractCenter)
        score -= distToNeighbors * 0.3
      }

      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }

    if (!best) {
      // Fallback: posición aleatoria en el rango
      const r = rMin + rng() * (rMax - rMin)
      const θ = rng() * Math.PI * 2
      best = new THREE.Vector3(r * Math.cos(θ), (rng() - 0.5) * r * 0.4, r * Math.sin(θ))
    }

    positions[org.id] = best
    orgPositions.push(best)
  }

  // Colocar: core → mid → isolated
  coreOrgs.forEach(org => placeOrg(org, 0, CORE_RADIUS))
  midOrgs.forEach(org => placeOrg(org, CORE_RADIUS * 0.5, PERIPHERY_MIN))
  isolatedOrgs.forEach(org => placeOrg(org, PERIPHERY_MIN, PERIPHERY_MAX))

  // ================================================================
  // FASE 4: Repos — órbita escalada por cantidad de repos
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

  // Repos huérfanos (sin org) — dispersados en zona media-exterior
  const orphanRepos = repoNodes.filter(r => !assignedRepos.has(r.id))
  orphanRepos.forEach((repo, i) => {
    const a = (i / Math.max(orphanRepos.length, 1)) * Math.PI * 2 + rng() * 0.5
    const r2 = PERIPHERY_MIN * 0.5 + rng() * PERIPHERY_MIN * 0.4
    const yOff = (rng() - 0.5) * PERIPHERY_MIN * 0.25
    positions[repo.id] = new THREE.Vector3(
      r2 * Math.cos(a) + (rng() - 0.5) * 30,
      yOff,
      r2 * Math.sin(a) + (rng() - 0.5) * 30
    )
  })

  // ================================================================
  // FASE 5: Users — bridge al centroide, non-bridge en órbita
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

  // Users sin repos — zona exterior
  userNodes.filter(u => !assignedUsers.has(u.id)).forEach((user, i) => {
    const a = rng() * Math.PI * 2
    const r2 = PERIPHERY_MIN * 0.5 + rng() * PERIPHERY_MIN * 0.3
    positions[user.id] = new THREE.Vector3(
      r2 * Math.cos(a) + (rng() - 0.5) * 50,
      (rng() - 0.5) * PERIPHERY_MIN * 0.25,
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
// RELATED IDS — entidades relacionadas con la seleccionada
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

function QuantumVacuum({ progress }) {
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

  // Fluctuaciones del vacío — partículas virtuales apareciendo/desapareciendo
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

  const fluctSizes = useMemo(() => {
    const arr = new Float32Array(fluctCount)
    for (let i = 0; i < fluctCount; i++) arr[i] = Math.random()
    return arr
  }, [])

  // Animación de fluctuaciones — parpadeo aleatorio + fade-in con progress
  useFrame(({ clock }) => {
    if (!fluctRef.current) return
    const t = clock.getElapsedTime()
    const p = easeOutCubic(progress)
    const sizes = fluctRef.current.geometry.attributes.size
    for (let i = 0; i < fluctCount; i++) {
      const phase = fluctSizes[i] * Math.PI * 2
      const life = Math.sin(t * (0.5 + fluctSizes[i] * 2) + phase)
      sizes.array[i] = Math.max(0, life) * 0.5 * p
    }
    sizes.needsUpdate = true

    // Lattice fade-in
    if (latticeRef.current) latticeRef.current.material.opacity = 0.025 * p
  })

  return (
    <>
      {/* Lattice cuántico */}
      <lineSegments ref={latticeRef} geometry={latticeGeo}>
        <lineBasicMaterial color="#00f7ff" transparent opacity={0} depthWrite={false} />
      </lineSegments>

      {/* Fluctuaciones del vacío */}
      <points ref={fluctRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" array={fluctPositions} itemSize={3} count={fluctCount} />
          <bufferAttribute attach="attributes-size" array={new Float32Array(fluctCount)} itemSize={1} count={fluctCount} />
        </bufferGeometry>
        <pointsMaterial
          size={0.3}
          color="#4488ff"
          transparent
          opacity={0.3}
          sizeAttenuation
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </>
  )
}

// ============================================================================
// PROCESADORES CUÁNTICOS (Orgs) — Toros de energía rotando
// ============================================================================

function QuantumProcessors({ orgNodes, positions, onHover, onClick, progress, highlightSet, lensData, lensRevealDelay = 100 }) {
  const groupRef = useRef()

  const torusGeo = useMemo(() => new THREE.TorusGeometry(2.8, 0.25, 12, 48), [])
  const torusGeo2 = useMemo(() => new THREE.TorusGeometry(4, 0.12, 8, 48), [])
  const coreGeo = useMemo(() => new THREE.SphereGeometry(0.9, 16, 16), [])
  const hitGeo = useMemo(() => new THREE.SphereGeometry(6, 8, 8), [])
  const hitMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), [])

  // Materiales individuales por org (necesarios para dimming selectivo)
  const orgMats = useMemo(() => orgNodes.map(() => ({
    t1: new THREE.MeshBasicMaterial({ color: new THREE.Color('#00f7ff').multiplyScalar(2), toneMapped: false, transparent: true, opacity: 0.7 }),
    t2: new THREE.MeshBasicMaterial({ color: new THREE.Color('#00f7ff').multiplyScalar(1.2), toneMapped: false, transparent: true, opacity: 0.25 }),
    core: new THREE.MeshBasicMaterial({ color: new THREE.Color('#00f7ff').multiplyScalar(3), toneMapped: false, transparent: true, opacity: 0.6 }),
  })), [orgNodes])

  const orgBaseColor = useMemo(() => new THREE.Color('#00f7ff'), [])
  const orgLensBlend = useRef(0)
  const lastOrgLens = useRef(null)
  const orgTmpColor = useMemo(() => new THREE.Color(), [])
  const orgTargetColor = useMemo(() => new THREE.Color(), [])
  const orgRevealTime = useRef(0)
  const ORG_BLEND_SPEED = 0.04

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()
    const n = orgNodes.length
    const hasSel = highlightSet !== null

    // Smooth lens blend for processors — delayed until canvas visible
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

    groupRef.current.children.forEach((group, i) => {
      const stagger = n > 1 ? i / (n - 1) : 0
      const localP = easeOutElastic(Math.min(Math.max((progress - stagger * 0.6) / 0.5, 0), 1))
      group.scale.setScalar(localP)

      const speed = 0.3 + i * 0.05
      if (group.children[0]) group.children[0].rotation.x = t * speed
      if (group.children[0]) group.children[0].rotation.y = t * speed * 0.7
      if (group.children[1]) group.children[1].rotation.x = t * speed * -0.5
      if (group.children[1]) group.children[1].rotation.z = t * speed * 0.3

      const m = orgMats[i]
      if (m) {
        const isHighlighted = hasSel && highlightSet.has(orgNodes[i]?.id)
        const dim = hasSel && !isHighlighted ? 0.02 : 1
        const boost = hasSel && isHighlighted ? 1.6 : 1
        // Lens-aware coloring with smooth blend for processors
        const ld = lensData?.[orgNodes[i]?.id]
        if (ld && blend > 0.01) {
          orgTargetColor.setRGB(ld.r, ld.g, ld.b)
          orgTmpColor.copy(orgBaseColor).lerp(orgTargetColor, blend)
          m.t1.color.copy(orgTmpColor).multiplyScalar(2 * boost)
          m.t2.color.copy(orgTmpColor).multiplyScalar(1.2 * boost)
          m.core.color.copy(orgTmpColor).multiplyScalar(3 * boost)
        } else {
          m.t1.color.copy(orgBaseColor).multiplyScalar(2 * boost)
          m.t2.color.copy(orgBaseColor).multiplyScalar(1.2 * boost)
          m.core.color.copy(orgBaseColor).multiplyScalar(3 * boost)
        }
        m.t1.opacity = 0.7 * dim
        m.t2.opacity = 0.25 * dim
        m.core.opacity = 0.6 * dim

        // Escalar procesadores seleccionados ligeramente
        if (hasSel && isHighlighted) {
          group.scale.setScalar(localP * 1.25)
        }
      }
    })
  })

  return (
    <group ref={groupRef}>
      {orgNodes.map((org, idx) => {
        const pos = positions[org.id]; if (!pos) return null
        const m = orgMats[idx]
        return (
          <group key={org.id} position={pos}>
            <mesh geometry={torusGeo} material={m?.t1} />
            <mesh geometry={torusGeo2} material={m?.t2} />
            <mesh geometry={coreGeo} material={m?.core} />
            {/* Hitbox invisible — área de click ampliada */}
            <mesh geometry={hitGeo} material={hitMat}
              onPointerEnter={(e) => { e.stopPropagation(); onHover(org, pos) }}
              onPointerLeave={(e) => { e.stopPropagation(); onHover(null, null) }}
              onClick={(e) => { e.stopPropagation(); onClick(org, pos) }}
            />
          </group>
        )
      })}
    </group>
  )
}

// ============================================================================
// NUBES DE PROBABILIDAD (partículas alrededor de cada qubit/repo)
// ============================================================================

function ProbabilityClouds({ repoNodes, positions, progress, dimmed }) {
  const ref = useRef()
  const PER_QUBIT = 10

  const { posArr, basePositions } = useMemo(() => {
    const total = repoNodes.length * PER_QUBIT
    const arr = new Float32Array(total * 3)
    const bases = [] // para animación orbital
    let idx = 0
    repoNodes.forEach(repo => {
      const c = positions[repo.id]; if (!c) return
      for (let i = 0; i < PER_QUBIT; i++) {
        // Distribución gaussiana esférica
        const r = 1.2 + Math.random() * 1.8
        const θ = Math.random() * Math.PI * 2
        const φ = Math.acos(2 * Math.random() - 1)
        const px = c.x + r * Math.sin(φ) * Math.cos(θ)
        const py = c.y + r * Math.sin(φ) * Math.sin(θ)
        const pz = c.z + r * Math.cos(φ)
        arr[idx] = px; arr[idx + 1] = py; arr[idx + 2] = pz
        bases.push({ cx: c.x, cy: c.y, cz: c.z, r, θ, φ })
        idx += 3
      }
    })
    return { posArr: arr, basePositions: bases }
  }, [repoNodes, positions])

  // Animación orbital + materialización progresiva
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime() * 0.4
    const p = easeOutCubic(progress)
    const pos = ref.current.geometry.attributes.position
    basePositions.forEach((bp, i) => {
      const θ = bp.θ + t * (0.3 + (i % 5) * 0.1)
      const φ = bp.φ + t * 0.15
      // Las partículas parten del centro del qubit y se expanden
      const r = bp.r * p
      pos.array[i * 3]     = bp.cx + r * Math.sin(φ) * Math.cos(θ)
      pos.array[i * 3 + 1] = bp.cy + r * Math.sin(φ) * Math.sin(θ)
      pos.array[i * 3 + 2] = bp.cz + r * Math.cos(φ)
    })
    pos.needsUpdate = true
  })

  if (repoNodes.length === 0) return null

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={posArr} itemSize={3} count={repoNodes.length * PER_QUBIT} />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color={new THREE.Color('#bd00ff').multiplyScalar(2)}
        toneMapped={false}
        transparent
        opacity={dimmed ? 0.02 : 0.5}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ============================================================================
// QUBITS (Repos) — Esferas con ejes de Bloch
// ============================================================================

function Qubits({ repoNodes, positions, onHover, onClick, progress, highlightSet, lensData, lensRevealDelay = 100 }) {
  const ref = useRef()
  const hitRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
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
  const qubitLensBlend = useRef(0)
  const lastQubitLens = useRef(null)
  const qubitRevealTime = useRef(0)
  const QUBIT_BLEND_SPEED = 0.04

  useFrame(({ clock }) => {
    if (!ref.current || repoNodes.length === 0) return
    const t = clock.getElapsedTime()
    const n = repoNodes.length
    const hasSel = highlightSet !== null

    // Smooth lens blend for qubits — delayed until canvas visible
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

    repoNodes.forEach((repo, i) => {
      const pos = positions[repo.id]; if (!pos) return
      const baseScale = Math.min(Math.max((repo.stars || 0) / 800, 0.7), 1.5)
      const stagger = n > 1 ? i / (n - 1) : 0
      const localP = easeOutElastic(Math.min(Math.max((progress - stagger * 0.5) / 0.6, 0), 1))
      const isHighlighted = hasSel && highlightSet.has(repo.id)
      // Boost de escala para qubits seleccionados
      const selScale = hasSel && isHighlighted ? 1.4 : 1.0
      dummy.position.copy(pos)
      // Heisenberg uncertainty — micro-vibración cuántica
      dummy.position.x += Math.sin(t * 1.7 + i * 3.14) * 0.04
      dummy.position.y += Math.cos(t * 2.3 + i * 2.71) * 0.04
      dummy.position.z += Math.sin(t * 1.9 + i * 1.62) * 0.04
      dummy.scale.setScalar(baseScale * localP * selScale)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
      if (hitRef.current) {
        dummy.scale.setScalar(localP > 0.1 ? 1 : 0.001)
        dummy.updateMatrix()
        hitRef.current.setMatrixAt(i, dummy.matrix)
      }
      // Lens-aware coloring with smooth blend
      const ld = lensData?.[repo.id]
      if (ld && blend > 0.01) {
        lensCol.setRGB(ld.r, ld.g, ld.b)
        // Lerp from base/selection color towards lens color
        const fromCol = hasSel ? (isHighlighted ? boostCol : dimCol) : brightCol
        lensCol.lerp(fromCol, 1.0 - blend)
        ref.current.setColorAt(i, lensCol)
      } else {
        ref.current.setColorAt(i, hasSel ? (isHighlighted ? boostCol : dimCol) : brightCol)
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
          if (idx !== undefined && repoNodes[idx]) onHover(repoNodes[idx], positions[repoNodes[idx].id])
        }}
        onPointerLeave={(e) => { e.stopPropagation(); onHover(null, null) }}
        onClick={(e) => {
          e.stopPropagation()
          const idx = e.instanceId
          if (idx !== undefined && repoNodes[idx]) onClick(repoNodes[idx], positions[repoNodes[idx].id])
        }}
      />
    </>
  )
}

// ============================================================================
// EJES DE BLOCH — líneas |0⟩↔|1⟩ por cada qubit
// ============================================================================

function BlochAxes({ repoNodes, positions }) {
  const geometry = useMemo(() => {
    const pts = []
    repoNodes.forEach(repo => {
      const pos = positions[repo.id]; if (!pos) return
      const scale = Math.min(Math.max((repo.stars || 0) / 800, 0.7), 1.5)
      const h = 1.8 * scale
      // Eje vertical |0⟩ → |1⟩
      pts.push(pos.x, pos.y - h, pos.z, pos.x, pos.y + h, pos.z)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [repoNodes, positions])

  if (repoNodes.length === 0) return null

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={new THREE.Color('#bd00ff').multiplyScalar(0.8)}
        transparent
        opacity={0.15}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  )
}

// ============================================================================
// Textura de glow para partículas (Points) — genera halo circular soft
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
  uniform float uTime;
  uniform float uProgress;
  uniform float uBaseSize;
  uniform float uBridgeSize;
  uniform float uLensActive;
  varying float vBrightness;
  varying float vIsBridge;
  varying float vGlow;
  varying vec3 vLensColor;
  varying float vLensActive;
  varying float vDensity;

  void main() {
    vBrightness = aBrightness;
    vIsBridge = aIsBridge;
    vLensColor = aLensColor;
    vLensActive = uLensActive;
    vDensity = aDensity;
    float p = smoothstep(0.0, 1.0, uProgress);

    // === Heisenberg jitter — incertidumbre cuántica ===
    float jx = sin(uTime * 3.14 + aSeed * 17.3) * 0.04;
    float jy = sin(uTime * 2.71 + aSeed * 31.7) * 0.04;
    float jz = sin(uTime * 1.62 + aSeed * 47.1) * 0.04;
    vec3 pos = position + vec3(jx, jy, jz);

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

    // === Bridge: pulso suave + brillo aleatorio por usuario ===
    float personalFlash = pow(max(cos(uTime * 0.8 + aSeed * 6.28), 0.0), 20.0);
    float bridgePulse = p >= 0.99
      ? (1.0 + sin(uTime * 1.8 + aSeed) * 0.15 + personalFlash * 0.25)
      : p;
    float normalPulse = p * (1.0 + sin(uTime * 1.5 + aSeed) * 0.05);

    // === Lens mode: centrality enlarges important nodes ===
    float lensScale = mix(1.0, 0.6 + aBrightness * 1.4, uLensActive);

    float size = aIsBridge > 0.5
      ? uBridgeSize * bridgePulse * lensScale
      : uBaseSize * normalPulse * lensScale;

    // Reducir tamaño en repos densos (bridges preservan tamaño mínimo)
    float densitySize = aIsBridge > 0.5 ? max(aDensity, 0.5) : aDensity;
    size *= (0.4 + densitySize * 0.6);

    // === Glow intensity para fragment shader ===
    vGlow = aIsBridge > 0.5 ? (1.0 + personalFlash * 0.6) : 1.0;

    gl_PointSize = size * (350.0 / -mvPos.z);
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

  void main() {
    vec4 texel = texture2D(uMap, gl_PointCoord);
    vec3 baseCol = vIsBridge > 0.5 ? uColorBridge : uColorNormal;
    // Lens mode: blend towards per-particle analytical color
    vec3 col = mix(baseCol, vLensColor, vLensActive);
    // Halo radiante: centro más brillante, borde con color
    float d = length(gl_PointCoord - vec2(0.5));
    float core = smoothstep(0.4, 0.0, d);
    vec3 finalCol = col * vBrightness * vGlow + vec3(1.0) * core * 0.3 * vGlow;
    // Reducir opacidad en repos densos (bridges mantienen visibilidad)
    float densityAlpha = mix(vDensity, 1.0, vIsBridge * 0.7);
    float alpha = texel.a * vBrightness * 0.95 * densityAlpha;
    gl_FragColor = vec4(finalCol, alpha);
  }
`

// ============================================================================
// PARTÍCULAS CUÁNTICAS (Users) — 100% GPU via GLSL ShaderMaterial
// ============================================================================

function QuantumParticles({ userNodes, positions, onHover, onClick, progress, highlightSet, lensData, lensRevealDelay = 100, userDensity }) {
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
    g.setAttribute('aLensColor', new THREE.BufferAttribute(lensColors, 3))
    g.setAttribute('aDensity', new THREE.BufferAttribute(density, 1))
    return g
  }, [allUsers, positions, userDensity])

  // ShaderMaterial — toda animación en GPU
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
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), [glowMap])

  // Solo actualizar 2 uniforms por frame — 0% CPU para partículas
  const lastHighlight = useRef(undefined)
  const lastLens = useRef(null)
  const lensBlendCurrent = useRef(0)
  const lensRevealTime = useRef(0) // time when color animation should start
  const LENS_BLEND_SPEED = 0.04
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.getElapsedTime()
    mat.uniforms.uProgress.value = progress

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
  })

  // Raycasting via Points nativo
  const handlePointer = useCallback((e) => {
    e.stopPropagation()
    const idx = e.index
    if (idx !== undefined && allUsers[idx]) onHover(allUsers[idx], positions[allUsers[idx].id])
  }, [allUsers, positions, onHover])

  const handleClick = useCallback((e) => {
    e.stopPropagation()
    const idx = e.index
    if (idx !== undefined && allUsers[idx]) onClick(allUsers[idx], positions[allUsers[idx].id])
  }, [allUsers, positions, onClick])

  const handleLeave = useCallback(() => onHover(null, null), [onHover])

  if (allUsers.length === 0) return null

  return (
    <points ref={ref} geometry={geo} material={mat}
      onPointerMove={handlePointer} onPointerLeave={handleLeave} onClick={handleClick} />
  )
}

// ============================================================================
// QUANTUM BONDS — espiral animada 100% GPU via GLSL
// ============================================================================

const BOND_VERTEX = /* glsl */`
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aSeed;
  attribute float aParticleIdx;
  uniform float uTime;
  uniform float uProgress;
  varying float vPhase;
  varying float vParticle;

  void main() {
    float p = smoothstep(0.0, 1.0, uProgress);
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
    gl_Position = projectionMatrix * mvPos;
  }
`

const BOND_FRAGMENT = /* glsl */`
  uniform float uOpacity;
  varying float vPhase;
  varying float vParticle;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float glow = smoothstep(0.5, 0.0, d);
    // Color dual: verde-cyan, variando por partícula y fase
    vec3 colA = vec3(0.0, 1.0, 0.62);  // verde cuántico
    vec3 colB = vec3(0.0, 0.97, 1.0);  // cyan
    vec3 col = mix(colA, colB, sin(vPhase * 6.28 + vParticle * 3.14) * 0.5 + 0.5);
    float alpha = glow * uOpacity * (0.5 + 0.2 * sin(vPhase * 3.14159));
    gl_FragColor = vec4(col * 1.2, alpha);
  }
`

function QuantumBonds({ repoUsers, positions, progress, dimmed }) {
  const ref = useRef()

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
        list.push({ start: upos, end: rpos, seed: u * 7.13 })
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
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    g.setAttribute('aParticleIdx', new THREE.BufferAttribute(particleIdx, 1))

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

  // Solo 3 uniforms por frame — CPU ≈ 0%
  useFrame(({ clock }) => {
    if (!mat) return
    mat.uniforms.uTime.value = clock.getElapsedTime()
    mat.uniforms.uProgress.value = progress
    mat.uniforms.uOpacity.value = (dimmed ? 0.02 : 0.35) * easeOutCubic(progress)
  })

  if (!geo || bonds.length === 0) return null

  return <points ref={ref} geometry={geo} material={mat} />
}

// ============================================================================
// CANALES DE ENTRELAZAMIENTO — ondas sinusoidales entre entidades
// ============================================================================

function EntanglementChannels({ connections, progress, dimmed }) {
  const ref = useRef()

  // Crear puntos a lo largo de cada conexión con forma sinusoidal
  const POINTS_PER_CONN = 20
  const { posArr, count } = useMemo(() => {
    const total = connections.length * POINTS_PER_CONN
    const arr = new Float32Array(total * 3)
    let idx = 0

    connections.forEach(conn => {
      const start = conn.start
      const end = conn.end

      // Vector dirección y perpendicular para la onda
      const dir = new THREE.Vector3().subVectors(end, start)
      const len = dir.length()
      const norm = dir.clone().normalize()
      // Vector perpendicular para la onda sinusoidal
      const up = new THREE.Vector3(0, 1, 0)
      const perp = new THREE.Vector3().crossVectors(norm, up).normalize()
      if (perp.length() < 0.01) perp.set(1, 0, 0) // fallback

      for (let i = 0; i < POINTS_PER_CONN; i++) {
        const t = i / (POINTS_PER_CONN - 1)
        const wave = Math.sin(t * Math.PI * 3) * Math.min(len * 0.04, 2.0)
        arr[idx++] = start.x + dir.x * t + perp.x * wave
        arr[idx++] = start.y + dir.y * t + perp.y * wave
        arr[idx++] = start.z + dir.z * t + perp.z * wave
      }
    })

    return { posArr: arr, count: total }
  }, [connections])

  // Animación — la onda se desplaza + draw-on con progress
  useFrame(({ clock }) => {
    if (!ref.current || connections.length === 0) return
    const t = clock.getElapsedTime()
    const p = easeOutCubic(progress)
    const pos = ref.current.geometry.attributes.position
    const nConn = connections.length

    let idx = 0
    connections.forEach((conn, ci) => {
      const start = conn.start
      const end = conn.end
      const dir = new THREE.Vector3().subVectors(end, start)
      const len = dir.length()
      const norm = dir.clone().normalize()
      const up = new THREE.Vector3(0, 1, 0)
      const perp = new THREE.Vector3().crossVectors(norm, up).normalize()
      if (perp.length() < 0.01) perp.set(1, 0, 0)

      // Cada conexión se dibuja con su propio delay
      const stagger = nConn > 1 ? ci / (nConn - 1) : 0
      const connP = Math.min(Math.max((p - stagger * 0.5) / 0.6, 0), 1)

      for (let i = 0; i < POINTS_PER_CONN; i++) {
        const prog = i / (POINTS_PER_CONN - 1)
        // Solo dibujar puntos hasta donde progress permite (draw-on)
        const drawT = Math.min(prog / Math.max(connP, 0.001), 1)
        const actualProg = prog * connP
        const wave = Math.sin(actualProg * Math.PI * 3 + t * 3) * Math.min(len * 0.04, 2.0) * connP
        if (prog <= connP) {
          pos.array[idx++] = start.x + dir.x * actualProg + perp.x * wave
          pos.array[idx++] = start.y + dir.y * actualProg + perp.y * wave
          pos.array[idx++] = start.z + dir.z * actualProg + perp.z * wave
        } else {
          // Puntos no dibujados todavía — colapsar en el extremo visible
          const lastProg = connP
          pos.array[idx++] = start.x + dir.x * lastProg
          pos.array[idx++] = start.y + dir.y * lastProg
          pos.array[idx++] = start.z + dir.z * lastProg
        }
      }
    })
    pos.needsUpdate = true
  })

  if (connections.length === 0) return null

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={posArr} itemSize={3} count={count} />
      </bufferGeometry>
      <pointsMaterial
        size={0.18}
        color={new THREE.Color('#ffbd00').multiplyScalar(1.5)}
        toneMapped={false}
        transparent
        opacity={dimmed ? 0.02 : 0.55}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ============================================================================
// ENERGY RINGS — anillos de energía que se expanden desde cada procesador
// ============================================================================

function EnergyRings({ orgNodes, positions, progress, highlightSet }) {
  const ringsRef = useRef([])
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.4, 0.6, 48), [])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#00f7ff').multiplyScalar(1.5),
    toneMapped: false,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  }), [])

  // Ondas expandiéndose — aparecen con los procesadores
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const p = easeOutCubic(progress)
    const hasSel = highlightSet !== null
    ringsRef.current.forEach((ring, i) => {
      if (!ring) return
      const phase = (t * 0.5 + i * 0.8) % 3
      const scale = (1 + phase * 6) * p
      const dim = hasSel && !highlightSet.has(orgNodes[i]?.id) ? 0.02 : 1
      const opacity = 0.3 * Math.max(0, 1 - phase / 3) * p * dim
      ring.scale.setScalar(scale)
      ring.material.opacity = opacity
    })
  })

  return (
    <>
      {orgNodes.map((org, i) => {
        const pos = positions[org.id]; if (!pos) return null
        return (
          <mesh
            key={org.id}
            ref={el => ringsRef.current[i] = el}
            position={pos}
            rotation={[Math.PI / 2, 0, 0]}
            geometry={ringGeo}
            material={ringMat.clone()} // Clonar para opacidad individual
          />
        )
      })}
    </>
  )
}

// ============================================================================
// INTERFERENCE PATTERN — patrón de interferencia tipo doble rendija
// ============================================================================

function InterferenceField({ progress }) {
  const ref = useRef()
  const matRef = useRef()
  const count = 600

  const { posArr, phases } = useMemo(() => {
    const arr = new Float32Array(count * 3)
    const ph = new Float32Array(count)
    // Distribuir en un plano vertical detrás de la escena como patrón de doble rendija
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 500
      const y = (Math.random() - 0.5) * 300
      arr[i * 3] = x
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = -200
      ph[i] = Math.random() * Math.PI * 2
    }
    return { posArr: arr, phases: ph }
  }, [])

  // Patrón de interferencia animado + fade-in
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    const p = easeOutCubic(progress)
    const pos = ref.current.geometry.attributes.position
    for (let i = 0; i < count; i++) {
      const x = pos.array[i * 3]
      const intensity = Math.cos(x * 0.15 + t * 0.5) ** 2
      pos.array[i * 3 + 1] += Math.sin(t + phases[i]) * 0.01
    }
    pos.needsUpdate = true
    if (matRef.current) matRef.current.opacity = 0.12 * p
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={posArr} itemSize={3} count={count} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.6}
        color={new THREE.Color('#2244ff').multiplyScalar(0.8)}
        toneMapped={false}
        transparent
        opacity={0.12}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ============================================================================
// QUANTUM GENESIS — explosión inicial tipo Big Bang
// ============================================================================

function QuantumGenesis({ progress }) {
  const flashRef = useRef()
  const waveRef = useRef()
  const done = progress >= 1

  useFrame(() => {
    const p = progress
    if (flashRef.current) {
      if (done) {
        flashRef.current.visible = false
      } else {
        flashRef.current.visible = true
        const s = easeOutCubic(Math.min(p * 3, 1)) * 18
        flashRef.current.scale.setScalar(Math.max(s, 0.001))
        flashRef.current.material.opacity = Math.max(0, 1 - p * 1.5) * 0.85
      }
    }
    if (waveRef.current) {
      if (done) {
        waveRef.current.visible = false
      } else {
        waveRef.current.visible = true
        const s = easeOutCubic(p) * 450
        waveRef.current.scale.setScalar(Math.max(s, 0.001))
        waveRef.current.material.opacity = Math.max(0, 0.2 * (1 - p))
      }
    }
  })

  return (
    <group>
      <mesh ref={flashRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={new THREE.Color('#88ccff').multiplyScalar(5)} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <mesh ref={waveRef}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial color="#00f7ff" wireframe transparent opacity={0.2} toneMapped={false} />
      </mesh>
    </group>
  )
}

// ============================================================================
// TUNNELING PULSES — fotones viajando por canales de entrelazamiento
// ============================================================================

function TunnelingPulses({ connections }) {
  const ref = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const PULSE_COUNT = Math.min(connections.length, 25)

  const pulseData = useMemo(() =>
    Array.from({ length: PULSE_COUNT }, (_, i) => ({
      connIdx: i % connections.length,
      t: Math.random(),
      speed: 0.15 + Math.random() * 0.12,
    }))
  , [connections.length, PULSE_COUNT])

  const geo = useMemo(() => new THREE.SphereGeometry(0.18, 6, 6), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffbd00').multiplyScalar(4),
    toneMapped: false, transparent: true, opacity: 0.9,
  }), [])

  useFrame((_, delta) => {
    if (!ref.current || connections.length === 0) return
    pulseData.forEach((pulse, i) => {
      pulse.t += pulse.speed * delta
      if (pulse.t >= 1) {
        pulse.t -= 1
        pulse.connIdx = (pulse.connIdx + 1 + Math.floor(Math.random() * 3)) % connections.length
      }
      const conn = connections[pulse.connIdx]
      if (!conn) return
      const { start, end } = conn
      const dir = new THREE.Vector3().subVectors(end, start)
      const len = dir.length()
      const norm = dir.clone().normalize()
      const up = new THREE.Vector3(0, 1, 0)
      const perp = new THREE.Vector3().crossVectors(norm, up).normalize()
      if (perp.length() < 0.01) perp.set(1, 0, 0)
      const t = pulse.t
      const wave = Math.sin(t * Math.PI * 3) * Math.min(len * 0.04, 2.0)
      dummy.position.set(
        start.x + dir.x * t + perp.x * wave,
        start.y + dir.y * t + perp.y * wave,
        start.z + dir.z * t + perp.z * wave,
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
// DECOHERENCE SHOCKWAVES — ondas de decoherencia desde procesadores
// ============================================================================

function DecoherenceWaves({ orgNodes, positions }) {
  const MAX_WAVES = 3
  const wavesRef = useRef([])
  const waveState = useRef(
    Array.from({ length: MAX_WAVES }, () => ({ active: false, pos: new THREE.Vector3(), age: 0 }))
  )
  const nextWave = useRef(4 + Math.random() * 4)

  const ringGeo = useMemo(() => new THREE.RingGeometry(0.9, 1, 64), [])
  const waveMats = useMemo(() =>
    Array.from({ length: MAX_WAVES }, () => new THREE.MeshBasicMaterial({
      color: '#00f7ff', transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false,
    }))
  , [])

  useFrame(({ clock }, delta) => {
    if (orgNodes.length === 0) return
    const t = clock.getElapsedTime()
    nextWave.current -= delta
    if (nextWave.current <= 0) {
      nextWave.current = 8 + Math.random() * 6
      const slot = waveState.current.find(w => !w.active)
      if (slot) {
        const orgIdx = Math.floor(Math.random() * orgNodes.length)
        const pos = positions[orgNodes[orgIdx].id]
        if (pos) { slot.active = true; slot.pos.copy(pos); slot.age = 0 }
      }
    }
    waveState.current.forEach((wave, i) => {
      const mesh = wavesRef.current[i]
      if (!mesh) return
      if (!wave.active) { mesh.scale.setScalar(0.001); return }
      wave.age += delta
      const duration = 3.5
      if (wave.age >= duration) { wave.active = false; mesh.scale.setScalar(0.001); return }
      const p = wave.age / duration
      mesh.position.copy(wave.pos)
      mesh.scale.setScalar(easeOutCubic(p) * 90)
      waveMats[i].opacity = 0.3 * Math.pow(1 - p, 2)
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
// HAWKING RADIATION — micropartículas escapando de procesadores
// ============================================================================

function HawkingRadiation({ orgNodes, positions }) {
  const ref = useRef()
  const matRef = useRef()
  const PER_ORG = 12

  const { posArr, particleData, total } = useMemo(() => {
    const data = []
    orgNodes.forEach(org => {
      const c = positions[org.id]; if (!c) return
      for (let i = 0; i < PER_ORG; i++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        data.push({
          cx: c.x, cy: c.y, cz: c.z, theta, phi,
          speed: 0.3 + Math.random() * 0.5,
          offset: Math.random() * 12,
          maxR: 14 + Math.random() * 10,
        })
      }
    })
    const arr = new Float32Array(data.length * 3)
    data.forEach((p, i) => { arr[i * 3] = p.cx; arr[i * 3 + 1] = p.cy; arr[i * 3 + 2] = p.cz })
    return { posArr: arr, particleData: data, total: data.length }
  }, [orgNodes, positions])

  useFrame(({ clock }) => {
    if (!ref.current || total === 0) return
    const t = clock.getElapsedTime()
    const pos = ref.current.geometry.attributes.position
    particleData.forEach((p, i) => {
      const r = ((t * p.speed + p.offset) % p.maxR)
      pos.array[i * 3]     = p.cx + r * Math.sin(p.phi) * Math.cos(p.theta)
      pos.array[i * 3 + 1] = p.cy + r * Math.cos(p.phi)
      pos.array[i * 3 + 2] = p.cz + r * Math.sin(p.phi) * Math.sin(p.theta)
    })
    pos.needsUpdate = true
    if (matRef.current) matRef.current.opacity = 0.3
  })

  if (total === 0) return null

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={posArr} itemSize={3} count={total} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.08}
        color={new THREE.Color('#00f7ff').multiplyScalar(1.2)}
        toneMapped={false}
        transparent
        opacity={0.3}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ============================================================================
// CAMERA RIG
// ============================================================================

function CameraRig({ focusTarget, resetTrigger, selectedEntity }) {
  const controlsRef = useRef()
  const { camera, gl } = useThree()
  const target = useRef(new THREE.Vector3(0, 0, 0))
  const goal = useRef(new THREE.Vector3(0, 80, 260))
  const flying = useRef(false)

  useEffect(() => {
    if (focusTarget) {
      target.current.copy(focusTarget)
      let offset
      if (selectedEntity?.type === 'user') offset = new THREE.Vector3(4, 2.5, 4)
      else if (selectedEntity?.type === 'repo') offset = new THREE.Vector3(10, 6, 10)
      else offset = new THREE.Vector3(18, 10, 18)
      goal.current.copy(focusTarget).add(offset)
      flying.current = true
    }
  }, [focusTarget, selectedEntity])

  useEffect(() => {
    target.current.set(0, 0, 0)
    goal.current.set(0, 80, 260)
    flying.current = true
  }, [resetTrigger])

  // ── Cancelar fly-to cuando el usuario arrastra (rotación / pan) ──
  useEffect(() => {
    const canvas = gl.domElement
    const cancelFly = () => { flying.current = false }
    canvas.addEventListener('pointerdown', cancelFly)
    return () => canvas.removeEventListener('pointerdown', cancelFly)
  }, [gl])

  // ── Zoom libre: cámara + target viajan JUNTOS por el universo ──
  useEffect(() => {
    const canvas = gl.domElement
    const mouse = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()

    const handleWheel = (e) => {
      if (!controlsRef.current) return
      e.preventDefault()

      // Cancelar cualquier fly-to activo
      flying.current = false

      // Coordenadas normalizadas del ratón
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const currentTarget = controlsRef.current.target
      const dist = camera.position.distanceTo(currentTarget)

      const zoomIn = e.deltaY < 0

      // Velocidad lineal proporcional a distancia cámara→target
      const speed = Math.max(dist * 0.12, 3)
      const delta = zoomIn ? speed : -speed

      // Dirección del rayo bajo el cursor
      const direction = raycaster.ray.direction.clone()

      // ★ AMBOS, cámara Y target, se mueven en la misma dirección
      //   → la "esfera orbital" de OrbitControls viaja con la cámara
      //   → no hay límite artificial de movimiento
      camera.position.addScaledVector(direction, delta)
      currentTarget.addScaledVector(direction, delta)

      controlsRef.current.update()
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [camera, gl])

  useFrame(() => {
    if (!flying.current || !controlsRef.current) return
    controlsRef.current.target.lerp(target.current, 0.045)
    camera.position.lerp(goal.current, 0.045)
    controlsRef.current.update()
    if (camera.position.distanceTo(goal.current) < 0.5) flying.current = false
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      enableZoom={false}
      enablePan
      panSpeed={1.2}
      rotateSpeed={0.6}
      minDistance={0.5}
      maxDistance={6000}
    />
  )
}

// ============================================================================
// LABEL FLOTANTE — estilo cuántico
// ============================================================================

function FloatingLabel({ entity, position }) {
  if (!entity || !position) return null
  const name = entity.name || entity.login || entity.full_name || entity.id
  const typeMap = { org: 'Procesador Cuántico', repo: 'Qubit', user: 'Partícula' }
  const colorMap = { org: '#00f7ff', repo: '#bd00ff', user: '#00ff9f' }

  return (
    <Html position={position} center style={{ pointerEvents: 'none' }}>
      <div className={styles.label3d}>
        <span className={styles.label3dType} style={{ color: colorMap[entity.type] }}>
          {typeMap[entity.type] || ''}
        </span>
        <span className={styles.label3dName}>{name}</span>
        {entity.stars > 0 && <span className={styles.label3dMeta}>⭐ {entity.stars}</span>}
        {entity.isBridge && (
          <span className={styles.label3dBridge}>⚛ Entrelazada · {entity.repos_count} qubits</span>
        )}
      </div>
    </Html>
  )
}

// ============================================================================
// FOCUS HIGHLIGHT — anillos de selección rotando
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
// BUILD ANIMATION — progreso continuo por fase con easing
// ============================================================================

// Ease-out cubic para transiciones suaves
function easeOutCubic(t) { return 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3) }
function easeOutElastic(t) {
  const c4 = (2 * Math.PI) / 3
  if (t <= 0) return 0
  if (t >= 1) return 1
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

// Fase timings: [inicio, duración] en segundos
const PHASE_TIMINGS = {
  genesis:      [0.0,  2.0],  // flash + onda expansiva
  vacuum:       [0.3,  1.5],  // lattice + fluctuaciones
  processors:   [1.5,  1.8],  // orgs aparecen escalonadas
  qubits:       [2.8,  2.0],  // repos materializan
  particles:    [4.2,  1.5],  // users orbitan
  entanglement: [5.5,  1.8],  // conexiones se dibujan
}

function BuildDirector({ onProgress, onReady, startAnimation }) {
  const startTime = useRef(null)
  const readyFired = useRef(false)

  useFrame(({ clock }) => {
    // No arrancar animaciones hasta que se indique
    if (!startAnimation) {
      startTime.current = null
      readyFired.current = false
      onProgress({ genesis: 0, vacuum: 0, processors: 0, qubits: 0, particles: 0, entanglement: 0 })
      return
    }

    if (startTime.current === null) startTime.current = clock.getElapsedTime()
    const elapsed = clock.getElapsedTime() - startTime.current

    const progress = {}
    for (const [key, [start, dur]] of Object.entries(PHASE_TIMINGS)) {
      progress[key] = Math.min(Math.max((elapsed - start) / dur, 0), 1)
    }
    onProgress(progress)

    // Señalizar que la escena tiene contenido visible (para futuros usos)
    if (!readyFired.current && progress.processors > 0.3) {
      readyFired.current = true
      onReady?.()
    }
  })

  return null
}

// ============================================================================
// LOD CONTROLLER — ajusta detalle por distancia de cámara
// ============================================================================
// lod: { level: 'far'|'mid'|'near', dist: number }
// far  (>400u): solo orgs + repos (clusters)
// mid  (120-400u): + bridge users + bonds
// near (<120u): todo — users individuales + bonds + effects

function useLOD() {
  const [lod, setLod] = useState({ level: 'near', dist: 260 })
  const { camera } = useThree()

  useFrame(() => {
    const d = camera.position.length()
    let newLevel
    if (d > 400) newLevel = 'far'
    else if (d > 120) newLevel = 'mid'
    else newLevel = 'near'
    if (newLevel !== lod.level) setLod({ level: newLevel, dist: d })
  })

  return lod
}

// ============================================================================
// ESCENA COMPLETA
// ============================================================================

function QuantumScene({ universeData, onSelect, hovered, setHovered, focusTarget, resetTrigger, selectedEntity, lensData, lensRevealDelay, searchHighlightSet, onSceneReady, startAnimation }) {
  const [bp, setBp] = useState({ genesis: 0, vacuum: 0, processors: 0, qubits: 0, particles: 0, entanglement: 0 })
  const lod = useLOD()

  // Set de IDs relacionados para dimming selectivo
  // Prioridad: selectedEntity > searchHighlightSet
  const highlightSet = useMemo(() => {
    const entitySet = computeRelatedIds(selectedEntity, universeData)
    if (entitySet) return entitySet
    return searchHighlightSet || null
  }, [selectedEntity, universeData, searchHighlightSet])
  const dimmed = selectedEntity !== null || searchHighlightSet !== null

  const handleHover = useCallback((entity, pos) => {
    setHovered(entity ? { entity, pos } : null)
    document.body.style.cursor = entity ? 'pointer' : 'auto'
  }, [setHovered])

  // Conexiones largas (owns + contributed_to cross-org) para canales y pulsos
  // Las contributed_to cortas (user→repo orbital) se muestran con OrbitalLinks
  const longConnections = useMemo(
    () => (universeData?.connections || []).filter(c => c.type !== 'contributed_to'),
    [universeData?.connections]
  )

  if (!universeData) return null

  const { orgNodes, repoNodes, userNodes, repoUsers, positions, connections, userDensity } = universeData

  const showUsers = true
  const showEffects = true

  return (
    <>
      {/* Luz ambiental mínima */}
      <ambientLight intensity={0.05} />

      {/* Cámara */}
      <CameraRig focusTarget={focusTarget} resetTrigger={resetTrigger} selectedEntity={selectedEntity} />

      {/* Director de animación con progreso continuo */}
      <BuildDirector onProgress={setBp} onReady={onSceneReady} startAnimation={startAnimation} />

      {/* Génesis cuántica — Big Bang inicial */}
      <QuantumGenesis progress={bp.genesis} />

      {/* Vacío cuántico — fade-in del lattice + fluctuaciones */}
      <QuantumVacuum progress={bp.vacuum} />
      {showEffects && <InterferenceField progress={bp.vacuum} />}

      {/* Procesadores cuánticos — scale-in elástico escalonado */}
      {bp.processors > 0 && (
        <QuantumProcessors orgNodes={orgNodes} positions={positions} onHover={handleHover} onClick={onSelect} progress={bp.processors} highlightSet={highlightSet} lensData={lensData} lensRevealDelay={lensRevealDelay} />
      )}
      {bp.processors > 0 && <EnergyRings orgNodes={orgNodes} positions={positions} progress={bp.processors} highlightSet={highlightSet} />}

      {bp.qubits > 0 && (
        <Qubits repoNodes={repoNodes} positions={positions} onHover={handleHover} onClick={onSelect} progress={bp.qubits} highlightSet={highlightSet} lensData={lensData} lensRevealDelay={lensRevealDelay} />
      )}
      {bp.qubits > 0 && showEffects && <ProbabilityClouds repoNodes={repoNodes} positions={positions} progress={bp.qubits} dimmed={dimmed} />}
      {bp.qubits > 0 && showEffects && <BlochAxes repoNodes={repoNodes} positions={positions} />}

      {/* Users: solo en LOD mid/near */}
      {bp.particles > 0 && showUsers && (
        <QuantumParticles userNodes={userNodes} positions={positions} onHover={handleHover} onClick={onSelect} progress={bp.particles} highlightSet={highlightSet} lensData={lensData} lensRevealDelay={lensRevealDelay} userDensity={userDensity} />
      )}

      {/* Quantum Bonds user→repo: solo en LOD mid/near */}
      {bp.particles > 0 && showUsers && <QuantumBonds repoUsers={repoUsers} positions={positions} progress={bp.particles} dimmed={dimmed} />}

      {/* Canales de entrelazamiento (solo conexiones largas org↔repo) */}
      {bp.entanglement > 0 && <EntanglementChannels connections={longConnections} progress={bp.entanglement} dimmed={dimmed} />}

      {/* Efectos pasivos cuánticos — solo en LOD near */}
      {bp.processors > 0 && showEffects && <HawkingRadiation orgNodes={orgNodes} positions={positions} />}
      {bp.processors > 0 && showEffects && <DecoherenceWaves orgNodes={orgNodes} positions={positions} />}
      {bp.entanglement > 0 && showEffects && <TunnelingPulses connections={longConnections} />}

      {/* Highlight de selección — anillos rotando */}
      {selectedEntity && focusTarget && (
        <FocusHighlight position={focusTarget} entityType={selectedEntity.type} />
      )}

      {/* Label flotante */}
      {hovered && <FloatingLabel entity={hovered.entity} position={hovered.pos} />}

      {/* === BLOOM POSTPROCESSING — glow cuántico espectacular === */}
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.08}
          luminanceSmoothing={0.7}
          mipmapBlur
          levels={6}
          radius={0.85}
        />
      </EffectComposer>
    </>
  )
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

  const [entering, setEntering] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState(null)
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
  const [showBots, setShowBots] = useState(false)
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

  // Crear/destruir Web Worker
  useEffect(() => {
    const worker = new Worker(
      new URL('./computeLayout.worker.js', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (e) => {
      const { result, requestId } = e.data
      if (requestId !== layoutRequestIdRef.current) return // ignorar resultados obsoletos
      if (!result) { setUniverseData(null); return }
      // Convertir posiciones {x,y,z} planas → THREE.Vector3
      const positions = {}
      for (const key of Object.keys(result.positions)) {
        const v = result.positions[key]
        positions[key] = new THREE.Vector3(v.x, v.y, v.z)
      }
      // Reconstruir start/end de conexiones con Vector3
      const connections = result.connections.map(c => ({
        ...c,
        start: positions[c.source] || new THREE.Vector3(c.start.x, c.start.y, c.start.z),
        end: positions[c.target] || new THREE.Vector3(c.end.x, c.end.y, c.end.z),
      }))
      setUniverseData({ ...result, positions, connections })
    }
    layoutWorkerRef.current = worker
    return () => { worker.terminate(); layoutWorkerRef.current = null }
  }, [])

  // Enviar datos al worker cuando cambian las dependencias del grafo
  useEffect(() => {
    if (!filteredGraph?.nodes?.length) { setUniverseData(null); return }
    const id = ++layoutRequestIdRef.current
    layoutWorkerRef.current?.postMessage({
      graph: filteredGraph,
      nodeMetrics: networkMetrics?.node_metrics ?? null,
      requestId: id,
    })
  }, [filteredGraph, networkMetrics])

  useEffect(() => {
    if (showCollaborationGraph) {
      requestAnimationFrame(() => setEntering(true))
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
      setEntering(false); setSelectedEntity(null); setHovered(null); setFocusTarget(null)
      setSceneReady(false); setLoaderVisible(true); setLoaderFading(false); setAnimationStarted(false); setUiVisible(false)
      setCanvasMounted(false)
    }
  }, [showCollaborationGraph])

  useEffect(() => {
    if (!showCollaborationGraph) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (searchEntity) { handleSearchClear() }
        else if (selectedEntity) { setSelectedEntity(null); setResetTrigger(t => t + 1) }
        else closeCollaborationGraph()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showCollaborationGraph, selectedEntity, searchEntity, closeCollaborationGraph, handleSearchClear])

  const handleSelect = useCallback((entity, pos) => {
    setSelectedEntity(entity)
    if (pos) setFocusTarget(pos)
  }, [])

  const handleReset = useCallback(() => {
    setSelectedEntity(null)
    setResetTrigger(t => t + 1)
  }, [])

  const handleSceneReady = useCallback(() => setSceneReady(true), [])

  // Cuando universeData está listo, iniciar fade del loader
  useEffect(() => {
    if (universeData && entering && loaderVisible && !loaderFading) {
      // Breve pausa para que el loader se muestre un mínimo
      const t = setTimeout(() => setLoaderFading(true), 800)
      return () => clearTimeout(t)
    }
  }, [universeData, entering, loaderVisible, loaderFading])

  // Cuando el loader termina de desvanecerse, arrancar animaciones
  useEffect(() => {
    if (loaderFading) {
      // Esperar a que termine la transición CSS de salida (1s) y luego desmontar + arrancar animación
      const t = setTimeout(() => {
        setLoaderVisible(false)
        setAnimationStarted(true)
      }, 1100)
      return () => clearTimeout(t)
    }
  }, [loaderFading])

  // Mostrar UI tras un delay después de que arranquen las animaciones (genesis visible)
  useEffect(() => {
    if (animationStarted) {
      const t = setTimeout(() => setUiVisible(true), 2200)
      return () => clearTimeout(t)
    } else {
      setUiVisible(false)
    }
  }, [animationStarted])

  // Auto-load network metrics when universe opens (solo 1 intento)
  useEffect(() => {
    if (showCollaborationGraph && !networkMetrics && !isLoadingMetrics && !metricsLoadAttempted) {
      loadNetworkMetrics()
    }
  }, [showCollaborationGraph, networkMetrics, isLoadingMetrics, metricsLoadAttempted, loadNetworkMetrics])

  // === LENS TRANSITION HANDLER ===
  const LENS_NAMES = { communities: 'Comunidades', centrality: 'Centralidad', busFactor: 'Bus Factor', intensity: 'Intensidad' }
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

    // Wait for CSS fade-out transition (500ms)
    await new Promise(r => setTimeout(r, 550))

    // Ensure metrics are loaded
    if (!networkMetrics) {
      setLensLoadingLabel('Procesando estructura de red...')
      const success = await loadNetworkMetrics()
      if (!success) {
        setLensTransitioning(false)
        setLensLoadingLabel('')
        lensTransitionRef.current = false
        return
      }
      setLensLoadingLabel(`Renderizando ${LENS_NAMES[lensId] || lensId}...`)
      await new Promise(r => setTimeout(r, 300))
    }

    // Apply lens AND reveal simultaneously — color animation starts after canvas de-blurs
    setActiveLens(lensId)
    setLensTransitioning(false)
    setLensLoadingLabel('')
    lensTransitionRef.current = false
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
    if (activeLens === 'communities') {
      Object.entries(nm).forEach(([id, m]) => {
        if (m.community_color) map[id] = hexToRgb(m.community_color)
      })
    } else if (activeLens === 'centrality') {
      // Gradient from dim blue (low) to bright cyan (high)
      Object.entries(nm).forEach(([id, m]) => {
        const t = m.betweenness || 0
        map[id] = { r: t * 0.5, g: 0.4 + t * 0.6, b: 0.8 + t * 0.2 }
      })
    } else if (activeLens === 'busFactor') {
      // Color repos by bus factor risk
      const riskColors = { critical: '#ff3333', high: '#ff8800', medium: '#ffdd00', low: '#00ff88' }
      Object.entries(nm).forEach(([id, m]) => {
        if (m.bus_factor_risk) {
          map[id] = hexToRgb(riskColors[m.bus_factor_risk] || '#ffffff')
        } else if (m.community_color) {
          // Non-repo nodes: dim
          map[id] = { r: 0.3, g: 0.3, b: 0.3 }
        }
      })
    } else if (activeLens === 'intensity') {
      // All nodes inherit a warm glow proportional to their degree centrality
      Object.entries(nm).forEach(([id, m]) => {
        const d = m.degree || 0
        map[id] = { r: 1.0, g: 0.3 + d * 0.7, b: 0.1 + d * 0.3 }
      })
    }
    return Object.keys(map).length > 0 ? map : null
  }, [activeLens, networkMetrics])

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

    // Users
    ;(universeData.userNodes || []).forEach(user => {
      // Contar repos donde participa
      const repoCount = Object.values(universeData.repoUsers || {})
        .filter(users => users.some(u => u.id === user.id)).length
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
      await findQuantumPathAction(src.id, tgt.id)
    }
  }, [tunnelingSource, tunnelingTarget, searchableNodes, findQuantumPathAction])

  if (!showCollaborationGraph) return null

  const metrics = collaborationDiscovery?.metrics

  return (
    <div className={`${styles.universe} ${entering ? styles.universeVisible : ''}`}>
      <div className={`${styles.canvasWrapper} ${lensTransitioning ? styles.canvasTransitioning : ''}`}>
        {canvasMounted && (
        <Canvas
          camera={{ position: [0, 80, 260], fov: 60, near: 0.1, far: 8000 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
          dpr={[1, 2]}
          raycaster={{ params: { Points: { threshold: 3 } } }}
          onCreated={({ gl }) => gl.setClearColor('#020208')}
        >
          <QuantumScene
            universeData={universeData}
            onSelect={handleSelect}
            hovered={hovered}
            setHovered={setHovered}
            focusTarget={focusTarget}
            resetTrigger={resetTrigger}
            selectedEntity={selectedEntity}
            lensData={lensData}
            lensRevealDelay={lensWithOverlay.current ? 600 : 100}
            searchHighlightSet={searchHighlightSet}
            onSceneReady={handleSceneReady}
            startAnimation={animationStarted}
          />
        </Canvas>
        )}
      </div>

      {/* === QUANTUM LOADING OVERLAY — pantalla de carga inicial === */}
      {loaderVisible && (
        <div className={`${styles.quantumLoader} ${loaderFading ? styles.quantumLoaderHide : ''}`}>
          <div className={styles.loaderPulseRing} />
          <div className={styles.loaderPulseRing2} />
          <div className={styles.loaderScanline} />
          <div className={styles.loaderContent}>
            <img src="/logo.png" alt="ENTANGLE" className={styles.loaderLogo} />
            <p className={styles.loaderSub}>Quantum Software Ecosystem Analysis</p>
            <div className={styles.loaderSpinnerWrap}>
              {/* Átomo CSS puro 3D — perspective + rotateX crea elipses, electrones orbitan en plano inclinado */}
              <div className={styles.loaderAtomCSS}>
                {/* Órbita 1: cyan, 0° */}
                <div className={`${styles.loaderOrbitPlane} ${styles.loaderPlane1}`}>
                  <div className={styles.loaderOrbitRing1} />
                  <div className={`${styles.loaderElSpin} ${styles.loaderElSpin1}`}>
                    <div className={`${styles.loaderElDot} ${styles.loaderElDot1}`} />
                  </div>
                </div>
                {/* Órbita 2: purple, 60° */}
                <div className={`${styles.loaderOrbitPlane} ${styles.loaderPlane2}`}>
                  <div className={styles.loaderOrbitRing2} />
                  <div className={`${styles.loaderElSpin} ${styles.loaderElSpin2}`}>
                    <div className={`${styles.loaderElDot} ${styles.loaderElDot2}`} />
                  </div>
                </div>
                {/* Órbita 3: green, 120° */}
                <div className={`${styles.loaderOrbitPlane} ${styles.loaderPlane3}`}>
                  <div className={styles.loaderOrbitRing3} />
                  <div className={`${styles.loaderElSpin} ${styles.loaderElSpin3}`}>
                    <div className={`${styles.loaderElDot} ${styles.loaderElDot3}`} />
                  </div>
                </div>
                {/* Núcleo */}
                <div className={styles.loaderAtomCoreCSS} />
              </div>
            </div>
            {/* Mensajes cíclicos — puro CSS, sin JS setInterval */}
            <div className={styles.loaderMessages}>
              <p className={styles.loaderMsgItem} style={{ animationDelay: '0s' }}>Colapsando funciones de onda...</p>
              <p className={styles.loaderMsgItem} style={{ animationDelay: '1.6s' }}>Calculando posiciones orbitales...</p>
              <p className={styles.loaderMsgItem} style={{ animationDelay: '3.2s' }}>Entrelazando nodos cuánticos...</p>
              <p className={styles.loaderMsgItem} style={{ animationDelay: '4.8s' }}>Materializando el universo...</p>
            </div>
          </div>
        </div>
      )}

      {/* === LENS TRANSITION OVERLAY — Atom spinner === */}
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
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerAtom}>⚛</span>
          <h2>ENTANGLE Quantum Field</h2>
          <span className={styles.headerSub}>Red de entrelazamiento cuántico</span>
        </div>
        <div className={styles.headerRight}>
          {botCount > 0 && (
            <button
              className={`${styles.botToggle} ${showBots ? styles.botToggleActive : ''}`}
              onClick={() => { setShowBots(b => !b); setSelectedEntity(null); setResetTrigger(t => t + 1) }}
              title={showBots ? 'Ocultar bots' : 'Mostrar bots'}
            >
              {showBots ? <FiEye size={13} /> : <FiEyeOff size={13} />}
              <span>{showBots ? 'Bots visibles' : `${botCount} bots ocultos`}</span>
            </button>
          )}
          <button className={styles.resetBtn} onClick={handleReset} title="Vista general"><FiMaximize2 size={14} /></button>
          <button className={styles.closeBtn} onClick={closeCollaborationGraph}><FiX size={18} /><span>ESC</span></button>
        </div>
      </header>

      {/* === BARRA DE BÚSQUEDA CON AUTOCOMPLETE === */}
      <div className={styles.searchBar}>
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
          const typeLabels = { org: 'Procesadores (Orgs)', repo: 'Qubits (Repos)', user: 'Partículas (Users)' }
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
      <div className={styles.lensToolbar}>
        <span className={styles.lensLabel}>Lentes</span>
        {[
          { id: 'communities', icon: <FiLayers size={13} />, name: 'Comunidades', color: '#6c5ce7' },
          { id: 'centrality', icon: <FiActivity size={13} />, name: 'Centralidad', color: '#00b4d8' },
          { id: 'busFactor', icon: <FiShield size={13} />, name: 'Bus Factor', color: '#ff6b6b' },
          { id: 'intensity', icon: <FiZap size={13} />, name: 'Intensidad', color: '#ffd166' },
        ].map(lens => (
          <button
            key={lens.id}
            className={`${styles.lensBtn} ${activeLens === lens.id ? styles.lensBtnActive : ''}`}
            style={activeLens === lens.id ? { '--lens-color': lens.color, borderColor: lens.color, color: lens.color } : { '--lens-color': lens.color }}
            onClick={() => handleLensClick(lens.id)}
            disabled={lensTransitioning}
            title={lensTransitioning ? 'Procesando...' : lens.name}
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
          title="Quantum Tunneling — encontrar camino entre entidades"
        >
          <FiCrosshair size={13} />
          <span>Túnel</span>
        </button>
      </div>

      {/* === QUANTUM TUNNELING SEARCH === */}
      {showTunneling && (
        <div className={styles.tunnelingBar}>
          <div className={styles.tunnelingInputGroup}>
            <FiTarget size={13} style={{ color: '#00ffaa' }} />
            <div className={styles.tunnelingInputWrapper}>
              <input
                className={styles.tunnelingInput}
                placeholder="Origen — escribe para buscar..."
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
                        e.preventDefault() // previene blur antes del click
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
            <span className={styles.tunnelingArrow}>→</span>
            <div className={styles.tunnelingInputWrapper}>
              <input
                className={styles.tunnelingInput}
                placeholder="Destino — escribe para buscar..."
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
            <button className={styles.tunnelingSearchBtn} onClick={handleTunnelingSearch} disabled={isLoadingTunneling}>
              {isLoadingTunneling ? <FiLoader size={14} className={styles.lensSpinner} /> : <FiSearch size={14} />}
            </button>
          </div>

          {/* Resultado del tunneling */}
          {tunnelingPath && (
            <div className={styles.tunnelingResult}>
              {tunnelingPath.found ? (
                <>
                  <div className={styles.tunnelingPathHeader}>
                    <span>Quantum Channel encontrado — {tunnelingPath.length} saltos</span>
                    <button onClick={clearTunneling} className={styles.tunnelingCloseBtn}><FiX size={12} /></button>
                  </div>
                  <div className={styles.tunnelingPathChain}>
                    {tunnelingPath.path.map((node, idx) => (
                      <span key={node.id}>
                        <span className={styles.tunnelingPathNode} data-type={node.type}>
                          {node.type === 'org' ? '⊛' : node.type === 'repo' ? '◉' : '•'} {node.name}
                        </span>
                        {idx < tunnelingPath.path.length - 1 && <span className={styles.tunnelingPathEdge}>⟶</span>}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className={styles.tunnelingNoPath}>
                  <span>No existe canal cuántico entre estas entidades</span>
                  <button onClick={clearTunneling} className={styles.tunnelingCloseBtn}><FiX size={12} /></button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Leyenda cuántica */}
      <div className={styles.legend}>
        <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#00f7ff', boxShadow: '0 0 10px #00f7ff' }} />Procesadores (Orgs)</div>
        <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#bd00ff', boxShadow: '0 0 10px #bd00ff' }} />Qubits (Repos)</div>
        <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#00ff9f', boxShadow: '0 0 10px #00ff9f' }} />Partículas (Users)</div>
        <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#ffbd00', boxShadow: '0 0 10px #ffbd00' }} />Entrelazadas (Bridge)</div>
      </div>

      {/* Métricas — conteos reales del grafo renderizado */}
      <div className={styles.metricsFloat}>
        <div className={styles.metricPill}><FiGrid size={12} />{universeData?.repoNodes?.length || 0} qubits</div>
        <div className={styles.metricPill}><FiUsers size={12} />{universeData?.userNodes?.length || 0} partículas</div>
        <div className={styles.metricPill}><FiGitBranch size={12} />{metrics?.connected_repo_pairs || 0} canales</div>
        <div className={styles.metricPill}><FiZap size={12} />{metrics?.bridge_users_count || 0} entrelazadas</div>
      </div>

      {/* Panel de detalle */}
      {selectedEntity && (
        <aside className={styles.detailPanel}>
          <button className={styles.detailClose} onClick={() => { setSelectedEntity(null); setResetTrigger(t => t + 1) }}>
            <FiX size={14} />
          </button>
          <div className={styles.detailHeader}>
            <div className={styles.detailIcon} style={{
              background: selectedEntity.type === 'org' ? 'rgba(0,247,255,0.15)' : selectedEntity.type === 'repo' ? 'rgba(189,0,255,0.15)' : 'rgba(0,255,159,0.15)',
              color: selectedEntity.type === 'org' ? '#00f7ff' : selectedEntity.type === 'repo' ? '#bd00ff' : '#00ff9f',
            }}>
              {selectedEntity.type === 'org' && <FiGrid size={20} />}
              {selectedEntity.type === 'repo' && <FiGitBranch size={20} />}
              {selectedEntity.type === 'user' && <FiUser size={20} />}
            </div>
            <div>
              <h3>{selectedEntity.name || selectedEntity.login || selectedEntity.full_name}</h3>
              <span className={styles.detailType}>
                {{ org: 'Procesador Cuántico', repo: 'Qubit', user: 'Partícula Cuántica' }[selectedEntity.type]}
              </span>
            </div>
          </div>
          <div className={styles.detailBody}>
            {selectedEntity.type === 'org' && (() => {
              const repos = universeData?.orgRepos[selectedEntity.id] || []
              const totalUsers = repos.reduce((acc, r) => {
                const users = universeData?.repoUsers[r.id] || []
                users.forEach(u => acc.add(u.id))
                return acc
              }, new Set()).size
              return (
                <>
                  <p className={styles.detailMeta}>Login: @{selectedEntity.login}</p>
                  <div className={styles.detailStats}>
                    <div className={styles.detailStat}>
                      <span className={styles.detailStatValue}>{repos.length}</span>
                      <span className={styles.detailStatLabel}>Qubits</span>
                    </div>
                    <div className={styles.detailStat}>
                      <span className={styles.detailStatValue}>{totalUsers}</span>
                      <span className={styles.detailStatLabel}>Partículas</span>
                    </div>
                  </div>
                  {repos.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}>Qubits en registro</p>
                      <div className={styles.detailChips}>
                        {repos.slice(0, 8).map(r => (
                          <span key={r.id} className={styles.detailChip} style={{ borderColor: 'rgba(189,0,255,0.3)' }}>
                            {r.name || r.full_name?.split('/')[1] || r.id}
                          </span>
                        ))}
                        {repos.length > 8 && <span className={styles.detailChipMore}>+{repos.length - 8}</span>}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
            {selectedEntity.type === 'repo' && (() => {
              const users = universeData?.repoUsers[selectedEntity.id] || []
              const bridgeUsers = users.filter(u => u.isBridge)
              return (
                <>
                  <p className={styles.detailMeta}>{selectedEntity.full_name}</p>
                  <div className={styles.detailStats}>
                    {selectedEntity.stars > 0 && (
                      <div className={styles.detailStat}>
                        <span className={styles.detailStatValue}>⭐ {selectedEntity.stars}</span>
                        <span className={styles.detailStatLabel}>Estrellas</span>
                      </div>
                    )}
                    <div className={styles.detailStat}>
                      <span className={styles.detailStatValue}>{users.length}</span>
                      <span className={styles.detailStatLabel}>Partículas</span>
                    </div>
                    {bridgeUsers.length > 0 && (
                      <div className={styles.detailStat}>
                        <span className={styles.detailStatValue} style={{ color: '#ffbd00' }}>{bridgeUsers.length}</span>
                        <span className={styles.detailStatLabel}>Entrelazadas</span>
                      </div>
                    )}
                  </div>
                  {selectedEntity.language && (
                    <p className={styles.detailMeta}>
                      Lenguaje: <strong style={{ color: '#bd00ff' }}>{selectedEntity.language}</strong>
                    </p>
                  )}
                  {users.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}>Partículas orbitando</p>
                      <div className={styles.detailChips}>
                        {users.slice(0, 10).map(u => (
                          <span key={u.id} className={styles.detailChip} style={{
                            borderColor: u.isBridge ? 'rgba(255,189,0,0.3)' : 'rgba(0,255,159,0.3)',
                            color: u.isBridge ? '#ffbd00' : undefined
                          }}>
                            {u.isBridge && '⚛ '}{u.login || u.id}
                          </span>
                        ))}
                        {users.length > 10 && <span className={styles.detailChipMore}>+{users.length - 10}</span>}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
            {selectedEntity.type === 'user' && (() => {
              // Buscar repos donde participa este usuario
              const userRepos = universeData ? Object.entries(universeData.repoUsers)
                .filter(([, users]) => users.some(u => u.id === selectedEntity.id))
                .map(([repoId]) => universeData.repoNodes.find(r => r.id === repoId))
                .filter(Boolean) : []
              // Buscar orgs asociadas
              const userOrgs = universeData ? userRepos.reduce((acc, repo) => {
                const org = Object.entries(universeData.orgRepos)
                  .find(([, repos]) => repos.some(r => r.id === repo.id))
                if (org) {
                  const orgNode = universeData.orgNodes.find(o => o.id === org[0])
                  if (orgNode && !acc.find(a => a.id === orgNode.id)) acc.push(orgNode)
                }
                return acc
              }, []) : []
              return (
                <>
                  <p className={styles.detailMeta}>@{selectedEntity.login}</p>
                  {selectedEntity.isBridge && (
                    <p className={styles.detailBridge}><FiZap size={12} /> Partícula Entrelazada</p>
                  )}
                  <div className={styles.detailStats}>
                    <div className={styles.detailStat}>
                      <span className={styles.detailStatValue}>{userRepos.length}</span>
                      <span className={styles.detailStatLabel}>Qubits</span>
                    </div>
                    {userOrgs.length > 0 && (
                      <div className={styles.detailStat}>
                        <span className={styles.detailStatValue}>{userOrgs.length}</span>
                        <span className={styles.detailStatLabel}>Procesadores</span>
                      </div>
                    )}
                  </div>
                  {userRepos.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}>Contribuye a</p>
                      <div className={styles.detailChips}>
                        {userRepos.slice(0, 6).map(r => (
                          <span key={r.id} className={styles.detailChip} style={{ borderColor: 'rgba(189,0,255,0.3)' }}>
                            {r.name || r.full_name?.split('/')[1] || r.id}
                          </span>
                        ))}
                        {userRepos.length > 6 && <span className={styles.detailChipMore}>+{userRepos.length - 6}</span>}
                      </div>
                    </div>
                  )}
                  {userOrgs.length > 0 && (
                    <div className={styles.detailSection}>
                      <p className={styles.detailSectionTitle}>Procesadores asociados</p>
                      <div className={styles.detailChips}>
                        {userOrgs.map(o => (
                          <span key={o.id} className={styles.detailChip} style={{ borderColor: 'rgba(0,247,255,0.3)' }}>
                            {o.name || o.login || o.id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>

          {/* === MÉTRICAS DE RED ENRIQUECIDAS === */}
          {networkMetrics?.node_metrics?.[selectedEntity.id] && (() => {
            const nm = networkMetrics.node_metrics[selectedEntity.id]
            const community = networkMetrics.communities?.find(c => c.id === nm.community_id)

            // collab_centrality y collab_connectivity vienen del backend como 0-100 (percentil por tipo)
            const centrality = nm.collab_centrality ?? 0
            const connectivity = nm.collab_connectivity ?? 0

            // Detalle raw visible bajo la barra
            const centralityDetail = {
              org: `${nm.collab_centrality_raw ?? 0} contributors compartidos con otras orgs`,
              repo: `${nm.collab_centrality_raw ?? 0} organizaciones representadas`,
              user: `${nm.collab_centrality_raw ?? 0} organizaciones distintas`,
            }
            const connectivityDetail = {
              org: `${nm.collab_connectivity_raw ?? 0} organizaciones vecinas`,
              repo: `${nm.collab_connectivity_raw ?? 0} contributors`,
              user: `${nm.collab_connectivity_raw ?? 0} repositorios`,
            }

            return (
              <div className={styles.detailNetworkMetrics}>
                <p className={styles.detailSectionTitle}>Análisis de Red</p>
                
                {/* Centralidad */}
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}><FiActivity size={11} /> Centralidad</span>
                  <div className={styles.metricBarWrap}>
                    <div className={styles.metricBar} style={{ width: `${centrality}%`, background: 'linear-gradient(90deg, #0077b6, #00b4d8)' }} />
                  </div>
                  <span className={styles.metricValue}>{centrality}%</span>
                </div>
                <p className={styles.metricDetail}>{centralityDetail[selectedEntity.type] || ''}</p>
                <div className={styles.metricRow}>
                  <span className={styles.metricLabel}><FiUsers size={11} /> Conectividad</span>
                  <div className={styles.metricBarWrap}>
                    <div className={styles.metricBar} style={{ width: `${connectivity}%`, background: 'linear-gradient(90deg, #6c5ce7, #a29bfe)' }} />
                  </div>
                  <span className={styles.metricValue}>{connectivity}%</span>
                </div>
                <p className={styles.metricDetail}>{connectivityDetail[selectedEntity.type] || ''}</p>

                {/* Comunidad */}
                {community && (
                  <div className={styles.communityBadge} style={{ '--community-color': nm.community_color }}>
                    <span className={styles.communityDot} style={{ background: nm.community_color }} />
                    <span>{community.label}</span>
                    <span className={styles.communitySize}>{community.size} nodos</span>
                  </div>
                )}

                {/* Bus Factor (solo repos) */}
                {nm.bus_factor_risk && (
                  <div className={`${styles.busFactor} ${styles[`busFactor${nm.bus_factor_risk.charAt(0).toUpperCase() + nm.bus_factor_risk.slice(1)}`]}`}>
                    <div className={styles.busFactorHeader}>
                      <FiShield size={12} />
                      <span>Bus Factor: {nm.bus_factor}</span>
                      <span className={styles.busFactorRisk}>{nm.bus_factor_risk.toUpperCase()}</span>
                    </div>
                    {nm.top_contributors && nm.top_contributors.length > 0 && (
                      <div className={styles.busFactorContribs}>
                        {nm.top_contributors.slice(0, 3).map((c, i) => (
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
              </div>
            )
          })()}
        </aside>
      )}

      {/* Botón de ayuda */}
      <button className={styles.helpBtn} onClick={() => setShowHelp(h => !h)} title="¿Qué estoy viendo?">
        <FiHelpCircle size={16} />
        <span>¿Qué estoy viendo?</span>
      </button>

      {/* Panel de ayuda */}
      {showHelp && (
        <aside className={styles.helpPanel}>
          <div className={styles.helpHeader}>
            <h3>¿Qué estoy viendo?</h3>
            <button className={styles.helpClose} onClick={() => setShowHelp(false)}><FiX size={14} /></button>
          </div>
          <div className={styles.helpBody}>
            <p className={styles.helpIntro}>
              Este grafo 3D representa el <strong>ecosistema de colaboración</strong> en software cuántico. Cada elemento visual es una analogía con la física cuántica.
            </p>

            <div className={styles.helpCard}>
              <div className={styles.helpCardIcon} style={{ background: 'rgba(0,247,255,0.12)', color: '#00f7ff' }}>⊛</div>
              <div>
                <h4>Procesadores Cuánticos</h4>
                <p>Los <strong>anillos rotando</strong> son <em>organizaciones</em> de GitHub. Como un procesador cuántico real aloja qubits, cada organización aloja repositorios.</p>
              </div>
            </div>

            <div className={styles.helpCard}>
              <div className={styles.helpCardIcon} style={{ background: 'rgba(189,0,255,0.12)', color: '#bd00ff' }}>◉</div>
              <div>
                <h4>Qubits</h4>
                <p>Las <strong>esferas violetas</strong> son <em>repositorios</em>. El qubit es la unidad de información cuántica — el repositorio es la unidad de información del ecosistema. Las partículas que los rodean representan su nube de probabilidad.</p>
              </div>
            </div>

            <div className={styles.helpCard}>
              <div className={styles.helpCardIcon} style={{ background: 'rgba(0,255,159,0.12)', color: '#00ff9f' }}>•</div>
              <div>
                <h4>Partículas Cuánticas</h4>
                <p>Los <strong>puntos verdes</strong> son <em>desarrolladores</em> que orbitan los repositorios a los que contribuyen, como electrones alrededor de un átomo.</p>
              </div>
            </div>

            <div className={styles.helpCard}>
              <div className={styles.helpCardIcon} style={{ background: 'rgba(255,189,0,0.12)', color: '#ffbd00' }}>⚛</div>
              <div>
                <h4>Partículas Entrelazadas</h4>
                <p>Los <strong>puntos dorados</strong> que destellan simultáneamente son <em>bridge users</em> — desarrolladores que conectan repositorios de diferentes organizaciones. Su destello sincronizado visualiza el entrelazamiento cuántico: correlación instantánea sin importar la distancia.</p>
              </div>
            </div>

            <div className={styles.helpCard}>
              <div className={styles.helpCardIcon} style={{ background: 'rgba(255,189,0,0.12)', color: '#ffbd00' }}>∿</div>
              <div>
                <h4>Canales de Entrelazamiento</h4>
                <p>Las <strong>ondas doradas</strong> entre entidades representan relaciones de colaboración — como canales cuánticos que transmiten información entre repositorios.</p>
              </div>
            </div>

            <details className={styles.helpDetails}>
              <summary><FiChevronDown size={12} /> Efectos ambientales</summary>
              <div className={styles.helpDetailsList}>
                <div className={styles.helpMiniCard}>
                  <strong>Vacío Cuántico</strong> — La rejilla del fondo y las partículas que parpadean representan las fluctuaciones cuánticas del vacío.
                </div>
                <div className={styles.helpMiniCard}>
                  <strong>Quantum Genesis</strong> — El destello inicial simula el Big Bang que da origen al universo cuántico.
                </div>
                <div className={styles.helpMiniCard}>
                  <strong>Efecto Túnel</strong> — Las esferas doradas que viajan por los canales son fotones atravesando barreras de potencial.
                </div>
                <div className={styles.helpMiniCard}>
                  <strong>Ondas de Decoherencia</strong> — Los anillos expansivos desde los procesadores simulan la pérdida de coherencia cuántica.
                </div>
                <div className={styles.helpMiniCard}>
                  <strong>Radiación de Hawking</strong> — Las micropartículas que emanan de cada procesador simulan la radiación que emiten los agujeros negros.
                </div>
                <div className={styles.helpMiniCard}>
                  <strong>Incertidumbre de Heisenberg</strong> — La micro-vibración constante de todas las entidades refleja que en el mundo cuántico no existen posiciones absolutamente fijas.
                </div>
              </div>
            </details>

            <details className={styles.helpDetails}>
              <summary><FiChevronDown size={12} /> Controles</summary>
              <div className={styles.helpDetailsList}>
                <div className={styles.helpMiniCard}><strong>Click</strong> — Colapsa la función de onda: revela la información de la entidad.</div>
                <div className={styles.helpMiniCard}><strong>Scroll</strong> — Navega en la dirección del cursor (vuelo libre).</div>
                <div className={styles.helpMiniCard}><strong>Arrastrar</strong> — Rota la vista orbital.</div>
                <div className={styles.helpMiniCard}><strong>ESC</strong> — Deselecciona o cierra la visualización.</div>
              </div>
            </details>
          </div>
        </aside>
      )}

      <div className={styles.interactionHint}>
        Click · Colapso de función de onda &nbsp;|&nbsp; Scroll · Control de zoom &nbsp;|&nbsp; Arrastrar · Rotación orbital  
      </div>
      </div>{/* cierre universeUI */}
    </div>
  )
}
