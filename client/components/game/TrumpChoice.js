import { useGame } from '../../context/GameContext'
import { SUIT_NAMES } from '../../lib/cards'
import styles from '../../styles/TrumpChoice.module.css'

const MINOR_SUITS = ['makk', 'zold', 'tok']

// Shown only when the declarer must pick a concrete minor trump before their
// first lead (normal trump contracts). Red / no-trump contracts skip this.
export default function TrumpChoice() {
  const { state, dispatch } = useGame()
  const { phase, currentTurnId, myPlayerId, needsOpeningLead, declaration, pendingTrump, trumpSuit } = state

  const isMyOpeningLead = phase === 'PLAYING' && currentTurnId === myPlayerId && needsOpeningLead
  const needTrump = declaration && !declaration.isNoTrump && declaration.color === 'normal'
  if (!isMyOpeningLead || !needTrump || pendingTrump || trumpSuit) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Válaszd ki az adu színt</h2>
        <div className={styles.row}>
          {MINOR_SUITS.map((s) => (
            <button
              key={s}
              className={styles.pick}
              onClick={() => dispatch({ type: 'SET_TRUMP_CHOICE', suit: s })}
            >
              {SUIT_NAMES[s]}
            </button>
          ))}
        </div>
        <p className={styles.hint}>Utána a szokásos módon játszd ki a lapjaidat.</p>
      </div>
    </div>
  )
}
