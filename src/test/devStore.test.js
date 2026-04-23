/**
 * Tests for devStore - Feature toggles management
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useDevStore, FEATURE_DEFINITIONS } from '../store/devStore'

describe('devStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useDevStore.setState({
      isDevMenuOpen: false,
      features: Object.fromEntries(
        Object.values(FEATURE_DEFINITIONS).flatMap(cat =>
          Object.entries(cat.features).map(([key, def]) => [key, def.default])
        )
      ),
    })
  })

  it('has initial features set to defaults', () => {
    const { features } = useDevStore.getState()
    expect(features.quantumBackground).toBe(true)
    expect(features.header).toBe(true)
    expect(features.detailTables).toBe(false)
  })

  it('toggleDevMenu opens and closes', () => {
    expect(useDevStore.getState().isDevMenuOpen).toBe(false)
    useDevStore.getState().toggleDevMenu()
    expect(useDevStore.getState().isDevMenuOpen).toBe(true)
    useDevStore.getState().toggleDevMenu()
    expect(useDevStore.getState().isDevMenuOpen).toBe(false)
  })

  it('closeDevMenu closes the menu', () => {
    useDevStore.setState({ isDevMenuOpen: true })
    useDevStore.getState().closeDevMenu()
    expect(useDevStore.getState().isDevMenuOpen).toBe(false)
  })

  it('toggleFeature flips a feature', () => {
    const initial = useDevStore.getState().features.quantumBackground
    useDevStore.getState().toggleFeature('quantumBackground')
    expect(useDevStore.getState().features.quantumBackground).toBe(!initial)
  })

  it('setFeature sets a specific value', () => {
    useDevStore.getState().setFeature('header', false)
    expect(useDevStore.getState().features.header).toBe(false)
    useDevStore.getState().setFeature('header', true)
    expect(useDevStore.getState().features.header).toBe(true)
  })

  it('enableAll activates all features', () => {
    useDevStore.getState().disableAll()
    useDevStore.getState().enableAll()
    const { features } = useDevStore.getState()
    Object.values(features).forEach(v => expect(v).toBe(true))
  })

  it('disableAll deactivates all features', () => {
    useDevStore.getState().disableAll()
    const { features } = useDevStore.getState()
    Object.values(features).forEach(v => expect(v).toBe(false))
  })

  it('enableCategory enables all features in a category', () => {
    useDevStore.getState().disableAll()
    useDevStore.getState().enableCategory('layout')
    const { features } = useDevStore.getState()
    const layoutKeys = Object.keys(FEATURE_DEFINITIONS.layout.features)
    layoutKeys.forEach(k => expect(features[k]).toBe(true))
    // Other categories should still be off
    expect(features.heroKpis).toBe(false)
  })

  it('disableCategory disables all features in a category', () => {
    useDevStore.getState().enableAll()
    useDevStore.getState().disableCategory('layout')
    const { features } = useDevStore.getState()
    const layoutKeys = Object.keys(FEATURE_DEFINITIONS.layout.features)
    layoutKeys.forEach(k => expect(features[k]).toBe(false))
    // Other categories should still be on
    expect(features.heroKpis).toBe(true)
  })

  it('enableCategory with invalid key is a no-op', () => {
    const before = { ...useDevStore.getState().features }
    useDevStore.getState().enableCategory('nonexistent')
    expect(useDevStore.getState().features).toEqual(before)
  })

  it('isolateFeature enables only one feature', () => {
    useDevStore.getState().isolateFeature('networkGraph')
    const { features } = useDevStore.getState()
    expect(features.networkGraph).toBe(true)
    Object.entries(features)
      .filter(([k]) => k !== 'networkGraph')
      .forEach(([, v]) => expect(v).toBe(false))
  })

  it('isEnabled returns correct state', () => {
    useDevStore.getState().setFeature('header', true)
    expect(useDevStore.getState().isEnabled('header')).toBe(true)
    useDevStore.getState().setFeature('header', false)
    expect(useDevStore.getState().isEnabled('header')).toBe(false)
  })

  it('FEATURE_DEFINITIONS has expected categories', () => {
    expect(FEATURE_DEFINITIONS).toHaveProperty('layout')
    expect(FEATURE_DEFINITIONS).toHaveProperty('secciones')
    expect(FEATURE_DEFINITIONS).toHaveProperty('colaboracion')
    expect(FEATURE_DEFINITIONS).toHaveProperty('especial')
  })
})
