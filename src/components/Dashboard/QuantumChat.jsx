/**
 * QuantumChat — Barra de input funcional + chat expandible in-place
 * ==================================================================
 * La barra funciona como input desde el primer momento.
 * Al enviar un mensaje el chat se expande suavemente hacia arriba
 * (la barra se desplaza hacia abajo) revelando el historial.
 * Streaming SSE: muestra pasos de razonamiento en tiempo real.
 * El usuario puede cancelar el razonamiento con un botón.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { FiSend, FiZap, FiCpu, FiActivity, FiX, FiSquare } from 'react-icons/fi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { sendChatMessageStream } from '../../services/api'
import styles from './QuantumChat.module.css'

/**
 * Normaliza delimitadores LaTeX para remark-math:
 *   \( ... \)  →  $ ... $       (inline)
 *   \[ ... \]  →  $$ ... $$     (block)
 * GPT-4o a veces usa \(...\) en vez de $...$
 */
function normalizeMathDelimiters(text) {
  if (!text) return text
  // Block math: \[...\] → $$...$$  (puede ser multilínea)
  let out = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `$$${inner}$$`)
  // Inline math: \(...\) → $...$
  out = out.replace(/\\\((.*?)\\\)/g, (_m, inner) => `$${inner}$`)
  return out
}

const PROMPTS = [
  { icon: <FiZap />,      label: 'Top Repos',    tag: 'Superposición',   msg: '¿Cuáles son los repositorios cuánticos con más estrellas?' },
  { icon: <FiCpu />,      label: 'Orgs Líderes', tag: 'Entrelazamiento', msg: '¿Cuáles son las organizaciones líderes del ecosistema cuántico?' },
  { icon: <FiActivity />, label: 'Estadísticas', tag: 'Colapso',         msg: 'Dame un resumen general del ecosistema cuántico en GitHub' },
]

