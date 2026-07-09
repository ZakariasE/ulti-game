import { useEffect, useState } from 'react'
import { useGame } from '../../context/GameContext'
import { CARD_BACK_IMAGE } from '../../lib/cards'
import styles from '../../styles/DrawScreen.module.css'

// Shown once, before the first buli: a short shuffle animation that then reveals
// the (randomized) seat order and who deals first. Pure client overlay — the
// table is already live underneath; dismissing it just uncovers the table.
export default function DrawScreen() {
  const { state, dispatch } = useGame()
  const { draw, myPlayerId } = state
  const [revealed, setRevealed] = useState(false)

  // Shuffle for a beat, then reveal the order.
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 2200)
    return () => clearTimeout(t)
  }, [])

  if (!draw) return null

  const dismiss = () => dispatch({ type: 'DRAW_DISMISS' })
  const nameOf = (id, name) => (id === myPlayerId ? `${name} (te)` : name)

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        {!revealed ? (
          <>
            <h2 className={styles.title}>Keverés…</h2>
            <div className={styles.deck}>
              {[0, 1, 2, 3, 4].map((i) => (
                <img
                  key={i}
                  className={styles.shuffleCard}
                  style={{ animationDelay: `${i * 0.12}s` }}
                  src={CARD_BACK_IMAGE}
                  alt=""
                  draggable={false}
                />
              ))}
            </div>
            <p className={styles.sub}>Sorsolás: ki hol ül és ki oszt először</p>
          </>
        ) : (
          <>
            <h2 className={styles.title}>Sorrend</h2>
            <ol className={styles.order}>
              {draw.order.map((p, i) => {
                const isDealer = p.id === draw.firstDealerId
                const isFirst = p.id === draw.firstBidderId
                return (
                  <li
                    key={p.id}
                    className={`${styles.seat} ${isDealer ? styles.dealer : ''}`}
                    style={{ animationDelay: `${i * 0.18}s` }}
                  >
                    <span className={styles.seatNum}>{i + 1}.</span>
                    <span className={styles.seatName}>{nameOf(p.id, p.name)}</span>
                    <span className={styles.tags}>
                      {isDealer && <span className={styles.tagDealer}>osztó</span>}
                      {isFirst && <span className={styles.tagFirst}>elsőként licitál</span>}
                    </span>
                  </li>
                )
              })}
            </ol>
            <button className={styles.go} onClick={dismiss}>Kezdjük!</button>
          </>
        )}
      </div>
    </div>
  )
}
