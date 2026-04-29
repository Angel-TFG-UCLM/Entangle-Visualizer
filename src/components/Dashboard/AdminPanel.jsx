/**
 * ADMIN PANEL — Panel de administración de ENTANGLE
 * ===================================================
 * 
 * Acceso: Ctrl+Shift+A → Contraseña → Panel completo
 * 
 * Funcionalidades:
 * - Autenticación con contraseña (bcrypt)
 * - Ejecutar ingestas/enriquecimientos individuales o pipeline
 * - Monitorizar operaciones en curso (progreso + ETA + cancelar)
 * - Historial de operaciones pasadas
 * - Estadísticas de la base de datos
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import useAdminStore from '../../store/adminStore'
import { useDashboardStore } from '../../store/dashboardStore'
import { adminGetOperationLogs } from '../../services/api'
import styles from './AdminPanel.module.css'
import {
  FiLock, FiPlay, FiSquare, FiClock, FiDatabase, FiActivity,
  FiRotateCcw, FiSettings, FiX, FiAlertTriangle, FiCheck,
  FiTrash2, FiLogOut, FiPackage, FiUser, FiGrid, FiSearch,
  FiCpu, FiZap, FiCheckCircle, FiXCircle, FiSlash,
  FiTerminal, FiChevronDown, FiChevronUp
} from 'react-icons/fi'

// ── Definiciones de operaciones disponibles ──
const OPERATION_DEFS = [
  {
    id: 'repo_ingestion',
    labelKey: 'admin.ops.repoIngestion',
    icon: <FiPackage size={18} />,
    type: 'ingestion',
    entity: 'repositories',
    descriptionKey: 'admin.ops.repoIngestionDesc',
    warningKey: 'admin.warnings.repoScratch',
    supportsModes: true,
  },
  {
    id: 'user_ingestion',
    labelKey: 'admin.ops.userIngestion',
    icon: <FiUser size={18} />,
    type: 'ingestion',
    entity: 'users',
    descriptionKey: 'admin.ops.userIngestionDesc',
    warningKey: 'admin.warnings.userScratch',
    supportsModes: true,
  },
  {
    id: 'org_ingestion',
    labelKey: 'admin.ops.orgIngestion',
    icon: <FiGrid size={18} />,
    type: 'ingestion',
    entity: 'organizations',
    descriptionKey: 'admin.ops.orgIngestionDesc',
    warningKey: 'admin.warnings.orgScratch',
    supportsModes: true,
  },
  {
    id: 'repo_enrichment',
    labelKey: 'admin.ops.repoEnrichment',
    icon: <FiSearch size={18} />,
    type: 'enrichment',
    entity: 'repositories',
    descriptionKey: 'admin.ops.repoEnrichmentDesc',
    supportsModes: false,
    supportsForceReenrich: true,
  },
  {
    id: 'user_enrichment',
    labelKey: 'admin.ops.userEnrichment',
    icon: <FiCpu size={18} />,
    type: 'enrichment',
    entity: 'users',
    descriptionKey: 'admin.ops.userEnrichmentDesc',
    supportsModes: false,
    supportsForceReenrich: true,
  },
  {
    id: 'org_enrichment',
    labelKey: 'admin.ops.orgEnrichment',
    icon: <FiActivity size={18} />,
    type: 'enrichment',
    entity: 'organizations',
    descriptionKey: 'admin.ops.orgEnrichmentDesc',
    supportsModes: false,
    supportsForceReenrich: true,
  },
  {
    id: 'full_pipeline',
    labelKey: 'admin.ops.fullPipeline',
    icon: <FiZap size={18} />,
    type: 'pipeline',
    entity: null,
    descriptionKey: 'admin.ops.fullPipelineDesc',
    warningKey: 'admin.warnings.fullScratch',
    supportsModes: true,
    supportsForceReenrich: true,
    isPipeline: true,
  },
]


// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

export default function AdminPanel() {
  const store = useAdminStore()
  const panelRef = useRef(null)
  const passwordInputRef = useRef(null)

  // ── Keyboard shortcut: Ctrl+Shift+A ──
  const handleKeyDown = useCallback((e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault()
      store.togglePanel()
    }
    if (e.key === 'Escape' && store.isOpen) {
      store.closePanel()
    }
  }, [store.isOpen])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Comprobar si hay contraseña al abrir
  useEffect(() => {
    if (store.isOpen && store.hasPassword === null) {
      store.checkHasPassword()
    }
  }, [store.isOpen])

  // Focus password input
  useEffect(() => {
    if (store.isOpen && !store.isAuthenticated && passwordInputRef.current) {
      setTimeout(() => passwordInputRef.current?.focus(), 100)
    }
  }, [store.isOpen, store.isAuthenticated])

  if (!store.isOpen) return null

  const handleOverlayClick = (e) => {
    if (panelRef.current && !panelRef.current.contains(e.target)) {
      store.closePanel()
    }
  }

  return (
    <div className={styles.overlay} role="button" tabIndex={0} onClick={handleOverlayClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOverlayClick(e) }}>
      <div ref={panelRef} className={styles.panel}>
        {!store.isAuthenticated ? (
          <AuthScreen passwordInputRef={passwordInputRef} />
        ) : (
          <AdminDashboard />
        )}
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// PANTALLA DE AUTENTICACIÓN
// ════════════════════════════════════════════════════════════════════════════

function AuthScreen({ passwordInputRef }) {
  const { t } = useTranslation()
  const { hasPassword, authenticate, setupPassword, authError, isAuthLoading, checkHasPassword } = useAdminStore()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSetup, setIsSetup] = useState(false)

  useEffect(() => {
    if (hasPassword === false) setIsSetup(true)
  }, [hasPassword])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (isSetup) {
        if (password.length < 4) return
        if (password !== confirmPassword) return
        await setupPassword(password)
        await authenticate(password)
      } else {
        await authenticate(password)
      }
    } catch {
      // Error manejado por el store
    }
  }

  return (
    <div className={styles.authScreen}>
      <div className={styles.authHeader}>
        <div className={styles.authIcon}>
          <FiLock size={20} />
        </div>
        <h2 className={styles.authTitle}>{t('admin.title')}</h2>
        <p className={styles.authSubtitle}>
          {isSetup ? t('admin.configurePassword') : t('admin.enterPassword')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className={styles.authForm}>
        <div className={styles.inputGroup}>
          <input
            ref={passwordInputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSetup ? t('admin.newPassword') : t('admin.currentPassword')}
            className={styles.authInput}
            autoComplete="off"
            disabled={isAuthLoading}
          />
        </div>

        {isSetup && (
          <div className={styles.inputGroup}>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('admin.confirmPassword')}
              className={styles.authInput}
              autoComplete="off"
              disabled={isAuthLoading}
            />
            {password && confirmPassword && password !== confirmPassword && (
              <span className={styles.inputError}>{t('admin.passwordMismatch')}</span>
            )}
          </div>
        )}

        {authError && (
          <div className={styles.authError}>
            <FiAlertTriangle />
            <span>{authError}</span>
          </div>
        )}

        <button
          type="submit"
          className={styles.authButton}
          disabled={isAuthLoading || !password || (isSetup && password !== confirmPassword)}
        >
          {isAuthLoading ? (
            <span className={styles.spinner} />
          ) : (
            isSetup ? t('admin.configureAndAccess') : t('admin.access')
          )}
        </button>
      </form>

      <div className={styles.authFooter}>
        <span className={styles.shortcutHint}>{t('admin.hint')}</span>
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD PRINCIPAL (Autenticado)
// ════════════════════════════════════════════════════════════════════════════

function AdminDashboard() {
  const { t } = useTranslation()
  const { activeTab, setActiveTab, logout, closePanel, dbStats } = useAdminStore()
  const metadata = useDashboardStore(s => s.metadata)

  // Derivar última ingesta del dbStats (siempre disponible tras login)
  const lastIngestion = useMemo(() => {
    if (!dbStats?.collections) return null
    let latest = null
    for (const info of Object.values(dbStats.collections)) {
      if (info.last_updated) {
        const d = new Date(info.last_updated)
        if (!latest || d > latest) latest = d
      }
    }
    return latest
  }, [dbStats])

  const tabs = [
    { id: 'operations', label: t('admin.tabs.operations'), icon: <FiPlay /> },
    { id: 'active', label: t('admin.tabs.inProgress'), icon: <FiActivity /> },
    { id: 'history', label: t('admin.tabs.history'), icon: <FiRotateCcw /> },
    { id: 'settings', label: t('admin.tabs.settings'), icon: <FiSettings /> },
  ]

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <div className={styles.dashHeader}>
        <div className={styles.dashTitleRow}>
          <span className={styles.dashLogo}><FiActivity size={20} /></span>
          <h2 className={styles.dashTitle}>{t('admin.title')}</h2>
          {dbStats && (
            <div className={styles.dbBadgesWrap}>
              <div className={styles.dbBadges}>
                <span className={styles.dbBadge}><FiDatabase /> {dbStats.collections?.repositories?.count?.toLocaleString() || '—'} repos</span>
                <span className={styles.dbBadge}>{dbStats.collections?.users?.count?.toLocaleString() || '—'} users</span>
                <span className={styles.dbBadge}>{dbStats.collections?.organizations?.count?.toLocaleString() || '—'} orgs</span>
              </div>
              <div className={styles.dbBadges}>
                {lastIngestion && (
                  <span className={styles.dbBadge} style={{ opacity: 0.55 }}>
                    <FiClock size={10} /> {t('admin.lastIngestion')} {lastIngestion.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                )}
                {metadata?.calculatedAt && (
                  <span className={styles.dbBadge} style={{ opacity: 0.55 }}>
                    <FiActivity size={10} /> {t('admin.lastDataUpdate')} {new Date(metadata.calculatedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <div className={styles.dashActions}>
          <button className={styles.logoutBtn} onClick={logout} title={t('admin.logout')}>
            <FiLogOut />
          </button>
          <button className={styles.closeBtn} onClick={closePanel} title={t('admin.closePanel')}>
            <FiX size={18} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={styles.tabContent}>
        {activeTab === 'operations' && <OperationsTab />}
        {activeTab === 'active' && <ActiveOperationsTab />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// TAB: OPERACIONES (Lanzar nuevas)
// ════════════════════════════════════════════════════════════════════════════

function OperationsTab() {
  const { t } = useTranslation()
  const { runOperation, error, setActiveTab } = useAdminStore()
  const [selectedMode, setSelectedMode] = useState({})
  const [forceReenrich, setForceReenrich] = useState({})
  const [launching, setLaunching] = useState(null)
  const [confirmOp, setConfirmOp] = useState(null)

  const handleLaunch = async (opDef) => {
    const mode = selectedMode[opDef.id] || 'incremental'
    
    // Si es from_scratch o pipeline, pedir confirmación
    if ((mode === 'from_scratch' || opDef.isPipeline) && confirmOp !== opDef.id) {
      setConfirmOp(opDef.id)
      return
    }
    
    setConfirmOp(null)
    setLaunching(opDef.id)

    try {
      await runOperation({
        operation_type: opDef.type,
        entity: opDef.entity,
        mode: mode,
        force_reenrich: forceReenrich[opDef.id] || false,
      })
      setActiveTab('active')
    } catch {
      // Error manejado por store
    } finally {
      setLaunching(null)
    }
  }

  return (
    <div className={styles.opsTab}>
      {error && (
        <div className={styles.globalError}>
          <FiAlertTriangle />
          <span>{error}</span>
        </div>
      )}

      <div className={styles.opsGrid}>
        {OPERATION_DEFS.map(opDef => {
          const mode = selectedMode[opDef.id] || 'incremental'
          const isFromScratch = mode === 'from_scratch'
          const isConfirming = confirmOp === opDef.id

          return (
            <div key={opDef.id} className={`${styles.opCard} ${opDef.isPipeline ? styles.opCardPipeline : ''}`}>
              <div className={styles.opCardHeader}>
                <span className={styles.opIcon}>{opDef.icon}</span>
                <div>
                  <h4 className={styles.opLabel}>{t(opDef.labelKey)}</h4>
                  <p className={styles.opDesc}>{t(opDef.descriptionKey)}</p>
                </div>
              </div>

              <div className={styles.opControls}>
                {opDef.supportsModes && (
                  <div className={styles.modeSelector}>
                    <button
                      className={`${styles.modeBtn} ${mode === 'incremental' ? styles.modeBtnActive : ''}`}
                      onClick={() => { setSelectedMode(s => ({ ...s, [opDef.id]: 'incremental' })); setConfirmOp(null) }}
                    >
                      {t('admin.incremental')}
                    </button>
                    <button
                      className={`${styles.modeBtn} ${styles.modeBtnDanger} ${mode === 'from_scratch' ? styles.modeBtnActiveDanger : ''}`}
                      onClick={() => { setSelectedMode(s => ({ ...s, [opDef.id]: 'from_scratch' })); setConfirmOp(null) }}
                    >
                      {t('admin.fromScratch')}
                    </button>
                  </div>
                )}

                {opDef.supportsForceReenrich && (
                  <div className={styles.toggleRow}>
                    <span className={styles.toggleLabel}>{t('admin.forceReenrich')}</span>
                    <button
                      className={`${styles.toggleTrack} ${forceReenrich[opDef.id] ? styles.toggleOn : ''}`}
                      onClick={() => setForceReenrich(s => ({ ...s, [opDef.id]: !s[opDef.id] }))}
                      role="switch"
                      aria-checked={!!forceReenrich[opDef.id]}
                    >
                      <span className={styles.toggleThumb} />
                    </button>
                  </div>
                )}

                {(isFromScratch || opDef.isPipeline) && opDef.warningKey && (
                  <div className={styles.warningBox}>
                    <FiAlertTriangle />
                    <span>{t(opDef.warningKey)}</span>
                  </div>
                )}

                {isConfirming ? (
                  <div className={styles.confirmRow}>
                    <span className={styles.confirmText}>{t('admin.confirmExecution')}</span>
                    <button className={styles.confirmYes} onClick={() => handleLaunch(opDef)}>
                      {t('admin.yesExecute')}
                    </button>
                    <button className={styles.confirmNo} onClick={() => setConfirmOp(null)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    className={`${styles.launchBtn} ${opDef.isPipeline ? styles.launchBtnPipeline : ''}`}
                    onClick={() => handleLaunch(opDef)}
                    disabled={launching === opDef.id}
                  >
                    {launching === opDef.id ? (
                      <span className={styles.spinner} />
                    ) : (
                      <>
                        <FiPlay />
                        <span>{t('admin.execute')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// TAB: OPERACIONES EN CURSO
// ════════════════════════════════════════════════════════════════════════════

function ActiveOperationsTab() {
  const { t } = useTranslation()
  const { activeOperations, cancelOperation, loadActiveOperations } = useAdminStore()

  useEffect(() => {
    loadActiveOperations()
  }, [])

  const runningOps = activeOperations.filter(op => op.status === 'running' || op.status === 'cancelling')
  const recentlyFinished = activeOperations.filter(op => 
    op.status !== 'running' && op.status !== 'cancelling'
  ).slice(0, 5)

  return (
    <div className={styles.activeTab}>
      {runningOps.length === 0 && recentlyFinished.length === 0 ? (
        <div className={styles.emptyState}>
          <FiActivity />
          <p>{t('admin.noActiveOps')}</p>
          <span>{t('admin.startFromOpsTab')}</span>
        </div>
      ) : (
        <>
          {runningOps.length > 0 && (
            <div className={styles.activeSection}>
              <h3 className={styles.sectionTitle}>
                <span className={styles.pulsingDot} />
                {t('admin.inProgress', { count: runningOps.length })}
              </h3>
              {runningOps.map(op => (
                <ActiveOperationCard key={op.operation_id} operation={op} onCancel={cancelOperation} />
              ))}
            </div>
          )}

          {recentlyFinished.length > 0 && (
            <div className={styles.activeSection}>
              <h3 className={styles.sectionTitle}>{t('admin.recentlyFinished')}</h3>
              {recentlyFinished.map(op => (
                <FinishedOperationCard key={op.operation_id} operation={op} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ActiveOperationCard({ operation, onCancel }) {
  const { t } = useTranslation()
  const { token } = useAdminStore()
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalClosing, setTerminalClosing] = useState(false)
  const [logs, setLogs] = useState([])
  const logIndexRef = useRef(0)
  const terminalRef = useRef(null)
  const autoScrollRef = useRef(true)
  const isPipeline = operation.operation_type === 'pipeline'

  const progress = operation.progress || 0
  const isCancelling = operation.status === 'cancelling'
  const isRunning = operation.status === 'running' || operation.status === 'cancelling'

  // Polling de logs cuando el terminal está abierto
  useEffect(() => {
    if (!terminalOpen || !token) return

    let cancelled = false

    const fetchLogs = async () => {
      try {
        const result = await adminGetOperationLogs(token, operation.operation_id, logIndexRef.current)
        if (cancelled) return
        if (result.logs.length > 0) {
          setLogs(prev => [...prev, ...result.logs])
          logIndexRef.current = result.next_index
        }
      } catch { /* silenciar errores de polling */ }
    }

    fetchLogs()
    const interval = isRunning ? setInterval(fetchLogs, 800) : null

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [terminalOpen, isRunning, token, operation.operation_id])

  // Auto-scroll del terminal
  useEffect(() => {
    if (terminalRef.current && terminalOpen && autoScrollRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs, terminalOpen])

  // Detectar si el usuario ha hecho scroll manual
  const handleTerminalScroll = () => {
    if (!terminalRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40
  }

  const handleToggleTerminal = () => {
    if (terminalOpen) {
      setTerminalClosing(true)
      setTimeout(() => {
        setTerminalOpen(false)
        setTerminalClosing(false)
      }, 200)
    } else {
      setLogs([])
      logIndexRef.current = 0
      autoScrollRef.current = true
      setTerminalOpen(true)
    }
  }

  const levelClass = (level) => {
    switch (level) {
      case 'ERROR': case 'CRITICAL': return styles.logError
      case 'WARNING': return styles.logWarn
      case 'PROGRESS': return styles.logProgress
      case 'DEBUG': return styles.logDebug
      default: return styles.logInfo
    }
  }

  const formatETA = (seconds) => {
    if (!seconds || seconds <= 0) return null
    if (seconds < 60) return `~${Math.round(seconds)}s`
    if (seconds < 3600) return `~${Math.round(seconds / 60)}min`
    return `~${(seconds / 3600).toFixed(1)}h`
  }

  const opLabel = OPERATION_DEFS.find(d => 
    d.type === operation.operation_type && d.entity === operation.entity
  )?.label || operation.operation_type

  return (
    <div className={styles.activeCard}>
      <div className={styles.activeCardHeader}>
        <div className={styles.activeCardTitle}>
          <span className={styles.activeCardIcon}>
            {OPERATION_DEFS.find(d => d.type === operation.operation_type && d.entity === operation.entity)?.icon || <FiZap />}
          </span>
          <div>
            <h4>{opLabelText}</h4>
            <span className={styles.activeCardMode}>{operation.mode}</span>
          </div>
        </div>
        <button
          className={styles.cancelBtn}
          onClick={() => onCancel(operation.operation_id)}
          disabled={isCancelling}
          title={t('admin.cancelOperation')}
        >
          {isCancelling ? <span className={styles.spinner} /> : <FiSquare />}
          <span>{isCancelling ? t('admin.cancelling') : t('common.cancel')}</span>
        </button>
      </div>

      {/* Progress bar */}
      <div className={styles.progressBarContainer}>
        <div
          className={`${styles.progressBar} ${isCancelling ? styles.progressBarCancelling : ''}`}
          style={{ width: `${Math.max(progress, 2)}%` }}
        />
      </div>

      <div className={styles.progressInfo}>
        <span className={styles.progressMessage}>{operation.progress_message}</span>
        <div className={styles.progressMeta}>
          {!isPipeline && operation.items_total > 0 && (
            <span>{operation.items_processed}/{operation.items_total}</span>
          )}
          <span>{Math.round(progress)}%</span>
          {operation.eta_seconds && (
            <span className={styles.eta}>
              <FiClock />
              {formatETA(operation.eta_seconds)}
            </span>
          )}
        </div>
      </div>

      {/* Terminal toggle */}
      <button className={styles.terminalToggle} onClick={handleToggleTerminal}>
        <FiTerminal size={14} />
        <span>{t('admin.terminal')}</span>
        {terminalOpen ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
        {logs.length > 0 && <span className={styles.logCount}>{logs.length}</span>}
      </button>

      {/* Terminal viewer */}
      {terminalOpen && (
        <div
          ref={terminalRef}
          className={`${styles.terminal} ${terminalClosing ? styles.terminalOut : ''}`}
          onScroll={handleTerminalScroll}
        >
          {logs.length === 0 ? (
            <div className={styles.terminalEmpty}>
              <span className={styles.spinner} /> {t('admin.waitingLogs')}
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className={styles.terminalLine}>
                <span className={styles.logTs}>{log.ts}</span>
                <span className={`${styles.logLevel} ${levelClass(log.level)}`}>{log.level}</span>
                <span className={styles.logSrc}>{log.src}</span>
                <span className={styles.logMsg}>{log.msg}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function FinishedOperationCard({ operation }) {
  const { t } = useTranslation()
  const statusConfig = {
    completed: { label: t('admin.statusCompleted'), class: styles.statusCompleted, icon: <FiCheckCircle size={16} /> },
    completed_with_errors: { label: t('admin.statusWithErrors'), class: styles.statusWarning, icon: <FiAlertTriangle size={16} /> },
    failed: { label: t('admin.statusFailed'), class: styles.statusFailed, icon: <FiXCircle size={16} /> },
    cancelled: { label: t('admin.statusCancelled'), class: styles.statusCancelled, icon: <FiSlash size={16} /> },
  }

  const cfg = statusConfig[operation.status] || statusConfig.failed

  const opLabel = OPERATION_DEFS.find(d => 
    d.type === operation.operation_type && d.entity === operation.entity
  )?.label || operation.operation_type

  const formatDuration = (seconds) => {
    if (!seconds) return '—'
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  return (
    <div className={`${styles.finishedCard} ${cfg.class}`}>
      <div className={styles.finishedCardMain}>
        <span>{cfg.icon}</span>
        <div>
          <h4>{opLabelText}</h4>
          <span className={styles.finishedMeta}>
            {operation.mode} · {formatDuration(operation.duration_seconds)}
            {operation.items_processed > 0 && ` · ${operation.items_processed} items`}
          </span>
        </div>
      </div>
      <span className={styles.finishedTime}>
        {operation.completed_at ? new Date(operation.completed_at).toLocaleTimeString('es-ES') : '—'}
      </span>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// TAB: HISTORIAL
// ════════════════════════════════════════════════════════════════════════════

function HistoryTab() {
  const { t } = useTranslation()
  const { history, historyLoading, loadHistory, clearHistory } = useAdminStore()
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    loadHistory()
  }, [])

  const formatDuration = (seconds) => {
    if (!seconds) return '—'
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  const statusBadge = (status) => {
    const map = {
      completed: { label: 'OK', class: styles.badgeSuccess },
      completed_with_errors: { label: 'WARN', class: styles.badgeWarning },
      failed: { label: 'FAIL', class: styles.badgeError },
      cancelled: { label: 'CANCEL', class: styles.badgeCancelled },
    }
    const cfg = map[status] || map.failed
    return <span className={`${styles.statusBadge} ${cfg.class}`}>{cfg.label}</span>
  }

  return (
    <div className={styles.historyTab}>
      <div className={styles.historyHeader}>
        <h3 className={styles.sectionTitle}>{t('admin.latestOperations')}</h3>
        <div className={styles.historyActions}>
          <button className={styles.refreshBtn} onClick={loadHistory} disabled={historyLoading}>
            {t('admin.update')}
          </button>
          {history.length > 0 && (
            showClearConfirm ? (
              <div className={styles.clearConfirm}>
                <span>{t('admin.clearConfirm')}</span>
                <button className={styles.confirmYes} onClick={() => { clearHistory(); setShowClearConfirm(false) }}>{t('admin.yes')}</button>
                <button className={styles.confirmNo} onClick={() => setShowClearConfirm(false)}>{t('admin.no')}</button>
              </div>
            ) : (
              <button className={styles.clearBtn} onClick={() => setShowClearConfirm(true)}>
                <FiTrash2 /> {t('admin.clear')}
              </button>
            )
          )}
        </div>
      </div>

      {historyLoading ? (
        <div className={styles.emptyState}><span className={styles.spinner} /> {t('common.loading')}</div>
      ) : history.length === 0 ? (
        <div className={styles.emptyState}>
          <FiRotateCcw />
          <p>{t('admin.noHistory')}</p>
        </div>
      ) : (
        <div className={styles.historyTable}>
          <div className={styles.historyRow + ' ' + styles.historyRowHeader}>
            <span>{t('admin.table.status')}</span>
            <span>{t('admin.table.operation')}</span>
            <span>{t('admin.table.mode')}</span>
            <span>{t('admin.table.duration')}</span>
            <span>{t('admin.table.items')}</span>
            <span>{t('admin.table.date')}</span>
          </div>
          {history.map((op, i) => {
            const opDef = OPERATION_DEFS.find(d => d.type === op.operation_type && d.entity === op.entity)
            return (
              <div key={op.operation_id || i} className={styles.historyRow}>
                <span>{statusBadge(op.status)}</span>
                <span className={styles.historyOpName}>{opDef?.labelKey ? t(opDef.labelKey) : op.operation_type}</span>
                <span className={styles.historyMode}>{op.mode || '—'}</span>
                <span className={styles.historyDuration}>{formatDuration(op.duration_seconds)}</span>
                <span className={styles.historyItems}>{op.items_processed || 0}</span>
                <span className={styles.historyDate}>
                  {op.started_at ? new Date(op.started_at).toLocaleString('es-ES', { 
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                  }) : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// TAB: AJUSTES
// ════════════════════════════════════════════════════════════════════════════

function SettingsTab() {
  const { t } = useTranslation()
  const { setupPassword, dbStats, loadDbStats, dbStatsLoading } = useAdminStore()
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState(null)
  const [changingPwd, setChangingPwd] = useState(false)

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPwd !== confirmPwd || newPwd.length < 4) return
    
    setChangingPwd(true)
    setPwdMsg(null)
    try {
      await setupPassword(newPwd, currentPwd)
      setPwdMsg({ type: 'success', text: t('admin.passwordUpdated') })
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.response?.data?.detail || t('admin.passwordError') })
    } finally {
      setChangingPwd(false)
    }
  }

  return (
    <div className={styles.settingsTab}>
      {/* DB Stats */}
      <div className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}><FiDatabase /> {t('admin.database')}</h3>
        <button className={styles.refreshBtn} onClick={loadDbStats} disabled={dbStatsLoading}>
          {dbStatsLoading ? <span className={styles.spinner} /> : t('admin.updateStats')}
        </button>
        {dbStats && (
          <div className={styles.statsGrid}>
            {Object.entries(dbStats.collections || {}).map(([name, info]) => (
              <div key={name} className={styles.statCard}>
                <span className={styles.statValue}>{info.count?.toLocaleString()}</span>
                <span className={styles.statLabel}>{name}</span>
                {info.last_updated && (
                  <span className={styles.statMeta}>
                    {t('admin.updated')} {new Date(info.last_updated).toLocaleDateString('es-ES')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Change password */}
      <div className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}><FiLock /> {t('admin.changePassword')}</h3>
        <form onSubmit={handleChangePassword} className={styles.pwdForm}>
          <input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            placeholder={t('admin.currentPassword')}
            className={styles.settingsInput}
          />
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder={t('admin.newPassword')}
            className={styles.settingsInput}
          />
          <input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            placeholder={t('admin.confirmNewPassword')}
            className={styles.settingsInput}
          />
          {newPwd && confirmPwd && newPwd !== confirmPwd && (
            <span className={styles.inputError}>{t('admin.passwordMismatch')}</span>
          )}
          {pwdMsg && (
            <div className={pwdMsg.type === 'success' ? styles.successMsg : styles.errorMsg}>
              {pwdMsg.type === 'success' ? <FiCheck /> : <FiAlertTriangle />}
              <span>{pwdMsg.text}</span>
            </div>
          )}
          <button
            type="submit"
            className={styles.settingsBtn}
            disabled={changingPwd || !currentPwd || !newPwd || newPwd !== confirmPwd || newPwd.length < 4}
          >
            {changingPwd ? <span className={styles.spinner} /> : t('admin.changePassword')}
          </button>
        </form>
      </div>

      <div className={styles.settingsFooter}>
        <span>{t('admin.hint')}</span>
      </div>
    </div>
  )
}
