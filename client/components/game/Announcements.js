import { useEffect } from 'react'
import { useGame } from '../../context/GameContext'
import styles from '../../styles/Announcements.module.css'

const DISPLAY_MS = 1000

// Auto-dismiss a single toast after DISPLAY_MS.
function Toast({ id, text, kind }) {
  const { dispatch } = useGame()
  useEffect(() => {
    const t = setTimeout(() => dispatch({ type: 'DISMISS_ANNOUNCEMENT', id }), DISPLAY_MS)
    return () => clearTimeout(t)
  }, [id])
  return <div className={`${styles.toast} ${styles[kind] || ''}`}>{text}</div>
}

// Transient, all-players notifications: contract declared, marriages, kontra.
export default function Announcements() {
  const { state } = useGame()
  if (!state.announcements.length) return null
  return (
    <div className={styles.stack} aria-live="polite">
      {state.announcements.map((a) => (
        <Toast key={a.id} {...a} />
      ))}
    </div>
  )
}
