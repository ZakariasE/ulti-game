import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/WaitingRoom.module.css'

export default function WaitingRoom({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { players, myPlayerId, options } = state
  const isHost = players[0]?.id === myPlayerId
  const canStart = players.length === 3
  const [copied, setCopied] = useState(false)

  const rules = []
  if (options?.felkezes) rules.push('Félkezes (5 lap, 4×)')
  if (options?.fourAces === false) rules.push('Négy ász kikapcsolva')
  if (options?.buli?.on) rules.push(`Buli — ${options.buli.handsPerBuli} leosztás, prémium ${options.buli.premium}`)
  if (options?.kotelezo?.on) rules.push(`Kötelező mondások (Ulti −${options.kotelezo.ultiPenalty}, Betli/40-100 −${options.kotelezo.betliPenalty})`)
  if (options?.stake != null) rules.push(`Tét: ${options.stake} / pont`)

  function copyCode() {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Várakozás játékosokra...</h1>

      <div className={styles.roomCode}>
        <span className={styles.code}>{roomCode}</span>
        <button className={`${styles.copyBtn} ${copied ? styles.copied : ''}`} onClick={copyCode}>
          {copied ? 'Másolva ✓' : 'Másolás'}
        </button>
      </div>
      <p className={styles.hint}>Oszd meg ezt a kódot 2 baráttal</p>

      <div className={styles.playerList}>
        <h3>Játékosok ({players.length} / 3)</h3>
        {players.map((p) => (
          <div key={p.id} className={styles.player}>
            <span className={styles.dot}>●</span>
            {p.name} {p.id === myPlayerId ? '(te)' : ''}
          </div>
        ))}
        {Array.from({ length: 3 - players.length }).map((_, i) => (
          <div key={`empty-${i}`} className={`${styles.player} ${styles.empty}`}>
            <span className={styles.dot}>○</span>
            várakozás...
          </div>
        ))}
      </div>

      <div className={styles.playerList}>
        <h3>Házirend</h3>
        {rules.length ? rules.map((r, i) => (
          <div key={i} className={styles.player}><span className={styles.dot}>•</span>{r}</div>
        )) : <div className={`${styles.player} ${styles.empty}`}>Alap szabályok</div>}
      </div>

      {isHost && (
        <button
          className={styles.startBtn}
          disabled={!canStart}
          onClick={() => emit('game:start', { roomCode })}
        >
          {canStart ? 'Játék indítása' : `Még ${3 - players.length} játékos kell...`}
        </button>
      )}
      {!isHost && <p className={styles.hint}>Várakozás, míg a házigazda elindítja...</p>}
    </div>
  )
}
