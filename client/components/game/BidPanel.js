import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { SUIT_NAMES } from '../../lib/cards'
import { enumerateBids, getBidRank, contractLabel } from '../../lib/bids'
import styles from '../../styles/BidPanel.module.css'

function bidText(bid, players) {
  const suffix = bid.suit ? ` (${SUIT_NAMES[bid.suit]})` : ''
  const by = bid.playerId ? ` by ${players.find((p) => p.id === bid.playerId)?.name || '?'}` : ''
  return `${contractLabel(bid.contract)}${suffix}${by}`
}

export default function BidPanel({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { currentTurnId, biddingPhase, currentHighBid, myPlayerId, players } = state
  const [selected, setSelected] = useState(null)

  const isMyTurn = currentTurnId === myPlayerId
  const currentRank = currentHighBid
    ? getBidRank(currentHighBid.contract, currentHighBid.suit)
    : -1
  const highBidText = currentHighBid ? bidText(currentHighBid, players) : null

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
    const canRaise = currentRank < 13 // 13 = open_durchmars, the top rung
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

  if (biddingPhase === 'DECLARE') {
    const options = enumerateBids().filter((b) => b.rank > currentRank)
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
                {contractLabel(b.contract)}{b.suit ? ` (${SUIT_NAMES[b.suit]})` : ''} — {b.points}pt
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
