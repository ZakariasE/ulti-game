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
    declaration, trumpSuit, pendingTrump, needsOpeningLead, pendingMarriages,
    pendingKontra, talonCardIds } = state

  const [discardSel, setDiscardSel] = useState([])

  const myPlayTurn = phase === 'PLAYING' && currentTurnId === myPlayerId
  // The declarer's very first card is the opening lead (played inline now).
  const openingLead = myPlayTurn && needsOpeningLead
  const needTrump = declaration && !declaration.isNoTrump && declaration.color === 'normal'
  const effectiveTrump = trumpSuit || pendingTrump
  const trumpReady = !needTrump || !!pendingTrump
  const canPlay = myPlayTurn && (!openingLead || trumpReady)
  // Discarding: the talon holder picks 2 cards straight from the hand.
  const isDiscarding = phase === 'BIDDING' && biddingPhase === 'DISCARD' && currentTurnId === myPlayerId

  // Order by strength; the ranking differs for no-trump contracts (Betli/Durchmars).
  const sorted = useMemo(
    () => sortHand(myHand, declarationMode(declaration)),
    [myHand, declaration]
  )

  function playCard(cardId) {
    // Marriages announced (first card) and kontra staged this turn are finalized
    // only now, when the card is actually played.
    if (openingLead) {
      emit('play:firstLead', {
        roomCode, cardId, trumpSuit: effectiveTrump,
        announcedMarriages: pendingMarriages, kontra: pendingKontra,
      })
    } else {
      emit('card:play', { roomCode, cardId, announcedMarriages: pendingMarriages, kontra: pendingKontra })
    }
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
              hoverable
              highlighted={canPlay && isLegal}
              disabled={canPlay && !isLegal}
              onClick={canPlay && isLegal ? () => playCard(card.id) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
