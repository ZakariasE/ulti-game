import { useGame } from '../../context/GameContext'
import { componentLabel, kontraLevelName } from '../../lib/bids'
import styles from '../../styles/KontraBar.module.css'

function nextName(level) { return kontraLevelName(level * 2) }

export default function KontraBar() {
  const { state, dispatch } = useGame()
  const { phase, declaration, kontra, kontraOptions, pendingKontra, currentTurnId, myPlayerId,
    options: gameOptions, felkezesKontraOk, pendingFelkezesKontra, biddingKontra } = state

  if (phase !== 'PLAYING' || !declaration) return null

  // Félkezes: a single hand-wide kontra chain (not per component).
  if (gameOptions?.felkezes) {
    const bk = biddingKontra || { level: 0 }
    const showLevel = bk.level > 0
    if (!showLevel && !felkezesKontraOk) return null
    const nextK = kontraLevelName(2 ** ((bk.level || 0) + 1))
    return (
      <div className={styles.bar}>
        {showLevel && (
          <span className={styles.levels}>
            <span className={styles.levelTag}>{kontraLevelName(2 ** bk.level)} ×{bk.multiplier}</span>
          </span>
        )}
        {felkezesKontraOk && (
          <span className={styles.actions}>
            <button
              className={`${styles.btn} ${pendingFelkezesKontra ? styles.btnOn : ''}`}
              onClick={() => dispatch({ type: 'TOGGLE_FELKEZES_KONTRA' })}
            >
              {nextK}
            </button>
            <span className={styles.hint}>kártya lerakásakor véglegesül</span>
          </span>
        )}
      </div>
    )
  }

  // Components currently above ×1, for display.
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
                {nextName(kontra[c]?.level || 1)} {componentLabel(c)}
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
