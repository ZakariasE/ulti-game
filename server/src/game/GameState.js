const { createDeck, shuffle, deal } = require('./deck')
const { getLegalPlays, determineTrickWinner, countTrickPoints } = require('./rules')
const { getInitialBidderSeat, getNextBidderSeat, isHigherBid, getBidRank, CONTRACT_RANKS } = require('./bidding')
const { calculateRoundScore } = require('./scoring')

function createGameState(roomCode, players = []) {
  return {
    roomCode,
    phase: 'LOBBY',
    round: 0,
    players,
    dealerIndex: 0,
    hands: {},
    talon: [],
    bidding: null,
    play: null,
    scores: {},
    roundResult: null,
  }
}

function _seatToPlayer(state, seat) {
  return state.players.find((p) => p.seatIndex === seat)
}

// ── Dealing ────────────────────────────────────────────────────────────────

function applyDeal(state) {
  const n = state.players.length
  const deck = shuffle(createDeck())
  const { hands, talon } = deal(deck)

  state.hands = {}
  state.players.forEach((p) => {
    state.hands[p.id] = hands[p.seatIndex]
    if (state.scores[p.id] === undefined) state.scores[p.id] = 0
  })

  // First bidder (dealer's right) is dealt 12 cards — the talon merges into their hand.
  const firstBidderSeat = getInitialBidderSeat(state.dealerIndex, n)
  const firstBidder = _seatToPlayer(state, firstBidderSeat)
  state.hands[firstBidder.id] = [...state.hands[firstBidder.id], ...talon]
  state.talon = [] // repopulated when the first bidder discards

  state.bidding = {
    currentBidderSeat: firstBidderSeat,
    phase: 'DISCARD', // first bidder must discard 2, then declare
    consecutivePasses: 0,
    currentHighBid: null,
    history: [],
  }
  state.play = null
  state.roundResult = null
  state.phase = 'BIDDING'

  return { firstBidderId: firstBidder.id }
}

// ── Bidding ──────────────────────────────────────────────────────────────────

function applyBidDiscard(state, playerId, cardIds) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (state.bidding.phase !== 'DISCARD') throw new Error('Not in discard phase')
  if (cardIds.length !== 2) throw new Error('Must discard exactly 2 cards')

  const hand = state.hands[playerId]
  for (const id of cardIds) {
    if (!hand.find((c) => c.id === id)) throw new Error(`Card ${id} not in hand`)
  }

  state.talon = hand.filter((c) => cardIds.includes(c.id))
  state.hands[playerId] = hand.filter((c) => !cardIds.includes(c.id))
  state.bidding.phase = 'DECLARE'
}

function applyDeclare(state, playerId, contract, suit) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (state.bidding.phase !== 'DECLARE') throw new Error('Not in declare phase')

  const newBid = { contract, suit }
  if (getBidRank(contract, suit) < 0) throw new Error('Invalid contract')
  if (state.bidding.currentHighBid && !isHigherBid(newBid, state.bidding.currentHighBid)) {
    throw new Error('Bid must be higher than current bid')
  }

  state.bidding.currentHighBid = { playerId, contract, suit }
  state.bidding.consecutivePasses = 0
  state.bidding.history.push({ playerId, action: 'declare', contract, suit })

  state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  state.bidding.phase = 'ROB_OFFER'
}

function applyRob(state, playerId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (state.bidding.phase !== 'ROB_OFFER') throw new Error('Cannot rob now')

  // Must be able to bid higher than the current high bid
  const highRank = getBidRank(state.bidding.currentHighBid.contract, state.bidding.currentHighBid.suit)
  if (highRank >= CONTRACT_RANKS.length - 1) throw new Error('Already at the highest bid')

  state.hands[playerId] = [...state.hands[playerId], ...state.talon]
  state.talon = []
  state.bidding.phase = 'DISCARD'
  state.bidding.history.push({ playerId, action: 'rob' })
}

function applyBidPass(state, playerId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (state.bidding.phase !== 'ROB_OFFER') throw new Error('Cannot pass now')

  state.bidding.consecutivePasses++
  state.bidding.history.push({ playerId, action: 'pass' })

  // Bidding ends when everyone except the high bidder has passed
  if (state.bidding.consecutivePasses >= state.players.length - 1 && state.bidding.currentHighBid) {
    return _resolveBidding(state)
  }

  state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  return { biddingComplete: false }
}

