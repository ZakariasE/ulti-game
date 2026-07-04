import { createContext, useContext, useReducer } from 'react'
import { sortHand } from '../lib/cards'

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
  currentHighBid: null,
  declarer: null, // { id, contract, suit }
  // Play
  currentTrick: [],
  completedTricks: [],
  legalCardIds: [],
  scores: {},
  roundResult: null,
  readyState: null, // { readyCount, total }
  error: null,
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
      return {
        ...state,
        phase: 'BIDDING',
        dealerIndex: action.dealerIndex,
        players: action.players || state.players,
        currentTrick: [],
        completedTricks: [],
        roundResult: null,
        legalCardIds: [],
        currentTurnId: null,
        biddingPhase: null,
        currentHighBid: null,
        declarer: null,
        readyState: null,
      }

    case 'HAND_DEALT':
      return { ...state, myHand: sortHand(action.hand) }

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
        declarer: { id: action.declarerId, contract: action.contract, suit: action.suit },
      }

    case 'PLAY_TURN_START':
      return {
        ...state,
        currentTurnId: action.currentPlayerId,
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
      }

    case 'TRICK_COMPLETED':
      return {
        ...state,
        completedTricks: [...state.completedTricks, { winnerId: action.winnerId }],
        // currentTrick is cleared when the next turn starts; keep it briefly visible
      }

    case 'ROUND_COMPLETED':
      return {
        ...state,
        phase: 'SCORING',
        roundResult: action.result,
        scores: action.scores,
        currentTrick: [],
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
  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  return useContext(GameContext)
}
