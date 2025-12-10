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

  // === EFECTOS ===
  // Health Check y carga de estadísticas al montar el componente
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      
      // Health Check
      const healthResult = await checkHealth()
      setApiStatus({
        status: healthResult.status,
        message: healthResult.message,
      })

      // Si el backend está online, cargar estadísticas reales
      if (healthResult.status === 'online') {
        try {
          const statsData = await getDashboardStats()
          
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
        } catch (error) {
          console.error('Error cargando estadísticas:', error)
        }
      }
      
      setIsLoading(false)
    }

    loadData()
  }, [])

  // === RENDER ===
  return (
    <div className={styles.app}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.branding}>
            <h1 className={styles.logo}>
              <span className={styles.logoAccent}>ENTANGLE</span>
            </h1>
            <p className={styles.logoSub}>Quantum Software Ecosystem Analysis</p>
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
                  {isLoading ? '...' : stats.repositories.count.toLocaleString()}
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
                  {isLoading ? '...' : stats.users.count.toLocaleString()}
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
                  {isLoading ? '...' : stats.organizations.count.toLocaleString()}
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