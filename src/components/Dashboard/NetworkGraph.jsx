/**
 * NETWORK GRAPH - Visualización Circular Cyberpunk
 */

import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useDashboardStore } from '../../store/dashboardStore'
import styles from './NetworkGraph.module.css'

const COLORS = {
  org: '#00f7ff',
  repo: '#bd00ff',
  user: '#00ff9f',
  highlight: '#ffbd00',
  link: 'rgba(255, 255, 255, 0.08)',
  linkHover: '#ffbd00',
}

function generateCircularGraphData(data, selectedOrg, selectedLanguage) {
  const { organizations = [], users = [], repositories = [] } = data || {}
  const nodes = []
  const links = []
  const nodeMap = new Map()
  
  const filteredOrgs = selectedOrg ? organizations.filter(org => org.login === selectedOrg) : organizations
  const filteredRepos = repositories.filter(repo => {
    const matchesOrg = !selectedOrg || repo.owner?.login === selectedOrg || repo.organization?.login === selectedOrg
    const matchesLang = !selectedLanguage || repo.primary_language?.name === selectedLanguage || repo.language === selectedLanguage
    return matchesOrg && matchesLang
  })
  const filteredUsers = selectedOrg ? users.filter(user => user.company === selectedOrg || user.organizations?.some(org => (typeof org === 'string' ? org : org?.login) === selectedOrg)) : users

  filteredOrgs.forEach(org => {
    nodes.push({
      id: `org_${org.login}`,
      name: org.name || org.login,
      type: 'org',
      size: 18,
      isSelected: selectedOrg === org.login,
      data: org,
    })
    nodeMap.set(`org_${org.login}`, nodes[nodes.length - 1])
  })

  const topRepos = filteredRepos.sort((a, b) => (b.stargazer_count || 0) - (a.stargazer_count || 0)).slice(0, 15)
  topRepos.forEach(repo => {
    const node = {
      id: `repo_${repo.full_name}`,
      name: repo.name,
      type: 'repo',
      size: 14,
      isSelected: false,
      data: repo,
    }
    nodes.push(node)
    nodeMap.set(node.id, node)
    const orgLogin = repo.owner?.login || repo.organization?.login
    if (orgLogin) links.push({ source: node.id, target: `org_${orgLogin}` })
  })

  const topUsers = filteredUsers.sort((a, b) => (b.quantum_expertise_score || 0) - (a.quantum_expertise_score || 0)).slice(0, 30)
  topUsers.forEach(user => {
    const node = {
      id: `user_${user.login}`,
      name: user.name || user.login,
      type: 'user',
      size: 12,
      isSelected: false,
      data: user,
    }
    nodes.push(node)
    nodeMap.set(node.id, node)
    if (user.organizations && Array.isArray(user.organizations)) {
      user.organizations.forEach(org => {
        const orgName = typeof org === 'string' ? org : (org?.login || org?.name || '')
        const orgId = `org_${orgName}`
        if (nodeMap.has(orgId)) links.push({ source: node.id, target: orgId })
      })
    }
    topRepos.forEach(repo => {
      if (repo.collaborators && repo.collaborators.some(c => c.login === user.login)) {
        links.push({ source: node.id, target: `repo_${repo.full_name}` })
      }
    })
  })

  const radius = 320, centerX = 350, centerY = 350, totalNodes = nodes.length
  nodes.forEach((node, index) => {
    const angle = (index / totalNodes) * 2 * Math.PI - Math.PI / 2
    node.x = centerX + radius * Math.cos(angle)
    node.y = centerY + radius * Math.sin(angle)
    node.angle = angle
    node.index = index
  })

  return { nodes, links }
}

/**
 * FilterBadge - indicador de filtro activo con animaciones
 */
