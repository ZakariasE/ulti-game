import { useGame } from '../../context/GameContext'
import { componentLabel, kontraLevelName } from '../../lib/bids'
import styles from '../../styles/KontraBar.module.css'

// The escalation name is driven by the step count, not the multiplier (a 5-card
// kontra is ×4 so level ≠ 2^step). Next escalation = step+1.
function nextName(k) { return kontraLevelName(2 ** (((k && k.step) || 0) + 1)) }

export default function KontraBar() {
  const { state, dispatch } = useGame()
  const { phase, declaration, kontra, kontraOptions, pendingKontra, currentTurnId, myPlayerId } = state

  if (phase !== 'PLAYING' || !declaration) return null

  // Components currently above ×1, for display (includes any kontra carried over
  // from the félkezes bidding round — it lives in play.kontra).
  const doubled = Object.entries(kontra || {}).filter(([, k]) => k.level > 1)
  const myTurn = currentTurnId === myPlayerId
  const options = myTurn ? (kontraOptions || []) : []

  if (doubled.length === 0 && options.length === 0) return null

  const toggle = (c) => dispatch({ type: 'TOGGLE_KONTRA', component: c })
  const allStaged = options.length > 0 && options.every((c) => pendingKontra.includes(c))
  const toggleAll = () => options.forEach((c) => {
    if (pendingKontra.includes(c) === allStaged) toggle(c)
  })

  return (
    <div className={styles.bar}>
      {doubled.length > 0 && (
        <span className={styles.levels}>
          {doubled.map(([c, k]) => (
            <span key={c} className={styles.levelTag}>
              {componentLabel(c)} ×{k.level}
            </span>
          ))}
        </span>
      )}
      {options.length > 0 && (
        <span className={styles.actions}>
          {options.map((c) => {
            const on = pendingKontra.includes(c)
            return (
              <button
                key={c}
                className={`${styles.btn} ${on ? styles.btnOn : ''}`}
                onClick={() => toggle(c)}
              >
                {nextName(kontra[c])} {componentLabel(c)}
              </button>
            )
          })}
          {options.length > 1 && (
            <button className={styles.btnAll} onClick={toggleAll}>
              {allStaged ? 'Mégse' : 'Összes kontra'}
            </button>
          )}
          <span className={styles.hint}>kártya lerakásakor véglegesül</span>
        </span>
      )}
    </div>
  )
}
