import Head from 'next/head'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useSocket } from '../context/SocketContext'
import { useGame } from '../context/GameContext'
import styles from '../styles/Lobby.module.css'

export default function Lobby() {
  const router = useRouter()
  const { emit, socket } = useSocket()
  const { state, dispatch } = useGame()
  const [playerName, setPlayerName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = sessionStorage.getItem('playerName')
    if (saved) setPlayerName(saved)
  }, [])

  useEffect(() => {
    if (!socket) return

    socket.on('room:created', (data) => {
      sessionStorage.setItem('playerName', playerName)
      sessionStorage.setItem('playerId', data.playerId)
      dispatch({ type: 'ROOM_CREATED', ...data })
      router.push(`/game/${data.roomCode}`)
    })

    socket.on('room:joined', (data) => {
      sessionStorage.setItem('playerName', playerName)
      sessionStorage.setItem('playerId', data.playerId)
      dispatch({ type: 'ROOM_JOINED', ...data })
      router.push(`/game/${data.roomCode}`)
    })

    socket.on('room:error', ({ message }) => setError(message))

    return () => {
      socket.off('room:created')
      socket.off('room:joined')
      socket.off('room:error')
    }
  }, [socket, playerName, dispatch, router])

  function handleCreate() {
    if (!playerName.trim()) return setError('Enter your name first')
    setError('')
    emit('room:create', { playerName: playerName.trim() })
  }

  function handleJoin() {
    if (!playerName.trim()) return setError('Enter your name first')
    if (!joinCode.trim()) return setError('Enter a room code')
    setError('')
    emit('room:join', { roomCode: joinCode.trim().toUpperCase(), playerName: playerName.trim() })
  }

  return (
    <>
      <Head><title>Ulti</title></Head>
      <div className={styles.page}>
        <h1 className={styles.title}>Ulti</h1>
        <p className={styles.subtitle}>Hungarian Card Game</p>

        <div className={styles.card}>
          <label className={styles.label}>Your name</label>
          <input
            className={styles.input}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
          />

          <button className={styles.btnPrimary} onClick={handleCreate}>
            Create New Room
          </button>

          <div className={styles.divider}>or</div>

          <label className={styles.label}>Room code</label>
          <input
            className={styles.input}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="XXXXXX"
            maxLength={6}
          />
          <button className={styles.btnSecondary} onClick={handleJoin}>
            Join Game
          </button>

          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>
    </>
  )
}
