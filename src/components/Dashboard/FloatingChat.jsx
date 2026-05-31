/**
 * FloatingChat — Botón FAB flotante + ventana de chat con IA
 * ===========================================================
 * Réplica funcional del QuantumChat pero en formato flotante
 * fijo en la esquina inferior derecha. Incluye streaming SSE,
 * razonamiento en tiempo real, y acciones del agente.
 *
 * Se posiciona por encima de la barra flotante de comparación
 * de ChartsSection para evitar superposición.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { FiSend, FiX, FiZap, FiCpu, FiActivity, FiSquare } from 'react-icons/fi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { sendChatMessageStream } from '../../services/api'
import { useDashboardStore } from '../../store/dashboardStore'
import useFavoritesStore from '../../store/favoritesStore'
import { useTranslation } from 'react-i18next'
import styles from './FloatingChat.module.css'

/* ─── Helpers ─── */

function normalizeMathDelimiters(text) {
  if (!text) return text
  let out = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `$$${inner}$$`)
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

const QUICK_PROMPTS = [
  { icon: <FiZap size={12} />,      labelKey: 'chat.quantumPrompts.topReposLabel',  msgKey: 'chat.quickPrompts.topRepos' },
  { icon: <FiCpu size={12} />,      labelKey: 'chat.quantumPrompts.topOrgsLabel',   msgKey: 'chat.quickPrompts.topOrgs' },
  { icon: <FiActivity size={12} />, labelKey: 'chat.quantumPrompts.summaryLabel',    msgKey: 'chat.quickPrompts.summary' },
]

/* ─── mapUserToDisplay (same as QuantumChat) ─── */
function mapUserToDisplay(raw, metric, disciplineMap, selectedUser) {
  const scoreVal =
    metric === 'contributions' ? (raw.total_contributions || 0) :
    metric === 'repos' ? (raw.public_repos || 0) :
    (raw.quantum_expertise_score || 0)
  const dmEntry = disciplineMap?.[raw.login] || {}
  return {
    login: raw.login,
    name: raw.name || raw.login,
    avatar_url: raw.avatar_url || null,
    score: scoreVal,
    contributions: raw.total_contributions || 0,
    repos: raw.public_repos || 0,
    organizations: raw.organizations || [],
    commits: raw.commit_contributions || 0,
    prs: raw.pull_request_contributions || 0,
    reviews: raw.code_review_contributions || 0,
    issues: raw.issue_contributions || 0,
    bio: raw.bio || null,
    company: raw.company || null,
    location: raw.location || null,
    top_languages: raw.top_languages || [],
    quantum_expertise_score: raw.quantum_expertise_score || 0,
    isSelected: raw.login === selectedUser,
    ...dmEntry,
  }
}

