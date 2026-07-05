import { useMemo } from 'react'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import { sortHand } from '../../lib/cards'
import { declarationMode } from '../../lib/bids'
import CardComponent from './CardComponent'
import styles from '../../styles/PlayerHand.module.css'

export default function PlayerHand({ roomCode }) {
  const { emit } = useSocket()
  const { state } = useGame()
  const { myHand, legalCardIds, phase, currentTurnId, myPlayerId, declaration,
    needsOpeningLead, pendingMarriages } = state

  // While the opening-lead modal is up, playing happens there, not here.
  const isMyTurn = phase === 'PLAYING' && currentTurnId === myPlayerId && !needsOpeningLead

  // Order by strength; the ranking differs for no-trump contracts (Betli/Durchmars).
  const sorted = useMemo(
    () => sortHand(myHand, declarationMode(declaration)),
    [myHand, declaration]
  )

  function playCard(cardId) {
    // Include any marriages the player toggled (only recorded on their first card).
    emit('card:play', { roomCode, cardId, announcedMarriages: pendingMarriages })
  }

  return (
    <div className={styles.hand}>
      {sorted.map((card) => {
        const isLegal = legalCardIds.includes(card.id)
        return (
          <CardComponent
            key={card.id}
            card={card}
            size="large"
            highlighted={isMyTurn && isLegal}
            disabled={isMyTurn && !isLegal}
            onClick={isMyTurn && isLegal ? () => playCard(card.id) : undefined}
          />
        )
      })}
    </div>
  )
}
