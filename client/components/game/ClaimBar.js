import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import styles from '../../styles/ClaimBar.module.css'

const BETLI = new Set(['betli', 'heart_betli', 'open_betli'])

// "Nincs több ütés": the declarer claims all remaining tricks; both defenders
// must agree, then the round ends immediately with the declarer winning.
// "Bedobom": the declarer throws in.
//   • Parti-less contracts concede immediately as a loss.
//   • Parti contracts open a negotiation (no card is played): each defender
//     answers rendben / csak százzal; if either demands százzal, the declarer
//     chooses rendben (concede with 100) or lejátszom (cancel, play continues).
export default function ClaimBar({ roomCode }) {
  const { state, dispatch } = useGame()
  const { emit } = useSocket()
  const {
    phase, declaration, declarerId, myPlayerId, currentTrick, completedTricks,
    claim, claimVote, concede, concedeVote,
  } = state
  const [confirming, setConfirming] = useState(false) // declarer's initial Bedobom confirm

  if (phase !== 'PLAYING' || !declaration) return null
  const amDeclarer = declarerId === myPlayerId

  // ── Bedobás negotiation (parti contracts) ──────────────────────────────────
  if (concede) {
    if (concede.stage === 'defenders') {
      if (amDeclarer) {
        return <div className={styles.bar}><span className={styles.waiting}>Várakozás az ellenfelek válaszára…</span></div>
      }
      const vote = (v) => {
        dispatch({ type: 'SET_CONCEDE_VOTE', vote: v })
        emit('concede:respond', { roomCode, choice: v === 'hundred' ? 'hundred' : 'ok' })
      }
      return (
        <div className={`${styles.bar} ${styles.vote}`}>
          <span>A felvevő bedobná a partit. Elfogadod?</span>
          <button
            className={`${styles.yes} ${concedeVote === 'ok' ? styles.chosen : ''} ${concedeVote === 'hundred' ? styles.dim : ''}`}
            disabled={!!concedeVote}
            onClick={() => vote('ok')}
          >
            {concedeVote === 'ok' ? '✓ Rendben' : 'Rendben'}
          </button>
          <button
            className={`${styles.no} ${concedeVote === 'hundred' ? styles.chosen : ''} ${concedeVote === 'ok' ? styles.dim : ''}`}
            disabled={!!concedeVote}
            onClick={() => vote('hundred')}
          >
            {concedeVote === 'hundred' ? '✓ Csak százzal' : 'Csak százzal'}
          </button>
          {concedeVote && <span className={styles.waiting}>a másik játékosra várunk…</span>}
        </div>
      )
    }

    // stage === 'declarer': at least one defender demanded százzal.
    if (amDeclarer) {
      return (
        <div className={styles.bar}>
          <span className={styles.confirm}>Az egyik ellenfél csak százzal fogadja el. Rendben, vagy lejátszod?</span>
          <button className={styles.no} onClick={() => emit('concede:decide', { roomCode, playOn: false })}>Rendben (százzal)</button>
          <button className={styles.cancel} onClick={() => emit('concede:decide', { roomCode, playOn: true })}>Lejátszom</button>
        </div>
      )
    }
    return <div className={styles.bar}><span className={styles.waiting}>Várakozás a felvevő döntésére…</span></div>
  }

  // ── Claim: "nincs több ütés" ───────────────────────────────────────────────
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

  // Bedobás is available any time the declarer is at play (even before the
  // opening lead). Parti contracts open the negotiation — BUT only once play has
  // begun; before any card is played the declarer just throws in and loses (no
  // rendben / csak százzal cycle). Others always concede at once.
  const beforeAnyCard = completedTricks.length === 0 && currentTrick.length === 0
  const negotiate = declaration.hasParti && !beforeAnyCard
  const startBedobas = () => {
    if (negotiate) emit('concede:start', { roomCode })
    else emit('play:concede', { roomCode, hundred: false })
    setConfirming(false)
  }
  const confirmText = negotiate
    ? 'Biztosan bedobod? Az ellenfelek döntenek, hogy százzal számoljon-e.'
    : 'Biztosan bedobod? Elveszíted a leosztást.'

  return (
    <div className={styles.bar}>
      {canOffer && (
        <button className={styles.claim} onClick={() => emit('claim:start', { roomCode })}>Nincs több ütés</button>
      )}
      {confirming ? (
        <>
          <span className={styles.confirm}>{confirmText}</span>
          <button className={styles.no} onClick={startBedobas}>Igen</button>
          <button className={styles.cancel} onClick={() => setConfirming(false)}>Mégse</button>
        </>
      ) : (
        <button className={styles.concede} onClick={() => setConfirming(true)}>Bedobom</button>
      )}
    </div>
  )
}
