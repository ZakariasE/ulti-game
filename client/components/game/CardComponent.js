import { cardImage, CARD_BACK_IMAGE } from '../../lib/cards'
import styles from '../../styles/Card.module.css'

// size: 'normal' (default) | 'large' | 'small'
export default function CardComponent({ card, faceDown, highlighted, selected, fromTalon, onClick, disabled, size = 'normal' }) {
  const sizeClass = size === 'large' ? styles.large : size === 'small' ? styles.small : ''

  if (faceDown) {
    return <img className={`${styles.cardBack} ${sizeClass}`} src={CARD_BACK_IMAGE} alt="card back" draggable={false} />
  }

  const classes = [
    styles.card,
    sizeClass,
    highlighted ? styles.highlighted : '',
    selected ? styles.selected : '',
    fromTalon ? styles.fromTalon : '',
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
