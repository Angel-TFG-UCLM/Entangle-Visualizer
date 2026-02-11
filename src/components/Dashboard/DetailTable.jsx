/**
 * Detail Table - Listas de Top Repositorios y Top Usuarios
 * =========================================================
 * 
 * Tablas modernas y minimalistas para mostrar datos detallados:
 * - Top Repositorios (estrellas, lenguaje, organización)
 * - Top Usuarios (expertise, contribuciones, organizaciones)
 * 
 * Estilo: Coherente con App.module.css (oscuro, hover effects, badges)
 * 
 * @module DetailTable
 */

import { useMemo } from 'react'
import { useDashboardStore } from '../../store/dashboardStore'
import styles from './DetailTable.module.css'

/**
 * Badge de lenguaje de programación
 */
function LanguageBadge({ language }) {
  const colors = {
    Python: '#3572A5',
    'Q#': '#178600',
    Julia: '#a270ba',
    'C++': '#f34b7d',
    Rust: '#dea584',
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
  }

  const color = colors[language] || '#6B7280'

  return (
    <span className={styles.badge} style={{ backgroundColor: `${color}20`, color }}>
      {language}
    </span>
  )
}

/**
 * Tabla de Top Repositorios
 */
function TopRepositoriesTable({ repositories }) {
  const { setFilter, selectedOrg } = useDashboardStore()

  const topRepos = repositories
    .sort((a, b) => (b.stargazer_count || 0) - (a.stargazer_count || 0))
    .slice(0, 10)

  return (
    <div className={styles.tableContainer}>
      <h3 className={styles.tableTitle}>⭐ Top Repositorios</h3>
      
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.tableHead}>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Organización</th>
              <th>Lenguaje</th>
              <th>Estrellas</th>
              <th>Forks</th>
            </tr>
          </thead>
          <tbody>
            {topRepos.map((repo, index) => (
              <tr 
                key={repo.id} 
                className={styles.tableRow}
                onClick={() => setFilter('org', repo.owner?.login || repo.organization?.login)}
              >
                <td className={styles.rank}>|{index + 1}⟩</td>
                <td className={styles.repoName}>
                  <div className={styles.nameCell}>
                    <span className={styles.primaryText}>{repo.name}</span>
                    {repo.description && (
                      <span className={styles.secondaryText}>{repo.description.slice(0, 60)}...</span>
                    )}
                  </div>
                </td>
                <td>
                  <span 
                    className={`${styles.orgBadge} ${selectedOrg === (repo.owner?.login || repo.organization?.login) ? styles.selected : ''}`}
                  >
                    {repo.owner?.login || repo.organization?.login}
                  </span>
                </td>
                <td>
                  <LanguageBadge language={repo.primary_language?.name || repo.language || 'N/A'} />
                </td>
                <td className={styles.numeric}>
                  {(repo.stargazer_count || 0).toLocaleString()}
                </td>
                <td className={styles.numeric}>
                  {(repo.forks_count || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Tabla de Top Usuarios
 */
function TopUsersTable({ users }) {
  const { setFilter } = useDashboardStore()

  const topUsers = users
    .sort((a, b) => (b.quantum_expertise_score || 0) - (a.quantum_expertise_score || 0))
    .slice(0, 10)

  return (
    <div className={styles.tableContainer}>
      <h3 className={styles.tableTitle}>👥 Top Contribuidores</h3>
      
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.tableHead}>
            <tr>
              <th>#</th>
              <th>Nombre</th>
              <th>Expertise</th>
              <th>Contribuciones</th>
              <th>Organizaciones</th>
            </tr>
          </thead>
          <tbody>
            {topUsers.map((user, index) => {
              const expertise = user.quantum_expertise_score || 0
              const expertiseClass = 
                expertise >= 90 ? styles.expertiseMaster :
                expertise >= 75 ? styles.expertiseExpert :
                expertise >= 50 ? styles.expertiseIntermediate :
                styles.expertiseBeginner
              const expertiseLabel =
                expertise >= 90 ? 'Qubit Master' :
                expertise >= 75 ? 'Entangled' :
                expertise >= 50 ? 'Superposed' :
                'Ground State'

              return (
                <tr 
                  key={user.id} 
                  className={styles.tableRow}
                >
                  <td className={styles.rank}>|{index + 1}⟩</td>
                  <td className={styles.userName}>
                    <div className={styles.nameCell}>
                      <img 
                        src={user.avatar_url} 
                        alt={user.name || user.login}
                        className={styles.avatar}
                      />
                      <div>
                        <span className={styles.primaryText}>{user.name || user.login}</span>
                        <span className={styles.secondaryText}>@{user.login}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.expertiseBadge} ${expertiseClass}`} title={expertiseLabel}>
                      {expertise.toFixed(1)}
                      <span className={styles.expertiseQuantumLabel}>{expertiseLabel}</span>
                    </span>
                  </td>
                  <td className={styles.numeric}>
                    {(user.contributions_to_quantum || user.quantum_repos_count || 0).toLocaleString()}
                  </td>
                  <td>
                    <div className={styles.orgList}>
                      {user.organizations?.slice(0, 2).map(org => {
                        const orgName = typeof org === 'string' ? org : (org.login || org.name || '')
                        return (
                          <span 
                            key={orgName}
                            className={styles.orgTag}
                            onClick={(e) => {
                              e.stopPropagation()
                              setFilter('org', orgName)
                            }}
                          >
                            {orgName}
                          </span>
                        )
                      })}
                      {user.organizations?.length > 2 && (
                        <span className={styles.moreOrgs}>+{user.organizations.length - 2}</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Componente principal - Grid de 2 tablas lado a lado
 * 
 * OPTIMIZADO: Usa datos pre-calculados del backend cuando no hay filtros.
 */
export default function DetailTable() {
  const { data, selectedOrg, selectedLanguage, selectedRepo, tables } = useDashboardStore()
  
  // Verificar si hay filtros activos
  const hasFilters = selectedOrg || selectedLanguage || selectedRepo

  const filteredRepos = useMemo(() => {
    // Si no hay filtros y tenemos tablas pre-calculadas, usarlas
    if (!hasFilters && tables?.repositories?.length > 0) {
      return tables.repositories
    }
    
    // Con filtros: calcular desde data
    let filtered = data.repositories

    if (selectedOrg) {
      filtered = filtered.filter(repo => 
        repo.owner?.login === selectedOrg ||
        repo.organization?.login === selectedOrg
      )
    }

    if (selectedLanguage) {
      filtered = filtered.filter(repo => 
        repo.primary_language?.name === selectedLanguage ||
        repo.language === selectedLanguage
      )
    }

    if (selectedRepo) {
      filtered = filtered.filter(repo => repo.full_name === selectedRepo)
    }

    return filtered
  }, [data.repositories, selectedOrg, selectedLanguage, selectedRepo, hasFilters, tables?.repositories])

  const filteredUsers = useMemo(() => {
    // Si no hay filtros y tenemos tablas pre-calculadas, usarlas
    if (!hasFilters && tables?.users?.length > 0) {
      return tables.users
    }
    
    // Con filtros: calcular desde data
    let filtered = data.users

    if (selectedOrg) {
      filtered = filtered.filter(user => 
        user.company === selectedOrg ||
        user.organizations?.some(org => (typeof org === 'string' ? org : org?.login) === selectedOrg)
      )
    }

    if (selectedRepo) {
      const selectedRepoObj = data.repositories.find(r => r.full_name === selectedRepo)
      if (selectedRepoObj?.collaborators) {
        const collaboratorLogins = selectedRepoObj.collaborators.map(c => c.login)
        filtered = filtered.filter(user => collaboratorLogins.includes(user.login))
      }
    }

    return filtered.sort((a, b) => 
      (b.quantum_expertise_score || 0) - (a.quantum_expertise_score || 0)
    )
  }, [data.users, data.repositories, selectedOrg, selectedRepo, hasFilters, tables?.users])

  return (
    <section className={styles.detailSection}>
      <div className={styles.tablesGrid}>
        <TopRepositoriesTable repositories={filteredRepos} />
        <TopUsersTable users={filteredUsers} />
      </div>
    </section>
  )
}
