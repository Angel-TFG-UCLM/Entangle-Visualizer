/**
 * Tests for useChatSession — lógica de chat compartida (memoria, research, SSE).
 *
 * Mockea la capa de api (streaming, research, reset) y react-i18next para
 * ejercitar el hook con renderHook: estado inicial, envío normal (SSE) con
 * todos los callbacks, envío research, cancelación, reset de sesión, limpieza
 * local y los no-op (texto vacío / loading).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key, opts) => (opts && opts.defaultValue) || key }),
}))

vi.mock('../services/api', () => ({
  sendChatMessageStream: vi.fn(),
  sendResearchMessage: vi.fn(),
  resetChatSession: vi.fn(),
}))

import useChatSession from '../hooks/useChatSession'
import { sendChatMessageStream, sendResearchMessage, resetChatSession } from '../services/api'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // rAF síncrono para drenar el buffer de tokens de inmediato
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0 })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useChatSession', () => {
  it('estado inicial vacío', () => {
    const { result } = renderHook(() => useChatSession())
    expect(result.current.msgs).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.sessionId).toBeNull()
    expect(result.current.researchMode).toBe(false)
  })

  it('lee sessionId persistido de localStorage', () => {
    localStorage.setItem('entangle.chatSessionId', 'sid-123')
    const { result } = renderHook(() => useChatSession())
    expect(result.current.sessionId).toBe('sid-123')
  })

  it('send() vacío o solo espacios es no-op', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => { await result.current.send('   ') })
    expect(result.current.msgs).toEqual([])
    expect(sendChatMessageStream).not.toHaveBeenCalled()
  })

  it('send() normal procesa todos los eventos SSE', async () => {
    sendChatMessageStream.mockImplementation(async (msg, history, cbs) => {
      cbs.onSession({ session_id: 'sid-new' })
      cbs.onStatus({ message: 'pensando', status_key: 'classifying' })
      cbs.onRouting({ intent: 'DATA' })
      cbs.onThinking({ tool_key: 'query_database', description: 'consultando' })
      cbs.onToolResult({ count: 5 })
      cbs.onToken({ content: 'Hola ' })
      cbs.onToken({ content: 'mundo' })
      cbs.onAction({ action: 'OPEN_UNIVERSE' })
      cbs.onReply({ content: 'respuesta final', history: [{ role: 'user' }], tools_used: ['query_database'], session_id: 'sid-new' })
    })
    const onAction = vi.fn()
    const { result } = renderHook(() => useChatSession({ onAction }))

    await act(async () => { await result.current.send('top repos') })

    expect(result.current.msgs).toEqual([
      { role: 'user', content: 'top repos' },
      { role: 'assistant', content: 'respuesta final', agent: 'DATA' },
    ])
    expect(result.current.sessionId).toBe('sid-new')
    expect(result.current.tools).toEqual(['query_database'])
    expect(result.current.loading).toBe(false)
    expect(onAction).toHaveBeenCalledWith({ action: 'OPEN_UNIVERSE' })
  })

  it('send() normal con onError marca el mensaje como error', async () => {
    sendChatMessageStream.mockImplementation(async (msg, history, cbs) => {
      cbs.onError('algo falló')
    })
    const { result } = renderHook(() => useChatSession())
    await act(async () => { await result.current.send('hola') })
    const last = result.current.msgs.at(-1)
    expect(last.err).toBe(true)
    expect(last.content).toBe('algo falló')
  })

  it('send() en modo research llama al endpoint de research', async () => {
    sendResearchMessage.mockResolvedValue({
      reply: 'papers encontrados', history: [{ role: 'user' }], tools_used: ['search_arxiv'], session_id: 'sid-r',
    })
    const { result } = renderHook(() => useChatSession())
    await act(async () => { await result.current.send('vqe papers', { research: true }) })

    expect(sendResearchMessage).toHaveBeenCalledWith('vqe papers', null)
    const last = result.current.msgs.at(-1)
    expect(last).toEqual({ role: 'assistant', content: 'papers encontrados', agent: 'RESEARCH' })
    expect(result.current.tools).toEqual(['search_arxiv'])
  })

  it('send() research con error muestra el detalle', async () => {
    sendResearchMessage.mockRejectedValue({ response: { data: { detail: 'arxiv caído' } } })
    const { result } = renderHook(() => useChatSession())
    await act(async () => { await result.current.send('x', { research: true }) })
    const last = result.current.msgs.at(-1)
    expect(last.err).toBe(true)
    expect(last.content).toBe('arxiv caído')
  })

  it('cancel() aborta y añade mensaje de cancelación', () => {
    const { result } = renderHook(() => useChatSession())
    act(() => { result.current.cancel() })
    expect(result.current.msgs.at(-1).cancelled).toBe(true)
    expect(result.current.loading).toBe(false)
  })

  it('newConversation() borra sesión backend y estado local', async () => {
    localStorage.setItem('entangle.chatSessionId', 'sid-del')
    resetChatSession.mockResolvedValue({ deleted: true })
    const { result } = renderHook(() => useChatSession())
    await act(async () => { await result.current.newConversation() })
    expect(resetChatSession).toHaveBeenCalledWith('sid-del')
    expect(result.current.sessionId).toBeNull()
    expect(result.current.msgs).toEqual([])
    expect(localStorage.getItem('entangle.chatSessionId')).toBeNull()
  })

  it('clearLocal() limpia el estado sin tocar backend', () => {
    const { result } = renderHook(() => useChatSession())
    act(() => { result.current.setMsgs([{ role: 'user', content: 'x' }]) })
    act(() => { result.current.clearLocal() })
    expect(result.current.msgs).toEqual([])
    expect(resetChatSession).not.toHaveBeenCalled()
  })

  it('setResearchMode alterna el modo', () => {
    const { result } = renderHook(() => useChatSession())
    act(() => { result.current.setResearchMode(true) })
    expect(result.current.researchMode).toBe(true)
  })
})
