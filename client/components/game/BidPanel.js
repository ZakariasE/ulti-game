import { useState } from 'react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import {
  CHOOSABLE, NO_TRUMP_CONTRACTS, TRUMP_COMPONENTS, componentLabel, makeDeclaration,
  declarationValue, bidTotalValue, declarationLabel, beatsDeclaration, kontraLevelName, isIndividualKontra,
} from '../../lib/bids'
import { SUIT_NAMES } from '../../lib/cards'
import styles from '../../styles/BidPanel.module.css'

const FELKEZES_SUITS = ['makk', 'zold', 'tok', 'piros']

export default function BidPanel({ roomCode }) {
  const { state, dispatch } = useGame()
  const { emit } = useSocket()
  const { currentTurnId, biddingPhase, biddingMode, currentHighBid, myPlayerId, players, options,
    redealMultiplier, biddingKontra, pendingDiscard, pendingBidKontra, pendingHozam, mandatoryBetli } = state

  const [picked, setPicked] = useState([]) // chosen trump components
  const [ntContract, setNtContract] = useState(null) // chosen no-trump contract (exclusive)
  const [color, setColor] = useState('normal')
  const [felkTrump, setFelkTrump] = useState(null) // félkezes: concrete trump suit
  const [open, setOpen] = useState(false) // terített: only for a trump durchmars
  const [hozamOpen, setHozamOpen] = useState(false) // terített hozámondott durchmars

  const felkezes = !!options?.felkezes
  const bkontra = biddingKontra || {} // per-component bidding kontra levels
  const redeal = redealMultiplier || 1
  // A bid made in the 5-card round is ×4; a bid in the reopened round is ×1.
  // (redeal doublings apply to the whole hand regardless.)
  const mult = (biddingMode === 'felkezes' ? 4 : 1) * redeal
  // Only the 5-card félkezes round names the concrete trump at declaration; the
  // reopened round works like the base game (color only, suit at first lead).
  const namedTrump = felkezes && biddingMode === 'felkezes'
  // In the 5-card round the named suit fixes the color; otherwise use the toggle.
  const effColor = namedTrump ? (felkTrump === 'piros' ? 'red' : 'normal') : color
  const isMyTurn = currentTurnId === myPlayerId
  const currentDecl = currentHighBid?.declaration
  // The standing bid's value uses ITS round's ×4 factor; a bid made now uses the
  // current round's factor. Outbidding compares effective values across rounds.
  const curFelk = currentHighBid?.round === 'felkezes' ? 4 : 1
  const myFelk = biddingMode === 'felkezes' ? 4 : 1
  // The standing bid's value includes any per-component kontra carried from the
  // félkez round (bkontra), so the displayed worth reflects the real stake.
  const curKontrázva = Object.values(bkontra).some((k) => (k?.level || 1) > 1)
  const highBidText = currentDecl
    ? `${declarationLabel(currentDecl)} (${bidTotalValue(currentDecl, curFelk, redeal, bkontra)}${curKontrázva ? ', kontrázva' : ''}) — ${players.find((p) => p.id === currentHighBid.playerId)?.name || '?'}`
    : null

  // Per-lane bidding kontra (félkezes 5-card round only): the lanes of the
  // standing bid that MY side is next in line to double. Lanes are per-DEFENDER
  // (keyed by player id) for individual-kontra contracts (betli / nt-durchmars),
  // otherwise scoring components.
  const myParty = currentHighBid && currentHighBid.playerId === myPlayerId ? 'declarer' : 'defenders'
  const individualBid = isIndividualKontra(currentDecl)
  const bidKontraOptions = (namedTrump && isMyTurn && biddingPhase === 'BID' && currentDecl)
    ? Object.entries(bkontra).filter(([lane, k]) => {
        const next = (k?.lastParty === 'defenders') ? 'declarer' : 'defenders'
        if (next !== myParty) return false
        if (individualBid && myParty === 'defenders' && lane !== myPlayerId) return false
        return true
      }).map(([lane]) => lane)
    : []
  const laneLabel = (lane) => (individualBid
    ? `${componentLabel(currentDecl.scoring[0])} (${lane === myPlayerId ? 'Te' : players.find((p) => p.id === lane)?.name || '?'})`
    : componentLabel(lane))
  const staged = pendingBidKontra || []
  const toggleBidKontra = (c) => dispatch({ type: 'TOGGLE_BID_KONTRA', component: c })
  // Mandatory kontra: a defender facing the required-completing betli must kontra
  // their own line (or outbid) — they may not pass until it is doubled.
  const myLaneDoubled = (bkontra[myPlayerId]?.level || 1) > 1
  const mustKontra = !!mandatoryBetli && isMyTurn && biddingPhase === 'BID' && myParty === 'defenders' && !myLaneDoubled
  const commitBidKontra = () => {
    if (staged.length) emit('bid:kontra', { roomCode, components: staged })
  }

  if (!isMyTurn) {
    const bidder = players.find((p) => p.id === currentTurnId)
    return (
      <div className={styles.panel}>
        <h3>Licit</h3>
        {highBidText && <p>Jelenlegi bemondás: <strong>{highBidText}</strong></p>}
        <p className={styles.waiting}>{bidder?.name || '...'} következik...</p>
      </div>
    )
  }

  // POST_DEAL_DISCARD (félkez winner): set the talon AND optionally hozámond —
  // add-on components (same color/trump as the félkez bid), each worth ×2.
  if (biddingPhase === 'POST_DEAL_DISCARD') {
    const decl = currentHighBid?.declaration
    const already = new Set(decl?.components || [])
    const isRed = decl?.color === 'red'
    const hozamPick = pendingHozam || []
    // Adu nélküli (betli / nt-durchmars) nyerő bid: nincs hozámondás (a szerver is
    // elutasítja), így csak a talont rakja le.
    const noHozam = !!decl?.isNoTrump
    const addable = noHozam ? [] : CHOOSABLE.filter((c) => {
      if (already.has(c)) return false
      if (c === 'four_aces' && options?.fourAces === false) return false
      if (c === 'twenty_hundred' && already.has('forty_hundred')) return false
      if (c === 'forty_hundred' && already.has('twenty_hundred')) return false
      return true
    })
    const colorLabel = isRed ? ' — piros' : (decl?.trumpSuit ? ` — ${SUIT_NAMES[decl.trumpSuit]}` : '')
    const discardReady = (pendingDiscard || []).length === 2
    const toggleHz = (c) => dispatch({ type: 'TOGGLE_HOZAM', component: c })
    // A hozámondott durchmars may be terített (doubles it, reveals the hand).
    const hzDurchmars = hozamPick.includes('durchmars')
    const hzOpen = hozamOpen && hzDurchmars
    const confirm = () => emit('bid:discard', { roomCode, cardIds: pendingDiscard, hozam: noHozam ? [] : hozamPick, hozamOpen: hzOpen })
    return (
      <div className={styles.panel}>
        <h3>{noHozam ? 'Talon' : 'Talon + hozámondás'}</h3>
        <p className={styles.waiting}>
          {noHozam ? 'Válassz 2 eldobandó lapot (lent).' : 'Válassz 2 eldobandó lapot (lent). Hozzámondhatsz továbbiakat (×2):'}
        </p>
        {!noHozam && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Hozámondás{colorLabel} — mind ×2</div>
            <div className={styles.chips}>
              {addable.map((c) => {
                const on = hozamPick.includes(c)
                const disabled =
                  (c === 'twenty_hundred' && hozamPick.includes('forty_hundred')) ||
                  (c === 'forty_hundred' && hozamPick.includes('twenty_hundred'))
                // A terített durchmars add-on doubles the durchmars base (6→12).
                const openMul = c === 'durchmars' && hzOpen ? 2 : 1
                const val = (TRUMP_COMPONENTS[c]?.base || 0) * (isRed ? 2 : 1) * 2 * openMul
                return (
                  <button
                    key={c}
                    className={`${styles.chip} ${on ? styles.chipOn : ''}`}
                    disabled={disabled}
                    onClick={() => toggleHz(c)}
                  >
                    {c === 'durchmars' && hzOpen ? 'Terített durchmars' : componentLabel(c)} ({val})
                  </button>
                )
              })}
            </div>
            {hzDurchmars && (
              <div className={styles.chips}>
                <button
                  className={`${styles.chip} ${hzOpen ? styles.chipOn : ''}`}
                  onClick={() => setHozamOpen((v) => !v)}
                >
                  Terített durchmars (×2)
                </button>
              </div>
            )}
            {hozamPick.length > 0 && decl?.hasParti && hozamPick.some((c) => c === 'forty_hundred' || c === 'twenty_hundred' || c === 'durchmars') && (
              <p className={styles.hint}>Figyelem: nem-parti bemondás hozzáadásával a parti elveszik.</p>
            )}
          </div>
        )}
        <div className={styles.actions}>
          <button className={styles.btnPrimary} disabled={!discardReady} onClick={confirm}>
            {discardReady ? (!noHozam && hozamPick.length ? 'Talon + hozámondás' : 'Talon lerakása') : 'Válassz 2 lapot'}
          </button>
        </div>
      </div>
    )
  }

  if (biddingPhase === 'ROB_OFFER') {
    return (
      <div className={styles.panel}>
        <h3>Te licitálsz</h3>
        {highBidText && <p>Jelenlegi bemondás: <strong>{highBidText}</strong></p>}
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={() => emit('bid:rob', { roomCode })}>
            Talon felvétele
          </button>
          <button className={styles.btnSecondary} onClick={() => emit('bid:pass', { roomCode })}>
            Passz
          </button>
        </div>
      </div>
    )
  }

  // DISCARD is combined with the declaration here (pick 2 to discard + a bid,
  // one confirm). BID (félkezes 5-card) and DECLARE (normal, after robbing) too.
  if (biddingPhase !== 'DECLARE' && biddingPhase !== 'BID' && biddingPhase !== 'DISCARD') return null
  const needDiscard = biddingPhase === 'DISCARD'
  const discardReady = !needDiscard || (pendingDiscard || []).length === 2

  // A no-trump contract is exclusive (can't combine with trump components / color).
  const isNt = !!ntContract
  // Terített only applies to a trump durchmars.
  const canOpen = !isNt && picked.includes('durchmars')
  const openNow = open && canOpen
  // Build the candidate declaration: a chosen no-trump contract, else the trump
  // picks (empty picks = a simple parti).
  const candidate = isNt
    ? makeDeclaration('notrump', { contract: ntContract })
    : (picked.length === 0
      ? makeDeclaration('simple', { color: effColor })
      : makeDeclaration('trump', { components: picked, color: effColor, open: openNow }))
  // The 5-card round requires a named trump suit before a TRUMP bid (no-trump has none).
  const suitReady = isNt || !namedTrump || !!felkTrump
  const candValid = !candidate.invalid && suitReady && discardReady
  const candHigher = candValid && beatsDeclaration(candidate, myFelk, currentDecl, curFelk)

  // Picking a trump component clears any no-trump choice, and vice-versa.
  function toggle(comp) {
    setNtContract(null)
    setPicked((prev) => (prev.includes(comp) ? prev.filter((c) => c !== comp) : [...prev, comp]))
  }
  function pickNt(key) {
    setNtContract((prev) => (prev === key ? null : key))
    setPicked([])
    setOpen(false)
    setFelkTrump(null)
  }

  // When robbing (DISCARD phase), put down the 2 selected cards and declare in
  // one action (the discard is applied server-side just before the declaration).
  function commitDiscardIfNeeded() {
    if (needDiscard) emit('bid:discard', { roomCode, cardIds: pendingDiscard })
  }

  function declareBid() {
    commitDiscardIfNeeded()
    if (isNt) emit('bid:declare', { roomCode, type: 'notrump', contract: ntContract })
    else {
      const trumpSuit = namedTrump ? felkTrump : undefined
      if (picked.length === 0) emit('bid:declare', { roomCode, type: 'simple', color: effColor, trumpSuit })
      else emit('bid:declare', { roomCode, type: 'trump', components: picked, color: effColor, trumpSuit, open: openNow })
    }
    setPicked([])
    setNtContract(null)
    setFelkTrump(null)
    setOpen(false)
  }

  return (
    <div className={styles.panel}>
      <h3>Mondd be a játékod</h3>
      {highBidText && <p>Ezt kell überelni: <strong>{highBidText}</strong></p>}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Bemondás</div>
        <div className={styles.chips}>
          {(options?.fourAces === false ? CHOOSABLE.filter((c) => c !== 'four_aces') : CHOOSABLE).map((comp) => (
            <button
              key={comp}
              className={`${styles.chip} ${!isNt && picked.includes(comp) ? styles.chipOn : ''}`}
              onClick={() => toggle(comp)}
            >
              {componentLabel(comp)}
            </button>
          ))}
          {/* No-trump contracts sit in the same set — picking one is exclusive. */}
          {Object.entries(NO_TRUMP_CONTRACTS).map(([key, info]) => (
            <button
              key={key}
              className={`${styles.chip} ${ntContract === key ? styles.chipOn : ''}`}
              onClick={() => pickNt(key)}
            >
              {info.label}
            </button>
          ))}
        </div>
        {/* Color / trump suit / terített only apply to a TRUMP bid. */}
        {!isNt && (namedTrump ? (
          <div className={styles.colorRow}>
            {FELKEZES_SUITS.map((s) => (
              <button
                key={s}
                className={`${styles.chip} ${s === 'piros' ? styles.red : ''} ${felkTrump === s ? styles.chipOn : ''}`}
                onClick={() => setFelkTrump(s)}
              >
                {SUIT_NAMES[s]}{s === 'piros' ? ' ♥ (×2)' : ''}
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.colorRow}>
            <button className={`${styles.chip} ${color === 'normal' ? styles.chipOn : ''}`} onClick={() => setColor('normal')}>Sima</button>
            <button className={`${styles.chip} ${styles.red} ${color === 'red' ? styles.chipOn : ''}`} onClick={() => setColor('red')}>Piros ♥ (×2)</button>
          </div>
        ))}
        {canOpen && (
          <div className={styles.colorRow}>
            <button
              className={`${styles.chip} ${openNow ? styles.chipOn : ''}`}
              onClick={() => setOpen((v) => !v)}
            >
              Terített durchmars (×2)
            </button>
          </div>
        )}
        <div className={styles.preview}>
          {candidate.invalid
            ? <span className={styles.invalid}>{candidate.error}</span>
            : (!isNt && namedTrump && !felkTrump)
              ? <span className={styles.invalid}>Válassz színt</span>
              : !discardReady
                ? <span className={styles.invalid}>Válassz 2 eldobandó lapot (lent)</span>
                : <>Bemondás: <strong>{isNt ? declarationLabel(candidate) : (picked.length === 0 ? (effColor === 'red' ? 'Szimpla (piros)' : 'Szimpla') : declarationLabel(candidate))}</strong>{!isNt && namedTrump ? ` — ${SUIT_NAMES[felkTrump]}` : ''} — {declarationValue(candidate) * mult} pont</>}
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} disabled={!candHigher} onClick={declareBid}>
            {candValid && !candHigher ? 'Magasabbat kell mondani' : 'Bemondom'}
          </button>
          {biddingPhase === 'BID' && (
            <button className={styles.btnSecondary} disabled={mustKontra} onClick={() => emit('bid:pass', { roomCode })}>Passz</button>
          )}
        </div>
        {mustKontra && (
          <p className={styles.hint}><strong>Kötelező kontrázni vagy überelni ezt a betlit</strong> (a bemondó betlije befejezi a kötelező mondását).</p>
        )}
        {!isNt && (
          <p className={styles.hint}>
            {namedTrump
              ? 'Félkezesben azonnal meg kell mondani a színt (adut).'
              : 'Az adu színt (Makk/Zöld/Tök) az első hívásnál választod ki. A Piros = piros adu.'}
          </p>
        )}
      </div>

      {bidKontraOptions.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Vagy kontra komponensenként</div>
          <div className={styles.chips}>
            {bidKontraOptions.map((lane) => {
              // Name by step (Kontra/Rekontra/…); a 5-card kontra multiplies ×4.
              const nextName = kontraLevelName(2 ** ((bkontra[lane]?.step || 0) + 1))
              return (
                <button
                  key={lane}
                  className={`${styles.chip} ${staged.includes(lane) ? styles.chipOn : ''}`}
                  onClick={() => toggleBidKontra(lane)}
                >
                  {nextName} {laneLabel(lane)} (×4)
                </button>
              )
            })}
          </div>
          <div className={styles.actions}>
            <button className={styles.btnSecondary} disabled={staged.length === 0} onClick={commitBidKontra}>
              Kontrázok
            </button>
          </div>
          <p className={styles.hint}>A kontra komponensenként külön léptethető; a licit tovább is überelhető.</p>
        </div>
      )}
    </div>
  )
}
