const { createDeck, shuffle, deal, dealFelkezes } = require('./deck')
const { getLegalPlays, determineTrickWinner, countTrickPoints } = require('./rules')
const {
  getInitialBidderSeat, getNextBidderSeat, isHigherDeclaration,
  buildDeclaration, simpleDeclaration, noTrumpDeclaration, declarationLabel,
} = require('./bidding')
const { calculateRoundScore } = require('./scoring')

const MINOR_SUITS = ['makk', 'zold', 'tok']

// House-rule options, merged with any partial `options` supplied at room creation.
function normalizeOptions(options = {}) {
  const o = options || {}
  const buli = o.buli || {}
  const kotelezo = o.kotelezo || {}
  return {
    felkezes: !!o.felkezes,
    buli: {
      on: !!buli.on,
      handsPerBuli: Number(buli.handsPerBuli) > 0 ? Math.floor(Number(buli.handsPerBuli)) : 6,
      premium: Number.isFinite(Number(buli.premium)) ? Number(buli.premium) : 100,
    },
    kotelezo: {
      on: !!kotelezo.on,
      ultiPenalty: Number.isFinite(Number(kotelezo.ultiPenalty)) ? Number(kotelezo.ultiPenalty) : 220,
      betliPenalty: Number.isFinite(Number(kotelezo.betliPenalty)) ? Number(kotelezo.betliPenalty) : 110,
    },
    stake: Number.isFinite(Number(o.stake)) ? Number(o.stake) : 1,
  }
}

function createGameState(roomCode, players = [], options = {}) {
  return {
    roomCode,
    phase: 'LOBBY',
    round: 0,
    players,
    dealerIndex: 0,
    hands: {},
    talon: [],
    reserve: [], // félkezes: cards held back for the second deal
    bidding: null,
    play: null,
    scores: {},
    declaredScores: {}, // buli: pid -> cumulative declarer-only points (+ premiums/penalties)
    buli: null, // buli: { index, handsPlayed, points, kotelezo, history }
    roundResult: null,
    talonInHand: null, // { playerId, cardIds } while a player holds the picked-up talon
    options: normalizeOptions(options),
  }
}

function _seatToPlayer(state, seat) {
  return state.players.find((p) => p.seatIndex === seat)
}

// ── Dealing ────────────────────────────────────────────────────────────────

