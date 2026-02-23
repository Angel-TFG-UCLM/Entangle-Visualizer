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

/* ────────── Sub-componente: Repo expandible dentro del árbol ────────── */
function TreeNodeRepo({ repo, depth, getTypeIcon }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState(null)
  const [loadingChildren, setLoadingChildren] = useState(false)

  const handleToggle = useCallback(async () => {
    if (expanded) { setExpanded(false); return }
    if (!children) {
      setLoadingChildren(true)
      try {
        const data = await getFavoriteChildren(repo.id)
        setChildren(data.children || [])
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
            {repo.subtitle || `${repo.collaborators_count || 0} colaboradores`}
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
                <span className={styles.bridgeBadge}>Bridge</span>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && children && children.length === 0 && (
        <div className={styles.treeEmpty} style={{ paddingLeft: `${24 + depth * 16}px` }}>
          Sin colaboradores
        </div>
      )}
    </div>
  )
}

/* ────────── Sub-componente: Nodo principal del árbol (org/repo/user directo) ────────── */
function TreeNode({ entity, depth = 0, onRemove, getTypeIcon }) {
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
        const data = await getFavoriteChildren(entity.id)
        setChildren(data.children || [])
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
            {entity.type === 'organization' ? 'Organización'
              : entity.type === 'repository' ? 'Repositorio'
              : 'Usuario'}
          </span>
        </div>
        {depth === 0 && onRemove && (
          <button
            className={styles.removeBtn}
            onClick={() => onRemove(entity)}
            title="Eliminar de favoritos"
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
                    {child.subtitle || (child.is_bridge ? 'Bridge User' : 'Colaborador')}
                  </span>
                </div>
                {child.is_bridge && (
                  <span className={styles.bridgeBadge}>Bridge</span>
                )}
              </div>
            )
          ))}
        </div>
      )}

      {expanded && children && children.length === 0 && (
        <div className={styles.treeEmpty} style={{ paddingLeft: `${24 + depth * 16}px` }}>
          Sin entidades derivadas
        </div>
      )}
    </div>
  )
}

