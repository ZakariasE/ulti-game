import CardComponent from './CardComponent'
import TrickPile from './TrickPile'
import styles from '../../styles/OpponentArea.module.css'

export default function OpponentArea({ player, cardCount, score, isDeclarer, isActive, wonTrick, revealable, revealedCards, marriages }) {
  const cls = [styles.area, isActive ? styles.active : '', wonTrick ? styles.won : '']
    .filter(Boolean).join(' ')
  // Terített: show this player's actual cards (face-up, larger) instead of backs.
  const revealed = revealedCards && revealedCards.length > 0

  return (
    <div className={cls}>
      <div className={styles.name}>
        {player.name}{isDeclarer ? ' 👑' : ''}{isActive ? ' ⏳' : ''}
      </div>
      <div className={styles.score}>Pont: {score ?? 0}</div>
      {marriages ? <div className={styles.marriage}>{marriages}</div> : null}
      <div className={`${styles.cards} ${revealed ? styles.revealed : ''}`}>
        {revealed
          ? revealedCards.map((card) => (
              <CardComponent key={card.id} card={card} size="small" />
            ))
          : Array.from({ length: Math.min(cardCount, 12) }).map((_, i) => (
              <CardComponent key={i} faceDown size="tiny" />
            ))}
      </div>
      {wonTrick && <div className={styles.wonLabel}>vitte az ütést</div>}
      <TrickPile ownerId={player.id} revealable={revealable} align="center" drop="down" />
    </div>
  )
}
