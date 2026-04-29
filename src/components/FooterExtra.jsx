/**
 * FooterExtra - Stats live + redes sociales + versión
 * ===================================================
 * Componente compacto que añade información dinámica y enlaces relevantes
 * al footer del proyecto sin ocupar mucho espacio.
 */

import { Github, Linkedin, FileText, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDashboardStore } from '../store/dashboardStore'
import styles from './FooterExtra.module.css'

const APP_VERSION = '1.0.0'
const GITHUB_BACKEND = 'https://github.com/Angel-TFG-UCLM/Entangle-Core'
const GITHUB_FRONTEND = 'https://github.com/Angel-TFG-UCLM/Entangle-Visualizer'
const LINKEDIN_URL = 'https://www.linkedin.com/in/angelllm/'

function formatNum(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—'
  // Estilo europeo: 27.061 (puntos como separador de miles)
  return n.toLocaleString('es-ES')
}

export default function FooterExtra() {
  const { t } = useTranslation()
  const kpis = useDashboardStore(s => s.kpis) || {}

  // El store tiene kpis en la raiz: { totalRepos, totalUsers, totalOrgs, ... }
  const repos = kpis.totalRepos
  const users = kpis.totalUsers
  const orgs  = kpis.totalOrgs

  const hasStats =
    typeof repos === 'number' ||
    typeof users === 'number' ||
    typeof orgs === 'number'

  return (
    <div className={styles.footerExt}>
      {/* Stats live: solo si hay datos cargados */}
      {hasStats && (
        <div className={styles.statsLive}>
          <span className={styles.statsLabel}>{t('app.footer.stats.label')} </span>
          <span className={styles.statItem}>
            <span className={styles.statValue}>{formatNum(repos)}</span>
            <span className={styles.statLabel}>{t('app.footer.stats.repos')}</span>
          </span>
          <span className={styles.statSep} aria-hidden="true" />
          <span className={styles.statItem}>
            <span className={styles.statValue}>{formatNum(users)}</span>
            <span className={styles.statLabel}>{t('app.footer.stats.users')}</span>
          </span>
          <span className={styles.statSep} aria-hidden="true" />
          <span className={styles.statItem}>
            <span className={styles.statValue}>{formatNum(orgs)}</span>
            <span className={styles.statLabel}>{t('app.footer.stats.orgs')}</span>
          </span>
        </div>
      )}

      {/* Links sociales */}
      <div className={styles.socials}>
        <a
          href={GITHUB_BACKEND}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.socialLink}
          title={`${t('app.footer.links.github')} - Backend`}
          aria-label={`${t('app.footer.links.github')} - Backend`}
        >
          <Github size={14} />
        </a>
        <a
          href={GITHUB_FRONTEND}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.socialLink}
          title={`${t('app.footer.links.github')} - Frontend`}
          aria-label={`${t('app.footer.links.github')} - Frontend`}
        >
          <BookOpen size={14} />
        </a>
        <a
          href={LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.socialLink}
          title={t('app.footer.links.linkedin')}
          aria-label={t('app.footer.links.linkedin')}
        >
          <Linkedin size={14} />
        </a>
        <a
          href={GITHUB_BACKEND + '/blob/main/README.md'}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.socialLink}
          title={t('app.footer.links.memoria')}
          aria-label={t('app.footer.links.memoria')}
        >
          <FileText size={14} />
        </a>
      </div>

      {/* Versión + autor */}
      <div className={styles.metaLine}>
        <span className={styles.author}>{t('app.footer.madeBy')}</span>
        <span className={styles.metaSep}>·</span>
        <span className={styles.version}>{t('app.footer.version')}{APP_VERSION}</span>
      </div>
    </div>
  )
}
