import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import CardComponent from './CardComponent'
import styles from '../../styles/TalonView.module.css'

export default function TalonView({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { myHand, bidding } = state
  const [selected, setSelected] = useState([])

  if (!bidding?.iHaveTalon || bidding?.discarded) return null

  function toggleCard(cardId) {
    setSelected((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : prev.length < 2 ? [...prev, cardId] : prev
    )
  }

  function confirm() {
    emit('talon:discard', { roomCode, cardIds: selected })
    setSelected([])
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>You took the talon!</h2>
        <p>Select 2 cards to discard ({selected.length}/2 selected)</p>
        <div className={styles.hand}>
          {myHand.map((card) => (
            <CardComponent
              key={card.id}
              card={card}
              selected={selected.includes(card.id)}
              highlighted={selected.length < 2 && !selected.includes(card.id)}
              onClick={() => toggleCard(card.id)}
            />
          ))}
        </div>
        <button
          className={styles.confirmBtn}
          disabled={selected.length !== 2}
          onClick={confirm}
        >
          Confirm Discard
        </button>
      </div>
    </div>
  )
}
