import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/RoundResult.module.css'

export default function RoundResult({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { roundResult, scores, players, phase, readyState } = state
  const [clicked, setClicked] = useState(false)

  if (phase !== 'SCORING' || !roundResult) return null

  const declarer = players.find((p) => p.id === roundResult.declarerId)

  function nextRound() {
    setClicked(true)
    emit('round:continue', { roomCode })
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Round Over</h2>
        <p>
          Declarer: <strong>{declarer?.name}</strong> — card points {roundResult.cardTotal}
        </p>

        {roundResult.partiDetail && (
          <div className={styles.parti}>
            <div className={styles.partiTitle}>Parti breakdown</div>
            {[['declarer', 'Declarer'], ['defenders', 'Defenders']].map(([key, label]) => {
              const d = roundResult.partiDetail[key]
              return (
                <div key={key} className={styles.partiLine}>
                  <span className={styles.partiSide}>{label}:</span>{' '}
                  {d.hits} <span className={styles.hu}>ütés</span>
                  {' + '}{d.announcements} <span className={styles.hu}>bemondás</span>
                  {' + '}{d.lastTrick} <span className={styles.hu}>utolsó ütés</span>
                  {d.talon > 0 && <>{' + '}{d.talon} <span className={styles.hu}>talon</span></>}
                  {' = '}<strong>{d.total}</strong>
                </div>
              )
            })}
          </div>
        )}

        <table className={styles.scoreTable}>
          <thead>
            <tr><th>Component</th><th>Result</th><th>Stake</th></tr>
          </thead>
          <tbody>
            {roundResult.components.map((c) => (
              <tr key={c.key}>
                <td>{c.label}</td>
                <td className={c.won ? styles.win : styles.loss}>{c.won ? 'won' : 'lost'}</td>
                <td>{c.basePoints}{c.kontraLevel > 1 ? ` ×${c.kontraLevel}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

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

        {clicked ? (
          <p className={styles.waiting}>
            Waiting for other players
            {readyState ? ` (${readyState.readyCount}/${readyState.total} ready)` : '...'}
          </p>
        ) : (
          <button className={styles.btn} onClick={nextRound}>
            Next Round
          </button>
        )}
      </div>
    </div>
  )
}
