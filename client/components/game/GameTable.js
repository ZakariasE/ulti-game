import { useGame } from '../../context/GameContext'
import { SUIT_NAMES } from '../../lib/cards'
import { declarationLabel } from '../../lib/bids'
import OpponentArea from './OpponentArea'
import TrickArea from './TrickArea'
import TrickPile from './TrickPile'
import PlayerHand from './PlayerHand'
import BidPanel from './BidPanel'
import OpeningLead from './OpeningLead'
import RoundResult from './RoundResult'
import KontraBar from './KontraBar'
import MarriageBar from './MarriageBar'
import RevealedHand from './RevealedHand'
import Announcements from './Announcements'
import styles from '../../styles/GameTable.module.css'

export default function GameTable({ roomCode }) {
  const { state } = useGame()
  const { players, myPlayerId, scores, phase, declaration, declarerId, trumpSuit,
    currentTurnId, lastTrickWinnerId } = state
  const handCounts = state.handCounts || {}
  const marriagesByPlayer = state.marriagesByPlayer || {}
  const fmtMarriages = (list) =>
    (list || []).map((m) => `${SUIT_NAMES[m.suit]} +${m.value}`).join(', ')

  const me = players.find((p) => p.id === myPlayerId)
  const opponents = players.filter((p) => p.id !== myPlayerId)
  const declarerPlayer = declarerId ? players.find((p) => p.id === declarerId) : null

  // My side: the declarer plays alone; the two defenders are partners. You can
  // review your own side's won tricks.
  const mySide = declarerId
    ? (myPlayerId === declarerId ? [declarerId] : players.filter((p) => p.id !== declarerId).map((p) => p.id))
    : [myPlayerId]

  const myTurn = currentTurnId === myPlayerId
  const turnPlayer = players.find((p) => p.id === currentTurnId)
  const winnerPlayer = players.find((p) => p.id === lastTrickWinnerId)
  let banner, bannerClass
  if (lastTrickWinnerId) {
    banner = winnerPlayer?.id === myPlayerId
      ? 'Vitted az ütést' : `${winnerPlayer?.name} vitte az ütést`
    bannerClass = styles.bannerWin
  } else if (phase === 'PLAYING' || phase === 'BIDDING') {
    banner = myTurn ? 'Te jössz' : `${turnPlayer?.name || '...'} következik`
    bannerClass = myTurn ? styles.bannerMe : styles.bannerWait
  }

  return (
    <div className={styles.table}>
      <Announcements />

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
            revealable={mySide.includes(opp.id)}
            marriages={fmtMarriages(marriagesByPlayer[opp.id])}
          />
        ))}
      </div>

      <div className={styles.infoBar}>
        {declaration ? (
          <span className={styles.goal}>
            <span className={styles.goalLabel}>Bemondás:</span>
            <strong className={styles.goalContract}>{declarationLabel(declaration)}</strong>
            <span className={styles.goalMeta}>
              {trumpSuit ? `adu: ${SUIT_NAMES[trumpSuit]}` : 'adu rejtve'}
              {' · felvevő: '}<strong>{declarerPlayer?.id === myPlayerId ? 'te' : declarerPlayer?.name}</strong>
            </span>
          </span>
        ) : (
          <span>Licit folyamatban...</span>
        )}
        <span className={styles.room}>Szoba: {roomCode}</span>
      </div>

      {banner && <div className={`${styles.banner} ${bannerClass}`}>{banner}</div>}

      <KontraBar roomCode={roomCode} />
      <MarriageBar />
      <RevealedHand />

      <TrickArea />

      {phase === 'BIDDING' && <BidPanel roomCode={roomCode} />}
      <OpeningLead roomCode={roomCode} />
      <RoundResult roomCode={roomCode} />

      <div className={`${styles.myArea} ${myTurn ? styles.myAreaActive : ''}`}>
        <div className={styles.myInfo}>
          <span>
            {me?.name} (te){declarerId === myPlayerId ? ' 👑 Felvevő' : ''}
            {marriagesByPlayer[myPlayerId]?.length
              ? <span className={styles.marriageTag}>💍 {fmtMarriages(marriagesByPlayer[myPlayerId])}</span>
              : null}
          </span>
          <span className={styles.myPile}><TrickPile ownerId={myPlayerId} revealable align="left" /></span>
          <span>Pont: {scores[myPlayerId] ?? 0}</span>
        </div>
        <PlayerHand roomCode={roomCode} />
      </div>
    </div>
  )
}
