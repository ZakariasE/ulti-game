import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/KontraBar.module.css'

// Names for each doubling level.
const LEVEL_NAME = { 2: 'Kontra', 4: 'Rekontra', 8: 'Szubkontra', 16: 'Mordkontra', 32: 'Hirskontra' }

export default function KontraBar({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { phase, declarer, myPlayerId, completedTricks, kontra } = state

  if (phase !== 'PLAYING' || !declarer) return null
  // Kontra is only allowed before the first trick is finished.
  const open = completedTricks.length === 0

  const isDeclarer = declarer.id === myPlayerId
  const party = isDeclarer ? 'declarer' : 'defenders'
  const level = kontra?.level || 1

  // Whose turn to double: defenders open, then it alternates.
  let canDouble = false
  if (open) {
    if (level === 1) canDouble = !isDeclarer // only defenders open
    else canDouble = kontra.lastParty !== party // the other side may re-double
  }

  const nextName = LEVEL_NAME[level * 2] || `×${level * 2}`

  return (
    <div className={styles.bar}>
      {level > 1 && (
        <span className={styles.level}>
          {LEVEL_NAME[level] || `×${level}`} (stakes ×{level})
        </span>
      )}
      {canDouble && (
        <button className={styles.btn} onClick={() => emit('kontra:call', { roomCode })}>
          {nextName}
        </button>
      )}
    </div>
  )
}
