/**
 * DEV STORE — Zustand store para el menú de desarrollo
 * =====================================================
 * 
 * Gestiona toggles de visibilidad de cada sección/feature del dashboard.
 * Persistido en localStorage. Activación: Ctrl+Shift+D.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Definiciones de features agrupadas por categoría */
export const FEATURE_DEFINITIONS = {
  layout: {
    label: 'Layout',
    features: {
      quantumBackground:  { label: 'Quantum Background',  default: true },
      header:             { label: 'Header / Banner',      default: true },
      dashboardNav:       { label: 'Dashboard Nav',        default: true },
      footer:             { label: 'Footer',               default: true },
      quantumDividers:    { label: 'Quantum Dividers',     default: true },
      viewBar:            { label: 'View Bar',             default: true },
    },
  },
  secciones: {
    label: 'Secciones',
    features: {
      heroKpis:           { label: 'Hero KPIs',            default: true },
      chartsSection:      { label: 'Gráficos Principales', default: true },
      detailTables:       { label: 'Tablas de Detalle',    default: true },
    },
  },
  colaboracion: {
    label: 'Colaboración',
    features: {
      collabBanner:       { label: 'Collab Banner',        default: true },
      networkGraph:       { label: 'Network Graph',        default: true },
      contributorSankey:  { label: 'Contributor Sankey',   default: false },
      bridgeUsersTable:   { label: 'Bridge Users Table',   default: false },
      orgComparisonRadar: { label: 'Org Comparison Radar', default: false },
      techStackMap:       { label: 'Tech Stack Map',       default: false },
    },
  },
  especial: {
    label: 'Especial',
    features: {
      universeView:       { label: 'Vista Universo',       default: true },
      favoritesPanel:     { label: 'Panel Favoritos',      default: true },
      offlineBanner:      { label: 'Banner Offline',       default: true },
    },
  },
}

/** Genera el estado inicial con todos los features en su default */
function getInitialFeatures() {
  const features = {}
  Object.values(FEATURE_DEFINITIONS).forEach(cat => {
    Object.entries(cat.features).forEach(([key, def]) => {
      features[key] = def.default
    })
  })
  return features
}

export const useDevStore = create(
  persist(
    (set, get) => ({
      // ─── Estado ───
      isDevMenuOpen: false,
      features: getInitialFeatures(),

      // ─── Acciones ───
      toggleDevMenu: () => set(s => ({ isDevMenuOpen: !s.isDevMenuOpen })),
      closeDevMenu: () => set({ isDevMenuOpen: false }),

      toggleFeature: (key) => set(s => ({
        features: { ...s.features, [key]: !s.features[key] },
      })),

      setFeature: (key, value) => set(s => ({
        features: { ...s.features, [key]: !!value },
      })),

      enableAll: () => set(s => {
        const features = { ...s.features }
        Object.keys(features).forEach(k => { features[k] = true })
        return { features }
      }),

      disableAll: () => set(s => {
        const features = { ...s.features }
        Object.keys(features).forEach(k => { features[k] = false })
        return { features }
      }),

      enableCategory: (catKey) => set(s => {
        const cat = FEATURE_DEFINITIONS[catKey]
        if (!cat) return s
        const features = { ...s.features }
        Object.keys(cat.features).forEach(k => { features[k] = true })
        return { features }
      }),

      disableCategory: (catKey) => set(s => {
        const cat = FEATURE_DEFINITIONS[catKey]
        if (!cat) return s
        const features = { ...s.features }
        Object.keys(cat.features).forEach(k => { features[k] = false })
        return { features }
      }),

      /** Activa solo un feature, desactiva el resto */
      isolateFeature: (key) => set(s => {
        const features = {}
        Object.keys(s.features).forEach(k => { features[k] = k === key })
        return { features }
      }),

      /** Comprueba si un feature está activo */
      isEnabled: (key) => {
        const state = get()
        return state.features[key] !== false
      },
    }),
    {
      name: 'entangle-dev-features',
      version: 1,
      partialize: (state) => ({ features: state.features }),
      migrate: (persisted, version) => {
        // v0 → v1: Deshabilitar por defecto las 4 features avanzadas
        if (version === 0 || version === undefined) {
          const FORCE_DISABLED = [
            'contributorSankey',
            'bridgeUsersTable',
            'orgComparisonRadar',
            'techStackMap',
          ]
          const features = { ...persisted.features }
          FORCE_DISABLED.forEach(k => { features[k] = false })
          return { ...persisted, features }
        }
        return persisted
      },
    }
  )
)
