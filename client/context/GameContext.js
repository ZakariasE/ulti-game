import { createContext, useContext, useReducer } from 'react'
import { declarationLabel, componentLabel, kontraLevelName } from '../lib/bids'
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
  handCounts: {},
  talonCardIds: [], // ids of the two cards I just picked up from the talon
  // House rules
  options: null, // { felkezes, buli:{on,handsPerBuli,premium}, kotelezo:{on,ultiPenalty,betliPenalty}, stake }
  buli: null, // buli progress/standings (buli mode)
  declaredScores: {}, // pid -> declarer-only cumulative points (buli mode)
  // Bidding
  currentTurnId: null,
  biddingPhase: null, // 'BID' | 'DISCARD' | 'DECLARE' | 'ROB_OFFER' | 'POST_DEAL_DISCARD' | 'DONE'
  biddingMode: null, // 'felkezes' | 'normal'
  currentHighBid: null, // { playerId, declaration }
  redealMultiplier: 1, // félkezes: ×2 per all-pass redeal
  biddingKontra: { level: 0, multiplier: 1, lastParty: null }, // félkezes bidding-kontra chain
  // Play
  declaration: null, // public declaration once bidding resolves
  declarerId: null,
  trumpSuit: null, // revealed at the opening lead
  pendingTrump: null, // declarer's chosen minor trump before leading (normal contracts)
  announcedMarriages: [],
  kontra: {}, // component -> { level, lastParty }
  kontraOptions: [], // components I may double right now
  pendingKontra: [], // components I've staged to double with my next card
  felkezesKontraOk: false, // félkezes: I may escalate the hand-wide kontra now
  pendingFelkezesKontra: false, // félkezes: staged escalation for my next card
  pendingDiscard: [], // cards staged to discard (combined discard+declare)
  marriageOptions: [], // suits I may announce right now (my first card)
  pendingMarriages: [], // suits I've toggled to announce with my next card
  marriagesByPlayer: {}, // playerId -> [{suit,value}]
  needsOpeningLead: false,
  revealedHand: null,
  felkezesReveal: null, // { playerId, cards } — required-ulti 5-card reveal
  claim: null, // { declarerId } while a "nincs több ütés" claim awaits defender votes
  claimVote: null, // this player's own vote ('yes' | 'no') on a pending claim
  currentTrick: [],
  completedTricks: [], // [{ winnerId, cards }]
  lastTrickWinnerId: null,
  legalCardIds: [],
  scores: {},
  roundResult: null,
  readyState: null,
  announcements: [], // transient toasts: [{ id, text, kind }]
  announceSeq: 0,
  error: null,
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
    trumpSuit: null,
    pendingTrump: null,
    announcedMarriages: [],
    kontra: {},
    kontraOptions: [],
    pendingKontra: [],
    pendingDiscard: [],
    marriageOptions: [],
    pendingMarriages: [],
    marriagesByPlayer: {},
    needsOpeningLead: false,
    revealedHand: null,
    felkezesReveal: null,
    claim: null,
    claimVote: null,
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
        players: action.players || state.players,
        options: action.options || state.options,
        buli: action.buli !== undefined ? action.buli : state.buli,
        declaredScores: action.declaredScores || state.declaredScores,
      }

    case 'HAND_DEALT':
      return { ...state, myHand: action.hand }

    case 'TALON_HELD':
      return { ...state, talonCardIds: action.cardIds || [] }

    case 'BID_STATE':
      return {
        ...state,
        currentTurnId: action.currentBidderId,
        biddingPhase: action.phase,
        biddingMode: action.mode || state.biddingMode,
        currentHighBid: action.currentHighBid,
        redealMultiplier: action.redealMultiplier || 1,
        biddingKontra: action.kontra || { level: 0, multiplier: 1, lastParty: null },
        // Keep the discard selection only while a discard is in progress.
        pendingDiscard: (action.phase === 'DISCARD' || action.phase === 'POST_DEAL_DISCARD') ? state.pendingDiscard : [],
        handCounts: action.handCounts || state.handCounts,
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

    case 'TOGGLE_DISCARD':
      return {
        ...state,
        pendingDiscard: state.pendingDiscard.includes(action.cardId)
          ? state.pendingDiscard.filter((id) => id !== action.cardId)
          : state.pendingDiscard.length < 2 ? [...state.pendingDiscard, action.cardId] : state.pendingDiscard,
      }

    case 'KONTRA_UPDATED': {
      const raised = action.raised || []
      let toast = {}
      if (raised.length) {
        const level = action.kontra?.[raised[0]]?.level || 2
        const comps = raised.map(componentLabel).join(', ')
        toast = announce(state, `${nameOf(state, action.byId)} — ${kontraLevelName(level)}: ${comps}`, 'kontra')
      }
      return { ...state, kontra: action.kontra, ...toast }
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
        felkezesKontraOk: action.currentPlayerId === state.myPlayerId ? !!action.felkezesKontra : false,
        pendingFelkezesKontra: false,
        biddingKontra: action.biddingKontra || state.biddingKontra,
        marriageOptions: action.currentPlayerId === state.myPlayerId ? (action.marriageOptions || []) : [],
        // Marriages are announced by default; the player opts out per suit.
        pendingMarriages: action.currentPlayerId === state.myPlayerId ? (action.marriageOptions || []) : [],
        kontra: action.kontra || state.kontra,
        trumpSuit: action.trumpSuit ?? state.trumpSuit,
        legalCardIds: action.currentPlayerId === state.myPlayerId ? action.legalCardIds : [],
      }

    case 'TOGGLE_FELKEZES_KONTRA':
      return { ...state, pendingFelkezesKontra: !state.pendingFelkezesKontra }

    case 'FELKEZES_PLAYKONTRA':
      return {
        ...state,
        biddingKontra: { ...(state.biddingKontra || {}), level: action.level, multiplier: action.multiplier },
        ...announce(state, `${nameOf(state, action.byId)} — ${kontraLevelName(2 ** action.level)} (×${action.multiplier})`, 'kontra'),
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
        felkezesKontraOk: false,
        pendingFelkezesKontra: false,
        marriageOptions: [],
        pendingMarriages: [],
        needsOpeningLead: false,
      }

    case 'TRICK_COMPLETED':
      return {
        ...state,
        completedTricks: [...state.completedTricks, { winnerId: action.winnerId, cards: action.cards || [] }],
        lastTrickWinnerId: action.winnerId,
      }

    case 'DECLARER_REVEALED':
      return { ...state, revealedHand: action.hand }

    case 'FELKEZES_REVEAL':
      return { ...state, felkezesReveal: action.cards ? { playerId: action.playerId, cards: action.cards } : null }

    case 'CLAIM_PENDING':
      return { ...state, claim: { declarerId: action.declarerId }, claimVote: null }

    case 'SET_CLAIM_VOTE':
      return { ...state, claimVote: action.vote }

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
        buli: action.buli || state.buli,
        claim: null,
        currentTrick: [],
        readyState: null,
      }

    case 'BULI_COMPLETED':
      return {
        ...state,
        phase: 'BULI_OVER',
        buli: action.buli,
        declaredScores: action.declaredScores || state.declaredScores,
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
