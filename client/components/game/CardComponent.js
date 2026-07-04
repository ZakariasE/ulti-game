import { cardImage, CARD_BACK_IMAGE } from '../../lib/cards'
import styles from '../../styles/Card.module.css'

export default function CardComponent({ card, faceDown, highlighted, selected, onClick, disabled }) {
  if (faceDown) {
    return <img className={styles.cardBack} src={CARD_BACK_IMAGE} alt="card back" draggable={false} />
  }

  const classes = [
    styles.card,
    highlighted ? styles.highlighted : '',
    selected ? styles.selected : '',
    disabled ? styles.disabled : '',
    onClick && !disabled ? styles.clickable : '',
  ].filter(Boolean).join(' ')

  return (
    <img
      className={classes}
      src={cardImage(card)}
      alt={`${card.suit} ${card.rank}`}
      draggable={false}
      onClick={!disabled ? onClick : undefined}
    />
  )
}
