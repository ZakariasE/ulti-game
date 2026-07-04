// Contracts ranked lowest to highest
// suit: 'piros' = hearts (double points); anything else = minor
const CONTRACT_RANKS = [
  { contract: 'simple',    suit: 'minor'  }, // 0
  { contract: 'simple',    suit: 'piros'  }, // 1
  { contract: 'betli',     suit: null     }, // 2
  { contract: 'ulti',      suit: 'minor'  }, // 3
  { contract: 'durchmars', suit: null     }, // 4
  { contract: 'ulti',      suit: 'piros'  }, // 5
]

function _suitKey(suit) {
  return suit === 'piros' ? 'piros' : 'minor'
}

function getBidRank(contract, suit) {
  const key = _suitKey(suit)
  return CONTRACT_RANKS.findIndex((b) => b.contract === contract && b.suit === key)
}

function isHigherBid(newBid, currentBid) {
  return getBidRank(newBid.contract, newBid.suit) > getBidRank(currentBid.contract, currentBid.suit)
}

function getBasePoints(contract, isHearts) {
  switch (contract) {
    case 'simple':    return isHearts ? 2 : 1
    case 'ulti':      return isHearts ? 8 : 4
    case 'betli':     return 5
    case 'durchmars': return 6
    default: throw new Error(`Unknown contract: ${contract}`)
  }
}

// Seat anticlockwise to dealer's right
function getInitialBidderSeat(dealerSeat, numPlayers) {
  return (dealerSeat + 1) % numPlayers
}

function getNextBidderSeat(currentSeat, numPlayers) {
  return (currentSeat + 1) % numPlayers
}

function isBiddingComplete(consecutivePasses, currentHighBid) {
  return consecutivePasses >= 3 && currentHighBid !== null
}

module.exports = {
  CONTRACT_RANKS,
  getBidRank,
  isHigherBid,
  getBasePoints,
  getInitialBidderSeat,
  getNextBidderSeat,
  isBiddingComplete,
}
