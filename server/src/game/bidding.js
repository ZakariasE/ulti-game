// ── Scoring components ────────────────────────────────────────────────────────
// Trump components — base points paid to/by EACH defender (doubled when the
// declaration color is red / hearts).
const TRUMP_COMPONENTS = {
  parti:          { base: 1, label: 'Parti' },
  ulti:           { base: 4, label: 'Ulti' },
  four_aces:      { base: 4, label: '4 Aces' },
  forty_hundred:  { base: 4, label: '40-100' },
  twenty_hundred: { base: 8, label: '20-100' },
  durchmars:      { base: 6, label: 'Durchmars' },
}

// Components the player may actually choose when bidding (parti is derived).
const CHOOSABLE = ['ulti', 'four_aces', 'forty_hundred', 'twenty_hundred', 'durchmars']
const PARTI_BEARERS = new Set(['ulti', 'four_aces'])

// No-trump standalone contracts (cannot combine with anything).
const NO_TRUMP_CONTRACTS = {
  betli:           { base: 5,  label: 'Betli' },
  heart_betli:     { base: 10, label: 'Heart Betli' },
  open_betli:      { base: 20, label: 'Open Betli' },
  durchmars_nt:    { base: 6,  label: 'Durchmars' },
  heart_durchmars: { base: 12, label: 'Heart Durchmars' },
  open_durchmars:  { base: 24, label: 'Open Durchmars' },
}

function isNoTrumpContract(key) {
  return Object.prototype.hasOwnProperty.call(NO_TRUMP_CONTRACTS, key)
}

// Build & validate a trump declaration from chosen components + color.
// Throws on an illegal combination. Returns a normalized declaration.
function buildDeclaration(components, color) {
  const comps = [...new Set(components)]
  if (comps.length === 0) throw new Error('Pick at least one contract')
  for (const c of comps) {
    if (!CHOOSABLE.includes(c)) throw new Error(`Cannot choose "${c}" here`)
  }
  if (comps.includes('forty_hundred') && comps.includes('twenty_hundred')) {
    throw new Error('Cannot declare both 40-100 and 20-100')
  }
  // durchmars must be combined with another trump component
  if (comps.includes('durchmars') && comps.length === 1) {
    throw new Error('Trump Durchmars must be combined with another contract')
  }

  // Parti is bundled only when every chosen component is a parti-bearer.
  const hasParti = comps.every((c) => PARTI_BEARERS.has(c))
  const scoring = hasParti ? [...comps, 'parti'] : [...comps]

  return {
    components: comps,
    scoring,               // components that actually score (incl. parti)
    hasParti,
    color: color === 'red' ? 'red' : 'normal',
    trumpSuit: color === 'red' ? 'piros' : null, // minor chosen at first lead
    isNoTrump: false,
    open: false,
  }
}

// A "simple" (parti-only) declaration.
function simpleDeclaration(color) {
  return {
    components: ['parti'],
    scoring: ['parti'],
    hasParti: true,
    color: color === 'red' ? 'red' : 'normal',
    trumpSuit: color === 'red' ? 'piros' : null,
    isNoTrump: false,
    open: false,
  }
}

function noTrumpDeclaration(key) {
  if (!isNoTrumpContract(key)) throw new Error(`Unknown contract: ${key}`)
  return {
    components: [key],
    scoring: [key],
    hasParti: false,
    color: 'normal',
    trumpSuit: null,
    isNoTrump: true,
    open: key === 'open_betli' || key === 'open_durchmars',
  }
}

// Base points for one scoring component under a declaration's color.
function componentBasePoints(component, color) {
  if (isNoTrumpContract(component)) return NO_TRUMP_CONTRACTS[component].base
  const info = TRUMP_COMPONENTS[component]
  if (!info) throw new Error(`Unknown component: ${component}`)
  return color === 'red' ? info.base * 2 : info.base
}

function componentLabel(component) {
  return (TRUMP_COMPONENTS[component] || NO_TRUMP_CONTRACTS[component] || {}).label || component
}

// Total point value of a declaration — used to rank bids.
function declarationValue(decl) {
  return decl.scoring.reduce((sum, c) => sum + componentBasePoints(c, decl.color), 0)
}

// Tiebreak for equal values: order no-trump specials, then by a component
// priority so the ordering is stable and deterministic.
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

function isHigherDeclaration(next, current) {
  const dv = declarationValue(next) - declarationValue(current)
  if (dv !== 0) return dv > 0
  return tiebreakKey(next) > tiebreakKey(current)
}

// A short human label for a declaration, e.g. "Ulti + 40-100 (red)".
function declarationLabel(decl) {
  if (decl.isNoTrump) return componentLabel(decl.components[0])
  const parts = decl.components.map(componentLabel)
  const base = parts.join(' + ')
  return decl.color === 'red' ? `${base} (red)` : base
}

function getInitialBidderSeat(dealerSeat, numPlayers) {
  return (dealerSeat + 1) % numPlayers
}
function getNextBidderSeat(currentSeat, numPlayers) {
  return (currentSeat + 1) % numPlayers
}

module.exports = {
  TRUMP_COMPONENTS,
  NO_TRUMP_CONTRACTS,
  CHOOSABLE,
  PARTI_BEARERS,
  isNoTrumpContract,
  buildDeclaration,
  simpleDeclaration,
  noTrumpDeclaration,
  componentBasePoints,
  componentLabel,
  declarationValue,
  isHigherDeclaration,
  declarationLabel,
  getInitialBidderSeat,
  getNextBidderSeat,
}
