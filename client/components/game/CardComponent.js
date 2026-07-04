import SuitIcon from './SuitIcon'
import { RANK_LABEL, SUIT_COLORS, PIP_LAYOUTS, isCourt } from '../../lib/cards'
import styles from '../../styles/Card.module.css'

function CardFace({ card }) {
  const color = SUIT_COLORS[card.suit]
  const label = RANK_LABEL[card.rank]

  const corner = (extraClass) => (
    <div className={`${styles.corner} ${extraClass}`} style={{ color }}>
      <div className={styles.rank}>{label}</div>
      <SuitIcon suit={card.suit} size={11} />
    </div>
  )

  let center
  if (card.rank === 'asz') {
    center = <div className={styles.centerBig}><SuitIcon suit={card.suit} size={40} /></div>
  } else if (isCourt(card.rank)) {
    center = (
      <div className={styles.court} style={{ borderColor: color }}>
        <div className={styles.courtLetter} style={{ color }}>{label}</div>
        <SuitIcon suit={card.suit} size={22} />
      </div>
    )
  } else {
    const pips = PIP_LAYOUTS[card.rank] || []
    center = (
      <div className={styles.pipGrid}>
        {pips.map(([col, row], i) => (
          <div
            key={i}
            className={styles.pip}
            style={{ left: `${col * 50}%`, top: `${(row / 4) * 100}%` }}
          >
            <SuitIcon suit={card.suit} size={15} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {corner(styles.topLeft)}
      {center}
      {corner(styles.bottomRight)}
    </>
  )
}

export default function CardComponent({ card, faceDown, highlighted, selected, onClick, disabled }) {
  if (faceDown) {
    return <div className={styles.cardBack} />
  }

  const classes = [
    styles.card,
    highlighted ? styles.highlighted : '',
    selected ? styles.selected : '',
    disabled ? styles.disabled : '',
    onClick && !disabled ? styles.clickable : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} onClick={!disabled ? onClick : undefined}>
      <CardFace card={card} />
    </div>
  )
}
