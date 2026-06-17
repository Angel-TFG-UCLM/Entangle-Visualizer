/**
 * useChatSession — Lógica de chat compartida entre QuantumChat y FloatingChat.
 *
 * Encapsula:
 *   - Sesión persistente (session_id en localStorage) → memoria conversacional
 *     en backend (Cosmos chat_sessions).
 *   - Modo "Investigación profunda" → llama a /chat/research (worker
 *     deep_research con Tavily + arXiv) en vez del router normal.
 *   - Streaming SSE para el modo normal, request JSON simple para research.
 *   - Estado de razonamiento, herramientas, agente activo, timer y abort.
 *   - Reset de sesión (DELETE en backend + clear localStorage + clear msgs).
 *
 * El componente consumidor se queda solo con el JSX/CSS y un handler opcional
 * de acciones del agente (OPEN_UNIVERSE, CREATE_VIEW, …).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  sendChatMessageStream,
  sendResearchMessage,
  resetChatSession,
} from '../services/api'

const SESSION_KEY = 'entangle.chatSessionId'

function readStoredSession() {
  try {
    return localStorage.getItem(SESSION_KEY) || null
  } catch {
    return null
  }
}

function persistSession(id) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* localStorage no disponible: ignorar (modo incógnito estricto, etc.) */
  }
}

