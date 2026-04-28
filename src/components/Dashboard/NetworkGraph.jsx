/**
 * NETWORK GRAPH v2 - Grafo Interactivo de Colaboración Real
 * 
 * Permite seleccionar 2+ organizaciones y muestra el grafo REAL
 * de colaboración: bridge users, repos compartidos, métricas de red.
 * Usa datos de collaborationDiscovery + networkMetrics.
 */

import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useDashboardStore } from '../../store/dashboardStore'
import useFavoritesStore from '../../store/favoritesStore'
import {
  FiGitBranch, FiPackage, FiBarChart2, FiLink2,
  FiCompass, FiUsers, FiCode, FiStar, FiGitMerge,
  FiAlertTriangle, FiTarget, FiGlobe, FiX,
  FiMapPin, FiCheckCircle, FiZap, FiAward, FiSearch
} from 'react-icons/fi'
import styles from './NetworkGraph.module.css'

// Known bot logins — filters bots missed by backend isBot flag
const KNOWN_BOT_LOGINS = new Set([
  'dependabot', 'renovate', 'greenkeeper', 'snyk-bot', 'codecov',
  'sonarcloud', 'claude', 'actions-user', 'github-actions',
  'copilot', 'deepsource-autofix', 'imgbot', 'allcontributors',
  'pre-commit-ci', 'netlify', 'vercel', 'railway', 'render',
  'mergify', 'kodiakhq', 'whitesource-bolt', 'mend-bolt-for-github',
  'depfu', 'pyup-bot', 'fossabot', 'semantic-release-bot',
  'github-pages', 'web-flow',
])
function isBotNode(n) {
  if (n.isBot) return true
  const login = (n.login || n.name || n.id?.replace('user_', '') || '').toLowerCase()
  return KNOWN_BOT_LOGINS.has(login) || login.endsWith('[bot]') || login.endsWith('-bot')
}

// ── Paleta de colores ──
const COLORS = {
  org: '#00f7ff',
  repo: '#bd00ff',
  user: '#00ff9f',
  bridge: '#ffbd00',
  highlight: '#ffbd00',
  link: 'rgba(255, 255, 255, 0.08)',
  linkContrib: 'rgba(0, 255, 159, 0.12)',
  linkOwns: 'rgba(187, 153, 255, 0.18)',
  linkEntangled: 'rgba(0, 247, 255, 0.25)',
  linkHover: '#ffbd00',
}

// ── Genera un path hexagonal para repos ──
function hexagonPath(cx, cy, r) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
  }
  return `M${pts.join('L')}Z`
}

// ── Palette for org sector wedges (subtle fills) ──
const ORG_SECTOR_COLORS = [
  'rgba(0,247,255,0.04)',   // cyan
  'rgba(189,0,255,0.04)',   // purple
  'rgba(0,255,159,0.04)',   // green
  'rgba(255,189,0,0.04)',   // amber
  'rgba(255,56,96,0.04)',   // red
  'rgba(50,115,220,0.04)',  // blue
]

// Simple seeded hash for deterministic jitter
function seededRand(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = Math.trunc((h << 5) - h + str.charCodeAt(i))
  return ((h & 0x7fffffff) % 1000) / 1000  // 0..1
}

const SVG_W = 750
const SVG_H = 750
const CENTER_X = SVG_W / 2
const CENTER_Y = SVG_H / 2
const RADIUS = 310

// ── Detail level presets ──
const DETAIL_LEVELS = {
  compact:  { maxReposPerOrg: 4,  maxSinglePerOrg: 3,  maxBridge: 6,  label: 'Compacto' },
  normal:   { maxReposPerOrg: 7,  maxSinglePerOrg: 5,  maxBridge: 12, label: 'Normal' },
  detailed: { maxReposPerOrg: 12, maxSinglePerOrg: 8,  maxBridge: 20, label: 'Detallado' },
}

/**
 * Builds the graph from real collaboration data, filtering by selected orgs.
 * OPTIMIZED: O(n) with indexed Maps instead of .find() in loops.
 * Returns { nodes, links, orgArcs, nodesMap, metrics }
 */
