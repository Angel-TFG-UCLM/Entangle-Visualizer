/**
 * CollaborationPanel - Vista Fullscreen del Grafo de Colaboración
 * =================================================================
 * 
 * Overlay fullscreen que muestra el grafo completo de colaboración
 * auto-descubierto por el backend. Se abre al hacer click en el 
 * CollaborationBanner.
 * 
 * Muestra:
 * - Grafo grande con animaciones de construcción
 * - Bridge users (usuarios puente entre repos)
 * - Repos conectados y organizaciones
 * - Métricas de colaboración en tiempo real
 * - Click en usuario → navega a su red personal
 * 
 * Usa el mismo estilo visual que NetworkGraph para consistencia.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDashboardStore } from '../../store/dashboardStore'
import {
  FiX, FiUsers, FiGitBranch, FiActivity, FiGrid, FiUser, FiLink, FiZap
} from 'react-icons/fi'
import styles from './CollaborationPanel.module.css'

// Colores consistentes con NetworkGraph
const COLORS = {
  org: '#00f7ff',
  repo: '#bd00ff',
  user: '#00ff9f',
  center: '#ffbd00',
  link: 'rgba(255, 255, 255, 0.06)',
  linkHover: '#ffbd00',
  bridgeUser: '#ffbd00',
}

const TYPE_LABELS = { org: 'Organización', repo: 'Repositorio', user: 'Usuario' }

/**
 * FullscreenCollaborationGraph - Grafo heroico con estilo NetworkGraph
 */
