import { createContext, useContext, useReducer } from 'react'

const GameContext = createContext(null)

const initialState = {
  roomCode: null,
  myPlayerId: null,
  mySeat: null,
  myHand: [],
  players: [],
  phase: 'LOBBY',
  dealerIndex: null,
  handCounts: {},
  // Bidding
  currentTurnId: null,
  biddingPhase: null, // 'DISCARD' | 'DECLARE' | 'ROB_OFFER' | 'DONE'
  currentHighBid: null, // { playerId, declaration }
  // Play
  declaration: null, // public declaration once bidding resolves
  declarerId: null,
  trumpSuit: null, // revealed at the opening lead
  announcedMarriages: [],
  kontra: {}, // component -> { level, lastParty }
  kontraOptions: [], // components I may double right now
  marriageOptions: [], // suits I may announce right now (my first card)
  pendingMarriages: [], // suits I've toggled to announce with my next card
  marriagesByPlayer: {}, // playerId -> [{suit,value}]
  needsOpeningLead: false,
  openingInfo: null, // { needTrump, availableMarriages } (declarer only)
  revealedHand: null,
  currentTrick: [],
  completedTricks: [], // [{ winnerId, cards }]
  lastTrickWinnerId: null,
  legalCardIds: [],
  scores: {},
  roundResult: null,
  readyState: null,
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
    announcedMarriages: [],
    kontra: {},
    kontraOptions: [],
    marriageOptions: [],
    pendingMarriages: [],
    marriagesByPlayer: {},
    needsOpeningLead: false,
    openingInfo: null,
    revealedHand: null,
    readyState: null,
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
        phase: 'LOBBY',
      }

    case 'ROOM_PLAYER_JOINED':
      return { ...state, players: action.players }

    case 'GAME_STARTED':
      return { ...resetForNewRound(state), dealerIndex: action.dealerIndex, players: action.players || state.players }

    case 'HAND_DEALT':
      return { ...state, myHand: action.hand }

    case 'BID_STATE':
      return {
        ...state,
        currentTurnId: action.currentBidderId,
        biddingPhase: action.phase,
        currentHighBid: action.currentHighBid,
        handCounts: action.handCounts || state.handCounts,
      }

    case 'BID_RESOLVED':
      return {
        ...state,
        phase: 'PLAYING',
        biddingPhase: 'DONE',
        declaration: action.declaration,
        declarerId: action.declarerId,
        trumpSuit: action.declaration?.trumpSuit || null,
      }

    case 'OPENING_INFO':
      return { ...state, openingInfo: { needTrump: action.needTrump, availableMarriages: action.availableMarriages } }

    case 'DECLARER_TRUMP':
      return { ...state, trumpSuit: action.trumpSuit }

    case 'DECLARER_MARRIAGES':
      return {
        ...state,
        announcedMarriages: action.announcedMarriages,
        marriagesByPlayer: { ...state.marriagesByPlayer, [state.declarerId]: action.announcedMarriages },
      }

    case 'MARRIAGE_ANNOUNCED':
      return {
        ...state,
        marriagesByPlayer: { ...state.marriagesByPlayer, [action.playerId]: action.marriages },
      }

    case 'TOGGLE_MARRIAGE':
      return {
        ...state,
        pendingMarriages: state.pendingMarriages.includes(action.suit)
          ? state.pendingMarriages.filter((s) => s !== action.suit)
          : [...state.pendingMarriages, action.suit],
      }

    case 'KONTRA_UPDATED':
      return { ...state, kontra: action.kontra }

    case 'PLAY_TURN_START':
      return {
        ...state,
        currentTurnId: action.currentPlayerId,
        lastTrickWinnerId: null,
        needsOpeningLead: action.currentPlayerId === state.myPlayerId ? !!action.needsOpeningLead : false,
        kontraOptions: action.currentPlayerId === state.myPlayerId ? (action.kontraOptions || []) : [],
        marriageOptions: action.currentPlayerId === state.myPlayerId ? (action.marriageOptions || []) : [],
        pendingMarriages: [],
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

    case 'ROUND_COMPLETED':
      return { ...state, phase: 'SCORING', roundResult: action.result, scores: action.scores, currentTrick: [], readyState: null }

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
