/**
 * ENTANGLE - Dashboard Principal
 * ===============================
 * Vista principal de la SPA que muestra:
 * - Header con branding y estado del backend
 * - KPIs dinámicos conectados a Zustand
 * - Gráficos interactivos con drill-down
 * 
 * Decisión arquitectónica: Este componente es el "layout base".
 * Usa Service Layer (api.js) para checkHealth del backend.
 * Si el backend está online, carga datos reales desde MongoDB.
 * Si está offline, usa datos simulados (mockData) como fallback.
 */

import { useEffect, useState, lazy, Suspense } from 'react'
import { checkHealth } from './services/api'
import { Server, RefreshCw, Star } from 'lucide-react'
import { FaExclamationTriangle } from 'react-icons/fa'
import { useDashboardStore } from './store/dashboardStore'
import useFavoritesStore from './store/favoritesStore'
import KPISection from './components/Dashboard/KPISection'
import ChartsSection from './components/Dashboard/ChartsSection'
import NetworkGraph from './components/Dashboard/NetworkGraph'
import ContributorSankey from './components/Dashboard/ContributorSankey'
import BridgeUsersTable from './components/Dashboard/BridgeUsersTable'
import OrgComparisonRadar from './components/Dashboard/OrgComparisonRadar'
import TechStackMap from './components/Dashboard/TechStackMap'
import DetailTable from './components/Dashboard/DetailTable'
import DashboardNav from './components/Dashboard/DashboardNav'
import CollaborationBanner from './components/Dashboard/CollaborationBanner'
import FavoritesPanel from './components/Dashboard/FavoritesPanel'
import ViewBar from './components/Dashboard/ViewBar'
import DevMenu from './components/Dashboard/DevMenu'
import AdminPanel from './components/Dashboard/AdminPanel'
import QuantumChat from './components/Dashboard/QuantumChat'
import { useDevStore } from './store/devStore'

// Lazy-load del universo 3D (Three.js ~600KB) - solo se carga al abrir
const UniverseView = lazy(() => import('./components/Universe/UniverseView'))
import QuantumBackground from './components/QuantumBackground'
import QuantumDivider from './components/QuantumDivider'

import BlochSphere from './components/BlochSphere'
import styles from './App.module.css'

