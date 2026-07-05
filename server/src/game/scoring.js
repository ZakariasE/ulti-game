const { componentBasePoints, componentLabel } = require('./bidding')
const { isUltiWinCondition } = require('./rules')

function countCardPoints(cards, trumpSuit) {
  if (!trumpSuit) return 0
  return cards.reduce((sum, c) => sum + (c.rank === 'asz' || c.rank === '10' ? 10 : 0), 0)
}

function declarerTrickCount(completedTricks, declarerId) {
  return completedTricks.filter((t) => t.winnerId === declarerId).length
}

function acesWonByDeclarer(completedTricks, declarerId) {
  let aces = 0
  for (const t of completedTricks) {
    if (t.winnerId !== declarerId) continue
    aces += t.cards.filter((c) => c.card.rank === 'asz').length
  }
  return aces
}

// Decide whether one scoring component was fulfilled.
function componentWon(component, ctx) {
  const { declaration, declarerId, completedTricks, cardTotal, announced } = ctx
  const trumpSuit = declaration.trumpSuit
  const declTricks = declarerTrickCount(completedTricks, declarerId)

  switch (component) {
    case 'parti':
      return cardTotal >= 50
    case 'ulti':
      return isUltiWinCondition(completedTricks, declarerId, trumpSuit)
    case 'four_aces':
      return acesWonByDeclarer(completedTricks, declarerId) === 4
    case 'forty_hundred':
      return announced.some((m) => m.value === 40) && cardTotal >= 100
    case 'twenty_hundred':
      return announced.some((m) => m.value === 20) && cardTotal >= 100
    case 'durchmars': // trump component
      return declTricks === completedTricks.length
    case 'betli':
    case 'heart_betli':
    case 'open_betli':
      return declTricks === 0
    case 'durchmars_nt':
    case 'heart_durchmars':
    case 'open_durchmars':
      return declTricks === completedTricks.length
    default:
      throw new Error(`Unknown scoring component: ${component}`)
  }
}

// Returns { components:[{key,label,won,basePoints,kontraLevel,delta}], deltas, cardTotal }
function calculateRoundScore({ declaration, declarerId, defenderIds,
                               completedTricks, talon, declarerPoints, kontra = {} }) {
  const trumpSuit = declaration.trumpSuit
  const announced = declaration.announcedMarriages || []
  const wonATrick = declarerTrickCount(completedTricks, declarerId) > 0
  const marriagePoints = wonATrick ? announced.reduce((s, m) => s + m.value, 0) : 0
  const cardTotal = declarerPoints + countCardPoints(talon, trumpSuit) + marriagePoints

  const ctx = { declaration, declarerId, completedTricks, cardTotal, announced }
  const deltas = {}
  const setup = (id) => { if (deltas[id] === undefined) deltas[id] = 0 }
  setup(declarerId)
  defenderIds.forEach(setup)

  const components = declaration.scoring.map((key) => {
    const won = componentWon(key, ctx)
    const basePoints = componentBasePoints(key, declaration.color)
    const kontraLevel = (kontra[key] && kontra[key].level) || 1
    const payout = basePoints * kontraLevel

    if (won) {
      deltas[declarerId] += payout * defenderIds.length
      defenderIds.forEach((id) => { deltas[id] -= payout })
    } else {
      deltas[declarerId] -= payout * defenderIds.length
      defenderIds.forEach((id) => { deltas[id] += payout })
    }
    return { key, label: componentLabel(key), won, basePoints, kontraLevel, delta: won ? payout : -payout }
  })

  return { components, deltas, cardTotal, declarerId, color: declaration.color }
}

module.exports = { calculateRoundScore }