function buildCollaborationGraph(collaborationDiscovery, networkMetrics, selectedOrgLogins, detailLevel = 'normal') {
  if (!collaborationDiscovery?.graph?.nodes || selectedOrgLogins.length < 2) {
    return { nodes: [], links: [], orgArcs: [], nodesMap: new Map(), metrics: null }
  }

  const limits = DETAIL_LEVELS[detailLevel] || DETAIL_LEVELS.normal

  // Filter out bot nodes before processing
  const botIds = new Set(collaborationDiscovery.graph.nodes.filter(n => isBotNode(n)).map(n => n.id))
  const allNodes = collaborationDiscovery.graph.nodes.filter(n => !botIds.has(n.id))
  const allLinks = collaborationDiscovery.graph.links.filter(l => !botIds.has(l.source) && !botIds.has(l.target))
  const nodeMetrics = networkMetrics?.node_metrics || {}

  // ── INDEX: build a lookup map for all nodes by id (O(n) once) ──
  const nodeById = new Map()
  for (const n of allNodes) nodeById.set(n.id, n)

  // 1. Get selected org node IDs
  const selectedOrgSet = new Set(selectedOrgLogins)
  const selectedOrgIds = new Set(selectedOrgLogins.map(l => `org_${l}`))

  // 2. Find repos belonging to selected orgs + index by id
  const repoById = new Map()
  for (const n of allNodes) {
    if (n.type === 'repo' && selectedOrgIds.has(`org_${n.org}`)) {
      repoById.set(n.id, n)
    }
  }

  // 3+4. Single pass over contributed_to links: find linked users + map user→orgs
  const userToOrgs = new Map()
  const repoContribCount = new Map() // for later ranking
  for (const link of allLinks) {
    if (link.type !== 'contributed_to') continue
    const userId = link.source.startsWith('user_') ? link.source : link.target
    const repoId = link.source.startsWith('repo_') ? link.source : link.target
    const repo = repoById.get(repoId)
    if (!repo) continue
    const orgLogin = repo.org
    if (!selectedOrgSet.has(orgLogin)) continue
    if (!userToOrgs.has(userId)) userToOrgs.set(userId, new Set())
    userToOrgs.get(userId).add(orgLogin)
    repoContribCount.set(repoId, (repoContribCount.get(repoId) || 0) + 1)
  }

  // Classify users: bridge (2+ orgs) vs single-org
  const bridgeUserIds = new Set()
  const singleOrgUsers = new Set()
  for (const [userId, orgs] of userToOrgs) {
    if (orgs.size >= 2) bridgeUserIds.add(userId)
    else singleOrgUsers.add(userId)
  }

  // 5. Limit single-org users to most active per org
  const orgSingleUsers = new Map()
  for (const userId of singleOrgUsers) {
    const orgLogin = [...userToOrgs.get(userId)][0]
    if (!orgSingleUsers.has(orgLogin)) orgSingleUsers.set(orgLogin, [])
    const userNode = nodeById.get(userId)
    orgSingleUsers.get(orgLogin).push({
      userId,
      score: userNode?.quantum_expertise_score || 0,
      reposCount: userNode?.repos_count || 1,
    })
  }

  const includedSingleUsers = new Set()
  for (const [, users] of orgSingleUsers) {
    users.sort((a, b) => b.reposCount - a.reposCount || b.score - a.score)
    users.slice(0, limits.maxSinglePerOrg).forEach(u => includedSingleUsers.add(u.userId))
  }

  // 5b. Cap bridge users by centrality
  let cappedBridgeIds = bridgeUserIds
  if (bridgeUserIds.size > limits.maxBridge) {
    const bridgeWithScore = [...bridgeUserIds].map(uid => {
      const m = nodeMetrics[uid] || nodeMetrics[uid.replace('user_', '')] || {}
      return { uid, score: (m.collab_centrality || 0) + (m.betweenness || 0) }
    })
    bridgeWithScore.sort((a, b) => b.score - a.score)
    cappedBridgeIds = new Set(bridgeWithScore.slice(0, limits.maxBridge).map(b => b.uid))
  }

  const totalBridgeEligible = bridgeUserIds.size
  const finalUserIds = new Set([...cappedBridgeIds, ...includedSingleUsers])

  // 6. Find repos connected to included users (single pass)
  const finalRepoIds = new Set()
  for (const link of allLinks) {
    if (link.type !== 'contributed_to') continue
    const userId = link.source.startsWith('user_') ? link.source : link.target
    const repoId = link.source.startsWith('repo_') ? link.source : link.target
    if (finalUserIds.has(userId) && repoById.has(repoId)) {
      finalRepoIds.add(repoId)
    }
  }

  // Count contrib per repo with only final users (for ranking)
  const repoFinalContrib = new Map()
  for (const link of allLinks) {
    if (link.type !== 'contributed_to') continue
    const userId = link.source.startsWith('user_') ? link.source : link.target
    const repoId = link.source.startsWith('repo_') ? link.source : link.target
    if (finalUserIds.has(userId) && finalRepoIds.has(repoId)) {
      repoFinalContrib.set(repoId, (repoFinalContrib.get(repoId) || 0) + 1)
    }
  }

  const finalUsers = [...finalUserIds].map(id => nodeById.get(id)).filter(Boolean)

  // 7. Assign positions — IMPROVED LAYOUT with jitter + smart bridge placement
  const nodes = []
  const nodesMap = new Map()
  const numOrgs = selectedOrgLogins.length

  // Dynamic gap: wider separation with fewer orgs
  const gapAngle = numOrgs <= 2 ? 0.5 : numOrgs <= 4 ? 0.25 : 0.15
  const arcSize = (2 * Math.PI) / numOrgs

  // For 2 orgs: use left/right layout offset
  const baseRotation = numOrgs === 2 ? 0 : -Math.PI / 2

  const orgArcs = []
  const orgArcByLogin = {} // for bridge positioning

  selectedOrgLogins.forEach((orgLogin, orgIdx) => {
    const arcStart = orgIdx * arcSize + baseRotation + gapAngle / 2
    const arcEnd = (orgIdx + 1) * arcSize + baseRotation - gapAngle / 2
    const arcMid = (arcStart + arcEnd) / 2

    const sectorColor = ORG_SECTOR_COLORS[orgIdx % ORG_SECTOR_COLORS.length]
    orgArcs.push({ orgLogin, arcStart, arcEnd, arcMid, sectorColor })
    orgArcByLogin[orgLogin] = { arcStart, arcEnd, arcMid }

    // Org node at outer arc midpoint
    const orgNode = allNodes.find(n => (n.login === orgLogin || n.id === `org_${orgLogin}`) && n.type === 'org')
    if (orgNode) {
      const ox = CENTER_X + (RADIUS + 25) * Math.cos(arcMid)
      const oy = CENTER_Y + (RADIUS + 25) * Math.sin(arcMid)
      const enriched = { ...orgNode, x: ox, y: oy, size: 11, _orgLogin: orgLogin, _isBridge: false }
      nodes.push(enriched)
      nodesMap.set(orgNode.id, enriched)
    }

    // Repos for this org along the arc at RADIUS (capped)
    const orgRepoEntries = []
    for (const [repoId, repo] of repoById) {
      if (repo.org === orgLogin && finalRepoIds.has(repoId)) orgRepoEntries.push(repo)
    }
    orgRepoEntries.sort((a, b) =>
      (repoFinalContrib.get(b.id) || 0) - (repoFinalContrib.get(a.id) || 0) ||
      (b.stars || 0) - (a.stars || 0)
    )
    const orgRepos = orgRepoEntries.slice(0, limits.maxReposPerOrg)

    // Spread repos along arc with padding + radial jitter
    const arcSpan = arcEnd - arcStart
    const repoPad = arcSpan * 0.08
    orgRepos.forEach((repo, ri) => {
      const effectiveStart = arcStart + repoPad
      const effectiveEnd = arcEnd - repoPad
      const t = orgRepos.length > 1
        ? effectiveStart + (ri / (orgRepos.length - 1)) * (effectiveEnd - effectiveStart)
        : arcMid
      const jitter = (seededRand(repo.id) - 0.5) * 24  // ±12px radial jitter
      const rr = RADIUS + jitter
      const rx = CENTER_X + rr * Math.cos(t)
      const ry = CENTER_Y + rr * Math.sin(t)
      const enriched = {
        ...repo,
        x: rx, y: ry,
        size: Math.min(3 + Math.sqrt(repo.stars || 0) * 0.4, 9),
        _orgLogin: orgLogin, _isBridge: false,
      }
      nodes.push(enriched)
      nodesMap.set(repo.id, enriched)
    })

    // Single-org users on inner ring with radial jitter
    const orgSingle = finalUsers.filter(u => !bridgeUserIds.has(u.id) && userToOrgs.get(u.id)?.has(orgLogin))
    const innerR = RADIUS * 0.55
    const userPad = arcSpan * 0.1
    orgSingle.forEach((user, ui) => {
      const effectiveStart = arcStart + userPad
      const effectiveEnd = arcEnd - userPad
      const t = orgSingle.length > 1
        ? effectiveStart + (ui / (orgSingle.length - 1)) * (effectiveEnd - effectiveStart)
        : arcMid
      const jitter = (seededRand(user.id) - 0.5) * 30  // ±15px radial jitter
      const ur = innerR + jitter
      const ux = CENTER_X + ur * Math.cos(t)
      const uy = CENTER_Y + ur * Math.sin(t)
      const metrics = nodeMetrics[user.id] || nodeMetrics[user.login] || {}
      const cen = Math.min(metrics.collab_centrality || 0, 1)
      const enriched = {
        ...user,
        x: ux, y: uy,
        size: Math.min(4 + cen * 5, 9),
        _orgLogin: orgLogin, _isBridge: false, _metrics: metrics,
      }
      nodes.push(enriched)
      nodesMap.set(user.id, enriched)
    })
  })

  // Bridge users — distribute evenly across the bridge zone
  const bridgeArr = finalUsers.filter(u => cappedBridgeIds.has(u.id))
  const bridgeMinR = 65
  const bridgeMaxR = RADIUS * 0.38
  const bridgeCount = bridgeArr.length
  bridgeArr.forEach((user, bi) => {
    const metrics = nodeMetrics[user.id] || nodeMetrics[user.login] || {}
    const connectedOrgs = [...(userToOrgs.get(user.id) || [])]

    // Spread evenly around the full circle, with a per-user radial stagger
    const baseAngle = bridgeCount > 1
      ? (bi / bridgeCount) * 2 * Math.PI - Math.PI / 2
      : 0
    // Small angular jitter for organic feel
    const angularJitter = (seededRand(user.id) - 0.5) * (Math.PI / Math.max(bridgeCount, 4))
    const angle = baseAngle + angularJitter

    // Alternate between 3 radial rings, with per-user jitter
    const ring = bi % 3
    const baseR = bridgeMinR + ring * ((bridgeMaxR - bridgeMinR) / 2.5)
    const radialJitter = (seededRand(user.id + '_r') - 0.5) * 20
    const bridgeR = Math.max(bridgeMinR, Math.min(bridgeMaxR, baseR + radialJitter))

    const bx = CENTER_X + bridgeR * Math.cos(angle)
    const by = CENTER_Y + bridgeR * Math.sin(angle)
    const cen = Math.min(metrics.collab_centrality || 0, 1)
    const enriched = {
      ...user,
      x: bx, y: by,
      size: Math.min(5 + cen * 7, 12),
      _isBridge: true, _metrics: metrics,
      _connectedOrgs: connectedOrgs,
    }
    nodes.push(enriched)
    nodesMap.set(user.id, enriched)
  })

  // 8. Build links (only between included nodes)
  const links = []
  const addedLinkKeys = new Set()

  for (const link of allLinks) {
    const sNode = nodesMap.get(link.source)
    const tNode = nodesMap.get(link.target)
    if (!sNode || !tNode) continue
    const key = `${link.source}__${link.target}`
    if (addedLinkKeys.has(key)) continue
    addedLinkKeys.add(key)
    links.push({
      source: link.source,
      target: link.target,
      type: link.type,
      strength: link.strength || 1,
    })
  }

  // 9. Summary metrics
  const totalUsers = finalUsers.length
  const totalRepos = nodes.filter(n => n.type === 'repo').length
  const totalUsersAll = userToOrgs.size
  const totalReposAll = repoById.size

  let avgCentrality = 0
  if (bridgeArr.length > 0) {
    const sum = bridgeArr.reduce((acc, u) => {
      const m = nodeMetrics[u.id] || nodeMetrics[u.login] || {}
      return acc + (m.collab_centrality || 0)
    }, 0)
    avgCentrality = sum / bridgeArr.length
  }

  return {
    nodes,
    links,
    orgArcs,
    nodesMap,
    metrics: {
      bridgeCount,
      totalUsers,
      totalRepos,
      avgCentrality: Math.round(avgCentrality * 100) / 100,
      totalUsersAll,
      totalReposAll,
      totalBridgeAll: totalBridgeEligible,
      isTruncated: totalUsers < totalUsersAll || totalRepos < totalReposAll,
    },
  }
}

