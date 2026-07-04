import styles from '../../styles/Card.module.css'

const SUIT_SYMBOLS = { piros: '♥', makk: '♣', zold: '♠', tok: '♦' }
const SUIT_NAMES = { piros: 'Piros', makk: 'Makk', zold: 'Zöld', tok: 'Tök' }
const RANK_DISPLAY = {
  asz: 'A', kiraly: 'K', felso: 'F', also: 'U',
  '10': '10', '9': '9', '8': '8', '7': '7',
}

export default function CardComponent({ card, faceDown, highlighted, selected, onClick, disabled }) {
  if (faceDown) {
    return <div className={styles.cardBack} />
  }

  const isRed = card.suit === 'piros' || card.suit === 'tok'
  const classes = [
    styles.card,
    isRed ? styles.red : styles.black,
    highlighted ? styles.highlighted : '',
    selected ? styles.selected : '',
    disabled ? styles.disabled : '',
    onClick && !disabled ? styles.clickable : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} onClick={!disabled ? onClick : undefined}>
      <div className={styles.corner}>
        <div className={styles.rank}>{RANK_DISPLAY[card.rank]}</div>
        <div className={styles.suit}>{SUIT_SYMBOLS[card.suit]}</div>
      </div>
      <div className={styles.center}>{SUIT_SYMBOLS[card.suit]}</div>
      <div className={`${styles.corner} ${styles.bottomRight}`}>
        <div className={styles.rank}>{RANK_DISPLAY[card.rank]}</div>
        <div className={styles.suit}>{SUIT_SYMBOLS[card.suit]}</div>
      </div>
    </div>
  )
}
