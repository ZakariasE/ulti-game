import { useState, useEffect } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/RoundResult.module.css'

// Shown when a buli ends: per-player buli points, kötelező penalties, premium,
// and running declaredScores. Offers the next buli (needs all players to agree,
// like the next-hand button) or the final settlement.
export default function BuliResult({ roomCode, onElszamolas }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { phase, buli, players, declaredScores, readyState } = state
  const [clicked, setClicked] = useState(false)

  // Reset the latch whenever a fresh buli result arrives.
  useEffect(() => { setClicked(false) }, [buli?.result])

  if (phase !== 'BULI_OVER' || !buli?.result) return null
  const r = buli.result

  function nextBuli() {
    setClicked(true)
    emit('buli:next', { roomCode })
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Buli vége (#{r.index})</h2>

        <table className={styles.scoreTable}>
          <thead>
            <tr><th>Játékos</th><th>Buli pont</th><th>Büntetés</th><th>Prémium</th><th>Összesen</th></tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const pen = r.penalties[p.id] || 0
              const prem = r.premiums[p.id] || 0
              const total = declaredScores[p.id] ?? 0
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{r.points[p.id] ?? 0}</td>
                  <td className={pen < 0 ? styles.neg : ''}>{pen || ''}</td>
                  <td className={prem > 0 ? styles.pos : prem < 0 ? styles.neg : ''}>{prem > 0 ? `+${prem}` : prem || ''}</td>
                  <td className={total >= 0 ? styles.pos : styles.neg}>{total >= 0 ? `+${total}` : total}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {clicked ? (
          <p className={styles.waiting}>
            Várakozás a többi játékosra
            {readyState ? ` (${readyState.readyCount}/${readyState.total} kész)` : '...'}
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button className={styles.btn} onClick={nextBuli}>Következő buli</button>
            {onElszamolas && <button className={styles.btn} onClick={onElszamolas}>Elszámolás</button>}
          </div>
        )}
      </div>
    </div>
  )
}
