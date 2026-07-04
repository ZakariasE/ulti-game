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
  currentHighBid: null,
  declarer: null, // { id, contract, suit }
  kontra: { level: 1, lastParty: null },
  revealedHand: null, // declarer's open hand (open contracts)
  // Play
  currentTrick: [],
  completedTricks: [],
  lastTrickWinnerId: null,
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
        kontra: { level: 1, lastParty: null },
        revealedHand: null,
        readyState: null,
      }

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
        declarer: { id: action.declarerId, contract: action.contract, suit: action.suit },
      }

    case 'KONTRA_UPDATED':
      return { ...state, kontra: { level: action.level, lastParty: action.party } }

    case 'DECLARER_REVEALED':
      return { ...state, revealedHand: action.hand }

    case 'PLAY_TURN_START':
      return {
        ...state,
        currentTurnId: action.currentPlayerId,
        lastTrickWinnerId: null, // clear the previous trick's winner banner
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
        lastTrickWinnerId: action.winnerId,
        // currentTrick stays briefly visible until the next turn starts
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
