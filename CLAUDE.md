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

1. The player to the dealer's right is dealt **12 cards** (their 10 + the 2-card talon).
2. That player **must discard 2** (forming a new face-down talon) and **declare an opening contract** (at least Simple).
3. Going anticlockwise, each other player may **pass**, or **"rob"** — pick up the 2-card talon, discard 2, and declare a **higher** contract.
4. Bidding ends only when **all three players pass in succession** after the last bid. The high bidder gets a final turn to rob their **own** talon and raise; if they pass too, bidding closes.
5. The highest bidder is the **declarer**; the other two are **defenders**.
6. The final talon on the table counts toward the declarer's card points.

### Contracts

| Contract | Points (minor / hearts) | Win Condition |
|---|---|---|
| Simple (Parti) | 1 / 2 | Declarer scores ≥ 50 of 90 card points |
| 40-100 | 4 / 8 | Score ≥ 100 incl. a 40-pt marriage (K+O) in the **trump** suit |
| 20-100 | 8 / 16 | Score ≥ 100 incl. a 20-pt marriage (K+O) in a **non-trump** suit |
| Ulti | 4 / 8 (lose: −8 / −16) | Score ≥ 50 AND win last trick with the 7 of trumps |
| Betli | 5 (flat) | Declarer wins zero tricks (no trumps) |
| Heart Betli | 10 (flat) | As Betli, higher stake |
| Open Betli | 20 (flat) | Betli with declarer's hand revealed after trick 1 |
| Durchmars | 6 (flat) | Declarer wins all 10 tricks (no trumps) |
| Heart Durchmars | 12 (flat) | As Durchmars, higher stake |
| Open Durchmars | 24 (flat) | Durchmars with declarer's hand revealed after trick 1 |

**Bid ladder (low → high):** Simple(minor) < Simple(hearts) < 40-100(minor) < Betli < Ulti(minor) < Durchmars < 40-100(hearts) < 20-100(minor) < Ulti(hearts) < Heart Betli < Heart Durchmars < 20-100(hearts) < Open Betli < Open Durchmars.

**Payout:** On win, each defender pays the declarer `basePoints`. On loss, the declarer pays each defender `basePoints`. Hearts doubles the trump contracts (Simple, 40-100, Ulti, 20-100); the Betli/Durchmars variants are flat.

**Marriages** (40-100 / 20-100) are auto-detected from the King + Over the declarer held in the relevant suit (simplified — no explicit in-play declaration yet).

### Kontra (doubling)

Before the first trick finishes, a **defender** may call **Kontra** (×2). The declarer answers with **Rekontra** (×4), then a defender **Szubkontra** (×8), and so on — each doubling the stakes. The multiplier applies to the round's payout.

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

## Credits

- Card images: Hungarian playing cards (Tell pattern) from
  [tomasdrus/hungarian-playing-cards](https://github.com/tomasdrus/hungarian-playing-cards),
  stored in `client/public/cards/` (medium size). Filenames are
  `{suit}-{rank}.png` where suit ∈ {acorn, leaf, bell, heart} and
  rank ∈ {ace, king, ober, unter, ten, nine, eight, seven}, plus `back.png`.
  The mapping to internal ids lives in `client/lib/cards.js`.
