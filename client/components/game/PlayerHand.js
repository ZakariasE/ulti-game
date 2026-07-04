import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import CardComponent from './CardComponent'
import styles from '../../styles/PlayerHand.module.css'

export default function PlayerHand({ roomCode }) {
  const { emit } = useSocket()
  const { state } = useGame()
  const { myHand, legalCardIds, phase, bidding, myPlayerId } = state

  const isMyTurn = phase === 'PLAYING' && bidding?.currentBidderId === myPlayerId

  function playCard(cardId) {
    emit('card:play', { roomCode, cardId })
  }

  return (
    <div className={styles.hand}>
      {myHand.map((card) => {
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
