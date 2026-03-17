/**
 * ORG COMPARISON RADAR — Comparativa de Organizaciones
 * =====================================================
 * 
 * RadarChart (Recharts) que compara métricas normalizadas de las top organizaciones.
 * Toggle buttons para seleccionar qué orgs mostrar.
 * Tabla de métricas debajo con highlighting del mejor en cada categoría.
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts'
import { useEnrichedData } from '../../hooks/useEnrichedData'
import styles from './OrgComparisonRadar.module.css'

const COLOR_PALETTE = [
  '#00D4E4', '#9D6FDB', '#00ff9f', '#F97316', '#3B82F6',
  '#EC4899', '#ffbd00', '#06d6a0', '#ef476f', '#118ab2',
  '#ffd166', '#7209b7', '#f77f00', '#4ecdc4', '#e76f51',
]

const RADAR_METRICS = [
  { key: 'quantum_focus_score', label: 'Focus Score', shortLabel: 'Focus' },
  { key: 'quantum_repos_count', label: 'Repos Quantum', shortLabel: 'Repos' },
  { key: 'total_stars', label: 'Total Stars', shortLabel: 'Stars' },
  { key: 'quantum_contributors_count', label: 'Contributors', shortLabel: 'Contrib.' },
  { key: 'total_repositories_count', label: 'Total Repos', shortLabel: 'Total' },
]

export default function OrgComparisonRadar() {
  const { t } = useTranslation()
  const enriched = useEnrichedData()
  const containerRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const [activeOrgs, setActiveOrgs] = useState(new Set())

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.1 }
    )
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const { topOrgs, radarData, orgColorMap, metricsTable } = useMemo(() => {
    const orgs = (enriched.organizations || [])
      .filter(o => o.login)
      .sort((a, b) => (b.quantum_focus_score || 0) - (a.quantum_focus_score || 0))
      .slice(0, 8)

    if (orgs.length === 0) {
      return { topOrgs: [], radarData: [], orgColorMap: {}, metricsTable: [] }
    }

    // Colores
    const colors = {}
    orgs.forEach((o, i) => { colors[o.login] = COLOR_PALETTE[i % COLOR_PALETTE.length] })

    // Normalizar valores 0-100
    const maxValues = {}
    RADAR_METRICS.forEach(m => {
      maxValues[m.key] = Math.max(...orgs.map(o => o[m.key] || 0), 1)
    })

    const data = RADAR_METRICS.map(m => {
      const point = { metric: m.shortLabel, fullLabel: m.label }
      orgs.forEach(o => {
        const raw = o[m.key] || 0
        point[o.login] = Math.round((raw / maxValues[m.key]) * 100)
        point[`${o.login}_raw`] = raw
      })
      return point
    })

    // Tabla métricas
    const table = RADAR_METRICS.map(m => {
      const row = { metric: m.label, key: m.key }
      let bestVal = -1, bestOrg = ''
      orgs.forEach(o => {
        const val = o[m.key] || 0
        row[o.login] = val
        if (val > bestVal) { bestVal = val; bestOrg = o.login }
      })
      row.best = bestOrg
      return row
    })

    return { topOrgs: orgs, radarData: data, orgColorMap: colors, metricsTable: table }
  }, [enriched.organizations])

  // Activar top 3 por defecto
  useEffect(() => {
    if (topOrgs.length > 0 && activeOrgs.size === 0) {
      setActiveOrgs(new Set(topOrgs.slice(0, 3).map(o => o.login)))
    }
  }, [topOrgs])

  const toggleOrg = (login) => {
    setActiveOrgs(prev => {
      const next = new Set(prev)
      if (next.has(login)) { next.delete(login) } else { next.add(login) }
      return next
    })
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className={styles.radarTooltip}>
        <div className={styles.radarTooltipLabel}>{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} className={styles.radarTooltipRow}>
            <span className={styles.radarTooltipDot} style={{ background: p.color }} />
            <span className={styles.radarTooltipOrg}>{p.dataKey}</span>
            <span className={styles.radarTooltipValue}>{p.value}</span>
          </div>
        ))}
      </div>
    )
  }

  if (topOrgs.length === 0) return null

  return (
    <div ref={containerRef} className={`${styles.container} ${isVisible ? styles.visible : ''}`}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{t('radar.title')}</h3>
        </div>
        <p className={styles.subtitle}>
          {t('radar.subtitle')}
        </p>
      </div>

      {/* Org toggle buttons */}
      <div className={styles.orgToggles}>
        {topOrgs.map(org => (
          <button
            key={org.login}
            className={`${styles.toggleBtn} ${activeOrgs.has(org.login) ? styles.toggleActive : ''}`}
            style={{
              '--org-color': orgColorMap[org.login],
              borderColor: activeOrgs.has(org.login) ? orgColorMap[org.login] : 'transparent',
              background: activeOrgs.has(org.login) ? `${orgColorMap[org.login]}18` : 'rgba(255,255,255,0.03)',
              color: activeOrgs.has(org.login) ? orgColorMap[org.login] : 'rgba(255,255,255,0.4)',
            }}
            onClick={() => toggleOrg(org.login)}
          >
            {org.login}
          </button>
        ))}
      </div>

      {/* Radar Chart */}
      <div className={styles.chartWrapper}>
        <ResponsiveContainer width="100%" height={340}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
              axisLine={false}
            />
            {topOrgs.filter(o => activeOrgs.has(o.login)).map(org => (
              <Radar
                key={org.login}
                name={org.login}
                dataKey={org.login}
                stroke={orgColorMap[org.login]}
                fill={orgColorMap[org.login]}
                fillOpacity={0.12}
                strokeWidth={2}
                dot={{ r: 3, fill: orgColorMap[org.login] }}
              />
            ))}
            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Metrics Table */}
      <div className={styles.metricsTable}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.metricTh}>{t('radar.metricLabel')}</th>
              {topOrgs.filter(o => activeOrgs.has(o.login)).map(org => (
                <th
                  key={org.login}
                  className={styles.metricTh}
                  style={{ color: orgColorMap[org.login] }}
                >
                  {org.login}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricsTable.map(row => (
              <tr key={row.key} className={styles.metricRow}>
                <td className={styles.metricName}>{row.metric}</td>
                {topOrgs.filter(o => activeOrgs.has(o.login)).map(org => (
                  <td
                    key={org.login}
                    className={`${styles.metricValue} ${row.best === org.login ? styles.metricBest : ''}`}
                  >
                    {typeof row[org.login] === 'number' ?
                      Number.isInteger(row[org.login]) ? row[org.login].toLocaleString() : row[org.login].toFixed(2)
                      : '–'}
                    {row.best === org.login && <span className={styles.bestIcon}>★</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