function FullscreenCollaborationGraph({ data, onUserClick }) {
  const svgRef = useRef(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [animationComplete, setAnimationComplete] = useState(false)
  const [pulses, setPulses] = useState([])
  const pulseIdRef = useRef(0)
  const firePulseRef = useRef(null)
  const hoveredNodeRef = useRef(null)
  
  const { nodes: rawNodes, links: rawLinks } = data || { nodes: [], links: [] }
  
  // Calcular posiciones circulares multi-capa
  const { nodes, links } = useMemo(() => {
    if (!rawNodes.length) return { nodes: [], links: [] }
    
    const cx = 400, cy = 400
    
    // Separar por tipo
    const orgs = rawNodes.filter(n => n.type === 'org')
    const repos = rawNodes.filter(n => n.type === 'repo')
    const users = rawNodes.filter(n => n.type === 'user')
    
    const positionedNodes = []
    
    // Orgs en anillo interior (radio 120)
    orgs.forEach((node, i) => {
      const angle = (i / Math.max(orgs.length, 1)) * 2 * Math.PI - Math.PI / 2
      positionedNodes.push({
        ...node,
        x: cx + 120 * Math.cos(angle),
        y: cy + 120 * Math.sin(angle),
        size: 18
      })
    })
    
    // Repos en anillo medio (radio 240)
    repos.forEach((node, i) => {
      const angle = (i / Math.max(repos.length, 1)) * 2 * Math.PI - Math.PI / 2
      const jitter = (i % 3 - 1) * 15
      positionedNodes.push({
        ...node,
        x: cx + (240 + jitter) * Math.cos(angle),
        y: cy + (240 + jitter) * Math.sin(angle),
        size: 12
      })
    })
    
    // Users en anillo exterior (radio 340)
    users.forEach((node, i) => {
      const angle = (i / Math.max(users.length, 1)) * 2 * Math.PI - Math.PI / 2
      const isBridge = node.isBridge
      const radius = isBridge ? 320 : 350
      positionedNodes.push({
        ...node,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        size: isBridge ? 14 : 10
      })
    })
    
    return { nodes: positionedNodes, links: rawLinks }
  }, [rawNodes, rawLinks])
  
  // Crear mapa de posiciones
  const nodePositionMap = useMemo(() => {
    const map = {}
    nodes.forEach(n => { map[n.id] = { x: n.x, y: n.y } })
    return map
  }, [nodes])
  
  // Crear path curvo
  const createCurvePath = useCallback((source, target) => {
    const cx = 400, cy = 400
    const midX = (source.x + target.x) / 2
    const midY = (source.y + target.y) / 2
    const ctrlX = midX + (cx - midX) * 0.3
    const ctrlY = midY + (cy - midY) * 0.3
    return `M ${source.x},${source.y} Q ${ctrlX},${ctrlY} ${target.x},${target.y}`
  }, [])
  
  // Animación de entrada
  useEffect(() => {
    if (nodes.length > 0) {
      const timer = setTimeout(() => setAnimationComplete(true), 300)
      return () => clearTimeout(timer)
    }
    return () => setAnimationComplete(false)
  }, [nodes.length])
  
  // Refs para pulsos
  hoveredNodeRef.current = hoveredNode
  
  const firePulse = useCallback(() => {
    if (links.length === 0 || nodes.length === 0) return
    if (hoveredNodeRef.current) return
    
    const link = links[Math.floor(Math.random() * links.length)]
    const source = nodes.find(n => n.id === link.source)
    const target = nodes.find(n => n.id === link.target)
    if (!source || !target) return
    
    const reverse = Math.random() > 0.5
    const [from, to] = reverse ? [target, source] : [source, target]
    const id = pulseIdRef.current++
    const colors = [COLORS[from.type] || COLORS.user, COLORS[to.type] || COLORS.user]
    const color = colors[Math.floor(Math.random() * colors.length)]
    const curvePath = createCurvePath(from, to)
    const duration = 1.5 + Math.random() * 0.8
    
    setPulses(prev => [...prev, { id, path: curvePath, color, duration }])
    setTimeout(() => setPulses(prev => prev.filter(p => p.id !== id)), duration * 1000 + 100)
  }, [links, nodes, createCurvePath])
  
  firePulseRef.current = firePulse
  
  // Ráfaga inicial
  useEffect(() => {
    if (!animationComplete) return
    const timers = []
    for (let i = 0; i < 15; i++) {
      timers.push(setTimeout(() => firePulseRef.current?.(), 500 + i * 80))
    }
    return () => timers.forEach(clearTimeout)
  }, [animationComplete])
  
  // Pulsos ambientales
  useEffect(() => {
    if (!animationComplete) return
    let active = true
    let timeoutId
    
    const scheduleNext = () => {
      if (!active) return
      const delay = 800 + Math.random() * 2000
      timeoutId = setTimeout(() => {
        if (!active) return
        firePulseRef.current?.()
        scheduleNext()
      }, delay)
    }
    
    const startTimer = setTimeout(scheduleNext, 2000)
    return () => { active = false; clearTimeout(timeoutId); clearTimeout(startTimer) }
  }, [animationComplete])
  
  // Click en nodo
  const handleNodeClick = useCallback((node) => {
    if (node.type === 'user' && node.login && onUserClick) {
      onUserClick(node.login)
    }
  }, [onUserClick])
  
  // Links conectados al nodo hovered
  const hoveredConnections = useMemo(() => {
    if (!hoveredNode) return new Set()
    const connected = new Set()
    links.forEach(link => {
      if (link.source === hoveredNode.id || link.target === hoveredNode.id) {
        connected.add(link.source)
        connected.add(link.target)
      }
    })
    return connected
  }, [hoveredNode, links])
  
  if (!nodes.length) {
    return (
      <div className={styles.graphEmpty}>
        <FiLink size={48} />
        <p>No se encontraron relaciones de colaboración</p>
      </div>
    )
  }
  
  return (
    <div className={styles.graphWrapper}>
      <svg 
        ref={svgRef}
        viewBox="0 0 800 800"
        className={styles.collaborationSvg}
      >
        <defs>
          <filter id="fgGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="fgGlowStrong" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="fgPulseGlow" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur stdDeviation="6" result="glow1"/>
            <feGaussianBlur stdDeviation="2" in="SourceGraphic" result="glow2"/>
            <feMerge>
              <feMergeNode in="glow1"/>
              <feMergeNode in="glow2"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="fgNucleusGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="nucBlur"/>
            <feMerge>
              <feMergeNode in="nucBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Núcleo central decorativo */}
        <g className={styles.atomicNucleus}>
          <circle cx="400" cy="400" r="50" fill="none" stroke="rgba(0, 212, 228, 0.04)" strokeWidth="1" className={styles.nucleusHalo} />
          <ellipse cx="400" cy="400" rx="70" ry="25" fill="none" stroke="rgba(0, 212, 228, 0.08)" strokeWidth="0.6" strokeDasharray="4 6" className={styles.orbit} style={{ animationDuration: '12s' }} />
          <ellipse cx="400" cy="400" rx="70" ry="25" fill="none" stroke="rgba(157, 111, 219, 0.08)" strokeWidth="0.6" strokeDasharray="4 6" className={styles.orbit} style={{ animationDuration: '18s', transform: 'rotate(60deg)', transformOrigin: '400px 400px' }} />
          <ellipse cx="400" cy="400" rx="70" ry="25" fill="none" stroke="rgba(0, 255, 159, 0.06)" strokeWidth="0.6" strokeDasharray="4 6" className={styles.orbit} style={{ animationDuration: '24s', transform: 'rotate(120deg)', transformOrigin: '400px 400px' }} />
          <circle r="3" fill="#00D4E4" filter="url(#fgNucleusGlow)" className={styles.electron}>
            <animateMotion dur="12s" repeatCount="indefinite" path="M 470,400 A 70,25 0 1,1 330,400 A 70,25 0 1,1 470,400" />
          </circle>
          <circle r="2.5" fill="#9D6FDB" filter="url(#fgNucleusGlow)" className={styles.electron}>
            <animateMotion dur="18s" repeatCount="indefinite" path="M 460,418 A 70,25 60 1,1 340,382 A 70,25 60 1,1 460,418" />
          </circle>
          <circle r="2" fill="#00ff9f" filter="url(#fgNucleusGlow)" className={styles.electron}>
            <animateMotion dur="24s" repeatCount="indefinite" path="M 340,418 A 70,25 120 1,1 460,382 A 70,25 120 1,1 340,418" />
          </circle>
          <circle cx="400" cy="400" r="5" fill="rgba(0, 212, 228, 0.2)" filter="url(#fgNucleusGlow)" className={styles.nucleusCore} />
          <circle cx="400" cy="400" r="2" fill="rgba(255, 255, 255, 0.4)" />
        </g>
        
        {/* Anillos de referencia */}
        <circle cx="400" cy="400" r="120" fill="none" stroke="rgba(0, 212, 228, 0.04)" strokeWidth="0.5" strokeDasharray="2 8" />
        <circle cx="400" cy="400" r="240" fill="none" stroke="rgba(157, 111, 219, 0.04)" strokeWidth="0.5" strokeDasharray="2 8" />
        <circle cx="400" cy="400" r="340" fill="none" stroke="rgba(0, 255, 159, 0.03)" strokeWidth="0.5" strokeDasharray="2 8" />
        
        {/* Enlaces */}
        <g className={styles.linksGroup}>
          {links.map((link, index) => {
            const source = nodePositionMap[link.source]
            const target = nodePositionMap[link.target]
            if (!source || !target) return null
            
            const isHighlighted = hoveredNode && (
              link.source === hoveredNode.id || link.target === hoveredNode.id
            )
            const isDimmed = hoveredNode && !isHighlighted
            
            return (
              <path
                key={`link-${index}`}
                d={createCurvePath(source, target)}
                stroke={isHighlighted ? COLORS.linkHover : COLORS.link}
                strokeWidth={isHighlighted ? 2 : 0.7}
                fill="none"
                filter={isHighlighted ? 'url(#fgGlow)' : undefined}
                opacity={isDimmed ? 0.1 : 1}
                className={`${styles.link} ${animationComplete ? styles.animate : ''}`}
                style={{ animationDelay: `${index * 0.015}s` }}
              />
            )
          })}
        </g>
        
        {/* Nodos */}
        <g className={styles.nodesGroup}>
          {nodes.map((node, index) => {
            const isHovered = hoveredNode?.id === node.id
            const isConnected = hoveredConnections.has(node.id)
            const isDimmed = hoveredNode && !isHovered && !isConnected
            const isBridge = node.isBridge
            
            let color = COLORS[node.type] || COLORS.user
            if (isBridge) color = COLORS.bridgeUser
            if (isHovered) color = COLORS.center
            
            return (
              <g
                key={node.id}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => handleNodeClick(node)}
                className={`${styles.node} ${animationComplete ? styles.animate : ''}`}
                style={{ 
                  animationDelay: `${index * 0.025}s`,
                  cursor: node.type === 'user' ? 'pointer' : 'default',
                  opacity: isDimmed ? 0.2 : 1
                }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.size}
                  fill={color}
                  filter={isHovered || isBridge ? "url(#fgGlowStrong)" : "url(#fgGlow)"}
                  className={styles.nodeCircle}
                />
                {isHovered && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.size + 6}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    className={styles.nodeRing}
                  />
                )}
                {isBridge && !isHovered && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.size + 4}
                    fill="none"
                    stroke={color}
                    strokeWidth="1"
                    opacity="0.4"
                    className={styles.bridgeRing}
                  />
                )}
              </g>
            )
          })}
        </g>
        
        {/* Pulsos de energía */}
        <g className={`${styles.pulsesGroup} ${hoveredNode ? styles.pulsesHidden : ''}`}>
          {pulses.map(pulse => (
            <g key={pulse.id} className={styles.pulseWrapper}>
              <path
                d={pulse.path}
                fill="none"
                stroke={pulse.color}
                strokeWidth={1.5}
                filter="url(#fgPulseGlow)"
                className={styles.pulseTrail}
                style={{ animationDuration: `${pulse.duration}s` }}
              />
              <circle r="3.5" fill={pulse.color} filter="url(#fgPulseGlow)" className={styles.pulseDot}>
                <animateMotion
                  dur={`${pulse.duration}s`}
                  fill="freeze"
                  path={pulse.path}
                  calcMode="spline"
                  keySplines="0.4 0 0.2 1"
                  keyTimes="0;1"
                />
              </circle>
            </g>
          ))}
        </g>
        
        {/* Tooltip */}
        {hoveredNode && (() => {
          const node = hoveredNode
          const displayName = node.name || node.login || node.full_name || node.id
          const tooltipW = Math.min(Math.max(displayName.length * 8 + 30, 100), 220)
          const tooltipH = node.type === 'user' && node.repos_count ? 46 : 32
          
          let tx = node.x - tooltipW / 2
          let ty = node.y - node.size - tooltipH - 10
          if (ty < 10) ty = node.y + node.size + 10
          if (tx < 10) tx = 10
          if (tx + tooltipW > 790) tx = 790 - tooltipW
          
          const nodeColor = node.isBridge ? COLORS.bridgeUser : (COLORS[node.type] || COLORS.user)
          
          return (
            <g className={styles.tooltip}>
              <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx="8" fill="rgba(15, 15, 35, 0.95)" />
              <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx="8" fill="none" stroke={nodeColor} strokeWidth="1" opacity="0.6" />
              <rect x={tx + 8} y={ty} width={tooltipW - 16} height="2" rx="1" fill={nodeColor} opacity="0.8" />
              <text 
                x={tx + tooltipW / 2} 
                y={ty + 16} 
                textAnchor="middle" 
                dy="0.35em" 
                fill={nodeColor} 
                fontSize="12" 
                fontWeight="600"
              >
                {displayName.length > 24 ? displayName.slice(0, 22) + '...' : displayName}
              </text>
              {/* Subtítulo: tipo + info extra */}
              <text
                x={tx + tooltipW / 2}
                y={ty + 16 + (node.repos_count ? 16 : 0)}
                textAnchor="middle"
                dy="0.35em"
                fill="rgba(255,255,255,0.5)"
                fontSize="10"
              >
                {node.repos_count ? `${TYPE_LABELS[node.type]} · ${node.repos_count} repos` : TYPE_LABELS[node.type]}
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

/**
 * BridgeUsersList - Lista de usuarios puente
 */
function BridgeUsersList({ users, onUserClick }) {
  if (!users?.length) return null
  
  return (
    <ul className={styles.bridgeList}>
      {users.slice(0, 15).map((user, i) => (
        <li 
          key={user.login || i}
          className={styles.bridgeItem}
          onClick={() => onUserClick?.(user.login)}
        >
          <div className={styles.bridgeAvatar}>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.login} />
            ) : (
              <FiUser size={14} />
            )}
          </div>
          
          <div className={styles.bridgeInfo}>
            <span className={styles.bridgeName}>{user.name || user.login}</span>
            <span className={styles.bridgeLogin}>@{user.login}</span>
          </div>
          
          <div className={styles.bridgeMeta}>
            <span className={styles.bridgeBadge}>
              <FiGitBranch size={11} />
              {user.repos_count} repos
            </span>
            {user.cross_org && (
              <span className={styles.crossOrgBadge}>
                <FiGrid size={10} />
                cross-org
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}


/**
 * CollaborationPanel - Overlay Fullscreen Principal
 */
export default function CollaborationPanel() {
  const {
    showCollaborationGraph,
    collaborationDiscovery,
    closeCollaborationGraph,
    selectUserForAnalysis
  } = useDashboardStore(
    useShallow(s => ({ showCollaborationGraph: s.showCollaborationGraph, collaborationDiscovery: s.collaborationDiscovery, closeCollaborationGraph: s.closeCollaborationGraph, selectUserForAnalysis: s.selectUserForAnalysis }))
  )
  
  const [entering, setEntering] = useState(false)
  
  // Animación de entrada
  useEffect(() => {
    if (showCollaborationGraph) {
      requestAnimationFrame(() => setEntering(true))
    } else {
      setEntering(false)
    }
  }, [showCollaborationGraph])
  
  // Escape para cerrar
  useEffect(() => {
    if (!showCollaborationGraph) return
    const handleKey = (e) => {
      if (e.key === 'Escape') closeCollaborationGraph()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showCollaborationGraph, closeCollaborationGraph])
  
  const handleUserClick = useCallback((login) => {
    closeCollaborationGraph()
    // Pequeño delay para que se cierre el overlay antes de abrir el panel
    setTimeout(() => selectUserForAnalysis(login), 300)
  }, [closeCollaborationGraph, selectUserForAnalysis])
  
  if (!showCollaborationGraph) return null
  
  const data = collaborationDiscovery
  const graph = data?.graph
  const metrics = data?.metrics
  const bridgeUsers = data?.bridge_users
  const connectedPairs = data?.connected_pairs
  
  return (
    <div className={`${styles.overlay} ${entering ? styles.overlayVisible : ''}`}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <FiZap size={20} />
          </div>
          <div className={styles.headerText}>
            <h2>Grafo de Colaboración</h2>
            <span className={styles.headerSummary}>{data?.summary}</span>
          </div>
        </div>
        
        <button 
          className={styles.closeBtn}
          onClick={closeCollaborationGraph}
          aria-label="Cerrar"
        >
          <FiX size={20} />
          <span>ESC</span>
        </button>
      </header>
      
      {/* Layout principal: grafo + sidebar */}
      <div className={styles.layout}>
        {/* Grafo (área principal) */}
        <div className={styles.graphArea}>
          <FullscreenCollaborationGraph 
            data={graph}
            onUserClick={handleUserClick}
          />
          
          {/* Leyenda flotante */}
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={styles.legendDot} style={{ background: COLORS.org }} />
              <span>Organizaciones</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendDot} style={{ background: COLORS.repo }} />
              <span>Repositorios</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendDot} style={{ background: COLORS.user }} />
              <span>Usuarios</span>
            </div>
            <div className={styles.legendItem}>
              <div className={styles.legendDot} style={{ background: COLORS.bridgeUser }} />
              <span>Usuarios Puente</span>
            </div>
          </div>
        </div>
        
        {/* Sidebar con información */}
        <aside className={styles.sidebar}>
          {/* Métricas */}
          <section className={styles.sideSection}>
            <h3><FiActivity size={14} /> Métricas</h3>
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <span className={styles.metricValue}>{metrics?.bridge_users_count || 0}</span>
                <span className={styles.metricLabel}>Bridge Users</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricValue}>{metrics?.connected_repo_pairs || 0}</span>
                <span className={styles.metricLabel}>Pares Conectados</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricValue}>{metrics?.cross_org_users || 0}</span>
                <span className={styles.metricLabel}>Cross-Org</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricValue}>{metrics?.collaboration_density || 0}%</span>
                <span className={styles.metricLabel}>Densidad</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricValue}>{metrics?.graph_nodes || 0}</span>
                <span className={styles.metricLabel}>Nodos</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricValue}>{metrics?.graph_links || 0}</span>
                <span className={styles.metricLabel}>Enlaces</span>
              </div>
            </div>
          </section>
          
          {/* Bridge Users */}
          <section className={styles.sideSection}>
            <h3><FiUsers size={14} /> Usuarios Puente</h3>
            <p className={styles.sideHint}>
              Usuarios que contribuyen a múltiples repositorios, conectando equipos
            </p>
            <BridgeUsersList 
              users={bridgeUsers}
              onUserClick={handleUserClick}
            />
          </section>
          
          {/* Pares conectados */}
          {connectedPairs?.length > 0 && (
            <section className={styles.sideSection}>
              <h3><FiLink size={14} /> Repos Más Conectados</h3>
              <ul className={styles.pairsList}>
                {connectedPairs.slice(0, 8).map((pair, i) => (
                  <li key={i} className={styles.pairItem}>
                    <div className={styles.pairRepos}>
                      <span>{pair.repo_a?.split('/')[1] || pair.repo_a}</span>
                      <FiLink size={10} className={styles.pairLinkIcon} />
                      <span>{pair.repo_b?.split('/')[1] || pair.repo_b}</span>
                    </div>
                    <span className={styles.pairCount}>{pair.shared_count} compartidos</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
