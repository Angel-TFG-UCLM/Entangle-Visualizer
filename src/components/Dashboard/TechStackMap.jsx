/**
 * TECH STACK MAP — Mapa de Tecnologías por Organización
 * ======================================================
 * 
 * Grid de tarjetas de lenguajes con barras comparativas por organización.
 * Análisis de convergencia (lenguajes universales vs exclusivos).
 * Usa `useEnrichedData` para obtener orgs y repos enriquecidos.
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEnrichedData } from '../../hooks/useEnrichedData'
import styles from './TechStackMap.module.css'

const COLOR_PALETTE = [
  '#00D4E4', '#9D6FDB', '#00ff9f', '#F97316', '#3B82F6',
  '#EC4899', '#ffbd00', '#06d6a0', '#ef476f', '#118ab2',
  '#ffd166', '#7209b7', '#f77f00', '#4ecdc4', '#e76f51',
]

const LANG_COLORS = {
  'Python': '#3572A5',
  'JavaScript': '#f1e05a',
  'TypeScript': '#3178c6',
  'C++': '#f34b7d',
  'C': '#555555',
  'Rust': '#dea584',
  'Julia': '#a270ba',
  'Go': '#00ADD8',
  'Java': '#b07219',
  'C#': '#178600',
  'Jupyter Notebook': '#DA5B0B',
  'Qiskit': '#6929C4',
  'Q#': '#fed659',
  'OpenQASM': '#AA70FF',
  'Shell': '#89e051',
  'HTML': '#e34c26',
  'CSS': '#563d7c',
  'R': '#198CE7',
  'Scala': '#c22d40',
  'Kotlin': '#A97BFF',
  'Swift': '#F05138',
  'Ruby': '#701516',
  'PHP': '#4F5D95',
  'Haskell': '#5e5086',
  'Lua': '#000080',
  'MATLAB': '#e16737',
  'Fortran': '#4d41b1',
  'TeX': '#3D6117',
}

export default function TechStackMap() {
  const { t } = useTranslation()
  const enriched = useEnrichedData()
  const containerRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const [hoveredLang, setHoveredLang] = useState(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.1 }
    )
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const { langCards, orgColorMap, convergence } = useMemo(() => {
    const orgs = (enriched.organizations || []).filter(o => o.login)
    const repos = enriched.repositories || []

    if (orgs.length === 0) {
      return { langCards: [], orgColorMap: {}, convergence: { universal: 0, exclusive: 0, avgLangs: 0, total: 0 } }
    }

    // Colores por org
    const colors = {}
    const sortedOrgs = orgs.sort((a, b) => (b.quantum_focus_score || 0) - (a.quantum_focus_score || 0))
    sortedOrgs.forEach((o, i) => { colors[o.login] = COLOR_PALETTE[i % COLOR_PALETTE.length] })

    // Mapear lenguajes → orgs con repos y stars
    const langMap = new Map() // lang → { orgLogin → { repos: count, stars: count } }

    // Desde top_quantum_languages de cada org
    orgs.forEach(org => {
      const langs = org.top_quantum_languages || org.top_languages || []
      if (Array.isArray(langs)) {
        langs.forEach(entry => {
          const langName = typeof entry === 'string' ? entry : (entry?.name || entry?.language)
          if (!langName) return
          if (!langMap.has(langName)) langMap.set(langName, new Map())
          const orgData = langMap.get(langName)
          if (!orgData.has(org.login)) orgData.set(org.login, { repos: 0, stars: 0 })
          const d = orgData.get(org.login)
          d.repos += typeof entry === 'object' ? (entry.count || entry.repos || 1) : 1
          d.stars += typeof entry === 'object' ? (entry.stars || 0) : 0
        })
      }
    })

    // Desde repos
    repos.forEach(repo => {
      const lang = repo.primary_language || repo.language
      const repoOrg = repo.organization?.login || repo.owner?.login
      if (!lang || !repoOrg || !colors[repoOrg]) return
      if (!langMap.has(lang)) langMap.set(lang, new Map())
      const orgData = langMap.get(lang)
      if (!orgData.has(repoOrg)) orgData.set(repoOrg, { repos: 0, stars: 0 })
      const d = orgData.get(repoOrg)
      d.repos += 1
      d.stars += repo.stargazers_count || repo.stars || 0
    })

    // Construir cards
    const cards = []
    const maxRepos = { value: 1 }

    langMap.forEach((orgData, lang) => {
      const orgsWithLang = []
      let totalRepos = 0
      orgData.forEach((data, orgLogin) => {
        orgsWithLang.push({ org: orgLogin, repos: data.repos, stars: data.stars })
        totalRepos += data.repos
        if (data.repos > maxRepos.value) maxRepos.value = data.repos
      })

      cards.push({
        language: lang,
        orgs: orgsWithLang.sort((a, b) => b.repos - a.repos),
        totalRepos,
        orgCount: orgsWithLang.length,
        isUniversal: orgsWithLang.length === sortedOrgs.length,
        isExclusive: orgsWithLang.length === 1,
      })
    })

    // Sort by totalRepos
    cards.sort((a, b) => b.totalRepos - a.totalRepos)

    // Update max for bars
    const globalMax = Math.max(...cards.flatMap(c => c.orgs.map(o => o.repos)), 1)

    cards.forEach(card => {
      card.orgs.forEach(o => {
        o.widthPct = (o.repos / globalMax) * 100
      })
    })

    // Convergence
    const universalCount = cards.filter(c => c.isUniversal).length
    const exclusiveCount = cards.filter(c => c.isExclusive).length
    const avgLangs = orgs.length > 0
      ? (cards.reduce((sum, c) => sum + c.orgCount, 0) / orgs.length).toFixed(1)
      : 0

    return {
      langCards: cards.slice(0, 24),
      orgColorMap: colors,
      convergence: {
        universal: universalCount,
        exclusive: exclusiveCount,
        avgLangs,
        total: cards.length,
      },
    }
  }, [enriched.organizations, enriched.repositories])

  if (langCards.length === 0) return null

  return (
    <div ref={containerRef} className={`${styles.container} ${isVisible ? styles.visible : ''}`}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{t('techStack.title')}</h3>
          <span className={styles.badge}>{t('techStack.badge', { count: convergence.total })}</span>
        </div>
        <p className={styles.subtitle}>
          {t('techStack.subtitle')}
        </p>
      </div>

      {/* Convergence row */}
      <div className={styles.convergenceRow}>
        <div className={styles.convergenceItem}>
          <span className={styles.convergenceIcon}>🌐</span>
          <span className={styles.convergenceLabel}>{t('techStack.universal')}</span>
          <span className={styles.convergenceValue}>{convergence.universal}</span>
        </div>
        <div className={styles.convergenceItem}>
          <span className={styles.convergenceIcon}>🔒</span>
          <span className={styles.convergenceLabel}>{t('techStack.exclusive')}</span>
          <span className={styles.convergenceValue}>{convergence.exclusive}</span>
        </div>
        <div className={styles.convergenceItem}>
          <span className={styles.convergenceIcon}>📊</span>
          <span className={styles.convergenceLabel}>{t('techStack.avgLangs')}</span>
          <span className={styles.convergenceValue}>{convergence.avgLangs}</span>
        </div>
      </div>

      {/* Language grid */}
      <div className={styles.langGrid} role="list">
        {langCards.map((card, i) => (
          <div
            key={card.language}
            className={`${styles.langCard}
              ${hoveredLang && hoveredLang !== card.language ? styles.langDimmed : ''}
              ${hoveredLang === card.language ? styles.langHovered : ''}
              ${card.isUniversal ? styles.langUniversal : ''}
            `}
            role="listitem"
            style={{ animationDelay: `${i * 40}ms` }}
            onMouseEnter={() => setHoveredLang(card.language)}
            onMouseLeave={() => setHoveredLang(null)}
            onFocus={() => setHoveredLang(card.language)}
            onBlur={() => setHoveredLang(null)}
          >
            <div className={styles.langHeader}>
              <span
                className={styles.langDot}
                style={{ background: LANG_COLORS[card.language] || '#888' }}
              />
              <span className={styles.langName}>{card.language}</span>
              {card.isUniversal && <span className={styles.universalTag}>{t('techStack.tagUniversal')}</span>}
              {card.isExclusive && <span className={styles.exclusiveTag}>{t('techStack.tagExclusive')}</span>}
            </div>

            <div className={styles.orgBars}>
              {card.orgs.slice(0, 6).map(orgData => (
                <div key={orgData.org} className={styles.orgBarRow}>
                  <span className={styles.orgBarLabel} style={{ color: orgColorMap[orgData.org] }}>
                    {orgData.org.length > 10 ? orgData.org.substring(0, 8) + '…' : orgData.org}
                  </span>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${orgData.widthPct}%`,
                        background: orgColorMap[orgData.org],
                      }}
                    />
                  </div>
                  <div className={styles.barMeta}>
                    <span className={styles.repoCount}>{orgData.repos}r</span>
                    {orgData.stars > 0 && (
                      <span className={styles.starCount}>★{orgData.stars}</span>
                    )}
                  </div>
                </div>
              ))}
              {card.orgs.length > 6 && (
                <div className={styles.orgBarRow}>
                  <span className={styles.noDataLabel}>+{card.orgs.length - 6} orgs</span>
                </div>
              )}
            </div>

            <div className={styles.langFooter}>
              <span className={styles.footerLabel}>{t('techStack.total')}</span>
              <span className={styles.footerStat}>{card.totalRepos} repos · {card.orgCount} orgs</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