function App() {
  // === ESTADO LOCAL ===
  const [apiStatus, setApiStatus] = useState({
    status: 'checking', // 'checking' | 'online' | 'offline'
    message: 'Verificando conexión...',
  })

  const [isLoading, setIsLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [isExiting, setIsExiting] = useState(false)
  const [loadingResult, setLoadingResult] = useState(null) // null | 'success' | 'error'
  const [quantumPhrase, setQuantumPhrase] = useState(0)

  // === ZUSTAND STORE ===
  // Datos del ecosistema (con valores por defecto)
  const store = useDashboardStore()
  const globalData = store.data || { organizations: [], users: [], repositories: [] }
  const loadFullData = store.loadFullData
  const refreshMetrics = store.refreshMetrics

  // Estado para refresh manual
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Favorites & Views
  const [showFavoritesPanel, setShowFavoritesPanel] = useState(false)
  const initFavorites = useFavoritesStore(s => s.initialize)
  const activeViewId = useFavoritesStore(s => s.activeViewId)
  const activeViewData = useFavoritesStore(s => s.activeViewData)
  const favoritesCount = useFavoritesStore(s => s.favorites.length)
  const isLoadingViewData = useFavoritesStore(s => s.isLoadingViewData)

  // Dev features
  const devFeatures = useDevStore(s => s.features)

  // Cuando hay una vista activa, usar sus datos filtrados; si no, datos globales
  const data = (activeViewId && activeViewData) 
    ? (() => {
        // charts.organizations puede ser un objeto {byRepos, byStars, ...} o un array
        const rawOrgs = activeViewData.charts?.organizations
        const orgsArray = Array.isArray(rawOrgs) 
          ? rawOrgs 
          : (rawOrgs?.byRepos || rawOrgs?.byStars || [])
        // charts.repositories puede ser un objeto {byStars, byForks, ...} o un array
        const rawRepos = activeViewData.charts?.repositories
        const reposArray = Array.isArray(rawRepos)
          ? rawRepos
          : [...new Map([
              ...(rawRepos?.byStars || []),
              ...(rawRepos?.byForks || []),
              ...(rawRepos?.byCollaborators || []),
            ].map(r => [r.full_name || r.name, r])).values()]
        return {
          organizations: orgsArray,
          users: activeViewData.charts?.users || [],
          repositories: reposArray,
          kpis: activeViewData.kpis,
          charts: activeViewData.charts,
          tables: activeViewData.tables,
        }
      })()
    : globalData

  console.log('[App] Store data:', data)

  // Frases cuánticas para la pantalla de carga
  const QUANTUM_PHRASES = [
    'Inicializando qubits...',
    'Entrelazando datos del ecosistema...',
    'Aplicando puerta Hadamard...',
    'Colapsando función de onda...',
    'Midiendo estados cuánticos...',
    'Decodificando superposición...',
  ]

  useEffect(() => {
    if (!isLoading || loadingResult) return
    const interval = setInterval(() => {
      setQuantumPhrase(prev => (prev + 1) % QUANTUM_PHRASES.length)
    }, 2200)
    return () => clearInterval(interval)
  }, [isLoading, loadingResult])

  // === EFECTOS ===
  // Health Check al montar el componente (verificar backend online/offline)
  useEffect(() => {
    let isMounted = true
    let retryTimeout = null

    async function loadData(attempt = 1) {
      const MAX_RETRIES = 3
      const RETRY_DELAY = attempt * 2000 // Exponential backoff: 2s, 4s, 6s

      if (!isMounted) return

      setIsLoading(true)
      
      try {
        // Health Check del backend
        const healthResult = await checkHealth()
        
        if (!isMounted) return
        
        setApiStatus({
          status: healthResult.status,
          message: healthResult.message,
        })

        // Backend online → Cargar métricas pre-calculadas del backend
        if (healthResult.status === 'online') {
          setRetryCount(0)
          
          // Una sola llamada carga TODO: KPIs, charts, graph, tables, filters
          // El backend pre-calcula y cachea las métricas (~0ms si cache hit)
          const metricsLoaded = await loadFullData()
          
          if (metricsLoaded) {
            console.log('🔬 Usando métricas REALES del backend (pre-calculadas)')
            // Cargar favoritos y vistas del usuario
            initFavorites().catch(() => {})
          } else {
            console.log('🧪 Usando datos de PRUEBA (mockData)')
          }
          
          // Éxito: mostrar check verde
          setLoadingResult('success')
          
          // Esperar a que la animación SVG se dibuje (~0.85s) + tiempo de lectura
          setTimeout(() => {
            if (isMounted) {
              setIsExiting(true)
              setTimeout(() => {
                if (isMounted) {
                  setIsLoading(false)
                }
              }, 500)
            }
          }, 2000)
        } else {
          // Backend offline - reintentar con backoff incremental
          if (attempt < MAX_RETRIES) {
            console.warn(`⚠️ Backend offline - reintento ${attempt}/${MAX_RETRIES} en ${RETRY_DELAY / 1000}s...`)
            setRetryCount(attempt)
            retryTimeout = setTimeout(() => {
              loadData(attempt + 1)
            }, RETRY_DELAY)
          } else {
            // Agotamos reintentos: mostrar error y continuar con datos simulados
            console.error(`❌ Backend offline tras ${MAX_RETRIES} reintentos`)
            setRetryCount(0)
            setLoadingResult('error')
            setTimeout(() => {
              if (isMounted) {
                setIsExiting(true)
                setTimeout(() => {
                  if (isMounted) {
                    setIsLoading(false)
                  }
                }, 500)
              }
            }, 2500)
          }
        }
      } catch (err) {
        console.error('[App] Error en checkHealth:', err)
        
        if (!isMounted) return

        setApiStatus({
          status: 'offline',
          message: 'Error de conexión con el backend',
        })

        // Reintentar si no hemos alcanzado el límite
        if (attempt < MAX_RETRIES) {
          setRetryCount(attempt)
          retryTimeout = setTimeout(() => {
            loadData(attempt + 1)
          }, RETRY_DELAY)
        } else {
          // Agotamos reintentos: mostrar error
          setLoadingResult('error')
          setTimeout(() => {
            if (isMounted) {
              setIsExiting(true)
              setTimeout(() => {
                if (isMounted) {
                  setIsLoading(false)
                }
              }, 500)
            }
          }, 2500)
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
      if (retryTimeout) {
        clearTimeout(retryTimeout)
      }
    }
  }, [])

  // === RENDER ===
  
  // Mostrar pantalla de carga mientras está cargando (incluyendo durante el fadeOut)
  if (isLoading) {
    return (
      <div className={`${styles.loadingScreen} ${isExiting ? styles.fadeOut : ''}`}>
        <div className={styles.loadingContent}>
          <img 
            src="/logo.png" 
            alt="ENTANGLE Logo" 
            className={styles.loadingLogo}
          />
          <p className={styles.loadingSubtitle}>Quantum Software Ecosystem Analysis</p>
          
          <div className={styles.loadingSpinner}>
            {/* Átomo SVG que se transforma en resultado */}
            <div className={`${styles.atomContainer} ${loadingResult ? styles.atomDone : ''}`}>
              {/* Átomo orbital - se desvanece al completar */}
              <svg
                className={`${styles.atomSpinner} ${loadingResult ? styles.atomFadeOut : ''}`}
                viewBox="0 0 120 120" width="80" height="80"
              >
                <ellipse cx="60" cy="60" rx="50" ry="18" fill="none" stroke="rgba(0, 212, 228, 0.3)" strokeWidth="1.5" className={styles.atomOrbit1} />
                <ellipse cx="60" cy="60" rx="50" ry="18" fill="none" stroke="rgba(157, 111, 219, 0.3)" strokeWidth="1.5" className={styles.atomOrbit2} />
                <ellipse cx="60" cy="60" rx="50" ry="18" fill="none" stroke="rgba(0, 255, 159, 0.25)" strokeWidth="1.5" className={styles.atomOrbit3} />
                <circle r="4" fill="#00D4E4" filter="url(#loadGlow)">
                  <animateMotion dur="2s" repeatCount="indefinite" path="M 110,60 A 50,18 0 1,1 10,60 A 50,18 0 1,1 110,60" />
                </circle>
                <circle r="3.5" fill="#9D6FDB" filter="url(#loadGlow)">
                  <animateMotion dur="2.6s" repeatCount="indefinite" path="M 95,82.7 A 50,18 60 1,1 25,37.3 A 50,18 60 1,1 95,82.7" />
                </circle>
                <circle r="3" fill="#00ff9f" filter="url(#loadGlow)">
                  <animateMotion dur="3.2s" repeatCount="indefinite" path="M 25,82.7 A 50,18 120 1,1 95,37.3 A 50,18 120 1,1 25,82.7" />
                </circle>
                <circle cx="60" cy="60" r="6" fill="rgba(0, 212, 228, 0.5)" className={styles.atomCore} />
                <circle cx="60" cy="60" r="3" fill="rgba(255, 255, 255, 0.7)" />
                <defs>
                  <filter id="loadGlow" x="-200%" y="-200%" width="500%" height="500%">
                    <feGaussianBlur stdDeviation="4" result="g" />
                    <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
              </svg>
              {/* Indicador de resultado - aparece encima del átomo */}
              {loadingResult === 'success' && (
                <div className={styles.resultIndicator}>
                  <svg viewBox="0 0 52 52" width="52" height="52" className={styles.resultSvg}>
                    <circle cx="26" cy="26" r="24" fill="none" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="2" />
                    <circle cx="26" cy="26" r="24" fill="none" stroke="#10b981" strokeWidth="2"
                      strokeDasharray="151" strokeDashoffset="151" className={styles.resultCircle} />
                    <path fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                      d="M15 27l7 7 15-15" strokeDasharray="40" strokeDashoffset="40" className={styles.resultCheck} />
                  </svg>
                </div>
              )}
              {loadingResult === 'error' && (
                <div className={styles.resultIndicator}>
                  <svg viewBox="0 0 52 52" width="52" height="52" className={styles.resultSvg}>
                    <circle cx="26" cy="26" r="24" fill="none" stroke="rgba(239, 68, 68, 0.2)" strokeWidth="2" />
                    <circle cx="26" cy="26" r="24" fill="none" stroke="#ef4444" strokeWidth="2"
                      strokeDasharray="151" strokeDashoffset="151" className={styles.resultCircle} />
                    <path fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round"
                      d="M18 18l16 16" strokeDasharray="23" strokeDashoffset="23" className={styles.resultCrossA} />
                    <path fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round"
                      d="M34 18l-16 16" strokeDasharray="23" strokeDashoffset="23" className={styles.resultCrossB} />
                  </svg>
                </div>
              )}
            </div>
          </div>
          
          <p className={`${styles.loadingText} ${loadingResult ? styles.loadingTextResult : ''}`}>
            {loadingResult === 'success' && (
              <span className={styles.resultText}>Coherencia cuántica establecida</span>
            )}
            {loadingResult === 'error' && (
              <span className={`${styles.resultText} ${styles.resultTextError}`}>Decoherencia detectada - modo simulación</span>
            )}
            {loadingResult === null && (
              <span className={styles.quantumPhrase} key={quantumPhrase}>
                {isRefreshing ? 'Recalculando métricas...' : QUANTUM_PHRASES[quantumPhrase]}
              </span>
            )}
          </p>
          <p className={`${styles.retryText} ${retryCount > 0 && loadingResult === null ? styles.retryVisible : ''}`}>
            Reintentando conexión... ({retryCount}/3)
          </p>
        </div>
      </div>
    )
  }

  /**
   * Maneja el refresh manual de métricas
   * Muestra la pantalla de carga mientras recalcula
   */
  async function handleRefreshMetrics() {
    if (isRefreshing) return // Evitar múltiples clicks
    
    setIsRefreshing(true)
    setIsLoading(true)
    setIsExiting(false)
    setLoadingResult(null)
    setQuantumPhrase(0)
    
    try {
      // Forzar recálculo en el backend
      await refreshMetrics()
      
      setLoadingResult('success')
      
      // Esperar a que se aprecie el resultado
      setTimeout(() => {
        setIsExiting(true)
        setTimeout(() => {
          setIsLoading(false)
          setIsExiting(false)
          setIsRefreshing(false)
        }, 500)
      }, 2000)
    } catch (error) {
      console.error('Error al refrescar métricas:', error)
      setLoadingResult('error')
      setTimeout(() => {
        setIsExiting(true)
        setTimeout(() => {
          setIsLoading(false)
          setIsExiting(false)
          setIsRefreshing(false)
        }, 500)
      }, 2500)
    }
  }
  
  console.log('[App] Rendering main app - isLoading:', isLoading, 'apiStatus:', apiStatus.status)
  console.log('[App] Data disponible:', data ? 'SÍ' : 'NO')

  return (
    <div className={`${styles.app} ${styles.fadeInApp}`}>
      {/* FONDO DE PARTÍCULAS CUÁNTICAS */}
      {devFeatures.quantumBackground !== false && <QuantumBackground />}

      {/* HEADER */}
      {devFeatures.header !== false && <header className={`${styles.header} ${styles.fadeInStagger1}`}>
        <div className={styles.headerContent}>
          <div className={styles.branding}>
            <img 
              src="/logo.png" 
              alt="ENTANGLE Logo" 
              className={styles.headerLogo}
            />
            <div className={styles.brandingText}>
              <h1 className={styles.logo}>
                <span className={styles.logoAccent} data-text="ENTANGLE">ENTANGLE</span>
              </h1>
              <div className={styles.subtitleRow}>
                <span className={styles.orbitalDot} />
                <p className={styles.logoSub}>Quantum Software Ecosystem Analysis</p>
                <span className={styles.orbitalDot} />
              </div>
            </div>
          </div>

          {/* Controles del header: favoritos + refresh + status */}
          <div className={styles.headerControls}>
            {/* Botón de favoritos */}
            {apiStatus.status === 'online' && (
              <button 
                className={`${styles.refreshButton} ${styles.favoritesButton} ${showFavoritesPanel ? styles.favoritesButtonActive : ''}`}
                onClick={() => setShowFavoritesPanel(prev => !prev)}
                title="Favoritos & Vistas personalizadas"
              >
                <Star size={16} fill={favoritesCount > 0 ? '#ffd93d' : 'none'} color={favoritesCount > 0 ? '#ffd93d' : 'currentColor'} />
                {favoritesCount > 0 && <span className={styles.favoritesCount}>{favoritesCount}</span>}
              </button>
            )}

            {/* Botón de refresh métricas */}
            {apiStatus.status === 'online' && (
              <button 
                className={styles.refreshButton}
                onClick={handleRefreshMetrics}
                disabled={isRefreshing}
                title="Recalcular métricas del dashboard"
              >
                <RefreshCw size={16} className={isRefreshing ? styles.spinning : ''} />
                <span>Actualizar</span>
              </button>
            )}

            {/* Indicador de estado del backend - notación cuántica */}
            <div className={styles.statusBadge} data-status={apiStatus.status}>
              <span className={styles.statusQubit}>
                {apiStatus.status === 'online' && '|1⟩'}
                {apiStatus.status === 'offline' && '|0⟩'}
                {apiStatus.status === 'checking' && 'α|0⟩+β|1⟩'}
              </span>
              <Server size={18} className={styles.statusIcon} />
              <span className={styles.statusText}>
                {apiStatus.status === 'checking' && 'Verificando...'}
                {apiStatus.status === 'online' && 'Backend Online'}
                {apiStatus.status === 'offline' && 'Backend Offline'}
              </span>
              <div className={styles.statusIndicator}></div>
            </div>
          </div>
        </div>
      </header>}

      {/* Barra de vista activa */}
      {devFeatures.viewBar !== false && <ViewBar />}

      {/* Panel de favoritos */}
      {devFeatures.favoritesPanel !== false && <FavoritesPanel 
        isOpen={showFavoritesPanel} 
        onClose={() => setShowFavoritesPanel(false)} 
      />}

      {/* Banner offline - efecto decoherencia */}
      {devFeatures.offlineBanner !== false && apiStatus.status === 'offline' && (
        <div className={styles.offlineBanner}>
          <span className={styles.offlinePulse} />
          <span className={styles.decoherenceText}><FaExclamationTriangle className={styles.decoherenceIcon} /> Decoherencia detectada - Backend offline - Los datos mostrados son <strong>simulados</strong></span>
        </div>
      )}

      {/* NAV DE SECCIONES */}
      {devFeatures.dashboardNav !== false && <DashboardNav />}

      {/* MAIN CONTENT */}
      <main className={styles.main}>
        <div className={styles.container}>
          {/* Hero compacto + KPIs integrados para overview inmediato */}
          {devFeatures.heroKpis !== false && <section className={`${styles.heroCompact} ${styles.fadeInStagger2}`}>
            <div className={styles.heroHeader}>
              <div className={styles.heroTitleContainer}>
                <span className={styles.heroKet}>|</span>
                <h2 className={styles.heroTitle}>
                  <span className={styles.heroWord}>Quantum</span>
                  <span className={styles.heroWord}>Software</span>
                  <span className={styles.heroWord}>Ecosystem</span>
                  <span className={styles.heroWord}>Analytics</span>
                </h2>
                <span className={styles.heroKet}>⟩</span>
              </div>
              <p className={styles.heroSubtitle}>ENTANGLE</p>
            </div>
            
            {/* KPIs integrados en el hero para visibilidad inmediata */}
            <div id="section-kpis" className={styles.heroKPIs}>
              <KPISection data={data} />
            </div>

            {/* Asistente IA cuántico */}
            <div className={styles.heroChat}>
              <QuantumChat />
            </div>
            
            <p className={styles.heroFooter}>
              <span className={styles.heroEquation}>iℏ ∂/∂t |ψ⟩ = Ĥ |ψ⟩</span>
            </p>
          </section>}

          {devFeatures.quantumDividers !== false && <QuantumDivider />}

          {/* Gráficos interactivos con drill-down */}
          {devFeatures.chartsSection !== false && <div id="section-charts" className={styles.sectionAnchor}>
            <ChartsSection data={data} />
          </div>}

          {devFeatures.quantumDividers !== false && <QuantumDivider variant="large" />}

          {/* Banner portal al universo - justo antes de la sección de red */}
          {devFeatures.collabBanner !== false && <CollaborationBanner />}

          {/* Análisis de colaboración y ecosistema */}
          <div id="section-network" className={`${styles.sectionAnchor} ${styles.fadeInStagger4}`}>
            {devFeatures.networkGraph !== false && <NetworkGraph />}
            {devFeatures.contributorSankey !== false && <ContributorSankey />}
            {devFeatures.bridgeUsersTable !== false && <BridgeUsersTable />}
            {devFeatures.orgComparisonRadar !== false && <OrgComparisonRadar />}
            {devFeatures.techStackMap !== false && <TechStackMap />}
          </div>

          {devFeatures.quantumDividers !== false && <QuantumDivider />}

          {/* Tablas de detalle: Top Repos y Top Users */}
          {devFeatures.detailTables !== false && <div id="section-tables" className={`${styles.sectionAnchor} ${styles.fadeInStagger5}`}>
            <DetailTable />
          </div>}

          {/* Mensaje de alerta si el backend está offline */}
          {apiStatus.status === 'offline' && (
            <div className={styles.alertBox}>
              <div className={styles.alertIconWrapper}>
                <FaExclamationTriangle className={styles.alertIconSvg} />
              </div>
              <div className={styles.alertContent}>
                <h3>Decoherencia del Sistema</h3>
                <p className={styles.alertError}>{apiStatus.message}</p>
                <p className={styles.alertHint}>
                  El backend no responde - mostrando datos simulados. Los valores mostrados son de demostración y no reflejan el estado real del ecosistema cuántico.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Universo 3D de Colaboración - lazy loaded */}
      {devFeatures.universeView !== false && store.showCollaborationGraph && (
        <Suspense fallback={
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'linear-gradient(135deg, #1a1f2e 0%, #0f1419 50%, #0a0e14 100%)',
          }} />
        }>
          <UniverseView />
        </Suspense>
      )}

      {/* BLOCK UI - Bloqueo durante cambio de vista */}
      {isLoadingViewData && (
        <div className={styles.blockUI}>
          <div className={styles.blockUIContent}>
            <svg
              className={styles.blockUISpinner}
              viewBox="0 0 120 120" width="60" height="60"
            >
              <ellipse cx="60" cy="60" rx="50" ry="18" fill="none" stroke="rgba(0, 212, 228, 0.3)" strokeWidth="1.5" className={styles.atomOrbit1} />
              <ellipse cx="60" cy="60" rx="50" ry="18" fill="none" stroke="rgba(157, 111, 219, 0.3)" strokeWidth="1.5" className={styles.atomOrbit2} />
              <ellipse cx="60" cy="60" rx="50" ry="18" fill="none" stroke="rgba(0, 255, 159, 0.25)" strokeWidth="1.5" className={styles.atomOrbit3} />
              <circle r="4" fill="#00D4E4" filter="url(#blockGlow)">
                <animateMotion dur="2s" repeatCount="indefinite" path="M 110,60 A 50,18 0 1,1 10,60 A 50,18 0 1,1 110,60" />
              </circle>
              <circle r="3.5" fill="#9D6FDB" filter="url(#blockGlow)">
                <animateMotion dur="2.6s" repeatCount="indefinite" path="M 95,82.7 A 50,18 60 1,1 25,37.3 A 50,18 60 1,1 95,82.7" />
              </circle>
              <circle r="3" fill="#00ff9f" filter="url(#blockGlow)">
                <animateMotion dur="3.2s" repeatCount="indefinite" path="M 25,82.7 A 50,18 120 1,1 95,37.3 A 50,18 120 1,1 25,82.7" />
              </circle>
              <circle cx="60" cy="60" r="6" fill="rgba(0, 212, 228, 0.5)" className={styles.atomCore} />
              <circle cx="60" cy="60" r="3" fill="rgba(255, 255, 255, 0.7)" />
              <defs>
                <filter id="blockGlow" x="-200%" y="-200%" width="500%" height="500%">
                  <feGaussianBlur stdDeviation="4" result="g" />
                  <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
            </svg>
            <p className={styles.blockUIText}>
              Cargando vista personalizada...
            </p>
          </div>
        </div>
      )}

      {/* DEV MENU */}
      <DevMenu />

      {/* ADMIN PANEL */}
      <AdminPanel />

      {/* FOOTER CON CIRCUITO CUÁNTICO */}
      {devFeatures.footer !== false && <footer className={styles.footer}>
        {/* Separador ondulado */}
        <div className={styles.footerWave}>
          <svg viewBox="0 0 1200 40" preserveAspectRatio="none">
            <path 
              d="M0,20 Q150,0 300,20 T600,20 T900,20 T1200,20 L1200,40 L0,40 Z" 
              fill="var(--color-card)"
            />
          </svg>
        </div>

        <div className={styles.footerContent}>
          {/* Circuito cuántico decorativo */}
          <div className={styles.footerCircuit}>
            <svg viewBox="0 0 600 60" className={styles.circuitSvg} preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="circuitGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(0, 212, 228, 0.05)" />
                  <stop offset="15%" stopColor="rgba(0, 212, 228, 0.6)" />
                  <stop offset="50%" stopColor="rgba(157, 111, 219, 0.6)" />
                  <stop offset="85%" stopColor="rgba(0, 212, 228, 0.6)" />
                  <stop offset="100%" stopColor="rgba(0, 212, 228, 0.05)" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              {/* Líneas de qubit */}
              <line x1="50" y1="20" x2="550" y2="20" stroke="url(#circuitGrad)" strokeWidth="1.5" />
              <line x1="50" y1="40" x2="550" y2="40" stroke="url(#circuitGrad)" strokeWidth="1.5" />
              {/* Etiquetas de qubit */}
              <text x="30" y="24" fill="rgba(0, 212, 228, 0.7)" fontSize="10" fontFamily="var(--font-family-mono)" textAnchor="end">|0⟩</text>
              <text x="30" y="44" fill="rgba(157, 111, 219, 0.7)" fontSize="10" fontFamily="var(--font-family-mono)" textAnchor="end">|0⟩</text>
              {/* Puerta Hadamard */}
              <rect x="115" y="10" width="20" height="20" rx="3" fill="rgba(0, 212, 228, 0.06)" stroke="rgba(0, 212, 228, 0.7)" strokeWidth="1.5" className={styles.gateH} />
              <text x="125" y="24" fill="rgba(0, 212, 228, 0.9)" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="var(--font-family-mono)">H</text>
              {/* CNOT */}
              <circle cx="200" cy="20" r="6" fill="none" stroke="rgba(0, 212, 228, 0.7)" strokeWidth="1.5" className={styles.gateCNOT} />
              <line x1="200" y1="14" x2="200" y2="26" stroke="rgba(0, 212, 228, 0.7)" strokeWidth="1.5" />
              <line x1="194" y1="20" x2="206" y2="20" stroke="rgba(0, 212, 228, 0.7)" strokeWidth="1.5" />
              <line x1="200" y1="26" x2="200" y2="40" stroke="rgba(157, 111, 219, 0.6)" strokeWidth="1.5" strokeDasharray="3 2" />
              <circle cx="200" cy="40" r="4" fill="rgba(157, 111, 219, 0.6)" className={styles.gateCNOT} />
              {/* Puerta Z */}
              <rect x="280" y="10" width="20" height="20" rx="3" fill="rgba(0, 255, 159, 0.06)" stroke="rgba(0, 255, 159, 0.6)" strokeWidth="1.5" className={styles.gateZ} />
              <text x="290" y="24" fill="rgba(0, 255, 159, 0.8)" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="var(--font-family-mono)">Z</text>
              {/* Segundo Hadamard */}
              <rect x="355" y="30" width="20" height="20" rx="3" fill="rgba(157, 111, 219, 0.06)" stroke="rgba(157, 111, 219, 0.7)" strokeWidth="1.5" className={styles.gateH2} />
              <text x="365" y="44" fill="rgba(157, 111, 219, 0.9)" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="var(--font-family-mono)">H</text>
              {/* Medición */}
              <rect x="440" y="10" width="24" height="20" rx="3" fill="rgba(0, 212, 228, 0.06)" stroke="rgba(0, 212, 228, 0.6)" strokeWidth="1.5" className={styles.gateMeasure} />
              <path d="M 446,26 Q 452,16 458,26" fill="none" stroke="rgba(0, 212, 228, 0.7)" strokeWidth="1.5" />
              <line x1="452" y1="20" x2="456" y2="14" stroke="rgba(0, 212, 228, 0.7)" strokeWidth="1.5" />
              <rect x="440" y="30" width="24" height="20" rx="3" fill="rgba(157, 111, 219, 0.06)" stroke="rgba(157, 111, 219, 0.6)" strokeWidth="1.5" className={styles.gateMeasure} />
              <path d="M 446,46 Q 452,36 458,46" fill="none" stroke="rgba(157, 111, 219, 0.7)" strokeWidth="1.5" />
              <line x1="452" y1="40" x2="456" y2="34" stroke="rgba(157, 111, 219, 0.7)" strokeWidth="1.5" />
              {/* Estado final Bell */}
              <text x="570" y="32" fill="rgba(0, 212, 228, 0.7)" fontSize="10" fontFamily="var(--font-family-mono)" textAnchor="start" filter="url(#glow)">|Φ⁺⟩</text>
            </svg>
            <p className={styles.circuitLabel}>Circuito de Par de Bell - Estado máximamente entrelazado</p>
          </div>

          {/* Info del proyecto */}
          <div className={styles.footerInfo}>
            <div className={styles.footerBrand}>
              <span className={styles.footerLogo}>ENTANGLE</span>
              <span className={styles.footerTagline}>Quantum Software Ecosystem Analytics</span>
            </div>
            
            <div className={styles.footerMeta}>
              <span className={styles.footerYear}>© 2026</span>
              <span className={styles.footerDivider}>·</span>
              <span className={styles.footerProject}>Trabajo Fin de Grado</span>
              <span className={styles.footerDivider}>·</span>
              <span className={styles.footerUniversity}>Universidad de Castilla-La Mancha</span>
            </div>
          </div>
        </div>
      </footer>}
    </div>
  )
}

export default App