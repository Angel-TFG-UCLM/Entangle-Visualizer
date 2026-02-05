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
  const filteredUsers = selectedOrg ? users.filter(user => user.company === selectedOrg || user.organizations?.includes(selectedOrg)) : users

  filteredOrgs.forEach(org => {
    nodes.push({
      id: `org_${org.login}`,
      name: org.name || org.login,
      type: 'org',
      size: 8,
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
      size: 6,
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
      size: 5,
      isSelected: false,
      data: user,
    }
    nodes.push(node)
    nodeMap.set(node.id, node)
    if (user.organizations && Array.isArray(user.organizations)) {
      user.organizations.forEach(orgName => {
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

  const radius = 280, centerX = 350, centerY = 350, totalNodes = nodes.length
  nodes.forEach((node, index) => {
    const angle = (index / totalNodes) * 2 * Math.PI - Math.PI / 2
    node.x = centerX + radius * Math.cos(angle)
    node.y = centerY + radius * Math.sin(angle)
    node.angle = angle
    node.index = index
  })

  return { nodes, links }
}

export default function NetworkGraph() {
  const svgRef = useRef()
  const sectionRef = useRef()
  const [hoveredNode, setHoveredNode] = useState(null)
  const [animationComplete, setAnimationComplete] = useState(false)
  
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
    if (node.type === 'org') setFilter('organization', node.data.login)
    else if (node.type === 'repo') setFilter('repository', node.data.full_name)
  }, [setFilter])

  const createCurvePath = useCallback((source, target) => {
    return `M ${source.x},${source.y} Q 350,350 ${target.x},${target.y}`
  }, [])

  return (
    <section ref={sectionRef} className={styles.graphSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Red de Colaboración</h2>
        <p className={styles.sectionSubtitle}>Ecosistema de organizaciones, repositorios y desarrolladores cuánticos</p>
      </div>
      <div className={styles.graphContainer}>
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
          </defs>
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
                <g key={node.id} onMouseEnter={() => setHoveredNode(node)} onMouseLeave={() => setHoveredNode(null)} onClick={() => handleNodeClick(node)}>
                  <circle cx={node.x} cy={node.y} r={node.size} fill={color} filter={isHovered ? "url(#glowStrong)" : "url(#glow)"} className={`${styles.node} ${animationComplete ? styles.animate : ''}`} style={{ animationDelay: `${index * 0.03}s` }} />
                  {isHovered && <circle cx={node.x} cy={node.y} r={node.size + 6} fill="none" stroke={color} strokeWidth="2" className={styles.nodeRing} />}
                  {isHovered && (
                    <g className={styles.tooltip}>
                      <rect x={node.x - 60} y={node.y - node.size - 35} width="120" height="25" rx="4" fill="rgba(0, 0, 0, 0.9)" stroke={color} strokeWidth="1" />
                      <text x={node.x} y={node.y - node.size - 18} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="500">{node.name.length > 15 ? node.name.slice(0, 15) + '...' : node.name}</text>
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
        <div className={styles.legend}>
          <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: COLORS.org }}></div><span>Organizaciones</span></div>
          <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: COLORS.repo }}></div><span>Repositorios</span></div>
          <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: COLORS.user }}></div><span>Desarrolladores</span></div>
        </div>
      </div>
    </section>
  )
}
