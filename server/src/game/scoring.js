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
  const { declaration, declarerId, completedTricks, declarerTotal, defenderTotal, announced } = ctx
  const trumpSuit = declaration.trumpSuit
  const declTricks = declarerTrickCount(completedTricks, declarerId)

  switch (component) {
    case 'parti':
      // The declarer must capture more points than the defenders (each side's
      // total includes its own announced marriages).
      return declarerTotal > defenderTotal
    case 'ulti':
      return isUltiWinCondition(completedTricks, declarerId, trumpSuit)
    case 'four_aces':
      return acesWonByDeclarer(completedTricks, declarerId) === 4
    case 'forty_hundred':
      return announced.some((m) => m.value === 40) && declarerTotal >= 100
    case 'twenty_hundred':
      return announced.some((m) => m.value === 20) && declarerTotal >= 100
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

function marriagePoints(marriages, ids, eligible) {
  if (!eligible) return 0
  return ids.reduce((sum, id) => sum + (marriages[id] || []).reduce((s, m) => s + m.value, 0), 0)
}

// Returns { components:[{key,label,won,basePoints,kontraLevel,delta}], deltas, cardTotal }
function calculateRoundScore({ declaration, declarerId, defenderIds,
                               completedTricks, talon, declarerPoints, kontra = {}, marriages = {} }) {
  const trumpSuit = declaration.trumpSuit
  const announced = marriages[declarerId] || [] // declarer's own (for 40-100 / 20-100)

  // Trick points: declarer's captured points (incl. talon) vs the rest.
  const declarerTrickPoints = declarerPoints + countCardPoints(talon, trumpSuit)
  const defenderTrickPoints = 90 - declarerTrickPoints

  // Marriages count only if the announcing side won at least one trick.
  const declWonATrick = declarerTrickCount(completedTricks, declarerId) > 0
  const defWonATrick = completedTricks.some((t) => defenderIds.includes(t.winnerId))
  const declarerMarriage = marriagePoints(marriages, [declarerId], declWonATrick)
  const defenderMarriage = marriagePoints(marriages, defenderIds, defWonATrick)

  const declarerTotal = declarerTrickPoints + declarerMarriage
  const defenderTotal = defenderTrickPoints + defenderMarriage
  const cardTotal = declarerTotal

  // Breakdown of the declarer's Parti total (for the round-over screen).
  let partiDetail = null
  if (declaration.scoring.includes('parti')) {
    const hits = completedTricks
      .filter((t) => t.winnerId === declarerId)
      .reduce((s, t) => s + t.cards.reduce((x, c) => x + (c.card.rank === 'asz' || c.card.rank === '10' ? 10 : 0), 0), 0)
    const lastTrick = completedTricks.length && completedTricks[completedTricks.length - 1].winnerId === declarerId ? 10 : 0
    const talonPts = countCardPoints(talon, trumpSuit)
    partiDetail = {
      hits, announcements: declarerMarriage, lastTrick, talon: talonPts,
      declarerTotal, defenderTotal,
    }
  }

  const ctx = { declaration, declarerId, completedTricks, declarerTotal, defenderTotal, announced }
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

  return { components, deltas, cardTotal, partiDetail, declarerId, color: declaration.color }
}

module.exports = { calculateRoundScore }
