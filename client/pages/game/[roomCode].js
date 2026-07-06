import Head from 'next/head'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import WaitingRoom from '../../components/lobby/WaitingRoom'
import GameTable from '../../components/game/GameTable'

export default function GamePage() {
  const router = useRouter()
  const { roomCode } = router.query
  const { socket, emit } = useSocket()
  const { state, dispatch } = useGame()

  // Register all server → client events
  useEffect(() => {
    if (!socket || !roomCode) return

    // If we landed here directly (refresh), rejoin
    if (!state.roomCode) {
      const savedName = sessionStorage.getItem('playerName')
      if (savedName) emit('room:join', { roomCode, playerName: savedName })
      else router.push('/')
    }

    const handlers = {
      'room:playerJoined': (d) => dispatch({ type: 'ROOM_PLAYER_JOINED', ...d }),
      'game:started':      (d) => dispatch({ type: 'GAME_STARTED', ...d }),
      'hand:dealt':        (d) => dispatch({ type: 'HAND_DEALT', ...d }),
      'talon:held':        (d) => dispatch({ type: 'TALON_HELD', ...d }),
      'bid:state':         (d) => dispatch({ type: 'BID_STATE', ...d }),
      'felkezes:redeal':   (d) => dispatch({ type: 'FELKEZES_REDEAL', ...d }),
      'bid:resolved':      (d) => dispatch({ type: 'BID_RESOLVED', ...d }),
      'declarer:trump':    (d) => dispatch({ type: 'DECLARER_TRUMP', ...d }),
      'declarer:marriages':(d) => dispatch({ type: 'DECLARER_MARRIAGES', ...d }),
      'marriage:announced':(d) => dispatch({ type: 'MARRIAGE_ANNOUNCED', ...d }),
      'kontra:updated':    (d) => dispatch({ type: 'KONTRA_UPDATED', ...d }),
      'declarer:revealed': (d) => dispatch({ type: 'DECLARER_REVEALED', ...d }),
      'felkezes:reveal':   (d) => dispatch({ type: 'FELKEZES_REVEAL', ...d }),
      'claim:pending':     (d) => dispatch({ type: 'CLAIM_PENDING', ...d }),
      'claim:result':      (d) => dispatch({ type: 'CLAIM_RESULT', ...d }),
      'play:turnStart':    (d) => dispatch({ type: 'PLAY_TURN_START', ...d }),
      'card:played':       (d) => dispatch({ type: 'CARD_PLAYED', ...d }),
      'trick:completed':   (d) => dispatch({ type: 'TRICK_COMPLETED', ...d }),
      'round:completed':   (d) => dispatch({ type: 'ROUND_COMPLETED', ...d }),
      'buli:completed':    (d) => dispatch({ type: 'BULI_COMPLETED', ...d }),
      'round:ready':       (d) => dispatch({ type: 'ROUND_READY', ...d }),
      'game:error':        (d) => dispatch({ type: 'ERROR', message: d.message }),
      'room:error':        (d) => dispatch({ type: 'ERROR', message: d.message }),
    }

    for (const [event, handler] of Object.entries(handlers)) {
      socket.on(event, handler)
    }

    return () => {
      for (const event of Object.keys(handlers)) socket.off(event)
    }
  }, [socket, roomCode])

  if (!roomCode) return null

  return (
    <>
      <Head><title>Ulti — {roomCode}</title></Head>
      {state.phase === 'LOBBY' ? (
        <WaitingRoom roomCode={roomCode} />
      ) : (
        <GameTable roomCode={roomCode} />
      )}
    </>
  )
}
