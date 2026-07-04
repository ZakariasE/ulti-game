import { useState, useMemo } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { sortHand } from '../../lib/cards'
import CardComponent from './CardComponent'
import styles from '../../styles/TalonView.module.css'

export default function TalonView({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { myHand, biddingPhase, currentTurnId, myPlayerId } = state
  const [selected, setSelected] = useState([])
  const sorted = useMemo(() => sortHand(myHand, 'trump'), [myHand])

  const shouldShow = biddingPhase === 'DISCARD' && currentTurnId === myPlayerId
  if (!shouldShow) return null

  function toggleCard(cardId) {
    setSelected((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : prev.length < 2 ? [...prev, cardId] : prev
    )
  }

  function confirm() {
    emit('bid:discard', { roomCode, cardIds: selected })
    setSelected([])
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Discard 2 cards</h2>
        <p>You hold the talon (12 cards). Choose 2 to set aside, then declare a contract. ({selected.length}/2)</p>
        <div className={styles.hand}>
          {sorted.map((card) => (
            <CardComponent
              key={card.id}
              card={card}
              selected={selected.includes(card.id)}
              onClick={() => toggleCard(card.id)}
            />
          ))}
        </div>
        <button className={styles.confirmBtn} disabled={selected.length !== 2} onClick={confirm}>
          Discard these 2
        </button>
      </div>
    </div>
  )
}
