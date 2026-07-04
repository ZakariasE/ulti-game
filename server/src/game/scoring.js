const { getBasePoints } = require('./bidding')
const { isUltiWinCondition } = require('./rules')

function countCardPoints(cards, trumpSuit) {
  if (!trumpSuit) return 0
  return cards.reduce((sum, c) => sum + (c.rank === 'asz' || c.rank === '10' ? 10 : 0), 0)
}

// Returns { won: bool, declarerPoints: number, deltas: { [playerId]: number } }
function calculateRoundScore({ contract, trumpSuit, declarerId, defenderIds,
                               completedTricks, talon, declarerPoints }) {
  const isHearts = trumpSuit === 'piros'
  const basePoints = getBasePoints(contract, isHearts)

  let won = false

  switch (contract) {
    case 'simple': {
      // declarerPoints already includes last-trick bonus from GameState.
      // The final talon counts toward the declarer's card points.
      const total = declarerPoints + countCardPoints(talon, trumpSuit)
      won = total >= 50
      break
    }

    case 'ulti': {
      const total = declarerPoints + countCardPoints(talon, trumpSuit)
      const hasEnoughPoints = total >= 50
      const wonWithSeven = isUltiWinCondition(completedTricks, declarerId, trumpSuit)
      won = hasEnoughPoints && wonWithSeven
      break
    }

    case 'betli': {
      const declarerTricks = completedTricks.filter((t) => t.winnerId === declarerId)
      won = declarerTricks.length === 0
      break
    }

    case 'durchmars': {
      const declarerTricks = completedTricks.filter((t) => t.winnerId === declarerId)
      won = declarerTricks.length === completedTricks.length
      break
    }

    default:
      throw new Error(`Unknown contract: ${contract}`)
  }

  const deltas = {}
  if (won) {
    deltas[declarerId] = basePoints * defenderIds.length
    defenderIds.forEach((id) => { deltas[id] = -basePoints })
  } else {
    deltas[declarerId] = -basePoints * defenderIds.length
    defenderIds.forEach((id) => { deltas[id] = basePoints })
  }

  return { won, contract, trumpSuit, declarerId, basePoints, deltas }
}

module.exports = { calculateRoundScore }
