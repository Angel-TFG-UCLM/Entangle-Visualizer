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
import { useEffect } from 'react'
import { FiCpu } from 'react-icons/fi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

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
