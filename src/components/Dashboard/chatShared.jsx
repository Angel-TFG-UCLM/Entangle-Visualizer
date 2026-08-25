/**
 * chatShared — lógica y presentación compartida entre QuantumChat y FloatingChat.
 * ===============================================================================
 * Ambos chats (el inline del dashboard y el flotante) comparten el mismo
 * pipeline de render: normalización de LaTeX, renderer de números, traducción
 * de eventos SSE, badges de worker y el bloque de razonamiento en vivo. Este
 * módulo centraliza esa lógica para evitar duplicación (DRY) y tener un único
 * punto de prueba/ajuste.
 *
 * Nota: este fichero vive bajo components/Dashboard, por lo que queda excluido
 * de la cobertura (UI validada visualmente y por E2E), igual que los dos chats.
 */
/* eslint-disable react-refresh/only-export-components --
   módulo de utilidades + presentación compartido a propósito; no es un
   componente de pantalla, así que el fast-refresh no aplica. */
import { useEffect, useState, useRef, useCallback } from 'react'
import { FiCpu, FiVolume2, FiSquare, FiMic, FiLoader } from 'react-icons/fi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { getVoiceStatus, textToSpeech, speechToText } from '../../services/api'
import voiceStyles from './voiceControls.module.css'

/**
 * Auto-scroll compartido por ambos chats: desliza el cuerpo del chat al fondo
 * cuando llega contenido nuevo, y la lista de pasos de razonamiento (que tiene
 * su propio overflow) cuando aparecen nuevos pasos.
 */
export function useChatAutoScroll(bodyRef, thinkingStepsRef, { msgs, loading, thinkingSteps, streamingContent }) {
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [bodyRef, msgs, loading, thinkingSteps, streamingContent])

  useEffect(() => {
    thinkingStepsRef.current?.scrollTo({ top: thinkingStepsRef.current.scrollHeight, behavior: 'smooth' })
  }, [thinkingStepsRef, thinkingSteps])
}

/**
 * Normaliza delimitadores LaTeX para remark-math:
 *   \( ... \)  →  $ ... $       (inline)
 *   \[ ... \]  →  $$ ... $$     (block)
 * gpt-5-mini a veces usa \(...\) en vez de $...$
 */
export function normalizeMathDelimiters(text) {
  if (!text) return text
  let out = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `$$${inner}$$`)
  out = out.replace(/\\\((.*?)\\\)/g, (_m, inner) => `$${inner}$`)
  return out
}

/**
 * Detecta si una cadena (ya recortada) es un número puro con separadores y
 * sufijo opcional (%, k, M, B). Se aplica sobre el texto YA trim-eado para
 * evitar grupos `\s*` ambiguos (lineal, sin riesgo de backtracking).
 */
export const NUMERIC_REGEX = /^-?\d[\d.,]*[%kKmMbB]?$/

/**
 * Renderer custom para <code> inline: si el contenido es un número puro, lo
 * muestra como número grande y legible; si no, como caja monospace normal.
 */
export function makeCodeRenderer(styles) {
  return function CodeRenderer({ inline, className, children, ...rest }) {
    const text = String(children ?? '')
    if (inline !== false && NUMERIC_REGEX.test(text.trim())) {
      return <strong className={styles.inlineNumber}>{text.trim()}</strong>
    }
    return <code className={className} {...rest}>{children}</code>
  }
}

