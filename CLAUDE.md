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

### Declarations = bundles of components

A bid is a **declaration**: a set of scoring components plus a **color** (Normal or Red = Hearts, which doubles the trump components). Each component is scored **independently** (won/lost) at round end; the round delta is the sum.

**Trump components** (base points per defender; ×2 if Red):

| Component | Base | Win condition |
|---|---|---|
| Parti | 1 | Declarer's card points ≥ 50 (of 90 + announced marriages) |
| Ulti | 4 | Win the last trick with the 7 of trumps |
| 4 Aces (Négy Ász) | 4 | Declarer wins all four aces in tricks |
| 40-100 | 4 | Card points ≥ 100 incl. an announced 40 (K+O in trump) |
| 20-100 | 8 | Card points ≥ 100 incl. an announced 20 (K+O non-trump) |
| Durchmars | 6 | Declarer wins all 10 tricks |

**No-trump standalone contracts** (flat; cannot combine): Betli 5, Heart Betli 10, Open Betli 20, Durchmars 6, Heart Durchmars 12, Open Durchmars 24. Betli = win zero tricks; Durchmars = win all tricks. "Open" reveals the declarer's hand after trick 1.

**Combination rules:**
- Combinable: Ulti, 40-100, 20-100, 4 Aces, Durchmars (any subset).
- Betli never combines.
- At most **one** of {40-100, 20-100}.
- **Parti** is bundled only when *every* component is a parti-bearer (Ulti / 4 Aces). Mixing a parti-bearer with a non-parti component drops the parti — e.g. `40-100 + Ulti = 4+4 = 8`, not 9. `Ulti + 4 Aces = 4+4+1 = 9`.
- Trump Durchmars must be combined with another trump component (standalone Durchmars is the no-trump contract).

**Bid ranking** = total declaration value (Σ component base, ×2 for Red), with a fixed tiebreak for equal values.

**Hidden trump:** you bid only Normal or Red. For a Normal declaration the concrete trump (Makk/Zöld/Tök) is chosen **when the declarer leads the first card**, and revealed then. Red = Hearts, known upfront.

**Marriages:** at the opening lead the declarer chooses which held marriages (K+O) to announce — none / any combo. Announced marriages add **40** (trump suit) or **20** (other) to the declarer's card points (needs ≥1 trick won). 40-100 requires an announced 40; 20-100 an announced 20.

**Payout:** per component — on win each defender pays `base × kontra`; on loss the declarer pays each defender.

### Kontra (per component, tied to card plays)

Each component can be doubled **independently**. Timing follows each player's own card count:
- A **defender** may Kontra (×2) a component as they play their **1st** card.
- The **declarer** answers Rekontra (×4) as they play their **2nd** card.
- Defenders Szubkontra (×8) on their **2nd** cards, and so on — each step only if the previous was made.

You may kontra all components or just individual ones.

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
