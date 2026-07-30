import { FiArchive, FiExternalLink, FiFileText, FiPlayCircle } from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { publicAsset } from '../../utils/publicAsset'
import styles from './OfflineDemoVideo.module.css'

export default function OfflineDemoVideo() {
  const { t } = useTranslation()
  const videoUrl = publicAsset('media/entangle-demo-web.mp4')
  const posterUrl = publicAsset('media/entangle-demo-poster.png')
  const thesisUrl = publicAsset('media/entangle-tfg-memoria.pdf')

  return (
    <section className={styles.section} aria-labelledby="offline-demo-title">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.copy}>
        <span className={styles.eyebrow}>
          <FiArchive aria-hidden="true" />
          {t('app.offline.video.eyebrow')}
        </span>
        <h3 id="offline-demo-title" className={styles.title}>
          {t('app.offline.video.title')}
        </h3>
        <p className={styles.description}>{t('app.offline.video.description')}</p>
        <div className={styles.meta}>
          <span><FiPlayCircle aria-hidden="true" /> {t('app.offline.video.duration')}</span>
          <span>{t('app.offline.video.snapshot')}</span>
        </div>
        <p className={styles.note}>{t('app.offline.video.note')}</p>
        <div className={styles.actions}>
          <a className={styles.openLink} href={videoUrl} target="_blank" rel="noreferrer">
            {t('app.offline.video.open')}
            <FiExternalLink aria-hidden="true" />
          </a>
          <a className={styles.thesisLink} href={thesisUrl} target="_blank" rel="noreferrer">
            <FiFileText aria-hidden="true" />
            {t('app.footer.links.memoria')}
            <FiExternalLink aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className={styles.playerFrame}>
        <div className={styles.playerChrome}>
          <span />
          <span />
          <span />
          <strong>entangle-demo-2026.mp4</strong>
        </div>
        <video
          className={styles.video}
          controls
          preload="metadata"
          playsInline
          poster={posterUrl}
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      </div>
    </section>
  )
}
