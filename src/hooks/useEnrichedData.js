/**
 * useEnrichedData - Hook para enriquecer datos del store
 * ========================================================
 * 
 * El store tiene dos fuentes de datos:
 * - `data` (de graph): proyección ligera para el 3D Universe (pocos campos)
 * - `charts`: datos enriquecidos con campos completos del backend
 * 
 * Cuando los datos vienen del backend, `data` (graph) no tiene campos como:
 * - repos: language, primary_language, organization
 * - users: contributions_to_quantum, top_quantum_languages, bio
 * - orgs: quantum_repos_count, top_languages
 * 
 * Este hook fusiona ambas fuentes para que los componentes analíticos
 * tengan acceso a todos los campos necesarios.
 * 
 * En modo mock, `data` ya tiene todos los campos y `charts` es null,
 * así que devuelve `data` tal cual.
 * 
 * @module useEnrichedData
 */

import { useMemo } from 'react'
import { useDashboardStore } from '../store/dashboardStore'

/**
 * Hook que devuelve { organizations, users, repositories } enriquecidos.
 * Fusiona data (graph ligero) con charts (datos completos del backend).
 */
export function useEnrichedData() {
  const { data, charts } = useDashboardStore()

  return useMemo(() => {
    const baseOrgs = data?.organizations || []
    const baseUsers = data?.users || []
    const baseRepos = data?.repositories || []

    // Si no hay charts (modo mock), data ya tiene todo
    if (!charts) {
      return { organizations: baseOrgs, users: baseUsers, repositories: baseRepos }
    }

    // === ENRIQUECER USUARIOS ===
    const chartsUserMap = new Map()
    ;(charts.users || []).forEach(u => {
      if (u.login) chartsUserMap.set(u.login, u)
    })

    const enrichedUsers = baseUsers.map(u => {
      const cu = chartsUserMap.get(u.login)
      if (!cu) return u
      return {
        ...u,
        // contributions_to_quantum (mock) ↔ total_contributions (backend charts)
        contributions_to_quantum: u.contributions_to_quantum ?? cu.total_contributions ?? 0,
        // top_quantum_languages (mock) ↔ top_languages (backend charts)
        top_quantum_languages: u.top_quantum_languages ?? cu.top_languages ?? [],
        bio: u.bio ?? cu.bio ?? null,
        company: u.company ?? cu.company ?? null,
        followers_count: u.followers_count ?? cu.followers_count ?? 0,
        relevant_repos_count: u.relevant_repos_count ?? cu.relevant_repos_count ?? 0,
      }
    })

    // === ENRIQUECER ORGANIZACIONES ===
    const chartsOrgMap = new Map()
    const orgSources = charts.organizations || {}
    const allChartOrgs = [
      ...(Array.isArray(orgSources) ? orgSources : []),
      ...(orgSources.byRepos || []),
      ...(orgSources.byStars || []),
      ...(orgSources.byQuantumFocus || []),
      ...(orgSources.byContributors || []),
    ]
    allChartOrgs.forEach(o => {
      if (o.login && !chartsOrgMap.has(o.login)) chartsOrgMap.set(o.login, o)
    })

    const enrichedOrgs = baseOrgs.map(o => {
      const co = chartsOrgMap.get(o.login)
      if (!co) return o
      return {
        ...o,
        // quantum_repos_count (mock) ↔ quantum_repositories_count (backend)
        quantum_repos_count: o.quantum_repos_count ?? co.quantum_repositories_count ?? 0,
        top_languages: o.top_languages ?? co.top_languages ?? [],
        total_stars: o.total_stars ?? co.total_stars ?? 0,
        quantum_contributors_count: o.quantum_contributors_count ?? co.quantum_contributors_count ?? 0,
        total_repositories_count: o.total_repositories_count ?? co.total_repositories_count ?? 0,
        total_unique_contributors: o.total_unique_contributors ?? co.total_unique_contributors ?? 0,
        description: o.description ?? co.description ?? null,
      }
    })

    // === ENRIQUECER REPOSITORIOS ===
    // charts.repositories viene como { byStars: [...], byForks: [...], byCollaborators: [...] }
    const chartsRepoMap = new Map()
    const repoSources = charts.repositories || {}
    const allChartRepos = [
      ...(Array.isArray(repoSources) ? repoSources : []),
      ...(repoSources.byStars || []),
      ...(repoSources.byForks || []),
      ...(repoSources.byCollaborators || []),
    ]
    allChartRepos.forEach(r => {
      if (r.full_name && !chartsRepoMap.has(r.full_name)) {
        chartsRepoMap.set(r.full_name, r)
      }
    })

    const enrichedRepos = baseRepos.map(r => {
      const cr = chartsRepoMap.get(r.full_name)
      const langFromCharts = cr?.primary_language
      return {
        ...r,
        // language: string directo (mock tiene 'Python', backend charts tiene primary_language como string)
        language: r.language ?? langFromCharts ?? r.primary_language?.name ?? null,
        // primary_language: objeto { name } (mock) o string (backend)
        primary_language: r.primary_language ?? (langFromCharts ? { name: langFromCharts } : null),
        // organization: { login } (mock tiene organization, backend graph solo tiene owner)
        organization: r.organization ?? (r.owner ? { login: r.owner.login } : null),
        // Campos adicionales si vienen de charts
        fork_count: r.fork_count ?? cr?.fork_count ?? 0,
        collaborators_count: r.collaborators_count ?? cr?.collaborators_count ?? 0,
        is_quantum: r.is_quantum ?? true,
      }
    })

    return {
      organizations: enrichedOrgs,
      users: enrichedUsers,
      repositories: enrichedRepos,
    }
  }, [data, charts])
}
