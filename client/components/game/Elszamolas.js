import { useGame } from '../../context/GameContext'
import { sideNet } from '../../lib/bids'
import styles from '../../styles/RoundResult.module.css'

// Final settlement: turns the declaredScores standings into pairwise money owed,
// using the lobby stake. net_i = Σ_{j≠i}(S_i − S_j) × stake, PLUS the individual-
// kontra side-ledger (sidePairs — genuinely pairwise, added directly, not via the
// all-pairs expansion). Both are ×stake. Zero-sum.
export default function Elszamolas({ onClose }) {
  const { state } = useGame()
  const { players, declaredScores, sidePairs, options, myPlayerId } = state
  const stake = options?.stake ?? 1
  const S = (id) => declaredScores?.[id] ?? 0
  const n = players.length
  const sum = players.reduce((s, p) => s + S(p.id), 0)
  const sideOf = (id) => sideNet(sidePairs, id) // raw side balance (unscaled)
  const net = (id) => (n * S(id) - sum + sideOf(id)) * stake

  // Directed side amount a owes b (raw), from the sorted-key sidePairs map.
  const sideAOwesB = (a, b) => {
    const [k0, k1] = [a.id, b.id].sort()
    const v = (sidePairs || {})[`${k0}|${k1}`] || 0
    return a.id === k0 ? v : -v
  }

  // Pairwise: base standings difference (b pays a when a is higher) merged with
  // the side-ledger, all × stake.
  const pairs = []
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]
      const b = players[j]
      // Positive → a pays b: base (S_b − S_a) plus side (a owes b).
      const aToB = ((S(b.id) - S(a.id)) + sideAOwesB(a, b)) * stake
      if (aToB > 0) pairs.push({ from: a, to: b, amount: aToB })
      else if (aToB < 0) pairs.push({ from: b, to: a, amount: -aToB })
    }
  }
  const name = (p) => (p.id === myPlayerId ? 'Te' : p.name)
  const anySide = players.some((p) => sideOf(p.id) !== 0)

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Elszámolás</h2>
        <p>Tét: {stake} / pont</p>

        <table className={styles.scoreTable}>
          <thead>
            <tr><th>Játékos</th><th>Pont</th>{anySide && <th>Kontra</th>}<th>Egyenleg</th></tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const m = net(p.id)
              const sd = sideOf(p.id)
              return (
                <tr key={p.id}>
                  <td>{name(p)}</td>
                  <td>{S(p.id)}</td>
                  {anySide && <td className={sd > 0 ? styles.pos : sd < 0 ? styles.neg : ''}>{sd ? (sd > 0 ? `+${sd}` : sd) : ''}</td>}
                  <td className={m >= 0 ? styles.pos : styles.neg}>{m >= 0 ? `+${m}` : m}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div>
          <div className={styles.partiTitle}>Ki kinek fizet</div>
          {pairs.length ? pairs.map((pr, i) => (
            <div key={i} className={styles.partiLine}>
              <strong>{name(pr.from)}</strong> → <strong>{name(pr.to)}</strong>: {pr.amount}
            </div>
          )) : <div className={styles.partiLine}>Senki nem tartozik (döntetlen).</div>}
        </div>

        <button className={styles.btn} onClick={onClose}>Vissza</button>
      </div>
    </div>
  )
}
