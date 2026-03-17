import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import styles from './LanguageSelector.module.css'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
]

const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
  </svg>
)

export default function LanguageSelector() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const current = LANGUAGES.find(l => i18n.language?.startsWith(l.code)) || LANGUAGES[0]

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMenuPos({
      top: rect.bottom + 6,
      left: rect.right,
    })
  }, [])

  const handleToggle = useCallback(() => {
    updatePosition()
    setOpen(o => !o)
  }, [updatePosition])

  const handleSelect = useCallback((code) => {
    i18n.changeLanguage(code)
    setOpen(false)
  }, [i18n])

  useEffect(() => {
    const handler = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
      >
        <GlobeIcon />
        <span className={styles.currentLabel}>{current.code.toUpperCase()}</span>
        <svg className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>

      {open && createPortal(
        <ul
          ref={menuRef}
          className={styles.menu}
          role="listbox"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {LANGUAGES.map(({ code, label }, i) => (
            <li key={code}
              role="option"
              aria-selected={code === current.code}
              className={`${styles.item} ${code === current.code ? styles.active : ''}`}
              style={{ animationDelay: `${i * 30}ms` }}
              onClick={() => handleSelect(code)}
            >
              <span className={styles.itemCode}>{code.toUpperCase()}</span>
              <span className={styles.itemLabel}>{label}</span>
              {code === current.code && (
                <svg className={styles.checkIcon} width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  )
}
