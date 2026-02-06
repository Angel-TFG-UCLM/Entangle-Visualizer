/**
 * KPI Section - Grid de Tarjetas con Estadísticas
 * ================================================
 * 
 * Componente extraído de App.jsx (líneas 289-337)
 * Conectado a Zustand para mostrar métricas dinámicas basadas en filtros
 * 
 * Características:
 * - Reutiliza estilos existentes de App.module.css
 * - Se suscribe al store para actualizar conteos automáticamente
 * - Muestra datos filtrados (no estáticos como antes)
 * - Transiciones suaves al cambiar valores
 * 
 * Flujo de datos:
 * 1. Recibe mockData como prop (puede ser API data en el futuro)
 * 2. Calcula estadísticas basadas en filtros activos
 * 3. Renderiza grid de 3 tarjetas (Repos, Users, Orgs)
 * 
 * @module KPISection
 */

import { useMemo, useState, useEffect, useRef } from 'react'
import { Users, Database, Building2 } from 'lucide-react'
import { useDashboardStore } from '../../store/dashboardStore'
import styles from '../../App.module.css'

/**
 * Componente de número animado
 * Cuenta desde 0 al aparecer y transiciona suavemente entre valores
 */
function AnimatedNumber({ value, duration = 800, visible = true }) {
  const [displayValue, setDisplayValue] = useState(0)
  const prevValue = useRef(0)
  const hasAnimatedInitial = useRef(false)

  useEffect(() => {
    // No animar hasta que sea visible
    if (!visible) return

    // Primera vez: animar de 0 al valor real
    // Resto: animar del valor anterior al nuevo
    if (!hasAnimatedInitial.current || prevValue.current !== value) {
      const startValue = prevValue.current
      const endValue = value
      const animDuration = hasAnimatedInitial.current ? 400 : duration
      const startTime = Date.now()
      
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / animDuration, 1)
        
        // Easing function (ease-out cubic)
        const easeOut = 1 - Math.pow(1 - progress, 3)
        
        const currentValue = Math.round(startValue + (endValue - startValue) * easeOut)
        setDisplayValue(currentValue)
        
        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          prevValue.current = value
          hasAnimatedInitial.current = true
        }
      }
      
      requestAnimationFrame(animate)
    }
  }, [value, duration, visible])

  return (
    <span>
      {displayValue.toLocaleString()}
    </span>
  )
}

/**
 * Hook para animaciones de scroll con Intersection Observer
 */
function useScrollAnimation(threshold = 0.3) {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(element)
        }
      },
      { threshold, rootMargin: '0px 0px 0px 0px' }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold])

  return [ref, isVisible]
}

/**
 * Componente principal de KPIs
 * 
 * @param {Object} props
 * @param {Object} props.data - Datos del ecosistema { repositories, users, organizations }
 * @returns {JSX.Element}
 */
