// Card strength values — context-dependent
const STRENGTH_TRUMP = { asz: 8, '10': 7, kiraly: 6, felso: 5, also: 4, '9': 3, '8': 2, '7': 1 }
const STRENGTH_NOTRUMP = { asz: 8, kiraly: 7, felso: 6, also: 5, '10': 4, '9': 3, '8': 2, '7': 1 }

function getCardStrength(card, trumpContext) {
  return trumpContext ? STRENGTH_TRUMP[card.rank] : STRENGTH_NOTRUMP[card.rank]
}

function isTrump(card, trumpSuit) {
  return trumpSuit !== null && card.suit === trumpSuit
}

// trick = Array<{ playerId, card }>
function determineTrickWinner(trick, trumpSuit) {
  const hasTrumps = trumpSuit !== null
  const ledSuit = trick[0].card.suit
  let winner = trick[0]
  let winnerStrength = getCardStrength(winner.card, hasTrumps)
  let winnerIsTrump = isTrump(winner.card, trumpSuit)

  for (let i = 1; i < trick.length; i++) {
    const entry = trick[i]
    const cardIsTrump = isTrump(entry.card, trumpSuit)
    const strength = getCardStrength(entry.card, hasTrumps)

    if (cardIsTrump && !winnerIsTrump) {
      // Trump beats non-trump
      winner = entry
      winnerStrength = strength
      winnerIsTrump = true
    } else if (cardIsTrump && winnerIsTrump) {
      // Both trumps — higher strength wins
      if (strength > winnerStrength) {
        winner = entry
        winnerStrength = strength
      }
    } else if (!cardIsTrump && !winnerIsTrump && entry.card.suit === ledSuit) {
      // Following led suit, no trumps involved
      if (strength > winnerStrength) {
        winner = entry
        winnerStrength = strength
      }
    }
    // Otherwise card is off-suit non-trump — can never win
  }

  return winner
}

function countTrickPoints(trickCards, trumpSuit) {
  if (trumpSuit === null) return 0
  return trickCards.reduce((sum, { card }) => {
    return sum + (card.rank === 'asz' || card.rank === '10' ? 10 : 0)
  }, 0)
}

// Returns Card[] of legally playable cards from hand
function getLegalPlays(hand, trickCards, trumpSuit, contract) {
  // Leading (empty trick): any card is legal
  if (trickCards.length === 0) return hand

  const ledSuit = trickCards[0].card.suit
  const hasTrumps = trumpSuit !== null

  // Find the current winning card to determine "must beat" obligation
  const currentWinner = determineTrickWinner(trickCards, trumpSuit)
  const currentWinnerStrength = getCardStrength(currentWinner.card, hasTrumps)
  const currentWinnerIsTrump = isTrump(currentWinner.card, trumpSuit)

  const suitCards = hand.filter((c) => c.suit === ledSuit)
  const trumpCards = hand.filter((c) => isTrump(c, trumpSuit))

  // Rule 1: Must follow led suit if possible
  if (suitCards.length > 0) {
    // Must beat within led suit if possible (unless current winner is a trump)
    if (!currentWinnerIsTrump) {
      const beating = suitCards.filter(
        (c) => getCardStrength(c, hasTrumps) > currentWinnerStrength
      )
      return beating.length > 0 ? beating : suitCards
    }
    // Current winner is trump, can't beat with led suit — play any led-suit card
    return suitCards
  }

  // Rule 2: Void in led suit — must play trump if available (trump games only)
  if (hasTrumps && trumpCards.length > 0) {
    // Must beat the current winning trump if possible
    if (currentWinnerIsTrump) {
      const beatingTrumps = trumpCards.filter(
        (c) => getCardStrength(c, true) > currentWinnerStrength
      )
      return beatingTrumps.length > 0 ? beatingTrumps : trumpCards
    }
    // Current winner is non-trump (shouldn't happen if we must follow, but handle it)
    return trumpCards
  }

  // Rule 3: Can't follow suit, no trumps (or no-trump game) — any card
  return hand
}

function isUltiWinCondition(completedTricks, declarerId, trumpSuit) {
  if (!trumpSuit || completedTricks.length === 0) return false
  const lastTrick = completedTricks[completedTricks.length - 1]
  if (lastTrick.winnerId !== declarerId) return false
  const declaredCard = lastTrick.cards.find((c) => c.playerId === declarerId)
  return declaredCard && declaredCard.card.suit === trumpSuit && declaredCard.card.rank === '7'
}

module.exports = {
  getCardStrength,
  isTrump,
  determineTrickWinner,
  countTrickPoints,
  getLegalPlays,
  isUltiWinCondition,
}
