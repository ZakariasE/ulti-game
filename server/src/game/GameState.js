const { createDeck, shuffle, deal } = require('./deck')
const { getLegalPlays, determineTrickWinner, countTrickPoints } = require('./rules')
const {
  getInitialBidderSeat, getNextBidderSeat, isHigherDeclaration,
  buildDeclaration, simpleDeclaration, noTrumpDeclaration, declarationLabel,
} = require('./bidding')
const { calculateRoundScore } = require('./scoring')

const MINOR_SUITS = ['makk', 'zold', 'tok']

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

  const firstBidderSeat = getInitialBidderSeat(state.dealerIndex, n)
  const firstBidder = _seatToPlayer(state, firstBidderSeat)
  state.hands[firstBidder.id] = [...state.hands[firstBidder.id], ...talon]
  state.talon = []

  state.bidding = {
    currentBidderSeat: firstBidderSeat,
    phase: 'DISCARD',
    consecutivePasses: 0,
    currentHighBid: null, // { playerId, declaration }
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

// payload: { type:'simple', color } | { type:'trump', components, color } | { type:'notrump', contract }
function _declarationFromPayload(payload) {
  if (payload.type === 'simple') return simpleDeclaration(payload.color)
  if (payload.type === 'notrump') return noTrumpDeclaration(payload.contract)
  if (payload.type === 'trump') return buildDeclaration(payload.components, payload.color)
  throw new Error('Invalid declaration')
}

function applyDeclare(state, playerId, payload) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (state.bidding.phase !== 'DECLARE') throw new Error('Not in declare phase')

  const declaration = _declarationFromPayload(payload)
  const current = state.bidding.currentHighBid
  if (current && !isHigherDeclaration(declaration, current.declaration)) {
    throw new Error('Declaration must out-rank the current bid')
  }

  state.bidding.currentHighBid = { playerId, declaration }
  state.bidding.consecutivePasses = 0
  state.bidding.history.push({ playerId, action: 'declare', label: declarationLabel(declaration) })

  state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  state.bidding.phase = 'ROB_OFFER'
}

function applyRob(state, playerId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (state.bidding.phase !== 'ROB_OFFER') throw new Error('Cannot rob now')

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

  if (state.bidding.consecutivePasses >= state.players.length && state.bidding.currentHighBid) {
    return _resolveBidding(state)
  }

  state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  return { biddingComplete: false }
}

function _resolveBidding(state) {
  const { playerId: declarerId, declaration } = state.bidding.currentHighBid
  const defenderIds = state.players.filter((p) => p.id !== declarerId).map((p) => p.id)
  const declarer = state.players.find((p) => p.id === declarerId)

  // Per-component kontra state.
  const kontra = {}
  for (const c of declaration.scoring) kontra[c] = { level: 1, lastParty: null }

  const cardsPlayed = {}
  state.players.forEach((p) => { cardsPlayed[p.id] = 0 })

  state.bidding.phase = 'DONE'
  state.play = {
    declarerId,
    defenderIds,
    declaration: { ...declaration, announcedMarriages: [] },
    openingLeadDone: false,
    currentTrick: { ledSuit: null, leaderSeat: declarer.seatIndex, cards: [] },
    completedTricks: [],
    declarerPoints: 0,
    trickCount: 0,
    kontra,
    cardsPlayed,
  }
  state.phase = 'PLAYING'
  return { biddingComplete: true, declarerId, declaration }
}

// ── Marriages ─────────────────────────────────────────────────────────────────

// Suits where the hand holds both King and Over.
function availableMarriages(hand) {
  return ['makk', 'zold', 'tok', 'piros'].filter((suit) => {
    const hasKing = hand.some((c) => c.suit === suit && c.rank === 'kiraly')
    const hasOver = hand.some((c) => c.suit === suit && c.rank === 'felso')
    return hasKing && hasOver
  })
}

// ── Card play ────────────────────────────────────────────────────────────────

function _trumpSuit(state) {
  return state.play.declaration.trumpSuit // null for no-trump / not-yet-chosen
}

function _getLegalCardIds(state, playerId) {
  const hand = state.hands[playerId]
  const { currentTrick } = state.play
  const legal = getLegalPlays(hand, currentTrick.cards, _trumpSuit(state))
  return legal.map((c) => c.id)
}

// The declarer's opening lead: pick trump (if a normal trump declaration),
// announce marriages, then play the first card.
function applyFirstLead(state, playerId, cardId, trumpSuit, announcedSuits = []) {
  const decl = state.play.declaration
  if (playerId !== state.play.declarerId) throw new Error('Only the declarer leads first')
  if (state.play.openingLeadDone) throw new Error('Opening lead already played')

  // Choose trump for a normal trump declaration.
  if (!decl.isNoTrump && decl.color === 'normal') {
    if (!MINOR_SUITS.includes(trumpSuit)) throw new Error('Pick a trump suit (Makk, Zöld or Tök)')
    decl.trumpSuit = trumpSuit
  }

  // Validate & record announced marriages.
  const available = availableMarriages(state.hands[playerId])
  const marriages = []
  for (const suit of announcedSuits || []) {
    if (!available.includes(suit)) throw new Error('You do not hold that marriage')
    marriages.push({ suit, value: suit === decl.trumpSuit ? 40 : 20 })
  }
  decl.announcedMarriages = marriages
  state.play.openingLeadDone = true

  return _playCardCore(state, playerId, cardId)
}

function applyPlayCard(state, playerId, cardId) {
  // The declarer's very first card must go through applyFirstLead.
  if (!state.play.openingLeadDone && playerId === state.play.declarerId) {
    throw new Error('Declarer must make the opening lead')
  }
  return _playCardCore(state, playerId, cardId)
}

