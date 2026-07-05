import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { componentLabel, kontraLevelName } from '../../lib/bids'
import styles from '../../styles/KontraBar.module.css'

function nextName(level) { return kontraLevelName(level * 2) }

export default function KontraBar({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { phase, declaration, kontra, kontraOptions, currentTurnId, myPlayerId } = state

  if (phase !== 'PLAYING' || !declaration) return null

  // Components currently above ×1, for display.
  const doubled = Object.entries(kontra || {}).filter(([, k]) => k.level > 1)
  const myTurn = currentTurnId === myPlayerId
  const options = myTurn ? (kontraOptions || []) : []

  if (doubled.length === 0 && options.length === 0) return null

  return (
    <div className={styles.bar}>
      {doubled.length > 0 && (
        <span className={styles.levels}>
          {doubled.map(([c, k]) => (
            <span key={c} className={styles.levelTag}>
              {componentLabel(c)} ×{k.level}
            </span>
          ))}
        </span>
      )}
      {options.length > 0 && (
        <span className={styles.actions}>
          {options.map((c) => (
            <button
              key={c}
              className={styles.btn}
              onClick={() => emit('kontra:call', { roomCode, components: [c] })}
            >
              {nextName(kontra[c]?.level || 1)} {componentLabel(c)}
            </button>
          ))}
          {options.length > 1 && (
            <button
              className={styles.btnAll}
              onClick={() => emit('kontra:call', { roomCode, components: options })}
            >
              Összes kontra
            </button>
          )}
        </span>
      )}
    </div>
  )
}
