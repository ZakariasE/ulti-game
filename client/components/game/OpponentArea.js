import CardComponent from './CardComponent'
import styles from '../../styles/OpponentArea.module.css'

export default function OpponentArea({ player, cardCount, score }) {
  return (
    <div className={styles.area}>
      <div className={styles.name}>{player.name}</div>
      <div className={styles.score}>Score: {score ?? 0}</div>
      <div className={styles.cards}>
        {Array.from({ length: Math.min(cardCount, 10) }).map((_, i) => (
          <CardComponent key={i} faceDown />
        ))}
      </div>
    </div>
  )
}
