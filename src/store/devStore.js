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
      contributorSankey:  { label: 'Contributor Sankey',   default: true },
      bridgeUsersTable:   { label: 'Bridge Users Table',   default: true },
      orgComparisonRadar: { label: 'Org Comparison Radar', default: true },
      techStackMap:       { label: 'Tech Stack Map',       default: true },
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
  envolvente: {
    label: 'Envolvente Cuántico',
    features: {
      electronOrbits:     { label: 'Dyson Shell Cuántica', default: true },
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
      partialize: (state) => ({ features: state.features }),
      merge: (persisted, current) => {
        // Ensure new features from FEATURE_DEFINITIONS are always present
        const merged = { ...current }
        if (persisted && persisted.features) {
          merged.features = { ...current.features, ...persisted.features }
        }
        return merged
      },
    }
  )
)
