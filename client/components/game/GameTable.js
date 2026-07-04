import { useGame } from '../../context/GameContext'
import OpponentArea from './OpponentArea'
import TrickArea from './TrickArea'
import PlayerHand from './PlayerHand'
import BidPanel from './BidPanel'
import TalonView from './TalonView'
import RoundResult from './RoundResult'
import styles from '../../styles/GameTable.module.css'

export default function GameTable({ roomCode }) {
  const { state } = useGame()
  const { players, myPlayerId, scores, phase, bidding, myHand } = state

  const me = players.find((p) => p.id === myPlayerId)
  const opponents = players.filter((p) => p.id !== myPlayerId)

  // Approximate card counts for opponents (server doesn't send exact count, infer from phase)
  function getOpponentCardCount(player) {
    if (phase === 'PLAYING') return myHand.length // rough proxy
    return 10
  }

  const trumpSuit = bidding?.suit
  const contract = bidding?.contract
  const declarerId = bidding?.declarerId
  const declarer = players.find((p) => p.id === declarerId)

  return (
    <div className={styles.table}>
      {/* Opponents */}
      <div className={styles.opponents}>
        {opponents.map((opp) => (
          <OpponentArea
            key={opp.id}
            player={opp}
            cardCount={getOpponentCardCount(opp)}
            score={scores[opp.id]}
          />
        ))}
      </div>

      {/* Game info bar */}
      <div className={styles.infoBar}>
        {contract && (
          <span>Contract: <strong>{contract}</strong>
            {trumpSuit ? ` (${trumpSuit})` : ''} — Declarer: <strong>{declarer?.name}</strong>
          </span>
        )}
        {phase === 'BIDDING' && !contract && <span>Bidding in progress...</span>}
        <span className={styles.room}>Room: {roomCode}</span>
      </div>

      {/* Center trick area */}
      <TrickArea />

      {/* Bidding overlay */}
      {phase === 'BIDDING' && <BidPanel roomCode={roomCode} />}

      {/* Talon discard overlay */}
      <TalonView roomCode={roomCode} />

      {/* Round result overlay */}
      <RoundResult roomCode={roomCode} />

      {/* My hand */}
      <div className={styles.myArea}>
        <div className={styles.myInfo}>
          <span>{me?.name} (you)</span>
          <span>Score: {scores[myPlayerId] ?? 0}</span>
        </div>
        <PlayerHand roomCode={roomCode} />
      </div>
    </div>
  )
}
