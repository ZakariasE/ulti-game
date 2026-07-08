// Canonical suit order for displaying a hand, grouped by suit.
export const SUIT_ORDER = { makk: 0, zold: 1, tok: 2, piros: 3 }

// Card strength within a suit, high to low. Differs between trump games and
// no-trump games (Betli/Durchmars): the Ten drops below the court cards.
export const STRENGTH_TRUMP = { asz: 8, '10': 7, kiraly: 6, felso: 5, also: 4, '9': 3, '8': 2, '7': 1 }
export const STRENGTH_NOTRUMP = { asz: 8, kiraly: 7, felso: 6, also: 5, '10': 4, '9': 3, '8': 2, '7': 1 }

// Contracts played without trumps, where the Ten is weak.
export const NO_TRUMP_CONTRACTS = new Set([
  'betli', 'heart_betli', 'open_betli',
  'durchmars_nt', 'open_durchmars',
])
export function strengthMode(contract) {
  return contract && NO_TRUMP_CONTRACTS.has(contract) ? 'notrump' : 'trump'
}

export const SUIT_NAMES = { makk: 'Makk', zold: 'Zöld', tok: 'Tök', piros: 'Piros' }

// Map internal suit/rank ids to the image filenames in /public/cards
// (from github.com/tomasdrus/hungarian-playing-cards).
const IMG_SUIT = { makk: 'acorn', zold: 'leaf', tok: 'bell', piros: 'heart' }
const IMG_RANK = {
  asz: 'ace', kiraly: 'king', felso: 'ober', also: 'unter',
  '10': 'ten', '9': 'nine', '8': 'eight', '7': 'seven',
}
export function cardImage(card) {
  return `/cards/${IMG_SUIT[card.suit]}-${IMG_RANK[card.rank]}.png`
}
export const CARD_BACK_IMAGE = '/cards/back.png'

// Sort a hand grouped by suit, ordered by strength within each suit.
// mode: 'trump' (default) or 'notrump' — controls where the Ten sits.
export function sortHand(cards, mode = 'trump') {
  const strength = mode === 'notrump' ? STRENGTH_NOTRUMP : STRENGTH_TRUMP
  return [...cards].sort(
    (a, b) =>
      (SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]) ||
      (strength[b.rank] - strength[a.rank])
  )
}
