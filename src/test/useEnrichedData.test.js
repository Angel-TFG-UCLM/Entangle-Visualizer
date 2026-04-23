/**
 * Tests for useEnrichedData hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock dashboardStore
vi.mock('../store/dashboardStore', () => ({
  useDashboardStore: vi.fn(),
}))

import { useDashboardStore } from '../store/dashboardStore'
import { useEnrichedData } from '../hooks/useEnrichedData'

describe('useEnrichedData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns raw data when charts is null (mock mode)', () => {
    const mockData = {
      organizations: [{ login: 'qiskit', name: 'Qiskit' }],
      users: [{ login: 'alice', contributions_to_quantum: 50 }],
      repositories: [{ full_name: 'org/repo', language: 'Python' }],
    }
    useDashboardStore.mockReturnValue({ data: mockData, charts: null })

    const { result } = renderHook(() => useEnrichedData())

    expect(result.current.organizations).toEqual(mockData.organizations)
    expect(result.current.users).toEqual(mockData.users)
    expect(result.current.repositories).toEqual(mockData.repositories)
  })

  it('returns empty arrays when data is null', () => {
    useDashboardStore.mockReturnValue({ data: null, charts: null })

    const { result } = renderHook(() => useEnrichedData())

    expect(result.current.organizations).toEqual([])
    expect(result.current.users).toEqual([])
    expect(result.current.repositories).toEqual([])
  })

  it('enriches users from charts data', () => {
    useDashboardStore.mockReturnValue({
      data: {
        organizations: [],
        users: [{ login: 'alice' }], // no contributions_to_quantum
        repositories: [],
      },
      charts: {
        users: [{ login: 'alice', total_contributions: 100, top_languages: ['Python'] }],
        organizations: {},
        repositories: {},
      },
    })

    const { result } = renderHook(() => useEnrichedData())

    expect(result.current.users[0].contributions_to_quantum).toBe(100)
    expect(result.current.users[0].top_quantum_languages).toEqual(['Python'])
  })

  it('enriches organizations from charts data', () => {
    useDashboardStore.mockReturnValue({
      data: {
        organizations: [{ login: 'qiskit' }],
        users: [],
        repositories: [],
      },
      charts: {
        users: [],
        organizations: {
          byRepos: [{ login: 'qiskit', quantum_repositories_count: 42, total_stars: 5000 }],
        },
        repositories: {},
      },
    })

    const { result } = renderHook(() => useEnrichedData())

    expect(result.current.organizations[0].quantum_repos_count).toBe(42)
    expect(result.current.organizations[0].total_stars).toBe(5000)
  })

  it('enriches repositories from charts data', () => {
    useDashboardStore.mockReturnValue({
      data: {
        organizations: [],
        users: [],
        repositories: [{ full_name: 'org/repo', owner: { login: 'org' } }],
      },
      charts: {
        users: [],
        organizations: {},
        repositories: {
          byStars: [{ full_name: 'org/repo', primary_language: 'Python', fork_count: 10 }],
        },
      },
    })

    const { result } = renderHook(() => useEnrichedData())

    expect(result.current.repositories[0].language).toBe('Python')
    expect(result.current.repositories[0].fork_count).toBe(10)
    expect(result.current.repositories[0].organization).toEqual({ login: 'org' })
  })

  it('handles users with byContributions nested structure', () => {
    useDashboardStore.mockReturnValue({
      data: {
        organizations: [],
        users: [{ login: 'bob' }],
        repositories: [],
      },
      charts: {
        users: { byContributions: [{ login: 'bob', total_contributions: 200, bio: 'Developer' }] },
        organizations: {},
        repositories: {},
      },
    })

    const { result } = renderHook(() => useEnrichedData())

    expect(result.current.users[0].contributions_to_quantum).toBe(200)
    expect(result.current.users[0].bio).toBe('Developer')
  })
})
