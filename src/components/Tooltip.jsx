/**
 * Tooltip - Tooltip ligero con estilo cuántico
 * ============================================
 * Reemplazo del atributo `title` HTML nativo (que se ve feo y tiene un delay
 * incontrolable). Wrap cualquier elemento y muestra el contenido con animación
 * de fade y posición debajo del trigger. No usa portal: funciona dentro del
 * header sin cortes porque usa position: absolute.
 */

import { useState, useRef, useId } from 'react'
import PropTypes from 'prop-types'
import styles from './Tooltip.module.css'

export default function Tooltip({ label, children, position = 'bottom', delay = 250 }) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef(null)
  const tooltipId = useId()

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setVisible(true), delay)
  }

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  return (
    <span
      className={styles.wrapper}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {label && (
        <span
          id={tooltipId}
          className={`${styles.tip} ${styles[position] || styles.bottom} ${visible ? styles.visible : ''}`}
          role="tooltip"
          aria-hidden={!visible}
        >
          {label}
        </span>
      )}
    </span>
  )
}

Tooltip.propTypes = {
  label: PropTypes.node,
  children: PropTypes.node.isRequired,
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
  delay: PropTypes.number,
}
