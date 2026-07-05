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
        <h2>Leosztás vége</h2>
        <p>
          Felvevő: <strong>{declarer?.name}</strong> — pont: {roundResult.cardTotal}
        </p>

        {roundResult.partiDetail && (
          <div className={styles.parti}>
            <div className={styles.partiTitle}>Parti részletezés</div>
            {[['declarer', 'Felvevő'], ['defenders', 'Ellenfelek']].map(([key, label]) => {
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
            <tr><th>Bemondás</th><th>Eredmény</th><th>Tét</th></tr>
          </thead>
          <tbody>
            {roundResult.components.map((c) => (
              <tr key={c.key}>
                <td>{c.label}</td>
                <td className={c.won ? styles.win : styles.loss}>{c.won ? 'nyert' : 'vesztett'}</td>
                <td>{c.basePoints}{c.kontraLevel > 1 ? ` ×${c.kontraLevel}` : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {(() => {
              const net = roundResult.deltas[roundResult.declarerId] || 0
              return (
                <tr className={styles.totalRow}>
                  <td>Összesen (felvevő)</td>
                  <td className={net >= 0 ? styles.win : styles.loss}>{net >= 0 ? 'nyert' : 'vesztett'}</td>
                  <td className={net >= 0 ? styles.pos : styles.neg}>{net >= 0 ? '+' : ''}{net}</td>
                </tr>
              )
            })()}
          </tfoot>
        </table>

        <table className={styles.scoreTable}>
          <thead>
            <tr><th>Játékos</th><th>Változás</th><th>Egyenleg</th></tr>
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
            Várakozás a többi játékosra
            {readyState ? ` (${readyState.readyCount}/${readyState.total} kész)` : '...'}
          </p>
        ) : (
          <button className={styles.btn} onClick={nextRound}>
            Következő leosztás
          </button>
        )}
      </div>
    </div>
  )
}
