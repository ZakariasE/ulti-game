import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import {
  CHOOSABLE, NO_TRUMP_CONTRACTS, componentLabel, makeDeclaration,
  declarationValue, declarationLabel, isHigherDeclaration, kontraLevelName,
} from '../../lib/bids'
import { SUIT_NAMES } from '../../lib/cards'
import styles from '../../styles/BidPanel.module.css'

const FELKEZES_SUITS = ['makk', 'zold', 'tok', 'piros']

export default function BidPanel({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { currentTurnId, biddingPhase, biddingMode, currentHighBid, myPlayerId, players, options,
    redealMultiplier, biddingKontra, pendingDiscard } = state

  const [picked, setPicked] = useState([]) // chosen trump components
  const [color, setColor] = useState('normal')
  const [felkTrump, setFelkTrump] = useState(null) // félkezes: concrete trump suit

  const felkezes = !!options?.felkezes
  const kontra = biddingKontra || { level: 0, multiplier: 1 }
  const redeal = redealMultiplier || 1
  // A bid made in the 5-card round is ×4; a bid in the reopened round is ×1.
  // (redeal doublings apply to the whole hand regardless.)
  const mult = (biddingMode === 'felkezes' ? 4 : 1) * redeal
  // In félkezes the concrete suit is named at declaration; it fixes the color.
  const effColor = felkezes ? (felkTrump === 'piros' ? 'red' : 'normal') : color
  const isMyTurn = currentTurnId === myPlayerId
  const currentDecl = currentHighBid?.declaration
  // The standing bid's value uses ITS round's ×4 factor.
  const curMult = (currentHighBid?.round === 'felkezes' ? 4 : 1) * redeal
  const highBidText = currentDecl
    ? `${declarationLabel(currentDecl)} (${declarationValue(currentDecl) * curMult * kontra.multiplier})${kontra.level > 0 ? ` ${kontraLevelName(2 ** kontra.level)}` : ''} — ${players.find((p) => p.id === currentHighBid.playerId)?.name || '?'}`
    : null

  // Can I escalate the kontra right now? (my turn, a bid exists, my side's step)
  const nextParty = kontra.level % 2 === 0 ? 'defenders' : 'declarer'
  const myParty = currentHighBid && currentHighBid.playerId === myPlayerId ? 'declarer' : 'defenders'
  // Bidding-kontra is only in the 5-card round; in the reopened round it waits for play.
  const canKontra = felkezes && biddingMode === 'felkezes' && isMyTurn && !!currentHighBid && nextParty === myParty
  const nextKontraName = kontraLevelName(2 ** (kontra.level + 1))
  const kontraBtn = canKontra
    ? <button className={styles.btnSecondary} onClick={() => emit('bid:kontra', { roomCode })}>{nextKontraName}</button>
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

  // POST_DEAL_DISCARD (félkez winner): discard only, no declaration.
  if (biddingPhase === 'POST_DEAL_DISCARD') {
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
          {kontraBtn}
          <button className={styles.btnSecondary} onClick={() => emit('bid:pass', { roomCode })}>
            Passz
          </button>
        </div>
      </div>
    )
  }

  // DISCARD is combined with the declaration here (pick 2 to discard + a bid,
  // one confirm). BID (félkezes 5-card) and DECLARE (normal, after robbing) too.
  if (biddingPhase !== 'DECLARE' && biddingPhase !== 'BID' && biddingPhase !== 'DISCARD') return null
  const needDiscard = biddingPhase === 'DISCARD'
  const discardReady = !needDiscard || (pendingDiscard || []).length === 2

  // Build the candidate trump declaration from the current picks.
  const candidate = picked.length === 0
    ? makeDeclaration('simple', { color: effColor })
    : makeDeclaration('trump', { components: picked, color: effColor })
  // Félkezes requires a named trump suit before you can declare.
  const suitReady = !felkezes || !!felkTrump
  const candValid = !candidate.invalid && suitReady && discardReady
  const candHigher = candValid && isHigherDeclaration(candidate, currentDecl)

  function toggle(comp) {
    setPicked((prev) => (prev.includes(comp) ? prev.filter((c) => c !== comp) : [...prev, comp]))
  }

  // When robbing (DISCARD phase), put down the 2 selected cards and declare in
  // one action (the discard is applied server-side just before the declaration).
  function commitDiscardIfNeeded() {
    if (needDiscard) emit('bid:discard', { roomCode, cardIds: pendingDiscard })
  }

  function declareTrump() {
    const trumpSuit = felkezes ? felkTrump : undefined
    commitDiscardIfNeeded()
    if (picked.length === 0) emit('bid:declare', { roomCode, type: 'simple', color: effColor, trumpSuit })
    else emit('bid:declare', { roomCode, type: 'trump', components: picked, color: effColor, trumpSuit })
    setPicked([])
    setFelkTrump(null)
  }

  function declareNoTrump(contract) {
    commitDiscardIfNeeded()
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
        {felkezes ? (
          <div className={styles.colorRow}>
            {FELKEZES_SUITS.map((s) => (
              <button
                key={s}
                className={`${styles.chip} ${s === 'piros' ? styles.red : ''} ${felkTrump === s ? styles.chipOn : ''}`}
                onClick={() => setFelkTrump(s)}
              >
                {SUIT_NAMES[s]}{s === 'piros' ? ' ♥ (×2)' : ''}
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.colorRow}>
            <button className={`${styles.chip} ${color === 'normal' ? styles.chipOn : ''}`} onClick={() => setColor('normal')}>Sima</button>
            <button className={`${styles.chip} ${styles.red} ${color === 'red' ? styles.chipOn : ''}`} onClick={() => setColor('red')}>Piros ♥ (×2)</button>
          </div>
        )}
        <div className={styles.preview}>
          {candidate.invalid
            ? <span className={styles.invalid}>{candidate.error}</span>
            : felkezes && !felkTrump
              ? <span className={styles.invalid}>Válassz színt</span>
              : !discardReady
                ? <span className={styles.invalid}>Válassz 2 eldobandó lapot (lent)</span>
                : <>Bemondás: <strong>{picked.length === 0 ? (effColor === 'red' ? 'Szimpla (piros)' : 'Szimpla') : declarationLabel(candidate)}</strong>{felkezes ? ` — ${SUIT_NAMES[felkTrump]}` : ''} — {declarationValue(candidate) * mult} pont</>}
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} disabled={!candHigher} onClick={declareTrump}>
            {candValid && !candHigher ? 'Magasabbat kell mondani' : 'Bemondom'}
          </button>
          {biddingPhase === 'BID' && kontraBtn}
          {biddingPhase === 'BID' && (
            <button className={styles.btnSecondary} onClick={() => emit('bid:pass', { roomCode })}>Passz</button>
          )}
        </div>
        <p className={styles.hint}>
          {felkezes
            ? 'Félkezesben azonnal meg kell mondani a színt (adut).'
            : 'Az adu színt (Makk/Zöld/Tök) az első hívásnál választod ki. A Piros = piros adu.'}
        </p>
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
                disabled={!higher || !discardReady}
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