function applyDeal(state) {
  const n = state.players.length
  const deck = shuffle(createDeck())
  const firstBidderSeat = getInitialBidderSeat(state.dealerIndex, n)
  const firstBidder = _seatToPlayer(state, firstBidderSeat)

  state.hands = {}
  state.talonInHand = null
  state.talon = []
  state.reserve = []

  if (state.options.felkezes) {
    // Deal 5 each; hold the other 17 for the second deal. No talon during bidding.
    const { hands, reserve } = dealFelkezes(deck)
    state.players.forEach((p) => { state.hands[p.id] = hands[p.seatIndex] })
    state.reserve = reserve
    state.bidding = {
      currentBidderSeat: firstBidderSeat,
      phase: 'DECLARE', // opener must declare; no discard/rob during félkezes bidding
      consecutivePasses: 0,
      currentHighBid: null,
      history: [],
    }
  } else {
    const { hands, talon } = deal(deck)
    state.players.forEach((p) => { state.hands[p.id] = hands[p.seatIndex] })
    state.hands[firstBidder.id] = [...state.hands[firstBidder.id], ...talon]
    state.talonInHand = { playerId: firstBidder.id, cardIds: talon.map((c) => c.id) }
    state.bidding = {
      currentBidderSeat: firstBidderSeat,
      phase: 'DISCARD',
      consecutivePasses: 0,
      currentHighBid: null,
      history: [],
    }
  }

  state.players.forEach((p) => {
    if (state.scores[p.id] === undefined) state.scores[p.id] = 0
    if (state.declaredScores[p.id] === undefined) state.declaredScores[p.id] = 0
  })

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
  const phase = state.bidding.phase
  if (phase !== 'DISCARD' && phase !== 'POST_DEAL_DISCARD') throw new Error('Not in discard phase')
  if (cardIds.length !== 2) throw new Error('Must discard exactly 2 cards')

  const hand = state.hands[playerId]
  for (const id of cardIds) {
    if (!hand.find((c) => c.id === id)) throw new Error(`Card ${id} not in hand`)
  }

  state.talon = hand.filter((c) => cardIds.includes(c.id))
  state.hands[playerId] = hand.filter((c) => !cardIds.includes(c.id))
  state.talonInHand = null // the talon is set aside again

  if (phase === 'POST_DEAL_DISCARD') {
    // Félkezes: the declaration is already locked; play starts now.
    return _startPlay(state, playerId, state.bidding.currentHighBid.declaration)
  }
  state.bidding.phase = 'DECLARE'
  return null
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
  const felkezes = state.options.felkezes
  // Félkezes turns are declare-or-pass (phase DECLARE for the opener, BID after);
  // normal bidding declares only in the DECLARE phase (after discarding/robbing).
  const canDeclare = felkezes
    ? (state.bidding.phase === 'DECLARE' || state.bidding.phase === 'BID')
    : state.bidding.phase === 'DECLARE'
  if (!canDeclare) throw new Error('Not in declare phase')

  const declaration = _declarationFromPayload(payload)
  const current = state.bidding.currentHighBid
  if (current && !isHigherDeclaration(declaration, current.declaration)) {
    throw new Error('Declaration must out-rank the current bid')
  }

  state.bidding.currentHighBid = { playerId, declaration }
  state.bidding.consecutivePasses = 0
  state.bidding.history.push({ playerId, action: 'declare', label: declarationLabel(declaration) })

  state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  state.bidding.phase = felkezes ? 'BID' : 'ROB_OFFER'
}

function applyRob(state, playerId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (state.bidding.phase !== 'ROB_OFFER') throw new Error('Cannot rob now')

  state.talonInHand = { playerId, cardIds: state.talon.map((c) => c.id) }
  state.hands[playerId] = [...state.hands[playerId], ...state.talon]
  state.talon = []
  state.bidding.phase = 'DISCARD'
  state.bidding.history.push({ playerId, action: 'rob' })
}

function applyBidPass(state, playerId) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  const felkezes = state.options.felkezes
  const passPhase = felkezes ? 'BID' : 'ROB_OFFER'
  if (state.bidding.phase !== passPhase) throw new Error('Cannot pass now')

  state.bidding.consecutivePasses++
  state.bidding.history.push({ playerId, action: 'pass' })

  if (state.bidding.consecutivePasses >= state.players.length && state.bidding.currentHighBid) {
    return felkezes ? _felkezesSecondDeal(state) : _resolveBidding(state)
  }

  state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  return { biddingComplete: false }
}

// Félkezes: once the winning bid is set, deal the 17-card reserve — declarer +7
// (→12), each defender +5 (→10) — then have the declarer discard 2.
function _felkezesSecondDeal(state) {
  const { playerId: declarerId } = state.bidding.currentHighBid
  const declarer = state.players.find((p) => p.id === declarerId)
  const reserve = state.reserve
  state.hands[declarerId] = [...state.hands[declarerId], ...reserve.slice(0, 7)]
  let idx = 7
  state.players.filter((p) => p.id !== declarerId).forEach((p) => {
    state.hands[p.id] = [...state.hands[p.id], ...reserve.slice(idx, idx + 5)]
    idx += 5
  })
  state.reserve = []
  state.bidding.phase = 'POST_DEAL_DISCARD'
  state.bidding.currentBidderSeat = declarer.seatIndex
  return { secondDeal: true, declarerId }
}

function _resolveBidding(state) {
  const { playerId: declarerId, declaration } = state.bidding.currentHighBid
  return _startPlay(state, declarerId, declaration)
}