export default function KPISection({ data }) {
  // Obtener filtros activos del store
  const { selectedOrg, selectedLanguage, selectedRepo } = useDashboardStore()

  // Animaciones de scroll para cada tarjeta
  const [reposRef, reposVisible] = useScrollAnimation(0.2)
  const [usersRef, usersVisible] = useScrollAnimation(0.2)
  const [orgsRef, orgsVisible] = useScrollAnimation(0.2)

  // Protección contra datos no disponibles
  const repositories = data?.repositories || []
  const users = data?.users || []
  const organizations = data?.organizations || []

  // Calcular stats dinámicas basadas en filtros (con useMemo para optimizar)
  const stats = useMemo(() => {
    // --- Filtrar repositorios ---
    let filteredRepos = repositories
    if (selectedOrg) {
      filteredRepos = filteredRepos.filter(repo => 
        repo.owner?.login === selectedOrg ||
        repo.organization?.login === selectedOrg
      )
    }
    if (selectedLanguage) {
      filteredRepos = filteredRepos.filter(repo => 
        repo.primary_language?.name === selectedLanguage ||
        repo.language === selectedLanguage
      )
    }
    if (selectedRepo) {
      filteredRepos = filteredRepos.filter(repo => repo.full_name === selectedRepo)
    }

    // --- Filtrar usuarios ---
    let filteredUsers = users
    if (selectedOrg) {
      filteredUsers = filteredUsers.filter(user => 
        user.company === selectedOrg ||
        user.organizations?.includes(selectedOrg)
      )
    }
    if (selectedRepo) {
      const selectedRepoObj = repositories.find(r => r.full_name === selectedRepo)
      if (selectedRepoObj?.collaborators) {
        const collaboratorLogins = selectedRepoObj.collaborators.map(c => c.login)
        filteredUsers = filteredUsers.filter(user => collaboratorLogins.includes(user.login))
      }
    }

    // --- Filtrar organizaciones ---
    let filteredOrgs = organizations
    if (selectedOrg) {
      filteredOrgs = filteredOrgs.filter(org => org.login === selectedOrg)
    }
    if (selectedRepo) {
      const selectedRepoObj = repositories.find(r => r.full_name === selectedRepo)
      if (selectedRepoObj) {
        const repoOrg = selectedRepoObj.owner?.login || selectedRepoObj.organization?.login
        if (repoOrg) {
          filteredOrgs = filteredOrgs.filter(org => org.login === repoOrg)
        }
      }
    }
    if (selectedLanguage && repositories.length > 0) {
      const orgsWithLanguage = new Set(
        repositories
          .filter(r => 
            r.primary_language?.name === selectedLanguage ||
            r.language === selectedLanguage
          )
          .map(r => r.owner?.login || r.organization?.login)
          .filter(Boolean)
      )
      filteredOrgs = filteredOrgs.filter(org => orgsWithLanguage.has(org.login))
    }

    return {
      totalRepos: filteredRepos.length,
      totalUsers: filteredUsers.length,
      totalOrgs: filteredOrgs.length,
    }
  }, [repositories, users, organizations, selectedOrg, selectedLanguage, selectedRepo])

  // Determinar si hay filtros activos (para mostrar badge "Filtered")
  const hasFilters = selectedOrg || selectedLanguage || selectedRepo

  return (
    <section className={styles.statsGrid}>
      {/* Card: Repositorios */}
      <article 
        ref={reposRef}
        className={`${styles.statCard} ${styles.scrollReveal} ${reposVisible ? styles.scrollRevealed : ''}`}
      >
        <div className={styles.statHeader}>
          <Database className={styles.statIcon} size={32} />
          {hasFilters && (
            <div className={styles.statBadge}>
              <span className={styles.badgeText}>FILTERED</span>
            </div>
          )}
        </div>
        <div className={styles.statContent}>
          <h3 className={styles.statValue}>
            <AnimatedNumber value={stats.totalRepos} visible={reposVisible} />
          </h3>
          <p className={styles.statLabel}>Repositorios Analizados</p>
        </div>
      </article>

      {/* Card: Usuarios */}
      <article 
        ref={usersRef}
        className={`${styles.statCard} ${styles.scrollReveal} ${usersVisible ? styles.scrollRevealed : ''}`}
        style={{ transitionDelay: '0.1s' }}
      >
        <div className={styles.statHeader}>
          <Users className={styles.statIcon} size={32} />
          {hasFilters && (
            <div className={styles.statBadge}>
              <span className={styles.badgeText}>FILTERED</span>
            </div>
          )}
        </div>
        <div className={styles.statContent}>
          <h3 className={styles.statValue}>
            <AnimatedNumber value={stats.totalUsers} visible={usersVisible} />
          </h3>
          <p className={styles.statLabel}>Usuarios Registrados</p>
        </div>
      </article>

      {/* Card: Organizaciones */}
      <article 
        ref={orgsRef}
        className={`${styles.statCard} ${styles.scrollReveal} ${orgsVisible ? styles.scrollRevealed : ''}`}
        style={{ transitionDelay: '0.2s' }}
      >
        <div className={styles.statHeader}>
          <Building2 className={styles.statIcon} size={32} />
          {hasFilters && (
            <div className={styles.statBadge}>
              <span className={styles.badgeText}>FILTERED</span>
            </div>
          )}
        </div>
        <div className={styles.statContent}>
          <h3 className={styles.statValue}>
            <AnimatedNumber value={stats.totalOrgs} visible={orgsVisible} />
          </h3>
          <p className={styles.statLabel}>Organizaciones Indexadas</p>
        </div>
      </article>
    </section>
  )
}
