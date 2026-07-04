const { createDeck, shuffle, deal } = require('./deck')
const { getLegalPlays, determineTrickWinner, countTrickPoints, isUltiWinCondition } = require('./rules')
const { getInitialBidderSeat, getNextBidderSeat, isHigherBid, isBiddingComplete } = require('./bidding')
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
    discards: [],
    bidding: null,
    play: null,
    scores: {},
    roundResult: null,
  }
}

function applyDeal(state) {
  const deck = shuffle(createDeck())
  const { hands, talon } = deal(deck)

  state.talon = talon
  state.discards = []
  state.hands = {}
  state.players.forEach((p, i) => {
    state.hands[p.id] = hands[i]
    if (state.scores[p.id] === undefined) state.scores[p.id] = 0
  })

  const firstBidderSeat = getInitialBidderSeat(state.dealerIndex, state.players.length)
  state.bidding = {
    currentBidderSeat: firstBidderSeat,
    consecutivePasses: 0,
    talonHolderSeat: firstBidderSeat,
    history: [],
    currentHighBid: null,
    phase: 'TALON_OFFER',
  }
  state.play = null
  state.roundResult = null
  state.phase = 'BIDDING'

  return { hands, talon }
}

function applyTalonTake(state, playerId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (state.bidding.phase !== 'TALON_OFFER') throw new Error('Talon not available')

  // Merge talon into player's hand
  state.hands[playerId] = [...state.hands[playerId], ...state.talon]
  state.bidding.talonHolderSeat = player.seatIndex
  state.bidding.phase = 'BIDDING'
  state.bidding.history.push({ playerId, action: 'take_talon' })

  return { talonCards: state.talon }
}

function applyTalonPass(state, playerId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (state.bidding.phase !== 'TALON_OFFER') throw new Error('Talon not in offer phase')

  state.bidding.history.push({ playerId, action: 'pass_talon' })
  state.bidding.consecutivePasses++

  const nextSeat = getNextBidderSeat(player.seatIndex, state.players.length)

  // All 3 passed on talon — forced bid on initial bidder
  if (state.bidding.consecutivePasses >= state.players.length) {
    const forcedSeat = getInitialBidderSeat(state.dealerIndex, state.players.length)
    const forcedPlayer = state.players.find((p) => p.seatIndex === forcedSeat)
    state.hands[forcedPlayer.id] = [...state.hands[forcedPlayer.id], ...state.talon]
    state.bidding.talonHolderSeat = forcedSeat
    state.bidding.currentBidderSeat = forcedSeat
    state.bidding.phase = 'FORCED'
    return { forced: true, forcedPlayerId: forcedPlayer.id, talonCards: state.talon }
  }

  state.bidding.currentBidderSeat = nextSeat
  state.bidding.talonHolderSeat = nextSeat
  return { forced: false, nextBidderSeat: nextSeat }
}

function applyDiscard(state, playerId, cardIds) {
  if (cardIds.length !== 2) throw new Error('Must discard exactly 2 cards')
  const hand = state.hands[playerId]
  if (!hand) throw new Error('Player has no hand')

  for (const id of cardIds) {
    if (!hand.find((c) => c.id === id)) throw new Error(`Card ${id} not in hand`)
  }

  state.discards = hand.filter((c) => cardIds.includes(c.id))
  state.hands[playerId] = hand.filter((c) => !cardIds.includes(c.id))
}

function applyBid(state, playerId, contract, suit) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (!['BIDDING', 'FORCED'].includes(state.bidding.phase)) throw new Error('Not in bidding phase')

  const newBid = { contract, suit }
  if (state.bidding.currentHighBid && !isHigherBid(newBid, state.bidding.currentHighBid)) {
    throw new Error('Bid must be higher than current bid')
  }

  state.bidding.currentHighBid = { playerId, contract, suit }
  state.bidding.consecutivePasses = 0
  state.bidding.history.push({ playerId, action: 'bid', contract, suit })

  const nextSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  state.bidding.currentBidderSeat = nextSeat
}

function applyPass(state, playerId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (state.bidding.phase !== 'BIDDING') throw new Error('Not in bidding phase')

  state.bidding.consecutivePasses++
  state.bidding.history.push({ playerId, action: 'pass' })

  if (isBiddingComplete(state.bidding.consecutivePasses, state.bidding.currentHighBid)) {
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
    return { biddingComplete: true, declarerId, contract, suit }
  }

  const nextSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  state.bidding.currentBidderSeat = nextSeat
  return { biddingComplete: false }
}

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
  if (currentTrick.leaderSeat !== player.seatIndex && currentTrick.cards.length !== (player.seatIndex - currentTrick.leaderSeat + 3) % 3) {
    // Simpler check: whose turn is it?
    const expectedSeat = (currentTrick.leaderSeat + currentTrick.cards.length) % state.players.length
    if (player.seatIndex !== expectedSeat) throw new Error('Not your turn')
  }

  const legalIds = _getLegalCardIds(state, playerId)
  if (!legalIds.includes(cardId)) throw new Error('Illegal card play')

  const card = state.hands[playerId].find((c) => c.id === cardId)
  state.hands[playerId] = state.hands[playerId].filter((c) => c.id !== cardId)

  if (currentTrick.cards.length === 0) {
    currentTrick.ledSuit = card.suit
  }
  currentTrick.cards.push({ playerId, card })

  if (currentTrick.cards.length === 3) {
    return { trickComplete: true, ...applyTrickEnd(state) }
  }
  return { trickComplete: false }
}

function applyTrickEnd(state) {
  const { currentTrick, suit: trumpSuit } = state.play
  const winner = determineTrickWinner(currentTrick.cards, trumpSuit)
  const points = countTrickPoints(currentTrick.cards, trumpSuit)

  const completedTrick = { winnerId: winner.playerId, cards: currentTrick.cards, points }
  state.play.completedTricks.push(completedTrick)
  state.play.trickCount++

  if (winner.playerId === state.play.declarerId) {
    state.play.declarerPoints += points
    // Last trick bonus
    if (state.play.trickCount === 10) state.play.declarerPoints += 10
  }

  const winnerPlayer = state.players.find((p) => p.id === winner.playerId)
  state.play.currentTrick = {
    ledSuit: null,
    leaderSeat: winnerPlayer.seatIndex,
    cards: [],
  }

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
    discards: state.discards,
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
  state.discards = []
  state.hands = {}
  state.bidding = null
  state.play = null
  state.roundResult = null
  state.phase = 'DEALING'
}

module.exports = {
  createGameState,
  applyDeal,
  applyTalonTake,
  applyTalonPass,
  applyDiscard,
  applyBid,
  applyPass,
  applyPlayCard,
  applyRoundEnd,
  prepareNextRound,
  _getLegalCardIds,
}