// Build the play state and enter PLAYING. Shared by normal resolution and the
// félkezes post-deal discard.
function _startPlay(state, declarerId, declaration) {
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
    marriages: {}, // playerId -> [{ suit, value }] announced on that player's first card
    claim: null, // { responses } while a "nincs több ütés" claim is pending
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

// Validate & record a player's announced marriages (called on their first card).
// Marriages (jelentés) only count in contracts that carry a Parti; otherwise
// there is nothing for them to contribute to, so they cannot be announced.
function _recordMarriages(state, playerId, announcedSuits) {
  if (!state.play.declaration.hasParti) {
    state.play.marriages[playerId] = []
    return []
  }
  const trumpSuit = state.play.declaration.trumpSuit
  const available = availableMarriages(state.hands[playerId])
  const marriages = []
  for (const suit of announcedSuits || []) {
    if (!available.includes(suit)) throw new Error('You do not hold that marriage')
    marriages.push({ suit, value: suit === trumpSuit ? 40 : 20 })
  }
  state.play.marriages[playerId] = marriages
  return marriages
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

  // Trump is set above; record the declarer's announced marriages.
  const marriages = _recordMarriages(state, playerId, announcedSuits)
  decl.announcedMarriages = marriages // declarer's, for display
  // 40-100 / 20-100 imply the declarer's K+O even though it isn't a jelentés.
  _autoRecordContractMarriage(state)
  state.play.openingLeadDone = true

  return _playCardCore(state, playerId, cardId)
}

// For 40-100 / 20-100 the required 40 (trump K+O) or 20 (a non-trump K+O) is
// part of the contract, not an announcement — record it silently for scoring.
function _autoRecordContractMarriage(state) {
  const decl = state.play.declaration
  const declarerId = state.play.declarerId
  const trump = decl.trumpSuit
  const avail = availableMarriages(state.hands[declarerId])
  const list = state.play.marriages[declarerId] || []
  const has = (s) => list.some((m) => m.suit === s)
  if (decl.scoring.includes('forty_hundred') && trump && avail.includes(trump) && !has(trump)) {
    list.push({ suit: trump, value: 40 })
  }
  if (decl.scoring.includes('twenty_hundred')) {
    const nonTrump = avail.find((s) => s !== trump && !has(s))
    if (nonTrump) list.push({ suit: nonTrump, value: 20 })
  }
  state.play.marriages[declarerId] = list
}

function applyPlayCard(state, playerId, cardId, announcedSuits) {
  // The declarer's very first card must go through applyFirstLead.
  if (!state.play.openingLeadDone && playerId === state.play.declarerId) {
    throw new Error('Declarer must make the opening lead')
  }
  // A player may announce marriages on their own first card.
  if (state.play.cardsPlayed[playerId] === 0 && announcedSuits && announcedSuits.length) {
    _recordMarriages(state, playerId, announcedSuits)
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
  // Pure Betli / Durchmars end the instant the goal becomes impossible.
  if (_goalFailed(state, winner.playerId)) {
    return { winnerId: winner.playerId, points, roundComplete: true, ...applyRoundEnd(state) }
  }
  return { winnerId: winner.playerId, points, roundComplete: false }
}

const BETLI_KEYS = new Set(['betli', 'heart_betli', 'open_betli'])
const DURCHMARS_KEYS = new Set(['durchmars', 'durchmars_nt', 'heart_durchmars', 'open_durchmars'])

// A pure Betli fails the moment the declarer wins a trick; a pure Durchmars the
// moment a defender does. (Durchmars combined with other components plays on.)
function _goalFailed(state, trickWinnerId) {
  const scoring = state.play.declaration.scoring
  if (scoring.some((k) => BETLI_KEYS.has(k))) {
    return trickWinnerId === state.play.declarerId
  }
  if (scoring.every((k) => DURCHMARS_KEYS.has(k))) {
    return trickWinnerId !== state.play.declarerId
  }
  return false
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
    marriages: state.play.marriages,
    stakeMultiplier: state.options.felkezes ? 4 : 1, // félkezes: every bid worth 4×
  })

  const declarerId = state.play.declarerId
  const buliOn = state.options.buli.on && state.buli
  if (buliOn) {
    // Buli: track ONLY the declarer's own points; defender results are not accumulated.
    const d = result.deltas[declarerId] || 0
    state.declaredScores[declarerId] = (state.declaredScores[declarerId] || 0) + d
    state.buli.points[declarerId] = (state.buli.points[declarerId] || 0) + d
    state.buli.handsPlayed++
    _markKotelezo(state, declarerId, state.play.declaration)
  } else {
    for (const [playerId, delta] of Object.entries(result.deltas)) {
      state.scores[playerId] = (state.scores[playerId] || 0) + delta
    }
  }

  state.roundResult = result
  state.phase = 'SCORING'

  if (buliOn && state.buli.handsPlayed >= state.options.buli.handsPerBuli) {
    _settleBuli(state) // marks buli.over; round:continue will show the buli result
  }
  return { roundResult: result }
}

