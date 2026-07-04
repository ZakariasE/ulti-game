import CardComponent from './CardComponent'
import styles from '../../styles/OpponentArea.module.css'

export default function OpponentArea({ player, cardCount, score, isDeclarer, isActive, wonTrick }) {
  const cls = [styles.area, isActive ? styles.active : '', wonTrick ? styles.won : '']
    .filter(Boolean).join(' ')

  return (
    <div className={cls}>
      <div className={styles.name}>
        {player.name}{isDeclarer ? ' 👑' : ''}{isActive ? ' ⏳' : ''}
      </div>
      <div className={styles.score}>Score: {score ?? 0}</div>
      <div className={styles.cards}>
        {Array.from({ length: Math.min(cardCount, 12) }).map((_, i) => (
          <CardComponent key={i} faceDown />
        ))}
      </div>
      {wonTrick && <div className={styles.wonLabel}>won trick</div>}
    </div>
  )
}
