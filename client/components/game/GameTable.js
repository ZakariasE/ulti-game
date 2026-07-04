import { useGame } from '../../context/GameContext'
import { SUIT_NAMES } from '../../lib/cards'
import OpponentArea from './OpponentArea'
import TrickArea from './TrickArea'
import PlayerHand from './PlayerHand'
import BidPanel from './BidPanel'
import TalonView from './TalonView'
import RoundResult from './RoundResult'
import styles from '../../styles/GameTable.module.css'

export default function GameTable({ roomCode }) {
  const { state } = useGame()
  const { players, myPlayerId, scores, phase, declarer } = state
  const handCounts = state.handCounts || {}

  const me = players.find((p) => p.id === myPlayerId)
  const opponents = players.filter((p) => p.id !== myPlayerId)

  const declarerPlayer = declarer ? players.find((p) => p.id === declarer.id) : null
  const trumpSuit = declarer?.suit

  return (
    <div className={styles.table}>
      <div className={styles.opponents}>
        {opponents.map((opp) => (
          <OpponentArea
            key={opp.id}
            player={opp}
            cardCount={handCounts[opp.id] ?? 10}
            score={scores[opp.id]}
            isDeclarer={declarer?.id === opp.id}
          />
        ))}
      </div>

      <div className={styles.infoBar}>
        {declarer ? (
          <span>
            Contract: <strong>{declarer.contract}</strong>
            {trumpSuit ? ` (${SUIT_NAMES[trumpSuit]})` : ''} — Declarer:{' '}
            <strong>{declarerPlayer?.name}</strong>
          </span>
        ) : (
          <span>Bidding in progress...</span>
        )}
        <span className={styles.room}>Room: {roomCode}</span>
      </div>

      <TrickArea />

      {phase === 'BIDDING' && <BidPanel roomCode={roomCode} />}
      <TalonView roomCode={roomCode} />
      <RoundResult roomCode={roomCode} />

      <div className={styles.myArea}>
        <div className={styles.myInfo}>
          <span>{me?.name} (you){declarer?.id === myPlayerId ? ' — Declarer' : ''}</span>
          <span>Score: {scores[myPlayerId] ?? 0}</span>
        </div>
        <PlayerHand roomCode={roomCode} />
      </div>
    </div>
  )
}
