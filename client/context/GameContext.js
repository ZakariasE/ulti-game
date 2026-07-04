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
  bidding: {
    currentBidderId: null,
    currentHighBid: null,
    talonOfferedTo: null,
    iHaveTalon: false,
    discarded: false,
  },
  currentTrick: [],
  completedTricks: [],
  scores: {},
  roundResult: null,
  legalCardIds: [],
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
        bidding: {
          currentBidderId: null,
          currentHighBid: null,
          talonOfferedTo: null,
          iHaveTalon: false,
          discarded: false,
        },
      }

    case 'HAND_DEALT':
      return { ...state, myHand: action.hand }

    case 'BID_TALON_OFFERED':
      return {
        ...state,
        bidding: { ...state.bidding, talonOfferedTo: action.playerId },
      }

    case 'BID_TALON_CARDS':
      return {
        ...state,
        myHand: action.cards ? [...state.myHand, ...action.cards] : state.myHand,
        bidding: { ...state.bidding, iHaveTalon: true },
      }

    case 'BID_TALON_TAKEN':
      return {
        ...state,
        bidding: { ...state.bidding, talonOfferedTo: null },
      }

    case 'BID_DISCARDED':
      return {
        ...state,
        bidding: { ...state.bidding, discarded: true, iHaveTalon: false },
      }

    case 'BID_PLACED':
      return {
        ...state,
        bidding: {
          ...state.bidding,
          currentHighBid: { playerId: action.playerId, contract: action.contract, suit: action.suit },
          currentBidderId: action.nextBidderId,
        },
      }

    case 'BID_PASSED':
      return {
        ...state,
        bidding: { ...state.bidding, currentBidderId: action.nextBidderId },
      }

    case 'BID_RESOLVED':
      return {
        ...state,
        phase: 'PLAYING',
        bidding: {
          ...state.bidding,
          declarerId: action.declarerId,
          contract: action.contract,
          suit: action.suit,
        },
      }

    case 'PLAY_TURN_START':
      return {
        ...state,
        bidding: {
          ...state.bidding,
          currentBidderId: action.currentPlayerId,
        },
        legalCardIds: action.currentPlayerId === state.myPlayerId ? action.legalCardIds : [],
      }

    case 'CARD_PLAYED':
      return {
        ...state,
        currentTrick: action.trickSoFar,
        myHand:
          action.playerId === state.myPlayerId
            ? state.myHand.filter((c) => c.id !== action.card.id)
            : state.myHand,
        legalCardIds: [],
      }

    case 'TRICK_COMPLETED':
      return {
        ...state,
        currentTrick: [],
        completedTricks: [...state.completedTricks, { winnerId: action.winnerId }],
      }

    case 'ROUND_COMPLETED':
      return {
        ...state,
        phase: 'SCORING',
        roundResult: action.result,
        scores: action.scores,
      }

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
