/**
 * Tests for useIdleTimer hook
 *
 * Cubre:
 *   - estado inicial (isIdle=false al montar)
 *   - transición a idle tras timeoutMs
 *   - reset al detectar eventos de actividad
 *   - vuelta de idle a activo al recibir un evento
 *   - flag enabled=false (desactiva la detección)
 *   - cleanup al desmontar (sin warnings, sin leaks)
 *   - opción targetRef (escucha en un elemento concreto en vez de window)
 *   - función reset() devuelta
 *   - lista de events personalizada
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useIdleTimer } from '../hooks/useIdleTimer'

describe('useIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('inicia con isIdle=false', () => {
    const { result } = renderHook(() => useIdleTimer({ timeoutMs: 1000 }))
    expect(result.current.isIdle).toBe(false)
  })

  it('pasa a isIdle=true tras timeoutMs sin actividad', () => {
    const { result } = renderHook(() => useIdleTimer({ timeoutMs: 2000 }))

    expect(result.current.isIdle).toBe(false)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.isIdle).toBe(true)
  })

  it('no pasa a idle si hay actividad antes del timeout', () => {
    const { result } = renderHook(() => useIdleTimer({ timeoutMs: 2000 }))

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    act(() => {
      window.dispatchEvent(new Event('mousemove'))
    })

    act(() => {
      vi.advanceTimersByTime(1500) // total 3000 ms, pero el reset ocurrió en 1500
    })

    // El temporizador se reinició, así que no han pasado todavía 2000 ms desde reset
    expect(result.current.isIdle).toBe(false)
  })

  it('vuelve de isIdle=true a false al recibir actividad', () => {
    const { result } = renderHook(() => useIdleTimer({ timeoutMs: 1000 }))

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.isIdle).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('mousemove'))
    })
    expect(result.current.isIdle).toBe(false)
  })

  it('cuando enabled=false NO marca isIdle aunque pase el timeout', () => {
    const { result } = renderHook(() =>
      useIdleTimer({ timeoutMs: 500, enabled: false })
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.isIdle).toBe(false)
  })

  it('si enabled pasa de true a false, fuerza isIdle=false', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useIdleTimer({ timeoutMs: 500, enabled }),
      { initialProps: { enabled: true } }
    )

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.isIdle).toBe(true)

    rerender({ enabled: false })
    expect(result.current.isIdle).toBe(false)
  })

  it('reset() reinicia el temporizador manualmente', () => {
    const { result } = renderHook(() => useIdleTimer({ timeoutMs: 1000 }))

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.isIdle).toBe(true)

    act(() => {
      result.current.reset()
    })
    expect(result.current.isIdle).toBe(false)

    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(result.current.isIdle).toBe(false)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.isIdle).toBe(true)
  })

  it('respeta una lista de events personalizada y NO escucha los demás', () => {
    const { result } = renderHook(() =>
      useIdleTimer({ timeoutMs: 1000, events: ['keydown'] })
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.isIdle).toBe(true)

    // mousemove NO está en la lista personalizada → no debe resetear
    act(() => {
      window.dispatchEvent(new Event('mousemove'))
    })
    expect(result.current.isIdle).toBe(true)

    // keydown SÍ resetea
    act(() => {
      window.dispatchEvent(new Event('keydown'))
    })
    expect(result.current.isIdle).toBe(false)
  })

  it('escucha en targetRef si se proporciona, no en window', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    const ref = { current: div }

    const { result } = renderHook(() =>
      useIdleTimer({ timeoutMs: 1000, targetRef: ref })
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.isIdle).toBe(true)

    // Evento en window: NO debe contar
    act(() => {
      window.dispatchEvent(new Event('mousemove'))
    })
    expect(result.current.isIdle).toBe(true)

    // Evento en el div: SÍ debe contar
    act(() => {
      div.dispatchEvent(new Event('mousemove'))
    })
    expect(result.current.isIdle).toBe(false)

    document.body.removeChild(div)
  })

  it('limpia listeners y timers al desmontar', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useIdleTimer({ timeoutMs: 1000 }))

    unmount()

    // Cada evento por defecto debe haber sido eliminado
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('timeoutMs=0 deja el hook permanentemente en isIdle=false', () => {
    const { result } = renderHook(() => useIdleTimer({ timeoutMs: 0 }))

    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(result.current.isIdle).toBe(false)
  })
})
