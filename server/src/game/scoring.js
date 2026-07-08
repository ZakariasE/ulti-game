const { componentBasePoints, componentLabel, isIndividualKontra } = require('./bidding')
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
                               completedTricks, talon, declarerPoints, kontra = {}, marriages = {},
                               felkezesBid = false, redealMultiplier = 1, ultiBonus = 0, conceded = false }) {
  const trumpSuit = declaration.trumpSuit
  const announced = marriages[declarerId] || [] // declarer's own (for 40-100 / 20-100)

  // Trick points. The talon's point cards (Aces/Tens) belong to the DEFENDERS:
  // `declarerPoints` is only what the declarer captured in tricks, so everything
  // else — the defenders' own tricks plus the talon — makes up their total.
  const talonPts = countCardPoints(talon, trumpSuit)
  const declarerTrickPoints = declarerPoints
  const defenderTrickPoints = 90 - declarerPoints

  // Marriages count only if the announcing side won at least one trick.
  const declWonATrick = declarerTrickCount(completedTricks, declarerId) > 0
  const defWonATrick = completedTricks.some((t) => defenderIds.includes(t.winnerId))
  const declarerMarriage = marriagePoints(marriages, [declarerId], declWonATrick)
  const defenderMarriage = marriagePoints(marriages, defenderIds, defWonATrick)

  const declarerTotal = declarerTrickPoints + declarerMarriage
  const defenderTotal = defenderTrickPoints + defenderMarriage
  const cardTotal = declarerTotal

  // Breakdown of the Parti card race, per side (for the round-over screen). Not
  // shown on a concede — no card race happened.
  let partiDetail = null
  if (!conceded && declaration.scoring.includes('parti')) {
    const sumHits = (ids) => completedTricks
      .filter((t) => ids.includes(t.winnerId))
      .reduce((s, t) => s + t.cards.reduce((x, c) => x + (c.card.rank === 'asz' || c.card.rank === '10' ? 10 : 0), 0), 0)
    const lastWinner = completedTricks.length ? completedTricks[completedTricks.length - 1].winnerId : null
    partiDetail = {
      declarer: {
        hits: sumHits([declarerId]),
        announcements: declarerMarriage,
        lastTrick: lastWinner === declarerId ? 10 : 0,
        talon: 0,
        total: declarerTotal,
      },
      defenders: {
        hits: sumHits(defenderIds),
        announcements: defenderMarriage,
        lastTrick: lastWinner && defenderIds.includes(lastWinner) ? 10 : 0,
        talon: talonPts,
        total: defenderTotal,
      },
    }
  }

  const ctx = { declaration, declarerId, completedTricks, declarerTotal, defenderTotal, announced }
  const deltas = {}
  const setup = (id) => { if (deltas[id] === undefined) deltas[id] = 0 }
  setup(declarerId)
  defenderIds.forEach(setup)

  // Individual (per-defender) kontra: betli / no-trump durchmars. Each defender
  // has their own kontra line, so `deltas` differ per defender (used directly in
  // non-buli). The buli STANDING (declarerRaw) tracks the COMMON kontra level —
  // the level BOTH defenders share (their minimum) — so when both kontra equally
  // it behaves exactly like a normal (uniform) kontra of the whole contract. Only
  // each defender's EXCESS beyond that common level goes to `sidePairs`, a pairwise
  // side-ledger that surfaces only at Elszámolás (never in the buli standing).
  if (isIndividualKontra(declaration)) {
    const key = declaration.scoring[0]
    const won = conceded ? false : componentWon(key, ctx)
    const base = componentBasePoints(key, declaration.color, declaration.open)
    const mult = (felkezesBid ? 4 : 1) * redealMultiplier
    const baseUnit = base * mult
    const levels = defenderIds.map((d) => (kontra[d] && kontra[d].level) || 1)
    const commonLevel = levels.length ? Math.min(...levels) : 1 // shared kontra ⇒ standing
    const sidePairs = {}
    const addPair = (x, y, amt) => { // x owes y `amt`
      const a = x < y ? x : y
      const b = x < y ? y : x
      sidePairs[`${a}|${b}`] = (sidePairs[`${a}|${b}`] || 0) + (x === a ? amt : -amt)
    }
    const perDefender = defenderIds.map((defId) => {
      const level = (kontra[defId] && kontra[defId].level) || 1
      const amount = baseUnit * level
      if (won) { deltas[declarerId] += amount; deltas[defId] -= amount }
      else { deltas[declarerId] -= amount; deltas[defId] += amount }
      const extra = baseUnit * (level - commonLevel) // only the excess over the shared level
      if (extra) {
        if (won) addPair(defId, declarerId, extra) // defender pays the declarer more
        else addPair(declarerId, defId, extra)     // declarer pays that defender more
      }
      return { id: defId, level, amount }
    })
    // Buli standing: the shared kontra level applies to the whole contract.
    const delta = (won ? baseUnit : -baseUnit) * commonLevel
    const components = [{
      key, label: componentLabel(key), won, basePoints: base,
      kontraLevel: commonLevel, hundred: false, lossMult: 1, mult, hozam: false,
      individual: true, perDefender, delta,
    }]
    return { components, deltas, declarerRaw: delta, cardTotal, partiDetail: null, declarerId, color: declaration.color, sidePairs }
  }

  const hozamSet = new Set(declaration.hozam || [])
  const components = declaration.scoring.map((key) => {
    const won = conceded ? false : componentWon(key, ctx)
    const basePoints = componentBasePoints(key, declaration.color, declaration.open)
    const kontraLevel = (kontra[key] && kontra[key].level) || 1
    // Reaching 100 card points doubles the Parti stake — for whichever side won it.
    // (Not on a concede — no card race.)
    const hundred = !conceded && key === 'parti' && (won ? declarerTotal : defenderTotal) >= 100
    // Per-component multiplier: a hozámondott add-on scores ×2; an original
    // félkez component ×4 (only if the bid was won in the 5-card round); a normal
    // teljes-kéz component ×1. Redeal doublings apply to the whole hand.
    const isHozam = hozamSet.has(key)
    const mult = (isHozam ? 2 : (felkezesBid ? 4 : 1)) * redealMultiplier
    const payout = basePoints * kontraLevel * (hundred ? 2 : 1) * mult
    // A lost Ulti costs the declarer double (win +N, lose −2N).
    const lossMult = key === 'ulti' ? 2 : 1
    const amount = won ? payout : payout * lossMult

    if (won) {
      deltas[declarerId] += amount * defenderIds.length
      defenderIds.forEach((id) => { deltas[id] -= amount })
    } else {
      deltas[declarerId] -= amount * defenderIds.length
      defenderIds.forEach((id) => { deltas[id] += amount })
    }
    return { key, label: componentLabel(key), won, basePoints, kontraLevel, hundred, lossMult, mult, hozam: isHozam, delta: won ? amount : -amount }
  })

  // Kötelező ulti premium (lean-trump <3 in the 5-card hand): a flat declarer
  // bonus (+10, +20 red), shown as its own row. It is NOT a pairwise defender
  // payment, so it only feeds declarerRaw (what buli tracks) — not `deltas`.
  if (ultiBonus > 0) {
    components.push({
      key: 'ulti_bonus', label: 'Ulti bónusz (kevés adu)', won: true, flat: true,
      basePoints: ultiBonus, kontraLevel: 1, hundred: false, lossMult: 1, delta: ultiBonus,
    })
  }

  // Raw per-defender total for the declarer (one "unit", not the pairwise ×2).
  // Buli mode tracks this; the pairwise expansion happens only at settlement.
  const declarerRaw = components.reduce((s, c) => s + c.delta, 0)

  return { components, deltas, declarerRaw, cardTotal, partiDetail, declarerId, color: declaration.color }
}

module.exports = { calculateRoundScore }
