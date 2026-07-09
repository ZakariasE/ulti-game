import { useState, useEffect } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/RoundResult.module.css'

// Hungarian word for a redeal multiplier (all-pass félkez redeals double the
// whole hand's final score — applied only here, never in the bid's rank).
const REDEAL_WORDS = { 2: 'dupla', 4: 'négyszeres', 8: 'nyolcszoros', 16: 'tizenhatszoros', 32: 'harminckétszeres' }
const redealWord = (n) => REDEAL_WORDS[n] || `${n}-szeres`

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
            <tr><th>Bemondás</th><th>Eredmény</th><th>Tét</th><th className={styles.numCol}>Érték</th></tr>
          </thead>
          <tbody>
            {roundResult.components.map((c) => (
              <tr key={c.key}>
                <td>
                  {c.label}{c.hozam ? ' (hozám)' : ''}
                  {c.individual && c.perDefender && (
                    <span className={styles.hu}>
                      {' '}— egyéni kontra: {c.perDefender.map((d) => {
                        const nm = players.find((p) => p.id === d.id)?.name || '?'
                        return `${nm} ×${d.level}`
                      }).join(', ')}
                    </span>
                  )}
                </td>
                <td className={c.won ? styles.win : styles.loss}>
                  {c.flat ? 'bónusz' : (c.won ? 'nyert' : 'vesztett')}
                </td>
                <td>
                  {c.flat
                    ? '—'
                    : c.csendes
                      // Csendes doubles on a DEFEATED attempt, which can coincide with a
                      // declarer win (a defender's failed attempt) — so show ×2 (bukó)
                      // whenever the attempt failed, not only on a declarer loss.
                      ? <>{c.basePoints}{c.attemptFailed ? ' ×2 (bukó)' : ''}{c.redealMult > 1 ? ` ×${c.redealMult} (${redealWord(c.redealMult)})` : ''}</>
                      : <>{c.basePoints}{c.kontraLevel > 1 ? ` ×${c.kontraLevel}` : ''}{c.hundred ? ' ×2 (100)' : ''}{c.mult > 1 ? ` ×${c.mult}` : ''}{c.redealMult > 1 ? ` ×${c.redealMult} (${redealWord(c.redealMult)})` : ''}{!c.won && c.lossMult > 1 ? ` ×${c.lossMult} (bukó)` : ''}</>}
                </td>
                <td className={`${styles.numCol} ${c.delta >= 0 ? styles.pos : styles.neg}`}>
                  {c.delta >= 0 ? '+' : ''}{c.delta}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {(() => {
              // Per-defender total (the sum of the Érték column) — NOT the pairwise
              // amount. The per-player table below shows the actual balance change.
              const net = roundResult.declarerRaw || 0
              return (
                <tr className={styles.totalRow}>
                  <td>Összesen (felvevő)</td>
                  <td className={net >= 0 ? styles.win : styles.loss}>{net >= 0 ? 'nyert' : 'vesztett'}</td>
                  <td></td>
                  <td className={`${styles.numCol} ${net >= 0 ? styles.pos : styles.neg}`}>{net >= 0 ? '+' : ''}{net}</td>
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
              // In buli mode only the declarer's own RAW points are tracked
              // (pairwise is applied at Elszámolás).
              const delta = buliMode
                ? (p.id === roundResult.declarerId ? (roundResult.declarerRaw || 0) : 0)
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
