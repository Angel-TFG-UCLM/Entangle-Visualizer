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
 * Los datos visualizados provienen de mockData (integrado via Zustand).
 */

import { useEffect, useState } from 'react'
import { checkHealth } from './services/api'
import { Server } from 'lucide-react'
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa'
import { useDashboardStore } from './store/dashboardStore'
import KPISection from './components/Dashboard/KPISection'
import ChartsSection from './components/Dashboard/ChartsSection'
import NetworkGraph from './components/Dashboard/NetworkGraph'
import DetailTable from './components/Dashboard/DetailTable'
import DashboardNav from './components/Dashboard/DashboardNav'
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
  const data = store.data || { organizations: [], users: [], repositories: [] }
  const fetchDashboardData = store.fetchDashboardData

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

        // Backend online → Cargar datos reales
        if (healthResult.status === 'online') {
          setRetryCount(0)
          
          // Cargar datos del dashboard desde backend (con caché inteligente)
          try {
            await fetchDashboardData()
            console.log('✅ Dashboard data loaded from backend')
          } catch (fetchError) {
            console.warn('⚠️ Backend online pero error al cargar datos:', fetchError)
            // No bloqueamos la UI, mockData sigue disponible
          }
          
          // Éxito: mostrar check verde
          setLoadingResult('success')
          
          // Esperar 800ms para que se aprecie el check, luego salir
          setTimeout(() => {
            if (isMounted) {
              setIsExiting(true)
              setTimeout(() => {
                if (isMounted) {
                  setIsLoading(false)
                }
              }, 500)
            }
          }, 800)
        } else {
          // Backend offline — reintentar con backoff incremental
          if (attempt < MAX_RETRIES) {
            console.warn(`⚠️ Backend offline — reintento ${attempt}/${MAX_RETRIES} en ${RETRY_DELAY / 1000}s...`)
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
            }, 800)
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
          }, 800)
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
            {loadingResult === null && (
              <svg className={styles.atomSpinner} viewBox="0 0 120 120" width="80" height="80">
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
            )}
            {loadingResult === 'success' && (
              <FaCheckCircle className={styles.successIcon} size={60} />
            )}
            {loadingResult === 'error' && (
              <FaTimesCircle className={styles.errorIcon} size={60} />
            )}
          </div>
          
          <p className={styles.loadingText}>
            {loadingResult === 'success' && '¡Conexión exitosa!'}
            {loadingResult === 'error' && 'Error de conexión — Decoherencia detectada'}
            {loadingResult === null && (
              <span className={styles.quantumPhrase} key={quantumPhrase}>
                {QUANTUM_PHRASES[quantumPhrase]}
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
  
  console.log('[App] Rendering main app - isLoading:', isLoading, 'apiStatus:', apiStatus.status)
  console.log('[App] Data disponible:', data ? 'SÍ' : 'NO')

  return (
    <div className={`${styles.app} ${styles.fadeInApp}`}>
      {/* FONDO DE PARTÍCULAS CUÁNTICAS */}
      <QuantumBackground />

      {/* HEADER */}
      <header className={`${styles.header} ${styles.fadeInStagger1}`}>
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

          {/* Indicador de estado del backend — notación cuántica */}
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
      </header>

      {/* Banner offline — efecto decoherencia */}
      {apiStatus.status === 'offline' && (
        <div className={styles.offlineBanner}>
          <span className={styles.offlinePulse} />
          <span className={styles.decoherenceText}>⚠️ Decoherencia detectada — Backend offline — Los datos mostrados son <strong>simulados</strong></span>
        </div>
      )}

      {/* NAV DE SECCIONES */}
      <DashboardNav />

      {/* MAIN CONTENT */}
      <main className={styles.main}>
        <div className={styles.container}>
          {/* Mensaje de bienvenida */}
          <section className={`${styles.hero} ${styles.fadeInStagger2}`}>
            <h2>Sistema de Análisis de Ecosistemas de Software Cuántico</h2>
            <p className={styles.heroDescription}>
              Plataforma de extracción, procesamiento y visualización de datos del ecosistema GitHub.
              Desarrollado como TFG en la Universidad de Castilla-La Mancha.
            </p>
            <div className={styles.heroQuantumRow}>
              <BlochSphere size={90} />
              <p className={styles.heroEquation}>iℏ ∂/∂t |ψ(t)⟩ = Ĥ |ψ(t)⟩</p>
              <BlochSphere size={90} />
            </div>
          </section>

          {/* KPIs dinámicos conectados a Zustand */}
          <div id="section-kpis" className={styles.sectionAnchor}>
            <KPISection data={data} />
          </div>

          <QuantumDivider />

          {/* Gráficos interactivos con drill-down */}
          <div id="section-charts" className={styles.sectionAnchor}>
            <ChartsSection data={data} />
          </div>

          <QuantumDivider variant="large" />

          {/* Grafo de redes de colaboración */}
          <div id="section-network" className={`${styles.sectionAnchor} ${styles.fadeInStagger4}`}>
            <NetworkGraph />
          </div>

          <QuantumDivider />

          {/* Tablas de detalle: Top Repos y Top Users */}
          <div id="section-tables" className={`${styles.sectionAnchor} ${styles.fadeInStagger5}`}>
            <DetailTable />
          </div>

          {/* Mensaje de alerta si el backend está offline */}
          {apiStatus.status === 'offline' && (
            <div className={styles.alertBox}>
              <div className={styles.alertIcon}>⚠️</div>
              <div className={styles.alertContent}>
                <h3>Backend no disponible</h3>
                <p>{apiStatus.message}</p>
                <p className={styles.alertHint}>
                  Mostrando datos de demostración. Verifica que el backend esté corriendo para ver datos reales.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* FOOTER CON CIRCUITO CUÁNTICO */}
      <footer className={styles.footer}>
        <div className={styles.footerCircuit}>
          <svg viewBox="0 0 600 60" className={styles.circuitSvg} preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="circuitGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(0, 212, 228, 0)" />
                <stop offset="20%" stopColor="rgba(0, 212, 228, 0.4)" />
                <stop offset="50%" stopColor="rgba(157, 111, 219, 0.4)" />
                <stop offset="80%" stopColor="rgba(0, 212, 228, 0.4)" />
                <stop offset="100%" stopColor="rgba(0, 212, 228, 0)" />
              </linearGradient>
            </defs>
            {/* Líneas de qubit */}
            <line x1="50" y1="20" x2="550" y2="20" stroke="url(#circuitGrad)" strokeWidth="1" />
            <line x1="50" y1="40" x2="550" y2="40" stroke="url(#circuitGrad)" strokeWidth="1" />
            {/* Etiquetas de qubit */}
            <text x="30" y="24" fill="rgba(0, 212, 228, 0.5)" fontSize="10" fontFamily="var(--font-family-mono)" textAnchor="end">|0⟩</text>
            <text x="30" y="44" fill="rgba(157, 111, 219, 0.5)" fontSize="10" fontFamily="var(--font-family-mono)" textAnchor="end">|0⟩</text>
            {/* Puerta Hadamard */}
            <rect x="115" y="10" width="20" height="20" rx="3" fill="none" stroke="rgba(0, 212, 228, 0.5)" strokeWidth="1" />
            <text x="125" y="24" fill="rgba(0, 212, 228, 0.7)" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="var(--font-family-mono)">H</text>
            {/* CNOT */}
            <circle cx="200" cy="20" r="6" fill="none" stroke="rgba(0, 212, 228, 0.5)" strokeWidth="1" />
            <line x1="200" y1="14" x2="200" y2="26" stroke="rgba(0, 212, 228, 0.5)" strokeWidth="1" />
            <line x1="194" y1="20" x2="206" y2="20" stroke="rgba(0, 212, 228, 0.5)" strokeWidth="1" />
            <line x1="200" y1="26" x2="200" y2="40" stroke="rgba(157, 111, 219, 0.4)" strokeWidth="1" strokeDasharray="3 2" />
            <circle cx="200" cy="40" r="4" fill="rgba(157, 111, 219, 0.4)" />
            {/* Puerta Z */}
            <rect x="280" y="10" width="20" height="20" rx="3" fill="none" stroke="rgba(0, 255, 159, 0.4)" strokeWidth="1" />
            <text x="290" y="24" fill="rgba(0, 255, 159, 0.6)" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="var(--font-family-mono)">Z</text>
            {/* Segundo Hadamard */}
            <rect x="355" y="30" width="20" height="20" rx="3" fill="none" stroke="rgba(157, 111, 219, 0.5)" strokeWidth="1" />
            <text x="365" y="44" fill="rgba(157, 111, 219, 0.7)" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="var(--font-family-mono)">H</text>
            {/* Medición */}
            <rect x="440" y="10" width="24" height="20" rx="3" fill="none" stroke="rgba(0, 212, 228, 0.4)" strokeWidth="1" />
            <path d="M 446,26 Q 452,16 458,26" fill="none" stroke="rgba(0, 212, 228, 0.5)" strokeWidth="1" />
            <line x1="452" y1="20" x2="456" y2="14" stroke="rgba(0, 212, 228, 0.5)" strokeWidth="1" />
            <rect x="440" y="30" width="24" height="20" rx="3" fill="none" stroke="rgba(157, 111, 219, 0.4)" strokeWidth="1" />
            <path d="M 446,46 Q 452,36 458,46" fill="none" stroke="rgba(157, 111, 219, 0.5)" strokeWidth="1" />
            <line x1="452" y1="40" x2="456" y2="34" stroke="rgba(157, 111, 219, 0.5)" strokeWidth="1" />
          </svg>
        </div>
        <p>TFG UCLM 2025 · Análisis del Ecosistema de Software Cuántico</p>
      </footer>
    </div>
  )
}

export default App