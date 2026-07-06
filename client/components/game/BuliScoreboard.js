import { useGame } from '../../context/GameContext'
import styles from '../../styles/BuliScoreboard.module.css'

// Compact buli status shown during play: which buli, hand progress, each
// player's running declaredScore, and their kötelező obligations.
export default function BuliScoreboard() {
  const { state } = useGame()
  const { options, buli, declaredScores, players, myPlayerId } = state

  if (!options?.buli?.on || !buli) return null
  const kotelezoOn = !!options?.kotelezo?.on

  return (
    <div className={styles.bar}>
      <span className={styles.label}>
        Buli #{buli.index} · {buli.handsPlayed}/{buli.handsPerBuli} leosztás
      </span>
      <div className={styles.players}>
        {players.map((p) => {
          const total = declaredScores?.[p.id] ?? 0
          const buliPts = buli.points?.[p.id] ?? 0
          const k = buli.kotelezo?.[p.id] || { ulti: false, betli: false }
          return (
            <span key={p.id} className={styles.player}>
              <span className={styles.name}>{p.id === myPlayerId ? 'Te' : p.name}</span>
              <span className={buliPts >= 0 ? styles.pos : styles.neg}>{buliPts >= 0 ? `+${buliPts}` : buliPts}</span>
              <span className={styles.total}>(össz {total >= 0 ? `+${total}` : total})</span>
              {kotelezoOn && (
                <span className={styles.badges}>
                  <span className={k.ulti ? styles.done : styles.todo}>U</span>
                  <span className={k.betli ? styles.done : styles.todo}>B</span>
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
