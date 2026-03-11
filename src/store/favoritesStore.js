/**
 * Favorites & Custom Views Store - Zustand
 * ==========================================
 * 
 * Gestiona favoritos (entidades marcadas) y vistas personalizadas
 * (dashboards filtrados para un subconjunto de entidades).
 * 
 * Persistencia: Backend (MongoDB) + localStorage como caché offline.
 * Sin autenticación: modo single-user.
 * 
 * @module favoritesStore
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  getViews,
  saveView,
  deleteView,
  getViewData,
  exportUserData,
  importUserData,
} from '../services/api';

const useFavoritesStore = create(
  devtools(
    persist(
      (set, get) => ({
        // ─── Estado ───────────────────────────────────────────
        favorites: [],           // Array de { id, type, name, avatar_url, added_at }
        views: [],               // Array de { id, name, entity_ids[], color, created_at }
        activeViewId: null,      // ID de la vista activa (null = dashboard global)
        activeViewData: null,    // Datos calculados para la vista activa
        
        isLoading: false,
        isLoadingViewData: false,
        error: null,
        lastSynced: null,        // Última sincronización con backend

        // ─── Favoritos ───────────────────────────────────────

        /**
         * Carga favoritos desde el backend
         */
        loadFavorites: async () => {
          try {
            const favorites = await getFavorites();
            set({ favorites, lastSynced: Date.now() });
          } catch (err) {
            console.error('Error cargando favoritos:', err);
          }
        },

        /**
         * Añade o elimina un favorito (toggle)
         */
        toggleFavorite: async (entity) => {
          const { favorites } = get();
          const existing = favorites.find(f => f.id === entity.id);
          
          set({ isLoading: true, error: null });
          try {
            if (existing) {
              await removeFavorite(entity.id);
              set(state => ({
                favorites: state.favorites.filter(f => f.id !== entity.id),
                isLoading: false,
              }));
            } else {
              const result = await addFavorite({
                id: entity.id,
                type: entity.type,
                name: entity.name,
                avatar_url: entity.avatar_url,
              });
              set(state => ({
                favorites: [...state.favorites, result.favorite],
                isLoading: false,
              }));
            }
          } catch (err) {
            set({ error: err.message, isLoading: false });
            console.error('Error toggling favorito:', err);
          }
        },

        /**
         * Comprueba si una entidad está en favoritos
         */
        isFavorite: (entityId) => {
          return get().favorites.some(f => f.id === entityId);
        },

        /**
         * Obtiene favoritos filtrados por tipo
         */
        getFavoritesByType: (type) => {
          return get().favorites.filter(f => f.type === type);
        },

        // ─── Vistas Personalizadas ───────────────────────────

        /**
         * Carga vistas desde el backend
         */
        loadViews: async () => {
          try {
            const views = await getViews();
            set({ views, lastSynced: Date.now() });
          } catch (err) {
            console.error('Error cargando vistas:', err);
          }
        },

        /**
         * Crea una nueva vista a partir de los favoritos seleccionados
         */
        createView: async (name, entityIds, color = '#00ffaa') => {
          set({ isLoading: true, error: null });
          try {
            const result = await saveView({ name, entity_ids: entityIds, color });
            set(state => ({
              views: [...state.views, result.view],
              isLoading: false,
            }));
            return result.view;
          } catch (err) {
            set({ error: err.message, isLoading: false });
            throw err;
          }
        },

        /**
         * Actualiza una vista existente
         */
        updateView: async (viewId, updates) => {
          const { views } = get();
          const existing = views.find(v => v.id === viewId);
          if (!existing) return;

          set({ isLoading: true, error: null });
          try {
            const merged = { ...existing, ...updates };
            const result = await saveView(merged);
            set(state => ({
              views: state.views.map(v => v.id === viewId ? result.view : v),
              isLoading: false,
            }));
            return result.view;
          } catch (err) {
            set({ error: err.message, isLoading: false });
            throw err;
          }
        },

        /**
         * Elimina una vista
         */
        removeView: async (viewId) => {
          set({ isLoading: true, error: null });
          try {
            await deleteView(viewId);
            set(state => ({
              views: state.views.filter(v => v.id !== viewId),
              activeViewId: state.activeViewId === viewId ? null : state.activeViewId,
              activeViewData: state.activeViewId === viewId ? null : state.activeViewData,
              isLoading: false,
            }));
          } catch (err) {
            set({ error: err.message, isLoading: false });
            throw err;
          }
        },

        /**
         * Crea una vista rápida con todos los favoritos actuales
         */
        createViewFromAllFavorites: async (name, color) => {
          const { favorites, createView } = get();
          if (favorites.length === 0) {
            throw new Error('No hay favoritos para crear una vista');
          }
          const entityIds = favorites.map(f => f.id);
          return createView(name, entityIds, color);
        },

        // ─── Vista Activa ────────────────────────────────────

        /**
         * Activa una vista y carga sus datos filtrados.
         * Usa caché local: si ya tenemos datos de esta vista, los reutiliza
         * sin hacer petición al backend (el backend también cachea en MongoDB).
         */
        _viewDataCache: {},

        activateView: async (viewId) => {
          if (!viewId) {
            // Desactivar vista → volver al dashboard global
            set({ activeViewId: null, activeViewData: null });
            return;
          }

          // Caché local: reutilizar datos si ya los cargamos antes
          const cached = get()._viewDataCache[viewId];
          if (cached) {
            set({ activeViewId: viewId, activeViewData: cached, isLoadingViewData: false });
            return;
          }

          set({ activeViewId: viewId, isLoadingViewData: true, error: null });
          try {
            const data = await getViewData(viewId);
            const cache = { ...get()._viewDataCache, [viewId]: data };
            set({ activeViewData: data, isLoadingViewData: false, _viewDataCache: cache });
          } catch (err) {
            set({ error: err.message, isLoadingViewData: false });
            console.error('Error cargando datos de vista:', err);
          }
        },

        /**
         * Recarga los datos de la vista activa (invalida caché local)
         */
        refreshActiveView: async () => {
          const { activeViewId, _viewDataCache } = get();
          if (!activeViewId) return;
          
          // Invalidar caché local de esta vista
          const cache = { ..._viewDataCache };
          delete cache[activeViewId];
          
          set({ isLoadingViewData: true, _viewDataCache: cache });
          try {
            const data = await getViewData(activeViewId);
            set({
              activeViewData: data,
              isLoadingViewData: false,
              _viewDataCache: { ...get()._viewDataCache, [activeViewId]: data },
            });
          } catch (err) {
            set({ error: err.message, isLoadingViewData: false });
          }
        },

        /** Invalida toda la caché local de vistas (tras refresh-metrics) */
        clearViewDataCache: () => set({ _viewDataCache: {} }),

        /**
         * Obtiene la vista activa actual
         */
        getActiveView: () => {
          const { activeViewId, views } = get();
          if (!activeViewId) return null;
          return views.find(v => v.id === activeViewId) || null;
        },

        // ─── Export/Import ───────────────────────────────────

        /**
         * Exporta todos los datos del usuario como JSON
         */
        exportData: async () => {
          try {
            const data = await exportUserData();
            // Descargar como archivo JSON
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quantum-universe-data-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            return data;
          } catch (err) {
            console.error('Error exportando datos:', err);
            throw err;
          }
        },

        /**
         * Importa datos desde un archivo JSON
         */
        importData: async (jsonData) => {
          set({ isLoading: true, error: null });
          try {
            const results = await importUserData(jsonData);
            // Recargar todo después de importar
            await Promise.all([get().loadFavorites(), get().loadViews()]);
            set({ isLoading: false });
            return results;
          } catch (err) {
            set({ error: err.message, isLoading: false });
            throw err;
          }
        },

        // ─── Inicialización ──────────────────────────────────

        /**
         * Carga todos los datos del usuario (favoritos + vistas)
         */
        initialize: async () => {
          set({ isLoading: true });
          try {
            await Promise.all([get().loadFavorites(), get().loadViews()]);
          } catch (err) {
            console.error('Error inicializando favoritesStore:', err);
          } finally {
            set({ isLoading: false });
          }
        },

        /**
         * Limpia cualquier error
         */
        clearError: () => set({ error: null }),
      }),
      {
        name: 'quantum-universe-favorites',
        partialize: (state) => ({
          favorites: state.favorites,
          views: state.views,
        }),
      }
    ),
    { name: 'FavoritesStore' }
  )
);

export default useFavoritesStore;
