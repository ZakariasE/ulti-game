import Head from 'next/head'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useSocket } from '../context/SocketContext'
import { useGame } from '../context/GameContext'
import GameOptionsModal from '../components/lobby/GameOptionsModal'
import styles from '../styles/Lobby.module.css'

export default function Lobby() {
  const router = useRouter()
  const { emit, socket, connected } = useSocket()
  const { state, dispatch } = useGame()
  const [playerName, setPlayerName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [showOptions, setShowOptions] = useState(false)

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
    if (!connected) return setError('Nincs kapcsolat a szerverrel. Fut a szerver?')
    if (!playerName.trim()) return setError('Előbb add meg a neved')
    setError('')
    setShowOptions(true)
  }

  function createWithOptions(options) {
    setShowOptions(false)
    emit('room:create', { playerName: playerName.trim(), options })
  }

  function handleJoin() {
    if (!connected) return setError('Nincs kapcsolat a szerverrel. Fut a szerver?')
    if (!playerName.trim()) return setError('Előbb add meg a neved')
    if (!joinCode.trim()) return setError('Add meg a szobakódot')
    setError('')
    emit('room:join', { roomCode: joinCode.trim().toUpperCase(), playerName: playerName.trim() })
  }

  return (
    <>
      <Head><title>Ulti</title></Head>
      <div className={styles.page}>
        <h1 className={styles.title}>Ulti</h1>
        <p className={styles.subtitle}>Magyar kártyajáték</p>
        <p className={styles.status}>
          {connected ? '● Csatlakozva' : '○ Csatlakozás a szerverhez...'}
        </p>

        <div className={styles.card}>
          <label className={styles.label}>Neved</label>
          <input
            className={styles.input}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Add meg a neved"
            maxLength={20}
          />

          <button className={styles.btnPrimary} onClick={handleCreate}>
            Új szoba létrehozása
          </button>

          <div className={styles.divider}>vagy</div>

          <label className={styles.label}>Szobakód</label>
          <input
            className={styles.input}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="XXXXXX"
            maxLength={6}
          />
          <button className={styles.btnSecondary} onClick={handleJoin}>
            Csatlakozás
          </button>

          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>
      {showOptions && (
        <GameOptionsModal onConfirm={createWithOptions} onCancel={() => setShowOptions(false)} />
      )}
    </>
  )
}
