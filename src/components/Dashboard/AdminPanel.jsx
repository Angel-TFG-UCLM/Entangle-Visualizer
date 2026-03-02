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

import { useState, useEffect, useRef, useCallback } from 'react'
import useAdminStore from '../../store/adminStore'
import styles from './AdminPanel.module.css'
import {
  FiLock, FiPlay, FiSquare, FiClock, FiDatabase, FiActivity,
  FiRotateCcw, FiSettings, FiX, FiAlertTriangle, FiCheck,
  FiTrash2, FiLogOut, FiPackage, FiUser, FiGrid, FiSearch,
  FiCpu, FiZap, FiCheckCircle, FiXCircle, FiSlash
} from 'react-icons/fi'

// ── Definiciones de operaciones disponibles ──
const OPERATION_DEFS = [
  {
    id: 'repo_ingestion',
    label: 'Ingesta de Repositorios',
    icon: <FiPackage size={18} />,
    type: 'ingestion',
    entity: 'repositories',
    description: 'Busca y almacena repositorios del ecosistema quantum desde GitHub.',
    warning: 'from_scratch limpiará todos los repositorios actuales.',
    supportsModes: true,
  },
  {
    id: 'user_ingestion',
    label: 'Ingesta de Usuarios',
    icon: <FiUser size={18} />,
    type: 'ingestion',
    entity: 'users',
    description: 'Extrae usuarios colaboradores de los repositorios ingestados.',
    warning: 'from_scratch limpiará todos los usuarios actuales.',
    supportsModes: true,
  },
  {
    id: 'org_ingestion',
    label: 'Ingesta de Organizaciones',
    icon: <FiGrid size={18} />,
    type: 'ingestion',
    entity: 'organizations',
    description: 'Descubre organizaciones desde los usuarios (bottom-up).',
    warning: 'from_scratch limpiará todas las organizaciones actuales.',
    supportsModes: true,
  },
  {
    id: 'repo_enrichment',
    label: 'Enriquecimiento de Repos',
    icon: <FiSearch size={18} />,
    type: 'enrichment',
    entity: 'repositories',
    description: 'Completa datos (lenguajes, topics, métricas) via GraphQL/REST.',
    supportsModes: false,
    supportsForceReenrich: true,
  },
  {
    id: 'user_enrichment',
    label: 'Enriquecimiento de Usuarios',
    icon: <FiCpu size={18} />,
    type: 'enrichment',
    entity: 'users',
    description: 'Enriquece perfiles de usuario con datos adicionales de GitHub.',
    supportsModes: false,
    supportsForceReenrich: true,
  },
  {
    id: 'org_enrichment',
    label: 'Enriquecimiento de Orgs',
    icon: <FiActivity size={18} />,
    type: 'enrichment',
    entity: 'organizations',
    description: 'Calcula métricas quantum: focus_score, repos, contributors.',
    supportsModes: false,
    supportsForceReenrich: true,
  },
  {
    id: 'full_pipeline',
    label: 'Pipeline Completo',
    icon: <FiZap size={18} />,
    type: 'pipeline',
    entity: null,
    description: 'Ejecuta las 6 fases secuencialmente (ingesta + enriquecimiento de repos, users y orgs).',
    warning: 'from_scratch limpiará TODAS las colecciones antes de reingestar. Esta operación puede tardar horas.',
    supportsModes: true,
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
    <div className={styles.overlay} onClick={handleOverlayClick}>
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
        <h2 className={styles.authTitle}>ENTANGLE Admin</h2>
        <p className={styles.authSubtitle}>
          {isSetup ? 'Configurar contraseña de administrador' : 'Introduce la contraseña de administrador'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className={styles.authForm}>
        <div className={styles.inputGroup}>
          <input
            ref={passwordInputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSetup ? 'Nueva contraseña' : 'Contraseña'}
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
              placeholder="Confirmar contraseña"
              className={styles.authInput}
              autoComplete="off"
              disabled={isAuthLoading}
            />
            {password && confirmPassword && password !== confirmPassword && (
              <span className={styles.inputError}>Las contraseñas no coinciden</span>
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
            isSetup ? 'Configurar y Acceder' : 'Acceder'
          )}
        </button>
      </form>

      <div className={styles.authFooter}>
        <span className={styles.shortcutHint}>Ctrl+Shift+A para toggle · Esc para cerrar</span>
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD PRINCIPAL (Autenticado)
// ════════════════════════════════════════════════════════════════════════════

function AdminDashboard() {
  const { activeTab, setActiveTab, logout, closePanel, dbStats } = useAdminStore()

  const tabs = [
    { id: 'operations', label: 'Operaciones', icon: <FiPlay /> },
    { id: 'active', label: 'En Curso', icon: <FiActivity /> },
    { id: 'history', label: 'Historial', icon: <FiRotateCcw /> },
    { id: 'settings', label: 'Ajustes', icon: <FiSettings /> },
  ]

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <div className={styles.dashHeader}>
        <div className={styles.dashTitleRow}>
          <span className={styles.dashLogo}><FiActivity size={20} /></span>
          <h2 className={styles.dashTitle}>ENTANGLE Admin</h2>
          {dbStats && (
            <div className={styles.dbBadges}>
              <span className={styles.dbBadge}><FiDatabase /> {dbStats.collections?.repositories?.count?.toLocaleString() || '—'} repos</span>
              <span className={styles.dbBadge}>{dbStats.collections?.users?.count?.toLocaleString() || '—'} users</span>
              <span className={styles.dbBadge}>{dbStats.collections?.organizations?.count?.toLocaleString() || '—'} orgs</span>
            </div>
          )}
        </div>
        <div className={styles.dashActions}>
          <button className={styles.logoutBtn} onClick={logout} title="Cerrar sesión">
            <FiLogOut />
          </button>
          <button className={styles.closeBtn} onClick={closePanel} title="Cerrar panel">
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
                  <h4 className={styles.opLabel}>{opDef.label}</h4>
                  <p className={styles.opDesc}>{opDef.description}</p>
                </div>
              </div>

              <div className={styles.opControls}>
                {opDef.supportsModes && (
                  <div className={styles.modeSelector}>
                    <button
                      className={`${styles.modeBtn} ${mode === 'incremental' ? styles.modeBtnActive : ''}`}
                      onClick={() => { setSelectedMode(s => ({ ...s, [opDef.id]: 'incremental' })); setConfirmOp(null) }}
                    >
                      Incremental
                    </button>
                    <button
                      className={`${styles.modeBtn} ${styles.modeBtnDanger} ${mode === 'from_scratch' ? styles.modeBtnActiveDanger : ''}`}
                      onClick={() => { setSelectedMode(s => ({ ...s, [opDef.id]: 'from_scratch' })); setConfirmOp(null) }}
                    >
                      Desde cero
                    </button>
                  </div>
                )}

                {opDef.supportsForceReenrich && (
                  <div className={styles.toggleRow}>
                    <span className={styles.toggleLabel}>Forzar re-enriquecimiento</span>
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

                {(isFromScratch || opDef.isPipeline) && opDef.warning && (
                  <div className={styles.warningBox}>
                    <FiAlertTriangle />
                    <span>{opDef.warning}</span>
                  </div>
                )}

                {isConfirming ? (
                  <div className={styles.confirmRow}>
                    <span className={styles.confirmText}>¿Confirmar ejecución?</span>
                    <button className={styles.confirmYes} onClick={() => handleLaunch(opDef)}>
                      Sí, ejecutar
                    </button>
                    <button className={styles.confirmNo} onClick={() => setConfirmOp(null)}>
                      Cancelar
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
                        <span>Ejecutar</span>
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
          <p>No hay operaciones en curso</p>
          <span>Inicia una operación desde la pestaña "Operaciones"</span>
        </div>
      ) : (
        <>
          {runningOps.length > 0 && (
            <div className={styles.activeSection}>
              <h3 className={styles.sectionTitle}>
                <span className={styles.pulsingDot} />
                En curso ({runningOps.length})
              </h3>
              {runningOps.map(op => (
                <ActiveOperationCard key={op.operation_id} operation={op} onCancel={cancelOperation} />
              ))}
            </div>
          )}

          {recentlyFinished.length > 0 && (
            <div className={styles.activeSection}>
              <h3 className={styles.sectionTitle}>Finalizadas recientemente</h3>
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
  const progress = operation.progress || 0
  const isCancelling = operation.status === 'cancelling'

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
            <h4>{opLabel}</h4>
            <span className={styles.activeCardMode}>{operation.mode}</span>
          </div>
        </div>
        <button
          className={styles.cancelBtn}
          onClick={() => onCancel(operation.operation_id)}
          disabled={isCancelling}
          title="Cancelar operación"
        >
          {isCancelling ? <span className={styles.spinner} /> : <FiSquare />}
          <span>{isCancelling ? 'Cancelando...' : 'Cancelar'}</span>
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
          {operation.items_total > 0 && (
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
    </div>
  )
}

function FinishedOperationCard({ operation }) {
  const statusConfig = {
    completed: { label: 'Completado', class: styles.statusCompleted, icon: <FiCheckCircle size={16} /> },
    completed_with_errors: { label: 'Con errores', class: styles.statusWarning, icon: <FiAlertTriangle size={16} /> },
    failed: { label: 'Fallido', class: styles.statusFailed, icon: <FiXCircle size={16} /> },
    cancelled: { label: 'Cancelado', class: styles.statusCancelled, icon: <FiSlash size={16} /> },
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
          <h4>{opLabel}</h4>
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
        <h3 className={styles.sectionTitle}>Últimas operaciones</h3>
        <div className={styles.historyActions}>
          <button className={styles.refreshBtn} onClick={loadHistory} disabled={historyLoading}>
            Actualizar
          </button>
          {history.length > 0 && (
            showClearConfirm ? (
              <div className={styles.clearConfirm}>
                <span>¿Borrar todo?</span>
                <button className={styles.confirmYes} onClick={() => { clearHistory(); setShowClearConfirm(false) }}>Sí</button>
                <button className={styles.confirmNo} onClick={() => setShowClearConfirm(false)}>No</button>
              </div>
            ) : (
              <button className={styles.clearBtn} onClick={() => setShowClearConfirm(true)}>
                <FiTrash2 /> Limpiar
              </button>
            )
          )}
        </div>
      </div>

      {historyLoading ? (
        <div className={styles.emptyState}><span className={styles.spinner} /> Cargando...</div>
      ) : history.length === 0 ? (
        <div className={styles.emptyState}>
          <FiRotateCcw />
          <p>Sin historial de operaciones</p>
        </div>
      ) : (
        <div className={styles.historyTable}>
          <div className={styles.historyRow + ' ' + styles.historyRowHeader}>
            <span>Estado</span>
            <span>Operación</span>
            <span>Modo</span>
            <span>Duración</span>
            <span>Items</span>
            <span>Fecha</span>
          </div>
          {history.map((op, i) => {
            const opDef = OPERATION_DEFS.find(d => d.type === op.operation_type && d.entity === op.entity)
            return (
              <div key={op.operation_id || i} className={styles.historyRow}>
                <span>{statusBadge(op.status)}</span>
                <span className={styles.historyOpName}>{opDef?.label || op.operation_type}</span>
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
      setPwdMsg({ type: 'success', text: 'Contraseña actualizada correctamente' })
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (err) {
      setPwdMsg({ type: 'error', text: err.response?.data?.detail || 'Error al cambiar contraseña' })
    } finally {
      setChangingPwd(false)
    }
  }

  return (
    <div className={styles.settingsTab}>
      {/* DB Stats */}
      <div className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}><FiDatabase /> Base de Datos</h3>
        <button className={styles.refreshBtn} onClick={loadDbStats} disabled={dbStatsLoading}>
          {dbStatsLoading ? <span className={styles.spinner} /> : 'Actualizar stats'}
        </button>
        {dbStats && (
          <div className={styles.statsGrid}>
            {Object.entries(dbStats.collections || {}).map(([name, info]) => (
              <div key={name} className={styles.statCard}>
                <span className={styles.statValue}>{info.count?.toLocaleString()}</span>
                <span className={styles.statLabel}>{name}</span>
                {info.last_updated && (
                  <span className={styles.statMeta}>
                    Actualizado: {new Date(info.last_updated).toLocaleDateString('es-ES')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Change password */}
      <div className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}><FiLock /> Cambiar contraseña</h3>
        <form onSubmit={handleChangePassword} className={styles.pwdForm}>
          <input
            type="password"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            placeholder="Contraseña actual"
            className={styles.settingsInput}
          />
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="Nueva contraseña"
            className={styles.settingsInput}
          />
          <input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            placeholder="Confirmar nueva contraseña"
            className={styles.settingsInput}
          />
          {newPwd && confirmPwd && newPwd !== confirmPwd && (
            <span className={styles.inputError}>Las contraseñas no coinciden</span>
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
            {changingPwd ? <span className={styles.spinner} /> : 'Cambiar contraseña'}
          </button>
        </form>
      </div>

      <div className={styles.settingsFooter}>
        <span>Ctrl+Shift+A para toggle · Esc para cerrar</span>
      </div>
    </div>
  )
}
