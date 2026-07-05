import { useGame } from '../../context/GameContext'
import { SUIT_NAMES } from '../../lib/cards'
import styles from '../../styles/MarriageBar.module.css'

export default function MarriageBar() {
  const { state, dispatch } = useGame()
  const { marriageOptions, pendingMarriages, trumpSuit, currentTurnId, myPlayerId, phase } = state

  if (phase !== 'PLAYING' || currentTurnId !== myPlayerId || !marriageOptions?.length) return null

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Announce marriage?</span>
      {marriageOptions.map((suit) => {
        const value = suit === trumpSuit ? 40 : 20
        const on = pendingMarriages.includes(suit)
        return (
          <button
            key={suit}
            className={`${styles.chip} ${on ? styles.on : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_MARRIAGE', suit })}
          >
            {SUIT_NAMES[suit]} +{value}
          </button>
        )
      })}
      <span className={styles.hint}>then play a card to confirm</span>
    </div>
  )
}
