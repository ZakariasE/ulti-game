import { useMemo } from 'react'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import { sortHand, strengthMode } from '../../lib/cards'
import CardComponent from './CardComponent'
import styles from '../../styles/PlayerHand.module.css'

export default function PlayerHand({ roomCode }) {
  const { emit } = useSocket()
  const { state } = useGame()
  const { myHand, legalCardIds, phase, currentTurnId, myPlayerId, declarer } = state

  const isMyTurn = phase === 'PLAYING' && currentTurnId === myPlayerId

  // Order by strength; the ranking differs for no-trump contracts (Betli/Durchmars).
  const sorted = useMemo(
    () => sortHand(myHand, strengthMode(declarer?.contract)),
    [myHand, declarer?.contract]
  )

  function playCard(cardId) {
    emit('card:play', { roomCode, cardId })
  }

  return (
    <div className={styles.hand}>
      {sorted.map((card) => {
        const isLegal = legalCardIds.includes(card.id)
        return (
          <CardComponent
            key={card.id}
            card={card}
            highlighted={isMyTurn && isLegal}
            disabled={isMyTurn && !isLegal}
            onClick={isMyTurn && isLegal ? () => playCard(card.id) : undefined}
          />
        )
      })}
    </div>
  )
}