function _playCardCore(state, playerId, cardId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')

  const { currentTrick } = state.play
  const expectedSeat = (currentTrick.leaderSeat + currentTrick.cards.length) % state.players.length
  if (player.seatIndex !== expectedSeat) throw new Error('Not your turn')

  const legalIds = _getLegalCardIds(state, playerId)
  if (!legalIds.includes(cardId)) throw new Error('Illegal card play')

  const card = state.hands[playerId].find((c) => c.id === cardId)
  state.hands[playerId] = state.hands[playerId].filter((c) => c.id !== cardId)
  state.play.cardsPlayed[playerId]++

  if (currentTrick.cards.length === 0) currentTrick.ledSuit = card.suit
  currentTrick.cards.push({ playerId, card })

  if (currentTrick.cards.length === state.players.length) {
    return { trickComplete: true, playedCard: card, ...applyTrickEnd(state) }
  }
  return { trickComplete: false, playedCard: card }
}

function applyTrickEnd(state) {
  const { currentTrick } = state.play
  const trumpSuit = _trumpSuit(state)
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
    declaration: state.play.declaration,
    declarerId: state.play.declarerId,
    defenderIds: state.play.defenderIds,
    completedTricks: state.play.completedTricks,
    talon: state.talon,
    declarerPoints: state.play.declarerPoints,
    kontra: state.play.kontra,
  })

  for (const [playerId, delta] of Object.entries(result.deltas)) {
    state.scores[playerId] = (state.scores[playerId] || 0) + delta
  }

  state.roundResult = result
  state.phase = 'SCORING'
  return { roundResult: result }
}

// ── Kontra (per component, tied to card-play timing) ───────────────────────────

// The escalation step `d` (number of doublings so far) is raised by:
//   defenders when d is even, on their (d/2 + 1)-th card
//   declarer  when d is odd,  on their ((d+1)/2 + 1)-th card
function _kontraStep(level) {
  return Math.round(Math.log2(level)) // 1->0, 2->1, 4->2, ...
}
function _kontraExpectation(level) {
  const d = _kontraStep(level)
  if (d % 2 === 0) return { party: 'defenders', cardNum: d / 2 + 1 }
  return { party: 'declarer', cardNum: (d + 1) / 2 + 1 }
}

function applyKontra(state, playerId, components) {
  if (state.phase !== 'PLAYING') throw new Error('Not in play')
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')

  // Kontra is declared at the player's own turn, as they are about to play.
  const { currentTrick } = state.play
  const expectedSeat = (currentTrick.leaderSeat + currentTrick.cards.length) % state.players.length
  if (player.seatIndex !== expectedSeat) throw new Error('You can only kontra on your turn')

  const isDeclarer = playerId === state.play.declarerId
  const party = isDeclarer ? 'declarer' : 'defenders'
  const myCardNum = state.play.cardsPlayed[playerId] + 1 // the card they are about to play

  const list = components && components.length ? components : Object.keys(state.play.kontra)
  const raised = []
  for (const c of list) {
    const k = state.play.kontra[c]
    if (!k) throw new Error(`Not part of this declaration: ${c}`)
    const exp = _kontraExpectation(k.level)
    if (exp.party !== party) throw new Error('Not your side to double this now')
    if (exp.cardNum !== myCardNum) throw new Error('Not the right moment to double')
    if (k.lastParty === party) throw new Error('Waiting for the other side')
    k.level *= 2
    k.lastParty = party
    raised.push(c)
  }
  return { raised, kontra: state.play.kontra }
}

// True if the given player currently has any component they may double.
function eligibleKontra(state, playerId) {
  if (!state.play || state.phase !== 'PLAYING') return []
  const player = state.players.find((p) => p.id === playerId)
  const { currentTrick } = state.play
  const expectedSeat = (currentTrick.leaderSeat + currentTrick.cards.length) % state.players.length
  if (!player || player.seatIndex !== expectedSeat) return []
  const party = playerId === state.play.declarerId ? 'declarer' : 'defenders'
  const myCardNum = state.play.cardsPlayed[playerId] + 1
  return Object.entries(state.play.kontra)
    .filter(([, k]) => {
      const exp = _kontraExpectation(k.level)
      return exp.party === party && exp.cardNum === myCardNum && k.lastParty !== party
    })
    .map(([c]) => c)
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

// ── Snapshots ──────────────────────────────────────────────────────────────────

// Bidding info safe to broadcast — the concrete minor trump stays hidden.
function biddingSnapshot(state) {
  const b = state.bidding
  const currentBidder = _seatToPlayer(state, b.currentBidderSeat)
  return {
    currentBidderId: currentBidder ? currentBidder.id : null,
    phase: b.phase,
    currentHighBid: b.currentHighBid
      ? { playerId: b.currentHighBid.playerId, declaration: publicDeclaration(b.currentHighBid.declaration) }
      : null,
  }
}

// A declaration without the concrete minor trump (still hidden during bidding).
function publicDeclaration(decl) {
  return {
    components: decl.components,
    scoring: decl.scoring,
    hasParti: decl.hasParti,
    color: decl.color,
    isNoTrump: decl.isNoTrump,
    open: decl.open,
    trumpSuit: decl.color === 'red' ? 'piros' : null,
    label: declarationLabel(decl),
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
  applyFirstLead,
  applyKontra,
  applyPlayCard,
  applyRoundEnd,
  prepareNextRound,
  availableMarriages,
  eligibleKontra,
  biddingSnapshot,
  publicDeclaration,
  handCounts,
  _getLegalCardIds,
}
