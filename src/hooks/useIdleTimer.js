import { useEffect, useRef, useState, useCallback } from 'react'

const DEFAULT_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'wheel',
  'touchstart',
  'touchmove',
]

/**
 * useIdleTimer
 * ------------
 * Detecta inactividad del usuario sobre `window` (o sobre un elemento concreto
 * vía `targetRef`) y emite un booleano `isIdle` que se vuelve `true` tras
 * `timeoutMs` sin actividad y `false` en cuanto el usuario interactúa.
 *
 * Pensado para el "cinematic mode" del Universo 3D: oculta la HUD cuando el
 * investigador deja de tocar la pantalla, permitiendo capturas limpias y una
 * experiencia inmersiva, y la restaura al volver a interactuar.
 *
 * @param {Object}   options
 * @param {number}   [options.timeoutMs=20000]  Milisegundos sin actividad antes
 *                                              de marcar como inactivo.
 * @param {boolean}  [options.enabled=true]     Permite desactivar el detector
 *                                              (p.ej. durante el Tour Cósmico).
 * @param {string[]} [options.events]           Eventos DOM que cuentan como
 *                                              actividad. Por defecto: ratón,
 *                                              teclado, rueda y táctil.
 * @param {Object}   [options.targetRef]        Ref opcional al elemento sobre
 *                                              el que escuchar; si se omite,
 *                                              se usa `window`.
 *
 * @returns {{isIdle: boolean, reset: () => void}}
 */
export function useIdleTimer({
  timeoutMs = 20000,
  enabled = true,
  events = DEFAULT_EVENTS,
  targetRef = null,
} = {}) {
  const [isIdle, setIsIdle] = useState(false)
  const timeoutRef = useRef(null)
  // Mantener configuración mutable en refs para que cambios de identidad de
  // referencia (p.ej. el array `events` recreado en cada render) NO provoquen
  // re-suscripciones del efecto principal.
  const timeoutMsRef = useRef(timeoutMs)
  const eventsRef = useRef(events)
  const enabledRef = useRef(enabled)

  useEffect(() => { timeoutMsRef.current = timeoutMs }, [timeoutMs])
  useEffect(() => { eventsRef.current = events }, [events])
  useEffect(() => { enabledRef.current = enabled }, [enabled])

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    clearTimer()
    setIsIdle(false)
    if (enabledRef.current && timeoutMsRef.current > 0) {
      timeoutRef.current = setTimeout(() => {
        setIsIdle(true)
        timeoutRef.current = null
      }, timeoutMsRef.current)
    }
  }, [clearTimer])

  // Clave estable derivada del contenido del array para que cambios reales en
  // la lista de eventos (no meras recreaciones de referencia) re-suscriban.
  const eventsKey = Array.isArray(events) ? events.join('|') : ''

  useEffect(() => {
    if (!enabled) {
      clearTimer()
      return undefined
    }

    const target =
      targetRef && targetRef.current
        ? targetRef.current
        : typeof window !== 'undefined'
          ? window
          : null

    if (!target) return undefined

    const handleActivity = () => {
      reset()
    }

    const evts = eventsRef.current
    evts.forEach(evt => {
      target.addEventListener(evt, handleActivity, { passive: true })
    })

    // Iniciar el temporizador al montar SIN setear estado (eso lo harÃ¡
    // setIsIdle cuando expire). AsÃ­ evitamos setState() en el cuerpo del
    // effect, que React marca como anti-patrÃ³n por cascading renders.
    clearTimer()
    if (timeoutMsRef.current > 0) {
      timeoutRef.current = setTimeout(() => {
        setIsIdle(true)
        timeoutRef.current = null
      }, timeoutMsRef.current)
    }

    return () => {
      evts.forEach(evt => {
        target.removeEventListener(evt, handleActivity)
      })
      clearTimer()
    }
  }, [enabled, eventsKey, targetRef, reset, clearTimer])

  // Estado expuesto derivado: si el hook estÃ¡ desactivado, nunca exponemos
  // isIdle=true (aunque internamente quedara colgada de una activaciÃ³n anterior).
  // Esto evita llamar setIsIdle dentro del effect (mala prÃ¡ctica).
  return { isIdle: enabled ? isIdle : false, reset }
}

export default useIdleTimer
