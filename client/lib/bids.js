// Client mirror of server/src/game/bidding.js — keep in sync.

export const TRUMP_COMPONENTS = {
  parti:          { base: 1, label: 'Parti' },
  ulti:           { base: 4, label: 'Ulti' },
  four_aces:      { base: 4, label: 'Négy ász' },
  forty_hundred:  { base: 4, label: '40-100' },
  twenty_hundred: { base: 8, label: '20-100' },
  durchmars:      { base: 6, label: 'Durchmars' },
}

export const CHOOSABLE = ['ulti', 'four_aces', 'forty_hundred', 'twenty_hundred', 'durchmars']
const PARTI_BEARERS = new Set(['ulti', 'four_aces'])

export const NO_TRUMP_CONTRACTS = {
  betli:           { base: 5,  label: 'Betli' },
  heart_betli:     { base: 10, label: 'Piros betli' },
  open_betli:      { base: 20, label: 'Terített betli' },
  durchmars_nt:    { base: 12, label: 'Durchmars' },
  open_durchmars:  { base: 24, label: 'Terített durchmars' },
}

// Ellen mondások (defense-declared ellen ulti / ellen négy ász) live in the kontra
// maps as lanes, marked `ellen: true`.
export const ELLEN_LABELS = { ellen_ulti: 'Ellen ulti', ellen_negy_asz: 'Ellen négy ász' }

export function componentLabel(component) {
  return ELLEN_LABELS[component] || (TRUMP_COMPONENTS[component] || NO_TRUMP_CONTRACTS[component] || {}).label || component
}

// Contracts with INDIVIDUAL (per-defender) kontra — betli (all iterations) and
// the no-trump durchmars. For these, kontra lanes are keyed by defender id, not
// by component. Mirror of server isIndividualKontra.
const INDIVIDUAL_KONTRA_KEYS = new Set(['betli', 'heart_betli', 'open_betli', 'durchmars_nt', 'open_durchmars'])
export function isIndividualKontra(decl) {
  return !!decl && (decl.scoring || []).some((k) => INDIVIDUAL_KONTRA_KEYS.has(k))
}

// Post-trick-1 negotiation: the kontra lanes `party`/`playerId` may raise now — a
// level>1 lane whose last raise came from the OTHER side (a defender may raise only
// their own lane in an individual-kontra contract). Mirror of server _negoDueLanes.
export function kontraNegoLanesFor(declaration, kontra, party, playerId) {
  const individual = isIndividualKontra(declaration)
  return Object.entries(kontra || {}).filter(([lane, k]) => {
    // Ellen lanes are active from level 1 (owned by defenders); ordinary lanes only
    // once kontrázott (level > 1).
    if (!(k.ellen || k.level > 1)) return false
    if (party === 'declarer') return k.lastParty === 'defenders'
    if (k.lastParty !== 'declarer') return false
    if (individual && lane !== playerId) return false
    return true
  }).map(([lane]) => lane)
}

// Per-player net of the individual-kontra side-ledger (sidePairs: "a|b" -> amount
// a owes b). Positive = that player is owed; negative = they owe.
export function sideNet(sidePairs, playerId) {
  let net = 0
  for (const [pair, amt] of Object.entries(sidePairs || {})) {
    const [a, b] = pair.split('|')
    if (a === playerId) net -= amt
    else if (b === playerId) net += amt
  }
  return net
}

// Escalating kontra names, keyed by the multiplier reached.
export const KONTRA_LEVEL_NAME = {
  2: 'Kontra', 4: 'Rekontra', 8: 'Szubkontra', 16: 'Mordkontra', 32: 'Hirskontra', 64: 'Fedáksári',
}
export function kontraLevelName(level) {
  return KONTRA_LEVEL_NAME[level] || `×${level}`
}

// `open` (terített) doubles ONLY a trump Durchmars component (6→12; ×2 again if red).
function componentBasePoints(component, color, open = false) {
  if (NO_TRUMP_CONTRACTS[component]) return NO_TRUMP_CONTRACTS[component].base
  const info = TRUMP_COMPONENTS[component]
  let base = info.base
  if (open && component === 'durchmars') base *= 2
  return color === 'red' ? base * 2 : base
}

// Validate a chosen trump bundle. Returns { ok, error, scoring, hasParti }.
export function validateBundle(components) {
  const comps = [...new Set(components)]
  if (comps.length === 0) return { ok: false, error: 'Válassz legalább egy bemondást' }
  if (comps.includes('forty_hundred') && comps.includes('twenty_hundred')) {
    return { ok: false, error: 'Csak a 40-100 vagy a 20-100 egyike' }
  }
  const hasParti = comps.every((c) => PARTI_BEARERS.has(c))
  const scoring = hasParti ? [...comps, 'parti'] : [...comps]
  return { ok: true, scoring, hasParti }
}

// Build a normalized declaration object (matches server's public shape).
// `trumpSuit` (félkezes) names the concrete suit and determines the color.
export function makeDeclaration(type, { components, color, contract, trumpSuit, open } = {}) {
  const c = trumpSuit ? (trumpSuit === 'piros' ? 'red' : 'normal') : color
  if (type === 'simple') {
    return { components: ['parti'], scoring: ['parti'], hasParti: true, color: c, trumpSuit: trumpSuit || null, isNoTrump: false, open: false }
  }
  if (type === 'notrump') {
    return {
      components: [contract], scoring: [contract], hasParti: false, color: 'normal',
      isNoTrump: true, open: contract === 'open_betli' || contract === 'open_durchmars',
    }
  }
  const v = validateBundle(components)
  if (!v.ok) return { invalid: true, error: v.error }
  // Terített (open) only applies to a trump durchmars.
  const isOpen = !!open && components.includes('durchmars')
  return { components: [...components], scoring: v.scoring, hasParti: v.hasParti, color: c, trumpSuit: trumpSuit || null, isNoTrump: false, open: isOpen }
}

