import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { componentLabel, kontraLevelName, isIndividualKontra, kontraNegoLanesFor } from '../../lib/bids'
import styles from '../../styles/KontraBar.module.css'

// The next escalation name is driven by the step count, not the multiplier (a
// 5-card kontra is ×4, so level ≠ 2^step).
function nextName(k) { return kontraLevelName(2 ** (((k && k.step) || 0) + 1)) }

// Post-trick-1 kontra negotiation: on your turn, rekontra/szubkontra any subset of
// the lanes your side is due to escalate, or "Mehet" to pass. A pass ends the
// negotiation and locks kontra; otherwise it flips to the other side.
export default function KontraNegoBar({ roomCode }) {
  const { state, dispatch } = useGame()
  const { emit } = useSocket()
  const { kontraNego, kontra, declaration, declarerId, myPlayerId, players, kontraNegoStaged } = state
  if (!kontraNego || !declaration) return null

  const amDeclarer = myPlayerId === declarerId
  const myParty = amDeclarer ? 'declarer' : 'defenders'
  const nameOf = (id) => (id === myPlayerId ? 'Te' : (players.find((p) => p.id === id)?.name || '?'))
  const individual = isIndividualKontra(declaration)
  const laneLabel = (lane) => (individual
    ? `${componentLabel(declaration.scoring[0])} (${nameOf(lane)})`
    : componentLabel(lane))

  const amPending = kontraNego.turn === myParty && (kontraNego.pending || []).includes(myPlayerId)

  if (!amPending) {
    const who = kontraNego.turn === 'declarer' ? nameOf(declarerId) : 'az ellenfelek'
    const verb = kontraNego.turn === 'declarer' ? 'rekontrázhat' : 'szubkontrázhat'
    return (
      <div className={styles.bar}>
        <span className={styles.hint}>Kontra-egyeztetés — {who} {verb}…</span>
      </div>
    )
  }

  const options = kontraNegoLanesFor(declaration, kontra, myParty, myPlayerId)
  const toggle = (lane) => dispatch({ type: 'TOGGLE_KONTRA_NEGO', lane })
  const submit = () => emit('kontra:nego', { roomCode, lanes: kontraNegoStaged })
  const mehet = () => emit('kontra:nego', { roomCode, lanes: [] })
  const raiseWord = myParty === 'declarer' ? 'Rekontra' : 'Szubkontra'

  // Individual-kontra contracts (betli / nt-durchmars): no per-defender split —
  // a single Rekontra/Szubkontra button raises every lane the player is due (both
  // defenders' lanes for the declarer, their own for a defender), so an all-kontra'd
  // contract behaves like a normal uniform kontra.
  if (individual) {
    return (
      <div className={styles.bar}>
        <span className={styles.actions}>
          {options.length > 0 && (
            <button className={styles.btnAll} onClick={() => emit('kontra:nego', { roomCode, lanes: options })}>{raiseWord}</button>
          )}
          <button className={styles.btnAll} onClick={mehet}>Mehet</button>
        </span>
      </div>
    )
  }

  return (
    <div className={styles.bar}>
      <span className={styles.actions}>
        {options.map((lane) => {
          const on = kontraNegoStaged.includes(lane)
          return (
            <button key={lane} className={`${styles.btn} ${on ? styles.btnOn : ''}`} onClick={() => toggle(lane)}>
              {nextName(kontra[lane])} {laneLabel(lane)}
            </button>
          )
        })}
        {kontraNegoStaged.length > 0 && (
          <button className={styles.btnAll} onClick={submit}>{raiseWord} ({kontraNegoStaged.length})</button>
        )}
        <button className={styles.btnAll} onClick={mehet}>Mehet</button>
      </span>
    </div>
  )
}
