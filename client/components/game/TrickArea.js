import { useGame } from '../../context/GameContext'
import CardComponent from './CardComponent'
import styles from '../../styles/TrickArea.module.css'

export default function TrickArea() {
  const { state } = useGame()
  const { currentTrick, players, myPlayerId } = state

  return (
    <div className={styles.area}>
      {currentTrick.map(({ playerId, card }) => {
        const player = players.find((p) => p.id === playerId)
        return (
          <div key={playerId} className={styles.playedCard}>
            <CardComponent card={card} />
            <div className={styles.playerName}>
              {player?.name || '?'}{playerId === myPlayerId ? ' (te)' : ''}
            </div>
          </div>
        )
      })}
      {currentTrick.length === 0 && (
        <p className={styles.empty}>Várakozás az első lapra...</p>
      )}
    </div>
  )
}
