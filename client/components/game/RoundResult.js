import { useState, useEffect } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/RoundResult.module.css'

export default function RoundResult({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { roundResult, scores, players, phase, readyState, options, declaredScores } = state
  const [clicked, setClicked] = useState(false)
  const buliMode = !!options?.buli?.on

  // This component never unmounts between rounds, so reset the "clicked" latch
  // whenever a new round's result arrives — otherwise the Next button stays
  // hidden and every round after the first is stuck on "waiting".
  useEffect(() => { setClicked(false) }, [roundResult])

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

        {roundResult.ultiBonus && (
          <p className={styles.pos}>
            Kötelező ulti bónusz (kevés adu): +{roundResult.ultiBonus.amount}
          </p>
        )}

        {roundResult.partiDetail && (
          <div className={styles.parti}>
            <div className={styles.partiTitle}>Parti részletezés</div>
            {[['declarer', 'Felvevő'], ['defenders', 'Ellenfelek']].map(([key, label]) => {
              const d = roundResult.partiDetail[key]
              if (!d) return null
              return (
                <div key={key} className={styles.partiLine}>
                  <span className={styles.partiSide}>{label}:</span>{' '}
                  {d.hits} <span className={styles.hu}>ütés</span>
                  {' + '}{d.announcements} <span className={styles.hu}>jelentés</span>
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
                <td>{c.basePoints}{c.kontraLevel > 1 ? ` ×${c.kontraLevel}` : ''}{c.hundred ? ' ×2 (100)' : ''}{roundResult.stakeMultiplier > 1 ? ` ×${roundResult.stakeMultiplier}` : ''}</td>
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
              // In buli mode only the declarer's points are tracked.
              const delta = buliMode
                ? (p.id === roundResult.declarerId ? (roundResult.deltas[p.id] || 0) : 0)
                : (roundResult.deltas[p.id] || 0)
              const total = buliMode ? (declaredScores[p.id] ?? 0) : (scores[p.id] ?? 0)
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className={delta >= 0 ? styles.pos : styles.neg}>
                    {delta >= 0 ? '+' : ''}{delta}
                  </td>
                  <td>{total}</td>
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
