/**
 * TaglineRotator - Tagline rotativa debajo del logo
 * =================================================
 * Cicla entre la tagline base y stats vivas del ecosistema cada 5s,
 * con una transición suave de fade. Si no hay datos, sólo muestra la
 * tagline estática para no quedar vacío.
 */

import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useDashboardStore } from '../store/dashboardStore'
import styles from './TaglineRotator.module.css'

const ROTATION_INTERVAL_MS = 5000

function formatBigNum(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return null
  // Estilo europeo: 27.061 (puntos como separador de miles)
  return n.toLocaleString('es-ES')
}

export default function TaglineRotator() {
  const { t } = useTranslation()
  const kpis = useDashboardStore(s => s.kpis)
  const [index, setIndex] = useState(0)

  // Construye la lista de mensajes a rotar dinamicamente.
  // Solo incluimos informacion relevante que demuestre capacidades clave del
  // proyecto: escala del dataset, lente analitica diferencial y stack tecnico.
  const messages = useMemo(() => {
    const base = [t('app.subtitle')]
    if (!kpis) return base

    const repos = formatBigNum(kpis.totalRepos)
    const users = formatBigNum(kpis.totalUsers)
    const orgs  = formatBigNum(kpis.totalOrgs)

    if (repos && users && orgs) {
      base.push(`${repos} REPOS · ${users} USERS · ${orgs} ORGS`)
    }

    base.push('REAL-TIME GITHUB ECOSYSTEM ANALYTICS')
    base.push('INTERACTIVE 3D UNIVERSE · COLLABORATION GRAPH')
    base.push('LOUVAIN COMMUNITIES · BRIDGE USERS · BETWEENNESS')
    base.push('NLP DISCIPLINE CLASSIFIER · 5 QUANTUM AREAS')
    base.push('AI ASSISTANT POWERED BY AZURE FOUNDRY GPT-5-MINI')
    base.push('BUILT ON AZURE · FASTAPI · REACT · THREE.JS')
    return base
  }, [kpis, t])

  useEffect(() => {
    if (messages.length <= 1) return
    const id = setInterval(() => {
      setIndex(prev => (prev + 1) % messages.length)
    }, ROTATION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [messages.length])

  // Asegurar índice válido si la lista cambia
  const safeIndex = index % messages.length
  const current = messages[safeIndex] ?? messages[0]

  return (
    <span className={styles.tagline} key={safeIndex} aria-live="polite">
      {current}
    </span>
  )
}