export default function useChatSession({ onAction } = {}) {
  const { t } = useTranslation()
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState(null)
  const [tools, setTools] = useState([])
  const [thinkingSteps, setThinkingSteps] = useState([])
  const [statusMsg, setStatusMsg] = useState('')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [activeAgent, setActiveAgent] = useState(null)
  const [sessionId, setSessionId] = useState(readStoredSession)
  const [researchMode, setResearchMode] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')

  const abortRef = useRef(null)
  const timerRef = useRef(null)
  const agentRef = useRef(null)
  const onActionRef = useRef(onAction)
  useEffect(() => { onActionRef.current = onAction }, [onAction])

  // Buffer + flush con rAF para batchear tokens (evita un re-render por token).
  // Si llegan 200 tokens en 2s, en lugar de 200 renders/s solo hacemos uno
  // por frame (~60/s) acumulando todo el texto recibido en el frame anterior.
  const pendingTokensRef = useRef('')
  const flushScheduledRef = useRef(false)
  const flushTokens = useCallback(() => {
    flushScheduledRef.current = false
    const acc = pendingTokensRef.current
    if (!acc) return
    pendingTokensRef.current = ''
    setStreamingContent(prev => prev + acc)
  }, [])

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const resetTransient = useCallback(() => {
    clearTimer()
    setThinkingSteps([])
    setStatusMsg('')
    setElapsedSec(0)
    setActiveAgent(null)
    setStreamingContent('')
    agentRef.current = null
  }, [])

  const cancel = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    resetTransient()
    setLoading(false)
    setMsgs(prev => [...prev, { role: 'assistant', content: t('chat.reasoningCancelled'), cancelled: true }])
  }, [t, resetTransient])

  /* Persistir sessionId reciente para nuevos turnos */
  const adoptSessionId = useCallback((id) => {
    if (!id) return
    setSessionId(prev => {
      if (prev === id) return prev
      persistSession(id)
      return id
    })
  }, [])

  /* ─── Envío normal (SSE streaming, router con KNOWLEDGE/DATA/UNIVERSE/DASHBOARD) ─── */
  const sendStreaming = useCallback(async (msg) => {
    const controller = new AbortController()
    abortRef.current = controller
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    try {
      await sendChatMessageStream(msg, null, {
        onSession: (event) => adoptSessionId(event.session_id),
        onStatus: (event) => {
          if (!event.message) return
          const key = event.status_key
          if (key) {
            const translated = t(`chat.${key}`, { defaultValue: event.message })
            setStatusMsg(translated)
          } else {
            setStatusMsg(event.message)
          }
        },
        onRouting: (event) => {
          const intent = event.intent || null
          setActiveAgent(intent)
          agentRef.current = intent
          const map = {
            DATA: 'chat.connecting',
            UNIVERSE: 'chat.connectingUniverse',
            DASHBOARD: 'chat.connectingDashboard',
            KNOWLEDGE: 'chat.connectingKnowledge',
            INSIGHTS: 'chat.connectingInsights',
          }
          setStatusMsg(t(map[intent] || 'chat.connectingDashboard'))
        },
        onThinking: (event) => {
          setThinkingSteps(prev => [
            ...prev,
            { type: 'thinking', startTs: Date.now(), ...event },
          ])
        },
        onToolResult: (event) => {
          setThinkingSteps(prev => {
            // Marcar el último "thinking" como completado con su duración real
            const updated = [...prev]
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].type === 'thinking' && !updated[i].endTs) {
                updated[i] = { ...updated[i], endTs: Date.now() }
                break
              }
            }
            return [...updated, { type: 'result', endTs: Date.now(), ...event }]
          })
        },
        onToken: (event) => {
          // Texto en streaming del worker: acumulamos en un buffer y aplicamos
          // con rAF para no triggerear un re-render por cada token (lento).
          const piece = event.content || ''
          if (!piece) return
          pendingTokensRef.current += piece
          if (!flushScheduledRef.current) {
            flushScheduledRef.current = true
            requestAnimationFrame(flushTokens)
          }
        },
        onAction: (event) => { onActionRef.current?.(event) },
        onReply: (event) => {
          clearTimer()
          // Cancelar cualquier flush de tokens pendiente: el reply tiene el
          // contenido completo, no necesitamos drenar el buffer.
          pendingTokensRef.current = ''
          flushScheduledRef.current = false
          const capturedAgent = agentRef.current
          setMsgs(prev => [...prev, { role: 'assistant', content: event.content, agent: capturedAgent }])
          setHistory(event.history)
          if (event.tools_used?.length) setTools(event.tools_used)
          if (event.session_id) adoptSessionId(event.session_id)
          resetTransient()
          setLoading(false)
        },
        onError: (errMsg) => {
          clearTimer()
          setMsgs(prev => [...prev, { role: 'assistant', content: errMsg || t('chat.connectionError'), err: true }])
          resetTransient()
          setLoading(false)
        },
      }, controller.signal, sessionId)
    } catch (err) {
      if (err.name === 'AbortError') return
      setMsgs(prev => [...prev, { role: 'assistant', content: t('chat.connectionError'), err: true }])
    } finally {
      clearTimer()
      setLoading(false)
      resetTransient()
      abortRef.current = null
    }
  }, [t, sessionId, adoptSessionId, resetTransient])

  /* ─── Envío "Investigación profunda" (JSON, no SSE) ─── */
  const sendResearch = useCallback(async (msg) => {
    setActiveAgent('RESEARCH')
    agentRef.current = 'RESEARCH'
    setStatusMsg(t('chat.connectingResearch'))
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    try {
      const data = await sendResearchMessage(msg, sessionId)
      clearTimer()
      setMsgs(prev => [...prev, { role: 'assistant', content: data.reply, agent: 'RESEARCH' }])
      if (Array.isArray(data.history)) setHistory(data.history)
      if (data.tools_used?.length) setTools(data.tools_used)
      if (data.session_id) adoptSessionId(data.session_id)
    } catch (err) {
      clearTimer()
      const detail = err?.response?.data?.detail || err?.message || t('chat.connectionError')
      setMsgs(prev => [...prev, { role: 'assistant', content: detail, err: true }])
    } finally {
      clearTimer()
      resetTransient()
      setLoading(false)
    }
  }, [t, sessionId, adoptSessionId, resetTransient])

  /* ─── Envío unificado ─── */
  const send = useCallback(async (text, opts = {}) => {
    const msg = (text ?? '').trim()
    if (!msg || loading) return
    // Permite forzar modo investigación para este envío sin esperar al
    // commit del estado (evita race condition con setResearchMode + send).
    const useResearch = opts.research !== undefined ? opts.research : researchMode
    setMsgs(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    setThinkingSteps([])
    setStatusMsg(useResearch ? t('chat.connectingResearch') : t('chat.classifying'))
    setElapsedSec(0)
    setActiveAgent(useResearch ? 'RESEARCH' : null)
    agentRef.current = useResearch ? 'RESEARCH' : null

    if (useResearch) {
      await sendResearch(msg)
    } else {
      await sendStreaming(msg)
    }
  }, [loading, researchMode, t, sendResearch, sendStreaming])

  /* ─── Reset de sesión: borra backend + localStorage + msgs ─── */
  const newConversation = useCallback(async () => {
    if (loading || resetting) return
    setResetting(true)
    try {
      if (sessionId) {
        await resetChatSession(sessionId).catch(() => { /* best-effort */ })
      }
    } finally {
      persistSession(null)
      setSessionId(null)
      setMsgs([])
      setHistory(null)
      setTools([])
      setThinkingSteps([])
      setStatusMsg('')
      setElapsedSec(0)
      setActiveAgent(null)
      agentRef.current = null
      setResetting(false)
    }
  }, [loading, resetting, sessionId])

  /* ─── Limpieza local (sin tocar backend) — para cerrar la ventana ─── */
  const clearLocal = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    clearTimer()
    setMsgs([])
    setHistory(null)
    setTools([])
    setThinkingSteps([])
    setStatusMsg('')
    setElapsedSec(0)
    setActiveAgent(null)
    agentRef.current = null
    setLoading(false)
  }, [])

  /* ─── Rotador de mensajes mientras esperamos al router ───
   * NOTA: ya no rotamos mensajes fake. El backend emite ahora un thinking
   * step real ("Eligiendo el agente más adecuado") desde el primer instante,
   * que se ve en la lista de pasos con su timer. Si por alguna razón el
   * backend no llega a emitir nada, este efecto deja de hacer nada.
   * Mantenemos la firma para no romper otras partes; se podría eliminar.
   */
  useEffect(() => {
    if (!loading) return
    if (activeAgent) return
    if (thinkingSteps.length > 0) return
    // Ya no rotamos mensajes. Solo limpiamos statusMsg para que el indicador
    // visual (timer + dot animado) sea lo único visible mientras esperamos.
    setStatusMsg('')
  }, [loading, activeAgent, thinkingSteps.length])

  return {
    msgs, loading, history, tools,
    thinkingSteps, statusMsg, elapsedSec, activeAgent,
    sessionId, researchMode, setResearchMode,
    resetting, streamingContent,
    send, cancel, newConversation, clearLocal,
    setMsgs,
  }
}