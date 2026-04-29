/**
 * FavoritesPanel - Panel de Favoritos y Vistas Personalizadas
 * =============================================================
 * 
 * Panel slide-out con:
 * - Barra de búsqueda unificada (users, repos, orgs)
 * - Favoritos en árbol jerárquico: org → repos → users (con bridge)
 * - Vistas personalizadas y export/import
 * 
 * Herencia unidireccional: org → repo → user (no al revés).
 * 
 * @module FavoritesPanel
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { 
  Star, Eye, Plus, Trash2, Download, Upload, X,
  ChevronRight, ChevronDown, Palette, Check, AlertCircle,
  Search, Loader, User, GitFork, Building2, Link2,
  ExternalLink, Network, ArrowLeft, Globe, MapPin, Mail,
  Calendar, GitCommit, GitPullRequest, Tag, Cpu, Shield, Zap,
  Briefcase, Archive, Users
} from 'lucide-react'
import useFavoritesStore from '../../store/favoritesStore'
import { useDashboardStore } from '../../store/dashboardStore'
import { searchEntities, getFavoriteChildren, getEntityDetail } from '../../services/api'
import styles from './FavoritesPanel.module.css'

const VIEW_COLORS = [
  '#00ffaa', '#00d4e4', '#9d6fdb', '#ff6b6b', 
  '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b',
]

/* Caché in-memory de hijos de favoritos (evita re-fetch al colapsar/expandir) */
const _childrenCache = new Map()
async function getCachedChildren(entityId) {
  if (_childrenCache.has(entityId)) return _childrenCache.get(entityId)
  const data = await getFavoriteChildren(entityId)
  const children = data.children || []
  _childrenCache.set(entityId, children)
  return children
}