/* Genera un path SVG de onda cuántica con envolvente gaussiana */
function buildWavePath(w, h, freq = 5, amp = 0.38, pts = 80) {
  const cy = h / 2
  const d = []
  for (let i = 0; i <= pts; i++) {
    const t = i / pts
    const x = t * w
    const envelope = Math.exp(-Math.pow((t - 0.5) * 3.2, 2))
    const y = cy - Math.sin(t * Math.PI * freq * 2) * envelope * h * amp
    d.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return d.join(' ')
}

export default function QuantumChat() {
  const [expanded, setExpanded] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState(null)
  const [tools, setTools] = useState([])
  const [thinkingSteps, setThinkingSteps] = useState([])  // pasos de razonamiento en tiempo real
  const [statusMsg, setStatusMsg] = useState('')           // estado actual del agente (SSE status)
  const [elapsedSec, setElapsedSec] = useState(0)          // segundos transcurridos
  const [activeAgent, setActiveAgent] = useState(null)      // "DATA" | "UI" — qué worker responde
  const bodyRef = useRef(null)
  const inputRef = useRef(null)
  const sectionRef = useRef(null)
  const cardRef = useRef(null)
  const abortRef = useRef(null)  // AbortController para cancelar
  const timerRef = useRef(null)  // intervalo del timer
  const agentRef = useRef(null)  // persiste intent del router entre callbacks

  /* dos ondas superpuestas con frecuencias distintas */
  const wave1 = useMemo(() => buildWavePath(800, 56, 4.5, 0.40), [])
  const wave2 = useMemo(() => buildWavePath(800, 56, 6.2, 0.25), [])

  /* scroll SOLO dentro del panel de chat */
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, loading, thinkingSteps])

  /* desplazar viewport para mostrar la card completa al abrir */
  useEffect(() => {
    if (!expanded || !cardRef.current) return
    const timer = setTimeout(() => {
      const rect = cardRef.current.getBoundingClientRect()
      const target = window.scrollY + rect.top - 40
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }, 50)
    return () => clearTimeout(timer)
  }, [expanded])

  /* cerrar con Escape */
  useEffect(() => {
    if (!expanded) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  /* cancelar razonamiento */
  const cancelRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setLoading(false)
    setThinkingSteps([])
    setStatusMsg('')
    setElapsedSec(0)
    setActiveAgent(null)
    agentRef.current = null
    setMsgs(prev => [...prev, { role: 'assistant', content: 'Razonamiento cancelado por el usuario.', cancelled: true }])
  }, [])

  const send = useCallback(async (text) => {
    const t = (text ?? '').trim()
    if (!t || loading) return
    setMsgs(prev => [...prev, { role: 'user', content: t }])
    setInput('')
    if (!expanded) setExpanded(true)
    setLoading(true)
    setThinkingSteps([])
    setStatusMsg('Clasificando tu pregunta…')
    setElapsedSec(0)
    setActiveAgent(null)
    agentRef.current = null

    // Timer de segundos transcurridos
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    // Crear AbortController para esta petición
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await sendChatMessageStream(t, history, {
        onStatus: (event) => {
          if (event.message) setStatusMsg(event.message)
        },
        onRouting: (event) => {
          const intent = event.intent || null
          setActiveAgent(intent)
          agentRef.current = intent
          setStatusMsg(intent === 'UI'
            ? 'Conectando con Asistente UI…'
            : 'Conectando con Analista de datos…')
        },
        onThinking: (event) => {
          setThinkingSteps(prev => [...prev, { type: 'thinking', ...event }])
          setStatusMsg(`Ejecutando: ${event.description || 'herramienta'}`)
        },
        onToolResult: (event) => {
          setThinkingSteps(prev => [...prev, { type: 'result', ...event }])
          setStatusMsg(event.summary || 'Datos recibidos')
        },
        onReply: (event) => {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
          const capturedAgent = agentRef.current
          setMsgs(prev => [...prev, { role: 'assistant', content: event.content, agent: capturedAgent }])
          setHistory(event.history)
          if (event.tools_used?.length) setTools(event.tools_used)
          setThinkingSteps([])
          setStatusMsg('')
          setElapsedSec(0)
          setActiveAgent(null)
          agentRef.current = null
          setLoading(false)
        },
        onError: (errMsg) => {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
          setMsgs(prev => [...prev, { role: 'assistant', content: errMsg || 'Error de conexión con el agente de IA.', err: true }])
          setThinkingSteps([])
          setStatusMsg('')
          setElapsedSec(0)
          setActiveAgent(null)
          setLoading(false)
        },
      }, controller.signal)
    } catch (err) {
      if (err.name === 'AbortError') return // cancelado por el usuario
      setMsgs(prev => [...prev, { role: 'assistant', content: 'Error de conexión con el agente de IA.', err: true }])
    } finally {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      setLoading(false)
      setThinkingSteps([])
      setStatusMsg('')
      setElapsedSec(0)
      setActiveAgent(null)
      abortRef.current = null
    }
  }, [loading, history, expanded])

  const submit = (e) => { e.preventDefault(); send(input) }

  const close = () => {
    if (abortRef.current) abortRef.current.abort()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setExpanded(false)
    // Limpiar estado tras la animación de cierre (clip-path 0.38s)
    setTimeout(() => { setMsgs([]); setHistory(null); setTools([]); setThinkingSteps([]); setStatusMsg(''); setElapsedSec(0); setActiveAgent(null) }, 400)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ─────────────────────────── JSX ─────────────────────────── */
  return (
    <div className={styles.section} ref={sectionRef}>
      {/* shimmer glow detrás de la barra cuando está colapsado */}
      <div className={`${styles.shimmer} ${expanded ? styles.shimmerHidden : ''}`} />

      {/* ═══ Card: contiene el chat + la barra de input ═══ */}
      <div ref={cardRef} className={`${styles.card} ${expanded ? styles.cardOpen : ''}`}>

        {/* ── Chat expandible (grid-template-rows: 0fr → 1fr) ── */}
        <div className={`${styles.chatArea} ${expanded ? styles.chatAreaOpen : ''}`}>
          <div className={styles.chatInner}>
            {/* header */}
            <div className={styles.chatHeader}>
              <span className={styles.chatTitle}>
                <span className={styles.chatDot} />
                Terminal Cuántico
                <span className={styles.modelBadge}>GPT-4o</span>
              </span>
              <div className={styles.headerRight}>
                <span className={styles.headerStatus}>
                  <span className={styles.statusDot} />
                  {loading ? 'Razonando…' : 'Conectado'}
                </span>
                <button className={styles.closeBtn} onClick={close} title="Cerrar chat">
                  <FiX />
                </button>
              </div>
            </div>

            {/* línea decorativa gradiente */}
            <div className={styles.headerAccent} />

            {/* mensajes */}
            <div className={styles.chatBody} ref={bodyRef}>
              {/* grid sutil de fondo */}
              <div className={styles.bodyGrid} aria-hidden="true" />

              {msgs.length === 0 && !loading && (
                <div className={styles.welcome}>
                  <div className={styles.welcomeOrb} />
                  <div className={styles.welcomeKet}>|ψ⟩</div>
                  <p className={styles.welcomeTitle}>Estado en superposición</p>
                  <p className={styles.welcomeHint}>Tu pregunta colapsará la función de onda</p>
                  <p className={styles.disclaimer}>La IA puede cometer errores. Verifica la información importante.</p>
                </div>
              )}

              {msgs.map((m, i) => (
                <div key={i} className={`${styles.msg} ${m.role === 'user' ? styles.msgUser : styles.msgBot} ${m.err ? styles.msgErr : ''} ${m.cancelled ? styles.msgCancelled : ''}`}>
                  {m.role === 'assistant' && (
                    <span className={styles.avatar}>
                      <span className={styles.avatarGlow} />
                      ⟨ψ|
                    </span>
                  )}
                  <div className={styles.bubble}>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMathDelimiters(m.content)}</ReactMarkdown>
                    {m.role === 'assistant' && m.agent && (
                      <span className={`${styles.msgAgent} ${m.agent === 'UI' ? styles.msgAgentUI : styles.msgAgentData}`}>
                        <span className={styles.msgAgentDot} />
                        {m.agent === 'UI' ? 'Asistente UI' : 'Analista de datos'}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Pasos de razonamiento en tiempo real */}
              {loading && (
                <div className={`${styles.msg} ${styles.msgBot}`}>
                  <span className={styles.avatar}>
                    <span className={styles.avatarGlow} />
                    ⟨ψ|
                  </span>
                  <div className={styles.thinkingBlock}>
                    {thinkingSteps.length > 0 ? (
                      <>
                        <div className={styles.thinkingHeader}>
                          <span className={styles.thinkingPulse} />
                          {statusMsg || 'Razonando…'}
                          {activeAgent && <span className={`${styles.agentBadge} ${activeAgent === 'UI' ? styles.agentBadgeUI : styles.agentBadgeData}`}>{activeAgent === 'UI' ? 'Asistente UI' : 'Analista'}</span>}
                          {elapsedSec > 0 && <span className={styles.elapsed}>{elapsedSec}s</span>}
                        </div>
                        <div className={styles.thinkingSteps}>
                          {thinkingSteps.map((step, i) => (
                            <div key={i} className={`${styles.thinkingStep} ${step.type === 'result' ? styles.thinkingStepResult : ''}`}>
                              {step.type === 'thinking' ? (
                                <>
                                  <FiCpu className={styles.thinkingIcon} />
                                  <span>{step.description}</span>
                                </>
                              ) : (
                                <>
                                  <span className={styles.thinkingCheck}>✓</span>
                                  <span>{step.summary}</span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className={styles.thinkingHeader}>
                        <span className={styles.thinkingPulse} />
                        {statusMsg || 'Pensando…'}
                        {activeAgent && <span className={`${styles.agentBadge} ${activeAgent === 'UI' ? styles.agentBadgeUI : styles.agentBadgeData}`}>{activeAgent === 'UI' ? 'Asistente UI' : 'Analista'}</span>}
                        {elapsedSec > 0 && <span className={styles.elapsed}>{elapsedSec}s</span>}
                      </div>
                    )}
                  </div>
                  {/* Botón stop: cuadrado rojo junto al mensaje */}
                  <button className={styles.stopBtn} onClick={cancelRequest} title="Detener">
                    <FiSquare size={10} />
                  </button>
                </div>
              )}
            </div>

            {/* herramientas usadas */}
            {tools.length > 0 && (
              <div className={styles.toolsBar}>
                <FiCpu size={11} />
                <span className={styles.toolsLabel}>Herramientas:</span>
                {tools.map((t, i) => (
                  <span key={i} className={styles.toolChip}>{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Barra de input (siempre visible, siempre funcional) ── */}
        <form className={`${styles.bar} ${expanded ? styles.barOpen : ''}`} onSubmit={submit}>
          {/* onda cuántica SVG */}
          <svg className={styles.barWave} viewBox="0 0 800 56" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="qcG1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="rgba(0,212,228,0)" />
                <stop offset="25%"  stopColor="rgba(0,212,228,0.5)" />
                <stop offset="50%"  stopColor="rgba(157,111,219,0.7)" />
                <stop offset="75%"  stopColor="rgba(0,212,228,0.5)" />
                <stop offset="100%" stopColor="rgba(0,212,228,0)" />
              </linearGradient>
              <linearGradient id="qcG2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="rgba(189,0,255,0)" />
                <stop offset="30%"  stopColor="rgba(189,0,255,0.3)" />
                <stop offset="50%"  stopColor="rgba(0,212,228,0.4)" />
                <stop offset="70%"  stopColor="rgba(189,0,255,0.3)" />
                <stop offset="100%" stopColor="rgba(189,0,255,0)" />
              </linearGradient>
              <filter id="qcGlow">
                <feGaussianBlur stdDeviation="2" result="g" />
                <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <line x1="0" y1="28" x2="800" y2="28" stroke="rgba(0,212,228,0.06)" strokeWidth="0.5" />
            <path d={wave1} fill="none" stroke="url(#qcG1)" strokeWidth="1.8"
              strokeDasharray="5 3" filter="url(#qcGlow)" className={styles.wp1} />
            <path d={wave2} fill="none" stroke="url(#qcG2)" strokeWidth="1.2"
              strokeDasharray="3 4" className={styles.wp2} />
          </svg>

          <span className={styles.barDot} />
          <input
            ref={inputRef}
            className={styles.barInput}
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={() => { if (!expanded) setExpanded(true) }}
            placeholder="Pregunta a la IA sobre el ecosistema cuántico…"
            disabled={loading}
            maxLength={2000}
          />
          {input.trim() ? (
            <button type="submit" className={styles.sendBtn} disabled={loading}><FiSend /></button>
          ) : (
            <span className={styles.barKbd}>AI</span>
          )}
        </form>
      </div>

      {/* ═══ Quick-prompt pills (colapsan al abrir el chat) ═══ */}
      <div className={`${styles.pills} ${expanded ? styles.pillsHidden : ''}`}>
        {PROMPTS.map((p, i) => (
          <button key={i} className={styles.pill} onClick={() => send(p.msg)} disabled={loading}>
            <span className={styles.pillIcon}>{p.icon}</span>
            <span className={styles.pillLabel}>{p.label}</span>
            <span className={styles.pillTag}>{p.tag}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