function _resolveBidding(state) {
  const { playerId: declarerId, contract, suit } = state.bidding.currentHighBid
  const defenderIds = state.players.filter((p) => p.id !== declarerId).map((p) => p.id)
  const declarer = state.players.find((p) => p.id === declarerId)

  state.bidding.phase = 'DONE'
  state.play = {
    declarerId,
    defenderIds,
    contract,
    suit: ['betli', 'durchmars'].includes(contract) ? null : suit,
    currentTrick: { ledSuit: null, leaderSeat: declarer.seatIndex, cards: [] },
    completedTricks: [],
    declarerPoints: 0,
    trickCount: 0,
  }
  state.phase = 'PLAYING'
  return { biddingComplete: true, declarerId, contract, suit: state.play.suit }
}

// ── Card play ────────────────────────────────────────────────────────────────

function _getLegalCardIds(state, playerId) {
  const hand = state.hands[playerId]
  const { currentTrick, suit: trumpSuit, contract } = state.play
  const legal = getLegalPlays(hand, currentTrick.cards, trumpSuit, contract)
  return legal.map((c) => c.id)
}

function applyPlayCard(state, playerId, cardId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')

  const { currentTrick } = state.play
  const expectedSeat = (currentTrick.leaderSeat + currentTrick.cards.length) % state.players.length
  if (player.seatIndex !== expectedSeat) throw new Error('Not your turn')

  const legalIds = _getLegalCardIds(state, playerId)
  if (!legalIds.includes(cardId)) throw new Error('Illegal card play')

  const card = state.hands[playerId].find((c) => c.id === cardId)
  state.hands[playerId] = state.hands[playerId].filter((c) => c.id !== cardId)

  if (currentTrick.cards.length === 0) currentTrick.ledSuit = card.suit
  currentTrick.cards.push({ playerId, card })

  if (currentTrick.cards.length === state.players.length) {
    return { trickComplete: true, playedCard: card, ...applyTrickEnd(state) }
  }
  return { trickComplete: false, playedCard: card }
}

function applyTrickEnd(state) {
  const { currentTrick, suit: trumpSuit } = state.play
  const winner = determineTrickWinner(currentTrick.cards, trumpSuit)
  const points = countTrickPoints(currentTrick.cards, trumpSuit)

  state.play.completedTricks.push({ winnerId: winner.playerId, cards: currentTrick.cards, points })
  state.play.trickCount++

  if (winner.playerId === state.play.declarerId) {
    state.play.declarerPoints += points
    if (state.play.trickCount === 10) state.play.declarerPoints += 10 // last-trick bonus
  }

  const winnerPlayer = state.players.find((p) => p.id === winner.playerId)
  state.play.currentTrick = { ledSuit: null, leaderSeat: winnerPlayer.seatIndex, cards: [] }

  if (state.play.trickCount === 10) {
    return { winnerId: winner.playerId, points, roundComplete: true, ...applyRoundEnd(state) }
  }
  return { winnerId: winner.playerId, points, roundComplete: false }
}

function applyRoundEnd(state) {
  const result = calculateRoundScore({
    contract: state.play.contract,
    trumpSuit: state.play.suit,
    declarerId: state.play.declarerId,
    defenderIds: state.play.defenderIds,
    completedTricks: state.play.completedTricks,
    talon: state.talon,
    declarerPoints: state.play.declarerPoints,
  })

  for (const [playerId, delta] of Object.entries(result.deltas)) {
    state.scores[playerId] = (state.scores[playerId] || 0) + delta
  }

  state.roundResult = result
  state.phase = 'SCORING'
  return { roundResult: result }
}

function prepareNextRound(state) {
  state.round++
  state.dealerIndex = (state.dealerIndex + 1) % state.players.length
  state.talon = []
  state.hands = {}
  state.bidding = null
  state.play = null
  state.roundResult = null
  state.phase = 'DEALING'
}

// Public snapshot of bidding state (safe to broadcast — no private cards)
function biddingSnapshot(state) {
  const b = state.bidding
  const currentBidder = _seatToPlayer(state, b.currentBidderSeat)
  return {
    currentBidderId: currentBidder ? currentBidder.id : null,
    phase: b.phase,
    currentHighBid: b.currentHighBid,
  }
}

function handCounts(state) {
  const counts = {}
  state.players.forEach((p) => { counts[p.id] = (state.hands[p.id] || []).length })
  return counts
}

module.exports = {
  createGameState,
  applyDeal,
  applyBidDiscard,
  applyDeclare,
  applyRob,
  applyBidPass,
  applyPlayCard,
  applyRoundEnd,
  prepareNextRound,
  biddingSnapshot,
  handCounts,
  _getLegalCardIds,
}
