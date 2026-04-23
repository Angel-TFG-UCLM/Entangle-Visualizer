/**
 * Tests for favoritesStore - Zustand store for favorites and views
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the api module
vi.mock('../services/api', () => ({
  getFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  getViews: vi.fn(),
  saveView: vi.fn(),
  deleteView: vi.fn(),
  getViewData: vi.fn(),
  exportUserData: vi.fn(),
  importUserData: vi.fn(),
}))

import useFavoritesStore from '../store/favoritesStore'
import * as api from '../services/api'

describe('favoritesStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFavoritesStore.setState({
      favorites: [],
      views: [],
      activeViewId: null,
      activeViewData: null,
      isLoading: false,
      isLoadingViewData: false,
      error: null,
      lastSynced: null,
      _viewDataCache: {},
    })
  })

  describe('loadFavorites', () => {
    it('loads favorites from API', async () => {
      const mockFavs = [{ id: 'r1', type: 'repository', name: 'repo1' }]
      api.getFavorites.mockResolvedValueOnce(mockFavs)

      await useFavoritesStore.getState().loadFavorites()

      expect(useFavoritesStore.getState().favorites).toEqual(mockFavs)
      expect(useFavoritesStore.getState().lastSynced).toBeTruthy()
    })

    it('handles error gracefully', async () => {
      api.getFavorites.mockRejectedValueOnce(new Error('fail'))
      await useFavoritesStore.getState().loadFavorites()
      // Should not throw, favorites stay empty
      expect(useFavoritesStore.getState().favorites).toEqual([])
    })
  })

  describe('toggleFavorite', () => {
    it('adds a new favorite', async () => {
      api.addFavorite.mockResolvedValueOnce({
        success: true,
        favorite: { id: 'r1', type: 'repository', name: 'repo1', added_at: '2024-01-01' },
      })

      await useFavoritesStore.getState().toggleFavorite({
        id: 'r1', type: 'repository', name: 'repo1',
      })

      expect(useFavoritesStore.getState().favorites).toHaveLength(1)
      expect(useFavoritesStore.getState().isLoading).toBe(false)
    })

    it('removes an existing favorite', async () => {
      useFavoritesStore.setState({
        favorites: [{ id: 'r1', type: 'repository', name: 'repo1' }],
      })
      api.removeFavorite.mockResolvedValueOnce({ success: true })

      await useFavoritesStore.getState().toggleFavorite({ id: 'r1' })

      expect(useFavoritesStore.getState().favorites).toHaveLength(0)
    })

    it('handles error on toggle', async () => {
      api.addFavorite.mockRejectedValueOnce(new Error('server down'))

      await useFavoritesStore.getState().toggleFavorite({
        id: 'r1', type: 'repository', name: 'repo1',
      })

      expect(useFavoritesStore.getState().error).toBeTruthy()
      expect(useFavoritesStore.getState().isLoading).toBe(false)
    })
  })

  describe('isFavorite', () => {
    it('returns true for favorited entity', () => {
      useFavoritesStore.setState({
        favorites: [{ id: 'r1' }],
      })
      expect(useFavoritesStore.getState().isFavorite('r1')).toBe(true)
    })

    it('returns false for non-favorited entity', () => {
      expect(useFavoritesStore.getState().isFavorite('r1')).toBe(false)
    })
  })

  describe('loadViews', () => {
    it('loads views from API', async () => {
      const mockViews = [{ id: 'v1', name: 'View 1', entity_ids: ['r1'] }]
      api.getViews.mockResolvedValueOnce(mockViews)

      await useFavoritesStore.getState().loadViews()

      expect(useFavoritesStore.getState().views).toEqual(mockViews)
    })
  })

  describe('createView', () => {
    it('creates a new view', async () => {
      api.saveView.mockResolvedValueOnce({
        success: true,
        view: { id: 'v1', name: 'My View', entity_ids: ['r1'] },
      })

      await useFavoritesStore.getState().createView('My View', ['r1'])

      expect(useFavoritesStore.getState().views).toHaveLength(1)
    })
  })

  describe('removeView', () => {
    it('removes a view', async () => {
      useFavoritesStore.setState({
        views: [{ id: 'v1', name: 'View 1' }],
      })
      api.deleteView.mockResolvedValueOnce({ success: true })

      await useFavoritesStore.getState().removeView('v1')

      expect(useFavoritesStore.getState().views).toHaveLength(0)
    })

    it('clears active view when removed', async () => {
      useFavoritesStore.setState({
        views: [{ id: 'v1', name: 'View 1' }],
        activeViewId: 'v1',
        activeViewData: { some: 'data' },
      })
      api.deleteView.mockResolvedValueOnce({ success: true })

      await useFavoritesStore.getState().removeView('v1')
      expect(useFavoritesStore.getState().activeViewId).toBeNull()
      expect(useFavoritesStore.getState().activeViewData).toBeNull()
    })

    it('handles error on removeView', async () => {
      useFavoritesStore.setState({
        views: [{ id: 'v1', name: 'View 1' }],
      })
      api.deleteView.mockRejectedValueOnce(new Error('fail'))

      await expect(useFavoritesStore.getState().removeView('v1')).rejects.toThrow()
      expect(useFavoritesStore.getState().error).toBe('fail')
    })
  })

  describe('updateView', () => {
    it('updates an existing view', async () => {
      useFavoritesStore.setState({
        views: [{ id: 'v1', name: 'Old', entity_ids: ['r1'], color: '#fff' }],
      })
      api.saveView.mockResolvedValueOnce({
        view: { id: 'v1', name: 'Updated', entity_ids: ['r1', 'r2'], color: '#fff' },
      })

      await useFavoritesStore.getState().updateView('v1', { name: 'Updated', entity_ids: ['r1', 'r2'] })
      expect(useFavoritesStore.getState().views[0].name).toBe('Updated')
    })

    it('does nothing if view not found', async () => {
      await useFavoritesStore.getState().updateView('nonexistent', { name: 'X' })
      expect(api.saveView).not.toHaveBeenCalled()
    })

    it('handles error on updateView', async () => {
      useFavoritesStore.setState({
        views: [{ id: 'v1', name: 'Old', entity_ids: ['r1'] }],
      })
      api.saveView.mockRejectedValueOnce(new Error('update fail'))

      await expect(useFavoritesStore.getState().updateView('v1', { name: 'X' })).rejects.toThrow()
      expect(useFavoritesStore.getState().error).toBe('update fail')
    })
  })

  describe('getFavoritesByType', () => {
    it('filters favorites by type', () => {
      useFavoritesStore.setState({
        favorites: [
          { id: 'r1', type: 'repository' },
          { id: 'u1', type: 'user' },
          { id: 'r2', type: 'repository' },
        ],
      })
      expect(useFavoritesStore.getState().getFavoritesByType('repository')).toHaveLength(2)
      expect(useFavoritesStore.getState().getFavoritesByType('user')).toHaveLength(1)
    })
  })

  describe('createViewFromAllFavorites', () => {
    it('creates view from all favorites', async () => {
      useFavoritesStore.setState({
        favorites: [{ id: 'r1' }, { id: 'u1' }],
      })
      api.saveView.mockResolvedValueOnce({
        view: { id: 'v1', name: 'All Favs', entity_ids: ['r1', 'u1'], color: '#ff0' },
      })

      const view = await useFavoritesStore.getState().createViewFromAllFavorites('All Favs', '#ff0')
      expect(view.entity_ids).toEqual(['r1', 'u1'])
    })

    it('throws when no favorites', async () => {
      await expect(
        useFavoritesStore.getState().createViewFromAllFavorites('Empty', '#fff')
      ).rejects.toThrow('No hay favoritos')
    })
  })

  describe('activateView', () => {
    it('deactivates view when null', async () => {
      useFavoritesStore.setState({ activeViewId: 'v1', activeViewData: { x: 1 } })
      await useFavoritesStore.getState().activateView(null)
      expect(useFavoritesStore.getState().activeViewId).toBeNull()
      expect(useFavoritesStore.getState().activeViewData).toBeNull()
    })

    it('uses cache when available', async () => {
      useFavoritesStore.setState({ _viewDataCache: { v1: { cached: true } } })
      await useFavoritesStore.getState().activateView('v1')
      expect(useFavoritesStore.getState().activeViewData).toEqual({ cached: true })
      expect(api.getViewData).not.toHaveBeenCalled()
    })

    it('loads view data from API without cache', async () => {
      api.getViewData.mockResolvedValueOnce({ kpis: { total: 5 } })
      await useFavoritesStore.getState().activateView('v1')
      expect(useFavoritesStore.getState().activeViewData).toEqual({ kpis: { total: 5 } })
      expect(useFavoritesStore.getState().isLoadingViewData).toBe(false)
    })

    it('handles error on activateView', async () => {
      api.getViewData.mockRejectedValueOnce(new Error('view fail'))
      await useFavoritesStore.getState().activateView('v1')
      expect(useFavoritesStore.getState().error).toBe('view fail')
    })
  })

  describe('refreshActiveView', () => {
    it('does nothing without active view', async () => {
      await useFavoritesStore.getState().refreshActiveView()
      expect(api.getViewData).not.toHaveBeenCalled()
    })

    it('reloads view data and invalidates cache', async () => {
      useFavoritesStore.setState({
        activeViewId: 'v1',
        _viewDataCache: { v1: { old: true } },
      })
      api.getViewData.mockResolvedValueOnce({ fresh: true })
      await useFavoritesStore.getState().refreshActiveView()
      expect(useFavoritesStore.getState().activeViewData).toEqual({ fresh: true })
    })
  })

  describe('clearViewDataCache', () => {
    it('clears the view data cache', () => {
      useFavoritesStore.setState({ _viewDataCache: { v1: {}, v2: {} } })
      useFavoritesStore.getState().clearViewDataCache()
      expect(useFavoritesStore.getState()._viewDataCache).toEqual({})
    })
  })

  describe('getActiveView', () => {
    it('returns null when no active view', () => {
      expect(useFavoritesStore.getState().getActiveView()).toBeNull()
    })

    it('returns active view object', () => {
      useFavoritesStore.setState({
        activeViewId: 'v1',
        views: [{ id: 'v1', name: 'My View' }],
      })
      expect(useFavoritesStore.getState().getActiveView()).toEqual({ id: 'v1', name: 'My View' })
    })
  })

  describe('importData', () => {
    it('imports data and reloads', async () => {
      api.importUserData.mockResolvedValueOnce({ imported: 5 })
      api.getFavorites.mockResolvedValueOnce([{ id: 'r1' }])
      api.getViews.mockResolvedValueOnce([{ id: 'v1' }])

      const result = await useFavoritesStore.getState().importData({ favorites: [] })
      expect(result).toEqual({ imported: 5 })
      expect(useFavoritesStore.getState().isLoading).toBe(false)
    })

    it('handles import error', async () => {
      api.importUserData.mockRejectedValueOnce(new Error('import fail'))
      await expect(useFavoritesStore.getState().importData({})).rejects.toThrow()
      expect(useFavoritesStore.getState().error).toBe('import fail')
    })
  })

  describe('initialize', () => {
    it('loads favorites and views', async () => {
      api.getFavorites.mockResolvedValueOnce([{ id: 'r1' }])
      api.getViews.mockResolvedValueOnce([{ id: 'v1' }])

      await useFavoritesStore.getState().initialize()
      expect(useFavoritesStore.getState().favorites).toHaveLength(1)
      expect(useFavoritesStore.getState().views).toHaveLength(1)
      expect(useFavoritesStore.getState().isLoading).toBe(false)
    })
  })

  describe('clearError', () => {
    it('clears the error', () => {
      useFavoritesStore.setState({ error: 'some error' })
      useFavoritesStore.getState().clearError()
      expect(useFavoritesStore.getState().error).toBeNull()
    })
  })
})
