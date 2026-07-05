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
  const { currentTurnId, biddingPhase, currentHighBid, myPlayerId, players, options } = state

  const [picked, setPicked] = useState([]) // chosen trump components
  const [color, setColor] = useState('normal')

  const felkezes = !!options?.felkezes
  const mult = felkezes ? 4 : 1 // félkezes: every bid is worth 4×
  const isMyTurn = currentTurnId === myPlayerId
  const currentDecl = currentHighBid?.declaration
  const highBidText = currentDecl
    ? `${declarationLabel(currentDecl)} (${declarationValue(currentDecl) * mult}) — ${players.find((p) => p.id === currentHighBid.playerId)?.name || '?'}`
    : null

  if (!isMyTurn) {
    const bidder = players.find((p) => p.id === currentTurnId)
    return (
      <div className={styles.panel}>
        <h3>Licit</h3>
        {highBidText && <p>Jelenlegi bemondás: <strong>{highBidText}</strong></p>}
        <p className={styles.waiting}>{bidder?.name || '...'} következik...</p>
      </div>
    )
  }

  if (biddingPhase === 'DISCARD' || biddingPhase === 'POST_DEAL_DISCARD') {
    return (
      <div className={styles.panel}>
        <h3>Te jössz</h3>
        <p className={styles.waiting}>Válassz 2 lapot a kezedből (lent), amit eldobsz.</p>
      </div>
    )
  }

  if (biddingPhase === 'ROB_OFFER') {
    return (
      <div className={styles.panel}>
        <h3>Te licitálsz</h3>
        {highBidText && <p>Jelenlegi bemondás: <strong>{highBidText}</strong></p>}
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={() => emit('bid:rob', { roomCode })}>
            Talon felvétele
          </button>
          <button className={styles.btnSecondary} onClick={() => emit('bid:pass', { roomCode })}>
            Passz
          </button>
        </div>
      </div>
    )
  }

  if (biddingPhase !== 'DECLARE' && biddingPhase !== 'BID') return null

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
      <h3>Mondd be a játékod</h3>
      {highBidText && <p>Ezt kell überelni: <strong>{highBidText}</strong></p>}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Adus bemondás</div>
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
          <button className={`${styles.chip} ${color === 'normal' ? styles.chipOn : ''}`} onClick={() => setColor('normal')}>Sima</button>
          <button className={`${styles.chip} ${styles.red} ${color === 'red' ? styles.chipOn : ''}`} onClick={() => setColor('red')}>Piros ♥ (×2)</button>
        </div>
        <div className={styles.preview}>
          {candValid
            ? <>Bemondás: <strong>{picked.length === 0 ? (color === 'red' ? 'Szimpla (piros)' : 'Szimpla') : declarationLabel(candidate)}</strong> — {declarationValue(candidate) * mult} pont</>
            : <span className={styles.invalid}>{candidate.error}</span>}
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} disabled={!candHigher} onClick={declareTrump}>
            {candValid && !candHigher ? 'Magasabbat kell mondani' : 'Bemondom'}
          </button>
          {biddingPhase === 'BID' && (
            <button className={styles.btnSecondary} onClick={() => emit('bid:pass', { roomCode })}>Passz</button>
          )}
        </div>
        <p className={styles.hint}>Az adu színt (Makk/Zöld/Tök) az első hívásnál választod ki. A Piros = piros adu.</p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Vagy adu nélküli játék</div>
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
                {info.label} — {info.base * mult}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
