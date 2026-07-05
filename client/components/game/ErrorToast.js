import { useEffect } from 'react'
import { useGame } from '../../context/GameContext'
import styles from '../../styles/ErrorToast.module.css'

// Surfaces server-side `game:error` messages that were otherwise swallowed.
export default function ErrorToast() {
  const { state, dispatch } = useGame()

  useEffect(() => {
    if (!state.error) return
    const t = setTimeout(() => dispatch({ type: 'CLEAR_ERROR' }), 5000)
    return () => clearTimeout(t)
  }, [state.error])

  if (!state.error) return null
  return (
    <div className={styles.toast} onClick={() => dispatch({ type: 'CLEAR_ERROR' })}>
      ⚠ {state.error}
    </div>
  )
}
