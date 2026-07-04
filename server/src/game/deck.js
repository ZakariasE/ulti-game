const SUITS = ['makk', 'zold', 'piros', 'tok']
const RANKS = ['asz', 'kiraly', 'felso', 'also', '10', '9', '8', '7']

function createDeck() {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}_${rank}`, suit, rank })
    }
  }
  return deck
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function deal(shuffledDeck) {
  // 10 cards to each of 3 players, 2 card talon
  const hands = [
    shuffledDeck.slice(0, 10),
    shuffledDeck.slice(10, 20),
    shuffledDeck.slice(20, 30),
  ]
  const talon = shuffledDeck.slice(30, 32)
  return { hands, talon }
}

module.exports = { SUITS, RANKS, createDeck, shuffle, deal }
