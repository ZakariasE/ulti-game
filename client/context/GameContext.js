import { createContext, useContext, useReducer } from 'react'
import { declarationLabel, componentLabel, kontraLevelName, isIndividualKontra } from '../lib/bids'
import { SUIT_NAMES } from '../lib/cards'

const GameContext = createContext(null)

// Resolve a player's display name from state ("Te" for the local player).
function nameOf(state, id) {
  if (id === state.myPlayerId) return 'Te'
  return state.players.find((p) => p.id === id)?.name || 'Valaki'
}

// Public jelentés text hides the suit — only the value (20/40) is announced.
function marriageText(marriages) {
  return (marriages || []).map((m) => `${m.value}`).join(', ')
}

// Append a transient toast to the announcement queue. Returns the fields to
// merge into the next state (keeps `announceSeq` monotonic for stable keys).
function announce(state, text, kind) {
  const id = state.announceSeq + 1
  return { announceSeq: id, announcements: [...state.announcements, { id, text, kind }] }
}

const initialState = {
  roomCode: null,
  myPlayerId: null,
  mySeat: null,
  myHand: [],
  players: [],
  phase: 'LOBBY',
  dealerIndex: null,
  draw: null, // { order:[{id,name,seatIndex}], firstDealerId, firstBidderId } — first-hand seat/dealer reveal
  handCounts: {},
  talonCardIds: [], // ids of the two cards I just picked up from the talon
  // House rules
  options: null, // { felkezes, buli:{on,handsPerBuli,premium}, kotelezo:{on,ultiPenalty,betliPenalty}, stake }
  buli: null, // buli progress/standings (buli mode)
  declaredScores: {}, // pid -> declarer-only cumulative points (buli mode)
  sidePairs: {}, // individual-kontra side-ledger "a|b" -> amount a owes b (buli mode)
  // Bidding
  currentTurnId: null,
  biddingPhase: null, // 'BID' | 'DISCARD' | 'DECLARE' | 'ROB_OFFER' | 'POST_DEAL_DISCARD' | 'DONE'
  biddingMode: null, // 'felkezes' | 'normal'
  currentHighBid: null, // { playerId, declaration }
  redealMultiplier: 1, // félkezes: ×2 per all-pass redeal
  biddingKontra: {}, // félkezes per-lane bidding kontra: { [lane]: { level, lastParty } }
  pendingBidKontra: [], // lanes staged to kontra on my bidding turn
  mandatoryBetli: false, // félkez: defenders must kontra/outbid the standing betli
  // Play
  declaration: null, // public declaration once bidding resolves
  declarerId: null,
  trumpSuit: null, // revealed at the opening lead
  pendingTrump: null, // declarer's chosen minor trump before leading (normal contracts)
  announcedMarriages: [],
  felkezesBid: false, // was the winning bid made in the 5-card round (×4)? drives info-bar stake
  kontra: {}, // component -> { level, lastParty }
  kontraOptions: [], // components I may double right now
  pendingKontra: [], // components I've staged to double with my next card
  kontraNego: null, // { turn:'declarer'|'defenders', pending:[ids] } post-trick-1 negotiation
  kontraNegoStaged: [], // lanes I've toggled to raise on my negotiation turn
  pendingDiscard: [], // cards staged to discard (combined discard+declare)
  pendingHozam: [], // félkez winner's hozámondás add-on components (POST_DEAL_DISCARD)
  marriageOptions: [], // suits I may announce right now (my first card)
  pendingMarriages: [], // suits I've toggled to announce with my next card
  marriagesByPlayer: {}, // playerId -> [{suit,value}]
  needsOpeningLead: false,
  revealedHand: null,
  revealedHands: null, // terített: { playerId -> [cards] } all hands, updated as cards are played
  felkezesReveal: null, // { playerId, cards } — required-ulti 5-card reveal
  claim: null, // { declarerId } while a "nincs több ütés" claim awaits defender votes
  claimVote: null, // this player's own vote ('yes' | 'no') on a pending claim
  concede: null, // { stage:'defenders'|'declarer', declarerId } during a parti bedobás negotiation
  concedeVote: null, // this defender's own choice ('ok' | 'hundred')
  currentTrick: [],
  completedTricks: [], // [{ winnerId, cards }]
  lastTrickWinnerId: null,
  legalCardIds: [],
  scores: {},
  roundResult: null,
  readyState: null,
  announcements: [], // transient toasts: [{ id, text, kind }]
  announceSeq: 0,
  lastBidSeq: 0, // bidding.history length already flashed (dedup for per-bid banners)
  error: null,
}