// ── Buli (chain of hands with an end-of-buli premium) ──────────────────────────

const KOTELEZO_BETLI_KEYS = new Set(['betli', 'heart_betli', 'open_betli', 'forty_hundred'])

// (Re)start a buli — index++ and reset per-buli trackers, keeping declaredScores
// and history. Called at game start (buli on) and on "Következő buli".
function startBuli(state) {
  const points = {}
  const kotelezo = {}
  state.players.forEach((p) => { points[p.id] = 0; kotelezo[p.id] = { ulti: false, betli: false } })
  state.buli = {
    index: state.buli ? state.buli.index + 1 : 1,
    handsPlayed: 0,
    points,
    kotelezo,
    over: false,
    result: null,
    history: state.buli ? state.buli.history : [],
  }
}

// Kötelező mondások: record that the declarer said an Ulti / Betli-40-100.
function _markKotelezo(state, declarerId, declaration) {
  const k = state.buli.kotelezo[declarerId] || (state.buli.kotelezo[declarerId] = { ulti: false, betli: false })
  if (declaration.scoring.includes('ulti')) k.ulti = true
  if (declaration.scoring.some((s) => KOTELEZO_BETLI_KEYS.has(s))) k.betli = true
}

// End of buli: premium to 1st / −premium to last, per-player kötelező penalties.
function _settleBuli(state) {
  const points = state.buli.points
  const ranked = [...state.players].sort(
    (a, b) => (points[b.id] - points[a.id]) || (a.seatIndex - b.seatIndex)
  )
  const allEqual = ranked.every((p) => points[p.id] === points[ranked[0].id])

  const premiums = {}
  const penalties = {}
  state.players.forEach((p) => { premiums[p.id] = 0; penalties[p.id] = 0 })

  const premium = state.options.buli.premium
  if (!allEqual && premium) {
    premiums[ranked[0].id] = premium
    premiums[ranked[ranked.length - 1].id] = -premium
  }

  if (state.options.kotelezo.on) {
    const { ultiPenalty, betliPenalty } = state.options.kotelezo
    state.players.forEach((p) => {
      const k = state.buli.kotelezo[p.id] || { ulti: false, betli: false }
      if (!k.ulti) penalties[p.id] -= ultiPenalty
      if (!k.betli) penalties[p.id] -= betliPenalty
    })
  }

  state.players.forEach((p) => {
    state.declaredScores[p.id] = (state.declaredScores[p.id] || 0) + premiums[p.id] + penalties[p.id]
  })

  const result = {
    index: state.buli.index,
    points: { ...points },
    premiums,
    penalties,
    kotelezo: JSON.parse(JSON.stringify(state.buli.kotelezo)),
    declaredScores: { ...state.declaredScores },
  }
  state.buli.over = true
  state.buli.result = result
  state.buli.history.push(result)
}

function buliSnapshot(state) {
  if (!state.buli) return null
  return {
    index: state.buli.index,
    handsPlayed: state.buli.handsPlayed,
    handsPerBuli: state.options.buli.handsPerBuli,
    points: state.buli.points,
    kotelezo: state.buli.kotelezo,
    over: state.buli.over,
    result: state.buli.result,
  }
}

