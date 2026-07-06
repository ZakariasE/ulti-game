# Ulti Game — Claude Code Notes

## Commit Policy

After every meaningful change, commit and push. Do not batch unrelated changes into one commit. Each commit should be atomic and describe what changed and why.

## Project Overview

A web-based multiplayer implementation of **Ulti**, the Hungarian trick-taking card game, for exactly 3 players connected via room codes (no login required).

---

## Base Game Rules

The core 3-player game (all house-rule options off). Edit this section whenever rules change; house-rule variants are in the **House Rules** section below.

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
- The talon's point cards (Aces/Tens) count toward the **defenders'** total when scoring the Parti (they show as a separate `talon` term in the defenders' breakdown)

### Deal

10 cards to each of 3 players, 2 cards form the face-down talon. Deal order is anticlockwise.

### Bidding

1. The player to the dealer's right is dealt **12 cards** (their 10 + the 2-card talon).
2. That player **must discard 2** (forming a new face-down talon) and **declare an opening contract** (at least Simple).
3. Going anticlockwise, each other player may **pass**, or **"rob"** — pick up the 2-card talon, discard 2, and declare a **higher** contract.
4. Bidding ends only when **all three players pass in succession** after the last bid. The high bidder gets a final turn to rob their **own** talon and raise; if they pass too, bidding closes.
5. The highest bidder is the **declarer**; the other two are **defenders**.
6. The final talon on the table counts toward the **defenders'** card points when scoring (its Aces/Tens go to the defense).

### Declarations = bundles of components

A bid is a **declaration**: a set of scoring components plus a **color** (Normal or Red = Hearts, which doubles the trump components). Each component is scored **independently** (won/lost) at round end; the round delta is the sum.

**Trump components** (base points per defender; ×2 if Red):

| Component | Base | Win condition |
|---|---|---|
| Parti | 1 | Declarer's total (own tricks + own marriages) **exceeds** the defenders' total. **Reaching 100** doubles the Parti stake for whichever side wins it. |
| Ulti | 4 | Win the last trick with the 7 of trumps |
| 4 Aces (Négy Ász) | 4 | Declarer wins all four aces in tricks |
| 40-100 | 4 | Card points ≥ 100 incl. an announced 40 (K+O in trump) |
| 20-100 | 8 | Card points ≥ 100 incl. an announced 20 (K+O non-trump) |
| Durchmars | 6 | Declarer wins all 10 tricks |

**No-trump standalone contracts** (flat; cannot combine): Betli 5, Heart Betli 10, Open Betli 20, Durchmars 12, Heart Durchmars 24, Open Durchmars 48. Betli = win zero tricks; Durchmars = win all tricks. "Open" reveals the declarer's hand after trick 1.

**Early termination:** a pure Betli or a pure Durchmars (trump or no-trump) ends the **instant its goal becomes impossible** — Betli the moment the declarer wins a trick, Durchmars the moment a defender wins one — and is scored as a loss without playing out the remaining tricks. (A Durchmars combined with other trump components plays on.)

**Combination rules:**
- Combinable: Ulti, 40-100, 20-100, 4 Aces, Durchmars (any subset).
- Betli never combines.
- At most **one** of {40-100, 20-100}.
- **Parti** is bundled only when *every* component is a parti-bearer (Ulti / 4 Aces). Mixing a parti-bearer with a non-parti component drops the parti — e.g. `40-100 + Ulti = 4+4 = 8`, not 9. `Ulti + 4 Aces = 4+4+1 = 9`.
- Trump Durchmars may be declared standalone (worth 6, or 12 in red) or combined with other trump components. The no-trump Durchmars (12 / 24 / 48) is a separate contract.

**Bid ranking** ignores the **+1/+2 Parti bonus**: rank by the sum of the *non-parti* component bases (×2 for Red), with a fixed tiebreak. So a clean **Betli (5) outranks Ulti (4+1)**, and **Heart Betli (10) outranks Heart Ulti (8+2)**. (The full value, incl. parti, is still used for scoring and display.)

**Hidden trump:** you bid only Normal or Red. For a Normal declaration the concrete trump (Makk/Zöld/Tök) is chosen **when the declarer leads the first card**, and revealed then. Red = Hearts, known upfront.

**Marriages (jelentés):** **every player** may announce held marriages (K+O) on **their own first card** — announced by default, opt out per suit. A jelentés adds **40** (trump suit) or **20** (other) to the announcing side's card points (that side must win ≥1 trick). Only the **value** (20/40) is announced publicly — never the suit. Jelentések can **only** be announced in contracts that carry a **Parti**; in Parti-less contracts (Betli, Durchmars, 40-100, 20-100, …) they cannot be announced. For **40-100 / 20-100** the required 40 (trump K+O) / 20 (a non-trump K+O) is **implied by the contract** and auto-counted for the declarer, not announced. The **Parti** is won when the declarer's total (trick points + own marriages) **exceeds the defenders' total** (their points + their marriages).

**Payout:** per component — on win each defender pays `base × kontra`; on loss the declarer pays each defender.

### Kontra (per component, tied to card plays)

Each component can be doubled **independently**. Timing follows each player's own card count:
- A **defender** may Kontra (×2) a component as they play their **1st** card.
- The **declarer** answers Rekontra (×4) as they play their **2nd** card.
- Defenders Szubkontra (×8) on their **2nd** cards, and so on — each step only if the previous was made.

You may kontra all components or just individual ones.

> Per-component play kontra applies to the **base game only**. Félkezes uses a
> single hand-wide kontra chain declared at bidding time (see House Rules).

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

## House Rules (options)

When a room is **created**, the host picks options in a modal (`GameOptionsModal`).
They are normalized in `createGameState` and stored on `state.options`
(`felkezes`, `buli:{on,handsPerBuli,premium}`, `kotelezo:{on,ultiPenalty,betliPenalty}`,
`stake`), echoed to all clients, and shown in the waiting room. All four toggles
are independent, except **Kötelező** is only selectable when Félkezes **and** Buli
are both on. Defaults: Félkezes off; Buli off, 18 hands/buli, premium 50; Kötelező
on (Ulti 220 / Betli-40-100 110); stake 1. Base (non-house-rule) play is unchanged
when everything is off.

### Félkezes ("half-hand")

A two-stage deal + bidding. Every bid is worth **×4** (a normal Parti = 4, red = 8).

1. **Deal 5** cards to each player; the other 17 are held back (`state.reserve`).
2. **First (5-card) bidding round** (`bidding.mode='felkezes'`, one `BID` phase):
   - Each turn: **declare, pass, or kontra**. The opener may pass too.
   - **Named trump:** in Félkezes every trump goal names its concrete suit
     (Makk/Zöld/Tök/Piros) **at declaration** — no hidden trump. Piros = red (×2).
   - **Pre-bid redeal:** if the bidding goes **two full go-arounds with no bid**
     (2n passes), redeal and double the whole-hand value (`redealMultiplier`
     ×2, compounding; resets when a hand is actually played).
   - **Bidding-kontra** (5-card round only): a defender (even chain levels) or the
     declarer (odd) escalates on their turn. Each level is **×4** here. The kontra
     inflates the **value-to-beat** (to outbid, raw value must exceed
     `rank(current) × kontra-multiplier`); a fresh outbid **clears** the kontra.
   - **Closing:** the last declarer/kontra-er gets no redundant final turn — once
     the other two pass (n−1), the round closes (so declare → kontra → pass → pass
     ends the bidding and deals the cards).
   - **Required-ulti reveal:** announcing an Ulti reveals the announcer's 5 cards
     to everyone until the second deal (kötelező games).
3. **Second deal:** the winner gets +7 (→12), each defender +5 (→10); the winner
   discards 2 (their talon).
4. **Reopened bidding round** (`bidding.mode='normal'`): plays out **exactly like
   the base 10-card game** — others may rob the talon and outbid, and the
   **declarer can change** (with the high bidder's usual final turn). The félkezes
   bid (with any standing kontra) is the value-to-beat. **No bidding-kontra here;**
   the chain continues in play.
5. **Play.** No per-component kontra — one hand-wide chain. It **continues into
   play** at the **normal per-card kontra timing** (×2/level): a fresh defender
   kontra on their 1st card, the declarer's rekontra on their **2nd** card,
   szubkontra on the defender's 2nd card, etc. A kontra already made in the 5-card
   round does **not** shift this earlier. Card for level L = `ceil((L+1)/2)`.
6. **Scoring** = component × 4 (félkezes) × 2^k (redeals) × kontra-chain multiplier.

### Buli (a "party" of hands)

A chain of `handsPerBuli` hands. Scoring differs:
- Only the **declarer's own RAW** result (one unit, per defender) is tracked per
  hand in `declaredScores` — a won zöld parti in félkezes is **4, not 8**. The
  pairwise ×2 is applied **only at Elszámolás**. Defender results are not
  accumulated. Kept across chained bulis.
- At buli end, rank the buli's declared points → **+premium to 1st, −premium to
  last** (middle 0; skipped if all tied), added to `declaredScores`.
- Then a **`BULI_OVER`** screen offers **Következő buli** (chain, keeping totals)
  or **Elszámolás**.

### Kötelező mondások (required sayings, per player, Félkezes + Buli)

Each player must, during the buli, declare **one Ulti** and **one Betli or 40-100**.
Unmet at buli end costs **−220** (Ulti) / **−110** (Betli/40-100), individually.

- The **required Ulti only counts** if the declarer's original 5-card hand holds
  **≤ 3 cards of the trump suit** (revealed). More than 3 → no credit.
- Declared with **fewer than 3** trump cards (2 or 1) → the declarer earns a
  **+10** bonus (**+20** if the Ulti is red) at hand end.

### Elszámolás (settlement)

From the `BULI_OVER` screen: a pure client computation from `declaredScores` and
the lobby **stake** — each player's net = Σ_{j≠i}(Sᵢ − Sⱼ) × stake (zero-sum),
plus a pairwise "who pays whom" breakdown.

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
