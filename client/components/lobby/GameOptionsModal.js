import { useState } from 'react'
import styles from '../../styles/GameOptionsModal.module.css'

const DEFAULTS = {
  felkezes: false,
  buli: { on: false, handsPerBuli: 18, premium: 50},
  kotelezo: { on: true, ultiPenalty: 220, betliPenalty: 110 },
  stake: 1,
}

// House-rule chooser shown when creating a room. Calls onConfirm(options).
export default function GameOptionsModal({ onConfirm, onCancel }) {
  const [felkezes, setFelkezes] = useState(DEFAULTS.felkezes)
  const [buliOn, setBuliOn] = useState(DEFAULTS.buli.on)
  const [handsPerBuli, setHandsPerBuli] = useState(DEFAULTS.buli.handsPerBuli)
  const [premium, setPremium] = useState(DEFAULTS.buli.premium)
  const [kotelezoOn, setKotelezoOn] = useState(DEFAULTS.kotelezo.on)
  const [ultiPenalty, setUltiPenalty] = useState(DEFAULTS.kotelezo.ultiPenalty)
  const [betliPenalty, setBetliPenalty] = useState(DEFAULTS.kotelezo.betliPenalty)
  const [stake, setStake] = useState(DEFAULTS.stake)

  const kotelezoAvailable = felkezes && buliOn

  function confirm() {
    onConfirm({
      felkezes,
      buli: { on: buliOn, handsPerBuli: Number(handsPerBuli) || 6, premium: Number(premium) || 0 },
      kotelezo: {
        on: kotelezoAvailable && kotelezoOn,
        ultiPenalty: Number(ultiPenalty) || 0,
        betliPenalty: Number(betliPenalty) || 0,
      },
      stake: Number(stake) || 0,
    })
  }

  const Toggle = ({ on, set, label }) => (
    <button type="button" className={`${styles.toggle} ${on ? styles.toggleOn : ''}`} onClick={() => set(!on)}>
      <span className={styles.knob} />
      <span>{label}</span>
    </button>
  )

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2>Játékbeállítások</h2>

        <div className={styles.block}>
          <Toggle on={felkezes} set={setFelkezes} label="Félkezes (5 lap, 4× érték)" />
        </div>

        <div className={styles.block}>
          <Toggle on={buliOn} set={setBuliOn} label="Buli" />
          {buliOn && (
            <div className={styles.fields}>
              <label>Leosztások / buli
                <input type="number" min="1" value={handsPerBuli} onChange={(e) => setHandsPerBuli(e.target.value)} />
              </label>
              <label>Prémium
                <input type="number" value={premium} onChange={(e) => setPremium(e.target.value)} />
              </label>
            </div>
          )}
        </div>

        <div className={`${styles.block} ${!kotelezoAvailable ? styles.disabledBlock : ''}`}>
          <Toggle on={kotelezoAvailable && kotelezoOn} set={(v) => kotelezoAvailable && setKotelezoOn(v)} label="Kötelező mondások" />
          {!kotelezoAvailable && <div className={styles.note}>Csak Félkezes + Buli mellett</div>}
          {kotelezoAvailable && kotelezoOn && (
            <div className={styles.fields}>
              <label>Ulti büntetés
                <input type="number" value={ultiPenalty} onChange={(e) => setUltiPenalty(e.target.value)} />
              </label>
              <label>Betli / 40-100 büntetés
                <input type="number" value={betliPenalty} onChange={(e) => setBetliPenalty(e.target.value)} />
              </label>
            </div>
          )}
        </div>

        <div className={styles.block}>
          <div className={styles.fields}>
            <label>Tét (pontonként)
              <input type="number" value={stake} onChange={(e) => setStake(e.target.value)} />
            </label>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={confirm}>Szoba létrehozása</button>
          <button className={styles.btnSecondary} onClick={onCancel}>Mégse</button>
        </div>
      </div>
    </div>
  )
}