export default function FloatingChat() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState(null)
  const [tools, setTools] = useState([])
  const [thinkingSteps, setThinkingSteps] = useState([])
  const [statusMsg, setStatusMsg] = useState('')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [activeAgent, setActiveAgent] = useState(null)
  const bodyRef = useRef(null)
  const inputRef = useRef(null)
  const windowRef = useRef(null)
  const abortRef = useRef(null)
  const timerRef = useRef(null)
  const agentRef = useRef(null)

  /* Auto-scroll body */
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, loading, thinkingSteps])

  /* Dynamic resize — expand window when tables/wide content appear */
  useEffect(() => {
    if (!bodyRef.current || !windowRef.current) return
    const isMobile = window.innerWidth <= 480
    if (isMobile) return                               // mobile keeps scroll instead

    const MIN_W = 420
    const MAX_W = Math.min(780, window.innerWidth - 56)

    // Double-raf ensures layout is fully computed after React commit
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        if (!bodyRef.current || !windowRef.current) return

        const tables = bodyRef.current.querySelectorAll('table')
        if (!tables.length) {
          windowRef.current.style.width = ''
          return
        }

        let maxTableW = 0
        tables.forEach(t => {
          // Use offsetWidth first (actual rendered), fallback to scrollWidth
          const w = Math.max(t.scrollWidth, t.offsetWidth)
          maxTableW = Math.max(maxTableW, w)
        })

        if (maxTableW <= 0) return

        // Overhead: body padding(14*2) + bubble padding(14*2) + avatar(28)+gap(8) + border(2) + safety(24)
        const needed = maxTableW + 28 + 28 + 36 + 2 + 24
        const clamped = Math.min(Math.max(needed, MIN_W), MAX_W)
        const currentW = windowRef.current.getBoundingClientRect().width

        if (Math.abs(clamped - currentW) > 4) {
          windowRef.current.style.width = `${clamped}px`
        }
      })
      return () => cancelAnimationFrame(raf2)
    })

    return () => cancelAnimationFrame(raf1)
  }, [msgs])

  /* Focus input on open */
  useEffect(() => {
    if (open && !closing) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, closing])

  /* Close on Escape — capture phase so chat intercepts before Universe handlers */
  const isUniverseRef = useRef(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (isUniverseRef.current) e.stopPropagation()
        closeChat()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  /* ─── Actions handler ─── */
  const handleAction = useCallback(async (event) => {
    const { action, data } = event
    if (action === 'OPEN_UNIVERSE') {
      const store = useDashboardStore.getState()
      store.openCollaborationGraph({ autoTour: data?.autoTour || false })
      return
    }
    if (action === 'CREATE_VIEW') {
      const orgNames = data?.orgs || []
      if (orgNames.length === 0) return
      try {
        const store = useDashboardStore.getState()
        const favStore = useFavoritesStore.getState()
        const filterOrgs = store.filters?.organizations || []
        const graphOrgs = store.data?.organizations || []
        const graphIndex = new Map()
        for (const o of graphOrgs) {
          if (o.login) graphIndex.set(o.login.toLowerCase(), o)
        }
        const allOrgs = filterOrgs.length > 0 ? filterOrgs : graphOrgs
        const matched = []
        const used = new Set()
        for (const name of orgNames) {
          const lower = name.trim().toLowerCase()
          if (!lower) continue
          let found = allOrgs.find(o => !used.has(o.login) && (o.login?.toLowerCase() === lower || o.name?.toLowerCase() === lower))
          if (!found) {
            found = allOrgs.find(o => !used.has(o.login) && (
              o.login?.toLowerCase().includes(lower) || lower.includes(o.login?.toLowerCase()) ||
              o.name?.toLowerCase().includes(lower) || lower.includes(o.name?.toLowerCase() || '')
            ))
          }
          if (found) {
            used.add(found.login)
            const graphInfo = graphIndex.get(found.login.toLowerCase())
            matched.push({
              id: `org_${found.login}`,
              type: 'org',
              name: found.name || found.login,
              avatar_url: graphInfo?.avatar_url || '',
            })
          }
        }
        if (matched.length === 0) return
        const existingAuto = favStore.views.filter(v => v.name?.startsWith(t('chat.autoViewPrefix')))
        const nextNum = existingAuto.length + 1
        const viewName = `${t('chat.autoViewName')} #${nextNum}`
        const entityIds = matched.map(m => m.id)
        const view = await favStore.createView(viewName, entityIds, data?.color || '#00ffaa')
        if (view?.id) await favStore.activateView(view.id)
      } catch (err) {
        console.error('[FloatingChat] Error creating view:', err)
      }
    }
  }, [])

  /* ─── Cancel ─── */
  const cancelRequest = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setLoading(false)
    setThinkingSteps([])
    setStatusMsg('')
    setElapsedSec(0)
    setActiveAgent(null)
    agentRef.current = null
    setMsgs(prev => [...prev, { role: 'assistant', content: t('chat.reasoningCancelled'), cancelled: true }])
  }, [])

  /* ─── Send ─── */
  const send = useCallback(async (text) => {
    const msg = (text ?? '').trim()
    if (!msg || loading) return
    setMsgs(prev => [...prev, { role: 'user', content: msg }])
    setInput('')
    setLoading(true)
    setThinkingSteps([])
    setStatusMsg(t('chat.classifying'))
    setElapsedSec(0)
    setActiveAgent(null)
    agentRef.current = null

    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await sendChatMessageStream(msg, history, {
        onStatus: (event) => { if (event.message) setStatusMsg(translateStatus(event, t)) },
        onRouting: (event) => {
          const intent = event.intent || null
          setActiveAgent(intent)
          agentRef.current = intent
          setStatusMsg(intent === 'DATA' ? t('chat.connecting') : intent === 'UNIVERSE' ? t('chat.connectingUniverse') : t('chat.connectingDashboard'))
        },
        onThinking: (event) => {
          setThinkingSteps(prev => [...prev, { type: 'thinking', ...event }])
          setStatusMsg(`${t('chat.executing')}${translateThinkingDesc(event, t)}`)
        },
        onToolResult: (event) => {
          setThinkingSteps(prev => [...prev, { type: 'result', ...event }])
          setStatusMsg(translateToolResult(event, t))
        },
        onAction: (event) => { handleAction(event) },
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
          setMsgs(prev => [...prev, { role: 'assistant', content: errMsg || t('chat.connectionError'), err: true }])
          setThinkingSteps([])
          setStatusMsg('')
          setElapsedSec(0)
          setActiveAgent(null)
          setLoading(false)
        },
      }, controller.signal)
    } catch (err) {
      if (err.name === 'AbortError') return
      setMsgs(prev => [...prev, { role: 'assistant', content: t('chat.connectionError'), err: true }])
    } finally {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      setLoading(false)
      setThinkingSteps([])
      setStatusMsg('')
      setElapsedSec(0)
      setActiveAgent(null)
      abortRef.current = null
    }
  }, [loading, history, handleAction])

  const submit = (e) => { e.preventDefault(); send(input) }

  const openChat = () => {
    setOpen(true)
    setClosing(false)
    // Reset dynamic width so it re-calculates after render
    if (windowRef.current) windowRef.current.style.width = ''
  }
  const closeChat = () => {
    if (abortRef.current) abortRef.current.abort()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setClosing(true)
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 260)
  }

  const toggleChat = () => { open ? closeChat() : openChat() }

  /* ─── Check UI state: comparison indicator + Universe tour + UI readiness ─── */
  const [hasFloatingIndicator, setHasFloatingIndicator] = useState(false)
  const [floatingIndicatorHeight, setFloatingIndicatorHeight] = useState(0)
  const [isTourActive, setIsTourActive] = useState(false)
  const [isUniverseReady, setIsUniverseReady] = useState(false)
  const [isCinematic, setIsCinematic] = useState(false)
  const [isDashboardCinematic, setIsDashboardCinematic] = useState(false)
  useEffect(() => {
    let resizeObs = null
    const measureIndicator = (el) => {
      if (!el) { setFloatingIndicatorHeight(0); return }
      setFloatingIndicatorHeight(el.getBoundingClientRect().height)
    }
    const check = () => {
      // Comparison floating indicator detection
      const el = document.querySelector('[class*="comparisonFloatingIndicator"]')
      const active = !!el && !el.classList.toString().includes('Closing')
      setHasFloatingIndicator(active)
      // Re-suscribe ResizeObserver al nuevo elemento (si lo hay)
      if (resizeObs) { resizeObs.disconnect(); resizeObs = null }
      if (active && el && 'ResizeObserver' in window) {
        resizeObs = new ResizeObserver(() => measureIndicator(el))
        resizeObs.observe(el)
        measureIndicator(el)
      } else if (!active) {
        setFloatingIndicatorHeight(0)
      }
      // Universe tour detection — tour overlay or fade-to-black present
      const tourEl = document.querySelector('[class*="tourOverlay"]')
      const fadeEl = document.querySelector('[class*="tourFadeToBlack"]')
      setIsTourActive(!!(tourEl || fadeEl))
      // Universe UI readiness — universeUIVisible class means loader finished
      const uiEl = document.querySelector('[class*="universeUIVisible"]')
      setIsUniverseReady(!!uiEl)
      // Cinematic Mode (Universe) — universeUICinematic class means user is idle
      const cineEl = document.querySelector('[class*="universeUICinematic"]')
      setIsCinematic(!!cineEl)
      // Cinematic Mode (Dashboard) — data attribute set by DashboardNav
      setIsDashboardCinematic(document.body.dataset.dashboardCinematic === 'true')
    }
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-dashboard-cinematic'] })
    return () => {
      observer.disconnect()
      if (resizeObs) resizeObs.disconnect()
    }
  }, [])

  // Universe mode — reposition instead of hiding
  const isUniverse = useDashboardStore(s => s.showCollaborationGraph)
  isUniverseRef.current = isUniverse

  return (
    <>
      {/* ═══ Chat Window ═══ */}
      {(open || closing) && (
        <div
          ref={windowRef}
          className={`${styles.chatWindow} ${closing ? styles.chatWindowClosing : ''} ${hasFloatingIndicator && !isUniverse ? styles.chatWindowShifted : ''} ${isUniverse ? styles.chatWindowUniverse : ''} ${isUniverse && !isUniverseReady ? styles.chatWindowUniverseHidden : ''} ${isUniverse && isTourActive ? styles.chatWindowTourHidden : ''}`}
          style={
            hasFloatingIndicator && !isUniverse && floatingIndicatorHeight > 0
              ? { bottom: `${96 + floatingIndicatorHeight + 16}px` }
              : undefined
          }
        >
          {/* Header */}
          <div className={styles.header}>
            <img src="/logo.png" alt="Entangle" className={styles.headerLogo} />
            <div className={styles.headerInfo}>
              <div className={styles.headerTitle}>
                {t('chat.headerTitle')}
                <span className={styles.headerModelBadge}>{t('chat.modelBadge')}</span>
              </div>
              <div className={styles.headerSub}>
                <span className={`${styles.headerStatusDot} ${loading ? styles.headerStatusDotLoading : ''}`} />
                {loading ? t('chat.reasoning') : t('chat.connected')}
              </div>
            </div>
            <button className={styles.headerClose} onClick={closeChat} title={t('chat.close')}>
              <FiX size={14} />
            </button>
          </div>

          {/* Messages */}
          <div className={styles.body} ref={bodyRef}>
            {msgs.length === 0 && !loading && (
              <div className={styles.welcome}>
                <div className={styles.welcomeOrb}>
                  <span className={styles.welcomeOrbKet}>|ψ⟩</span>
                </div>
                <p className={styles.welcomeTitle}>{t('chat.title')}</p>
                <p className={styles.welcomeHint}>{t('chat.welcome')}</p>
                <p className={styles.disclaimer}>{t('chat.disclaimer')}</p>
                <div className={styles.quickPrompts}>
                  {QUICK_PROMPTS.map((p, i) => (
                    <button key={i} className={styles.quickPrompt} onClick={() => send(t(p.msgKey))} disabled={loading}>
                      <span className={styles.quickPromptIcon}>{p.icon}</span>
                      {t(p.labelKey)}
                    </button>
                  ))}
                </div>
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
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {normalizeMathDelimiters(m.content)}
                  </ReactMarkdown>
                  {m.role === 'assistant' && m.agent && (
                    <span className={`${styles.msgAgent} ${m.agent === 'DATA' ? styles.msgAgentData : styles.msgAgentUI}`}>
                      <span className={styles.msgAgentDot} />
                      {m.agent === 'DATA' ? t('chat.agentAnalyst') : m.agent === 'UNIVERSE' ? t('chat.agentUniverse') : t('chat.agentDashboard')}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking state */}
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
                        {activeAgent && (
                          <span className={`${styles.agentBadge} ${activeAgent === 'DATA' ? styles.agentBadgeData : styles.agentBadgeUI}`}>
                        {activeAgent === 'DATA' ? t('chat.agentAnalyst') : activeAgent === 'UNIVERSE' ? t('chat.agentUniverse') : t('chat.agentDashboard')}
                          </span>
                        )}
                        {elapsedSec > 0 && <span className={styles.elapsed}>{elapsedSec}s</span>}
                      </div>
                      <div className={styles.thinkingSteps}>
                        {thinkingSteps.map((step, i) => (
                          <div key={i} className={`${styles.thinkingStep} ${step.type === 'result' ? styles.thinkingStepResult : ''}`}>
                            {step.type === 'thinking' ? (
                              <><FiCpu className={styles.thinkingIcon} /><span>{translateThinkingDesc(step, t)}</span></>
                            ) : (
                              <><span className={styles.thinkingCheck}>✓</span><span>{translateToolResult(step, t)}</span></>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={styles.thinkingHeader}>
                      <span className={styles.thinkingPulse} />
                      {statusMsg || t('chat.thinking')}
                      {activeAgent && (
                        <span className={`${styles.agentBadge} ${activeAgent === 'DATA' ? styles.agentBadgeData : styles.agentBadgeUI}`}>
                          {activeAgent === 'DATA' ? t('chat.agentAnalyst') : activeAgent === 'UNIVERSE' ? t('chat.agentUniverse') : t('chat.agentDashboard')}
                        </span>
                      )}
                      {elapsedSec > 0 && <span className={styles.elapsed}>{elapsedSec}s</span>}
                    </div>
                  )}
                </div>
                <button className={styles.stopBtn} onClick={cancelRequest} title={t('chat.stop')}>
                  <FiSquare size={10} />
                </button>
              </div>
            )}
          </div>

          {/* Tools used */}
          {tools.length > 0 && (
            <div className={styles.toolsBar}>
              <FiCpu size={11} />
              <span className={styles.toolsLabel}>{t('chat.tools')}</span>
              {tools.map((t, i) => (
                <span key={i} className={styles.toolChip}>{t}</span>
              ))}
            </div>
          )}

          {/* Input */}
          <form className={styles.inputBar} onSubmit={submit}>
            <input
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={t('chat.placeholder')}
              disabled={loading}
              maxLength={2000}
            />
            <button type="submit" className={styles.sendBtn} disabled={loading || !input.trim()}>
              <FiSend size={14} />
            </button>
          </form>
        </div>
      )}

      {/* ═══ FAB Button ═══ */}
      <button
        className={`${styles.fab} ${open ? styles.fabOpen : ''} ${hasFloatingIndicator && !open && !isUniverse ? styles.fabShifted : ''} ${isUniverse ? styles.fabUniverse : ''} ${isUniverse && !isUniverseReady ? styles.fabUniverseHidden : ''} ${isUniverse && isTourActive ? styles.fabTourHidden : ''} ${isUniverse && isCinematic && !open ? styles.fabCinematicHidden : ''} ${!isUniverse && isDashboardCinematic && !open ? styles.fabCinematicHidden : ''}`}
        onClick={toggleChat}
        title={open ? t('chat.closeChat') : t('chat.chatWithAI')}
        aria-label={open ? t('chat.closeAssistant') : t('chat.openAssistant')}
        style={
          hasFloatingIndicator && !open && !isUniverse && floatingIndicatorHeight > 0
            // 24 = bottom del indicador, +16 = gap visual entre indicador y FAB
            ? { bottom: `${24 + floatingIndicatorHeight + 16}px` }
            : undefined
        }
      >
        {open ? (
          <FiX size={22} className={styles.fabCloseIcon} />
        ) : (
          <>
            <img src="/logo.png" alt="Entangle" className={styles.fabLogo} />
            <span className={styles.fabBadge}>
              <span className={styles.fabBadgeText}>{t('chat.aiBadge')}</span>
            </span>
            <span className={styles.fabRing} />
            <span className={styles.fabPulse} />
          </>
        )}
      </button>
    </>
  )
}