/**
 * FilterBadge - indicador de filtro activo con animaciones
 */
function FilterBadge({ value, onClear, label }) {
  const { t } = useTranslation()
  const [state, setState] = useState('hidden')
  const [displayValue, setDisplayValue] = useState(value)
  const prevValueRef = useRef(null)
  const timeoutRef = useRef(null)
  const valueRef = useRef(null)
  const [valueOverflows, setValueOverflows] = useState(false)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (value && !prevValueRef.current) {
      setDisplayValue(value)
      setState('entering')
      timeoutRef.current = setTimeout(() => setState('visible'), 20)
    } else if (value && prevValueRef.current && value !== prevValueRef.current) {
      setState('changing')
      timeoutRef.current = setTimeout(() => { setDisplayValue(value); setState('visible') }, 150)
    } else if (!value && prevValueRef.current) {
      setState('exiting')
      timeoutRef.current = setTimeout(() => { setState('hidden'); setDisplayValue(null) }, 200)
    }
    prevValueRef.current = value
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [value])

  useEffect(() => {
    const el = valueRef.current
    if (!el) return
    const check = () => {
      const overflow = el.scrollWidth - el.clientWidth
      if (overflow > 2) {
        setValueOverflows(true)
        el.style.setProperty('--marquee-distance', `-${overflow + 8}px`)
      } else {
        setValueOverflows(false)
      }
    }
    const timer = setTimeout(check, 300)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { clearTimeout(timer); ro.disconnect() }
  }, [displayValue])

  if (state === 'hidden' && !value) return null

  const cls = [styles.filterIndicator]
  if (state === 'visible' || state === 'changing') cls.push(styles.filterVisible)
  if (state === 'exiting') cls.push(styles.filterExiting)

  return (
    <div className={cls.join(' ')}>
      <span className={styles.filterLabel}>✓ {label}:</span>
      <div ref={valueRef} className={`${styles.filterValueWrapper} ${valueOverflows ? styles.filterValueMarquee : ''}`}>
        <strong className={state === 'changing' ? styles.valueChanging : ''}>{displayValue}</strong>
      </div>
      <button className={styles.clearButton} onClick={onClear} title={t('network.removeFilter')}>✕</button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════
export default function NetworkGraph() {
  const { t } = useTranslation()
  const svgRef = useRef()
  const sectionRef = useRef()
  const [hoveredNode, setHoveredNode] = useState(null)
  const [animationComplete, setAnimationComplete] = useState(false)
  const [pulses, setPulses] = useState([])
  const pulseIdRef = useRef(0)
  const firePulseRef = useRef(null)
  const [pickedOrgs, setPickedOrgs] = useState([])
  const [orgSearchTerm, setOrgSearchTerm] = useState('')
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)
  const [detailLevel, setDetailLevel] = useState('normal')
  const [focusedNodeId, setFocusedNodeId] = useState(null)
  const favoritesInitRef = useRef(false)
  const [sectionVisible, setSectionVisible] = useState(false)
  const cacheRefreshedRef = useRef(false)

  // ── Favorites store ──
  const favorites = useFavoritesStore(s => s.favorites)
  const getFavoritesByType = useFavoritesStore(s => s.getFavoritesByType)

  const {
    data,
    selectedOrg,
    selectedLanguage,
    setFilter,
    collaborationDiscovery,
    networkMetrics,
    isDiscovering,
    isLoadingMetrics,
    discoverCollaboration,
    loadNetworkMetrics,
  } = useDashboardStore(
    useShallow(s => ({
      data: s.data,
      selectedOrg: s.selectedOrg,
      selectedLanguage: s.selectedLanguage,
      setFilter: s.setFilter,
      collaborationDiscovery: s.collaborationDiscovery,
      networkMetrics: s.networkMetrics,
      isDiscovering: s.isDiscovering,
      isLoadingMetrics: s.isLoadingMetrics,
      discoverCollaboration: s.discoverCollaboration,
      loadNetworkMetrics: s.loadNetworkMetrics,
    }))
  )

  // ── Available orgs (from collaboration discovery or base data) ──
  const availableOrgs = useMemo(() => {
    // Only use orgs from the collaboration graph (not the full DB collection)
    return (collaborationDiscovery?.graph?.nodes || [])
      .filter(n => n.type === 'org')
      .map(n => ({ login: n.login, name: n.name || n.login, avatarUrl: n.avatar_url }))
  }, [collaborationDiscovery])

  // ── Auto-load favorites on section entry (only after section is visible) ──
  useEffect(() => {
    if (!sectionVisible) return
    if (favoritesInitRef.current || pickedOrgs.length > 0) return
    const orgFavs = getFavoritesByType('organization')
    if (orgFavs.length >= 2) {
      const favLogins = orgFavs
        .map(f => f.id.replace(/^org_/, ''))
        .filter(login => availableOrgs.some(o => o.login === login))
      if (favLogins.length >= 2) {
        setPickedOrgs(favLogins)
        setAnimationComplete(false)
        setTimeout(() => setAnimationComplete(true), 350)
      }
    }
    favoritesInitRef.current = true
  }, [sectionVisible, favorites, availableOrgs, getFavoritesByType, pickedOrgs.length])

  // Ensure collaboration data is loaded (can pre-fetch)
  useEffect(() => {
    if (!collaborationDiscovery && !isDiscovering) {
      discoverCollaboration()
    }
  }, [collaborationDiscovery, isDiscovering, discoverCollaboration])

  // Auto-detect stale cache (missing enriched org fields) and force one refresh
  useEffect(() => {
    if (cacheRefreshedRef.current || !collaborationDiscovery?.available) return
    const orgNodes = (collaborationDiscovery.graph?.nodes || []).filter(n => n.type === 'org')
    // If any org node is missing the new enriched fields, cache is stale
    const isStale = orgNodes.length > 0 && orgNodes.every(n => n.graph_repos_count === undefined && !n.description && !n.location)
    if (isStale) {
      cacheRefreshedRef.current = true
      console.log('🔄 Cache stale: org nodes missing enriched fields, forcing refresh…')
      discoverCollaboration(true)
    } else {
      cacheRefreshedRef.current = true
    }
  }, [collaborationDiscovery, discoverCollaboration])

  // Load network metrics only when user has picked 2+ orgs (lazy)
  useEffect(() => {
    if (pickedOrgs.length >= 2 && !networkMetrics && !isLoadingMetrics && collaborationDiscovery?.available) {
      loadNetworkMetrics()
    }
  }, [pickedOrgs.length, networkMetrics, isLoadingMetrics, collaborationDiscovery, loadNetworkMetrics])

  // ── Build graph data ──
  const graphData = useMemo(
    () => buildCollaborationGraph(collaborationDiscovery, networkMetrics, pickedOrgs, detailLevel),
    [collaborationDiscovery, networkMetrics, pickedOrgs, detailLevel]
  )

  const { nodes, links, orgArcs, nodesMap, metrics: graphMetrics } = graphData

  // ── Toggle org selection ──
  const toggleOrg = useCallback((login) => {
    setPickedOrgs(prev =>
      prev.includes(login) ? prev.filter(l => l !== login) : [...prev, login]
    )
    setAnimationComplete(false)
    setTimeout(() => setAnimationComplete(true), 100)
  }, [])

  const selectAll = useCallback(() => {
    const allLogins = availableOrgs.map(o => o.login)
    const allSelected = allLogins.every(l => pickedOrgs.includes(l))
    setPickedOrgs(allSelected ? [] : allLogins)
    setAnimationComplete(false)
    setTimeout(() => setAnimationComplete(true), 100)
  }, [availableOrgs, pickedOrgs])

  const removeOrg = useCallback((login) => {
    setPickedOrgs(prev => prev.filter(l => l !== login))
    setAnimationComplete(false)
    setTimeout(() => setAnimationComplete(true), 100)
  }, [])

  // ── Ranked orgs by collaboration score (optimized: single-pass) ──
  const rankedOrgs = useMemo(() => {
    if (!collaborationDiscovery?.graph) return availableOrgs.map(o => ({ ...o, score: 0, isRecommended: false }))

    const allNodes = collaborationDiscovery.graph.nodes || []
    const allLinks = collaborationDiscovery.graph.links || []
    const bridgeUsers = collaborationDiscovery.bridge_users || {}

    // Index: repos by org, count per org
    const repoCountByOrg = new Map()
    const repoIdToOrg = new Map()
    for (const n of allNodes) {
      if (n.type === 'repo' && n.org) {
        repoCountByOrg.set(n.org, (repoCountByOrg.get(n.org) || 0) + 1)
        repoIdToOrg.set(n.id, n.org)
      }
    }

    // Single pass: count distinct contributors per org
    const contribByOrg = new Map()
    for (const link of allLinks) {
      if (link.type === 'contributed_to') {
        const repoId = link.source.startsWith('repo_') ? link.source : link.target
        const userId = link.source.startsWith('user_') ? link.source : link.target
        const org = repoIdToOrg.get(repoId)
        if (!org) continue
        if (!contribByOrg.has(org)) contribByOrg.set(org, new Set())
        contribByOrg.get(org).add(userId)
      } else if (link.type === 'entangled_with') {
        // Entangled links give big score
        const m1 = link.source.replace('org_', '')
        const m2 = link.target.replace('org_', '')
        // Will be counted in the score step
      }
    }

    // Count entangled links per org
    const entangledByOrg = new Map()
    for (const link of allLinks) {
      if (link.type === 'entangled_with') {
        const o1 = link.source.replace('org_', '')
        const o2 = link.target.replace('org_', '')
        entangledByOrg.set(o1, (entangledByOrg.get(o1) || 0) + 1)
        entangledByOrg.set(o2, (entangledByOrg.get(o2) || 0) + 1)
      }
    }

    // Count bridge users per org
    const bridgeByOrg = new Map()
    for (const bu of Object.values(bridgeUsers)) {
      for (const org of (bu.organizations || [])) {
        bridgeByOrg.set(org, (bridgeByOrg.get(org) || 0) + 1)
      }
    }

    const orgScores = new Map()
    for (const org of availableOrgs) {
      const score = (repoCountByOrg.get(org.login) || 0) * 2
        + (contribByOrg.get(org.login)?.size || 0) * 3
        + (bridgeByOrg.get(org.login) || 0) * 5
        + (entangledByOrg.get(org.login) || 0) * 8
      orgScores.set(org.login, score)
    }

    const sorted = [...availableOrgs].sort((a, b) => (orgScores.get(b.login) || 0) - (orgScores.get(a.login) || 0))
    return sorted.map((o, i) => ({
      ...o,
      score: orgScores.get(o.login) || 0,
      isRecommended: i < 5 && (orgScores.get(o.login) || 0) > 0,
    }))
  }, [availableOrgs, collaborationDiscovery])

  // ── Filtered orgs for dropdown ──
  const filteredDropdownOrgs = useMemo(() => {
    if (!orgSearchTerm.trim()) return rankedOrgs
    const term = orgSearchTerm.toLowerCase().trim()
    return rankedOrgs.filter(o =>
      o.login.toLowerCase().includes(term) ||
      o.name.toLowerCase().includes(term)
    )
  }, [rankedOrgs, orgSearchTerm])

  const recommendedOrgs = useMemo(() => filteredDropdownOrgs.filter(o => o.isRecommended), [filteredDropdownOrgs])
  const otherOrgs = useMemo(() => filteredDropdownOrgs.filter(o => !o.isRecommended), [filteredDropdownOrgs])

  // ── Close dropdown on click outside ──
  useEffect(() => {
    if (!isOrgDropdownOpen) return
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOrgDropdownOpen(false)
        setOrgSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOrgDropdownOpen])

  // ── Visibility: detect when section scrolls into view ──
  // Use rootMargin to trigger only when the section body (not just the header) enters viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setSectionVisible(true)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: '-80px 0px 0px 0px' }
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  // ── Focused-node neighbors (for click-to-highlight) ──
  const focusedNeighborIds = useMemo(() => {
    if (!focusedNodeId) return null
    const set = new Set([focusedNodeId])
    for (const link of links) {
      if (link.source === focusedNodeId) set.add(link.target)
      if (link.target === focusedNodeId) set.add(link.source)
    }
    return set
  }, [focusedNodeId, links])

  // ── Node click handler ──
  const handleNodeClick = useCallback((node) => {
    // Toggle focus on the node for click-to-highlight
    setFocusedNodeId(prev => {
      const newId = prev === node.id ? null : node.id
      // Fire a burst of pulses along the focused node's links
      if (newId) {
        for (let i = 0; i < 5; i++) {
          setTimeout(() => firePulseRef.current?.(), 80 + i * 120)
        }
      }
      return newId
    })
  }, [])

  // ── Load favorites into pickedOrgs ──
  const loadFromFavorites = useCallback(() => {
    const orgFavs = getFavoritesByType('organization')
    const favLogins = orgFavs
      .map(f => f.id.replace(/^org_/, ''))
      .filter(login => availableOrgs.some(o => o.login === login))
    if (favLogins.length >= 1) {
      setPickedOrgs(favLogins)
      setAnimationComplete(false)
      setFocusedNodeId(null)
      setTimeout(() => setAnimationComplete(true), 100)
    }
  }, [getFavoritesByType, availableOrgs])

  const favOrgCount = useMemo(() => {
    return getFavoritesByType('organization')
      .filter(f => availableOrgs.some(o => o.login === f.id.replace(/^org_/, '')))
      .length
  }, [favorites, getFavoritesByType, availableOrgs])

  // ── Curved path helper ──
  const createCurvePath = useCallback((source, target) => {
    const dx = target.x - source.x
    const dy = target.y - source.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 80) return `M ${source.x},${source.y} L ${target.x},${target.y}`
    const mx = (source.x + target.x) / 2
    const my = (source.y + target.y) / 2
    const pullFactor = 0.3
    const cx = mx + (CENTER_X - mx) * pullFactor
    const cy = my + (CENTER_Y - my) * pullFactor
    return `M ${source.x},${source.y} Q ${cx},${cy} ${target.x},${target.y}`
  }, [])

  // ── Pulse system ──
  const hoveredNodeRef = useRef(null)
  hoveredNodeRef.current = hoveredNode
  const focusedNodeIdRef = useRef(null)
  focusedNodeIdRef.current = focusedNodeId

  const firePulse = useCallback(() => {
    if (links.length === 0 || nodes.length === 0) return
    if (hoveredNodeRef.current) return

    // When a node is focused, only pulse along its connected links
    const fId = focusedNodeIdRef.current
    let candidateLinks = links
    if (fId) {
      candidateLinks = links.filter(l => l.source === fId || l.target === fId)
      if (candidateLinks.length === 0) return
    }

    const link = candidateLinks[Math.floor(Math.random() * candidateLinks.length)]
    const source = nodesMap?.get(link.source)
    const target = nodesMap?.get(link.target)
    if (!source || !target) return
    const reverse = Math.random() > 0.5
    const [from, to] = reverse ? [target, source] : [source, target]
    const id = pulseIdRef.current++
    const color = from._isBridge ? COLORS.bridge : COLORS[from.type] || '#fff'
    const curvePath = createCurvePath(from, to)
    const duration = 1.2 + Math.random() * 0.8
    setPulses(prev => [...prev, { id, path: curvePath, color, duration }])
    setTimeout(() => setPulses(prev => prev.filter(p => p.id !== id)), duration * 1000 + 100)
  }, [links, nodes, nodesMap, createCurvePath])

  firePulseRef.current = firePulse

  // Initial burst
  useEffect(() => {
    if (!animationComplete || nodes.length === 0) return
    const timers = []
    for (let i = 0; i < 12; i++) timers.push(setTimeout(() => firePulseRef.current?.(), 400 + i * 100))
    for (let i = 0; i < 8; i++) timers.push(setTimeout(() => firePulseRef.current?.(), 2000 + i * 120))
    return () => timers.forEach(clearTimeout)
  }, [animationComplete, nodes.length])

  // Ambient pulses
  useEffect(() => {
    if (!animationComplete || nodes.length === 0) return
    let active = true
    let timeoutId
    const scheduleNext = () => {
      if (!active) return
      const delay = 2500 + Math.random() * 4000
      timeoutId = setTimeout(() => {
        if (!active) return
        firePulseRef.current?.()
        if (Math.random() > 0.6) setTimeout(() => { if (active) firePulseRef.current?.() }, 200 + Math.random() * 400)
        scheduleNext()
      }, delay)
    }
    const startTimer = setTimeout(scheduleNext, 3000)
    return () => { active = false; clearTimeout(timeoutId); clearTimeout(startTimer) }
  }, [animationComplete, nodes.length])

  // ── Node color by type (users always green, discipline only in tooltip) ──
  const getNodeColor = useCallback((node, isHovered) => {
    if (isHovered) return COLORS.highlight
    if (node.type === 'org') return COLORS.org
    if (node.type === 'repo') return COLORS.repo
    if (node._isBridge) return COLORS.bridge
    return COLORS.user
  }, [])

  // ── Loading / no data states ──
  const isLoading = isDiscovering || isLoadingMetrics
  const hasNoCollaboration = collaborationDiscovery && !collaborationDiscovery.available

  // ═══════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <section ref={sectionRef} className={styles.graphSection}>
      <div className={styles.sectionHeader}>
        <div className={styles.headerLeft}>
          <h2 className={styles.sectionTitle}>🔗 {t('network.title')}</h2>
          <p className={styles.sectionSubtitle}>{t('network.subtitle')}</p>
        </div>
        <div className={styles.headerRight}>
          {/* Detail level toggle */}
          <div className={styles.detailToggle}>
            {Object.entries(DETAIL_LEVELS).map(([key, cfg]) => (
              <button
                key={key}
                className={`${styles.detailBtn} ${detailLevel === key ? styles.detailBtnActive : ''}`}
                onClick={() => { setDetailLevel(key); setAnimationComplete(false); setTimeout(() => setAnimationComplete(true), 100) }}
                title={`${t(`network.detail.${key}`)}: ${cfg.maxReposPerOrg} repos, ${cfg.maxSinglePerOrg} users`}
              >
                {t(`network.detail.${key}`)}
              </button>
            ))}
          </div>
          <div className={styles.legend}>
            <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: COLORS.org }} /><span>{t('network.legendOrgs')}</span></div>
            <div className={styles.legendItem}><svg width="10" height="10" viewBox="-5 -5 10 10"><polygon points="-4,-4.6 4,-4.6 5.2,0 4,4.6 -4,4.6 -5.2,0" fill={COLORS.repo} /></svg><span>{t('network.legendRepos')}</span></div>
            <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: COLORS.bridge }} /><span>{t('network.legendBridge')}</span></div>
            <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: COLORS.user }} /><span>{t('network.legendUsers')}</span></div>
          </div>
        </div>
      </div>

      {/* ─── Org Search Selector ─── */}
      {availableOrgs.length >= 2 && (
        <div className={styles.orgSelectorWrap} ref={dropdownRef}>
          <div className={styles.orgSelectorBar}>
            <div className={styles.orgSelectedChips}>
              {pickedOrgs.length === 0 && (
                <span className={styles.orgPlaceholderText}>{t('network.noOrgSelected')}</span>
              )}
              {pickedOrgs.slice(0, 5).map(login => {
                const org = availableOrgs.find(o => o.login === login)
                return (
                  <span key={login} className={styles.orgMiniChip}>
                    {org?.name || login}
                    <button className={styles.orgMiniChipRemove} onClick={() => removeOrg(login)}>✕</button>
                  </span>
                )
              })}
              {pickedOrgs.length > 5 && (
                <span className={styles.orgMiniChipMore}>+{pickedOrgs.length - 5} {t('network.more')}</span>
              )}
            </div>
            {/* Favorites auto-build button */}
            {favOrgCount >= 2 && (
              <button
                className={styles.orgFavoritesBtn}
                onClick={loadFromFavorites}
                title={t('network.loadFavOrgs', { count: favOrgCount })}
              >
                <FiStar size={13} />
                <span>{favOrgCount}</span>
              </button>
            )}
            <button
              className={`${styles.orgSearchToggle} ${isOrgDropdownOpen ? styles.orgSearchToggleActive : ''}`}
              onClick={() => {
                setIsOrgDropdownOpen(prev => !prev)
                if (!isOrgDropdownOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
              }}
            >
              <span className={styles.orgSearchIcon}><FiSearch /></span>
              <span>{pickedOrgs.length}/{availableOrgs.length}</span>
            </button>
          </div>

          {isOrgDropdownOpen && (
            <div className={styles.orgDropdown}>
              <div className={styles.orgDropdownHeader}>
                <input
                  ref={searchInputRef}
                  type="text"
                  className={styles.orgSearchInput}
                  placeholder={t('network.searchOrg')}
                  value={orgSearchTerm}
                  onChange={e => setOrgSearchTerm(e.target.value)}
                  autoFocus
                />
                <button className={styles.selectAllBtn} onClick={selectAll}>
                  {pickedOrgs.length === availableOrgs.length ? t('network.selectNone') : t('network.selectAll')}
                </button>
              </div>

              <div className={styles.orgDropdownList}>
                {recommendedOrgs.length > 0 && (
                  <>
                    <div className={styles.orgDropdownSection}>⭐ {t('network.recommended')}</div>
                    {recommendedOrgs.map(org => {
                      const isActive = pickedOrgs.includes(org.login)
                      return (
                        <button
                          key={org.login}
                          className={`${styles.orgDropdownItem} ${isActive ? styles.orgDropdownItemActive : ''}`}
                          onClick={() => toggleOrg(org.login)}
                        >
                          <span className={styles.orgDropdownCheck}>{isActive ? '✓' : ''}</span>
                          <span className={styles.orgDropdownName}>{org.name}</span>
                          <span className={styles.orgDropdownBadge}>⭐</span>
                        </button>
                      )
                    })}
                  </>
                )}
                {otherOrgs.length > 0 && (
                  <>
                    {recommendedOrgs.length > 0 && <div className={styles.orgDropdownDivider} />}
                    <div className={styles.orgDropdownSection}>{t('network.otherOrgs')}</div>
                    {otherOrgs.map(org => {
                      const isActive = pickedOrgs.includes(org.login)
                      return (
                        <button
                          key={org.login}
                          className={`${styles.orgDropdownItem} ${isActive ? styles.orgDropdownItemActive : ''}`}
                          onClick={() => toggleOrg(org.login)}
                        >
                          <span className={styles.orgDropdownCheck}>{isActive ? '✓' : ''}</span>
                          <span className={styles.orgDropdownName}>{org.name}</span>
                        </button>
                      )
                    })}
                  </>
                )}
                {filteredDropdownOrgs.length === 0 && (
                  <div className={styles.orgDropdownEmpty}>{t('network.noResults', { term: orgSearchTerm })}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.graphContainer}>
        <div className={styles.badgesRow}>
          <FilterBadge value={selectedOrg} label={t('network.organization')} onClear={() => setFilter('org', selectedOrg)} />
          <FilterBadge value={selectedLanguage} label={t('network.language')} onClear={() => setFilter('language', selectedLanguage)} />
        </div>

        {/* Loading */}
        {isLoading && nodes.length === 0 && (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingSpinner} />
            <span className={styles.loadingText}>{t('network.analyzing')}</span>
          </div>
        )}

        {/* No collaboration */}
        {hasNoCollaboration && (
          <div className={styles.noData}>
            <span className={styles.noDataIcon}><FiTarget size={42} /></span>
            <p className={styles.noDataText}>
              {t('network.noCollaboration')}
            </p>
          </div>
        )}

        {/* Placeholder: < 2 orgs selected */}
        {!isLoading && !hasNoCollaboration && pickedOrgs.length < 2 && collaborationDiscovery?.available && (
          <div className={styles.placeholder}>
            <span className={styles.placeholderIcon}><FiGlobe size={42} /></span>
            <p className={styles.placeholderText}>
              {t('network.selectTwoOrMore')}
            </p>
            <span className={styles.placeholderHint}>{t('network.useSelectorsAbove')}</span>
          </div>
        )}

        {/* THE GRAPH — only render after section is visible */}
        {sectionVisible && nodes.length > 0 && (
          <>
          <div className={`${styles.svgWrapper} ${animationComplete ? styles.svgVisible : styles.svgHidden}`}>
            <svg ref={svgRef} viewBox={`0 0 ${SVG_W} ${SVG_H}`} className={styles.circularGraph}>
              <defs>
                <filter id="glow2" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="1.2" result="coloredBlur"/>
                  <feColorMatrix in="coloredBlur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.4 0" result="dimBlur"/>
                  <feMerge><feMergeNode in="dimBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="glowStrong2" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feColorMatrix in="coloredBlur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.6 0" result="dimBlur"/>
                  <feMerge><feMergeNode in="dimBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="tooltipShadow2" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.5)"/>
                </filter>
                <filter id="pulseGlow2" x="-200%" y="-200%" width="500%" height="500%">
                  <feGaussianBlur stdDeviation="3" result="g1"/>
                  <feColorMatrix in="g1" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" result="g1dim"/>
                  <feMerge><feMergeNode in="g1dim"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="nucleusGlow2" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="4" result="nucBlur"/>
                  <feColorMatrix in="nucBlur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" result="nucDim"/>
                  <feMerge><feMergeNode in="nucDim"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>

              {/* ─── NUCLEUS ─── */}
              <g className={styles.atomicNucleus}>
                <circle cx={CENTER_X} cy={CENTER_Y} r="45" fill="none" stroke="rgba(0,212,228,0.06)" strokeWidth="1" className={styles.nucleusHalo} />
                <ellipse cx={CENTER_X} cy={CENTER_Y} rx="55" ry="22" fill="none" stroke="rgba(0,212,228,0.15)" strokeWidth="0.8" strokeDasharray="3 5" className={styles.orbit} style={{ animationDuration: '12s' }} />
                <ellipse cx={CENTER_X} cy={CENTER_Y} rx="55" ry="22" fill="none" stroke="rgba(157,111,219,0.15)" strokeWidth="0.8" strokeDasharray="3 5" className={styles.orbit} style={{ animationDuration: '16s', transform: 'rotate(60deg)', transformOrigin: `${CENTER_X}px ${CENTER_Y}px` }} />
                <ellipse cx={CENTER_X} cy={CENTER_Y} rx="55" ry="22" fill="none" stroke="rgba(0,255,159,0.12)" strokeWidth="0.8" strokeDasharray="3 5" className={styles.orbit} style={{ animationDuration: '20s', transform: 'rotate(120deg)', transformOrigin: `${CENTER_X}px ${CENTER_Y}px` }} />
                <circle r="3" fill="#00D4E4" filter="url(#nucleusGlow2)" className={styles.electron}>
                  <animateMotion dur="12s" repeatCount="indefinite" path={`M ${CENTER_X+55},${CENTER_Y} A 55,22 0 1,1 ${CENTER_X-55},${CENTER_Y} A 55,22 0 1,1 ${CENTER_X+55},${CENTER_Y}`} />
                </circle>
                <circle r="2.5" fill="#9D6FDB" filter="url(#nucleusGlow2)" className={styles.electron}>
                  <animateMotion dur="16s" repeatCount="indefinite" path={`M ${CENTER_X+49.5},${CENTER_Y+27} A 55,22 60 1,1 ${CENTER_X-49.5},${CENTER_Y-27} A 55,22 60 1,1 ${CENTER_X+49.5},${CENTER_Y+27}`} />
                </circle>
                <circle r="2" fill="#00ff9f" filter="url(#nucleusGlow2)" className={styles.electron}>
                  <animateMotion dur="20s" repeatCount="indefinite" path={`M ${CENTER_X-49.5},${CENTER_Y+27} A 55,22 120 1,1 ${CENTER_X+49.5},${CENTER_Y-27} A 55,22 120 1,1 ${CENTER_X-49.5},${CENTER_Y+27}`} />
                </circle>
                <circle cx={CENTER_X} cy={CENTER_Y} r="5" fill="rgba(0,212,228,0.4)" filter="url(#nucleusGlow2)" className={styles.nucleusCore} />
                <circle cx={CENTER_X} cy={CENTER_Y} r="2.5" fill="rgba(255,255,255,0.6)" />
              </g>

              {/* ─── ORBIT GUIDE RINGS ─── */}
              <g>
                <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS} fill="none" stroke="rgba(189,0,255,0.12)" strokeWidth="0.6" strokeDasharray="4 8" />
                <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS * 0.55} fill="none" stroke="rgba(0,255,159,0.10)" strokeWidth="0.6" strokeDasharray="4 8" />
                <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS * 0.38} fill="none" stroke="rgba(255,189,0,0.10)" strokeWidth="0.6" strokeDasharray="3 6" />
              </g>

              {/* ─── SECTOR WEDGES ─── */}
              {orgArcs.map((arc, i) => {
                const outerR = RADIUS + 15
                const innerR2 = 55
                const x1o = CENTER_X + outerR * Math.cos(arc.arcStart)
                const y1o = CENTER_Y + outerR * Math.sin(arc.arcStart)
                const x2o = CENTER_X + outerR * Math.cos(arc.arcEnd)
                const y2o = CENTER_Y + outerR * Math.sin(arc.arcEnd)
                const x2i = CENTER_X + innerR2 * Math.cos(arc.arcEnd)
                const y2i = CENTER_Y + innerR2 * Math.sin(arc.arcEnd)
                const x1i = CENTER_X + innerR2 * Math.cos(arc.arcStart)
                const y1i = CENTER_Y + innerR2 * Math.sin(arc.arcStart)
                const largeArc = (arc.arcEnd - arc.arcStart) > Math.PI ? 1 : 0
                const d = [
                  `M ${x1o} ${y1o}`,
                  `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
                  `L ${x2i} ${y2i}`,
                  `A ${innerR2} ${innerR2} 0 ${largeArc} 0 ${x1i} ${y1i}`,
                  'Z'
                ].join(' ')
                return (
                  <path key={`sector-${i}`} d={d} fill={arc.sectorColor} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                )
              })}

              {/* ─── ORG ARC LABELS + SECTOR DIVIDERS ─── */}
              {orgArcs.map((arc, i) => {
                const labelR = RADIUS + 50
                const lx = CENTER_X + labelR * Math.cos(arc.arcMid)
                const ly = CENTER_Y + labelR * Math.sin(arc.arcMid)
                const orgObj = availableOrgs.find(o => o.login === arc.orgLogin)
                // Sector divider line at arc start
                const divColor = arc.sectorColor.replace('0.04', '0.15')
                return (
                  <g key={`arc-${i}`}>
                    <line
                      x1={CENTER_X + 55 * Math.cos(arc.arcStart)}
                      y1={CENTER_Y + 55 * Math.sin(arc.arcStart)}
                      x2={CENTER_X + (RADIUS + 15) * Math.cos(arc.arcStart)}
                      y2={CENTER_Y + (RADIUS + 15) * Math.sin(arc.arcStart)}
                      stroke={divColor}
                      strokeWidth="0.8"
                      strokeDasharray="3 5"
                    />
                    <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className={styles.orgArcLabel}>
                      {orgObj?.name || arc.orgLogin}
                    </text>
                  </g>
                )
              })}

              {/* ─── LINKS ─── */}
              <g className={styles.linksGroup}>
                {links.map((link, index) => {
                  const source = nodesMap?.get(link.source)
                  const target = nodesMap?.get(link.target)
                  if (!source || !target) return null
                  const isHoverHL = hoveredNode?.id === source.id || hoveredNode?.id === target.id
                  const isFocusHL = focusedNodeId && (source.id === focusedNodeId || target.id === focusedNodeId)
                  const isHighlighted = isHoverHL || isFocusHL
                  const isFocusRelevant = !focusedNeighborIds || (focusedNeighborIds.has(source.id) && focusedNeighborIds.has(target.id))
                  const dimOpacity = focusedNeighborIds && !isFocusRelevant ? 0.08 : 1

                  if (link.type === 'entangled_with') {
                    return (
                      <line
                        key={`link-${index}`}
                        x1={source.x} y1={source.y}
                        x2={target.x} y2={target.y}
                        stroke={isHighlighted ? COLORS.linkHover : COLORS.linkEntangled}
                        strokeWidth={isHighlighted ? 2 : 1 + (link.strength || 1) * 0.2}
                        className={styles.linkEntangled}
                        style={{ animationDelay: `${index * 0.02}s`, opacity: dimOpacity }}
                      />
                    )
                  }

                  const strokeColor = isHighlighted
                    ? COLORS.linkHover
                    : link.type === 'owns' ? COLORS.linkOwns : COLORS.linkContrib

                  return (
                    <path
                      key={`link-${index}`}
                      d={createCurvePath(source, target)}
                      stroke={strokeColor}
                      strokeWidth={isHighlighted ? 1.5 : 0.6}
                      fill="none"
                      filter={isHighlighted ? 'url(#glow2)' : undefined}
                      className={`${styles.link} ${animationComplete ? styles.animate : ''} ${isHighlighted ? styles.highlighted : ''}`}
                      style={{ animationDelay: `${index * 0.01}s`, opacity: dimOpacity }}
                    />
                  )
                })}
              </g>

              {/* ─── NODES ─── */}
              <g className={styles.nodesGroup}>
                {nodes.map((node, index) => {
                  const isHovered = hoveredNode?.id === node.id
                  const isFocused = focusedNodeId === node.id
                  const isFocusRelevant = !focusedNeighborIds || focusedNeighborIds.has(node.id)
                  const color = getNodeColor(node, isHovered)
                  const size = Math.max(node.size || 5, 3)
                  const dimOpacity = focusedNeighborIds && !isFocusRelevant ? 0.12 : (isHovered ? 1 : 0.9)
                  return (
                    <g
                      key={node.id}
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onClick={() => handleNodeClick(node)}
                      className={`${styles.node} ${animationComplete ? styles.animate : ''}`}
                      style={{ animationDelay: `${index * 0.025}s`, cursor: 'pointer' }}
                    >
                      {node._isBridge && (
                        <circle cx={node.x} cy={node.y} r={size + 3} fill="none" stroke={COLORS.bridge} strokeWidth="1" strokeDasharray="2 3" opacity={dimOpacity * 0.5} />
                      )}
                      {node.type === 'repo' ? (
                        <>
                          <path d={hexagonPath(node.x, node.y, isFocused ? size + 1 : size)} fill={color} filter={isHovered || isFocused ? 'url(#glowStrong2)' : 'url(#glow2)'} opacity={dimOpacity} className={styles.nodeCircle} />
                          {(isHovered || isFocused) && (
                            <path d={hexagonPath(node.x, node.y, size + 4)} fill="none" stroke={color} strokeWidth={isFocused ? 2 : 1.5} className={styles.nodeRing} />
                          )}
                        </>
                      ) : (
                        <>
                          <circle cx={node.x} cy={node.y} r={isFocused ? size + 1 : size} fill={color} filter={isHovered || isFocused ? 'url(#glowStrong2)' : 'url(#glow2)'} opacity={dimOpacity} className={styles.nodeCircle} />
                          {(isHovered || isFocused) && (
                            <circle cx={node.x} cy={node.y} r={size + 4} fill="none" stroke={color} strokeWidth={isFocused ? 2 : 1.5} className={styles.nodeRing} />
                          )}
                        </>
                      )}
                    </g>
                  )
                })}
              </g>

              {/* ─── PULSES ─── */}
              <g className={`${styles.pulsesGroup} ${hoveredNode ? styles.pulsesHidden : ''}`}>
                {pulses.map(pulse => (
                  <g key={pulse.id} className={styles.pulseWrapper}>
                    <path d={pulse.path} fill="none" stroke={pulse.color} strokeWidth={1.5} filter="url(#pulseGlow2)" className={styles.pulseTrail} style={{ animationDuration: `${pulse.duration}s` }} />
                    <circle r="2.5" fill={pulse.color} filter="url(#pulseGlow2)" className={styles.pulseDot} style={{ animationDuration: `${pulse.duration}s` }}>
                      <animateMotion dur={`${pulse.duration}s`} fill="freeze" path={pulse.path} calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" />
                    </circle>
                  </g>
                ))}
              </g>

              {/* ─── TOOLTIP removed from SVG — now HTML overlay below ─── */}
            </svg>

            {/* ─── FOCUS INDICATOR BAR ─── */}
            {focusedNodeId && (() => {
              const fNode = nodesMap?.get(focusedNodeId)
              if (!fNode) return null
              const neighborCount = focusedNeighborIds ? focusedNeighborIds.size - 1 : 0
              const fColor = getNodeColor(fNode, false)
              return (
                <div className={styles.focusBar} style={{ borderColor: `${fColor}60` }}>
                  <span className={styles.focusBarDot} style={{ background: fColor }} />
                  <span className={styles.focusBarText}>
                    <strong style={{ color: fColor }}>{fNode.label || fNode.login || fNode.id}</strong>
                    {' · '}{neighborCount} {neighborCount === 1 ? t('network.connection') : t('network.connections')}
                  </span>
                  <button className={styles.focusBarClose} onClick={() => setFocusedNodeId(null)}>
                    <FiX size={13} /> {t('network.removeFocus')}
                  </button>
                </div>
              )
            })()}

            {/* ─── HTML TOOLTIP OVERLAY ─── */}
            {hoveredNode && svgRef.current && (() => {
              const node = hoveredNode
              const nodeColor = getNodeColor(node, false)
              const m = node._metrics || {}

              // Convert SVG viewBox coords → pixel coords relative to wrapper
              const svgEl = svgRef.current
              const svgRect = svgEl.getBoundingClientRect()
              const scaleX = svgRect.width / SVG_W
              const scaleY = svgRect.height / SVG_H
              const px = node.x * scaleX
              const py = node.y * scaleY

              // Estimate tooltip height based on node type
              const estH = node.type === 'org' ? 280 : node.type === 'user' ? 200 : 160
              // Determine if tooltip would clip at edges
              const fitsAbove = py > estH + 18
              const nearLeft = px < 140
              const nearRight = px > (svgRect.width - 140)

              let tx = 'translateX(-50%)'
              let ty = fitsAbove ? 'translateY(calc(-100% - 14px))' : 'translateY(18px)'
              if (nearLeft) tx = 'translateX(-12px)'
              else if (nearRight) tx = 'translateX(calc(-100% + 12px))'

              const tooltipStyle = {
                position: 'absolute',
                left: `${px}px`,
                top: `${py}px`,
                transform: `${tx} ${ty}`,
                zIndex: 50,
                pointerEvents: 'none',
              }

              return (
                <div style={tooltipStyle} className={styles.nodeTooltip}>
                  <div className={styles.ntBar} style={{ background: nodeColor }} />

                  {/* ── HEADER ── */}
                  <div className={styles.ntHeader}>
                    {(node.type === 'user' || node.type === 'org') && node.avatar_url && (
                      <img src={node.avatar_url} alt="" className={styles.ntAvatar} />
                    )}
                    <div>
                      <div className={styles.ntName} style={{ color: nodeColor }}>
                        {node.name || node.full_name || node.login || node.id}
                      </div>
                      {node.login && node.name && (
                        <div className={styles.ntHandle}>@{node.login}</div>
                      )}
                    </div>
                    {node._isBridge && (
                      <span className={styles.ntBadge} style={{ background: `${COLORS.bridge}22`, color: COLORS.bridge }}>
                        <FiGitMerge size={10} style={{ marginRight: 3 }} /> Bridge
                      </span>
                    )}
                    {node.type === 'org' && (
                      <span className={styles.ntBadge} style={{ background: `${COLORS.org}22`, color: COLORS.org }}>
                        <FiGlobe size={10} style={{ marginRight: 3 }} /> Org
                      </span>
                    )}
                  </div>

                  {/* ── DESCRIPTION ── */}
                  {node.description && (
                    <div className={styles.ntDesc}>
                      {node.description.length > 80 ? node.description.slice(0, 80) + '…' : node.description}
                    </div>
                  )}

                  {/* ── STATS: USER ── */}
                  {node.type === 'user' && (
                    <div className={styles.ntStats}>
                      {node._isBridge && node._connectedOrgs?.length > 0 && (
                        <div className={styles.ntStatRow}>
                          <span><FiLink2 size={11} className={styles.ntIcon} /> {t('network.connects')}</span>
                          <strong style={{ color: COLORS.bridge }}>{node._connectedOrgs.length} orgs</strong>
                        </div>
                      )}
                      {!node._isBridge && node.repos_count > 0 && (
                        <div className={styles.ntStatRow}>
                          <span><FiPackage size={11} className={styles.ntIcon} /> {t('network.repositories')}</span>
                          <strong style={{ color: '#bd00ff' }}>{node.repos_count.toLocaleString()}</strong>
                        </div>
                      )}
                      {m.collab_centrality > 0 && (
                        <div className={styles.ntStatRow}>
                          <span><FiBarChart2 size={11} className={styles.ntIcon} /> {t('network.centrality')}</span>
                          <strong style={{ color: '#00D4E4' }}>
                            {Math.round(m.collab_centrality)}%
                          </strong>
                        </div>
                      )}
                      {m.collab_connectivity_raw > 0 && (
                        <div className={styles.ntStatRow}>
                          <span><FiGitBranch size={11} className={styles.ntIcon} /> {t('network.activeRepos')}</span>
                          <strong style={{ color: '#00ff9f' }}>{m.collab_connectivity_raw}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── TAGS: USER ── */}
                  {node.type === 'user' && (m.discipline_label || m.bus_factor_risk) && (
                    <div className={styles.ntTags}>
                      {m.discipline_label && (() => {
                        const discColor = m.discipline_color || '#c4a0f8'
                        const isMulti = m.discipline === 'multidisciplinary'
                        const topColors = m.discipline_top_colors || []
                        return (
                          <span
                            className={styles.ntTag}
                            style={isMulti && topColors.length >= 2
                              ? { background: `linear-gradient(135deg, ${topColors[0]}22, ${topColors[1]}22)`, color: '#e0e0ff' }
                              : { background: `${discColor}22`, color: discColor }
                            }
                          >
                            <FiCompass size={10} className={styles.ntIcon} /> {m.discipline_label}
                            {isMulti && topColors.length >= 2 && (
                              <span className={styles.ntMultiDots}>
                                {topColors.slice(0, 3).map((c, i) => (
                                  <span key={i} className={styles.ntDot} style={{ background: c }} />
                                ))}
                              </span>
                            )}
                          </span>
                        )
                      })()}
                      {m.bus_factor_risk && (
                        <span className={styles.ntTag} style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>
                          <FiAlertTriangle size={10} className={styles.ntIcon} /> Bus factor: {m.bus_factor_risk}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ── STATS: REPO ── */}
                  {node.type === 'repo' && (
                    <div className={styles.ntStats}>
                      {node.language && (
                        <div className={styles.ntStatRow}>
                          <span><FiCode size={11} className={styles.ntIcon} /> {t('network.language')}</span>
                          <span className={styles.ntLangBadge}>{node.language}</span>
                        </div>
                      )}
                      {(node.stars != null && node.stars > 0) && (
                        <div className={styles.ntStatRow}>
                          <span><FiStar size={11} className={styles.ntIcon} /> {t('network.stars')}</span>
                          <strong style={{ color: '#F59E0B' }}>{node.stars.toLocaleString()}</strong>
                        </div>
                      )}
                      {node.forks > 0 && (
                        <div className={styles.ntStatRow}>
                          <span><FiGitBranch size={11} className={styles.ntIcon} /> {t('network.forks')}</span>
                          <strong style={{ color: '#9D6FDB' }}>{node.forks.toLocaleString()}</strong>
                        </div>
                      )}
                      {node.org && (
                        <div className={styles.ntStatRow}>
                          <span><FiGlobe size={11} className={styles.ntIcon} /> {t('network.organization')}</span>
                          <strong style={{ color: COLORS.org }}>{node.org}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── STATS: ORG ── */}
                  {node.type === 'org' && (
                    <>
                      {/* Badges row */}
                      {(node.is_verified || node.is_quantum_focused || node.location) && (
                        <div className={styles.ntTags}>
                          {node.is_verified && (
                            <span className={styles.ntTag} style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>
                              <FiCheckCircle size={10} className={styles.ntIcon} /> {t('network.verified')}
                            </span>
                          )}
                          {node.is_quantum_focused && (
                            <span className={styles.ntTag} style={{ background: 'rgba(255,60,172,0.15)', color: '#FF3CAC' }}>
                              <FiZap size={10} className={styles.ntIcon} /> {t('network.quantumFocused')}
                            </span>
                          )}
                          {node.location && (
                            <span className={styles.ntTag} style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}>
                              <FiMapPin size={10} className={styles.ntIcon} /> {node.location.length > 25 ? node.location.slice(0, 25) + '…' : node.location}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Graph-level stats (collaboration context) */}
                      <div className={styles.ntStats}>
                        {node.graph_repos_count > 0 && (
                          <div className={styles.ntStatRow}>
                            <span><FiPackage size={11} className={styles.ntIcon} /> {t('network.reposInGraph')}</span>
                            <strong style={{ color: '#bd00ff' }}>{node.graph_repos_count}</strong>
                          </div>
                        )}
                        {node.graph_contributors_count > 0 && (
                          <div className={styles.ntStatRow}>
                            <span><FiUsers size={11} className={styles.ntIcon} /> {t('network.contributors')}</span>
                            <strong style={{ color: '#00ff9f' }}>{node.graph_contributors_count}</strong>
                          </div>
                        )}
                        {node.graph_bridge_count > 0 && (
                          <div className={styles.ntStatRow}>
                            <span><FiGitMerge size={11} className={styles.ntIcon} /> {t('network.bridgeUsersLabel')}</span>
                            <strong style={{ color: COLORS.bridge }}>{node.graph_bridge_count}</strong>
                          </div>
                        )}
                      </div>

                      {/* Separator + Institutional stats */}
                      {(node.total_repos_count > 0 || node.members_count > 0 || node.quantum_focus_score > 0 || node.total_stars > 0) && (
                        <>
                          <div className={styles.ntDivider} />
                          <div className={styles.ntStats}>
                            {node.quantum_focus_score > 0 && (
                              <div className={styles.ntStatRow}>
                                <span><FiTarget size={11} className={styles.ntIcon} /> {t('network.quantumFocus')}</span>
                                <strong style={{ color: '#FF3CAC' }}>{Math.round(node.quantum_focus_score)}%</strong>
                              </div>
                            )}
                            {node.quantum_repos_count > 0 && (
                              <div className={styles.ntStatRow}>
                                <span><FiCompass size={11} className={styles.ntIcon} /> {t('network.quantumRepos')}</span>
                                <strong style={{ color: '#00D4E4' }}>{node.quantum_repos_count}{node.total_repos_count > 0 ? <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/{node.total_repos_count}</span> : ''}</strong>
                              </div>
                            )}
                            {!node.quantum_repos_count && node.total_repos_count > 0 && (
                              <div className={styles.ntStatRow}>
                                <span><FiPackage size={11} className={styles.ntIcon} /> {t('network.totalRepos')}</span>
                                <strong style={{ color: '#bd00ff' }}>{node.total_repos_count.toLocaleString()}</strong>
                              </div>
                            )}
                            {node.members_count > 0 && (
                              <div className={styles.ntStatRow}>
                                <span><FiUsers size={11} className={styles.ntIcon} /> {t('network.members')}</span>
                                <strong style={{ color: '#00ff9f' }}>{node.members_count.toLocaleString()}</strong>
                              </div>
                            )}
                            {node.total_stars > 0 && (
                              <div className={styles.ntStatRow}>
                                <span><FiStar size={11} className={styles.ntIcon} /> {t('network.stars')}</span>
                                <strong style={{ color: '#F59E0B' }}>{node.total_stars.toLocaleString()}</strong>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* Top languages */}
                      {Array.isArray(node.top_languages) && node.top_languages.length > 0 && (
                        <div className={styles.ntLangs}>
                          {node.top_languages.slice(0, 4).map((lang, i) => {
                            const langName = typeof lang === 'string' ? lang : lang?.name
                            if (!langName) return null
                            return (
                              <span key={i} className={styles.ntLangBadge}>{langName}</span>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {/* ── FOOTER ── */}
                  <div className={styles.ntFooter}>
                    {node.type === 'org' && t('network.clickToFocus')}
                    {node.type === 'repo' && t('network.clickToFocus')}
                    {node.type === 'user' && (node._isBridge ? t('network.bridgeUserHint') : t('network.collaborator'))}
                  </div>
                </div>
              )
            })()}

          </div>

            {/* ─── METRICS SUMMARY BAR ─── */}
            {graphMetrics && (
              <div className={`${styles.metricsBar} ${animationComplete ? styles.metricsVisible : styles.metricsHidden}`}>
                <div className={styles.metricItem}>
                  <span className={styles.metricValue}>{graphMetrics.bridgeCount}{graphMetrics.totalBridgeAll > graphMetrics.bridgeCount ? <span className={styles.metricTotal}>/{graphMetrics.totalBridgeAll}</span> : ''}</span>
                  <span className={styles.metricLabel}>{t('network.bridgeUsersMetric')}</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricValue}>{graphMetrics.totalUsers}{graphMetrics.totalUsersAll > graphMetrics.totalUsers ? <span className={styles.metricTotal}>/{graphMetrics.totalUsersAll}</span> : ''}</span>
                  <span className={styles.metricLabel}>{t('network.collaborators')}</span>
                </div>
                <div className={styles.metricItem}>
                  <span className={styles.metricValue}>{graphMetrics.totalRepos}{graphMetrics.totalReposAll > graphMetrics.totalRepos ? <span className={styles.metricTotal}>/{graphMetrics.totalReposAll}</span> : ''}</span>
                  <span className={styles.metricLabel}>{t('network.repositories')}</span>
                </div>
                {graphMetrics.avgCentrality > 0 && (
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>{graphMetrics.avgCentrality > 1 ? graphMetrics.avgCentrality.toFixed(1) : (graphMetrics.avgCentrality * 100).toFixed(0) + '%'}</span>
                    <span className={styles.metricLabel}>{t('network.avgCentrality')}</span>
                  </div>
                )}
                {graphMetrics.isTruncated && (
                  <div className={styles.truncationHint}>
                    {t('network.truncationHint')}
                  </div>
                )}
              </div>
            )}
        </>
        )}
      </div>
    </section>
  )
}

