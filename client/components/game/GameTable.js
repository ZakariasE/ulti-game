import { useGame } from '../../context/GameContext'
import { SUIT_NAMES } from '../../lib/cards'
import { declarationLabel } from '../../lib/bids'
import OpponentArea from './OpponentArea'
import TrickArea from './TrickArea'
import PlayerHand from './PlayerHand'
import BidPanel from './BidPanel'
import TalonView from './TalonView'
import OpeningLead from './OpeningLead'
import RoundResult from './RoundResult'
import KontraBar from './KontraBar'
import RevealedHand from './RevealedHand'
import styles from '../../styles/GameTable.module.css'

export default function GameTable({ roomCode }) {
  const { state } = useGame()
  const { players, myPlayerId, scores, phase, declaration, declarerId, trumpSuit,
    announcedMarriages, currentTurnId, lastTrickWinnerId } = state
  const handCounts = state.handCounts || {}

  const me = players.find((p) => p.id === myPlayerId)
  const opponents = players.filter((p) => p.id !== myPlayerId)
  const declarerPlayer = declarerId ? players.find((p) => p.id === declarerId) : null

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

  const marriageText = announcedMarriages?.length
    ? ' · marriages: ' + announcedMarriages.map((m) => `${SUIT_NAMES[m.suit]} +${m.value}`).join(', ')
    : ''

  return (
    <div className={styles.table}>
      <div className={styles.opponents}>
        {opponents.map((opp) => (
          <OpponentArea
            key={opp.id}
            player={opp}
            cardCount={handCounts[opp.id] ?? 10}
            score={scores[opp.id]}
            isDeclarer={declarerId === opp.id}
            isActive={currentTurnId === opp.id}
            wonTrick={lastTrickWinnerId === opp.id}
          />
        ))}
      </div>

      <div className={styles.infoBar}>
        {declaration ? (
          <span>
            <strong>{declarationLabel(declaration)}</strong>
            {trumpSuit ? ` — trump ${SUIT_NAMES[trumpSuit]}` : ' — trump hidden'}
            {' '}by <strong>{declarerPlayer?.name}</strong>{marriageText}
          </span>
        ) : (
          <span>Bidding in progress...</span>
        )}
        <span className={styles.room}>Room: {roomCode}</span>
      </div>

      {banner && <div className={`${styles.banner} ${bannerClass}`}>{banner}</div>}

      <KontraBar roomCode={roomCode} />
      <RevealedHand />

      <TrickArea />

      {phase === 'BIDDING' && <BidPanel roomCode={roomCode} />}
      <TalonView roomCode={roomCode} />
      <OpeningLead roomCode={roomCode} />
      <RoundResult roomCode={roomCode} />

      <div className={`${styles.myArea} ${myTurn ? styles.myAreaActive : ''}`}>
        <div className={styles.myInfo}>
          <span>{me?.name} (you){declarerId === myPlayerId ? ' 👑 Declarer' : ''}</span>
          <span>Score: {scores[myPlayerId] ?? 0}</span>
        </div>
        <PlayerHand roomCode={roomCode} />
      </div>
    </div>
  )
}
