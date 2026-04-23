/**
 * CONTRIBUTOR SANKEY - Flujo de Contribuidores entre Organizaciones
 * =================================================================
 * 
 * Usa `collaborationDiscovery` del store (endpoint /discover) que analiza
 * TODA la base de datos — no solo los 40 users del graph.
 * 
 * Cada bridge user tiene la lista de repos donde contribuye (con owner),
 * lo que permite reconstruir flujos org↔org reales.
 * 
 * Flujo de datos:
 *   store.collaborationDiscovery.bridge_users → extraer owner de cada repo
 *   → agrupar por par de orgs → calcular grosor por nº de bridge users compartidos
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useDashboardStore } from '../../store/dashboardStore'
import styles from './ContributorSankey.module.css'

/**
 * Paleta consistente con ChartsSection del Design System ENTANGLE.
 */
const COLOR_PALETTE = [
  '#00D4E4',   // Cyan
  '#9D6FDB',   // Purple
  '#00ff9f',   // Green
  '#F97316',   // Orange
  '#3B82F6',   // Blue
  '#EC4899',   // Pink
  '#ffbd00',   // Gold
  '#06d6a0',   // Teal
  '#ef476f',   // Red-pink
  '#118ab2',   // Deep cyan
  '#ffd166',   // Light gold
  '#7209b7',   // Deep purple
  '#f77f00',   // Dark orange
  '#4ecdc4',   // Mint
  '#e76f51',   // Coral
]

/**
 * Detect sibling orgs (same parent entity, e.g. qiskit / qiskit-community).
 */
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

