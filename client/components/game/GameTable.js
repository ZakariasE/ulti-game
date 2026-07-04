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
  const { players, myPlayerId, scores, phase, declarer, currentTurnId, lastTrickWinnerId } = state
  const handCounts = state.handCounts || {}

  const me = players.find((p) => p.id === myPlayerId)
  const opponents = players.filter((p) => p.id !== myPlayerId)

  const declarerPlayer = declarer ? players.find((p) => p.id === declarer.id) : null
  const trumpSuit = declarer?.suit

  // Turn / winner banner text
  const myTurn = currentTurnId === myPlayerId
  const turnPlayer = players.find((p) => p.id === currentTurnId)
  const winnerPlayer = players.find((p) => p.id === lastTrickWinnerId)
  let banner, bannerClass
  if (lastTrickWinnerId) {
    banner = `${winnerPlayer?.id === myPlayerId ? 'You' : winnerPlayer?.name} won the trick`
    bannerClass = styles.bannerWin
  } else if (phase === 'PLAYING' || phase === 'BIDDING') {
    banner = myTurn ? 'Your turn' : `Waiting for ${turnPlayer?.name || '...'}`
    bannerClass = myTurn ? styles.bannerMe : styles.bannerWait
  }

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
            isActive={currentTurnId === opp.id}
            wonTrick={lastTrickWinnerId === opp.id}
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

      {banner && <div className={`${styles.banner} ${bannerClass}`}>{banner}</div>}

      <TrickArea />

      {phase === 'BIDDING' && <BidPanel roomCode={roomCode} />}
      <TalonView roomCode={roomCode} />
      <RoundResult roomCode={roomCode} />

      <div className={`${styles.myArea} ${myTurn ? styles.myAreaActive : ''}`}>
        <div className={styles.myInfo}>
          <span>{me?.name} (you){declarer?.id === myPlayerId ? ' 👑 Declarer' : ''}</span>
          <span>Score: {scores[myPlayerId] ?? 0}</span>
        </div>
        <PlayerHand roomCode={roomCode} />
      </div>
    </div>
  )
}
