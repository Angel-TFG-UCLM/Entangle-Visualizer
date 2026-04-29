/**
 * LastUpdatedBadge - Indicador "datos de hace X" junto al botón Actualizar
 * ========================================================================
 * Lee el timestamp del último dashboard cargado desde el store y lo formatea
 * como "hace 5 min" / "hace 2h" / "hace 3d", refrescando cada 30s.
 *
 * Acepta soporte para snake_case (calculated_at) y camelCase (calculatedAt)
 * porque el backend usa snake_case y algunas serializaciones lo convierten.
 */

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDashboardStore } from '../store/dashboardStore'
import styles from './LastUpdatedBadge.module.css'

function formatRelative(t, isoString) {
  if (!isoString) return null
  const ts = new Date(isoString).getTime()
  if (Number.isNaN(ts)) return null
  const diffSec = Math.floor((Date.now() - ts) / 1000)
  if (diffSec < 30) return t('app.status.justNow')
  if (diffSec < 3600) return t('app.status.minutesAgo', { count: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return t('app.status.hoursAgo', { count: Math.floor(diffSec / 3600) })
  return t('app.status.daysAgo', { count: Math.floor(diffSec / 86400) })
}

export default function LastUpdatedBadge() {
  const { t } = useTranslation()
  const metadata = useDashboardStore(s => s.metadata)
  const kpis = useDashboardStore(s => s.kpis)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(v => v + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Probamos varios timestamps disponibles, en orden de preferencia
  const timestamp =
    metadata?.calculated_at ||
    metadata?.calculatedAt ||
    kpis?.lastIngestionDate ||
    null

  const relative = formatRelative(t, timestamp)
  if (!relative) return null

  return (
    <span className={styles.badge}>
      <Clock size={11} className={styles.icon} />
      <span className={styles.label}>{t('app.header.lastUpdated')}</span>
      <span className={styles.value}>{relative}</span>
    </span>
  )
}
