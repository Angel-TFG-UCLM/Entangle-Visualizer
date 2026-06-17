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
import { FiSend, FiZap, FiCpu, FiActivity, FiX, FiSquare, FiGlobe, FiTrash2 } from 'react-icons/fi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useDashboardStore } from '../../store/dashboardStore'
import useFavoritesStore from '../../store/favoritesStore'
import useChatSession from '../../hooks/useChatSession'
import Tooltip from '../Tooltip'
import {
  normalizeMathDelimiters,
  makeCodeRenderer,
  ThinkingBlock,
  StreamingBubble,
  MessageAgentBadge,
  useChatAutoScroll,
} from './chatShared'
import styles from './QuantumChat.module.css'

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
  const [input, setInput] = useState('')
  const bodyRef = useRef(null)
  const inputRef = useRef(null)
  const sectionRef = useRef(null)
  const cardRef = useRef(null)
  const thinkingStepsRef = useRef(null)

  /* dos ondas superpuestas con frecuencias distintas */
  const wave1 = useMemo(() => buildWavePath(800, 56, 4.5, 0.40), [])
  // Renderer custom para <code> que detecta números puros y los hace grandes
  const mdComponents = useMemo(() => ({ code: makeCodeRenderer(styles) }), [])
  const wave2 = useMemo(() => buildWavePath(800, 56, 6.2, 0.25), [])

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
  }, [t])

  /* ─── Lógica de chat (memoria + research mode + reset) en un hook ─── */
  const {
    msgs, loading, tools,
    thinkingSteps, statusMsg, elapsedSec, activeAgent,
    sessionId, researchMode, setResearchMode,
    resetting, streamingContent,
    send: sendMessage, cancel: cancelRequest, newConversation, clearLocal,
  } = useChatSession({ onAction: handleAction })

  /* Auto-scroll del cuerpo y de la lista de pasos (lógica compartida) */
  useChatAutoScroll(bodyRef, thinkingStepsRef, { msgs, loading, thinkingSteps, streamingContent })

  const send = useCallback(async (text, opts) => {
    const msg = (text ?? '').trim()
    if (!msg || loading) return
    setInput('')
    if (!expanded) setExpanded(true)
    await sendMessage(msg, opts)
  }, [loading, expanded, sendMessage])

  /* Permite que un quick prompt active research mode para ESTE envío */
  const sendWithMode = useCallback((text, asResearch) => {
    if (asResearch) {
      setResearchMode(true)
      send(text, { research: true })
    } else {
      send(text)
    }
  }, [setResearchMode, send])

  const submit = (e) => { e.preventDefault(); send(input) }

  const close = () => {
    clearLocal()
    setExpanded(false)
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
                <Tooltip label={t('chat.researchModeTooltip')} position="bottom">
                  <button
                    type="button"
                    className={`${styles.webToggle} ${researchMode ? styles.webToggleActive : ''}`}
                    onClick={() => setResearchMode(prev => !prev)}
                    disabled={loading}
                    aria-label={t('chat.researchMode')}
                    aria-pressed={researchMode}
                  >
                    <FiGlobe size={11} />
                  </button>
                </Tooltip>
                {msgs.length > 0 && (
                  <Tooltip label={t('chat.newConversationTooltip')} position="bottom">
                    <button
                      className={styles.newConvBtn}
                      onClick={newConversation}
                      disabled={loading || resetting}
                      aria-label={t('chat.newConversation')}
                    >
                      <FiTrash2 size={11} />
                    </button>
                  </Tooltip>
                )}
                <button className={styles.closeBtn} onClick={close} aria-label={t('chat.closeChat')}>
                  <FiX />
                </button>
              </div>
            </div>

            {/* línea decorativa gradiente */}
            <div className={styles.headerAccent} />

            {/* banner research mode */}
            {researchMode && (
              <div className={styles.researchModeBanner}>
                <FiGlobe size={11} />
                <span>{t('chat.researchModeActive')}</span>
              </div>
            )}

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
                  {sessionId && (
                    <span className={styles.sessionBadge} title={t('chat.sessionMemoryHint')}>
                      {t('chat.sessionActive')}
                    </span>
                  )}
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
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mdComponents}>{normalizeMathDelimiters(m.content)}</ReactMarkdown>
                    {m.role === 'assistant' && m.agent && (
                      <MessageAgentBadge agent={m.agent} styles={styles} t={t} variant="message" />
                    )}
                  </div>
                </div>
              ))}

              {/* Respuesta en streaming (texto llegando token a token) */}
              {loading && streamingContent && (
                <StreamingBubble content={streamingContent} styles={styles} mdComponents={mdComponents} />
              )}

              {/* Pasos de razonamiento en tiempo real */}
              {loading && !streamingContent && (
                <div className={`${styles.msg} ${styles.msgBot}`}>
                  <span className={styles.avatar}>
                    <span className={styles.avatarGlow} />
                    ⟨ψ|
                  </span>
                  <div className={styles.thinkingBlock}>
                    <ThinkingBlock
                      thinkingSteps={thinkingSteps}
                      statusMsg={statusMsg}
                      activeAgent={activeAgent}
                      elapsedSec={elapsedSec}
                      styles={styles}
                      t={t}
                      thinkingStepsRef={thinkingStepsRef}
                      variant="short"
                    />
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
          <button
            key={i}
            className={styles.pill}
            onClick={() => sendWithMode(t(p.msgKey), p.researchMode || false)}
            disabled={loading}
          >
            <span className={styles.pillIcon}>{p.icon}</span>
            <span className={styles.pillLabel}>{t(p.labelKey)}</span>
            <span className={styles.pillTag}>{t(p.tagKey)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
