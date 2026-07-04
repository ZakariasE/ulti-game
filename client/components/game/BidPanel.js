import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/BidPanel.module.css'

const SUITS = ['makk', 'zold', 'piros', 'tok']
const SUIT_NAMES = { makk: 'Makk', zold: 'Zöld', piros: 'Piros', tok: 'Tök' }

const CONTRACTS = [
  { contract: 'simple',    label: 'Simple',    points: '1/2pt' },
  { contract: 'betli',     label: 'Betli',     points: '5pt'   },
  { contract: 'ulti',      label: 'Ulti',      points: '4/8pt' },
  { contract: 'durchmars', label: 'Durchmars', points: '6pt'   },
]

// Bid rank for filtering available bids
const BID_RANKS = {
  'simple_minor': 0, 'simple_piros': 1, 'betli_null': 2,
  'ulti_minor': 3, 'durchmars_null': 4, 'ulti_piros': 5,
}

function getBidRank(contract, suit) {
  const suitKey = suit === 'piros' ? 'piros' : (suit === null ? 'null' : 'minor')
  return BID_RANKS[`${contract}_${suitKey}`] ?? -1
}

export default function BidPanel({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { bidding, myPlayerId } = state
  const [selectedContract, setSelectedContract] = useState(null)
  const [selectedSuit, setSelectedSuit] = useState(null)

  const isMyTurn = bidding?.currentBidderId === myPlayerId || bidding?.talonOfferedTo === myPlayerId
  const iHaveTalon = bidding?.iHaveTalon
  const discarded = bidding?.discarded
  const currentHighBid = bidding?.currentHighBid
  const talonOfferedToMe = bidding?.talonOfferedTo === myPlayerId
  const needsDiscard = iHaveTalon && !discarded

  // Determine which contracts are available (higher than current)
  const currentRank = currentHighBid
    ? getBidRank(currentHighBid.contract, currentHighBid.suit)
    : -1

  function canBid(contract, suit) {
    return getBidRank(contract, suit) > currentRank
  }

  function requiresSuit(contract) {
    return contract === 'simple' || contract === 'ulti'
  }

  function handleBid() {
    const suit = requiresSuit(selectedContract) ? selectedSuit : null
    emit('bid:place', { roomCode, contract: selectedContract, suit })
    setSelectedContract(null)
    setSelectedSuit(null)
  }

  function handlePass() {
    emit('bid:pass', { roomCode })
  }

  if (!isMyTurn && !iHaveTalon) {
    const currentBidder = state.players.find((p) => p.id === bidding?.currentBidderId)
    return (
      <div className={styles.panel}>
        <h3>Bidding</h3>
        {currentHighBid && (
          <p>Current bid: <strong>{currentHighBid.contract}</strong>
            {currentHighBid.suit ? ` (${SUIT_NAMES[currentHighBid.suit] || currentHighBid.suit})` : ''} by{' '}
            {state.players.find((p) => p.id === currentHighBid.playerId)?.name}
          </p>
        )}
        <p className={styles.waiting}>Waiting for {currentBidder?.name || '...'}...</p>
      </div>
    )
  }

  // Talon offer phase
  if (talonOfferedToMe && !iHaveTalon) {
    return (
      <div className={styles.panel}>
        <h3>Talon Offered</h3>
        <p>Take the talon to bid higher, or pass it on.</p>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={() => emit('talon:take', { roomCode })}>
            Take Talon
          </button>
          <button className={styles.btnSecondary} onClick={() => emit('talon:pass', { roomCode })}>
            Pass
          </button>
        </div>
      </div>
    )
  }

  // Discard phase (have talon, haven't discarded)
  if (needsDiscard) {
    return null // TalonView handles this
  }

  // Bidding phase (have talon, discarded — pick a contract)
  if (iHaveTalon && discarded) {
    return (
      <div className={styles.panel}>
        <h3>Name Your Contract</h3>
        <div className={styles.contracts}>
          {CONTRACTS.map(({ contract, label, points }) => (
            SUITS.filter((s) => requiresSuit(contract) ? true : !requiresSuit(contract)).map((suit) => {
              if (!requiresSuit(contract) && suit !== 'makk') return null
              const suitToCheck = requiresSuit(contract) ? suit : null
              if (!canBid(contract, suitToCheck)) return null
              const key = `${contract}_${suit}`
              return (
                <button
                  key={key}
                  className={`${styles.contractBtn} ${selectedContract === contract && selectedSuit === suit ? styles.selected : ''}`}
                  onClick={() => { setSelectedContract(contract); setSelectedSuit(requiresSuit(contract) ? suit : null) }}
                >
                  {label}{requiresSuit(contract) ? ` (${SUIT_NAMES[suit]})` : ''} — {points}
                </button>
              )
            })
          ))}
        </div>
        <button
          className={styles.btnPrimary}
          disabled={!selectedContract}
          onClick={handleBid}
        >
          Confirm Bid
        </button>
      </div>
    )
  }

  // Normal bidding turn
  return (
    <div className={styles.panel}>
      <h3>Your Turn to Bid</h3>
      {currentHighBid && (
        <p>Current: <strong>{currentHighBid.contract}</strong></p>
      )}
      <div className={styles.contracts}>
        {CONTRACTS.map(({ contract, label, points }) =>
          SUITS.map((suit) => {
            if (!requiresSuit(contract) && suit !== 'makk') return null
            const suitToCheck = requiresSuit(contract) ? suit : null
            if (!canBid(contract, suitToCheck)) return null
            return (
              <button
                key={`${contract}_${suit}`}
                className={`${styles.contractBtn} ${selectedContract === contract && selectedSuit === suit ? styles.selected : ''}`}
                onClick={() => { setSelectedContract(contract); setSelectedSuit(requiresSuit(contract) ? suit : null) }}
              >
                {label}{requiresSuit(contract) ? ` (${SUIT_NAMES[suit]})` : ''} — {points}
              </button>
            )
          })
        )}
      </div>
      <div className={styles.actions}>
        <button className={styles.btnPrimary} disabled={!selectedContract} onClick={handleBid}>
          Bid
        </button>
        <button className={styles.btnSecondary} onClick={handlePass}>
          Pass
        </button>
      </div>
    </div>
  )
}