function FilterBadge({ value, onClear, label }) {
  const [state, setState] = useState('hidden')
  const [displayValue, setDisplayValue] = useState(value)
  const prevValueRef = useRef(null)
  const timeoutRef = useRef(null)
  const valueRef = useRef(null)
  const [valueOverflows, setValueOverflows] = useState(false)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (value && !prevValueRef.current) {
      setDisplayValue(value)
      setState('entering')
      timeoutRef.current = setTimeout(() => setState('visible'), 20)
    } else if (value && prevValueRef.current && value !== prevValueRef.current) {
      setState('changing')
      timeoutRef.current = setTimeout(() => { setDisplayValue(value); setState('visible') }, 150)
    } else if (!value && prevValueRef.current) {
      setState('exiting')
      timeoutRef.current = setTimeout(() => { setState('hidden'); setDisplayValue(null) }, 200)
    }
    prevValueRef.current = value
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [value])

  useEffect(() => {
    const el = valueRef.current
    if (!el) return
    const check = () => {
      const overflow = el.scrollWidth - el.clientWidth
      if (overflow > 2) {
        setValueOverflows(true)
        el.style.setProperty('--marquee-distance', `-${overflow + 8}px`)
      } else {
        setValueOverflows(false)
      }
    }
    const timer = setTimeout(check, 300)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { clearTimeout(timer); ro.disconnect() }
  }, [displayValue])

  if (state === 'hidden' && !value) return null

  const cls = [styles.filterIndicator]
  if (state === 'visible' || state === 'changing') cls.push(styles.filterVisible)
  if (state === 'exiting') cls.push(styles.filterExiting)

  return (
    <div className={cls.join(' ')}>
      <span className={styles.filterLabel}>✓ {label}:</span>
      <div ref={valueRef} className={`${styles.filterValueWrapper} ${valueOverflows ? styles.filterValueMarquee : ''}`}>
        <strong className={state === 'changing' ? styles.valueChanging : ''}>{displayValue}</strong>
      </div>
      <button className={styles.clearButton} onClick={onClear} title="Quitar filtro">✕</button>
    </div>
  )
}

