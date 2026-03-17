/**
 * BRIDGE USERS TABLE — Usuarios Puente entre Organizaciones
 * ===========================================================
 * 
 * Muestra los usuarios que contribuyen a repos de múltiples organizaciones.
 * Usa `collaborationDiscovery.bridge_users` del store (endpoint /discover)
 * que analiza TODA la base de datos para detectar contribuidores compartidos.
 * 
 * Fallback: en modo mock, calcula bridge users desde `useEnrichedData`.
 */

import { useMemo, useState, useRef, useEffect, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useDashboardStore } from '../../store/dashboardStore'
import { useEnrichedData } from '../../hooks/useEnrichedData'
import styles from './BridgeUsersTable.module.css'

const COLOR_PALETTE = [
  '#00D4E4', '#9D6FDB', '#00ff9f', '#F97316', '#3B82F6',
  '#EC4899', '#ffbd00', '#06d6a0', '#ef476f', '#118ab2',
  '#ffd166', '#7209b7', '#f77f00', '#4ecdc4', '#e76f51',
]

export default function BridgeUsersTable() {
  const { t } = useTranslation()
  const collaborationDiscovery = useDashboardStore(s => s.collaborationDiscovery)
  const dataSource = useDashboardStore(s => s.dataSource)
  const enriched = useEnrichedData()

  const containerRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const [expandedUser, setExpandedUser] = useState(null)
  const [sortField, setSortField] = useState('repos_count')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.1 }
    )
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  /** Construye lista de bridge users con orgs y repos */
  const { bridgeUsers, orgColorMap, summary } = useMemo(() => {
    // ─── Fuente: collaborationDiscovery (backend completo) ───
    const discoverBridge = collaborationDiscovery?.bridge_users || []

    if (discoverBridge.length > 0) {
      const orgSet = new Set()
      const users = discoverBridge
        .filter(bu => bu.repos_count >= 2)
        .map(bu => {
          const repos = bu.repos || []
          const userOrgs = new Set()
          repos.forEach(fullName => {
            const owner = fullName.split('/')[0]
            if (owner) { userOrgs.add(owner); orgSet.add(owner) }
          })
          return {
            login: bu.login,
            name: bu.name || bu.login,
            avatar_url: bu.avatar_url,
            expertise: bu.quantum_expertise_score || 0,
            repos_count: bu.repos_count || repos.length,
            orgs: [...userOrgs],
            repos: repos.map(fn => {
              const [owner, ...rest] = fn.split('/')
              return { org: owner, name: rest.join('/'), full_name: fn }
            }),
            cross_org: bu.cross_org || userOrgs.size >= 2,
          }
        })
        .filter(u => u.orgs.length >= 2)

      const allOrgs = [...orgSet].sort()
      const colors = {}
      allOrgs.forEach((o, i) => {
        colors[o] = COLOR_PALETTE[i % COLOR_PALETTE.length]
      })

      return {
        bridgeUsers: users,
        orgColorMap: colors,
        summary: {
          totalBridge: users.length,
          totalOrgs: allOrgs.length,
          crossOrg: users.filter(u => u.cross_org).length,
          avgRepos: users.length > 0 ? (users.reduce((s, u) => s + u.repos_count, 0) / users.length).toFixed(1) : 0,
        },
      }
    }

    // ─── Fallback: modo mock con useEnrichedData ───
    if (dataSource === 'mock') {
      return computeFromEnriched(enriched)
    }

    return { bridgeUsers: [], orgColorMap: {}, summary: { totalBridge: 0, totalOrgs: 0, crossOrg: 0, avgRepos: 0 } }
  }, [collaborationDiscovery, dataSource, enriched])

  // Sorting
  const sortedUsers = useMemo(() => {
    return [...bridgeUsers].sort((a, b) => {
      let va, vb
      switch (sortField) {
        case 'name': va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break
        case 'orgs': va = a.orgs.length; vb = b.orgs.length; break
        case 'repos_count': va = a.repos_count; vb = b.repos_count; break
        case 'expertise': va = a.expertise; vb = b.expertise; break
        default: va = a.repos_count; vb = b.repos_count
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }, [bridgeUsers, sortField, sortDir])

  const maxContrib = Math.max(...bridgeUsers.map(u => u.repos_count), 1)
  const maxExpertise = Math.max(...bridgeUsers.map(u => u.expertise), 1)

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortArrow = ({ field }) => {
    if (sortField !== field) return null
    return <span className={styles.sortArrow}>{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  if (bridgeUsers.length === 0) return null

  return (
    <div ref={containerRef} className={`${styles.container} ${isVisible ? styles.visible : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{t('bridge.title')}</h3>
          <span className={styles.badge}>
            {t('bridge.badge', { count: summary.totalBridge })}
          </span>
        </div>
        <p className={styles.subtitle}>
          {t('bridge.subtitle')}
        </p>
      </div>

      {/* Summary */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{summary.totalBridge}</span>
          <span className={styles.summaryLabel}>{t('bridge.statBridge')}</span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{summary.totalOrgs}</span>
          <span className={styles.summaryLabel}>{t('bridge.statOrgs')}</span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{summary.crossOrg}</span>
          <span className={styles.summaryLabel}>{t('bridge.statCrossOrg')}</span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.summaryValue}>{summary.avgRepos}</span>
          <span className={styles.summaryLabel}>{t('bridge.statReposUser')}</span>
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={`${styles.th} ${sortField === 'name' ? styles.thActive : ''}`} onClick={() => handleSort('name')}>
                {t('bridge.colUser')} <SortArrow field="name" />
              </th>
              <th className={`${styles.th} ${sortField === 'orgs' ? styles.thActive : ''}`} onClick={() => handleSort('orgs')}>
                {t('bridge.colOrgs')} <SortArrow field="orgs" />
              </th>
              <th className={`${styles.th} ${sortField === 'repos_count' ? styles.thActive : ''}`} onClick={() => handleSort('repos_count')}>
                {t('bridge.colRepos')} <SortArrow field="repos_count" />
              </th>
              <th className={`${styles.th} ${sortField === 'expertise' ? styles.thActive : ''}`} onClick={() => handleSort('expertise')}>
                {t('bridge.colExpertise')} <SortArrow field="expertise" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.slice(0, 30).map((user, i) => (
              <Fragment key={user.login}>
                <tr
                  className={`${styles.row} ${expandedUser === user.login ? styles.rowExpanded : ''}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                  onClick={() => setExpandedUser(expandedUser === user.login ? null : user.login)}
                >
                  {/* User */}
                  <td className={styles.td}>
                    <div className={styles.userCell}>
                      {user.avatar_url && (
                        <img src={user.avatar_url} alt={user.login} className={styles.avatar} loading="lazy" />
                      )}
                      <div className={styles.userInfo}>
                        <span className={styles.userName}>{user.name}</span>
                        <span className={styles.userLogin}>@{user.login}</span>
                      </div>
                    </div>
                  </td>
                  {/* Orgs */}
                  <td className={styles.td}>
                    <div className={styles.orgBadges}>
                      {user.orgs.slice(0, 5).map(org => (
                        <span
                          key={org}
                          className={styles.orgBadge}
                          style={{
                            color: orgColorMap[org] || '#00D4E4',
                            borderColor: `${orgColorMap[org] || '#00D4E4'}40`,
                            background: `${orgColorMap[org] || '#00D4E4'}12`,
                          }}
                        >
                          {org.length > 12 ? org.substring(0, 10) + '…' : org}
                        </span>
                      ))}
                      {user.orgs.length > 5 && (
                        <span className={styles.orgBadge} style={{ color: '#fff6', borderColor: '#fff2' }}>
                          +{user.orgs.length - 5}
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Repos bar */}
                  <td className={styles.td}>
                    <div className={styles.barCell}>
                      <div className={styles.barTrack}>
                        <div
                          className={styles.barFill}
                          style={{ width: `${(user.repos_count / maxContrib) * 100}%` }}
                        />
                      </div>
                      <span className={styles.barValue}>{user.repos_count}</span>
                    </div>
                  </td>
                  {/* Expertise ring */}
                  <td className={styles.td}>
                    <div className={styles.expertiseCell}>
                      <div className={styles.expertiseRing}>
                        <svg viewBox="0 0 36 36" className={styles.expertiseSvg}>
                          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                          <circle
                            cx="18" cy="18" r="15" fill="none"
                            stroke="#ffbd00"
                            strokeWidth="3"
                            strokeDasharray={`${(user.expertise / maxExpertise) * 94.2} 94.2`}
                            strokeLinecap="round"
                            transform="rotate(-90 18 18)"
                            style={{ transition: 'stroke-dasharray 1s ease' }}
                          />
                        </svg>
                        <span className={styles.expertiseValue}>
                          {user.expertise.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>

                {/* Expanded detail */}
                {expandedUser === user.login && (
                  <tr className={styles.detailRow}>
                    <td colSpan={4} className={styles.td}>
                      <div className={styles.detailContent}>
                        <div className={styles.detailGrid}>
                          {user.repos.slice(0, 12).map(repo => (
                            <div key={repo.full_name} className={styles.detailRepo}>
                              <div className={styles.detailRepoHeader}>
                                <span className={styles.detailRepoOrg} style={{ color: orgColorMap[repo.org] || '#00D4E4' }}>
                                  {repo.org}/
                                </span>
                                <span className={styles.detailRepoName}>{repo.name}</span>
                              </div>
                            </div>
                          ))}
                          {user.repos.length > 12 && (
                            <div className={styles.detailRepo}>
                              <span className={styles.detailRepoName} style={{ color: 'var(--color-text-muted)' }}>
                                +{user.repos.length - 12} {t('bridge.moreRepos')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Fallback para modo mock */
function computeFromEnriched(enriched) {
  const { organizations = [], users = [], repositories = [] } = enriched
  if (organizations.length === 0 || users.length === 0) {
    return { bridgeUsers: [], orgColorMap: {}, summary: { totalBridge: 0, totalOrgs: 0, crossOrg: 0, avgRepos: 0 } }
  }

  const orgLoginSet = new Set(organizations.map(o => o.login))

  const userRepoOrgs = new Map()
  repositories.forEach(repo => {
    const repoOrg = repo.organization?.login || repo.owner?.login
    if (!repoOrg || !orgLoginSet.has(repoOrg)) return
    ;(repo.collaborators || []).forEach(c => {
      if (!c.login) return
      if (!userRepoOrgs.has(c.login)) userRepoOrgs.set(c.login, { orgs: new Set(), repos: [] })
      const entry = userRepoOrgs.get(c.login)
      entry.orgs.add(repoOrg)
      entry.repos.push({ org: repoOrg, name: repo.name, full_name: repo.full_name || `${repoOrg}/${repo.name}` })
    })
  })

  users.forEach(u => {
    const memberOrgs = (u.organizations || [])
      .map(o => typeof o === 'string' ? o : o?.login)
      .filter(o => o && orgLoginSet.has(o))
    if (memberOrgs.length > 0) {
      if (!userRepoOrgs.has(u.login)) userRepoOrgs.set(u.login, { orgs: new Set(), repos: [] })
      memberOrgs.forEach(o => userRepoOrgs.get(u.login).orgs.add(o))
    }
  })

  const bridgeUsers = []
  const allOrgs = new Set()

  for (const [login, data] of userRepoOrgs) {
    if (data.orgs.size < 2) continue
    const user = users.find(u => u.login === login)
    const orgs = [...data.orgs]
    orgs.forEach(o => allOrgs.add(o))
    bridgeUsers.push({
      login,
      name: user?.name || login,
      avatar_url: user?.avatar_url,
      expertise: user?.quantum_expertise_score || 0,
      repos_count: data.repos.length || orgs.length,
      orgs,
      repos: data.repos,
      cross_org: true,
    })
  }

  const sortedOrgs = [...allOrgs].sort()
  const colors = {}
  sortedOrgs.forEach((o, i) => { colors[o] = COLOR_PALETTE[i % COLOR_PALETTE.length] })

  return {
    bridgeUsers,
    orgColorMap: colors,
    summary: {
      totalBridge: bridgeUsers.length,
      totalOrgs: sortedOrgs.length,
      crossOrg: bridgeUsers.length,
      avgRepos: bridgeUsers.length > 0 ? (bridgeUsers.reduce((s, u) => s + u.repos_count, 0) / bridgeUsers.length).toFixed(1) : 0,
    },
  }
}
