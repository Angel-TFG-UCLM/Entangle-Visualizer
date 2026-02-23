/**
 * DEV MENU — Panel oculto de desarrollo
 * =======================================
 * 
 * Activación: Ctrl+Shift+D
 * Permite toggle de cada feature/sección del dashboard.
 * Panel con overlay, categorías y switches individuales.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useDevStore, FEATURE_DEFINITIONS } from '../../store/devStore'
import styles from './DevMenu.module.css'

export default function DevMenu() {
  const {
    isDevMenuOpen,
    toggleDevMenu,
    closeDevMenu,
    features,
    toggleFeature,
    enableAll,
    disableAll,
    enableCategory,
    disableCategory,
  } = useDevStore()

  const panelRef = useRef(null)

  // ─── Keyboard shortcut: Ctrl+Shift+D ───
  const handleKeyDown = useCallback((e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault()
      toggleDevMenu()
    }
    if (e.key === 'Escape' && isDevMenuOpen) {
      closeDevMenu()
    }
  }, [isDevMenuOpen, toggleDevMenu, closeDevMenu])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Click outside
  const handleOverlayClick = useCallback((e) => {
    if (panelRef.current && !panelRef.current.contains(e.target)) {
      closeDevMenu()
    }
  }, [closeDevMenu])

  if (!isDevMenuOpen) return null

  const activeCount = Object.values(features).filter(Boolean).length
  const totalCount = Object.keys(features).length

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div ref={panelRef} className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <span className={styles.devIcon}>⚛</span>
            <h3 className={styles.title}>Dev Menu</h3>
            <span className={styles.badge}>{activeCount}/{totalCount}</span>
          </div>
          <button className={styles.closeBtn} onClick={closeDevMenu}>✕</button>
        </div>

        {/* Global actions */}
        <div className={styles.globalActions}>
          <button className={styles.globalBtn} onClick={enableAll}>
            Activar todo
          </button>
          <button className={`${styles.globalBtn} ${styles.globalBtnDanger}`} onClick={disableAll}>
            Desactivar todo
          </button>
        </div>

        {/* Categories */}
        <div className={styles.categories}>
          {Object.entries(FEATURE_DEFINITIONS).map(([catKey, cat]) => {
            const catFeatureKeys = Object.keys(cat.features)
            const catActiveCount = catFeatureKeys.filter(k => features[k]).length
            const allActive = catActiveCount === catFeatureKeys.length

            return (
              <div key={catKey} className={styles.category}>
                <div className={styles.categoryHeader}>
                  <span className={styles.categoryLabel}>{cat.label}</span>
                  <span className={styles.categoryCount}>
                    {catActiveCount}/{catFeatureKeys.length}
                  </span>
                  <button
                    className={styles.categoryToggle}
                    onClick={() => allActive ? disableCategory(catKey) : enableCategory(catKey)}
                  >
                    {allActive ? 'Off' : 'On'}
                  </button>
                </div>
                <div className={styles.featureList}>
                  {Object.entries(cat.features).map(([featureKey, featureDef]) => (
                    <div key={featureKey} className={styles.featureItem}>
                      <span className={styles.featureLabel}>{featureDef.label}</span>
                      <button
                        className={`${styles.toggleTrack} ${features[featureKey] ? styles.toggleOn : ''}`}
                        onClick={() => toggleFeature(featureKey)}
                        role="switch"
                        aria-checked={features[featureKey]}
                      >
                        <span className={styles.toggleThumb} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.footerNote}>Ctrl+Shift+D para toggle · Esc para cerrar</span>
        </div>
      </div>
    </div>
  )
}