export function declarationValue(decl) {
  if (!decl || decl.invalid) return -1
  return decl.scoring.reduce((sum, c) => sum + componentBasePoints(c, decl.color, decl.open), 0)
}

// Full point value incl. per-component multipliers: original components use
// `felkFactor` (×4 in the 5-card round, else ×1), hozámondott add-ons use ×2,
// all × redeal, and × each component's kontra level. Used to display a standing
// bid's true worth (incl. any kontra carried from the félkez round).
export function bidTotalValue(decl, felkFactor = 1, redeal = 1, kontra = {}) {
  if (!decl || decl.invalid) return 0
  const hozam = new Set(decl.hozam || [])
  // Individual-kontra contracts (betli / nt-durchmars) key the kontra map by
  // DEFENDER id, not component. The displayed stake uses the COMMON level — the
  // level both defenders share (their minimum) — so it climbs only once BOTH have
  // kontrázott, matching how scoring's standing treats it as a uniform kontra.
  const individual = isIndividualKontra(decl)
  const levels = Object.values(kontra || {}).map((k) => (k && k.level) || 1)
  const commonLevel = individual && levels.length ? Math.min(...levels) : 1
  return decl.scoring.reduce((sum, c) => {
    const mult = (hozam.has(c) ? 2 : felkFactor) * redeal
    const kl = individual ? commonLevel : ((kontra[c] && kontra[c].level) || 1)
    return sum + componentBasePoints(c, decl.color, decl.open) * mult * kl
  }, 0)
}

// Bidding rank is the FULL value INCLUDING the parti (Ulti 4+1=5 outranks 40-100 4).
export function rankValue(decl) {
  if (!decl || decl.invalid) return -1
  return decl.scoring.reduce((sum, c) => sum + componentBasePoints(c, decl.color, decl.open), 0)
}

// Effective value-to-beat (mirror of server effectiveRankValue). Original
// components use `felkFactor` (×4 in the 5-card round, else ×1); hozámondott
// add-ons use ×2; the parti IS included (a félkez Ulti is (4+1)×4 = 20).
// `kontra` (per-lane map, optional) makes the kontra PROTECT the bid: a kontrázott
// bid's value-to-beat includes its kontra multiplier (individual-kontra contracts
// use the common/min level, matching the displayed stake).
export function effectiveRankValue(decl, felkFactor = 1, kontra = null) {
  if (!decl || decl.invalid) return -1
  const hozam = new Set(decl.hozam || [])
  const individual = kontra && isIndividualKontra(decl)
  const levels = kontra ? Object.values(kontra).map((k) => (k && k.level) || 1) : []
  const commonLevel = individual && levels.length ? Math.min(...levels) : 1
  return decl.scoring.reduce((s, c) => {
    const mult = hozam.has(c) ? 2 : felkFactor
    const kl = kontra ? (individual ? commonLevel : ((kontra[c] && kontra[c].level) || 1)) : 1
    return s + componentBasePoints(c, decl.color, decl.open) * mult * kl
  }, 0)
}

// Tie-break for equal (effective) value: fewer scoring components ranks higher
// (Betli [betli] beats Ulti [ulti, parti]).
export function fewerComponents(next, current) {
  return next.scoring.length < current.scoring.length
}

// Does `next` (declared this round → nextFelk factor) out-rank the standing
// `current` (declared in its own round → curFelk)? Mirrors server applyDeclare:
// compare effective values, then break ties by component count (a pure count —
// NOT a raw rankValue re-compare, which would be wrong across rounds).
export function beatsDeclaration(next, nextFelk, current, curFelk, curKontra = null) {
  if (!current) return true
  if (!next || next.invalid) return false
  // The standing bid's kontra protects it (value-to-beat includes it); a fresh
  // outbid carries no kontra yet, so `next` is compared un-kontrázott.
  const curVal = effectiveRankValue(current, curFelk, curKontra)
  const newVal = effectiveRankValue(next, nextFelk)
  return newVal > curVal || (newVal === curVal && fewerComponents(next, current))
}

export function isHigherDeclaration(next, current) {
  if (!current) return true
  const dv = rankValue(next) - rankValue(current)
  if (dv !== 0) return dv > 0
  return fewerComponents(next, current)
}

const SUIT_LABEL = { makk: 'Makk', zold: 'Zöld', tok: 'Tök', piros: 'Piros' }
export function declarationLabel(decl) {
  if (!decl || decl.invalid) return '—'
  if (decl.isNoTrump) return componentLabel(decl.components[0])
  const base = decl.components
    .map((c) => (decl.open && c === 'durchmars' ? `Terített ${componentLabel(c).toLowerCase()}` : componentLabel(c)))
    .join(' + ')
  if (decl.color === 'red') return `${base} (piros)`
  // Include the concrete trump suit when public (named upfront in félkez, or
  // revealed after the opening lead); hidden-trump normal bids have trumpSuit null.
  if (decl.trumpSuit) return `${base} (${SUIT_LABEL[decl.trumpSuit] || decl.trumpSuit})`
  return base
}

export function declarationMode(decl) {
  return decl && decl.isNoTrump ? 'notrump' : 'trump'
}
