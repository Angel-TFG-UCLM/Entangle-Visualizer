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
import { useTranslation } from 'react-i18next'
import { FiSend, FiZap, FiCpu, FiActivity, FiX, FiSquare } from 'react-icons/fi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { sendChatMessageStream } from '../../services/api'
import { useDashboardStore } from '../../store/dashboardStore'
import useFavoritesStore from '../../store/favoritesStore'
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

/* ─── i18n helpers for SSE events ─── */
function translateThinkingDesc(step, t) {
  if (!step.tool_key) return step.description
  const toolName = t(`chat.toolNames.${step.tool_key}`, { defaultValue: t('chat.toolNames.default') })
  const parts = [toolName]
  if (step.collection_key) {
    const col = t(`chat.collectionNames.${step.collection_key}`, { defaultValue: step.collection_key })
    const prep = step.tool_key === 'get_collection_schema' ? t('chat.toolPrepositions.of') : t('chat.toolPrepositions.in')
    parts.push(`${prep} ${col}`)
  }
  if (step.has_filter) parts.push(t('chat.toolPrepositions.withFilters'))
  return parts.join(' ')
}

function translateToolResult(step, t) {
  if (step.count !== undefined && step.count !== null) return t('chat.resultsObtained', { count: step.count })
  return t('chat.dataReceived')
}

function translateStatus(event, t) {
  if (event.status_key) return t(`chat.${event.status_key}`, { defaultValue: event.message })
  return event.message
}

