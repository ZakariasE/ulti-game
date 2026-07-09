import { useMemo } from 'react'
import { useGame } from '../../context/GameContext'
import { sortHand } from '../../lib/cards'
import { declarationMode } from '../../lib/bids'
import CardComponent from './CardComponent'
import styles from '../../styles/RevealedHand.module.css'

export default function RevealedHand() {
  const { state } = useGame()
  const { revealedHand, declaration, declarerId, players } = state

  const sorted = useMemo(
    () => (revealedHand ? sortHand(revealedHand, declarationMode(declaration)) : []),
    [revealedHand, declaration]
  )

  if (!revealedHand) return null
  const declarerName = players.find((p) => p.id === declarerId)?.name

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>{declarerName} lapjai (terített)</div>
      <div className={styles.cards}>
        {sorted.map((card) => (
          <CardComponent key={card.id} card={card} size="large" />
        ))}
      </div>
    </div>
  )
}