// ── Claim: "nincs több ütés" (declarer takes all remaining tricks) ─────────────

const BETLI_CONTRACTS = new Set(['betli', 'heart_betli', 'open_betli'])
function _isBetliContract(decl) {
  return decl.scoring.some((k) => BETLI_CONTRACTS.has(k))
}

// The declarer offers to take every remaining trick. Both defenders must agree.
function startClaim(state, playerId) {
  if (state.phase !== 'PLAYING') throw new Error('Not in play')
  if (playerId !== state.play.declarerId) throw new Error('Only the declarer can claim')
  if (!state.play.openingLeadDone) throw new Error('Play has not started')
  if (state.play.currentTrick.cards.length !== 0) throw new Error('Finish the current trick first')
  if (state.play.trickCount >= 10) throw new Error('No tricks left')
  if (_isBetliContract(state.play.declaration)) throw new Error('Cannot claim in a Betli')
  state.play.claim = { responses: {} }
  return { hand: state.hands[playerId], defenderIds: state.play.defenderIds }
}

function respondClaim(state, playerId, agree) {
  if (!state.play || !state.play.claim) throw new Error('No pending claim')
  if (!state.play.defenderIds.includes(playerId)) throw new Error('Only defenders may respond')
  state.play.claim.responses[playerId] = !!agree
  if (!agree) {
    state.play.claim = null
    return { rejected: true }
  }
  const allAgreed = state.play.defenderIds.every((id) => state.play.claim.responses[id] === true)
  if (!allAgreed) return { pending: true }
  state.play.claim = null
  return { accepted: true, ...applyClaimAll(state) }
}

// Award every remaining trick to the declarer and end the round. Remaining cards
// are folded into synthetic declarer-won tricks (the 7 of trump goes last so an
// announced Ulti still resolves correctly).
function applyClaimAll(state) {
  const declarerId = state.play.declarerId
  const trump = state.play.declaration.trumpSuit
  const declHand = [...state.hands[declarerId]]
  if (trump) {
    const i = declHand.findIndex((c) => c.suit === trump && c.rank === '7')
    if (i >= 0) declHand.push(declHand.splice(i, 1)[0])
  }
  const defHands = state.play.defenderIds.map((id) => [...state.hands[id]])
  let added = 0
  for (let i = 0; i < declHand.length; i++) {
    const cards = [{ playerId: declarerId, card: declHand[i] }]
    state.play.defenderIds.forEach((id, di) => {
      if (defHands[di][i]) cards.push({ playerId: id, card: defHands[di][i] })
    })
    const points = countTrickPoints(cards, trump)
    added += points
    state.play.completedTricks.push({ winnerId: declarerId, cards, points })
  }
  state.play.trickCount = 10
  state.play.declarerPoints += added + (trump ? 10 : 0) // + last-trick bonus (trump games)
  state.players.forEach((p) => { state.hands[p.id] = [] })
  state.play.currentTrick = { ledSuit: null, leaderSeat: 0, cards: [] }
  return applyRoundEnd(state)
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

// Marriages (jelentés) a player may announce right now: only on their own first
// card, and only in contracts that carry a Parti (otherwise they don't count).
function marriageOptionsFor(state, playerId) {
  if (!state.play || state.phase !== 'PLAYING') return []
  if (state.play.cardsPlayed[playerId] !== 0) return []
  if (!state.play.declaration.hasParti) return []
  return availableMarriages(state.hands[playerId])
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
  state.reserve = []
  state.talonInHand = null
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
  startClaim,
  respondClaim,
  applyRoundEnd,
  startBuli,
  buliSnapshot,
  prepareNextRound,
  availableMarriages,
  marriageOptionsFor,
  eligibleKontra,
  biddingSnapshot,
  publicDeclaration,
  handCounts,
  _getLegalCardIds,
}
