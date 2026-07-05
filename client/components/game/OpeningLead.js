import { useState, useMemo } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { sortHand, SUIT_NAMES } from '../../lib/cards'
import { declarationMode } from '../../lib/bids'
import CardComponent from './CardComponent'
import styles from '../../styles/OpeningLead.module.css'

const MINOR_SUITS = ['makk', 'zold', 'tok']

export default function OpeningLead({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { needsOpeningLead, currentTurnId, myPlayerId, declaration, myHand, openingInfo } = state

  const [trump, setTrump] = useState(declaration?.color === 'red' ? 'piros' : null)
  const [marriages, setMarriages] = useState([])

  const show = needsOpeningLead && currentTurnId === myPlayerId
  const sorted = useMemo(() => sortHand(myHand, declarationMode(declaration)), [myHand, declaration])
  if (!show) return null

  const needTrump = openingInfo?.needTrump
  const available = openingInfo?.availableMarriages || []
  const effectiveTrump = declaration?.color === 'red' ? 'piros' : trump
  const canLead = !needTrump || !!trump

  function toggleMarriage(suit) {
    setMarriages((prev) => (prev.includes(suit) ? prev.filter((s) => s !== suit) : [...prev, suit]))
  }

  function lead(cardId) {
    if (!canLead) return
    emit('play:firstLead', { roomCode, cardId, trumpSuit: effectiveTrump, announcedMarriages: marriages })
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Opening lead</h2>

        {needTrump && (
          <div className={styles.block}>
            <div className={styles.label}>Choose trump suit</div>
            <div className={styles.row}>
              {MINOR_SUITS.map((s) => (
                <button
                  key={s}
                  className={`${styles.pick} ${trump === s ? styles.on : ''}`}
                  onClick={() => setTrump(s)}
                >
                  {SUIT_NAMES[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {available.length > 0 && (
          <div className={styles.block}>
            <div className={styles.label}>Announce marriages (optional)</div>
            <div className={styles.row}>
              {available.map((s) => {
                const value = s === effectiveTrump ? 40 : 20
                return (
                  <button
                    key={s}
                    className={`${styles.pick} ${marriages.includes(s) ? styles.on : ''}`}
                    onClick={() => toggleMarriage(s)}
                  >
                    {SUIT_NAMES[s]} +{value}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className={styles.label}>
          {canLead ? 'Click a card to lead it' : 'Pick a trump suit first'}
        </div>
        <div className={styles.hand}>
          {sorted.map((card) => (
            <CardComponent
              key={card.id}
              card={card}
              highlighted={canLead}
              disabled={!canLead}
              onClick={canLead ? () => lead(card.id) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
