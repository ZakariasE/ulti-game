import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/ClaimBar.module.css'

const BETLI = new Set(['betli', 'heart_betli', 'open_betli'])

// "Nincs több ütés": the declarer claims all remaining tricks; both defenders
// must agree, then the round ends immediately with the declarer winning.
// "Bedobom": the declarer throws in — the hand ends immediately as a loss.
export default function ClaimBar({ roomCode }) {
  const { state, dispatch } = useGame()
  const { emit } = useSocket()
  const { phase, declaration, declarerId, myPlayerId, currentTrick, completedTricks, claim, claimVote } = state
  const [confirming, setConfirming] = useState(false)

  if (phase !== 'PLAYING' || !declaration) return null
  const amDeclarer = declarerId === myPlayerId

  // A defender voting on a pending claim.
  if (claim && !amDeclarer) {
    function vote(v) {
      dispatch({ type: 'SET_CLAIM_VOTE', vote: v })
      emit('claim:respond', { roomCode, agree: v === 'yes' })
    }
    return (
      <div className={`${styles.bar} ${styles.vote}`}>
        <span>A felvevő az összes maradék ütést kéri (nincs több ütés). Elfogadod?</span>
        <button
          className={`${styles.yes} ${claimVote === 'yes' ? styles.chosen : ''} ${claimVote === 'no' ? styles.dim : ''}`}
          disabled={!!claimVote}
          onClick={() => vote('yes')}
        >
          {claimVote === 'yes' ? '✓ Elfogadva' : 'Elfogadom'}
        </button>
        <button
          className={`${styles.no} ${claimVote === 'no' ? styles.chosen : ''} ${claimVote === 'yes' ? styles.dim : ''}`}
          disabled={!!claimVote}
          onClick={() => vote('no')}
        >
          {claimVote === 'no' ? '✗ Elutasítva' : 'Elutasítom'}
        </button>
        {claimVote && <span className={styles.waiting}>a másik játékosra várunk…</span>}
      </div>
    )
  }

  if (amDeclarer && claim) {
    return <div className={styles.bar}><span className={styles.waiting}>Várakozás az ellenfelek válaszára…</span></div>
  }

  // Only the declarer has controls beyond this point.
  if (!amDeclarer) return null

  // The declarer may offer the claim between tricks (not in a Betli).
  const canOffer = !declaration.scoring.some((k) => BETLI.has(k)) &&
    currentTrick.length === 0 && completedTricks.length >= 1 && completedTricks.length < 10

  // Bedobás is available any time the declarer is on lead/at play (no card mid-air
  // required) — confirmed once, since it forfeits the hand.
  return (
    <div className={styles.bar}>
      {canOffer && (
        <button className={styles.claim} onClick={() => emit('claim:start', { roomCode })}>Nincs több ütés</button>
      )}
      {confirming ? (
        <>
          <span className={styles.confirm}>Biztosan bedobod? Elveszíted a leosztást.</span>
          <button className={styles.no} onClick={() => { emit('play:concede', { roomCode }); setConfirming(false) }}>Igen, bedobom</button>
          <button className={styles.cancel} onClick={() => setConfirming(false)}>Mégse</button>
        </>
      ) : (
        <button className={styles.concede} onClick={() => setConfirming(true)}>Bedobom</button>
      )}
    </div>
  )
}
