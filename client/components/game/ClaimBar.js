import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/ClaimBar.module.css'

const BETLI = new Set(['betli', 'heart_betli', 'open_betli'])

// "Nincs több ütés": the declarer claims all remaining tricks; both defenders
// must agree, then the round ends immediately with the declarer winning.
export default function ClaimBar({ roomCode }) {
  const { state } = useGame()
  const { emit } = useSocket()
  const { phase, declaration, declarerId, myPlayerId, currentTrick, completedTricks, claim } = state

  if (phase !== 'PLAYING' || !declaration) return null
  const amDeclarer = declarerId === myPlayerId

  // A defender voting on a pending claim.
  if (claim && !amDeclarer) {
    return (
      <div className={`${styles.bar} ${styles.vote}`}>
        <span>A felvevő az összes maradék ütést kéri (nincs több ütés). Elfogadod?</span>
        <button className={styles.yes} onClick={() => emit('claim:respond', { roomCode, agree: true })}>Elfogadom</button>
        <button className={styles.no} onClick={() => emit('claim:respond', { roomCode, agree: false })}>Elutasítom</button>
      </div>
    )
  }

  if (amDeclarer && claim) {
    return <div className={styles.bar}><span className={styles.waiting}>Várakozás az ellenfelek válaszára…</span></div>
  }

  // The declarer may offer the claim between tricks (not in a Betli).
  const canOffer = amDeclarer && !claim && !declaration.scoring.some((k) => BETLI.has(k)) &&
    currentTrick.length === 0 && completedTricks.length >= 1 && completedTricks.length < 10
  if (canOffer) {
    return (
      <div className={styles.bar}>
        <button className={styles.claim} onClick={() => emit('claim:start', { roomCode })}>Nincs több ütés</button>
      </div>
    )
  }

  return null
}
