import { useMemo } from 'react'
import { useGame } from '../../context/GameContext'
import { sortHand, strengthMode } from '../../lib/cards'
import CardComponent from './CardComponent'
import styles from '../../styles/RevealedHand.module.css'

export default function RevealedHand() {
  const { state } = useGame()
  const { revealedHand, declarer, players } = state

  const sorted = useMemo(
    () => (revealedHand ? sortHand(revealedHand, strengthMode(declarer?.contract)) : []),
    [revealedHand, declarer?.contract]
  )

  if (!revealedHand) return null
  const declarerName = players.find((p) => p.id === declarer?.id)?.name

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>{declarerName}'s hand (open)</div>
      <div className={styles.cards}>
        {sorted.map((card) => (
          <CardComponent key={card.id} card={card} />
        ))}
      </div>
    </div>
  )
}