// Build the toast fields for a single bidding-history action. Every action gets a
// banner (declare / pass / rob / kontra), in both the félkez and normal rounds.
// `decl` is the standing declaration, needed to label individual-kontra lanes.
function bidActionToast(state, entry, decl) {
  if (!entry) return null
  const who = nameOf(state, entry.playerId)
  if (entry.action === 'declare') {
    return { text: `${who} bemondta: ${entry.label}`, kind: 'contract' }
  }
  if (entry.action === 'pass') {
    return { text: `${who} passzolt`, kind: 'pass' }
  }
  if (entry.action === 'rob') {
    return { text: `${who} felvette a talont`, kind: 'contract' }
  }
  if (entry.action === 'kontra' && entry.components?.length) {
    const individual = decl && isIndividualKontra(decl)
    const comps = entry.components
      .map((lane) => (individual ? `${componentLabel(decl.scoring[0])} (${nameOf(state, lane)})` : componentLabel(lane)))
      .join(', ')
    return { text: `${who} — kontra: ${comps}`, kind: 'kontra' }
  }
  return null
}

function resetForNewRound(state) {
  return {
    ...state,
    phase: 'BIDDING',
    currentTrick: [],
    completedTricks: [],
    lastTrickWinnerId: null,
    roundResult: null,
    legalCardIds: [],
    currentTurnId: null,
    biddingPhase: null,
    currentHighBid: null,
    declaration: null,
    declarerId: null,
    felkezesBid: false,
    trumpSuit: null,
    pendingTrump: null,
    announcedMarriages: [],
    kontra: {},
    kontraOptions: [],
    pendingKontra: [],
    kontraNego: null,
    kontraNegoStaged: [],
    lastBidSeq: 0,
    biddingKontra: {},
    pendingBidKontra: [],
    pendingDiscard: [],
    pendingHozam: [],
    marriageOptions: [],
    pendingMarriages: [],
    marriagesByPlayer: {},
    needsOpeningLead: false,
    revealedHand: null,
    revealedHands: null,
    felkezesReveal: null,
    claim: null,
    claimVote: null,
    concede: null,
    concedeVote: null,
    readyState: null,
    announcements: [],
    talonCardIds: [],
  }
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'ROOM_CREATED':
    case 'ROOM_JOINED':
      return {
        ...state,
        roomCode: action.roomCode,
        myPlayerId: action.playerId,
        mySeat: action.seat,
        players: action.players,
        options: action.options || state.options,
        phase: 'LOBBY',
      }

    case 'ROOM_PLAYER_JOINED':
      return { ...state, players: action.players }

    case 'GAME_STARTED':
      return {
        ...resetForNewRound(state),
        dealerIndex: action.dealerIndex,
        draw: action.draw || null, // set only on the first deal; null on later deals
        players: action.players || state.players,
        options: action.options || state.options,
        buli: action.buli !== undefined ? action.buli : state.buli,
        declaredScores: action.declaredScores || state.declaredScores,
        sidePairs: action.sidePairs || state.sidePairs,
      }

    case 'DRAW_DISMISS':
      return { ...state, draw: null }

    case 'HAND_DEALT':
      return { ...state, myHand: action.hand }

    case 'TALON_HELD':
      return { ...state, talonCardIds: action.cardIds || [] }

    case 'BID_STATE': {
      // Flash a banner for each new bidding action (declare/kontra) exactly once.
      let bidToast = {}
      if (action.historyLen > state.lastBidSeq) {
        const t = bidActionToast(state, action.lastAction, action.currentHighBid?.declaration)
        if (t) bidToast = announce(state, t.text, t.kind)
      }
      return {
        ...state,
        ...bidToast,
        lastBidSeq: action.historyLen ?? state.lastBidSeq,
        currentTurnId: action.currentBidderId,
        biddingPhase: action.phase,
        biddingMode: action.mode || state.biddingMode,
        currentHighBid: action.currentHighBid,
        redealMultiplier: action.redealMultiplier || 1,
        biddingKontra: action.kontra || {}, // per-lane: { [lane]: { level, lastParty } }
        mandatoryBetli: !!action.mandatoryBetli,
        pendingBidKontra: [], // clear staged bidding-kontra picks on any state change
        // Keep the discard selection only while a discard is in progress.
        pendingDiscard: (action.phase === 'DISCARD' || action.phase === 'POST_DEAL_DISCARD') ? state.pendingDiscard : [],
        pendingHozam: action.phase === 'POST_DEAL_DISCARD' ? state.pendingHozam : [],
        handCounts: action.handCounts || state.handCounts,
      }
    }

    case 'FELKEZES_REDEAL':
      return { ...state, felkezesReveal: null, ...announce(state, `Új osztás — a lap értéke most ×${action.multiplier}`, 'contract') }

    case 'BID_RESOLVED':
      return {
        ...state,
        phase: 'PLAYING',
        biddingPhase: 'DONE',
        declaration: action.declaration,
        declarerId: action.declarerId,
        felkezesBid: !!action.felkezesBid,
        trumpSuit: action.declaration?.trumpSuit || null,
        ...announce(
          state,
          `${nameOf(state, action.declarerId)} bemondta: ${declarationLabel(action.declaration)}`,
          'contract',
        ),
      }

    case 'DECLARER_TRUMP': {
      // Trump was hidden during a normal declaration; announce when it's revealed.
      const reveal = action.trumpSuit && !state.trumpSuit
      return {
        ...state,
        trumpSuit: action.trumpSuit,
        ...(reveal ? announce(state, `Adu: ${SUIT_NAMES[action.trumpSuit]}`, 'trump') : {}),
      }
    }

    case 'DECLARER_MARRIAGES':
      return {
        ...state,
        announcedMarriages: action.announcedMarriages,
        marriagesByPlayer: { ...state.marriagesByPlayer, [state.declarerId]: action.announcedMarriages },
        ...(action.announcedMarriages?.length
          ? announce(state, `${nameOf(state, state.declarerId)} jelentett: ${marriageText(action.announcedMarriages)}`, 'marriage')
          : {}),
      }

    case 'MARRIAGE_ANNOUNCED':
      return {
        ...state,
        marriagesByPlayer: { ...state.marriagesByPlayer, [action.playerId]: action.marriages },
        ...(action.marriages?.length
          ? announce(state, `${nameOf(state, action.playerId)} jelentett: ${marriageText(action.marriages)}`, 'marriage')
          : {}),
      }

    case 'TOGGLE_MARRIAGE':
      return {
        ...state,
        pendingMarriages: state.pendingMarriages.includes(action.suit)
          ? state.pendingMarriages.filter((s) => s !== action.suit)
          : [...state.pendingMarriages, action.suit],
      }

    case 'SET_TRUMP_CHOICE':
      return { ...state, pendingTrump: action.suit }

    case 'TOGGLE_KONTRA':
      return {
        ...state,
        pendingKontra: state.pendingKontra.includes(action.component)
          ? state.pendingKontra.filter((c) => c !== action.component)
          : [...state.pendingKontra, action.component],
      }

    case 'TOGGLE_BID_KONTRA':
      return {
        ...state,
        pendingBidKontra: state.pendingBidKontra.includes(action.component)
          ? state.pendingBidKontra.filter((c) => c !== action.component)
          : [...state.pendingBidKontra, action.component],
      }

    case 'TOGGLE_DISCARD':
      return {
        ...state,
        pendingDiscard: state.pendingDiscard.includes(action.cardId)
          ? state.pendingDiscard.filter((id) => id !== action.cardId)
          : state.pendingDiscard.length < 2 ? [...state.pendingDiscard, action.cardId] : state.pendingDiscard,
      }

    case 'TOGGLE_HOZAM':
      return {
        ...state,
        pendingHozam: state.pendingHozam.includes(action.component)
          ? state.pendingHozam.filter((c) => c !== action.component)
          : [...state.pendingHozam, action.component],
      }

    case 'KONTRA_UPDATED': {
      const raised = action.raised || []
      let toast = {}
      if (raised.length) {
        // Name by step (Kontra/Rekontra/…), not the multiplier.
        const step = action.kontra?.[raised[0]]?.step || 1
        // Individual-kontra lanes are defender ids — label them by the contract +
        // which defender's line it is; otherwise by component.
        const individual = isIndividualKontra(state.declaration)
        const comps = raised.map((lane) => (individual
          ? `${componentLabel(state.declaration.scoring[0])} (${nameOf(state, lane)})`
          : componentLabel(lane))).join(', ')
        toast = announce(state, `${nameOf(state, action.byId)} — ${kontraLevelName(2 ** step)}: ${comps}`, 'kontra')
      }
      return { ...state, kontra: action.kontra, ...toast }
    }

    case 'KONTRA_NEGO':
      // Post-trick-1 negotiation state; turn=null means it resolved (→ trick 2).
      return {
        ...state,
        kontraNego: action.turn ? { turn: action.turn, pending: action.pending || [] } : null,
        kontra: action.kontra || state.kontra,
        kontraNegoStaged: [], // clear staged picks whenever the negotiation state changes
      }

    case 'TOGGLE_KONTRA_NEGO':
      return {
        ...state,
        kontraNegoStaged: state.kontraNegoStaged.includes(action.lane)
          ? state.kontraNegoStaged.filter((l) => l !== action.lane)
          : [...state.kontraNegoStaged, action.lane],
      }

    case 'DISMISS_ANNOUNCEMENT':
      return { ...state, announcements: state.announcements.filter((a) => a.id !== action.id) }

    case 'PLAY_TURN_START':
      return {
        ...state,
        currentTurnId: action.currentPlayerId,
        lastTrickWinnerId: null,
        needsOpeningLead: action.currentPlayerId === state.myPlayerId ? !!action.needsOpeningLead : false,
        kontraOptions: action.currentPlayerId === state.myPlayerId ? (action.kontraOptions || []) : [],
        pendingKontra: [],
        marriageOptions: action.currentPlayerId === state.myPlayerId ? (action.marriageOptions || []) : [],
        // Marriages are announced by default; the player opts out per suit.
        pendingMarriages: action.currentPlayerId === state.myPlayerId ? (action.marriageOptions || []) : [],
        kontra: action.kontra || state.kontra,
        trumpSuit: action.trumpSuit ?? state.trumpSuit,
        legalCardIds: action.currentPlayerId === state.myPlayerId ? action.legalCardIds : [],
      }

    case 'CARD_PLAYED':
      return {
        ...state,
        currentTrick: action.trickSoFar,
        handCounts: action.handCounts || state.handCounts,
        myHand:
          action.playerId === state.myPlayerId
            ? state.myHand.filter((c) => c.id !== action.card.id)
            : state.myHand,
        legalCardIds: [],
        kontraOptions: [],
        pendingKontra: [],
        marriageOptions: [],
        pendingMarriages: [],
        needsOpeningLead: false,
        // Terített reveal: drop the just-played card from the shown hand.
        revealedHands: state.revealedHands
          ? {
              ...state.revealedHands,
              [action.playerId]: (state.revealedHands[action.playerId] || []).filter((c) => c.id !== action.card.id),
            }
          : state.revealedHands,
      }

    case 'TRICK_COMPLETED':
      return {
        ...state,
        completedTricks: [...state.completedTricks, { winnerId: action.winnerId, cards: action.cards || [] }],
        lastTrickWinnerId: action.winnerId,
      }

    case 'DECLARER_REVEALED':
      return { ...state, revealedHand: action.hand }

    case 'HANDS_REVEALED':
      return { ...state, revealedHands: action.hands || null }

    case 'FELKEZES_REVEAL':
      return { ...state, felkezesReveal: action.cards ? { playerId: action.playerId, cards: action.cards } : null }

    case 'CLAIM_PENDING':
      return { ...state, claim: { declarerId: action.declarerId }, claimVote: null }

    case 'SET_CLAIM_VOTE':
      return { ...state, claimVote: action.vote }

    case 'CONCEDE_PENDING':
      return {
        ...state,
        concede: { stage: action.stage, declarerId: action.declarerId },
        // reset my vote when a fresh defender round opens; keep it once we move on
        concedeVote: action.stage === 'defenders' ? null : state.concedeVote,
      }

    case 'SET_CONCEDE_VOTE':
      return { ...state, concedeVote: action.vote }

    case 'CONCEDE_CANCELLED':
      // Declarer chose "lejátszom" — drop the negotiation, play continues.
      return {
        ...state,
        concede: null,
        concedeVote: null,
        ...announce(state, 'A felvevő mégis lejátssza a leosztást', 'kontra'),
      }

    case 'CLAIM_RESULT':
      // Accepted → round:completed follows. Rejected → drop the claim; the
      // reveal is withdrawn and play continues.
      return action.accepted
        ? { ...state, claim: null, claimVote: null }
        : {
            ...state,
            claim: null,
            claimVote: null,
            revealedHand: null,
            ...announce(state, 'A felvevő kérését elutasították', 'kontra'),
          }

    case 'ROUND_COMPLETED':
      return {
        ...state,
        phase: 'SCORING',
        roundResult: action.result,
        scores: action.scores,
        declaredScores: action.declaredScores || state.declaredScores,
        sidePairs: action.sidePairs || state.sidePairs,
        buli: action.buli || state.buli,
        claim: null,
        concede: null,
        concedeVote: null,
        kontraNego: null,
        kontraNegoStaged: [],
        currentTrick: [],
        revealedHands: null,
        readyState: null,
      }

    case 'BULI_COMPLETED':
      return {
        ...state,
        phase: 'BULI_OVER',
        buli: action.buli,
        declaredScores: action.declaredScores || state.declaredScores,
        sidePairs: action.sidePairs || state.sidePairs,
        readyState: null,
      }

    case 'ROUND_READY':
      return { ...state, readyState: { readyCount: action.readyCount, total: action.total } }

    case 'ERROR':
      return { ...state, error: action.message }

    case 'CLEAR_ERROR':
      return { ...state, error: null }

    default:
      return state
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>
}

export function useGame() {
  return useContext(GameContext)
}
