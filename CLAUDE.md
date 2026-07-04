# Ulti Game — Claude Code Notes

## Commit Policy

After every meaningful change, commit and push. Do not batch unrelated changes into one commit. Each commit should be atomic and describe what changed and why.

## Project Overview

A web-based multiplayer implementation of **Ulti**, the Hungarian trick-taking card game, for exactly 3 players connected via room codes (no login required).

---

## Game Rules (Phase 1)

These are the agreed rules for the current implementation. Edit this section whenever rules change.

### Deck

32-card Hungarian Tell pattern deck. Four suits:
- **Makk** (Acorns)
- **Zöld** (Leaves)
- **Piros** (Hearts) — doubles all point values when trump or bid in hearts
- **Tök** (Bells)

Eight ranks per suit: Ász (Ace), Király (King), Felső (Over), Alsó (Under), 10, 9, 8, 7.

### Card Ranking

**With trumps:** A > 10 > K > O > U > 9 > 8 > 7 *(Ten beats King)*
**Without trumps (Betli/Durchmars):** A > K > O > U > 10 > 9 > 8 > 7

### Card Points (trump games only)

- Aces and Tens = 10 points each (8 cards × 10 = 80 pts)
- Winning the last trick = 10 points
- Total available = 90 points
- Talon and discards count toward the declarer's point total

### Deal

10 cards to each of 3 players, 2 cards form the face-down talon. Deal order is anticlockwise.

### Bidding

1. The player to the dealer's right receives the talon (2 face-down cards).
2. They may take the talon (pick up both cards, discard 2 from their extended hand) and name a contract, or pass the talon to the next player anticlockwise.
3. Each player who takes the talon must bid a contract **higher** than the current high bid, then discard 2 cards.
4. Bidding ends when 3 consecutive players pass.
5. The highest bidder is the **declarer**; the other two are **defenders**.
6. If all three players pass without any bid: the player to dealer's right is forced to play Simple (minor) — placeholder rule.

### Contracts (Phase 1)

| Contract | Points (minor / hearts) | Win Condition |
|---|---|---|
| Simple (Parti) | 1 / 2 | Declarer scores ≥ 50 of 90 card points |
| Ulti | 4 / 8 (lose: −8 / −16) | Score ≥ 50 AND win last trick with the 7 of trumps |
| Betli | 5 (flat) | Declarer wins zero tricks (no trumps) |
| Durchmars | 6 (flat) | Declarer wins all 10 tricks (no trumps) |

**Bid rank (lowest → highest):** Simple(minor) < Simple(hearts) < Betli < Ulti(minor) < Durchmars < Ulti(hearts)

**Payout:** On win, each defender pays the declarer `basePoints`. On loss, the declarer pays each defender `basePoints`. Hearts doubles Simple and Ulti only; Betli and Durchmars are flat.

### Trick-Taking Rules

1. Must follow the led suit if possible.
2. If void in led suit, must play a trump if possible (trump games only).
3. Must beat the current highest card in the trick if possible.
4. Declarer leads the first trick.
5. Play proceeds anticlockwise.

### Scoring

- Cumulative scores tracked across rounds.
- Dealer rotates anticlockwise each round.
- All score changes are applied at end of round.

---

## Tech Stack

- **Frontend:** Next.js (React), Socket.io client
- **Backend:** Node.js, Express, Socket.io
- **Monorepo:** npm workspaces (`/server`, `/client`)
- **Rooms:** 6-character alphanumeric room codes, no auth
