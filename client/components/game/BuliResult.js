import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/RoundResult.module.css'

// Shown when a buli ends: per-player buli points, premium, kötelező penalties,
// and running declaredScores. Offers the next buli or the final settlement.
export default function BuliResult({ roomCode, onElszamolas }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { phase, buli, players, declaredScores } = state

  if (phase !== 'BULI_OVER' || !buli?.result) return null
  const r = buli.result

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Buli vége (#{r.index})</h2>

        <table className={styles.scoreTable}>
          <thead>
            <tr><th>Játékos</th><th>Buli pont</th><th>Prémium</th><th>Büntetés</th><th>Összesen</th></tr>
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
                  <td className={prem > 0 ? styles.pos : prem < 0 ? styles.neg : ''}>{prem > 0 ? `+${prem}` : prem || ''}</td>
                  <td className={pen < 0 ? styles.neg : ''}>{pen || ''}</td>
                  <td className={total >= 0 ? styles.pos : styles.neg}>{total >= 0 ? `+${total}` : total}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button className={styles.btn} onClick={() => emit('buli:next', { roomCode })}>Következő buli</button>
          {onElszamolas && <button className={styles.btn} onClick={onElszamolas}>Elszámolás</button>}
        </div>
      </div>
    </div>
  )
}
