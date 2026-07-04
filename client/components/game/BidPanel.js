import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { SUIT_NAMES } from '../../lib/cards'
import styles from '../../styles/BidPanel.module.css'

const SUITS = ['makk', 'zold', 'tok', 'piros']

// contract, whether it needs a trump suit, base points label
const CONTRACTS = [
  { contract: 'simple',    label: 'Simple',    needsSuit: true,  points: '1/2' },
  { contract: 'betli',     label: 'Betli',     needsSuit: false, points: '5' },
  { contract: 'ulti',      label: 'Ulti',      needsSuit: true,  points: '4/8' },
  { contract: 'durchmars', label: 'Durchmars', needsSuit: false, points: '6' },
]

// Bid rank ladder (must match server bidding.js)
const BID_RANKS = {
  'simple_minor': 0, 'simple_piros': 1, 'betli_null': 2,
  'ulti_minor': 3, 'durchmars_null': 4, 'ulti_piros': 5,
}
function rankOf(contract, suit) {
  const key = suit === 'piros' ? 'piros' : (suit == null ? 'null' : 'minor')
  return BID_RANKS[`${contract}_${key}`] ?? -1
}

// Build the full list of selectable (contract, suit) bids in rank order.
function allBids() {
  const bids = []
  for (const c of CONTRACTS) {
    if (c.needsSuit) {
      for (const s of SUITS) bids.push({ contract: c.contract, suit: s, label: c.label, points: c.points })
    } else {
      bids.push({ contract: c.contract, suit: null, label: c.label, points: c.points })
    }
  }
  return bids.sort((a, b) => rankOf(a.contract, a.suit) - rankOf(b.contract, b.suit))
}

export default function BidPanel({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { currentTurnId, biddingPhase, currentHighBid, myPlayerId, players } = state
  const [selected, setSelected] = useState(null)

  const isMyTurn = currentTurnId === myPlayerId
  const currentRank = currentHighBid ? rankOf(currentHighBid.contract, currentHighBid.suit) : -1

  const highBidText = currentHighBid
    ? `${currentHighBid.contract}${currentHighBid.suit && currentHighBid.contract !== 'betli' && currentHighBid.contract !== 'durchmars' ? ` (${SUIT_NAMES[currentHighBid.suit]})` : ''} by ${players.find((p) => p.id === currentHighBid.playerId)?.name || '?'}`
    : null

  // ── Not my turn: read-only status ──
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

  // ── DISCARD: handled by TalonView overlay ──
  if (biddingPhase === 'DISCARD') {
    return (
      <div className={styles.panel}>
        <h3>Your turn</h3>
        <p className={styles.waiting}>Select 2 cards from your hand to discard.</p>
      </div>
    )
  }

  // ── ROB_OFFER: pass, or take the talon to raise ──
  if (biddingPhase === 'ROB_OFFER') {
    const canRaise = currentRank < 5 // 5 = ulti (hearts), the top bid
    return (
      <div className={styles.panel}>
        <h3>Your turn to bid</h3>
        {highBidText && <p>Current bid: <strong>{highBidText}</strong></p>}
        <div className={styles.actions}>
          {canRaise && (
            <button className={styles.btnPrimary} onClick={() => emit('bid:rob', { roomCode })}>
              Take talon &amp; raise
            </button>
          )}
          <button className={styles.btnSecondary} onClick={() => emit('bid:pass', { roomCode })}>
            Pass
          </button>
        </div>
      </div>
    )
  }

  // ── DECLARE: choose a contract (opening, or after robbing) ──
  if (biddingPhase === 'DECLARE') {
    const options = allBids().filter((b) => rankOf(b.contract, b.suit) > currentRank)
    return (
      <div className={styles.panel}>
        <h3>Name your contract</h3>
        {highBidText && <p>Must beat: <strong>{highBidText}</strong></p>}
        <div className={styles.contracts}>
          {options.map((b) => {
            const key = `${b.contract}_${b.suit}`
            const isSel = selected && selected.contract === b.contract && selected.suit === b.suit
            return (
              <button
                key={key}
                className={`${styles.contractBtn} ${isSel ? styles.selected : ''}`}
                onClick={() => setSelected(b)}
              >
                {b.label}{b.suit ? ` (${SUIT_NAMES[b.suit]})` : ''} — {b.points}pt
              </button>
            )
          })}
        </div>
        <button
          className={styles.btnPrimary}
          disabled={!selected}
          onClick={() => {
            emit('bid:declare', { roomCode, contract: selected.contract, suit: selected.suit })
            setSelected(null)
          }}
        >
          Declare
        </button>
      </div>
    )
  }

  return null
}
