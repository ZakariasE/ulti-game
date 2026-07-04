// Per-contract metadata.
//  trump    — is a trump suit chosen and are card points scored?
//  base     — points paid to/by EACH defender (doubled for hearts if trump)
//  needsSuit — does the declarer pick a trump suit when bidding?
const CONTRACT_INFO = {
  simple:          { trump: true,  base: 1,  needsSuit: true,  label: 'Simple' },
  forty_hundred:   { trump: true,  base: 4,  needsSuit: true,  label: '40-100' },
  ulti:            { trump: true,  base: 4,  needsSuit: true,  label: 'Ulti' },
  twenty_hundred:  { trump: true,  base: 8,  needsSuit: true,  label: '20-100' },
  betli:           { trump: false, base: 5,  needsSuit: false, label: 'Betli' },
  durchmars:       { trump: false, base: 6,  needsSuit: false, label: 'Durchmars' },
  heart_betli:     { trump: false, base: 10, needsSuit: false, label: 'Heart Betli' },
  heart_durchmars: { trump: false, base: 12, needsSuit: false, label: 'Heart Durchmars' },
  open_betli:      { trump: false, base: 20, needsSuit: false, label: 'Open Betli' },
  open_durchmars:  { trump: false, base: 24, needsSuit: false, label: 'Open Durchmars' },
}

// The bid ladder, lowest to highest. For trump contracts the suit class
// ('minor' vs 'hearts') matters; no-trump contracts appear once.
const LADDER = [
  ['simple', 'minor'],
  ['simple', 'hearts'],
  ['forty_hundred', 'minor'],
  ['betli', null],
  ['ulti', 'minor'],
  ['durchmars', null],
  ['forty_hundred', 'hearts'],
  ['twenty_hundred', 'minor'],
  ['ulti', 'hearts'],
  ['heart_betli', null],
  ['heart_durchmars', null],
  ['twenty_hundred', 'hearts'],
  ['open_betli', null],
  ['open_durchmars', null],
]

function isTrumpContract(contract) {
  return !!(CONTRACT_INFO[contract] && CONTRACT_INFO[contract].trump)
}

function isOpenContract(contract) {
  return contract === 'open_betli' || contract === 'open_durchmars'
}

function _suitClass(contract, suit) {
  if (!isTrumpContract(contract)) return null
  return suit === 'piros' ? 'hearts' : 'minor'
}

function getBidRank(contract, suit) {
  const sc = _suitClass(contract, suit)
  return LADDER.findIndex(([c, s]) => c === contract && s === sc)
}

const MAX_BID_RANK = LADDER.length - 1

function isHigherBid(newBid, currentBid) {
  return getBidRank(newBid.contract, newBid.suit) > getBidRank(currentBid.contract, currentBid.suit)
}

function getBasePoints(contract, suit) {
  const info = CONTRACT_INFO[contract]
  if (!info) throw new Error(`Unknown contract: ${contract}`)
  if (info.trump && suit === 'piros') return info.base * 2
  return info.base
}

function getInitialBidderSeat(dealerSeat, numPlayers) {
  return (dealerSeat + 1) % numPlayers
}

function getNextBidderSeat(currentSeat, numPlayers) {
  return (currentSeat + 1) % numPlayers
}

module.exports = {
  CONTRACT_INFO,
  LADDER,
  MAX_BID_RANK,
  isTrumpContract,
  isOpenContract,
  getBidRank,
  isHigherBid,
  getBasePoints,
  getInitialBidderSeat,
  getNextBidderSeat,
}