export default function ContributorSankey() {
  const { t } = useTranslation()
  const collaborationDiscovery = useDashboardStore(s => s.collaborationDiscovery)
  const isDiscovering = useDashboardStore(s => s.isDiscovering)
  const dataSource = useDashboardStore(s => s.dataSource)
  // Fallback: datos del graph (data) para modo mock
  const data = useDashboardStore(s => s.data)

  const containerRef = useRef(null)
  const [hoveredFlow, setHoveredFlow] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.15 }
    )
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  /**
   * Construye flujos org↔org a partir de los bridge users del discover endpoint.
   * Cada bridge user tiene `repos: ["org/repo-name", ...]` y `cross_org: bool`.
   * Extraemos el owner de cada repo para mapear a qué orgs contribuye.
   */
  const { flows, orgStats, maxContributions, orgColorMap, displayOrgs } = useMemo(() => {
    // ─── Fuente de bridge users ───
    const bridgeUsers = collaborationDiscovery?.bridge_users || []
    
    // En modo mock sin discover, calcular desde data
    if (bridgeUsers.length === 0 && dataSource === 'mock') {
      return computeFromMockData(data)
    }
    
    if (bridgeUsers.length === 0) {
      return { flows: [], orgStats: {}, maxContributions: 0, orgColorMap: {}, displayOrgs: [] }
    }

    // 1. Para cada bridge user, extraer las orgs de sus repos
    const orgSet = new Set()
    const userOrgMap = [] // { user, orgs: Set<orgLogin> }

    bridgeUsers.forEach(bu => {
      const repos = bu.repos || []
      const userOrgs = new Set()
      repos.forEach(fullName => {
        // full_name = "owner/repo-name"
        const owner = fullName.split('/')[0]
        if (owner) {
          userOrgs.add(owner)
          orgSet.add(owner)
        }
      })
      if (userOrgs.size >= 2) {
        userOrgMap.push({ user: bu, orgs: userOrgs })
      }
    })

    const orgLogins = [...orgSet].sort((a, b) => a.localeCompare(b))

    // 2. Inicializar stats por org
    const stats = {}
    orgLogins.forEach(login => {
      stats[login] = { totalUsers: 0, bridgeUsers: 0, name: login }
    })

    // Buscar nombres de orgs en el discover graph nodes
    const discoverNodes = collaborationDiscovery?.graph?.nodes || []
    discoverNodes.forEach(n => {
      if (n.type === 'org' && stats[n.login]) {
        stats[n.login].name = n.name || n.login
      }
    })

    // 3. Calcular flujos entre pares de orgs (excluyendo sibling orgs)
    const flowMap = {}
    for (let i = 0; i < orgLogins.length; i++) {
      for (let j = i + 1; j < orgLogins.length; j++) {
        if (_areSiblingOrgs(orgLogins[i], orgLogins[j])) continue
        const [a, b] = [orgLogins[i], orgLogins[j]].sort((a, b) => a.localeCompare(b))
        const key = `${a}-${b}`
        flowMap[key] = { source: a, target: b, users: [], totalContributions: 0 }
      }
    }

    userOrgMap.forEach(({ user, orgs }) => {
      const orgArr = [...orgs]
      orgArr.forEach(o => {
        if (stats[o]) stats[o].bridgeUsers++
      })

      for (let i = 0; i < orgArr.length; i++) {
        for (let j = i + 1; j < orgArr.length; j++) {
          const [a, b] = [orgArr[i], orgArr[j]].sort((a, b) => a.localeCompare(b))
          const key = `${a}-${b}`
          if (flowMap[key]) {
            flowMap[key].users.push({
              login: user.login,
              name: user.name || user.login,
              contributions: user.repos_count || 0,
              expertise: user.quantum_expertise_score || 0,
              avatar: user.avatar_url,
            })
            flowMap[key].totalContributions += user.repos_count || 1
          }
        }
      }
    })

    // 4. Filtrar y ordenar flujos con datos
    const flowList = Object.values(flowMap)
      .filter(f => f.users.length > 0)
      .sort((a, b) => b.users.length - a.users.length)

    const maxC = Math.max(...flowList.map(f => f.users.length), 1)

    // 5. Solo orgs con flujos
    const involved = new Set()
    flowList.forEach(f => { involved.add(f.source); involved.add(f.target) })
    const display = [...involved].sort((a, b) => a.localeCompare(b))

    // 6. Colores dinámicos
    const colors = {}
    display.forEach((login, i) => {
      const c = COLOR_PALETTE[i % COLOR_PALETTE.length]
      colors[login] = { color: c, muted: `${c}20` }
    })

    return {
      flows: flowList,
      orgStats: stats,
      maxContributions: maxC,
      orgColorMap: colors,
      displayOrgs: display,
    }
  }, [collaborationDiscovery, dataSource, data])

  // ─── Loading state ───
  if (isDiscovering) {
    return (
      <div className={`${styles.container} ${styles.visible}`}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t('sankey.title')}</h3>
        </div>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>⟳</div>
          <p className={styles.emptyText}>{t('sankey.loading')}</p>
        </div>
      </div>
    )
  }

  // ─── No data at all ───
  if (!collaborationDiscovery && dataSource === 'backend') return null

  // === SVG LAYOUT DINÁMICO ===
  const width = 900
  const nodeWidth = 28
  const nodeHeight = 50
  const nodeGapY = 25

  // Layout dos columnas
  const leftOrgs = displayOrgs.filter((_, i) => i % 2 === 0)
  const rightOrgs = displayOrgs.filter((_, i) => i % 2 !== 0)

  const maxColumn = Math.max(leftOrgs.length, rightOrgs.length, 1)
  const height = Math.max(340, maxColumn * (nodeHeight + nodeGapY) + 80)

  const leftX = 150
  const rightX = width - 150

  const orgPositions = {}

  const leftTotalH = leftOrgs.length * nodeHeight + (leftOrgs.length - 1) * nodeGapY
  const leftStartY = (height - leftTotalH) / 2
  leftOrgs.forEach((login, i) => {
    orgPositions[login] = {
      x: leftX - nodeWidth / 2,
      y: leftStartY + i * (nodeHeight + nodeGapY),
      height: nodeHeight,
      side: 'left',
    }
  })

  const rightTotalH = rightOrgs.length * nodeHeight + (rightOrgs.length - 1) * nodeGapY
  const rightStartY = (height - rightTotalH) / 2
  rightOrgs.forEach((login, i) => {
    orgPositions[login] = {
      x: rightX - nodeWidth / 2,
      y: rightStartY + i * (nodeHeight + nodeGapY),
      height: nodeHeight,
      side: 'right',
    }
  })

  /** Genera path SVG curvo para un flujo entre dos orgs */
  const generateFlowPath = (sourceOrg, targetOrg, thickness) => {
    const s = orgPositions[sourceOrg]
    const t = orgPositions[targetOrg]
    if (!s || !t) return ''

    const half = thickness / 2
    const sx = s.side === 'left' ? s.x + nodeWidth : s.x
    const sy = s.y + s.height / 2
    const tx = t.side === 'left' ? t.x + nodeWidth : t.x
    const ty = t.y + t.height / 2

    let cpx1, cpx2
    if (s.side !== t.side) {
      cpx1 = sx + (tx - sx) * 0.35
      cpx2 = sx + (tx - sx) * 0.65
    } else {
      const midX = width / 2
      const dir = s.side === 'left' ? 1 : -1
      cpx1 = sx + dir * Math.abs(midX - sx) * 0.7
      cpx2 = tx + dir * Math.abs(midX - tx) * 0.7
    }

    return `
      M ${sx} ${sy - half}
      C ${cpx1} ${sy - half}, ${cpx2} ${ty - half}, ${tx} ${ty - half}
      L ${tx} ${ty + half}
      C ${cpx2} ${ty + half}, ${cpx1} ${sy + half}, ${sx} ${sy + half}
      Z
    `
  }

  const handleFlowHover = (flow, e) => {
    setHoveredFlow(`${flow.source}-${flow.target}`)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10,
        flow,
      })
    }
  }

  const handleFlowLeave = () => {
    setHoveredFlow(null)
    setTooltip(null)
  }

  const minThickness = 4
  const maxThickness = 30

  // Deduplicate bridge users count
  const uniqueBridgeLogins = new Set()
  flows.forEach(f => f.users.forEach(u => uniqueBridgeLogins.add(u.login)))

  // Métricas totales del discover
  const discoverMetrics = collaborationDiscovery?.metrics || {}

  return (
    <div ref={containerRef} className={`${styles.container} ${isVisible ? styles.visible : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{t('sankey.title')}</h3>
          <span className={styles.badge}>
            {t('sankey.badge', { count: uniqueBridgeLogins.size })}
          </span>
        </div>
        <p className={styles.subtitle}>
          {t('sankey.subtitle')}
          {discoverMetrics.total_bridge_users_found > 0 && (
            <> — {discoverMetrics.total_bridge_users_found} {t('sankey.detail')} {discoverMetrics.total_users_mapped?.toLocaleString()} {t('sankey.contributors')}</>
          )}
        </p>
      </div>

      {flows.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>⟷</div>
          <p className={styles.emptyText}>
            {t('sankey.empty')}
          </p>
          {discoverMetrics.total_bridge_users_found > 0 && (
            <p className={styles.emptyDetail}>
              {t('sankey.emptyDetail', { count: discoverMetrics.total_bridge_users_found })}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* SVG Sankey */}
          <div className={styles.svgWrapper}>
            <svg viewBox={`0 0 ${width} ${height}`} className={styles.svg}>
              <defs>
                {flows.map(flow => {
                  const id = `flow-grad-${flow.source}-${flow.target}`
                  const sc = orgColorMap[flow.source]?.color || '#00D4E4'
                  const tc = orgColorMap[flow.target]?.color || '#9D6FDB'
                  const sPos = orgPositions[flow.source]
                  const tPos = orgPositions[flow.target]
                  return (
                    <linearGradient
                      key={id}
                      id={id}
                      x1={sPos?.side === 'left' ? '0%' : '100%'}
                      x2={tPos?.side === 'left' ? '0%' : '100%'}
                    >
                      <stop offset="0%" stopColor={sc} stopOpacity="0.55" />
                      <stop offset="100%" stopColor={tc} stopOpacity="0.55" />
                    </linearGradient>
                  )
                })}
                <filter id="sankey-glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Flows */}
              {flows.map((flow, i) => {
                const ratio = flow.users.length / maxContributions
                const thickness = minThickness + ratio * (maxThickness - minThickness)
                const flowKey = `${flow.source}-${flow.target}`
                const isHovered = hoveredFlow === flowKey
                const isOtherHovered = hoveredFlow && hoveredFlow !== flowKey

                return (
                  <g key={flowKey}>
                    <path
                      d={generateFlowPath(flow.source, flow.target, thickness)}
                      fill={`url(#flow-grad-${flow.source}-${flow.target})`}
                      className={`${styles.flowPath} ${isHovered ? styles.flowHovered : ''} ${isOtherHovered ? styles.flowDimmed : ''}`}
                      style={{ animationDelay: `${i * 150}ms` }}
                      onMouseMove={(e) => handleFlowHover(flow, e)}
                      onMouseLeave={handleFlowLeave}
                    />
                    {(() => {
                      const s = orgPositions[flow.source]
                      const t = orgPositions[flow.target]
                      if (!s || !t) return null
                      const mx = (s.x + t.x + nodeWidth) / 2
                      const my = (s.y + s.height / 2 + t.y + t.height / 2) / 2
                      return (
                        <text
                          x={mx}
                          y={my}
                          className={`${styles.flowLabel} ${isOtherHovered ? styles.flowDimmed : ''}`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {flow.users.length}
                        </text>
                      )
                    })()}
                  </g>
                )
              })}

              {/* Org nodes */}
              {displayOrgs.map((login) => {
                const pos = orgPositions[login]
                if (!pos) return null
                const color = orgColorMap[login]?.color || '#00D4E4'
                const muted = orgColorMap[login]?.muted || 'rgba(0,212,228,0.12)'
                const stat = orgStats[login]
                const isInvolved = !hoveredFlow || hoveredFlow.includes(login)
                const orgName = stat?.name || login
                const displayName = orgName.length > 18 ? orgName.substring(0, 16) + '…' : orgName

                return (
                  <g key={login} className={isInvolved ? '' : styles.flowDimmed}>
                    <rect
                      x={pos.x}
                      y={pos.y}
                      width={nodeWidth}
                      height={pos.height}
                      rx={6}
                      fill={muted}
                      stroke={color}
                      strokeWidth={2}
                      className={styles.orgNode}
                    />
                    <text
                      x={pos.side === 'left' ? pos.x - 12 : pos.x + nodeWidth + 12}
                      y={pos.y + pos.height / 2}
                      textAnchor={pos.side === 'left' ? 'end' : 'start'}
                      dominantBaseline="middle"
                      className={styles.orgLabel}
                      fill={color}
                    >
                      {displayName}
                    </text>
                    <text
                      x={pos.side === 'left' ? pos.x - 12 : pos.x + nodeWidth + 12}
                      y={pos.y + pos.height / 2 + 16}
                      textAnchor={pos.side === 'left' ? 'end' : 'start'}
                      dominantBaseline="middle"
                      className={styles.orgStats}
                    >
                      {stat?.bridgeUsers || 0} bridge users
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          {/* Tooltip */}
          {tooltip && (
            <div
              className={styles.tooltip}
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <div className={styles.tooltipHeader}>
                <span style={{ color: orgColorMap[tooltip.flow.source]?.color }}>
                  {orgStats[tooltip.flow.source]?.name || tooltip.flow.source}
                </span>
                {' ↔ '}
                <span style={{ color: orgColorMap[tooltip.flow.target]?.color }}>
                  {orgStats[tooltip.flow.target]?.name || tooltip.flow.target}
                </span>
              </div>
              <div className={styles.tooltipMeta}>
                {tooltip.flow.users.length} {t('sankey.sharedUsers')}
              </div>
              <div className={styles.tooltipUsers}>
                {tooltip.flow.users.slice(0, 10).map(u => (
                  <div key={u.login} className={styles.tooltipUser}>
                    <span className={styles.tooltipUserName}>{u.name}</span>
                    <span className={styles.tooltipUserContrib}>
                      {u.contributions} repos · {u.expertise.toFixed(0)} exp
                    </span>
                  </div>
                ))}
                {tooltip.flow.users.length > 10 && (
                  <div className={styles.tooltipUser}>
                    <span className={styles.tooltipUserName} style={{ color: 'var(--color-text-muted)' }}>
                      +{tooltip.flow.users.length - 10} más…
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className={styles.legend} role="list">
            {flows.slice(0, 10).map(flow => (
              <div
                key={`${flow.source}-${flow.target}`}
                className={`${styles.legendItem} ${hoveredFlow === `${flow.source}-${flow.target}` ? styles.legendActive : ''}`}
                role="listitem"
                onMouseEnter={() => setHoveredFlow(`${flow.source}-${flow.target}`)}
                onMouseLeave={() => setHoveredFlow(null)}
                onFocus={() => setHoveredFlow(`${flow.source}-${flow.target}`)}
                onBlur={() => setHoveredFlow(null)}
              >
                <div className={styles.legendColors}>
                  <span className={styles.legendDot} style={{ background: orgColorMap[flow.source]?.color }} />
                  <span className={styles.legendArrow}>↔</span>
                  <span className={styles.legendDot} style={{ background: orgColorMap[flow.target]?.color }} />
                </div>
                <span className={styles.legendText}>
                  {flow.users.length} {flow.users.length === 1 ? t('sankey.user') : t('sankey.users')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Fallback: Calcula bridge users desde mockData (que sí tiene user.organizations).
 * Solo se usa cuando dataSource === 'mock' y no hay collaborationDiscovery.
 */
function computeFromMockData(data) {
  const { organizations = [], users = [], repositories = [] } = data || {}
  if (organizations.length === 0 || users.length === 0) {
    return { flows: [], orgStats: {}, maxContributions: 0, orgColorMap: {}, displayOrgs: [] }
  }

  const orgLoginSet = new Set(organizations.map(o => o.login))
  const orgLogins = [...orgLoginSet]

  const stats = {}
  organizations.forEach(o => {
    stats[o.login] = { totalUsers: 0, bridgeUsers: 0, name: o.name || o.login }
  })

  const flowMap = {}
  for (let i = 0; i < orgLogins.length; i++) {
    for (let j = i + 1; j < orgLogins.length; j++) {
      const [a, b] = [orgLogins[i], orgLogins[j]].sort((a, b) => a.localeCompare(b))
      flowMap[`${a}-${b}`] = { source: a, target: b, users: [], totalContributions: 0 }
    }
  }

  // Membresía + contribuciones
  const userContribOrgs = new Map()
  repositories.forEach(repo => {
    const repoOrg = repo.organization?.login || repo.owner?.login
    if (!repoOrg || !orgLoginSet.has(repoOrg)) return
    ;(repo.collaborators || []).forEach(c => {
      if (!c.login) return
      if (!userContribOrgs.has(c.login)) userContribOrgs.set(c.login, new Set())
      userContribOrgs.get(c.login).add(repoOrg)
    })
  })

  users.forEach(user => {
    const memberOrgs = (user.organizations || [])
      .map(o => typeof o === 'string' ? o : o?.login)
      .filter(o => o && orgLoginSet.has(o))
    const contribOrgs = userContribOrgs.get(user.login) || new Set()
    const allOrgs = [...new Set([...memberOrgs, ...contribOrgs])]

    allOrgs.forEach(o => { if (stats[o]) stats[o].totalUsers++ })

    if (allOrgs.length >= 2) {
      allOrgs.forEach(o => { if (stats[o]) stats[o].bridgeUsers++ })
      const score = user.contributions_to_quantum || user.quantum_expertise_score || 0
      for (let i = 0; i < allOrgs.length; i++) {
        for (let j = i + 1; j < allOrgs.length; j++) {
          const [a, b] = [allOrgs[i], allOrgs[j]].sort((a, b) => a.localeCompare(b))
          const key = `${a}-${b}`
          if (flowMap[key]) {
            flowMap[key].users.push({
              login: user.login,
              name: user.name || user.login,
              contributions: score,
              expertise: user.quantum_expertise_score || 0,
              avatar: user.avatar_url,
            })
            flowMap[key].totalContributions += score
          }
        }
      }
    }
  })

  const flowList = Object.values(flowMap)
    .filter(f => f.users.length > 0)
    .sort((a, b) => b.users.length - a.users.length)

  const maxC = Math.max(...flowList.map(f => f.users.length), 1)

  const involved = new Set()
  flowList.forEach(f => { involved.add(f.source); involved.add(f.target) })
  const display = [...involved].sort((a, b) => a.localeCompare(b))

  const colors = {}
  display.forEach((login, i) => {
    const c = COLOR_PALETTE[i % COLOR_PALETTE.length]
    colors[login] = { color: c, muted: `${c}20` }
  })

  return { flows: flowList, orgStats: stats, maxContributions: maxC, orgColorMap: colors, displayOrgs: display }
}