export default function NetworkGraph() {
  const svgRef = useRef()
  const sectionRef = useRef()
  const [hoveredNode, setHoveredNode] = useState(null)
  const [animationComplete, setAnimationComplete] = useState(false)
  const [pulses, setPulses] = useState([])
  const pulseIdRef = useRef(0)
  const firePulseRef = useRef(null)
  
  const { data, selectedOrg, selectedLanguage, setFilter } = useDashboardStore()
  
  // Generar datos del grafo con posiciones circulares
  const graphData = useMemo(
    () => generateCircularGraphData(data, selectedOrg, selectedLanguage),
    [data, selectedOrg, selectedLanguage]
  )

  const { nodes, links } = graphData

  // Activar animación cuando el grafo sea visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Esperar un poco para que se vea bien la entrada
            setTimeout(() => setAnimationComplete(true), 200)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.2 } // Se activa cuando el 20% del grafo es visible
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const handleNodeClick = useCallback((node) => {
    if (node.type === 'org') {
      setFilter('org', node.data.login)
    } else if (node.type === 'repo') {
      setFilter('repo', node.data.full_name)
    }
    // Los usuarios no tienen filtro directo, están vinculados a organizaciones
  }, [setFilter])

  const createCurvePath = useCallback((source, target) => {
    return `M ${source.x},${source.y} Q 350,350 ${target.x},${target.y}`
  }, [])

  // ─── Pulsos de luz viajando por las conexiones ───
  const hoveredNodeRef = useRef(null)
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
    const colors = [COLORS[from.type], COLORS[to.type]]
    const color = colors[Math.floor(Math.random() * colors.length)]
    const curvePath = `M ${from.x},${from.y} Q 350,350 ${to.x},${to.y}`
    const duration = 1.2 + Math.random() * 0.8 // 1.2s–2s

    setPulses(prev => [...prev, { id, path: curvePath, color, duration }])
    setTimeout(() => setPulses(prev => prev.filter(p => p.id !== id)), duration * 1000 + 100)
  }, [links, nodes])

  firePulseRef.current = firePulse

  // Ráfaga inicial al aparecer el grafo (oleadas)
  useEffect(() => {
    if (!animationComplete) return
    const timers = []
    // Primera oleada: 15 pulsos rápidos
    for (let i = 0; i < 15; i++) {
      timers.push(setTimeout(() => firePulseRef.current?.(), 400 + i * 100))
    }
    // Segunda oleada: 10 más algo después
    for (let i = 0; i < 10; i++) {
      timers.push(setTimeout(() => firePulseRef.current?.(), 2200 + i * 120))
    }
    return () => timers.forEach(clearTimeout)
  }, [animationComplete])

  // Pulsos ambientales esporádicos
  useEffect(() => {
    if (!animationComplete) return
    let active = true
    let timeoutId

    const scheduleNext = () => {
      if (!active) return
      const delay = 2000 + Math.random() * 4000
      timeoutId = setTimeout(() => {
        if (!active) return
        firePulseRef.current?.()
        // A veces lanzar un segundo pulso casi simultáneo
        if (Math.random() > 0.6) {
          setTimeout(() => { if (active) firePulseRef.current?.() }, 200 + Math.random() * 400)
        }
        scheduleNext()
      }, delay)
    }

    const startTimer = setTimeout(scheduleNext, 3000)
    return () => { active = false; clearTimeout(timeoutId); clearTimeout(startTimer) }
  }, [animationComplete])

  return (
    <section ref={sectionRef} className={styles.graphSection}>
      <div className={styles.sectionHeader}>
        <div className={styles.headerLeft}>
          <h2 className={styles.sectionTitle}>🔗 Red de Colaboración</h2>
          <p className={styles.sectionSubtitle}>Mapa de entrelazamiento del ecosistema cuántico</p>
        </div>
        <div className={styles.legend}>
          <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: COLORS.org }}></div><span>Organizaciones</span></div>
          <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: COLORS.repo }}></div><span>Repositorios</span></div>
          <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: COLORS.user }}></div><span>Desarrolladores</span></div>
        </div>
      </div>
      <div className={styles.graphContainer}>
        <div className={styles.badgesRow}>
          <FilterBadge
            value={selectedOrg}
            label="Organización"
            onClear={() => setFilter('org', selectedOrg)}
          />
          <FilterBadge
            value={selectedLanguage}
            label="Lenguaje"
            onClear={() => setFilter('language', selectedLanguage)}
          />
        </div>
        <svg ref={svgRef} viewBox="0 0 700 700" className={styles.circularGraph}>
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="glowStrong" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="tooltipShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.5)"/>
            </filter>
            <filter id="pulseGlow" x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="6" result="glow1"/>
              <feGaussianBlur stdDeviation="2" in="SourceGraphic" result="glow2"/>
              <feMerge>
                <feMergeNode in="glow1"/>
                <feMergeNode in="glow2"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="nucleusGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="8" result="nucBlur"/>
              <feMerge>
                <feMergeNode in="nucBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* ─── NÚCLEO ATÓMICO CENTRAL ─── */}
          <g className={styles.atomicNucleus}>
            {/* Halo exterior pulsante */}
            <circle cx="350" cy="350" r="45" fill="none" stroke="rgba(0, 212, 228, 0.06)" strokeWidth="1" className={styles.nucleusHalo} />
            
            {/* Órbitas elípticas */}
            <ellipse cx="350" cy="350" rx="55" ry="22" fill="none" stroke="rgba(0, 212, 228, 0.15)" strokeWidth="0.8" strokeDasharray="3 5" className={styles.orbit} style={{ animationDuration: '12s' }} />
            <ellipse cx="350" cy="350" rx="55" ry="22" fill="none" stroke="rgba(157, 111, 219, 0.15)" strokeWidth="0.8" strokeDasharray="3 5" className={styles.orbit} style={{ animationDuration: '16s', transform: 'rotate(60deg)', transformOrigin: '350px 350px' }} />
            <ellipse cx="350" cy="350" rx="55" ry="22" fill="none" stroke="rgba(0, 255, 159, 0.12)" strokeWidth="0.8" strokeDasharray="3 5" className={styles.orbit} style={{ animationDuration: '20s', transform: 'rotate(120deg)', transformOrigin: '350px 350px' }} />

            {/* Electrones orbitando */}
            <circle r="3" fill="#00D4E4" filter="url(#nucleusGlow)" className={styles.electron}>
              <animateMotion dur="12s" repeatCount="indefinite" path="M 405,350 A 55,22 0 1,1 295,350 A 55,22 0 1,1 405,350" />
            </circle>
            <circle r="2.5" fill="#9D6FDB" filter="url(#nucleusGlow)" className={styles.electron}>
              <animateMotion dur="16s" repeatCount="indefinite" path="M 399.5,377 A 55,22 60 1,1 300.5,323 A 55,22 60 1,1 399.5,377" />
            </circle>
            <circle r="2" fill="#00ff9f" filter="url(#nucleusGlow)" className={styles.electron}>
              <animateMotion dur="20s" repeatCount="indefinite" path="M 300.5,377 A 55,22 120 1,1 399.5,323 A 55,22 120 1,1 300.5,377" />
            </circle>

            {/* Núcleo central (protón) */}
            <circle cx="350" cy="350" r="5" fill="rgba(0, 212, 228, 0.4)" filter="url(#nucleusGlow)" className={styles.nucleusCore} />
            <circle cx="350" cy="350" r="2.5" fill="rgba(255, 255, 255, 0.6)" />
          </g>
          <g className={styles.linksGroup}>
            {links.map((link, index) => {
              const source = nodes.find(n => n.id === link.source)
              const target = nodes.find(n => n.id === link.target)
              if (!source || !target) return null
              const isHighlighted = hoveredNode?.id === source.id || hoveredNode?.id === target.id
              return <path 
                key={`link-${index}`} 
                d={createCurvePath(source, target)} 
                stroke={isHighlighted ? COLORS.linkHover : COLORS.link} 
                strokeWidth={isHighlighted ? 2.5 : 0.8} 
                fill="none" 
                filter={isHighlighted ? 'url(#glow)' : undefined}
                className={`${styles.link} ${animationComplete ? styles.animate : ''} ${isHighlighted ? styles.highlighted : ''}`} 
                style={{ animationDelay: `${index * 0.01}s` }} 
              />
            })}
          </g>
          <g className={styles.nodesGroup}>
            {nodes.map((node, index) => {
              const isHovered = hoveredNode?.id === node.id
              const color = isHovered || node.isSelected ? COLORS.highlight : COLORS[node.type]
              return (
                <g key={node.id} onMouseEnter={() => setHoveredNode(node)} onMouseLeave={() => setHoveredNode(null)} onClick={() => handleNodeClick(node)} className={`${styles.node} ${animationComplete ? styles.animate : ''}`} style={{ animationDelay: `${index * 0.03}s` }}>
                  <circle cx={node.x} cy={node.y} r={node.size} fill={color} filter={isHovered ? "url(#glowStrong)" : "url(#glow)"} className={styles.nodeCircle} />
                  {isHovered && <circle cx={node.x} cy={node.y} r={node.size + 6} fill="none" stroke={color} strokeWidth="2" className={styles.nodeRing} />}
                </g>
              )
            })}
          </g>

          {/* Pulsos de luz viajando por las conexiones */}
          <g className={`${styles.pulsesGroup} ${hoveredNode ? styles.pulsesHidden : ''}`}>
            {pulses.map(pulse => (
              <g key={pulse.id} className={styles.pulseWrapper}>
                {/* Estela: línea que se dibuja y desaparece */}
                <path
                  d={pulse.path}
                  fill="none"
                  stroke={pulse.color}
                  strokeWidth={1.5}
                  filter="url(#pulseGlow)"
                  className={styles.pulseTrail}
                  style={{ animationDuration: `${pulse.duration}s` }}
                />
                {/* Punto de luz que viaja */}
                <circle r="3.5" fill={pulse.color} filter="url(#pulseGlow)" className={styles.pulseDot} style={{ animationDuration: `${pulse.duration}s` }}>
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

          {/* Tooltip encima de todos los nodos */}
          {hoveredNode && (() => {
            const node = hoveredNode
            const color = COLORS.highlight
            const displayName = node.name
            const maxVisibleChars = 18
            const needsMarquee = displayName.length > maxVisibleChars
            const tooltipW = needsMarquee
              ? maxVisibleChars * 10.5 + 20
              : Math.max(displayName.length * 10.5 + 20, 90)
            const tooltipH = 34

            // Por defecto arriba del nodo; si no cabe, abajo
            let tx = node.x - tooltipW / 2
            let ty = node.y - node.size - tooltipH - 10
            if (ty < 4) ty = node.y + node.size + 10
            if (tx < 4) tx = 4
            if (tx + tooltipW > 696) tx = 696 - tooltipW
            if (ty + tooltipH > 696) ty = 696 - tooltipH

            const clipId = 'tooltip-clip'
            const textFullW = displayName.length * 10.5
            const marqueeDistance = textFullW - tooltipW + 28

            const nodeColor = COLORS[node.type] || color

            return (
              <g className={styles.tooltip} filter="url(#tooltipShadow)">
                {/* Fondo glassmorphism */}
                <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx="8" fill="rgba(22, 27, 45, 0.88)" />
                {/* Borde coloreado según tipo de nodo */}
                <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx="8" fill="none" stroke={nodeColor} strokeWidth="1.2" opacity="0.7" />
                {/* Línea de acento superior */}
                <rect x={tx + 8} y={ty} width={tooltipW - 16} height="2" rx="1" fill={nodeColor} opacity="0.9" />
                <clipPath id={clipId}>
                  <rect x={tx + 8} y={ty} width={tooltipW - 16} height={tooltipH} />
                </clipPath>
                <g clipPath={`url(#${clipId})`}>
                  {needsMarquee ? (
                    <text y={ty + tooltipH / 2} dy="0.35em" fill={nodeColor} fontSize="20" fontWeight="600">
                      <tspan x={tx + 12}>
                        {displayName}
                        <animateTransform
                          attributeName="transform"
                          type="translate"
                          values={`0,0; ${-marqueeDistance},0; ${-marqueeDistance},0; 0,0`}
                          keyTimes="0; 0.4; 0.6; 1"
                          dur="4s"
                          repeatCount="indefinite"
                        />
                      </tspan>
                    </text>
                  ) : (
                    <text x={tx + tooltipW / 2} y={ty + tooltipH / 2} textAnchor="middle" dy="0.35em" fill={nodeColor} fontSize="20" fontWeight="600">{displayName}</text>
                  )}
                </g>
              </g>
            )
          })()}
        </svg>
      </div>
    </section>
  )
}
