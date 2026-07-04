// Client-side mirror of server/src/game/bidding.js — keep in sync.
export const CONTRACT_INFO = {
  simple:          { label: 'Simple',          base: 1,  trump: true },
  forty_hundred:   { label: '40-100',          base: 4,  trump: true },
  ulti:            { label: 'Ulti',            base: 4,  trump: true },
  twenty_hundred:  { label: '20-100',          base: 8,  trump: true },
  betli:           { label: 'Betli',           base: 5,  trump: false },
  durchmars:       { label: 'Durchmars',       base: 6,  trump: false },
  heart_betli:     { label: 'Heart Betli',     base: 10, trump: false },
  heart_durchmars: { label: 'Heart Durchmars', base: 12, trump: false },
  open_betli:      { label: 'Open Betli',      base: 20, trump: false },
  open_durchmars:  { label: 'Open Durchmars',  base: 24, trump: false },
}

const LADDER = [
  ['simple', 'minor'], ['simple', 'hearts'], ['forty_hundred', 'minor'],
  ['betli', null], ['ulti', 'minor'], ['durchmars', null],
  ['forty_hundred', 'hearts'], ['twenty_hundred', 'minor'], ['ulti', 'hearts'],
  ['heart_betli', null], ['heart_durchmars', null], ['twenty_hundred', 'hearts'],
  ['open_betli', null], ['open_durchmars', null],
]

const TRUMP_SUITS = ['makk', 'zold', 'tok', 'piros']

function suitClass(contract, suit) {
  if (!CONTRACT_INFO[contract]?.trump) return null
  return suit === 'piros' ? 'hearts' : 'minor'
}

export function getBidRank(contract, suit) {
  const sc = suitClass(contract, suit)
  return LADDER.findIndex(([c, s]) => c === contract && s === sc)
}

export function getBidPoints(contract, suit) {
  const info = CONTRACT_INFO[contract]
  return info.trump && suit === 'piros' ? info.base * 2 : info.base
}

export function contractLabel(contract) {
  return CONTRACT_INFO[contract]?.label || contract
}

// Every concrete (contract, suit) bid, in ascending rank order.
export function enumerateBids() {
  const bids = []
  for (const [contract, info] of Object.entries(CONTRACT_INFO)) {
    if (info.trump) {
      for (const suit of TRUMP_SUITS) bids.push({ contract, suit })
    } else {
      bids.push({ contract, suit: null })
    }
  }
  return bids
    .map((b) => ({ ...b, rank: getBidRank(b.contract, b.suit), points: getBidPoints(b.contract, b.suit) }))
    .sort((a, b) => a.rank - b.rank)
}
