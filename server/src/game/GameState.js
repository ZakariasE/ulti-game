const { createDeck, shuffle, deal, dealFelkezes } = require('./deck')
const { getLegalPlays, determineTrickWinner, countTrickPoints } = require('./rules')
const {
  getInitialBidderSeat, getNextBidderSeat, fewerComponents,
  buildDeclaration, simpleDeclaration, noTrumpDeclaration, declarationLabel,
  expandDeclaration, effectiveRankValue, isIndividualKontra,
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
      handsPerBuli: Number(buli.handsPerBuli) > 0 ? Math.floor(Number(buli.handsPerBuli)) : 18,
      premium: Number.isFinite(Number(buli.premium)) ? Number(buli.premium) : 50,
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
    sidePairs: {}, // buli: individual-kontra side-ledger — "a|b" -> amount a owes b (persists all game)
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

// The kontra "lanes" for a declaration: for individual-kontra contracts (betli /
// no-trump durchmars) each defender is their own lane (keyed by defender id);
// otherwise the lanes are the scoring components. Both `bidding.kontra` and
// `play.kontra` are keyed by lane, `{ [lane]: { level, step, lastParty } }`.
function _kontraLanes(declaration, defenderIds) {
  return isIndividualKontra(declaration) ? [...defenderIds] : [...declaration.scoring]
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
      kontra: {}, // per-component bidding kontra: { [comp]: { level, lastParty } }
      // Kötelező tracking (per hand): what each player currently commits to by
      // their latest own bid; `ultiLocked` = they picked their talon back up, so
      // their ulti credit is forfeit for this hand (see _recordKotelezoSaid).
      saidUlti: {}, saidBetli: {}, ultiLocked: {},
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
      kontra: {}, // per-component (unused during base-game bidding; seeded on declare)
      saidUlti: {}, saidBetli: {}, ultiLocked: {},
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

function applyBidDiscard(state, playerId, cardIds, hozam) {
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
    // Hozámondás: the winner may expand their félkez bid with add-ons (×2 each)
    // as they set the talon. Négy ász add-on obeys the room option.
    if (hozam && hozam.length) {
      if (!state.options.fourAces && hozam.includes('four_aces')) {
        throw new Error('A Négy ász nincs engedélyezve ebben a szobában')
      }
      const expanded = expandDeclaration(state.bidding.currentHighBid.declaration, hozam)
      state.bidding.currentHighBid.declaration = expanded
      // (Kötelező credit is set in the 5-card round only — hozámondás is teljes kéz
      // and only adds, so it never changes the félkez ulti credit already recorded.)
      // Add-ons join the per-component kontra map (kontrázható in play, ×2).
      for (const c of expanded.scoring) {
        if (!state.bidding.kontra[c]) state.bidding.kontra[c] = { level: 1, step: 0, lastParty: null }
      }
    }
    // Félkezes: the winner has set their talon. REOPEN normal bidding — the
    // others (full 10-card hands) may rob the talon and outbid; the (possibly
    // expanded) félkezes bid stands as the value to beat.
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
  if (payload.type === 'trump') return buildDeclaration(payload.components, payload.color, payload.trumpSuit, { open: payload.open })
  throw new Error('Invalid declaration')
}

function applyDeclare(state, playerId, payload) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  const felkezesRound = state.bidding.mode === 'felkezes' // 5-card round
  // 5-card round: single BID phase (declare-or-pass). Normal round: after discard/rob.
  const canDeclare = felkezesRound ? state.bidding.phase === 'BID' : state.bidding.phase === 'DECLARE'
  if (!canDeclare) throw new Error('Not in declare phase')

  // Only the 5-card félkezes round names its concrete trump at declaration. The
  // reopened (teljes kéz) round behaves like the base game: hidden trump, chosen
  // at the opening lead.
  if (felkezesRound && payload.type !== 'notrump' && !MINOR_SUITS.includes(payload.trumpSuit) && payload.trumpSuit !== 'piros') {
    throw new Error('Félkezesben meg kell mondani a színt')
  }

  const declaration = _declarationFromPayload(payload)
  // Négy ász is only biddable when the room enabled it.
  if (!state.options.fourAces && declaration.components?.includes('four_aces')) {
    throw new Error('A Négy ász nincs engedélyezve ebben a szobában')
  }
  const current = state.bidding.currentHighBid
  if (current) {
    // Effective value (incl. parti): components × the round's félkez factor (×4
    // in the 5-card round, ×1 in the reopened round), plus any hozámondott add-ons
    // ×2. On a tie, the bid with fewer components wins (pure count — NOT a raw
    // rankValue re-compare, which would be wrong across rounds). Kontra is
    // per-component and does not gate outbidding — an outbid clears it.
    const curVal = effectiveRankValue(current.declaration, _felkezFactor(current.round))
    const newVal = effectiveRankValue(declaration, _felkezFactor(state.bidding.mode))
    const beats = newVal > curVal ||
      (newVal === curVal && fewerComponents(declaration, current.declaration))
    if (!beats) throw new Error('Declaration must out-rank the current bid')
  }

  state.bidding.currentHighBid = { playerId, declaration, round: state.bidding.mode }
  _recordKotelezoSaid(state, playerId, declaration) // kötelező: what this player now commits to
  // A fresh (out)bid clears any kontra: reset to this bid's kontra lanes ×1. For
  // individual-kontra contracts (betli / nt-durchmars) the lanes are the two
  // DEFENDERS (relative to this declarer); otherwise the scoring components.
  state.bidding.kontra = {}
  for (const lane of _kontraLanes(declaration, state.players.filter((p) => p.id !== playerId).map((p) => p.id))) {
    state.bidding.kontra[lane] = { level: 1, step: 0, lastParty: null }
  }
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

  // Kötelező: picking your OWN talon back up (you are the standing high bidder)
  // forfeits your ulti credit for this hand, even if you re-declare an ulti.
  if (state.options.kotelezo.on && state.bidding.currentHighBid &&
      state.bidding.currentHighBid.playerId === playerId) {
    state.bidding.ultiLocked[playerId] = true
    state.bidding.saidUlti[playerId] = false
  }

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

// Which side may escalate a component next, from its last doubler.
function _biddingKontraNextParty(k) {
  return k.lastParty === 'defenders' ? 'declarer' : 'defenders'
}

// A defender may only escalate their OWN lane in an individual-kontra contract;
// the declarer may answer any lane. (For component lanes there is no such
// restriction — either defender may double a shared component.)
function _biddingLaneOk(current, playerId, lane, myParty) {
  if (!isIndividualKontra(current.declaration)) return true
  return myParty === 'defenders' ? lane === playerId : true
}

// Which kontra lanes the given player may kontra right now (their turn, 5-card
// round, a standing bid, and their side is the one to escalate that lane).
function biddingKontraOptions(state, playerId) {
  if (!state.options.felkezes || !state.bidding) return []
  if (state.bidding.mode !== 'felkezes' || state.bidding.phase !== 'BID') return []
  const player = state.players.find((p) => p.id === playerId)
  if (!player || state.bidding.currentBidderSeat !== player.seatIndex) return []
  const current = state.bidding.currentHighBid
  if (!current) return []
  const myParty = playerId === current.playerId ? 'declarer' : 'defenders'
  return Object.entries(state.bidding.kontra)
    .filter(([lane, k]) => _biddingKontraNextParty(k) === myParty && _biddingLaneOk(current, playerId, lane, myParty))
    .map(([lane]) => lane)
}

// Félkezes per-lane bidding-kontra: on your turn (5-card round) you may double any
// subset of lanes your side is due to escalate (components, or your own defender
// line for an individual-kontra betli/nt-durchmars). ×4 per level; alternates
// defenders → declarer → defenders. An outbid clears it (see applyDeclare). The
// chain carries into play (see _startPlay).
function applyBiddingKontra(state, playerId, lanes) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error('Player not in game')
  if (state.bidding.currentBidderSeat !== player.seatIndex) throw new Error('Not your turn')
  if (!state.options.felkezes || state.bidding.mode !== 'felkezes' || state.bidding.phase !== 'BID') {
    throw new Error('Cannot kontra now')
  }
  const current = state.bidding.currentHighBid
  if (!current) throw new Error('Nothing to kontra')

  const myParty = playerId === current.playerId ? 'declarer' : 'defenders'
  const list = lanes && lanes.length ? lanes : []
  if (!list.length) throw new Error('Pick at least one component to kontra')

  const raised = []
  for (const lane of list) {
    const k = state.bidding.kontra[lane]
    if (!k) throw new Error(`Not part of this bid: ${lane}`)
    if (_biddingKontraNextParty(k) !== myParty) throw new Error('Not your side to double this now')
    if (!_biddingLaneOk(current, playerId, lane, myParty)) throw new Error('Csak a saját kontrádat léptetheted')
    k.level *= 4 // 5-card félkezes round: a kontra quadruples
    k.step = (k.step || 0) + 1
    k.lastParty = myParty
    raised.push(lane)
  }
  state.bidding.consecutivePasses = 0
  state.bidding.history.push({ playerId, action: 'kontra', components: raised })
  state.bidding.currentBidderSeat = getNextBidderSeat(player.seatIndex, state.players.length)
  return { kontra: state.bidding.kontra, raised }
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

  // Per-lane kontra state — seeded from any kontra made during bidding (félkezes
  // 5-card round); the chain continues in play from there. Lanes are per-defender
  // for individual-kontra contracts, per-component otherwise.
  const kontra = {}
  for (const lane of _kontraLanes(declaration, defenderIds)) {
    const bk = state.bidding.kontra && state.bidding.kontra[lane]
    kontra[lane] = {
      level: bk ? bk.level : 1,
      step: bk ? (bk.step || 0) : 0,
      lastParty: bk ? bk.lastParty : null,
    }
  }

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
const DURCHMARS_KEYS = new Set(['durchmars', 'durchmars_nt', 'open_durchmars'])

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
  // Required-ulti bonus (lean-trump <3): a flat +10 (+20 red) declarer premium,
  // folded into the score as its own component so it shows in the breakdown and
  // flows into declarerRaw exactly once.
  const ultiBonus = _requiredUltiBonus(state, state.play.declaration)
  const result = calculateRoundScore({
    declaration: state.play.declaration,
    declarerId: state.play.declarerId,
    defenderIds: state.play.defenderIds,
    completedTricks: state.play.completedTricks,
    talon: state.talon,
    declarerPoints: state.play.declarerPoints,
    kontra: state.play.kontra,
    marriages: state.play.marriages,
    // Per-component multiplier is computed inside calculateRoundScore: original
    // components ×4 (only if the bid was won in the 5-card round), hozámondott
    // add-ons ×2, normal teljes-kéz ×1; all × redeal doublings.
    felkezesBid: !!state.play.felkezesBid,
    redealMultiplier: state.redealMultiplier || 1,
    ultiBonus,
  })

  const declarerId = state.play.declarerId
  const buliOn = state.options.buli.on && state.buli
  if (buliOn) {
    // Buli: track ONLY the declarer's own RAW points (one unit, not the pairwise
    // ×2 — the pairwise expansion is done at Elszámolás). declarerRaw already
    // includes the ulti bonus (added as a component above).
    const d = result.declarerRaw || 0
    state.declaredScores[declarerId] = (state.declaredScores[declarerId] || 0) + d
    state.buli.points[declarerId] = (state.buli.points[declarerId] || 0) + d
    // "Üres" hand: the declarer's net is 0 (e.g. a won Ulti cancelling a
    // kontrázott lost Parti). Nothing moved the ledger, so it does NOT count
    // toward the buli's hand count — only the dealer shifts and it is replayed.
    result.empty = d === 0
    if (!result.empty) state.buli.handsPlayed++
    // Individual-kontra extras (betli / nt-durchmars) go to the persistent side
    // ledger — they surface only at Elszámolás, never in the buli standing.
    if (result.sidePairs && !result.empty) {
      for (const [pair, amt] of Object.entries(result.sidePairs)) {
        if (amt) state.sidePairs[pair] = (state.sidePairs[pair] || 0) + amt
      }
    }
    _markKotelezo(state)
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

// A committed FÉLKEZ ulti with <3 trump cards in the 5-card hand pays +10 (+20 red)
// to the declarer who plays it. Only counts when the bid was won in the 5-card
// round and the ulti is original (not a hozámondott add-on) — so it never goes to
// someone who outbid a félkez ulti in teljes kéz.
function _requiredUltiBonus(state, declaration) {
  if (!state.options.kotelezo.on || !declaration.scoring.includes('ulti')) return 0
  if (!state.play.felkezesBid) return 0
  if ((declaration.hozam || []).includes('ulti')) return 0
  const count = _ultiTrumpCount(state, declaration)
  if (count === null || count >= 3) return 0
  return declaration.color === 'red' ? 20 : 10
}

// Kötelező mondások — record what a player commits to as they declare. Credit is
// for *saying* it (trump count is irrelevant to credit; it only gates the +10/+20
// premium on a played ulti). A player's LATEST own bid defines their commitment,
// so switching your own bid to something without the ulti drops the ulti (félkez).
// Being outbid by ANOTHER player doesn't touch your flags → you keep credit.
// `ultiLocked` (set when you pick your own talon back up in teljes kéz) forfeits
// the ulti for the hand even if you re-declare one.
function _recordKotelezoSaid(state, playerId, declaration) {
  if (!state.options.kotelezo.on || !state.bidding) return
  // A required saying only counts if declared in the FÉLKEZ (5-card) round — a bid
  // (or hozámondás add-on) made in teljes kéz does NOT earn the acknowledgment, so
  // outbidding someone's félkez ulti in teljes kéz gives the outbidder no credit.
  if (state.bidding.mode !== 'felkezes') return
  const b = state.bidding
  if (!b.ultiLocked[playerId]) b.saidUlti[playerId] = declaration.scoring.includes('ulti')
  b.saidBetli[playerId] = declaration.scoring.some((s) => KOTELEZO_BETLI_KEYS.has(s))
}

// At hand end, fold each player's said-flags into the buli's sticky kötelező
// record (once true it stays true across the buli's hands).
function _markKotelezo(state) {
  const b = state.bidding || {}
  state.players.forEach((p) => {
    const k = state.buli.kotelezo[p.id] || (state.buli.kotelezo[p.id] = { ulti: false, betli: false })
    if (b.saidUlti && b.saidUlti[p.id]) k.ulti = true
    if (b.saidBetli && b.saidBetli[p.id]) k.betli = true
  })
}

// End of buli: kötelező penalties FIRST, then premium to 1st / −premium to last.
// The premium is ranked on the penalty-ADJUSTED score (points + penalties), so a
// player who leads on buli points but missed a required saying can drop to last
// and lose the premium accordingly. Ties split the premium: a 2-way tie for 1st
// (or last) splits +premium (−premium) between the two; a 3-way tie (everyone
// equal) pays no premium at all.
//
// This only COMPUTES the settlement and marks the buli over — the premiums/
// penalties are not folded into declaredScores yet (that happens at the buli-over
// screen via commitBuliSettlement), so the last hand's scoring view still shows
// pre-settlement totals.
function _settleBuli(state) {
  const points = state.buli.points

  const premiums = {}
  const penalties = {}
  state.players.forEach((p) => { premiums[p.id] = 0; penalties[p.id] = 0 })

  // Penalties first.
  if (state.options.kotelezo.on) {
    const { ultiPenalty, betliPenalty } = state.options.kotelezo
    state.players.forEach((p) => {
      const k = state.buli.kotelezo[p.id] || { ulti: false, betli: false }
      if (!k.ulti) penalties[p.id] -= ultiPenalty
      if (!k.betli) penalties[p.id] -= betliPenalty
    })
  }

  // Premium ranks by the penalty-adjusted score.
  const adjusted = {}
  state.players.forEach((p) => { adjusted[p.id] = points[p.id] + penalties[p.id] })
  const premium = state.options.buli.premium
  const vals = state.players.map((p) => adjusted[p.id])
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  if (premium && max !== min) { // max === min ⇒ everyone tied ⇒ no premium
    const firstGroup = state.players.filter((p) => adjusted[p.id] === max)
    const lastGroup = state.players.filter((p) => adjusted[p.id] === min)
    // A group of all 3 only happens when everyone's tied (handled above); a
    // 2-way tie splits its premium evenly.
    if (firstGroup.length < state.players.length) {
      firstGroup.forEach((p) => { premiums[p.id] += premium / firstGroup.length })
    }
    if (lastGroup.length < state.players.length) {
      lastGroup.forEach((p) => { premiums[p.id] -= premium / lastGroup.length })
    }
  }

  // Projected final totals (for display); not applied to declaredScores yet.
  const projected = {}
  state.players.forEach((p) => {
    projected[p.id] = (state.declaredScores[p.id] || 0) + premiums[p.id] + penalties[p.id]
  })

  const result = {
    index: state.buli.index,
    points: { ...points },
    premiums,
    penalties,
    kotelezo: JSON.parse(JSON.stringify(state.buli.kotelezo)),
    declaredScores: projected,
  }
  state.buli.over = true
  state.buli.settled = false
  state.buli.result = result
  state.buli.history.push(result)
}

// Fold the computed premiums/penalties into declaredScores. Called when moving to
// the buli-over screen (idempotent). Kept separate from _settleBuli so the last
// hand's scoring view shows pre-settlement totals.
function commitBuliSettlement(state) {
  if (!state.buli || !state.buli.over || state.buli.settled) return
  const r = state.buli.result
  state.players.forEach((p) => {
    state.declaredScores[p.id] = (state.declaredScores[p.id] || 0) + (r.premiums[p.id] || 0) + (r.penalties[p.id] || 0)
  })
  state.buli.settled = true
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

// Each kontra state is { level (scoring multiplier), step (escalation count),
// lastParty }. `step` (not the multiplier) drives timing/naming, since a 5-card
// kontra is ×4 and a teljes-kéz kontra is ×2 — so level ≠ 2^step in general.
// After `step` escalations, the NEXT is raised by:
//   defenders when step is even, on their (step/2 + 1)-th card
//   declarer  when step is odd,  on their ((step+1)/2 + 1)-th card
function _kontraExpectation(step) {
  const d = step || 0
  if (d % 2 === 0) return { party: 'defenders', cardNum: d / 2 + 1 }
  return { party: 'declarer', cardNum: (d + 1) / 2 + 1 }
}

// In an individual-kontra contract a defender may only escalate their OWN lane;
// the declarer may answer any lane. Component lanes (uniform) have no such rule.
function _playLaneOk(state, playerId, lane, party) {
  if (!isIndividualKontra(state.play.declaration)) return true
  return party === 'defenders' ? lane === playerId : true
}

function applyKontra(state, playerId, lanes) {
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

  const list = lanes && lanes.length ? lanes : eligibleKontra(state, playerId)
  const raised = []
  for (const lane of list) {
    const k = state.play.kontra[lane]
    if (!k) throw new Error(`Not part of this declaration: ${lane}`)
    const exp = _kontraExpectation(k.step || 0)
    if (exp.party !== party) throw new Error('Not your side to double this now')
    if (exp.cardNum !== myCardNum) throw new Error('Not the right moment to double')
    if (k.lastParty === party) throw new Error('Waiting for the other side')
    if (!_playLaneOk(state, playerId, lane, party)) throw new Error('Csak a saját kontrádat léptetheted')
    k.level *= 2 // teljes kéz (10 cards): a play kontra doubles
    k.step = (k.step || 0) + 1
    k.lastParty = party
    raised.push(lane)
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

// The kontra lanes the given player may double right now (component keys, or
// their own defender line for an individual-kontra contract).
function eligibleKontra(state, playerId) {
  if (!state.play || state.phase !== 'PLAYING') return []
  const player = state.players.find((p) => p.id === playerId)
  const { currentTrick } = state.play
  const expectedSeat = (currentTrick.leaderSeat + currentTrick.cards.length) % state.players.length
  if (!player || player.seatIndex !== expectedSeat) return []
  const party = playerId === state.play.declarerId ? 'declarer' : 'defenders'
  const myCardNum = state.play.cardsPlayed[playerId] + 1
  return Object.entries(state.play.kontra)
    .filter(([lane, k]) => {
      const exp = _kontraExpectation(k.step || 0)
      return exp.party === party && exp.cardNum === myCardNum && k.lastParty !== party &&
        _playLaneOk(state, playerId, lane, party)
    })
    .map(([lane]) => lane)
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
    kontra: b.kontra || {}, // per-component bidding kontra (client derives eligible options)
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
    hozam: decl.hozam || [], // hozámondott add-ons (score ×2), for display/value
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
  biddingKontraOptions,
  applyPlayCard,
  startClaim,
  respondClaim,
  applyRoundEnd,
  startBuli,
  commitBuliSettlement,
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
