import { useTranslation } from 'react-i18next'
import styles from './LanguageSelector.module.css'

const LANGUAGES = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
]

export default function LanguageSelector() {
  const { i18n } = useTranslation()

  return (
    <div className={styles.selector}>
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          className={`${styles.option} ${i18n.language?.startsWith(code) ? styles.active : ''}`}
          onClick={() => i18n.changeLanguage(code)}
          aria-label={code === 'es' ? 'Español' : 'English'}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
