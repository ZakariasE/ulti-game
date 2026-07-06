import { useGame } from '../../context/GameContext'
import styles from '../../styles/RoundResult.module.css'

// Final settlement: turns the declaredScores standings into pairwise money owed,
// using the lobby stake. net_i = Σ_{j≠i}(S_i − S_j) × stake (zero-sum).
export default function Elszamolas({ onClose }) {
  const { state } = useGame()
  const { players, declaredScores, options, myPlayerId } = state
  const stake = options?.stake ?? 1
  const S = (id) => declaredScores?.[id] ?? 0
  const n = players.length
  const sum = players.reduce((s, p) => s + S(p.id), 0)
  const net = (id) => (n * S(id) - sum) * stake

  // Pairwise: the lower score pays the higher the difference × stake.
  const pairs = []
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]
      const b = players[j]
      const diff = (S(a.id) - S(b.id)) * stake
      if (diff > 0) pairs.push({ from: b, to: a, amount: diff })
      else if (diff < 0) pairs.push({ from: a, to: b, amount: -diff })
    }
  }
  const name = (p) => (p.id === myPlayerId ? 'Te' : p.name)

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Elszámolás</h2>
        <p>Tét: {stake} / pont</p>

        <table className={styles.scoreTable}>
          <thead>
            <tr><th>Játékos</th><th>Pont</th><th>Egyenleg</th></tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const m = net(p.id)
              return (
                <tr key={p.id}>
                  <td>{name(p)}</td>
                  <td>{S(p.id)}</td>
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