const PROMPTS = [
  { icon: <FiZap />,      labelKey: 'chat.quantumPrompts.topReposLabel',    tagKey: 'chat.quantumPrompts.topReposState',   msgKey: 'chat.quickPrompts.topRepos' },
  { icon: <FiCpu />,      labelKey: 'chat.quantumPrompts.topOrgsLabel', tagKey: 'chat.quantumPrompts.topOrgsState', msgKey: 'chat.quickPrompts.topOrgs' },
  { icon: <FiActivity />, labelKey: 'chat.quantumPrompts.summaryLabel',       tagKey: 'chat.quantumPrompts.summaryState',       msgKey: 'chat.quickPrompts.summary' },
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
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState(null)
  const [tools, setTools] = useState([])
  const [thinkingSteps, setThinkingSteps] = useState([])  // pasos de razonamiento en tiempo real
  const [statusMsg, setStatusMsg] = useState('')           // estado actual del agente (SSE status)
  const [elapsedSec, setElapsedSec] = useState(0)          // segundos transcurridos
  const [activeAgent, setActiveAgent] = useState(null)      // "DATA" | "DASHBOARD" | "UNIVERSE"
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
    setMsgs(prev => [...prev, { role: 'assistant', content: t('chat.cancelledByUser'), cancelled: true }])
  }, [])

  /**
   * Maneja acciones del agente IA que afectan al frontend.
   * Acciones soportadas:
   *   - OPEN_UNIVERSE:  Abre el Quantum Universe 3D
   *   - CREATE_VIEW:    Crea una vista personalizada con las orgs indicadas
   */
  const handleAction = useCallback(async (event) => {
    const { action, data } = event
    console.log('[QuantumChat] Action received:', action, data)

    if (action === 'OPEN_UNIVERSE') {
      const store = useDashboardStore.getState()
      store.openCollaborationGraph({ autoTour: data?.autoTour || false })
      return
    }

    if (action === 'CREATE_VIEW') {
      const orgNames = data?.orgs || []
      if (orgNames.length === 0) {
        console.warn('[QuantumChat] CREATE_VIEW: no orgs in action data')
        return
      }

      try {
        const store = useDashboardStore.getState()
        const favStore = useFavoritesStore.getState()

        // Combinar todas las fuentes de orgs: filters (439 orgs) + graph/data (top 15 con avatar)
        const filterOrgs = store.filters?.organizations || []
        const graphOrgs = store.data?.organizations || []

        // Índice rápido login→org (graph tiene avatar_url, filters solo login+name)
        const graphIndex = new Map()
        for (const o of graphOrgs) {
          if (o.login) graphIndex.set(o.login.toLowerCase(), o)
        }

        // Merge: filters es la lista completa; enriquecer con avatar de graph cuando exista
        const allOrgs = filterOrgs.length > 0 ? filterOrgs : graphOrgs
        console.log(`[QuantumChat] CREATE_VIEW: buscando ${orgNames.length} orgs en ${allOrgs.length} disponibles`)

        // Fuzzy-match: 1) exacto login/name, 2) substring login/name
        const matched = []
        const used = new Set()
        for (const name of orgNames) {
          const lower = name.trim().toLowerCase()
          if (!lower) continue

          // Paso 1: coincidencia exacta (login o name)
          let found = allOrgs.find(
            o => !used.has(o.login) && (o.login?.toLowerCase() === lower || o.name?.toLowerCase() === lower)
          )

          // Paso 2: substring (login contiene el término o viceversa)
          if (!found) {
            found = allOrgs.find(
              o => !used.has(o.login) && (
                o.login?.toLowerCase().includes(lower) || lower.includes(o.login?.toLowerCase()) ||
                o.name?.toLowerCase().includes(lower) || lower.includes(o.name?.toLowerCase() || '')
              )
            )
          }

          if (found) {
            used.add(found.login)
            const graphInfo = graphIndex.get(found.login.toLowerCase())
            // IMPORTANTE: el ID debe llevar prefijo org_ para que get_view_data
            // lo reconozca como organización (same as FavoritesPanel convention)
            matched.push({
              id: `org_${found.login}`,
              type: 'org',
              name: found.name || found.login,
              avatar_url: graphInfo?.avatar_url || '',
            })
          } else {
            console.warn(`[QuantumChat] CREATE_VIEW: org "${name}" no encontrada`)
          }
        }

        console.log(`[QuantumChat] CREATE_VIEW: matched ${matched.length}/${orgNames.length} orgs:`, matched.map(m => m.id))

        if (matched.length === 0) {
          console.warn('[QuantumChat] CREATE_VIEW: ninguna org coincidió, vista no creada')
          return
        }

        // Calcular nombre incremental: "Vista Autogenerada #N"
        const existingAuto = favStore.views.filter(v => v.name?.startsWith(t('chat.autoViewPrefix')))
        const nextNum = existingAuto.length + 1
        const viewName = t('chat.autoViewName', { number: nextNum })

        // Crear la vista y activarla (sin tocar favoritos — son independientes)
        const entityIds = matched.map(m => m.id)
        console.log(`[QuantumChat] CREATE_VIEW: creando "${viewName}" con ${entityIds.length} entidades`)
        const view = await favStore.createView(viewName, entityIds, data?.color || '#00ffaa')
        if (view?.id) {
          await favStore.activateView(view.id)
          console.log(`[QuantumChat] CREATE_VIEW: vista "${viewName}" activada (id=${view.id})`)
        }
      } catch (err) {
        console.error('[QuantumChat] Error creating view:', err)
      }
      return
    }
  }, [])

  const send = useCallback(async (text) => {
    const msg = (text ?? '').trim()
    if (!msg || loading) return
    setMsgs(prev => [...prev, { role: 'user', content: msg }])
    setInput('')
    if (!expanded) setExpanded(true)
    setLoading(true)
    setThinkingSteps([])
    setStatusMsg(t('chat.classifying'))
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
      await sendChatMessageStream(msg, history, {
        onStatus: (event) => {
          if (event.message) setStatusMsg(translateStatus(event, t))
        },
        onRouting: (event) => {
          const intent = event.intent || null
          setActiveAgent(intent)
          agentRef.current = intent
          setStatusMsg(intent === 'DATA'
            ? t('chat.connecting')
            : intent === 'UNIVERSE'
              ? t('chat.connectingUniverse')
              : t('chat.connectingDashboard'))
        },
        onThinking: (event) => {
          setThinkingSteps(prev => [...prev, { type: 'thinking', ...event }])
          setStatusMsg(`${t('chat.executing')}: ${translateThinkingDesc(event, t)}`)
        },
        onToolResult: (event) => {
          setThinkingSteps(prev => [...prev, { type: 'result', ...event }])
          setStatusMsg(translateToolResult(event, t))
        },
        onAction: (event) => {
          handleAction(event)
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
          setMsgs(prev => [...prev, { role: 'assistant', content: errMsg || t('chat.agentError'), err: true }])
          setThinkingSteps([])
          setStatusMsg('')
          setElapsedSec(0)
          setActiveAgent(null)
          setLoading(false)
        },
      }, controller.signal)
    } catch (err) {
      if (err.name === 'AbortError') return // cancelado por el usuario
      setMsgs(prev => [...prev, { role: 'assistant', content: t('chat.agentError'), err: true }])
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
                {t('chat.terminalTitle')}
                <span className={styles.modelBadge}>{t('chat.modelBadge')}</span>
              </span>
              <div className={styles.headerRight}>
                <span className={styles.headerStatus}>
                  <span className={styles.statusDot} />
                  {loading ? t('chat.reasoning') : t('chat.connected')}
                </span>
                <button className={styles.closeBtn} onClick={close} title={t('chat.closeChat')}>
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
                  <p className={styles.welcomeTitle}>{t('chat.superposition')}</p>
                  <p className={styles.welcomeHint}>{t('chat.collapseHint')}</p>
                  <p className={styles.disclaimer}>{t('chat.disclaimerFull')}</p>
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
                      <span className={`${styles.msgAgent} ${m.agent === 'DATA' ? styles.msgAgentData : styles.msgAgentUI}`}>
                        <span className={styles.msgAgentDot} />
                        {m.agent === 'DATA' ? t('chat.dataAnalyst') : m.agent === 'UNIVERSE' ? t('chat.agentUniverse') : t('chat.agentDashboard')}
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
                          {statusMsg || t('chat.reasoning')}
                          {activeAgent && <span className={`${styles.agentBadge} ${activeAgent === 'DATA' ? styles.agentBadgeData : styles.agentBadgeUI}`}>{activeAgent === 'DATA' ? t('chat.agentDataShort') : activeAgent === 'UNIVERSE' ? t('chat.agentUniverseShort') : t('chat.agentDashboardShort')}</span>}
                          {elapsedSec > 0 && <span className={styles.elapsed}>{elapsedSec}s</span>}
                        </div>
                        <div className={styles.thinkingSteps}>
                          {thinkingSteps.map((step, i) => (
                            <div key={i} className={`${styles.thinkingStep} ${step.type === 'result' ? styles.thinkingStepResult : ''}`}>
                              {step.type === 'thinking' ? (
                                <>
                                  <FiCpu className={styles.thinkingIcon} />
                                  <span>{translateThinkingDesc(step, t)}</span>
                                </>
                              ) : (
                                <>
                                  <span className={styles.thinkingCheck}>✓</span>
                                  <span>{translateToolResult(step, t)}</span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className={styles.thinkingHeader}>
                        <span className={styles.thinkingPulse} />
                        {statusMsg || t('chat.thinking')}
                        {activeAgent && <span className={`${styles.agentBadge} ${activeAgent === 'DATA' ? styles.agentBadgeData : styles.agentBadgeUI}`}>{activeAgent === 'DATA' ? t('chat.agentDataShort') : activeAgent === 'UNIVERSE' ? t('chat.agentUniverseShort') : t('chat.agentDashboardShort')}</span>}
                        {elapsedSec > 0 && <span className={styles.elapsed}>{elapsedSec}s</span>}
                      </div>
                    )}
                  </div>
                  {/* Botón stop: cuadrado rojo junto al mensaje */}
                  <button className={styles.stopBtn} onClick={cancelRequest} title={t('chat.stop')}>
                    <FiSquare size={10} />
                  </button>
                </div>
              )}
            </div>

            {/* herramientas usadas */}
            {tools.length > 0 && (
              <div className={styles.toolsBar}>
                <FiCpu size={11} />
                <span className={styles.toolsLabel}>{t('chat.tools')}:</span>
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
            placeholder={t('chat.placeholderFull')}
            disabled={loading}
            maxLength={2000}
          />
          {input.trim() ? (
            <button type="submit" className={styles.sendBtn} disabled={loading}><FiSend /></button>
          ) : (
            <span className={styles.barKbd}>{t('chat.aiBadge')}</span>
          )}
        </form>
      </div>

      {/* ═══ Quick-prompt pills (colapsan al abrir el chat) ═══ */}
      <div className={`${styles.pills} ${expanded ? styles.pillsHidden : ''}`}>
        {PROMPTS.map((p, i) => (
          <button key={i} className={styles.pill} onClick={() => send(t(p.msgKey))} disabled={loading}>
            <span className={styles.pillIcon}>{p.icon}</span>
            <span className={styles.pillLabel}>{t(p.labelKey)}</span>
            <span className={styles.pillTag}>{t(p.tagKey)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
