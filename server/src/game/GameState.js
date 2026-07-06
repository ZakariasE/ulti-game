const { createDeck, shuffle, deal, dealFelkezes } = require('./deck')
const { getLegalPlays, determineTrickWinner, countTrickPoints } = require('./rules')
const {
  getInitialBidderSeat, getNextBidderSeat, isHigherDeclaration, rankValue,
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
    fourAces: o.fourAces !== false, // Négy ász bemondás available (default on)
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
    redealMultiplier: 1, // félkezes: ×2 per all-pass redeal (compounds within a hand)
    felkezesReveal: null, // { playerId, cards } — required-ulti 5-card reveal during bidding
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

// Félkezes value multiplier: a bid made in the 5-card round is worth ×4; a bid
// made in the reopened (teljes kéz) round is a normal bid (×1).
function _felkezFactor(round) {
  return round === 'felkezes' ? 4 : 1
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
  state.felkezesReveal = null

  if (state.options.felkezes) {
    // Deal 5 each; hold the other 17 for the second deal. No talon during bidding.
    const { hands, reserve } = dealFelkezes(deck)
    state.players.forEach((p) => { state.hands[p.id] = hands[p.seatIndex] })
    state.reserve = reserve
    state.bidding = {
      currentBidderSeat: firstBidderSeat,
      phase: 'BID', // félkezes: each turn is declare-or-pass (opener may pass)
      mode: 'felkezes', // 5-card round (vs 'normal' reopened round)
      consecutivePasses: 0,
      currentHighBid: null,
      kontra: { level: 0, multiplier: 1, lastParty: null }, // bidding-time kontra chain
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
      mode: 'normal',
      consecutivePasses: 0,
      currentHighBid: null,
      kontra: { level: 0, multiplier: 1, lastParty: null },
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
    // Félkezes: the winner has set their talon. REOPEN normal bidding — the
    // others (full 10-card hands) may rob the talon and outbid; the félkezes
    // bid stands as the value to beat.
    state.bidding.mode = 'normal'
    state.bidding.phase = 'ROB_OFFER'
    state.bidding.consecutivePasses = 0
    state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, state.players.length)
    return { reopened: true }
  }
  state.bidding.phase = 'DECLARE'
  return null
}

// payload: { type:'simple', color, trumpSuit? } | { type:'trump', components, color, trumpSuit? }
//        | { type:'notrump', contract }   (trumpSuit is the concrete suit in félkezes)
function _declarationFromPayload(payload) {
  if (payload.type === 'simple') return simpleDeclaration(payload.color, payload.trumpSuit)
  if (payload.type === 'notrump') return noTrumpDeclaration(payload.contract)
  if (payload.type === 'trump') return buildDeclaration(payload.components, payload.color, payload.trumpSuit)
  throw new Error('Invalid declaration')
}

function applyDeclare(state, playerId, payload) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  const felkezesRound = state.bidding.mode === 'felkezes' // 5-card round
  const felkezesGame = state.options.felkezes
  // 5-card round: single BID phase (declare-or-pass). Normal round: after discard/rob.
  const canDeclare = felkezesRound ? state.bidding.phase === 'BID' : state.bidding.phase === 'DECLARE'
  if (!canDeclare) throw new Error('Not in declare phase')

  // Félkezes game: a trump goal (anything but a no-trump contract) must name its suit.
  if (felkezesGame && payload.type !== 'notrump' && !MINOR_SUITS.includes(payload.trumpSuit) && payload.trumpSuit !== 'piros') {
    throw new Error('Félkezesben meg kell mondani a színt')
  }

  const declaration = _declarationFromPayload(payload)
  // Négy ász is only biddable when the room enabled it.
  if (!state.options.fourAces && declaration.components?.includes('four_aces')) {
    throw new Error('A Négy ász nincs engedélyezve ebben a szobában')
  }
  const current = state.bidding.currentHighBid
  if (current) {
    // Effective value = rank × 4 (only for a bid made in the 5-card félkezes
    // round) × any standing kontra. A fresh outbid clears the kontra and, if
    // made in the reopened round, is a normal (teljes kéz) bid worth ×1.
    const curVal = rankValue(current.declaration) * _felkezFactor(current.round) * state.bidding.kontra.multiplier
    const newVal = rankValue(declaration) * _felkezFactor(state.bidding.mode)
    const beats = newVal > curVal ||
      (newVal === curVal && isHigherDeclaration(declaration, current.declaration))
    if (!beats) throw new Error('Declaration must out-rank the current bid')
  }

  state.bidding.currentHighBid = { playerId, declaration, round: state.bidding.mode }
  state.bidding.kontra = { level: 0, multiplier: 1, lastParty: null } // outbid clears the kontra
  state.bidding.consecutivePasses = 0
  state.bidding.history.push({ playerId, action: 'declare', label: declarationLabel(declaration) })

  // Required ulti: reveal the announcer's 5-card hand until the second deal
  // (only in the 5-card round).
  let revealed = false
  if (felkezesRound && state.options.kotelezo.on && declaration.scoring.includes('ulti')) {
    state.felkezesReveal = { playerId, cards: state.hands[playerId].slice() }
    revealed = true
  }

  state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  state.bidding.phase = felkezesRound ? 'BID' : 'ROB_OFFER'
  return { revealed }
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
  const felkezesRound = state.bidding.mode === 'felkezes'
  const passPhase = felkezesRound ? 'BID' : 'ROB_OFFER'
  if (state.bidding.phase !== passPhase) throw new Error('Cannot pass now')

  state.bidding.consecutivePasses++
  state.bidding.history.push({ playerId, action: 'pass' })

  const n = state.players.length
  // Félkezes pre-bid: nobody has declared yet. Two full go-arounds of passes
  // (2n) → redeal and double the whole-hand value.
  if (felkezesRound && !state.bidding.currentHighBid) {
    if (state.bidding.consecutivePasses >= 2 * n) return _redealFelkezes(state)
    state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, n)
    return { biddingComplete: false }
  }

  // Bidding closes when the current high bidder (declarer) passes on their own
  // turn — they always get the final say (can raise/rekontra their own bid), and
  // the turn only returns to them once everyone else has passed since the last
  // raise. This handles both the plain case (declare → pass → pass → declarer
  // passes) and the kontra case (declare → kontra → pass → declarer passes).
  if (state.bidding.currentHighBid && playerId === state.bidding.currentHighBid.playerId) {
    return felkezesRound ? _felkezesSecondDeal(state) : _resolveBidding(state)
  }

  state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, n)
  return { biddingComplete: false }
}