/* ────────── Componente principal ────────── */
export default function FavoritesPanel({ isOpen, onClose }) {
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
        message: `Importados: ${results.favorites} favoritos, ${results.views} vistas`,
      })
      setTimeout(() => setImportStatus(null), 3000)
    } catch (err) {
      setImportStatus({
        type: 'error',
        message: 'Error al importar: formato inválido',
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
      setDetailError('No se pudo cargar la información')
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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Star size={18} className={styles.headerIcon} />
            <span>Favoritos & Vistas</span>
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
            <span>Favoritos</span>
            {favorites.length > 0 && (
              <span className={styles.tabBadge}>{favorites.length}</span>
            )}
          </button>
          <button 
            className={`${styles.tab} ${tab === 'views' ? styles.tabActive : ''}`}
            onClick={() => setTab('views')}
          >
            <Eye size={14} />
            <span>Vistas</span>
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
                    placeholder="Buscar usuarios, repos, orgs..."
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
                      <div className={styles.searchLoading}>Buscando...</div>
                    ) : searchResults.length === 0 && !isSearching ? (
                      <div className={styles.searchEmpty}>Sin resultados para "{searchQuery}"</div>
                    ) : (
                      searchResults.map(entity => {
                        const favorited = isEntityFavorited(entity.id)
                        return (
                          <div key={entity.id} className={styles.searchResultItem}>
                            <div 
                              className={styles.searchResultClickable}
                              onClick={() => handleOpenDetail(entity)}
                              title="Ver detalles"
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
                              title={favorited ? 'Quitar de favoritos' : 'Añadir a favoritos'}
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
                      {entityDetailType === 'user' ? 'Usuario' : entityDetailType === 'repository' ? 'Repositorio' : 'Organización'}
                    </span>
                    <button className={styles.entityInlineClose} onClick={handleCloseDetail}>
                      <X size={12} />
                    </button>
                  </div>

                  {loadingDetail && (
                    <div className={styles.entityInlineLoading}>
                      <Loader size={20} className={styles.searchSpinner} />
                      <span>Cargando detalles...</span>
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
                    const t = entityDetailType
                    const typeColors = { user: '#00ff9f', repository: '#9D6FDB', organization: '#00D4E4' }
                    const accentColor = typeColors[t] || '#00D4E4'
                    const entityId = t === 'user' ? `user_${d.login}` : t === 'repository' ? `repo_${d.full_name || d.name}` : `org_${d.login}`
                    const favorited = isEntityFavorited(entityId)
                    const githubUrl = t === 'user' ? `https://github.com/${d.login}`
                      : t === 'repository' ? `https://github.com/${d.full_name || d.name}`
                      : `https://github.com/${d.login}`

                    return (
                      <div className={styles.entityInlineBody}>
                        {/* Identity */}
                        <div className={styles.entityInlineIdentity}>
                          {d.avatar_url ? (
                            <img src={d.avatar_url} alt="" className={styles.entityInlineAvatar} />
                          ) : (
                            <div className={styles.entityInlineAvatarFallback} style={{ borderColor: accentColor }}>
                              {t === 'user' ? <User size={18} /> : t === 'repository' ? <GitFork size={18} /> : <Building2 size={18} />}
                            </div>
                          )}
                          <div className={styles.entityInlineNameBlock}>
                            <h4 className={styles.entityInlineName}>
                              {t === 'user' ? (d.name || d.login) : (d.name || d.full_name || d.login)}
                            </h4>
                            {t === 'user' && d.name && d.login && (
                              <span className={styles.entityInlineLogin}>@{d.login}</span>
                            )}
                            {t === 'repository' && d.full_name && (
                              <span className={styles.entityInlineLogin}>{d.full_name}</span>
                            )}
                            <span className={styles.entityInlineTypeBadge} style={{ color: accentColor, borderColor: `${accentColor}40` }}>
                              {t === 'user' ? 'Usuario' : t === 'repository' ? 'Repositorio' : 'Organización'}
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
                          if (t === 'organization' && d.is_verified) badges.push({ icon: Shield, label: 'Verificada', color: '#22C55E' })
                          if (t === 'organization' && d.is_quantum_focused) badges.push({ icon: Zap, label: 'Quantum Focus', color: '#F59E0B' })
                          if (t === 'repository' && d.is_fork) badges.push({ icon: GitFork, label: 'Fork', color: '#9D6FDB' })
                          if (t === 'repository' && d.is_archived) badges.push({ icon: Archive, label: 'Archivado', color: '#EF4444' })
                          if (t === 'user' && d.is_hireable) badges.push({ icon: Briefcase, label: 'Disponible', color: '#22C55E' })
                          if (t === 'user' && d.quantum_expertise_score > 0) badges.push({ icon: Cpu, label: `QE ${d.quantum_expertise_score.toFixed(1)}`, color: '#00D4E4' })
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
                          {t === 'user' && (() => {
                            // Usar métricas pre-calculadas del backend (consistentes con Dashboard)
                            const contributions = d._total_quantum_contributions || 0
                            const repos = d._relevant_repos_count || 0
                            const collabScore = d._collab_score || 0
                            return (
                              <>
                                <div className={styles.entityInlineStat}>
                                  <span className={styles.entityInlineStatVal} style={{ color: '#00D4E4' }}>{collabScore.toLocaleString()}</span>
                                  <span className={styles.entityInlineStatLbl}>Collab Score</span>
                                </div>
                                <div className={styles.entityInlineStat}>
                                  <span className={styles.entityInlineStatVal} style={{ color: '#9D6FDB' }}>{contributions.toLocaleString()}</span>
                                  <span className={styles.entityInlineStatLbl}>Contrib. Quantum</span>
                                </div>
                                <div className={styles.entityInlineStat}>
                                  <span className={styles.entityInlineStatVal} style={{ color: '#F59E0B' }}>{(d.followers_count || 0).toLocaleString()}</span>
                                  <span className={styles.entityInlineStatLbl}>Seguidores</span>
                                </div>
                                <div className={styles.entityInlineStat}>
                                  <span className={styles.entityInlineStatVal} style={{ color: '#00ff9f' }}>{repos.toLocaleString()}</span>
                                  <span className={styles.entityInlineStatLbl}>Repos Quantum</span>
                                </div>
                              </>
                            )
                          })()}
                          {t === 'repository' && (
                            <>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#F59E0B' }}>{(d.stargazer_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>Estrellas</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#9D6FDB' }}>{(d.fork_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>Forks</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#00D4E4' }}>{(d.collaborators_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>Contribuidores</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#00ff9f' }}>{(d.watchers_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>Watchers</span>
                              </div>
                            </>
                          )}
                          {t === 'organization' && (
                            <>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#00D4E4' }}>{(d.quantum_repositories_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>Repos Quantum</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#F59E0B' }}>{(d.total_stars || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>Estrellas</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#9D6FDB' }}>{(d.total_unique_contributors || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>Contributors</span>
                              </div>
                              <div className={styles.entityInlineStat}>
                                <span className={styles.entityInlineStatVal} style={{ color: '#00ff9f' }}>{(d.total_repositories_count || 0).toLocaleString()}</span>
                                <span className={styles.entityInlineStatLbl}>Repos Totales</span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Additional info section */}
                        {t === 'repository' && (
                          <div className={styles.entityInlineSection}>
                            <div className={styles.entityInlineMetaGrid}>
                              {d.primary_language && (
                                <div className={styles.entityInlineMetaItem}>
                                  <span className={styles.entityInlineMetaLabel}>Lenguaje</span>
                                  <span className={styles.entityInlineMetaValue}>{d.primary_language}</span>
                                </div>
                              )}
                              {d.commits_count > 0 && (
                                <div className={styles.entityInlineMetaItem}>
                                  <span className={styles.entityInlineMetaLabel}>Commits</span>
                                  <span className={styles.entityInlineMetaValue}>{d.commits_count.toLocaleString()}</span>
                                </div>
                              )}
                              {d.pull_requests_count > 0 && (
                                <div className={styles.entityInlineMetaItem}>
                                  <span className={styles.entityInlineMetaLabel}>PRs</span>
                                  <span className={styles.entityInlineMetaValue}>{d.pull_requests_count.toLocaleString()}</span>
                                </div>
                              )}
                              {d.issues_count > 0 && (
                                <div className={styles.entityInlineMetaItem}>
                                  <span className={styles.entityInlineMetaLabel}>Issues</span>
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

                        {t === 'user' && (
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
                                <span className={styles.entityInlineOrgsLabel}>Organizaciones:</span>
                                {d.organizations.slice(0, 5).map((org, i) => (
                                  <span key={i} className={styles.entityInlineOrgTag}>
                                    {typeof org === 'string' ? org : org.login || org.name}
                                  </span>
                                ))}
                                {d.organizations.length > 5 && (
                                  <span className={styles.entityInlineOrgMore}>+{d.organizations.length - 5} más</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {t === 'organization' && (
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
                                <span className={styles.entityInlineOrgsLabel}>Lenguajes:</span>
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
                            onClick={() => toggleFavorite({ id: entityId, name: d.name || d.login || d.full_name, type: t })}
                          >
                            <Star size={13} fill={favorited ? 'currentColor' : 'none'} />
                            <span>{favorited ? 'En favoritos' : 'Añadir a favoritos'}</span>
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
                          {t === 'user' && d.login && (
                            <button
                              className={`${styles.entityInlineActionBtn} ${styles.entityInlineActionNetwork}`}
                              onClick={() => handleCollaborationNetwork(d.login)}
                            >
                              <Network size={13} />
                              <span>Red de colaboración</span>
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
                  <p>Sin favoritos aún</p>
                  <span>Usa la barra de búsqueda o marca entidades desde el Universo 3D</span>
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
                      <span>Crear vista con favoritos</span>
                    </button>
                  )}

                  {/* Create view form */}
                  {showCreateView && (
                    <div className={styles.createViewForm}>
                      <h4 className={styles.formTitle}>Nueva Vista Personalizada</h4>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="Nombre de la vista..."
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
                          Cancelar
                        </button>
                        <button 
                          className={styles.formSubmit}
                          onClick={handleCreateView}
                          disabled={!newViewName.trim() || selectedForView.length === 0 || isLoading}
                        >
                          <Plus size={14} />
                          Crear Vista ({selectedForView.length})
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
                          <span>Organizaciones ({orgFavs.length})</span>
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
                          <span>Repositorios ({repoFavs.length})</span>
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
                          <span>Usuarios ({userFavs.length})</span>
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
                  <p>Sin vistas personalizadas</p>
                  <span>Crea vistas desde tus favoritos para filtrar el dashboard</span>
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
                        onClick={() => handleActivateView(view.id)}
                      >
                        <span className={styles.viewName}>{view.name}</span>
                        <span className={styles.viewMeta}>
                          {view.entity_ids?.length || 0} entidades
                        </span>
                      </div>
                      <div className={styles.viewActions}>
                        {activeViewId === view.id ? (
                          <span className={styles.activeBadge}>Activa</span>
                        ) : (
                          <button 
                            className={styles.activateBtn}
                            onClick={() => handleActivateView(view.id)}
                            title="Activar vista"
                          >
                            <ChevronRight size={14} />
                          </button>
                        )}
                        <button 
                          className={styles.removeBtn}
                          onClick={() => handleDeleteView(view.id)}
                          title="Eliminar vista"
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
                  <span>Volver al dashboard global</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer with export/import */}
        <div className={styles.footer}>
          <button className={styles.footerBtn} onClick={handleExport} title="Exportar datos">
            <Download size={14} />
            <span>Exportar</span>
          </button>
          <button 
            className={styles.footerBtn} 
            onClick={() => fileInputRef.current?.click()}
            title="Importar datos"
          >
            <Upload size={14} />
            <span>Importar</span>
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
