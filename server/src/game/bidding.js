// ── Scoring components ────────────────────────────────────────────────────────
// Trump components — base points paid to/by EACH defender (doubled when the
// declaration color is red / hearts).
const TRUMP_COMPONENTS = {
  parti:          { base: 1, label: 'Parti' },
  ulti:           { base: 4, label: 'Ulti' },
  four_aces:      { base: 4, label: 'Négy ász' },
  forty_hundred:  { base: 4, label: '40-100' },
  twenty_hundred: { base: 8, label: '20-100' },
  durchmars:      { base: 6, label: 'Durchmars' },
}

// Components the player may actually choose when bidding (parti is derived).
const CHOOSABLE = ['ulti', 'four_aces', 'forty_hundred', 'twenty_hundred', 'durchmars']
const PARTI_BEARERS = new Set(['ulti', 'four_aces'])

// No-trump standalone contracts (cannot combine with anything). The no-trump
// durchmars has no color (no suit) — just the plain (12) and terített (24) forms.
const NO_TRUMP_CONTRACTS = {
  betli:           { base: 5,  label: 'Betli' },
  heart_betli:     { base: 10, label: 'Piros betli' },
  open_betli:      { base: 20, label: 'Terített betli' },
  durchmars_nt:    { base: 12, label: 'Durchmars' },
  open_durchmars:  { base: 24, label: 'Terített durchmars' },
}

function isNoTrumpContract(key) {
  return Object.prototype.hasOwnProperty.call(NO_TRUMP_CONTRACTS, key)
}

// Contracts whose kontra is INDIVIDUAL (per-defender): each defender kontras on
// their own line, producing different pairwise amounts. Betli (all iterations)
// and the no-trump Durchmars (plain + terített). Trump durchmars is NOT here.
const INDIVIDUAL_KONTRA_KEYS = new Set(['betli', 'heart_betli', 'open_betli', 'durchmars_nt', 'open_durchmars'])
function isIndividualKontra(decl) {
  return !!decl && decl.scoring.some((k) => INDIVIDUAL_KONTRA_KEYS.has(k))
}

const DECLARABLE_SUITS = ['makk', 'zold', 'tok', 'piros']

// Resolve the color + concrete trump. When a concrete suit is given (félkezes,
// where the trump is named at declaration), it fixes both; otherwise fall back
// to the color (a minor is chosen at the first lead — hidden trump).
function _resolveTrump(color, trumpSuit) {
  if (trumpSuit) {
    if (!DECLARABLE_SUITS.includes(trumpSuit)) throw new Error('Invalid trump suit')
    return { color: trumpSuit === 'piros' ? 'red' : 'normal', trumpSuit }
  }
  return { color: color === 'red' ? 'red' : 'normal', trumpSuit: color === 'red' ? 'piros' : null }
}

// Build & validate a trump declaration from chosen components + color/trump.
// `opts.open` = terített (only a trump Durchmars may be open — it then doubles
// the durchmars part and reveals the declarer's hand after trick 1). Throws on an
// illegal combination. Returns a normalized declaration.
function buildDeclaration(components, color, trumpSuit, opts = {}) {
  const comps = [...new Set(components)]
  if (comps.length === 0) throw new Error('Pick at least one contract')
  for (const c of comps) {
    if (!CHOOSABLE.includes(c)) throw new Error(`Cannot choose "${c}" here`)
  }
  if (comps.includes('forty_hundred') && comps.includes('twenty_hundred')) {
    throw new Error('Cannot declare both 40-100 and 20-100')
  }
  const open = !!opts.open
  if (open && !comps.includes('durchmars')) throw new Error('Csak a durchmars lehet terített')

  // Parti is bundled only when every chosen component is a parti-bearer.
  const hasParti = comps.every((c) => PARTI_BEARERS.has(c))
  const scoring = hasParti ? [...comps, 'parti'] : [...comps]
  const t = _resolveTrump(color, trumpSuit)

  return {
    components: comps,
    scoring,               // components that actually score (incl. parti)
    hasParti,
    color: t.color,
    trumpSuit: t.trumpSuit, // concrete in félkezes; minor chosen at first lead otherwise
    isNoTrump: false,
    open, // terített trump durchmars: doubles the durchmars part + reveals the hand
  }
}

// A "simple" (parti-only) declaration.
function simpleDeclaration(color, trumpSuit) {
  const t = _resolveTrump(color, trumpSuit)
  return {
    components: ['parti'],
    scoring: ['parti'],
    hasParti: true,
    color: t.color,
    trumpSuit: t.trumpSuit,
    isNoTrump: false,
    open: false,
  }
}