/* ────────── Sub-componente: Repo expandible dentro del árbol ────────── */
function TreeNodeRepo({ repo, depth, getTypeIcon }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState(null)
  const [loadingChildren, setLoadingChildren] = useState(false)

  const handleToggle = useCallback(async () => {
    if (expanded) { setExpanded(false); return }
    if (!children) {
      setLoadingChildren(true)
      try {
        const result = await getCachedChildren(repo.id)
        setChildren(result)
      } catch (err) {
        console.error('Error cargando colaboradores:', err)
        setChildren([])
      } finally {
        setLoadingChildren(false)
      }
    }
    setExpanded(true)
  }, [expanded, children, repo.id])

  return (
    <div className={styles.treeNode}>
      <div className={`${styles.treeNodeRow} ${styles.treeChild}`}
           style={{ paddingLeft: `${8 + depth * 16}px` }}>
        <button className={styles.treeToggle} onClick={handleToggle}>
          {loadingChildren ? (
            <Loader size={12} className={styles.searchSpinner} />
          ) : expanded ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
        </button>
        <span className={styles.treeNodeIcon}>{getTypeIcon('repository')}</span>
        <div className={styles.treeNodeInfo}>
          <span className={styles.treeNodeName}>{repo.name}</span>
          <span className={styles.treeNodeMeta}>
            {repo.subtitle || `${repo.collaborators_count || 0} ${t('favorites.collaborators')}`}
          </span>
        </div>
      </div>

      {expanded && children && children.length > 0 && (
        <div className={styles.treeChildren}>
          {children.map(child => (
            <div
              key={child.id}
              className={`${styles.treeNodeRow} ${styles.treeChild}`}
              style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}
            >
              <span className={`${styles.treeLeafDot} ${child.is_bridge ? styles.bridgeDot : ''}`} />
              <span className={styles.treeNodeIcon}>
                {child.is_bridge
                  ? <Link2 size={12} className={styles.bridgeIcon} />
                  : <User size={12} />}
              </span>
              <div className={styles.treeNodeInfo}>
                <span className={styles.treeNodeName}>{child.name || child.login}</span>
                <span className={styles.treeNodeMeta}>{child.subtitle}</span>
              </div>
              {child.is_bridge && (
                <span className={styles.bridgeBadge}>{t('favorites.bridgeBadge')}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && children && children.length === 0 && (
        <div className={styles.treeEmpty} style={{ paddingLeft: `${24 + depth * 16}px` }}>
          {t('favorites.noCollaborators')}
        </div>
      )}
    </div>
  )
}

/* ────────── Sub-componente: Nodo principal del árbol (org/repo/user directo) ────────── */
function TreeNode({ entity, depth = 0, onRemove, getTypeIcon }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState(null)
  const [loadingChildren, setLoadingChildren] = useState(false)

  const canExpand = entity.type === 'organization' || entity.type === 'repository'

  const handleToggle = useCallback(async () => {
    if (!canExpand) return
    if (expanded) { setExpanded(false); return }
    if (!children) {
      setLoadingChildren(true)
      try {
        const result = await getCachedChildren(entity.id)
        setChildren(result)
      } catch (err) {
        console.error('Error cargando hijos:', err)
        setChildren([])
      } finally {
        setLoadingChildren(false)
      }
    }
    setExpanded(true)
  }, [canExpand, expanded, children, entity.id])

  return (
    <div className={styles.treeNode}>
      {/* Nodo principal */}
      <div
        className={`${styles.treeNodeRow} ${depth > 0 ? styles.treeChild : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {canExpand ? (
          <button className={styles.treeToggle} onClick={handleToggle}>
            {loadingChildren ? (
              <Loader size={12} className={styles.searchSpinner} />
            ) : expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        ) : (
          <span className={styles.treeLeafDot} />
        )}

        <span className={styles.treeNodeIcon}>{getTypeIcon(entity.type)}</span>
        <div className={styles.treeNodeInfo}>
          <span className={styles.treeNodeName}>{entity.name}</span>
          <span className={styles.treeNodeMeta}>
            {entity.type === 'organization' ? t('common.organization')
              : entity.type === 'repository' ? t('common.repository')
              : t('common.user')}
          </span>
        </div>
        {depth === 0 && onRemove && (
          <button
            className={styles.removeBtn}
            onClick={() => onRemove(entity)}
            title={t('favorites.removeFavorite')}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Hijos expandidos */}
      {expanded && children && children.length > 0 && (
        <div className={styles.treeChildren}>
          {children.map(child => (
            child.type === 'repository' ? (
              <TreeNodeRepo
                key={child.id}
                repo={child}
                depth={depth + 1}
                getTypeIcon={getTypeIcon}
              />
            ) : (
              <div
                key={child.id}
                className={`${styles.treeNodeRow} ${styles.treeChild}`}
                style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}
              >
                <span className={`${styles.treeLeafDot} ${child.is_bridge ? styles.bridgeDot : ''}`} />
                <span className={styles.treeNodeIcon}>
                  {child.is_bridge
                    ? <Link2 size={12} className={styles.bridgeIcon} />
                    : <User size={12} />}
                </span>
                <div className={styles.treeNodeInfo}>
                  <span className={styles.treeNodeName}>{child.name || child.login}</span>
                  <span className={styles.treeNodeMeta}>
                    {child.subtitle || (child.is_bridge ? t('favorites.bridgeUser') : t('favorites.collaborator'))}
                  </span>
                </div>
                {child.is_bridge && (
                  <span className={styles.bridgeBadge}>{t('favorites.bridgeBadge')}</span>
                )}
              </div>
            )
          ))}
        </div>
      )}

      {expanded && children && children.length === 0 && (
        <div className={styles.treeEmpty} style={{ paddingLeft: `${24 + depth * 16}px` }}>
          {t('favorites.noChildren')}
        </div>
      )}
    </div>
  )
}

/* ────────── Componente principal ────────── */
export default function FavoritesPanel({ isOpen, onClose }) {
  const { t } = useTranslation()
  const {
    favorites,
    views,
    activeViewId,
    isLoading,
    error,
    toggleFavorite,
    createView,
    removeView,
    activateView,
    exportData,
    importData,
    clearError,
  } = useFavoritesStore()

  const { selectUserForAnalysis } = useDashboardStore()

  const [tab, setTab] = useState('favorites') // 'favorites' | 'views'
  const [showCreateView, setShowCreateView] = useState(false)
  const [newViewName, setNewViewName] = useState('')
  const [newViewColor, setNewViewColor] = useState('#00ffaa')
  const [selectedForView, setSelectedForView] = useState([])
  const [importStatus, setImportStatus] = useState(null)
  const fileInputRef = useRef(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const searchTimerRef = useRef(null)

  // Entity detail state
  const [entityDetail, setEntityDetail] = useState(null)     // full entity data
  const [entityDetailType, setEntityDetailType] = useState(null) // 'user' | 'repository' | 'organization'
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState(null)

  // Reset create view form when closing
  useEffect(() => {
    if (!isOpen) {
      setShowCreateView(false)
      setNewViewName('')
      setSelectedForView([])
      setSearchQuery('')
      setSearchResults([])
      setEntityDetail(null)
      setEntityDetailType(null)
      setDetailError(null)
    }
  }, [isOpen])

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await searchEntities(searchQuery.trim(), 15)
        setSearchResults(data.results || [])
      } catch (err) {
        console.error('Error buscando entidades:', err)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 350)

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery])

  // Auto-select all favorites when opening create view
  useEffect(() => {
    if (showCreateView) {
      setSelectedForView(favorites.map(f => f.id))
    }
  }, [showCreateView, favorites])

  const handleCreateView = useCallback(async () => {
    if (!newViewName.trim() || selectedForView.length === 0) return
    try {
      await createView(newViewName.trim(), selectedForView, newViewColor)
      setShowCreateView(false)
      setNewViewName('')
      setSelectedForView([])
      setTab('views')
    } catch (err) {
      console.error('Error creando vista:', err)
    }
  }, [newViewName, selectedForView, newViewColor, createView])

  const handleRemoveFavorite = useCallback(async (entity) => {
    await toggleFavorite(entity)
  }, [toggleFavorite])

  const handleActivateView = useCallback(async (viewId) => {
    await activateView(viewId === activeViewId ? null : viewId)
  }, [activateView, activeViewId])

  const handleDeleteView = useCallback(async (viewId) => {
    await removeView(viewId)
  }, [removeView])

  const handleExport = useCallback(async () => {
    try {
      await exportData()
    } catch (err) {
      console.error('Error exportando:', err)
    }
  }, [exportData])

  const handleImport = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const results = await importData(data)
      setImportStatus({
        type: 'success',
        message: t('favorites.importSuccess', { favorites: results.favorites, views: results.views }),
      })
      setTimeout(() => setImportStatus(null), 3000)
    } catch (err) {
      setImportStatus({
        type: 'error',
        message: t('favorites.importError'),
      })
      setTimeout(() => setImportStatus(null), 3000)
    }
    
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [importData])

  const toggleSelectedForView = useCallback((id) => {
    setSelectedForView(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }, [])

  const handleAddFromSearch = useCallback(async (entity) => {
    // entity comes from search results: { id, name, type, login, ... }
    await toggleFavorite({
      id: entity.id,
      name: entity.name,
      type: entity.type,
    })
  }, [toggleFavorite])

  // Open entity detail panel from search result
  const handleOpenDetail = useCallback(async (entity) => {
    setLoadingDetail(true)
    setDetailError(null)
    try {
      const data = await getEntityDetail(entity.id)
      setEntityDetail(data)
      setEntityDetailType(data._entity_type || entity.type)
    } catch (err) {
      console.error('Error loading entity detail:', err)
      setDetailError(t('favorites.loadError'))
      setEntityDetail(null)
      setEntityDetailType(null)
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const handleCloseDetail = useCallback(() => {
    setEntityDetail(null)
    setEntityDetailType(null)
    setDetailError(null)
  }, [])

  const handleCollaborationNetwork = useCallback((login) => {
    selectUserForAnalysis(login)
    onClose()
  }, [selectUserForAnalysis, onClose])

  const isEntityFavorited = useCallback((entityId) => {
    return favorites.some(f => f.id === entityId)
  }, [favorites])

  const TYPE_COLORS = { user: '#00ff9f', repository: '#9D6FDB', organization: '#00D4E4' }

  const getTypeIcon = useCallback((type) => {
    const color = TYPE_COLORS[type] || 'rgba(255,255,255,0.5)'
    switch (type) {
      case 'user': return <User size={14} style={{ color }} />
      case 'repository': return <GitFork size={14} style={{ color }} />
      case 'organization': return <Building2 size={14} style={{ color }} />
      default: return <Star size={14} />
    }
  }, [])

  if (!isOpen) return null

  // Agrupar favoritos por tipo para la vista jerárquica
  const orgFavs = favorites.filter(f => f.type === 'organization')
  const repoFavs = favorites.filter(f => f.type === 'repository')
  const userFavs = favorites.filter(f => f.type === 'user')

  return (
    <div className={styles.overlay} role="button" tabIndex={0} onClick={onClose} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose() }}>
      <div className={styles.panel} role="presentation" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Star size={18} className={styles.headerIcon} />
            <span>{t('favorites.title')}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={14} />
            <span>{error}</span>
            <button onClick={clearError}><X size={12} /></button>
          </div>
        )}

        {/* Import status */}
        {importStatus && (
          <div className={`${styles.importStatus} ${styles[importStatus.type]}`}>
            {importStatus.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{importStatus.message}</span>
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${tab === 'favorites' ? styles.tabActive : ''}`}
            onClick={() => setTab('favorites')}
          >
            <Star size={14} />
            <span>{t('favorites.favorites')}</span>
            {favorites.length > 0 && (
              <span className={styles.tabBadge}>{favorites.length}</span>
            )}
          </button>
          <button 
            className={`${styles.tab} ${tab === 'views' ? styles.tabActive : ''}`}
            onClick={() => setTab('views')}
          >
            <Eye size={14} />
            <span>{t('favorites.views')}</span>
            {views.length > 0 && (
              <span className={styles.tabBadge}>{views.length}</span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* ─── Tab: Favoritos ─── */}
          {tab === 'favorites' && (
            <>
              {/* Search bar */}
              <div className={styles.searchSection}>
                <div className={styles.searchInputWrap}>
                  <Search size={14} className={styles.searchIcon} />
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder={t('favorites.searchPlaceholder')}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    autoComplete="off"
                  />
                  {searchQuery && (
                    <button 
                      className={styles.searchClear}
                      onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                    >
                      <X size={12} />
                    </button>
                  )}
                  {isSearching && <Loader size={14} className={styles.searchSpinner} />}
                </div>

                {/* Search results */}
                {searchQuery.trim().length >= 2 && (
                  <div className={styles.searchResults}>
                    {isSearching && searchResults.length === 0 ? (
                      <div className={styles.searchLoading}>{t('favorites.searching')}</div>
                    ) : searchResults.length === 0 && !isSearching ? (
                      <div className={styles.searchEmpty}>{t('favorites.noResults', { query: searchQuery })}</div>
                    ) : (
                      searchResults.map(entity => {
                        const favorited = isEntityFavorited(entity.id)
                        return (
                          <div key={entity.id} className={styles.searchResultItem}>
                            <div 
                              className={styles.searchResultClickable}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleOpenDetail(entity)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenDetail(entity) }}
                              title={t('favorites.viewDetails')}
                            >
                              <span className={styles.searchResultIcon}>{getTypeIcon(entity.type)}</span>
                              <div className={styles.searchResultInfo}>
                                <span className={styles.searchResultName}>{entity.name}</span>
                                {entity.subtitle && (
                                  <span className={styles.searchResultSub}>{entity.subtitle}</span>
                                )}
                              </div>
                            </div>
                            <button
                              className={`${styles.searchAddBtn} ${favorited ? styles.searchAddBtnActive : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleAddFromSearch(entity) }}
                              title={favorited ? t('favorites.removeFavorite') : t('favorites.addFavorite')}
                            >
                              <Star size={14} fill={favorited ? 'currentColor' : 'none'} />
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              {/* ─── Entity Detail Inline Panel ─── */}
              {(entityDetail || loadingDetail || detailError) && (
                <div className={styles.entityInlineDetail}>
                  <div className={styles.entityInlineHeader}>
                    <button className={styles.entityInlineBack} onClick={handleCloseDetail}>
                      <ArrowLeft size={14} />
                    </button>
                    <span className={styles.entityInlineHeaderTitle}>
                      {entityDetailType === 'user' ? t('common.user') : entityDetailType === 'repository' ? t('common.repository') : t('common.organization')}
                    </span>
                    <button className={styles.entityInlineClose} onClick={handleCloseDetail}>
                      <X size={12} />
                    </button>
                  </div>

                  {loadingDetail && (
                    <div className={styles.entityInlineLoading}>
                      <Loader size={20} className={styles.searchSpinner} />
                      <span>{t('favorites.loadingDetails')}</span>
                    </div>
                  )}

                  {detailError && (
                    <div className={styles.entityInlineError}>
                      <AlertCircle size={14} />
                      <span>{detailError}</span>
                    </div>
                  )}

                  {entityDetail && !loadingDetail && (() => {
                    const d = entityDetail
                    const et = entityDetailType
                    const typeColors = { user: '#00ff9f', repository: '#9D6FDB', organization: '#00D4E4' }
                    const accentColor = typeColors[et] || '#00D4E4'
                    const entityId = et === 'user' ? `user_${d.login}` : et === 'repository' ? `repo_${d.full_name || d.name}` : `org_${d.login}`
                    const favorited = isEntityFavorited(entityId)
                    const githubUrl = et === 'user' ? `https://github.com/${d.login}`
                      : et === 'repository' ? `https://github.com/${d.full_name || d.name}`
                      : `https://github.com/${d.login}`

                    return (
                      <div className={styles.entityInlineBody}>
                        {/* Identity */}
                        <div className={styles.entityInlineIdentity}>
                          {d.avatar_url ? (
                            <img src={d.avatar_url} alt="" className={styles.entityInlineAvatar} />
                          ) : (
                            <div className={styles.entityInlineAvatarFallback} style={{ borderColor: accentColor }}>
                              {et === 'user' ? <User size={18} /> : et === 'repository' ? <GitFork size={18} /> : <Building2 size={18} />}
                            </div>
                          )}
                          <div className={styles.entityInlineNameBlock}>
                            <h4 className={styles.entityInlineName}>
                              {et === 'user' ? (d.name || d.login) : (d.name || d.full_name || d.login)}
                            </h4>
                            {et === 'user' && d.name && d.login && (
                              <span className={styles.entityInlineLogin}>@{d.login}</span>
                            )}
                            {et === 'repository' && d.full_name && (
                              <span className={styles.entityInlineLogin}>{d.full_name}</span>
                            )}
                            <span className={styles.entityInlineTypeBadge} style={{ color: accentColor, borderColor: `${accentColor}40` }}>
                              {et === 'user' ? t('common.user') : et === 'repository' ? t('common.repository') : t('common.organization')}
                            </span>
                          </div>
                        </div>

                        {/* Bio / Description */}
                        {(d.bio || d.description) && (
                          <p className={styles.entityInlineDesc}>{d.bio || d.description}</p>
                        )}

                        {/* Badges */}
                        {(() => {
                          const badges = []
                          if (et === 'organization' && d.is_verified) badges.push({ icon: Shield, label: t('favorites.badgeVerified'), color: '#22C55E' })
                          if (et === 'organization' && d.is_quantum_focused) badges.push({ icon: Zap, label: t('favorites.quantumFocus'), color: '#F59E0B' })
                          if (et === 'repository' && d.is_fork) badges.push({ icon: GitFork, label: t('favorites.forkBadge'), color: '#9D6FDB' })
                          if (et === 'repository' && d.is_archived) badges.push({ icon: Archive, label: t('favorites.badgeArchived'), color: '#EF4444' })
                          if (et === 'user' && d.is_hireable) badges.push({ icon: Briefcase, label: t('favorites.badgeHireable'), color: '#22C55E' })
                          if (et === 'user' && d.quantum_expertise_score > 0) badges.push({ icon: Cpu, label: `QE ${d.quantum_expertise_score.toFixed(1)}`, color: '#00D4E4' })
                          if (badges.length === 0) return null
                          return (
                            <div className={styles.entityInlineBadges}>
                              {badges.map((b, i) => (
                                <span key={i} className={styles.entityInlineBadge} style={{ color: b.color, borderColor: `${b.color}40`, background: `${b.color}10` }}>
                                  <b.icon size={10} /> {b.label}
                                </span>
                              ))}
                            </div>
                          )
                        })()}

                        {/* Stats Grid */}
                        <div className={styles.entityInlineStats}>
                          {et === 'user' && (() => {
                            // Usar métricas pre-calculadas del backend (consistentes con Dashboard)
                            const contributions = d._total_quantum_contributions || 0
                            const repos = d._relevant_repos_count || 0
                            const collabScore = d._collab_score || 0
                            return (
                              <>
                                <div className={styles.entityInlineStat}>
                                  <span className={styles.entityInlineStatVal} style={{ color: '#00D4E4' }}>{collabScore.toLocaleString()}</span>
                                  <span className={styles.entityInlineStatLbl}>{t('favorites.statCollabScore')}</span>
                                </div>
                                <div className={styles.entityInlineStat}>
                                  <span className={styles.entityInlineStatVal} style={{ color: '#9D6FDB' }}>{contributions.toLocaleString()}</span>
                                  <span className={styles.entityInlineStatLbl}>{t('favorites.statQuantumContrib')}</span>
                                </div>
                                <div className={styles.entityInlineStat}>
                                  <span className={styles.entityInlineStatVal} style={{ color: '#F59E0B' }}>{(d.followers_count || 0).toLocaleString()}</span>
                                  <span className={styles.entityInlineStatLbl}>{t('favorites.statFollowers')}</span>
                                </div>
                                <div className={styles.entityInlineStat}>
                                  <span className={styles.entityInlineStatVal} style={{ color: '#00ff9f' }}>{repos.toLocaleString()}</span>
                                  <span className={styles.entityInlineStatLbl}>{t('favorites.statQuantumRepos')}</span>
                                </div>
                              </>
                            )
                          })()}
                          {et === 'repository' && (
                            <>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#F59E0B' }}>{(d.stargazer_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>{t('favorites.statStars')}</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#9D6FDB' }}>{(d.fork_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>{t('favorites.forks')}</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#00D4E4' }}>{(d.collaborators_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>{t('favorites.statContributors')}</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#00ff9f' }}>{(d.watchers_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>{t('favorites.watchers')}</span>
                              </div>
                            </>
                          )}
                          {et === 'organization' && (
                            <>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#00D4E4' }}>{(d.quantum_repositories_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>{t('favorites.statQuantumRepos')}</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#F59E0B' }}>{(d.total_stars || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>{t('favorites.statStars')}</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#9D6FDB' }}>{(d.total_unique_contributors || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>{t('favorites.statContributors')}</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#00ff9f' }}>{(d.total_repositories_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>{t('favorites.statTotalRepos')}</span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Additional info section */}
                        {et === 'repository' && (
                          <div className={styles.entityInlineSection}>
                            <div className={styles.entityInlineMetaGrid}>
                              {d.primary_language && (
                                <div className={styles.entityInlineMetaItem}>
                                  <span className={styles.entityInlineMetaLabel}>{t('favorites.metaLanguage')}</span>
                                  <span className={styles.entityInlineMetaValue}>{d.primary_language}</span>
                                </div>
                              )}
                              {d.commits_count > 0 && (
                                <div className={styles.entityInlineMetaItem}>
                                  <span className={styles.entityInlineMetaLabel}>{t('favorites.commits')}</span>
                                  <span className={styles.entityInlineMetaValue}>{d.commits_count.toLocaleString()}</span>
                                </div>
                              )}
                              {d.pull_requests_count > 0 && (
                                <div className={styles.entityInlineMetaItem}>
                                  <span className={styles.entityInlineMetaLabel}>{t('favorites.prs')}</span>
                                  <span className={styles.entityInlineMetaValue}>{d.pull_requests_count.toLocaleString()}</span>
                                </div>
                              )}
                              {d.issues_count > 0 && (
                                <div className={styles.entityInlineMetaItem}>
                                  <span className={styles.entityInlineMetaLabel}>{t('favorites.issues')}</span>
                                  <span className={styles.entityInlineMetaValue}>{d.issues_count.toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                            {Array.isArray(d.repository_topics) && d.repository_topics.length > 0 && (
                              <div className={styles.entityInlineTopics}>
                                {d.repository_topics.slice(0, 8).map((topic, i) => (
                                  <span key={i} className={styles.entityInlineTopic}>{topic}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {et === 'user' && (
                          <div className={styles.entityInlineSection}>
                            <div className={styles.entityInlineMetaGrid}>
                              {d.location && (
                                <div className={styles.entityInlineMetaItem}>
                                  <MapPin size={11} />
                                  <span className={styles.entityInlineMetaValue}>{d.location}</span>
                                </div>
                              )}
                              {d.company && (
                                <div className={styles.entityInlineMetaItem}>
                                  <Building2 size={11} />
                                  <span className={styles.entityInlineMetaValue}>{d.company}</span>
                                </div>
                              )}
                              {d.email && (
                                <div className={styles.entityInlineMetaItem}>
                                  <Mail size={11} />
                                  <span className={styles.entityInlineMetaValue}>{d.email}</span>
                                </div>
                              )}
                            </div>
                            {Array.isArray(d.organizations) && d.organizations.length > 0 && (
                              <div className={styles.entityInlineOrgs}>
                                <span className={styles.entityInlineOrgsLabel}>{t('favorites.metaOrganizations')}</span>
                                {d.organizations.slice(0, 5).map((org, i) => (
                                  <span key={i} className={styles.entityInlineOrgTag}>
                                    {typeof org === 'string' ? org : org.login || org.name}
                                  </span>
                                ))}
                                {d.organizations.length > 5 && (
                                  <span className={styles.entityInlineOrgMore}>+{d.organizations.length - 5} {t('favorites.more')}</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {et === 'organization' && (
                          <div className={styles.entityInlineSection}>
                            <div className={styles.entityInlineMetaGrid}>
                              {d.location && (
                                <div className={styles.entityInlineMetaItem}>
                                  <MapPin size={11} />
                                  <span className={styles.entityInlineMetaValue}>{d.location}</span>
                                </div>
                              )}
                              {d.email && (
                                <div className={styles.entityInlineMetaItem}>
                                  <Mail size={11} />
                                  <span className={styles.entityInlineMetaValue}>{d.email}</span>
                                </div>
                              )}
                              {d.created_at && (
                                <div className={styles.entityInlineMetaItem}>
                                  <Calendar size={11} />
                                  <span className={styles.entityInlineMetaValue}>{new Date(d.created_at).toLocaleDateString('es-ES')}</span>
                                </div>
                              )}
                            </div>
                            {Array.isArray(d.top_languages) && d.top_languages.length > 0 && (
                              <div className={styles.entityInlineOrgs}>
                                <span className={styles.entityInlineOrgsLabel}>{t('favorites.metaLanguages')}</span>
                                {d.top_languages.slice(0, 5).map((lang, i) => {
                                  const langName = typeof lang === 'string' ? lang : lang?.name
                                  if (!langName) return null
                                  return <span key={i} className={styles.entityInlineTopic}>{langName}</span>
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className={styles.entityInlineActions}>
                          <button
                            className={`${styles.entityInlineActionBtn} ${favorited ? styles.entityInlineActionActive : ''}`}
                            onClick={() => toggleFavorite({ id: entityId, name: d.name || d.login || d.full_name, type: et })}
                          >
                            <Star size={13} fill={favorited ? 'currentColor' : 'none'} />
                            <span>{favorited ? t('favorites.inFavorites') : t('favorites.addFavorite')}</span>
                          </button>
                          <a
                            href={githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.entityInlineActionBtn}
                          >
                            <ExternalLink size={13} />
                            <span>GitHub</span>
                          </a>
                          {et === 'user' && d.login && (
                            <button
                              className={`${styles.entityInlineActionBtn} ${styles.entityInlineActionNetwork}`}
                              onClick={() => handleCollaborationNetwork(d.login)}
                            >
                              <Network size={13} />
                              <span>{t('favorites.collabNetwork')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {favorites.length === 0 && searchQuery.trim().length < 2 && !entityDetail && !loadingDetail ? (
                <div className={styles.emptyState}>
                  <Star size={32} strokeWidth={1} />
                  <p>{t('favorites.noFavorites')}</p>
                  <span>{t('favorites.noFavoritesHint')}</span>
                </div>
              ) : (
                <>
                  {/* Create view button */}
                  {!showCreateView && favorites.length > 0 && (
                    <button 
                      className={styles.createViewBtn}
                      onClick={() => setShowCreateView(true)}
                    >
                      <Plus size={14} />
                      <span>{t('favorites.createView')}</span>
                    </button>
                  )}

                  {/* Create view form */}
                  {showCreateView && (
                    <div className={styles.createViewForm}>
                      <h4 className={styles.formTitle}>{t('favorites.newCustomView')}</h4>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder={t('favorites.viewNamePlaceholder')}
                        value={newViewName}
                        onChange={e => setNewViewName(e.target.value)}
                        maxLength={40}
                        autoFocus
                      />
                      
                      {/* Color picker */}
                      <div className={styles.colorPicker}>
                        <Palette size={14} />
                        {VIEW_COLORS.map(c => (
                          <button
                            key={c}
                            className={`${styles.colorDot} ${newViewColor === c ? styles.colorDotActive : ''}`}
                            style={{ background: c }}
                            onClick={() => setNewViewColor(c)}
                          />
                        ))}
                      </div>

                      {/* Select favorites for view */}
                      <div className={styles.selectList}>
                        {favorites.map(fav => (
                          <label key={fav.id} className={styles.selectItem}>
                            <input
                              type="checkbox"
                              checked={selectedForView.includes(fav.id)}
                              onChange={() => toggleSelectedForView(fav.id)}
                            />
                            <span className={styles.selectItemIcon}>{getTypeIcon(fav.type)}</span>
                            <span className={styles.selectItemName}>{fav.name}</span>
                          </label>
                        ))}
                      </div>

                      <div className={styles.formActions}>
                        <button 
                          className={styles.formCancel}
                          onClick={() => setShowCreateView(false)}
                        >
                          {t('common.cancel')}
                        </button>
                        <button 
                          className={styles.formSubmit}
                          onClick={handleCreateView}
                          disabled={!newViewName.trim() || selectedForView.length === 0 || isLoading}
                        >
                          <Plus size={14} />
                          {t('favorites.createViewCount', { count: selectedForView.length })}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ─── Hierarchical Favorites Tree ─── */}
                  <div className={styles.treeList}>
                    {/* Organizaciones (con repos → users desplegables) */}
                    {orgFavs.length > 0 && (
                      <div className={styles.treeGroup}>
                        <div className={styles.treeGroupHeader}>
                          <Building2 size={12} />
                          <span>{t('favorites.treeOrganizations', { count: orgFavs.length })}</span>
                        </div>
                        {orgFavs.map(fav => (
                          <TreeNode
                            key={fav.id}
                            entity={fav}
                            depth={0}
                            onRemove={handleRemoveFavorite}
                            getTypeIcon={getTypeIcon}
                          />
                        ))}
                      </div>
                    )}

                    {/* Repositorios individuales (con users desplegables) */}
                    {repoFavs.length > 0 && (
                      <div className={styles.treeGroup}>
                        <div className={styles.treeGroupHeader}>
                          <GitFork size={12} />
                          <span>{t('favorites.treeRepositories', { count: repoFavs.length })}</span>
                        </div>
                        {repoFavs.map(fav => (
                          <TreeNode
                            key={fav.id}
                            entity={fav}
                            depth={0}
                            onRemove={handleRemoveFavorite}
                            getTypeIcon={getTypeIcon}
                          />
                        ))}
                      </div>
                    )}

                    {/* Usuarios individuales */}
                    {userFavs.length > 0 && (
                      <div className={styles.treeGroup}>
                        <div className={styles.treeGroupHeader}>
                          <User size={12} />
                          <span>{t('favorites.treeUsers', { count: userFavs.length })}</span>
                        </div>
                        {userFavs.map(fav => (
                          <TreeNode
                            key={fav.id}
                            entity={fav}
                            depth={0}
                            onRemove={handleRemoveFavorite}
                            getTypeIcon={getTypeIcon}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ─── Tab: Vistas ─── */}
          {tab === 'views' && (
            <>
              {views.length === 0 ? (
                <div className={styles.emptyState}>
                  <Eye size={32} strokeWidth={1} />
                  <p>{t('favorites.noCustomViews')}</p>
                  <span>{t('favorites.createViewHint')}</span>
                </div>
              ) : (
                <div className={styles.list}>
                  {views.map(view => (
                    <div 
                      key={view.id} 
                      className={`${styles.viewItem} ${activeViewId === view.id ? styles.viewItemActive : ''}`}
                    >
                      <div 
                        className={styles.viewColor}
                        style={{ background: view.color || '#00ffaa' }}
                      />
                      <div 
                        className={styles.viewInfo}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleActivateView(view.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleActivateView(view.id) }}
                      >
                        <span className={styles.viewName}>{view.name}</span>
                        <span className={styles.viewMeta}>
                          {view.entity_ids?.length || 0} {t('favorites.entities')}
                        </span>
                      </div>
                      <div className={styles.viewActions}>
                        {activeViewId === view.id ? (
                          <span className={styles.activeBadge}>{t('favorites.active')}</span>
                        ) : (
                          <button 
                            className={styles.activateBtn}
                            onClick={() => handleActivateView(view.id)}
                            title={t('favorites.activateView')}
                          >
                            <ChevronRight size={14} />
                          </button>
                        )}
                        <button 
                          className={styles.removeBtn}
                          onClick={() => handleDeleteView(view.id)}
                          title={t('favorites.deleteView')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Deactivate view button */}
              {activeViewId && (
                <button 
                  className={styles.deactivateBtn}
                  onClick={() => activateView(null)}
                >
                  <X size={14} />
                  <span>{t('favorites.backToGlobal')}</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer with export/import */}
        <div className={styles.footer}>
          <button className={styles.footerBtn} onClick={handleExport} title={t('favorites.exportTooltip')}>
            <Download size={14} />
            <span>{t('favorites.export')}</span>
          </button>
          <button 
            className={styles.footerBtn} 
            onClick={() => fileInputRef.current?.click()}
            title={t('favorites.importTooltip')}
          >
            <Upload size={14} />
            <span>{t('favorites.import')}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </div>
      </div>
    </div>
  )
}
