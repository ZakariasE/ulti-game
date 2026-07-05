import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import {
  CHOOSABLE, NO_TRUMP_CONTRACTS, componentLabel, makeDeclaration,
  declarationValue, declarationLabel, isHigherDeclaration,
} from '../../lib/bids'
import styles from '../../styles/BidPanel.module.css'

export default function BidPanel({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { currentTurnId, biddingPhase, currentHighBid, myPlayerId, players } = state

  const [picked, setPicked] = useState([]) // chosen trump components
  const [color, setColor] = useState('normal')

  const isMyTurn = currentTurnId === myPlayerId
  const currentDecl = currentHighBid?.declaration
  const highBidText = currentDecl
    ? `${declarationLabel(currentDecl)} (${declarationValue(currentDecl)}) by ${players.find((p) => p.id === currentHighBid.playerId)?.name || '?'}`
    : null

  if (!isMyTurn) {
    const bidder = players.find((p) => p.id === currentTurnId)
    return (
      <div className={styles.panel}>
        <h3>Bidding</h3>
        {highBidText && <p>Current bid: <strong>{highBidText}</strong></p>}
        <p className={styles.waiting}>Waiting for {bidder?.name || '...'}...</p>
      </div>
    )
  }

  if (biddingPhase === 'DISCARD') {
    return (
      <div className={styles.panel}>
        <h3>Your turn</h3>
        <p className={styles.waiting}>Select 2 cards from your hand to discard.</p>
      </div>
    )
  }

  if (biddingPhase === 'ROB_OFFER') {
    return (
      <div className={styles.panel}>
        <h3>Your turn to bid</h3>
        {highBidText && <p>Current bid: <strong>{highBidText}</strong></p>}
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={() => emit('bid:rob', { roomCode })}>
            Take talon &amp; raise
          </button>
          <button className={styles.btnSecondary} onClick={() => emit('bid:pass', { roomCode })}>
            Pass
          </button>
        </div>
      </div>
    )
  }

  if (biddingPhase !== 'DECLARE') return null

  // Build the candidate trump declaration from the current picks.
  const candidate = picked.length === 0
    ? makeDeclaration('simple', { color })
    : makeDeclaration('trump', { components: picked, color })
  const candValid = !candidate.invalid
  const candHigher = candValid && isHigherDeclaration(candidate, currentDecl)

  function toggle(comp) {
    setPicked((prev) => (prev.includes(comp) ? prev.filter((c) => c !== comp) : [...prev, comp]))
  }

  function declareTrump() {
    if (picked.length === 0) emit('bid:declare', { roomCode, type: 'simple', color })
    else emit('bid:declare', { roomCode, type: 'trump', components: picked, color })
    setPicked([])
  }

  function declareNoTrump(contract) {
    emit('bid:declare', { roomCode, type: 'notrump', contract })
  }

  return (
    <div className={styles.panel}>
      <h3>Name your contract</h3>
      {highBidText && <p>Must beat: <strong>{highBidText}</strong></p>}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Trump declaration</div>
        <div className={styles.chips}>
          {CHOOSABLE.map((comp) => (
            <button
              key={comp}
              className={`${styles.chip} ${picked.includes(comp) ? styles.chipOn : ''}`}
              onClick={() => toggle(comp)}
            >
              {componentLabel(comp)}
            </button>
          ))}
        </div>
        <div className={styles.colorRow}>
          <button className={`${styles.chip} ${color === 'normal' ? styles.chipOn : ''}`} onClick={() => setColor('normal')}>Normal</button>
          <button className={`${styles.chip} ${styles.red} ${color === 'red' ? styles.chipOn : ''}`} onClick={() => setColor('red')}>Red ♥ (×2)</button>
        </div>
        <div className={styles.preview}>
          {candValid
            ? <>Bid: <strong>{picked.length === 0 ? (color === 'red' ? 'Simple (red)' : 'Simple') : declarationLabel(candidate)}</strong> — {declarationValue(candidate)}pt</>
            : <span className={styles.invalid}>{candidate.error}</span>}
        </div>
        <button className={styles.btnPrimary} disabled={!candHigher} onClick={declareTrump}>
          {candValid && !candHigher ? 'Must bid higher' : 'Declare'}
        </button>
        <p className={styles.hint}>You pick the trump suit when you lead your first card. Red = Hearts.</p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Or a no-trump contract</div>
        <div className={styles.chips}>
          {Object.entries(NO_TRUMP_CONTRACTS).map(([key, info]) => {
            const d = makeDeclaration('notrump', { contract: key })
            const higher = isHigherDeclaration(d, currentDecl)
            return (
              <button
                key={key}
                className={styles.chip}
                disabled={!higher}
                onClick={() => declareNoTrump(key)}
              >
                {info.label} — {info.base}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
