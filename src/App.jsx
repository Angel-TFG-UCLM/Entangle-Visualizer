/**
 * ENTANGLE - Dashboard Principal
 * ===============================
 * Vista principal de la SPA que muestra:
 * - Header con branding y estado del backend
 * - Grid de tarjetas con estadísticas (Repos, Users, Orgs)
 * 
 * Decisión arquitectónica: Este componente es el "layout base".
 * Usa Service Layer (api.js) en lugar de fetch directo.
 */

import { useEffect, useState } from 'react'
import { checkHealth, getDashboardStats } from './services/api'
import { Activity, Database, Server, Building2 } from 'lucide-react'
import styles from './App.module.css'

function App() {
  // === ESTADO LOCAL ===
  const [apiStatus, setApiStatus] = useState({
    status: 'checking', // 'checking' | 'online' | 'offline'
    message: 'Verificando conexión...',
  })

  // Estado para las estadísticas (ahora con datos reales)
  const [stats, setStats] = useState({
    repositories: { count: 0, label: 'Repositorios Analizados' },
    users: { count: 0, label: 'Usuarios Registrados' },
    organizations: { count: 0, label: 'Organizaciones Indexadas' },
  })

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [isExiting, setIsExiting] = useState(false)

  // === EFECTOS ===
  // Health Check y carga de estadísticas al montar el componente
  useEffect(() => {
    let isMounted = true // Evitar actualizaciones si el componente se desmonta
    let retryTimeout = null

    async function loadData(attempt = 1) {
      const MAX_RETRIES = 3
      const RETRY_DELAY = attempt * 2000 // Exponential backoff: 2s, 4s, 6s

      if (!isMounted) return

      setIsLoading(true)
      setError(null)
      
      try {
        // Health Check
        const healthResult = await checkHealth()
        
        if (!isMounted) return
        
        setApiStatus({
          status: healthResult.status,
          message: healthResult.message,
        })

        // Si el backend está online, cargar estadísticas reales
        if (healthResult.status === 'online') {
          try {
            const statsData = await getDashboardStats()
            
            if (!isMounted) return
            
            setStats({
              repositories: { 
                count: statsData.repositories || 0, 
                label: 'Repositorios Analizados'
              },
              users: { 
                count: statsData.users || 0, 
                label: 'Usuarios Registrados'
              },
              organizations: { 
                count: statsData.organizations || 0, 
                label: 'Organizaciones Indexadas'
              },
            })
            setError(null)
            setRetryCount(0)
            
            // Éxito: activar animación de salida
            setIsExiting(true)
            setTimeout(() => {
              if (isMounted) {
                setIsLoading(false)
              }
            }, 500)
          } catch (statsError) {
            console.error(`Error cargando estadísticas (intento ${attempt}/${MAX_RETRIES}):`, statsError)
            
            if (!isMounted) return
            
            // Retry automático si no se alcanzó el máximo
            if (attempt < MAX_RETRIES) {
              setError(`Error cargando datos. Reintentando en ${RETRY_DELAY / 1000}s...`)
              setRetryCount(attempt)
              retryTimeout = setTimeout(() => loadData(attempt + 1), RETRY_DELAY)
            } else {
              setError('No se pudieron cargar las estadísticas. Por favor, recarga la página.')
              setApiStatus({
                status: 'offline',
                message: 'Error de conexión',
              })
              
              // Error final: salir de la pantalla de carga
              setIsExiting(true)
              setTimeout(() => {
                if (isMounted) {
                  setIsLoading(false)
                }
              }, 500)
            }
          }
        } else {
          // Backend offline, pero intentar de nuevo si no se alcanzó el máximo
          if (attempt < MAX_RETRIES) {
            setError(`Backend no disponible. Reintentando (${attempt}/${MAX_RETRIES})...`)
            setRetryCount(attempt)
            retryTimeout = setTimeout(() => loadData(attempt + 1), RETRY_DELAY)
          } else {
            // Error final: backend offline después de 3 intentos
            setError('Backend no disponible. Por favor, verifica que esté corriendo.')
            
            // Salir de la pantalla de carga
            setIsExiting(true)
            setTimeout(() => {
              if (isMounted) {
                setIsLoading(false)
              }
            }, 500)
          }
        }
      } catch (healthError) {
        console.error(`Error en health check (intento ${attempt}/${MAX_RETRIES}):`, healthError)
        
        if (!isMounted) return
        
        // Retry para el health check también
        if (attempt < MAX_RETRIES) {
          setError(`Conectando al backend... (${attempt}/${MAX_RETRIES})`)
          setRetryCount(attempt)
          retryTimeout = setTimeout(() => loadData(attempt + 1), RETRY_DELAY)
        } else {
          setError('No se pudo conectar al backend. Verifica tu conexión.')
          setApiStatus({
            status: 'offline',
            message: 'Error de conexión',
          })
          
          // Error final: salir de la pantalla de carga
          setIsExiting(true)
          setTimeout(() => {
            if (isMounted) {
              setIsLoading(false)
            }
          }, 500)
        }
      }
    }

    loadData()

    // Cleanup: cancelar reintentos pendientes si el componente se desmonta
    return () => {
      isMounted = false
      if (retryTimeout) {
        clearTimeout(retryTimeout)
      }
    }
  }, [])

  // === RENDER ===
  
  // Mostrar pantalla de carga mientras está cargando o reintentando (pero no cuando está haciendo fadeOut exitoso)
  const shouldShowLoading = isLoading && !isExiting;
  
  if (shouldShowLoading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingContent}>
          <img 
            src="/logo.png" 
            alt="ENTANGLE Logo" 
            className={styles.loadingLogo}
          />
          <p className={styles.loadingSubtitle}>Quantum Software Ecosystem Analysis</p>
          
          <div className={styles.loadingSpinner}>
            <div className={styles.spinner}></div>
          </div>
          
          <p className={styles.loadingText}>
            {retryCount > 0 
              ? `Conectando al sistema... (Intento ${retryCount}/3)` 
              : 'Cargando datos del ecosistema...'}
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className={`${styles.app} ${styles.fadeInApp}`}>
      {/* HEADER */}
      <header className={styles.header}>
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
          <section className={styles.hero}>
            <h2>Sistema de Análisis de Ecosistemas de Software Cuántico</h2>
            <p className={styles.heroDescription}>
              Plataforma de extracción, procesamiento y visualización de datos del ecosistema GitHub.
              Desarrollado como TFG en la Universidad de Castilla-La Mancha.
            </p>
          </section>

          {/* Grid de estadísticas */}
          <section className={styles.statsGrid}>
            {/* Card: Repositorios */}
            <article className={styles.statCard}>
              <div className={styles.statHeader}>
                <Database className={styles.statIcon} size={32} />
              </div>
              <div className={styles.statContent}>
                <h3 className={styles.statValue}>
                  {isLoading ? '...' : (error ? 'N/A' : stats.repositories.count.toLocaleString())}
                </h3>
                <p className={styles.statLabel}>{stats.repositories.label}</p>
              </div>
            </article>

            {/* Card: Usuarios */}
            <article className={styles.statCard}>
              <div className={styles.statHeader}>
                <Activity className={styles.statIcon} size={32} />
              </div>
              <div className={styles.statContent}>
                <h3 className={styles.statValue}>
                  {isLoading ? '...' : (error ? 'N/A' : stats.users.count.toLocaleString())}
                </h3>
                <p className={styles.statLabel}>{stats.users.label}</p>
              </div>
            </article>

            {/* Card: Organizaciones */}
            <article className={styles.statCard}>
              <div className={styles.statHeader}>
                <Building2 className={styles.statIcon} size={32} />
              </div>
              <div className={styles.statContent}>
                <h3 className={styles.statValue}>
                  {isLoading ? '...' : (error ? 'N/A' : stats.organizations.count.toLocaleString())}
                </h3>
                <p className={styles.statLabel}>{stats.organizations.label}</p>
              </div>
            </article>
          </section>

          {/* Mensaje de alerta si el backend está offline */}
          {apiStatus.status === 'offline' && (
            <div className={styles.alertBox}>
              <div className={styles.alertIcon}>⚠️</div>
              <div className={styles.alertContent}>
                <h3>Backend no disponible</h3>
                <p>{apiStatus.message}</p>
                <p className={styles.alertHint}>
                  Verifica que el backend esté corriendo o revisa la URL en <code>src/services/api.js</code>
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