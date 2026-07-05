import { useGame } from '../../context/GameContext'
import { SUIT_NAMES } from '../../lib/cards'
import styles from '../../styles/MarriageBar.module.css'

// Jelentés (K+O) picker: announced by default, click a suit to opt OUT.
export default function MarriageBar() {
  const { state, dispatch } = useGame()
  const { marriageOptions, pendingMarriages, trumpSuit, pendingTrump, declaration,
    currentTurnId, myPlayerId, phase } = state

  if (phase !== 'PLAYING' || currentTurnId !== myPlayerId || !marriageOptions?.length) return null

  // Values depend on the trump suit, so wait until it's known. For defenders the
  // trump is already revealed (trumpSuit); for the declarer it's their pending
  // choice at the opening lead.
  const effectiveTrump = trumpSuit || pendingTrump
  const needTrump = declaration && !declaration.isNoTrump && declaration.color === 'normal'
  const trumpReady = !needTrump || !!effectiveTrump
  if (!trumpReady) return null

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Jelentések:</span>
      {marriageOptions.map((suit) => {
        const value = suit === effectiveTrump ? 40 : 20
        const on = pendingMarriages.includes(suit)
        return (
          <button
            key={suit}
            className={`${styles.chip} ${on ? styles.on : styles.off}`}
            onClick={() => dispatch({ type: 'TOGGLE_MARRIAGE', suit })}
          >
            {SUIT_NAMES[suit]} {value}
          </button>
        )
      })}
      <span className={styles.hint}>alapból bejelentve — kattints egyre a kihagyáshoz</span>
    </div>
  )
}
