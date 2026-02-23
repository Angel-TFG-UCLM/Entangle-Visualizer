/**
 * ViewBar - Barra de Vista Activa
 * =================================
 * 
 * Barra compacta que aparece debajo del header cuando hay una
 * vista personalizada activa, mostrando el nombre, nº de entidades
 * y un botón para volver al dashboard global.
 * 
 * @module ViewBar
 */

import { X, Eye, Loader } from 'lucide-react'
import useFavoritesStore from '../../store/favoritesStore'
import styles from './ViewBar.module.css'

export default function ViewBar() {
  const activeViewId = useFavoritesStore(s => s.activeViewId)
  const views = useFavoritesStore(s => s.views)
  const isLoadingViewData = useFavoritesStore(s => s.isLoadingViewData)
  const activateView = useFavoritesStore(s => s.activateView)

  if (!activeViewId) return null

  const view = views.find(v => v.id === activeViewId)
  if (!view) return null

  return (
    <div className={styles.viewBar}>
      <div className={styles.viewBarContent}>
        <div className={styles.viewBarLeft}>
          <div 
            className={styles.viewBarDot} 
            style={{ background: view.color || '#00ffaa' }}
          />
          <Eye size={14} className={styles.viewBarIcon} />
          <span className={styles.viewBarLabel}>Vista activa:</span>
          <span className={styles.viewBarName}>{view.name}</span>
          <span className={styles.viewBarCount}>
            {view.entity_ids?.length || 0} entidades
          </span>
          {isLoadingViewData && (
            <Loader size={12} className={styles.viewBarSpinner} />
          )}
        </div>
        <button 
          className={styles.viewBarClose}
          onClick={() => activateView(null)}
          title="Volver al dashboard global"
        >
          <X size={14} />
          <span>Dashboard global</span>
        </button>
      </div>
    </div>
  )
}