// Félkezes bidding-kontra: a defender (even levels) or the declarer (odd levels)
// escalates the standing bid on their turn. ×4 in the 5-card round, ×2 in the
// reopened round. The kontra inflates the value-to-beat; outbidding clears it.
function applyBiddingKontra(state, playerId) {
  if (!state.options.felkezes) throw new Error('Bidding kontra is félkezes only')
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  // Bidding-kontra lives only in the 5-card round (×4). In the reopened round the
  // kontra chain continues in play instead.
  if (state.bidding.mode !== 'felkezes' || state.bidding.phase !== 'BID') throw new Error('Cannot kontra now')
  if (!state.bidding.currentHighBid) throw new Error('Nothing to kontra')

  const k = state.bidding.kontra
  const declarerId = state.bidding.currentHighBid.playerId
  const nextParty = k.level % 2 === 0 ? 'defenders' : 'declarer'
  const myParty = playerId === declarerId ? 'declarer' : 'defenders'
  if (myParty !== nextParty) throw new Error('Not your side to double now')

  k.level += 1
  k.multiplier *= 4 // 5-card round levels are ×4
  k.lastParty = myParty
  state.bidding.consecutivePasses = 0
  state.bidding.history.push({ playerId, action: 'kontra', level: k.level })
  state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  return { kontra: { ...k } }
}

// Félkezes: everyone passed twice with no bid → redeal, whole-hand value ×2
// (compounds). The dealer/first bidder are unchanged.
function _redealFelkezes(state) {
  state.redealMultiplier *= 2
  applyDeal(state)
  return { redeal: true, multiplier: state.redealMultiplier }
}

