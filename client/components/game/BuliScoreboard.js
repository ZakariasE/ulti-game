import { useGame } from '../../context/GameContext'
import { sideNet } from '../../lib/bids'
import styles from '../../styles/BuliScoreboard.module.css'

// Compact buli status shown during play: which buli, hand progress, each
// player's running declaredScore, their individual-kontra side balance, and
// their kötelező obligations.
export default function BuliScoreboard() {
  const { state } = useGame()
  const { options, buli, declaredScores, sidePairs, players, myPlayerId, phase } = state

  if (!options?.buli?.on || !buli) return null
  const kotelezoOn = !!options?.kotelezo?.on
  // Show the hand currently in progress (1-indexed); during scoring show the one
  // just finished.
  const handNo = phase === 'BIDDING' || phase === 'PLAYING'
    ? Math.min(buli.handsPlayed + 1, buli.handsPerBuli)
    : buli.handsPlayed

  return (
    <div className={styles.bar}>
      <span className={styles.label}>
        Buli #{buli.index} · {handNo}/{buli.handsPerBuli} leosztás
      </span>
      <div className={styles.players}>
        {players.map((p) => {
          const total = declaredScores?.[p.id] ?? 0
          const buliPts = buli.points?.[p.id] ?? 0
          const side = sideNet(sidePairs, p.id) // individual-kontra side balance
          const k = buli.kotelezo?.[p.id] || { ulti: false, betli: false }
          return (
            <span key={p.id} className={styles.player}>
              <span className={styles.side} title="Egyéni kontra egyenleg (betli/durchmars kontrákból)">
                {side !== 0 ? <span className={side > 0 ? styles.pos : styles.neg}>↔ {side > 0 ? `+${side}` : side}</span> : ''}
              </span>
              <span className={styles.playerRow}>
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
            </span>
          )
        })}
      </div>
    </div>
  )
}