/* ─── i18n helpers para eventos SSE ─── */
export function translateThinkingDesc(step, t) {
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

export function translateToolResult(step, t) {
  if (step.count !== undefined && step.count !== null) return t('chat.resultsObtained', { count: step.count })
  if (step.summary) return step.summary
  return t('chat.dataReceived')
}

/* ─── Badges de worker ─── */

// Sufijo de clase CSS por worker activo (mismo nombre en ambos CSS modules).
function agentClassSuffix(agent) {
  switch (agent) {
    case 'DATA': return 'Data'
    case 'KNOWLEDGE': return 'Knowledge'
    case 'RESEARCH': return 'Research'
    case 'INSIGHTS': return 'Insights'
    default: return 'UI'
  }
}

// Claves i18n del nombre del worker, por variante de etiqueta.
const AGENT_LABEL_KEYS = {
  // QuantumChat (thinking) usa etiquetas cortas
  short: { DATA: 'chat.agentDataShort', UNIVERSE: 'chat.agentUniverseShort', KNOWLEDGE: 'chat.agentKnowledgeShort', RESEARCH: 'chat.agentResearchShort', INSIGHTS: 'chat.agentInsightsShort', _default: 'chat.agentDashboardShort' },
  // FloatingChat (thinking y mensaje) usa etiquetas largas
  long: { DATA: 'chat.agentAnalyst', UNIVERSE: 'chat.agentUniverse', KNOWLEDGE: 'chat.agentKnowledge', RESEARCH: 'chat.agentResearch', INSIGHTS: 'chat.agentInsights', _default: 'chat.agentDashboard' },
  // QuantumChat (mensaje) usa dataAnalyst + agent*
  message: { DATA: 'chat.dataAnalyst', UNIVERSE: 'chat.agentUniverse', KNOWLEDGE: 'chat.agentKnowledge', RESEARCH: 'chat.agentResearch', INSIGHTS: 'chat.agentInsights', _default: 'chat.agentDashboard' },
}

export function agentLabel(agent, t, variant = 'long') {
  const keys = AGENT_LABEL_KEYS[variant] || AGENT_LABEL_KEYS.long
  return t(keys[agent] || keys._default)
}

/** Badge del worker activo dentro del bloque de razonamiento. */
export function AgentBadge({ agent, styles, t, variant = 'long' }) {
  if (!agent) return null
  const cls = `${styles.agentBadge} ${styles[`agentBadge${agentClassSuffix(agent)}`]}`
  return <span className={cls}>{agentLabel(agent, t, variant)}</span>
}

/** Badge del worker en una burbuja de mensaje ya completado (con punto). */
export function MessageAgentBadge({ agent, styles, t, variant = 'message' }) {
  if (!agent) return null
  const cls = `${styles.msgAgent} ${styles[`msgAgent${agentClassSuffix(agent)}`]}`
  return (
    <span className={cls}>
      <span className={styles.msgAgentDot} />
      {agentLabel(agent, t, variant)}
    </span>
  )
}

/* ─── Burbuja de respuesta en streaming (token a token) ─── */
const MD_PLUGINS = { remark: [remarkGfm, remarkMath], rehype: [rehypeKatex] }

export function StreamingBubble({ content, styles, mdComponents }) {
  return (
    <div className={`${styles.msg} ${styles.msgBot}`}>
      <span className={styles.avatar}>
        <span className={styles.avatarGlow} />
        ⟨ψ|
      </span>
      <div className={styles.bubble}>
        <ReactMarkdown remarkPlugins={MD_PLUGINS.remark} rehypePlugins={MD_PLUGINS.rehype} components={mdComponents}>
          {normalizeMathDelimiters(content)}
        </ReactMarkdown>
        <span className={styles.streamingCursor}>▌</span>
      </div>
    </div>
  )
}

/* ─── Lista de pasos de razonamiento ─── */
function ThinkingStepRow({ step, styles, t }) {
  const isInProgress = step.type === 'thinking' && step.startTs && !step.endTs
  const isDoneThinking = step.type === 'thinking' && step.startTs && step.endTs
  const isResult = step.type === 'result'
  let durationLabel = null
  if (isInProgress) {
    // Timer en vivo: Date.now() es intencional aquí. El componente se
    // re-renderiza periódicamente (elapsedSec del hook) y queremos mostrar la
    // duración real transcurrida del paso en curso.
    // eslint-disable-next-line react-hooks/purity
    const live = Math.max(0, Math.floor((Date.now() - step.startTs) / 1000))
    if (live > 0) durationLabel = `${live}s`
  } else if (isDoneThinking) {
    durationLabel = `${((step.endTs - step.startTs) / 1000).toFixed(1)}s`
  }
  return (
    <div className={`${styles.thinkingStep} ${isResult ? styles.thinkingStepResult : ''} ${isInProgress ? styles.thinkingStepLive : ''}`}>
      {step.type === 'thinking' ? (
        <>
          <FiCpu className={styles.thinkingIcon} />
          <span>{translateThinkingDesc(step, t)}</span>
          {durationLabel && <span className={styles.thinkingStepTime}>{durationLabel}</span>}
        </>
      ) : (
        <>
          <span className={styles.thinkingCheck}>✓</span>
          <span>{translateToolResult(step, t)}</span>
        </>
      )}
    </div>
  )
}

function ThinkingHeader({ statusMsg, fallbackKey, activeAgent, elapsedSec, styles, t, variant }) {
  return (
    <div className={styles.thinkingHeader}>
      <span className={styles.thinkingPulse} />
      {statusMsg || t(fallbackKey)}
      <AgentBadge agent={activeAgent} styles={styles} t={t} variant={variant} />
      {elapsedSec > 0 && <span className={styles.elapsed}>{elapsedSec}s</span>}
    </div>
  )
}

/**
 * Bloque de razonamiento en vivo: cabecera con badge + lista de pasos, o solo
 * la cabecera "pensando" si aún no hay pasos. Compartido por ambos chats; la
 * variante de etiqueta del badge se pasa por prop.
 */
export function ThinkingBlock({ thinkingSteps, statusMsg, activeAgent, elapsedSec, styles, t, thinkingStepsRef, variant = 'long' }) {
  if (thinkingSteps.length > 0) {
    return (
      <>
        <ThinkingHeader statusMsg={statusMsg} fallbackKey="chat.reasoning" activeAgent={activeAgent} elapsedSec={elapsedSec} styles={styles} t={t} variant={variant} />
        <div className={styles.thinkingSteps} ref={thinkingStepsRef}>
          {thinkingSteps.map((step, i) => (
            <ThinkingStepRow key={i} step={step} styles={styles} t={t} />
          ))}
        </div>
      </>
    )
  }
  return (
    <ThinkingHeader statusMsg={statusMsg} fallbackKey="chat.thinking" activeAgent={activeAgent} elapsedSec={elapsedSec} styles={styles} t={t} variant={variant} />
  )
}

/* ───────────────────────────────────────────────────────────────────────────
 * Capa de voz (ElevenLabs) — compartida por ambos chats
 * ───────────────────────────────────────────────────────────────────────────
 * SpeakButton: locuta la respuesta del asistente (TTS).
 * MicButton:   graba una pregunta por voz y la transcribe (STT/Scribe) al input.
 * Ambos se ocultan si el backend no tiene configurada la capa de voz
 * (ELEVENLABS_API_KEY ausente → /voice/status devuelve configured:false).
 * El estilo vive en voiceControls.module.css (estética "quantum" de la app),
 * compartido por QuantumChat y FloatingChat. */

// Cache a nivel de módulo: /voice/status se consulta una sola vez por carga,
// con una única promesa en vuelo compartida por todos los botones.
let _voiceEnabledCache = null
let _voiceStatusPromise = null

/** Hook: ¿está activada la capa de voz en el backend? (una sola consulta). */
export function useVoiceEnabled() {
  const [enabled, setEnabled] = useState(_voiceEnabledCache ?? false)
  useEffect(() => {
    // Si ya está resuelto en cache, el estado inicial ya es correcto: no hay
    // que llamar a setState de forma síncrona dentro del efecto.
    if (_voiceEnabledCache !== null) return
    let alive = true
    _voiceStatusPromise = _voiceStatusPromise
      || getVoiceStatus().then(s => !!s.configured).catch(() => false)
    _voiceStatusPromise.then(v => { _voiceEnabledCache = v; if (alive) setEnabled(v) })
    return () => { alive = false }
  }, [])
  return enabled
}

/** Botón "escuchar": convierte el texto del mensaje en voz y lo reproduce. */
export function SpeakButton({ text, t }) {
  const enabled = useVoiceEnabled()
  const [state, setState] = useState('idle') // idle | loading | playing | error
  const audioRef = useRef(null)
  const urlRef = useRef(null)

  // Elemento de audio persistente: crearlo una vez y reutilizarlo hace que
  // quede "habilitado" por la interacción del usuario, evitando que la política
  // de autoplay bloquee la reproducción tras el await del fetch (Safari, sobre
  // todo). Se crea de forma perezosa en el primer render del cliente.
  const getAudio = useCallback(() => {
    if (!audioRef.current && typeof Audio !== 'undefined') {
      audioRef.current = new Audio()
    }
    return audioRef.current
  }, [])

  const stop = useCallback(() => {
    const a = audioRef.current
    if (a) { try { a.pause() } catch { /* noop */ } }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    setState('idle')
  }, [])

  useEffect(() => () => stop(), [stop])

  const onClick = useCallback(async () => {
    if (state === 'playing' || state === 'loading') { stop(); return }
    const clean = (text || '').trim()
    if (!clean) return

    // Reutilizar el elemento y "despertarlo" dentro del gesto del click ayuda a
    // que el navegador permita reproducir después del await.
    const audio = getAudio()
    if (!audio) return
    audio.muted = false
    audio.volume = 1

    setState('loading')
    try {
      const url = await textToSpeech(clean)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url
      audio.src = url
      audio.onended = () => setState('idle')
      audio.onerror = () => {
        console.error('[voice] audio playback error', audio.error)
        setState('error')
      }
      await audio.play()
      setState('playing')
    } catch (err) {
      // Detectar el caso de cuota agotada de ElevenLabs para dar un aviso claro
      // en vez de un error genérico. El backend reenvía el cuerpo de ElevenLabs.
      const detail = err?.response?.data?.detail || err?.message || ''
      const isQuota = typeof detail === 'string' && /quota/i.test(detail)
      console.error('[voice] text-to-speech failed', err)
      setState(isQuota ? 'quota' : 'error')
    }
  }, [state, text, stop, getAudio])

  if (!enabled) return null
  const title = state === 'quota'
    ? t('chat.speakQuota', { defaultValue: 'ElevenLabs free credits exhausted — resets monthly' })
    : state === 'error'
      ? t('chat.speakError', { defaultValue: 'Playback failed — click to retry' })
      : state === 'playing'
        ? t('chat.stopSpeaking', { defaultValue: 'Stop' })
        : t('chat.speak', { defaultValue: 'Listen' })
  const cls = [voiceStyles.speakBtn, voiceStyles[state] || ''].filter(Boolean).join(' ')
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={cls}>
      {state === 'loading'
        ? <FiLoader size={13} className={voiceStyles.spin} />
        : state === 'playing'
          ? <FiSquare size={13} />
          : <FiVolume2 size={13} />}
    </button>
  )
}

