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

  // === ZUSTAND STORE ===
  // Datos del ecosistema (con valores por defecto)
  const store = useDashboardStore()
  const data = store.data || { organizations: [], users: [], repositories: [] }
  const fetchDashboardData = store.fetchDashboardData

  console.log('[App] Store data:', data)

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
          // Backend offline pero sin error crítico
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
            {loadingResult === null && <div className={styles.spinner}></div>}
            {loadingResult === 'success' && (
              <FaCheckCircle className={styles.successIcon} size={60} />
            )}
            {loadingResult === 'error' && (
              <FaTimesCircle className={styles.errorIcon} size={60} />
            )}
          </div>
          
          <p className={styles.loadingText}>
            {loadingResult === 'success' && '¡Conexión exitosa!'}
            {loadingResult === 'error' && 'Error de conexión'}
            {loadingResult === null && (
              retryCount > 0 
                ? `Conectando al sistema... (Intento ${retryCount}/3)` 
                : 'Cargando datos del ecosistema...'
            )}
          </p>
        </div>
      </div>
    )
  }
  
  console.log('[App] Rendering main app - isLoading:', isLoading, 'apiStatus:', apiStatus.status)
  console.log('[App] Data disponible:', data ? 'SÍ' : 'NO')

  return (
    <div className={`${styles.app} ${styles.fadeInApp}`}>
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
                <span className={styles.logoAccent}>ENTANGLE</span>
              </h1>
              <p className={styles.logoSub}>Quantum Software Ecosystem Analysis</p>
            </div>
          </div>

          {/* Indicador de estado del backend */}
          <div className={styles.statusBadge} data-status={apiStatus.status}>
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
          </section>

          {/* KPIs dinámicos conectados a Zustand */}
          <KPISection data={data} />

          {/* Gráficos interactivos con drill-down */}
          <ChartsSection data={data} />

          {/* Grafo de redes de colaboración */}
          <div className={styles.fadeInStagger4}>
            <NetworkGraph />
          </div>

          {/* Tablas de detalle: Top Repos y Top Users */}
          <div className={styles.fadeInStagger5}>
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

      {/* FOOTER */}
      <footer className={styles.footer}>
        <p>TFG UCLM 2025 - Análisis del Ecosistema de Software Cuántico</p>
      </footer>
    </div>
  )
}

export default App