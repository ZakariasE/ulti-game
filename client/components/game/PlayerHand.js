import { useMemo, useState } from 'react'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import { sortHand } from '../../lib/cards'
import { declarationMode } from '../../lib/bids'
import CardComponent from './CardComponent'
import styles from '../../styles/PlayerHand.module.css'

export default function PlayerHand({ roomCode }) {
  const { emit } = useSocket()
  const { state } = useGame()
  const { myHand, legalCardIds, phase, biddingPhase, currentTurnId, myPlayerId,
    declaration, needsOpeningLead, pendingMarriages, talonCardIds } = state

  const [discardSel, setDiscardSel] = useState([])

  // While the opening-lead modal is up, playing happens there, not here.
  const isMyTurn = phase === 'PLAYING' && currentTurnId === myPlayerId && !needsOpeningLead
  // Discarding: the talon holder picks 2 cards straight from the hand.
  const isDiscarding = phase === 'BIDDING' && biddingPhase === 'DISCARD' && currentTurnId === myPlayerId

  // Order by strength; the ranking differs for no-trump contracts (Betli/Durchmars).
  const sorted = useMemo(
    () => sortHand(myHand, declarationMode(declaration)),
    [myHand, declaration]
  )

  function playCard(cardId) {
    // Include any marriages the player toggled (only recorded on their first card).
    emit('card:play', { roomCode, cardId, announcedMarriages: pendingMarriages })
  }

  function toggleDiscard(cardId) {
    setDiscardSel((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : prev.length < 2 ? [...prev, cardId] : prev
    )
  }

  function confirmDiscard() {
    emit('bid:discard', { roomCode, cardIds: discardSel })
    setDiscardSel([])
  }

  return (
    <div className={styles.wrap}>
      {isDiscarding && (
        <div className={styles.discardBar}>
          <span>Válassz 2 lapot, amit eldobsz ({discardSel.length}/2)</span>
          <button
            className={styles.discardBtn}
            disabled={discardSel.length !== 2}
            onClick={confirmDiscard}
          >
            Eldobom ezt a 2 lapot
          </button>
        </div>
      )}
      <div className={styles.hand}>
        {sorted.map((card) => {
          if (isDiscarding) {
            return (
              <CardComponent
                key={card.id}
                card={card}
                size="large"
                selected={discardSel.includes(card.id)}
                fromTalon={talonCardIds.includes(card.id)}
                onClick={() => toggleDiscard(card.id)}
              />
            )
          }
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
    </div>
  )
}