/** Botón de micrófono: graba y transcribe la pregunta al input del chat. */
export function MicButton({ onTranscript, disabled, t }) {
  const enabled = useVoiceEnabled()
  const [state, setState] = useState('idle') // idle | recording | transcribing
  const recRef = useRef(null)
  const chunksRef = useRef([])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      recRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setState('transcribing')
        try {
          const txt = await speechToText(blob)
          if (txt) onTranscript?.(txt)
        } catch { /* ignorar: error de transcripción no rompe el chat */ }
        setState('idle')
      }
      rec.start()
      setState('recording')
    } catch {
      setState('idle') // micrófono denegado o no disponible
    }
  }, [onTranscript])

  const onClick = useCallback(() => {
    if (state === 'recording') { recRef.current?.stop(); return }
    if (state === 'idle') start()
  }, [state, start])

  useEffect(() => () => { try { recRef.current?.stop() } catch { /* noop */ } }, [])

  if (!enabled) return null
  const title = state === 'recording'
    ? t('chat.stopRecording', { defaultValue: 'Stop recording' })
    : t('chat.recordVoice', { defaultValue: 'Ask by voice' })
  const cls = [voiceStyles.micBtn, voiceStyles[state] || ''].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && state === 'idle'}
      title={title}
      aria-label={title}
      className={cls}
    >
      {state === 'transcribing'
        ? <FiLoader size={14} className={voiceStyles.spin} />
        : state === 'recording'
          ? <FiSquare size={14} />
          : <FiMic size={14} />}
    </button>
  )
}
