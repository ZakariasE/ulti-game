import { useMemo } from 'react'
import { useGame } from '../../context/GameContext'
import { sortHand } from '../../lib/cards'
import CardComponent from './CardComponent'
import styles from '../../styles/RevealedHand.module.css'

// The declarer's original 5-card hand, revealed for a required ulti.
export default function FelkezesReveal() {
  const { state } = useGame()
  const { felkezesReveal, players, myPlayerId } = state

  const sorted = useMemo(
    () => (felkezesReveal ? sortHand(felkezesReveal.cards, 'trump') : []),
    [felkezesReveal]
  )
  if (!felkezesReveal) return null

  const p = players.find((pl) => pl.id === felkezesReveal.playerId)
  const name = felkezesReveal.playerId === myPlayerId ? 'Te' : (p?.name || '?')

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>Kötelező ulti — {name} eredeti 5 lapja</div>
      <div className={styles.cards}>
        {sorted.map((card) => (
          <CardComponent key={card.id} card={card} size="small" />
        ))}
      </div>
    </div>
  )
}
