/**
 * BackendStatusBadge - Indicador del estado del backend con tooltip rico
 * ======================================================================
 * Mejoras vs versión anterior:
 *   - Polling automático cada 30s (refresca latencia y timestamp)
 *   - Tooltip renderizado en portal (no se corta con overflow del header)
 *   - Posición calculada dinámicamente sobre el botón
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { createPortal } from 'react-dom'
import { Server, Activity, Globe, Clock, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import styles from './BackendStatusBadge.module.css'

const REGION_LABEL = 'Spain Central'
const POLLING_INTERVAL_MS = 15_000  // refresco razonable (15s) sin sobrecargar re-renders del padre

function formatRelativeTime(t, isoString) {
  if (!isoString) return t('app.status.never')
  const ts = new Date(isoString).getTime()
  if (Number.isNaN(ts)) return t('app.status.never')
  const diffSec = Math.floor((Date.now() - ts) / 1000)
  if (diffSec < 30) return t('app.status.justNow')
  if (diffSec < 3600) return t('app.status.minutesAgo', { count: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return t('app.status.hoursAgo', { count: Math.floor(diffSec / 3600) })
  return t('app.status.daysAgo', { count: Math.floor(diffSec / 86400) })
}

function latencyClass(latencyMs) {
  if (latencyMs == null) return styles.latencyUnknown
  if (latencyMs < 150) return styles.latencyGreat
  if (latencyMs < 500) return styles.latencyOk
  return styles.latencySlow
}

export default function BackendStatusBadge({ status, latencyMs, lastCheckedAt, onRecheck }) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [, setTick] = useState(0)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)

  // Re-render del tiempo relativo cada 30s
  useEffect(() => {
    const id = setInterval(() => setTick(v => v + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Polling automático: re-comprueba health cada 30s mientras la pestaña esté visible
  // Pasa silent=true para que el callback NO mueva el status a 'checking'
  useEffect(() => {
    if (!onRecheck) return
    let id = null
    function startPolling() {
      if (id) return
      id = setInterval(() => {
        if (document.visibilityState === 'visible') onRecheck(true)
      }, POLLING_INTERVAL_MS)
    }
    function stopPolling() {
      if (id) { clearInterval(id); id = null }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') startPolling()
      else stopPolling()
    }
    startPolling()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [onRecheck])

  // Recalcular posición del tooltip al abrir/scroll/resize
  useEffect(() => {
    if (!isOpen) return
    function updatePos() {
      if (!buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      const TOOLTIP_WIDTH = 260
      let left = rect.right - TOOLTIP_WIDTH
      const top = rect.bottom + 8
      if (left < 8) left = 8
      const maxLeft = window.innerWidth - TOOLTIP_WIDTH - 8
      if (left > maxLeft) left = maxLeft
      setTooltipPos({ top, left })
    }
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [isOpen])

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!isOpen) return
    function onDocClick(e) {
      if (buttonRef.current?.contains(e.target)) return
      const tooltip = document.querySelector('[data-backend-tooltip="true"]')
      if (tooltip?.contains(e.target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [isOpen])

  const handleToggle = useCallback(() => setIsOpen(prev => !prev), [])
  const handleRecheck = useCallback((e) => {
    e.stopPropagation()
    if (onRecheck) onRecheck()
  }, [onRecheck])

  // Notacion cuantica del estado
  let qubitNotation = 'α|0⟩+β|1⟩'
  if (status === 'online') qubitNotation = '|1⟩'
  else if (status === 'offline') qubitNotation = '|0⟩'

  // Texto del estado
  let statusText = t('app.status.checking')
  if (status === 'online') statusText = t('app.status.online')
  else if (status === 'offline') statusText = t('app.status.offline')

  const tooltipContent = (
    <div
      className={styles.tooltip}
      data-backend-tooltip="true"
      role="dialog"
      aria-label="Backend details"
      style={{ top: tooltipPos.top, left: tooltipPos.left }}
    >
      <div className={styles.tooltipHeader}>
        <span className={`${styles.tooltipDot} ${styles[`dot_${status}`]}`} />
        <span className={styles.tooltipTitle}>{statusText}</span>
        <button
          type="button"
          className={styles.tooltipRecheck}
          onClick={handleRecheck}
          aria-label={t('app.status.clickToRefresh')}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className={styles.tooltipRows}>
        <div className={styles.tooltipRow}>
          <Activity size={12} className={styles.tooltipIcon} />
          <span className={styles.tooltipLabel}>{t('app.status.latency')}</span>
          <span className={`${styles.tooltipValue} ${latencyClass(latencyMs)}`}>
            {latencyMs != null ? `${latencyMs} ms` : '—'}
          </span>
        </div>
        <div className={styles.tooltipRow}>
          <Globe size={12} className={styles.tooltipIcon} />
          <span className={styles.tooltipLabel}>{t('app.status.region')}</span>
          <span className={styles.tooltipValue}>{REGION_LABEL}</span>
        </div>
        <div className={styles.tooltipRow}>
          <Clock size={12} className={styles.tooltipIcon} />
          <span className={styles.tooltipLabel}>{t('app.status.lastSync')}</span>
          <span className={styles.tooltipValue}>{formatRelativeTime(t, lastCheckedAt)}</span>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.badge}
        data-status={status}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-label={statusText}
      >
        <span className={styles.qubit}>{qubitNotation}</span>
        <span className={styles.iconWrap}>
          <Server size={16} className={styles.icon} />
          {status === 'online' && <span className={styles.heartbeat} />}
          {status === 'checking' && <span className={styles.spinner} />}
        </span>
        <span className={styles.textBlock}>
          <span className={styles.statusText}>{statusText}</span>
          {status === 'online' && latencyMs != null && (
            <span className={`${styles.latencyChip} ${latencyClass(latencyMs)}`}>
              {latencyMs}ms
            </span>
          )}
        </span>
        <span className={styles.indicator} />
      </button>

      {isOpen && createPortal(tooltipContent, document.body)}
    </>
  )
}

BackendStatusBadge.propTypes = {
  status: PropTypes.oneOf(['online', 'offline', 'checking']).isRequired,
  latencyMs: PropTypes.number,
  lastCheckedAt: PropTypes.string,
  onRecheck: PropTypes.func,
}
