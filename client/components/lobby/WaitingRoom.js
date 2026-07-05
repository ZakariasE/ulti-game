import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/WaitingRoom.module.css'

export default function WaitingRoom({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { players, myPlayerId } = state
  const isHost = players[0]?.id === myPlayerId
  const canStart = players.length === 3

  function copyCode() {
    navigator.clipboard.writeText(roomCode)
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Várakozás játékosokra...</h1>

      <div className={styles.roomCode}>
        <span className={styles.code}>{roomCode}</span>
        <button className={styles.copyBtn} onClick={copyCode}>Másolás</button>
      </div>
      <p className={styles.hint}>Oszd meg ezt a kódot 2 baráttal</p>

      <div className={styles.playerList}>
        <h3>Játékosok ({players.length} / 3)</h3>
        {players.map((p) => (
          <div key={p.id} className={styles.player}>
            <span className={styles.dot}>●</span>
            {p.name} {p.id === myPlayerId ? '(te)' : ''}
          </div>
        ))}
        {Array.from({ length: 3 - players.length }).map((_, i) => (
          <div key={`empty-${i}`} className={`${styles.player} ${styles.empty}`}>
            <span className={styles.dot}>○</span>
            várakozás...
          </div>
        ))}
      </div>

      {isHost && (
        <button
          className={styles.startBtn}
          disabled={!canStart}
          onClick={() => emit('game:start', { roomCode })}
        >
          {canStart ? 'Játék indítása' : `Még ${3 - players.length} játékos kell...`}
        </button>
      )}
      {!isHost && <p className={styles.hint}>Várakozás, míg a házigazda elindítja...</p>}
    </div>
  )
}
