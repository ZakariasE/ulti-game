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
  durchmars_nt:    { base: 6,  label: 'Durchmars' },
  heart_durchmars: { base: 12, label: 'Piros durchmars' },
  open_durchmars:  { base: 24, label: 'Terített durchmars' },
}

export function componentLabel(component) {
  return (TRUMP_COMPONENTS[component] || NO_TRUMP_CONTRACTS[component] || {}).label || component
}

// Escalating kontra names, keyed by the multiplier reached.
export const KONTRA_LEVEL_NAME = {
  2: 'Kontra', 4: 'Rekontra', 8: 'Szubkontra', 16: 'Mordkontra', 32: 'Hirskontra', 64: 'Fedáksári',
}
export function kontraLevelName(level) {
  return KONTRA_LEVEL_NAME[level] || `×${level}`
}

function componentBasePoints(component, color) {
  if (NO_TRUMP_CONTRACTS[component]) return NO_TRUMP_CONTRACTS[component].base
  const info = TRUMP_COMPONENTS[component]
  return color === 'red' ? info.base * 2 : info.base
}

// Validate a chosen trump bundle. Returns { ok, error, scoring, hasParti }.
export function validateBundle(components) {
  const comps = [...new Set(components)]
  if (comps.length === 0) return { ok: false, error: 'Válassz legalább egy bemondást' }
  if (comps.includes('forty_hundred') && comps.includes('twenty_hundred')) {
    return { ok: false, error: 'Csak a 40-100 vagy a 20-100 egyike' }
  }
  if (comps.includes('durchmars') && comps.length === 1) {
    return { ok: false, error: 'A Durchmarsot mással kell kombinálni' }
  }
  const hasParti = comps.every((c) => PARTI_BEARERS.has(c))
  const scoring = hasParti ? [...comps, 'parti'] : [...comps]
  return { ok: true, scoring, hasParti }
}

// Build a normalized declaration object (matches server's public shape).
export function makeDeclaration(type, { components, color, contract } = {}) {
  if (type === 'simple') {
    return { components: ['parti'], scoring: ['parti'], hasParti: true, color, isNoTrump: false }
  }
  if (type === 'notrump') {
    return {
      components: [contract], scoring: [contract], hasParti: false, color: 'normal',
      isNoTrump: true, open: contract === 'open_betli' || contract === 'open_durchmars',
    }
  }
  const v = validateBundle(components)
  if (!v.ok) return { invalid: true, error: v.error }
  return { components: [...components], scoring: v.scoring, hasParti: v.hasParti, color, isNoTrump: false }
}

export function declarationValue(decl) {
  if (!decl || decl.invalid) return -1
  return decl.scoring.reduce((sum, c) => sum + componentBasePoints(c, decl.color), 0)
}

// Bidding rank ignores the +1/+2 parti bonus (Betli 5 outranks Ulti 4+1).
export function rankValue(decl) {
  if (!decl || decl.invalid) return -1
  const nonParti = decl.scoring.filter((c) => c !== 'parti')
  if (nonParti.length === 0) return componentBasePoints('parti', decl.color)
  return nonParti.reduce((sum, c) => sum + componentBasePoints(c, decl.color), 0)
}

const TIEBREAK = [
  'parti', 'betli', 'ulti', 'four_aces', 'forty_hundred', 'durchmars_nt',
  'durchmars', 'twenty_hundred', 'heart_betli', 'heart_durchmars', 'open_betli', 'open_durchmars',
]
function tiebreakKey(decl) {
  return Math.min(...decl.scoring.map((c) => {
    const i = TIEBREAK.indexOf(c)
    return i < 0 ? TIEBREAK.length : i
  }))
}

export function isHigherDeclaration(next, current) {
  if (!current) return true
  const dv = rankValue(next) - rankValue(current)
  if (dv !== 0) return dv > 0
  return tiebreakKey(next) > tiebreakKey(current)
}

export function declarationLabel(decl) {
  if (!decl || decl.invalid) return '—'
  if (decl.isNoTrump) return componentLabel(decl.components[0])
  const base = decl.components.map(componentLabel).join(' + ')
  return decl.color === 'red' ? `${base} (piros)` : base
}

export function declarationMode(decl) {
  return decl && decl.isNoTrump ? 'notrump' : 'trump'
}
