/**
 * Tooltip - Tooltip ligero con estilo cuántico
 * ============================================
 * Reemplazo del atributo `title` HTML nativo (que se ve feo y tiene un delay
 * incontrolable). Wrap cualquier elemento y muestra el contenido con animación
 * de fade. Renderiza en un portal con position: fixed para escapar de
 * contenedores con overflow: hidden (banners, cards, etc.).
 */

import { useState, useRef, useId, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import styles from './Tooltip.module.css'

export default function Tooltip({ label, children, position = 'bottom', delay = 250 }) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const timeoutRef = useRef(null)
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const tooltipId = useId()

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setVisible(true), delay)
  }

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  // Calcular posición del tooltip respecto al trigger (viewport-fixed)
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return
    const tr = triggerRef.current.getBoundingClientRect()
    const tt = tooltipRef.current.getBoundingClientRect()
    const gap = 10
    let top = 0
    let left = 0
    switch (position) {
      case 'top':
        top = tr.top - tt.height - gap
        left = tr.left + tr.width / 2 - tt.width / 2
        break
      case 'left':
        top = tr.top + tr.height / 2 - tt.height / 2
        left = tr.left - tt.width - gap
        break
      case 'right':
        top = tr.top + tr.height / 2 - tt.height / 2
        left = tr.right + gap
        break
      case 'bottom':
      default:
        top = tr.bottom + gap
        left = tr.left + tr.width / 2 - tt.width / 2
    }
    // Clampear dentro del viewport
    const vw = window.innerWidth
    if (left < 8) left = 8
    if (left + tt.width > vw - 8) left = vw - tt.width - 8
    setCoords({ top, left })
  }, [visible, position, label])

  return (
    <>
      <span
        ref={triggerRef}
        className={styles.wrapper}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
      >
        {children}
      </span>
      {label && visible && createPortal(
        <span
          ref={tooltipRef}
          id={tooltipId}
          className={`${styles.tip} ${styles[position] || styles.bottom} ${styles.visible}`}
          role="tooltip"
          aria-hidden="false"
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
        >
          {label}
        </span>,
        document.body
      )}
    </>
  )
}

Tooltip.propTypes = {
  label: PropTypes.node,
  children: PropTypes.node,
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
  delay: PropTypes.number,
}