// Félkezes: once the winning bid is set, deal the 17-card reserve — declarer +7
// (→12), each defender +5 (→10) — then have the declarer discard 2.
function _felkezesSecondDeal(state) {
  const { playerId: declarerId } = state.bidding.currentHighBid
  const declarer = state.players.find((p) => p.id === declarerId)
  const reserve = state.reserve
  // Snapshot every player's original 5-card hand — the final declarer (who may
  // change in the reopened round) needs theirs for the required-ulti trump count.
  state.felkezesFives = {}
  state.players.forEach((p) => { state.felkezesFives[p.id] = state.hands[p.id].slice() })
  state.hands[declarerId] = [...state.hands[declarerId], ...reserve.slice(0, 7)]
  let idx = 7
  state.players.filter((p) => p.id !== declarerId).forEach((p) => {
    state.hands[p.id] = [...state.hands[p.id], ...reserve.slice(idx, idx + 5)]
    idx += 5
  })
  state.reserve = []
  state.felkezesReveal = null // hide the 5-card reveal now the cards are dealt
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
    declarerFive: (state.felkezesFives && state.felkezesFives[declarerId]) || null, // félkezes 5-card hand
    // The winning bid gets the ×4 félkezes multiplier only if it was declared in
    // the 5-card round; a bid won in the reopened round is a normal (teljes) bid.
    felkezesBid: (state.bidding.currentHighBid && state.bidding.currentHighBid.round === 'felkezes'),
    // Hand-wide kontra chain (félkezes): carried from bidding, continues in play.
    biddingKontra: {
      ...(state.bidding.kontra || { level: 0, multiplier: 1, lastParty: null }),
    },
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

  // Choose trump for a hidden-trump declaration. In félkezes the suit was named
  // at declaration (decl.trumpSuit already set), so nothing to choose here.
  if (!decl.isNoTrump && !decl.trumpSuit) {
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
    // ×4 only if the winning bid was made in the 5-card félkezes round (a teljes
    // kéz bid is normal); × redeal doublings; × the hand-wide kontra chain.
    stakeMultiplier: (state.play.felkezesBid ? 4 : 1) * (state.redealMultiplier || 1) *
      (state.options.felkezes ? (state.play.biddingKontra?.multiplier || 1) : 1),
  })

  const declarerId = state.play.declarerId
  const buliOn = state.options.buli.on && state.buli
  if (buliOn) {
    // Buli: track ONLY the declarer's own RAW points (one unit, not the pairwise
    // ×2 — the pairwise expansion is done at Elszámolás).
    let d = result.declarerRaw || 0
    // Required-ulti bonus: a lean-trump (<3) 5-card ulti earns +10 (+20 red).
    const bonus = _requiredUltiBonus(state, state.play.declaration)
    if (bonus) {
      d += bonus
      result.ultiBonus = { playerId: declarerId, amount: bonus }
    }
    state.declaredScores[declarerId] = (state.declaredScores[declarerId] || 0) + d
    state.buli.points[declarerId] = (state.buli.points[declarerId] || 0) + d
    // "Üres" hand: the declarer's net is 0 (e.g. a won Ulti cancelling a
    // kontrázott lost Parti). Nothing moved the ledger, so it does NOT count
    // toward the buli's hand count — only the dealer shifts and it is replayed.
    result.empty = d === 0
    if (!result.empty) state.buli.handsPlayed++
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
  state.round = 0 // hand counter restarts each buli
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

// Cards of the trump suit held in the declarer's original 5-card hand, or null
// if unknown (non-félkezes / trump not chosen).
function _ultiTrumpCount(state, declaration) {
  const five = state.play.declarerFive
  if (!five || !declaration.trumpSuit) return null
  return five.filter((c) => c.suit === declaration.trumpSuit).length
}

// A required ulti with <3 trump cards in the 5-card hand pays +10 (+20 red).
function _requiredUltiBonus(state, declaration) {
  if (!state.options.kotelezo.on || !declaration.scoring.includes('ulti')) return 0
  const count = _ultiTrumpCount(state, declaration)
  if (count === null || count >= 3) return 0
  return declaration.color === 'red' ? 20 : 10
}

// Kötelező mondások: record that the declarer said an Ulti / Betli-40-100.
// The required Ulti only counts with ≤3 trump cards in the 5-card hand.
function _markKotelezo(state, declarerId, declaration) {
  const k = state.buli.kotelezo[declarerId] || (state.buli.kotelezo[declarerId] = { ulti: false, betli: false })
  if (declaration.scoring.includes('ulti')) {
    const count = _ultiTrumpCount(state, declaration)
    if (count === null || count <= 3) k.ulti = true
  }
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

// ── Félkezes play-kontra (retired — see below) ─────────────────────────────────

// Hand-wide play kontra is retired: play-time kontra is now per-component in
// every mode (see eligibleKontra). A kontra made during the 5-card félkezes
// auction (applyBiddingKontra) stays as a frozen hand-wide multiplier; it is no
// longer escalated during play.
function felkezesKontraEligible() {
  return false
}

// Escalate the hand-wide kontra as the player is about to play a card (×2/level).
function applyFelkezesPlayKontra(state, playerId) {
  if (!felkezesKontraEligible(state, playerId)) throw new Error('Cannot kontra now')
  const bk = state.play.biddingKontra
  bk.level += 1
  bk.multiplier *= 2
  bk.lastParty = playerId === state.play.declarerId ? 'declarer' : 'defenders'
  return { level: bk.level, multiplier: bk.multiplier }
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
  state.redealMultiplier = 1
  state.felkezesReveal = null
  state.felkezesFives = null
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
    mode: b.mode,
    redealMultiplier: state.redealMultiplier || 1,
    kontra: b.kontra || { level: 0, multiplier: 1, lastParty: null },
    currentHighBid: b.currentHighBid
      ? { playerId: b.currentHighBid.playerId, round: b.currentHighBid.round, declaration: publicDeclaration(b.currentHighBid.declaration) }
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
    // Concrete in félkezes (named at declaration); null while a minor trump is
    // still hidden in normal bidding; piros for red.
    trumpSuit: decl.trumpSuit,
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
  applyBiddingKontra,
  applyFelkezesPlayKontra,
  felkezesKontraEligible,
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
