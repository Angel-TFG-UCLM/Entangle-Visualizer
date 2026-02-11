/**
 * QuantumBackground — Fondo de partículas cuánticas con entrelazamiento
 * =====================================================================
 * Canvas animado con partículas que se conectan entre sí cuando están cerca,
 * simulando el efecto de entrelazamiento cuántico. Las conexiones brillan
 * con un gradiente cian→púrpura que refuerza la identidad visual de ENTANGLE.
 */

import { useRef, useEffect, useCallback } from 'react'

const PARTICLE_COUNT = 60
const CONNECTION_DISTANCE = 140
const PARTICLE_SPEED = 0.25
const ENTANGLE_FLASH_INTERVAL = 4000 // ms entre flashes de entrelazamiento

export default function QuantumBackground() {
  const canvasRef = useRef(null)
  const particlesRef = useRef([])
  const animFrameRef = useRef(null)
  const flashesRef = useRef([])
  const lastFlashRef = useRef(0)

  const initParticles = useCallback((width, height) => {
    const particles = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * PARTICLE_SPEED * 2,
        vy: (Math.random() - 0.5) * PARTICLE_SPEED * 2,
        size: 1 + Math.random() * 2,
        // Tipo cuántico: determina color (cian, púrpura o verde)
        type: Math.random() < 0.4 ? 0 : Math.random() < 0.7 ? 1 : 2,
        // Fase de spin (para pulsación)
        phase: Math.random() * Math.PI * 2,
        // Opacidad base
        alpha: 0.3 + Math.random() * 0.5,
      })
    }
    particlesRef.current = particles
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    let width = 0
    let height = 0

    const colors = [
      [0, 212, 228],   // Cian (accent)
      [157, 111, 219], // Púrpura (secondary)
      [0, 255, 159],   // Verde neón
    ]

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
      if (particlesRef.current.length === 0) {
        initParticles(width, height)
      }
    }

    resize()
    window.addEventListener('resize', resize)

    const animate = (timestamp) => {
      ctx.clearRect(0, 0, width, height)
      const particles = particlesRef.current

      // ─── Entanglement flash: seleccionar pares aleatorios para flash brillante ───
      if (timestamp - lastFlashRef.current > ENTANGLE_FLASH_INTERVAL) {
        lastFlashRef.current = timestamp
        // Elegir 2-3 pares aleatorios para "entrelazar"
        const pairCount = 2 + Math.floor(Math.random() * 2)
        for (let p = 0; p < pairCount; p++) {
          const i = Math.floor(Math.random() * particles.length)
          const j = Math.floor(Math.random() * particles.length)
          if (i !== j) {
            flashesRef.current.push({
              i, j,
              startTime: timestamp,
              duration: 800 + Math.random() * 600,
            })
          }
        }
      }

      // Limpiar flashes expirados
      flashesRef.current = flashesRef.current.filter(f => timestamp - f.startTime < f.duration)

      // ─── Actualizar y dibujar partículas ───
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        // Mover
        p.x += p.vx
        p.y += p.vy

        // Rebotar en bordes (suave)
        if (p.x < 0 || p.x > width) p.vx *= -1
        if (p.y < 0 || p.y > height) p.vy *= -1

        // Pulsación cuántica
        const pulse = Math.sin(timestamp * 0.001 + p.phase) * 0.3 + 0.7
        const [r, g, b] = colors[p.type]
        const alpha = p.alpha * pulse

        // Dibujar partícula
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
        ctx.fill()

        // Halo exterior sutil
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.08})`
        ctx.fill()
      }

      // ─── Conexiones de entrelazamiento (líneas entre partículas cercanas) ───
      ctx.lineWidth = 0.5
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < CONNECTION_DISTANCE) {
            const opacity = (1 - dist / CONNECTION_DISTANCE) * 0.15
            const [r1, g1, b1] = colors[particles[i].type]
            const [r2, g2, b2] = colors[particles[j].type]

            // Gradiente entre los dos tipos de partícula
            const grad = ctx.createLinearGradient(
              particles[i].x, particles[i].y,
              particles[j].x, particles[j].y
            )
            grad.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, ${opacity})`)
            grad.addColorStop(1, `rgba(${r2}, ${g2}, ${b2}, ${opacity})`)

            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = grad
            ctx.stroke()
          }
        }
      }

      // ─── Dibujar flashes de entrelazamiento (líneas brillantes entre pares lejanos) ───
      for (const flash of flashesRef.current) {
        const { i, j, startTime, duration } = flash
        if (i >= particles.length || j >= particles.length) continue
        const progress = (timestamp - startTime) / duration
        const flashAlpha = progress < 0.3
          ? progress / 0.3
          : 1 - (progress - 0.3) / 0.7
        const pa = particles[i]
        const pb = particles[j]
        const [r1, g1, b1] = colors[pa.type]
        const [r2, g2, b2] = colors[pb.type]

        // Línea curva de entrelazamiento
        const midX = (pa.x + pb.x) / 2 + (Math.random() - 0.5) * 20
        const midY = (pa.y + pb.y) / 2 + (Math.random() - 0.5) * 20

        ctx.lineWidth = 1.5 * flashAlpha
        const grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y)
        grad.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, ${flashAlpha * 0.6})`)
        grad.addColorStop(0.5, `rgba(255, 255, 255, ${flashAlpha * 0.4})`)
        grad.addColorStop(1, `rgba(${r2}, ${g2}, ${b2}, ${flashAlpha * 0.6})`)

        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.quadraticCurveTo(midX, midY, pb.x, pb.y)
        ctx.strokeStyle = grad
        ctx.stroke()

        // Flash glow en los extremos
        for (const pt of [pa, pb]) {
          const [r, g, b] = colors[pt.type]
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, 6 * flashAlpha, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${flashAlpha * 0.3})`
          ctx.fill()
        }
      }

      animFrameRef.current = requestAnimationFrame(animate)
    }

    animFrameRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [initParticles])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.6,
      }}
    />
  )
}
