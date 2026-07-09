import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import CardComponent from './CardComponent'
import styles from '../../styles/TrickPile.module.css'

// A little stack of won tricks shown in front of a player. Hovering reveals the
// captured cards grouped by trick — but only for piles on the viewer's side.
export default function TrickPile({ ownerId, revealable, align = 'center', drop = 'up' }) {
  const { state } = useGame()
  const [open, setOpen] = useState(false)

  // Keep the global trick number so the reveal shows which trick each set of 3 was.
  const tricks = state.completedTricks
    .map((t, i) => ({ ...t, num: i + 1 }))
    .filter((t) => t.winnerId === ownerId)

  if (tricks.length === 0) return null

  return (
    <div
      className={styles.pile}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className={styles.stack}>
        {tricks.map((_, i) => (
          <div key={i} className={styles.stackCard} style={{ left: i * 4, top: i * 2 }} />
        ))}
      </div>
      <div className={styles.count}>{tricks.length} ütés</div>

      {open && revealable && (
        <div className={`${styles.popover} ${styles[align]} ${styles[drop]}`}>
          <div className={styles.popTitle}>Megnyert ütések</div>
          <div className={styles.groups}>
            {tricks.map((t) => (
              <div key={t.num} className={styles.group}>
                <div className={styles.groupLabel}>#{t.num}</div>
                <div className={styles.groupCards}>
                  {t.cards.map((c) => (
                    <CardComponent key={c.card.id} card={c.card} size="small" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
