const { getBasePoints } = require('./bidding')
const { isUltiWinCondition } = require('./rules')

const ALL_SUITS = ['makk', 'zold', 'tok', 'piros']

function countCardPoints(cards, trumpSuit) {
  if (!trumpSuit) return 0
  return cards.reduce((sum, c) => sum + (c.rank === 'asz' || c.rank === '10' ? 10 : 0), 0)
}

// True if the given cards contain both the King and Over of `suit`.
function hasMarriage(cards, suit) {
  const hasKing = cards.some((c) => c.suit === suit && c.rank === 'kiraly')
  const hasOver = cards.some((c) => c.suit === suit && c.rank === 'felso')
  return hasKing && hasOver
}

function declarerTrickCount(completedTricks, declarerId) {
  return completedTricks.filter((t) => t.winnerId === declarerId).length
}

// Returns { won, contract, trumpSuit, declarerId, basePoints, kontraLevel, deltas }
function calculateRoundScore({ contract, trumpSuit, declarerId, defenderIds,
                               completedTricks, talon, declarerPoints,
                               declarerCards = [], kontraLevel = 1 }) {
  const basePoints = getBasePoints(contract, trumpSuit)
  let won = false

  switch (contract) {
    case 'simple': {
      const total = declarerPoints + countCardPoints(talon, trumpSuit)
      won = total >= 50
      break
    }

    case 'ulti': {
      const total = declarerPoints + countCardPoints(talon, trumpSuit)
      won = total >= 50 && isUltiWinCondition(completedTricks, declarerId, trumpSuit)
      break
    }

    case 'forty_hundred': {
      // Need 100+ points, including a 40-point marriage in the trump suit.
      const marriage = hasMarriage(declarerCards, trumpSuit) ? 40 : 0
      const total = declarerPoints + countCardPoints(talon, trumpSuit) + marriage
      won = marriage > 0 && total >= 100
      break
    }

    case 'twenty_hundred': {
      // Need 100+ points, including a 20-point marriage in a non-trump suit.
      const hasNonTrumpMarriage = ALL_SUITS.some((s) => s !== trumpSuit && hasMarriage(declarerCards, s))
      const marriage = hasNonTrumpMarriage ? 20 : 0
      const total = declarerPoints + countCardPoints(talon, trumpSuit) + marriage
      won = marriage > 0 && total >= 100
      break
    }

    case 'betli':
    case 'heart_betli':
    case 'open_betli':
      won = declarerTrickCount(completedTricks, declarerId) === 0
      break

    case 'durchmars':
    case 'heart_durchmars':
    case 'open_durchmars':
      won = declarerTrickCount(completedTricks, declarerId) === completedTricks.length
      break

    default:
      throw new Error(`Unknown contract: ${contract}`)
  }

  const payout = basePoints * kontraLevel
  const deltas = {}
  if (won) {
    deltas[declarerId] = payout * defenderIds.length
    defenderIds.forEach((id) => { deltas[id] = -payout })
  } else {
    deltas[declarerId] = -payout * defenderIds.length
    defenderIds.forEach((id) => { deltas[id] = payout })
  }

  return { won, contract, trumpSuit, declarerId, basePoints, kontraLevel, deltas }
}

module.exports = { calculateRoundScore }
