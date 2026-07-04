import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/RoundResult.module.css'

export default function RoundResult({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { roundResult, scores, players, phase } = state

  if (phase !== 'SCORING' || !roundResult) return null

  const declarer = players.find((p) => p.id === roundResult.declarerId)

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Round Over</h2>
        <p>
          Contract: <strong>{roundResult.contract}</strong>
          {roundResult.trumpSuit ? ` (${roundResult.trumpSuit})` : ''}
        </p>
        <p>
          Declarer: <strong>{declarer?.name}</strong> —{' '}
          <span className={roundResult.won ? styles.win : styles.loss}>
            {roundResult.won ? 'WON' : 'LOST'}
          </span>
        </p>

        <table className={styles.scoreTable}>
          <thead>
            <tr><th>Player</th><th>Change</th><th>Total</th></tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const delta = roundResult.deltas[p.id] || 0
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className={delta >= 0 ? styles.pos : styles.neg}>
                    {delta >= 0 ? '+' : ''}{delta}
                  </td>
                  <td>{scores[p.id] ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <button className={styles.btn} onClick={() => emit('round:continue', { roomCode })}>
          Next Round
        </button>
      </div>
    </div>
  )
}