// Hozámondás: expand a won félkez declaration with add-on components (declared
// as the winner discards their teljes-kéz talon). Add-ons must share the base
// bid's color/trump (enforced by reusing them) and be valid to combine; each
// add-on scores ×2 (recorded in `hozam`). Re-running buildDeclaration means the
// parti drops if any add-on is a non-parti-bearer, exactly like a normal bundle.
function expandDeclaration(baseDecl, addOns, opts = {}) {
  if (baseDecl.isNoTrump) throw new Error('Adu nélküli játékhoz nem lehet hozzámondani')
  const add = [...new Set(addOns || [])]
  if (add.length === 0) return baseDecl
  const origChosen = baseDecl.components.filter((c) => c !== 'parti')
  for (const c of add) {
    if (!CHOOSABLE.includes(c)) throw new Error(`Nem mondható hozzá: ${c}`)
    if (origChosen.includes(c)) throw new Error(`Már benne van: ${c}`)
  }
  const combined = [...origChosen, ...add]
  // `opts.open` = the durchmars add-on is terített (doubles it, reveals the hand);
  // it also carries forward if the base bid was already open.
  const open = !!baseDecl.open || !!opts.open
  const expanded = buildDeclaration(combined, baseDecl.color, baseDecl.trumpSuit, { open })
  expanded.hozam = add // the added components — each scores ×2
  return expanded
}

// Effective value-to-beat for a (possibly hozámondás-expanded) declaration.
// Original components use `felkFactor` (×4 in the 5-card round, else ×1); each
// hozámondott add-on uses ×2. The parti IS included (it counts toward the value,
// e.g. a félkez Ulti is (4+1)×4 = 20). Ties are broken by component count — see
// fewerComponents / isHigherDeclaration.
//
// `kontra` (per-lane map, optional) makes the kontra PROTECT the bid: a kontrázott
// bid must be exceeded including its kontra multiplier, so e.g. a kontrázott red
// parti (2×4×4 = 32) cannot be taken over by a plain teljes red durchmars (12).
// Individual-kontra contracts (betli / nt-durchmars) use the common (min) level,
// matching how the stake is displayed & scored.
function effectiveRankValue(decl, felkFactor, kontra = null) {
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

// Base points for one scoring component under a declaration's color. `open`
// (terített) doubles ONLY a trump Durchmars component (6→12; ×2 again if red).
function componentBasePoints(component, color, open = false) {
  if (isNoTrumpContract(component)) return NO_TRUMP_CONTRACTS[component].base
  const info = TRUMP_COMPONENTS[component]
  if (!info) throw new Error(`Unknown component: ${component}`)
  let base = info.base
  if (open && component === 'durchmars') base *= 2
  return color === 'red' ? base * 2 : base
}

function componentLabel(component) {
  return (TRUMP_COMPONENTS[component] || NO_TRUMP_CONTRACTS[component] || {}).label || component
}

// Total point value of a declaration (incl. parti) — used for display.
function declarationValue(decl) {
  return decl.scoring.reduce((sum, c) => sum + componentBasePoints(c, decl.color, decl.open), 0)
}

// Bidding rank is the FULL value INCLUDING the parti: an Ulti is 4+1 = 5, a
// clean Betli is 5, a 40-100 is 4. So Ulti outranks 40-100 (5 > 4). Ties are
// broken by fewerComponents.
function rankValue(decl) {
  return decl.scoring.reduce((sum, c) => sum + componentBasePoints(c, decl.color, decl.open), 0)
}

// Tie-break for equal (effective) value: the bid with FEWER scoring components
// ranks higher — a clean Betli [betli] (1) beats an Ulti [ulti, parti] (2),
// even though both are worth 5. Equal value AND equal component count ⇒ neither
// out-ranks the other (cannot outbid).
function fewerComponents(next, current) {
  return next.scoring.length < current.scoring.length
}

function isHigherDeclaration(next, current) {
  const dv = rankValue(next) - rankValue(current)
  if (dv !== 0) return dv > 0
  return fewerComponents(next, current)
}

// A short human label for a declaration, e.g. "Ulti + 40-100 (piros)".
const SUIT_LABEL = { makk: 'Makk', zold: 'Zöld', tok: 'Tök', piros: 'Piros' }
function declarationLabel(decl) {
  if (decl.isNoTrump) return componentLabel(decl.components[0])
  // Terített (open) trump durchmars is shown as "Terített durchmars".
  const parts = decl.components.map((c) => (decl.open && c === 'durchmars' ? `Terített ${componentLabel(c).toLowerCase()}` : componentLabel(c)))
  const base = parts.join(' + ')
  if (decl.color === 'red') return `${base} (piros)`
  // Include the concrete trump suit when it is public: named upfront in félkez, or
  // revealed after the opening lead in teljes. Hidden-trump normal bids have
  // trumpSuit null (chosen at the lead) → no suit shown.
  if (decl.trumpSuit) return `${base} (${SUIT_LABEL[decl.trumpSuit] || decl.trumpSuit})`
  return base
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
  isIndividualKontra,
  buildDeclaration,
  simpleDeclaration,
  noTrumpDeclaration,
  expandDeclaration,
  effectiveRankValue,
  componentBasePoints,
  componentLabel,
  declarationValue,
  rankValue,
  fewerComponents,
  isHigherDeclaration,
  declarationLabel,
  getInitialBidderSeat,
  getNextBidderSeat,
}
