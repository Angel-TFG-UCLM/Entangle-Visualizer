/**
 * Tests for computeTemporalVisibility utility function
 * from dashboardStore.js
 */
import { describe, it, expect } from 'vitest'
import { computeTemporalVisibility } from '../store/dashboardStore'

describe('computeTemporalVisibility', () => {
  const baseNodes = [
    { id: 'repo_a', type: 'repo', pushed_at_year: 2020 },
    { id: 'repo_b', type: 'repo', pushed_at_year: 2022 },
    { id: 'repo_c', type: 'repo', pushed_at_year: 2024 },
    { id: 'user_alice', type: 'user' },
    { id: 'org_quantum', type: 'org' },
  ]

  const baseLinks = [
    { source: 'user_alice', target: 'repo_a', type: 'contributed_to' },
    { source: 'user_alice', target: 'repo_b', type: 'contributed_to' },
    { source: 'org_quantum', target: 'repo_c', type: 'owns' },
  ]

  it('returns null when nodes are empty', () => {
    expect(computeTemporalVisibility([], baseLinks, 2020, 2024)).toBeNull()
  })

  it('returns null when no year filters provided', () => {
    expect(computeTemporalVisibility(baseNodes, baseLinks, null, null)).toBeNull()
  })

  it('filters repos by yearFrom', () => {
    const result = computeTemporalVisibility(baseNodes, baseLinks, 2022, null)
    expect(result).toBeInstanceOf(Map)
    expect(result.has('repo_a')).toBe(false) // 2020 < 2022
    expect(result.has('repo_b')).toBe(true)  // 2022 >= 2022
    expect(result.has('repo_c')).toBe(true)  // 2024 >= 2022
  })

  it('filters repos by yearTo', () => {
    const result = computeTemporalVisibility(baseNodes, baseLinks, null, 2021)
    expect(result).toBeInstanceOf(Map)
    expect(result.has('repo_a')).toBe(true)  // 2020 <= 2021
    expect(result.has('repo_b')).toBe(false) // 2022 > 2021
    expect(result.has('repo_c')).toBe(false) // 2024 > 2021
  })

  it('propagates visibility to users via contributed_to links', () => {
    const result = computeTemporalVisibility(baseNodes, baseLinks, null, 2022)
    expect(result.has('user_alice')).toBe(true) // connected to repo_a and repo_b
    expect(result.get('user_alice')).toBe(1.0)
  })

  it('propagates visibility to orgs via owns links', () => {
    const result = computeTemporalVisibility(baseNodes, baseLinks, null, 2024)
    expect(result.has('org_quantum')).toBe(true) // owns repo_c
  })

  it('handles fractional yearTo for gradual appearance', () => {
    // yearTo = 2021.5 means repos in 2022 get 0.5 visibility
    const result = computeTemporalVisibility(baseNodes, baseLinks, null, 2021.5)
    expect(result.get('repo_a')).toBe(1.0)      // 2020 <= 2021
    expect(result.get('repo_b')).toBeCloseTo(0.5) // 2022 = floor(2021.5) + 1
    expect(result.has('repo_c')).toBe(false)     // 2024 > 2022
  })

  it('handles range filter', () => {
    const result = computeTemporalVisibility(baseNodes, baseLinks, 2021, 2023)
    expect(result.has('repo_a')).toBe(false) // 2020 < 2021
    expect(result.has('repo_b')).toBe(true)  // 2022 in [2021, 2023]
    expect(result.has('repo_c')).toBe(false) // 2024 > 2023
  })

  it('returns null for null/undefined node list', () => {
    expect(computeTemporalVisibility(null, baseLinks, 2020, 2024)).toBeNull()
  })

  it('handles repos without pushed_at_year', () => {
    const nodes = [
      { id: 'repo_x', type: 'repo' }, // no pushed_at_year
    ]
    const result = computeTemporalVisibility(nodes, [], null, 2024)
    expect(result).toBeInstanceOf(Map)
    expect(result.has('repo_x')).toBe(false)
  })
})
