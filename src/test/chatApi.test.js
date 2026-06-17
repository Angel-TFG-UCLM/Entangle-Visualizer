/**
 * Tests for the chat API layer (api.js): mensaje normal, reset de sesión,
 * investigación externa y el streaming SSE (sendChatMessageStream).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('axios', () => {
  const mockInstance = {
    get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn(), patch: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  }
  return { default: { create: vi.fn(() => mockInstance), __mockInstance: mockInstance } }
})

import axios from 'axios'
const mockClient = axios.__mockInstance

import {
  sendChatMessage,
  resetChatSession,
  sendResearchMessage,
  sendChatMessageStream,
} from '../services/api'

/* Crea un body con getReader() que emite los chunks SSE dados y luego done. */
function makeStreamResponse(events, { ok = true, status = 200 } = {}) {
  const enc = new TextEncoder()
  const chunks = events.map(e => enc.encode(`data: ${JSON.stringify(e)}\n\n`))
  let i = 0
  return {
    ok,
    status,
    text: async () => 'error body',
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length ? { value: chunks[i++], done: false } : { value: undefined, done: true }),
      }),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sendChatMessage', () => {
  it('postea /chat con session_id cuando se pasa', async () => {
    mockClient.post.mockResolvedValue({ data: { reply: 'ok' } })
    const out = await sendChatMessage('hola', null, 'sid-1')
    expect(mockClient.post).toHaveBeenCalledWith('/chat', { message: 'hola', history: null, session_id: 'sid-1' }, expect.any(Object))
    expect(out).toEqual({ reply: 'ok' })
  })

  it('omite session_id cuando es null', async () => {
    mockClient.post.mockResolvedValue({ data: {} })
    await sendChatMessage('hola')
    expect(mockClient.post).toHaveBeenCalledWith('/chat', { message: 'hola', history: null }, expect.any(Object))
  })
})

describe('resetChatSession', () => {
  it('no llama al backend si no hay sessionId', async () => {
    const out = await resetChatSession(null)
    expect(out).toEqual({ deleted: false, session_id: null })
    expect(mockClient.delete).not.toHaveBeenCalled()
  })

  it('hace DELETE de la sesión', async () => {
    mockClient.delete.mockResolvedValue({ data: { deleted: true, session_id: 'sid-x' } })
    const out = await resetChatSession('sid-x')
    expect(mockClient.delete).toHaveBeenCalledWith('/chat/session/sid-x')
    expect(out.deleted).toBe(true)
  })
})

describe('sendResearchMessage', () => {
  it('postea /chat/research con timeout largo', async () => {
    mockClient.post.mockResolvedValue({ data: { reply: 'papers' } })
    const out = await sendResearchMessage('vqe', 'sid-2')
    expect(mockClient.post).toHaveBeenCalledWith('/chat/research', { message: 'vqe', session_id: 'sid-2' }, { timeout: 300000 })
    expect(out).toEqual({ reply: 'papers' })
  })
})

describe('sendChatMessageStream', () => {
  it('despacha cada tipo de evento SSE al callback correspondiente', async () => {
    const events = [
      { type: 'session', session_id: 'sid' },
      { type: 'routing', intent: 'DATA' },
      { type: 'thinking', tool_key: 'query_database' },
      { type: 'tool_result', count: 3 },
      { type: 'status', message: 'analizando' },
      { type: 'token', content: 'Hi' },
      { type: 'action', action: 'OPEN_UNIVERSE' },
      { type: 'reply', content: 'final', history: [] },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamResponse(events)))

    const cbs = {
      onSession: vi.fn(), onRouting: vi.fn(), onThinking: vi.fn(), onToolResult: vi.fn(),
      onStatus: vi.fn(), onToken: vi.fn(), onAction: vi.fn(), onReply: vi.fn(), onError: vi.fn(),
    }
    await sendChatMessageStream('hola', null, cbs, null, 'sid')

    expect(cbs.onSession).toHaveBeenCalledWith(expect.objectContaining({ session_id: 'sid' }))
    expect(cbs.onRouting).toHaveBeenCalledWith(expect.objectContaining({ intent: 'DATA' }))
    expect(cbs.onThinking).toHaveBeenCalled()
    expect(cbs.onToolResult).toHaveBeenCalled()
    expect(cbs.onStatus).toHaveBeenCalled()
    expect(cbs.onToken).toHaveBeenCalledWith(expect.objectContaining({ content: 'Hi' }))
    expect(cbs.onAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'OPEN_UNIVERSE' }))
    expect(cbs.onReply).toHaveBeenCalledWith(expect.objectContaining({ content: 'final' }))
    expect(cbs.onError).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('llama onError cuando la respuesta no es ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamResponse([], { ok: false, status: 500 })))
    const onError = vi.fn()
    await sendChatMessageStream('hola', null, { onError })
    expect(onError).toHaveBeenCalledWith('error body')
    vi.unstubAllGlobals()
  })

  it('despacha el evento error del stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamResponse([{ type: 'error', content: 'boom' }])))
    const onError = vi.fn()
    await sendChatMessageStream('hola', null, { onError })
    expect(onError).toHaveBeenCalledWith('boom')
    vi.unstubAllGlobals()
  })
})
