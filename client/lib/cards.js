// Canonical suit order for displaying a hand, grouped by suit.
export const SUIT_ORDER = { makk: 0, zold: 1, tok: 2, piros: 3 }

// Rank order for display within a suit (high to low).
export const RANK_ORDER = { asz: 0, kiraly: 1, felso: 2, also: 3, '10': 4, '9': 5, '8': 6, '7': 7 }

export const RANK_LABEL = {
  asz: 'A', kiraly: 'K', felso: 'F', also: 'U', '10': '10', '9': '9', '8': '8', '7': '7',
}

export const SUIT_NAMES = { makk: 'Makk', zold: 'Zöld', tok: 'Tök', piros: 'Piros' }

// Colors for the four Hungarian suits.
export const SUIT_COLORS = {
  makk: '#7a4a1e', // acorns — brown
  zold: '#2e7d32', // leaves — green
  tok: '#e0a80d',  // bells — gold
  piros: '#c62828', // hearts — red
}

const COURT_RANKS = new Set(['kiraly', 'felso', 'also'])
export function isCourt(rank) { return COURT_RANKS.has(rank) }

// Sort a hand grouped by suit, ordered by rank within each suit.
export function sortHand(cards) {
  return [...cards].sort(
    (a, b) =>
      (SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]) ||
      (RANK_ORDER[a.rank] - RANK_ORDER[b.rank])
  )
}

// Pip positions (as [col, row] on a 3-wide x 5-tall grid) for number cards.
// Mirrors the layout of traditional playing cards.
export const PIP_LAYOUTS = {
  '7': [[1, 0], [0, 1], [2, 1], [1, 2], [0, 3], [2, 3], [1, 4]],
  '8': [[0, 0], [2, 0], [0, 1], [2, 1], [0, 3], [2, 3], [0, 4], [2, 4]],
  '9': [[0, 0], [2, 0], [0, 1], [2, 1], [1, 2], [0, 3], [2, 3], [0, 4], [2, 4]],
  '10': [[0, 0], [2, 0], [1, 0.7], [0, 1.7], [2, 1.7], [0, 2.7], [2, 2.7], [1, 3.3], [0, 4], [2, 4]],
}
