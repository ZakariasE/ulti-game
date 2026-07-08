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
3. Going anticlockwise, each other player may **pass**, or **"rob"** — pick up the 2-card talon, then in one step choose the 2 to discard **and** declare a **higher** contract.
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

> Kontra is **per-component** everywhere. In the base game (and the reopened
> teljes-kéz round) it happens **during play**, per card-timing. In the **félkezes
> 5-card round** it happens **during bidding**: on your turn you may pass, **kontra
> any subset** of the standing bid's components, or outbid. That per-component
> kontra chain is **carried into play** (seeded into `play.kontra`) and can
> continue there per-component. Alternates defenders → declarer → defenders; an
> outbid clears it.
>
> **Multiplier depends on when the kontra is made:** a kontra made while still in
> the **5-card félkez round quadruples (×4)** the component; a kontra made in
> **teljes kéz (10 cards — i.e. during play) doubles (×2)**. So a component can be,
> e.g., ulti ×4 (kontra'd in the 5-card round) then ×8 (rekontra'd in play).
> Because ×4 breaks `level == 2^step`, kontra state is `{ level (scoring
> multiplier), step (escalation count, drives timing + Kontra/Rekontra/… naming),
> lastParty }`. `scoring.js` multiplies by `level`; timing/naming use `step`.

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

A two-stage deal + bidding. A bid **won in the 5-card round** is worth **×4** (a
normal Parti = 4, red = 8); a bid won in the reopened round is a **normal** bid.

1. **Deal 5** cards to each player; the other 17 are held back (`state.reserve`).
2. **First (5-card) bidding round** (`bidding.mode='felkezes'`, one `BID` phase):
   - Each turn: **declare, pass, or kontra**. The opener may pass too.
   - **Named trump:** in Félkezes every trump goal names its concrete suit
     (Makk/Zöld/Tök/Piros) **at declaration** — no hidden trump. Piros = red (×2).
   - **Pre-bid redeal:** if the bidding goes **two full go-arounds with no bid**
     (2n passes), redeal and double the whole-hand value (`redealMultiplier`
     ×2, compounding; resets when a hand is actually played).
   - **Per-component bidding-kontra.** On your turn you may **pass**, **kontra any
     subset** of the standing bid's components, or **outbid**. A kontra here is
     **×4** per level (vs ×2 in play — see the Kontra section), alternating
     defenders → declarer. The chain is seeded into `play.kontra` and continues in
     play. Bids compare by **effective value** = `rank × 4 (5-card only)` (kontra
     does not gate outbidding; an outbid clears it).
   - **Closing:** bidding ends when the current **high bidder (declarer) passes**
     on their own turn — they always get the final say (raise/kontra/pass). Plain:
     declare → pass → pass → declarer passes.
   - **Required-ulti reveal:** announcing an Ulti reveals the announcer's 5 cards
     to everyone until the second deal (kötelező games).
3. **Second deal:** the winner gets +7 (→12), each defender +5 (→10); the winner
   discards 2 (their talon).
4. **Reopened bidding round** (`bidding.mode='normal'`): plays out **exactly like
   the base 10-card game** — others may rob the talon and outbid, and the
   **declarer can change**. **Trump is hidden here** (base-game behavior): a bid
   made in this round names only Normal/Red; the concrete minor trump is chosen at
   the **opening lead**, *not* at declaration (only the 5-card round names its suit
   upfront). A bid made here is a **normal (×1)** bid, but it must still exceed the
   standing bid's effective value (so a teljes red 40-100 [8] beats a félkez Parti
   [4] but not a félkez Ulti [16]). **No bidding-kontra in this round** (kontra
   resumes/continues in play). Robbing combines **discard + declaration** into one
   step (pick 2 to put down + your bid, confirm once).
5. **Play.** Kontra is **per-component** (exactly like the base game): a defender
   kontra on their 1st card, the declarer's rekontra on their 2nd card, etc. Any
   kontra from the 5-card round is already seeded here and continues.
6. **Scoring** = component × per-component kontra level × 4 (**only if won in the
   5-card round**) × 2^k (redeals).

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

## Architecture / Code Map

### Layout
- **Monorepo** (npm workspaces): `server/` (Node/Express/Socket.io) + `client/` (Next.js/React).
- **Server** runs on **port 3001 via nodemon** — a reload **wipes in-memory games**, so
  always start a **fresh room** to test. Games live only in memory (`RoomManager`).
- **Client** sanity-check: `cd client && npx next build`. No DB, no auth.
- **Testing approach:** node simulations that drive `GameState.js` directly (require the
  module, build a state with `createGameState`, call the `apply*` functions, assert on
  `state.*`). Fast and deterministic; use these before/after logic changes. The client is
  verified with a build + live play.

### Server (`server/src/`)
- **`game/GameState.js`** — the whole engine (pure functions mutating a `state` object). Key fns:
  - `createGameState(roomCode, players, options)` → `normalizeOptions`; sets top-level
    `options`, `scores`, `declaredScores`, `buli`, `reserve`, `redealMultiplier`.
  - `applyDeal` — base: 10 each + 2 talon (first bidder gets 12); félkezes: 5 each + 17 `reserve`.
  - Bidding: `applyDeclare`, `applyBidPass`, `applyBidDiscard`, `applyRob`,
    `applyBiddingKontra`/`biddingKontraOptions` (félkez per-component bidding kontra), `_redealFelkezes`, `_felkezesSecondDeal`,
    `_resolveBidding` → `_startPlay`. Helper `_felkezFactor(round)` = 4 for `'felkezes'` else 1.
  - Play: `applyFirstLead` (opening lead names the trump), `applyPlayCard`, `_getLegalCardIds`,
    `_autoRecordContractMarriage` (auto 40/20 for 40-100/20-100), claims (`startClaim`,
    `respondClaim`, "nincs több ütés").
  - Kontra — per-component in **every mode**, state `{ level, step, lastParty }`
    (`level` = scoring multiplier, `step` = escalation count for timing/naming).
    Play-time (×2): `eligibleKontra`, `applyKontra`, `_kontraExpectation(step)` (card
    timing). Félkez 5-card **bidding** (×4): `biddingKontraOptions` (which components
    my side may double now) + `applyBiddingKontra` (turn-based). `_startPlay` seeds
    `play.kontra` from `bidding.kontra`, so the chain continues into play. `scoring.js`
    multiplies by `level`.
  - Round end: `applyRoundEnd` — **branches on buli**. Buli tracks only
    `result.declarerRaw` (+ `_requiredUltiBonus`) into `declaredScores`/`buli.points`;
    non-buli adds pairwise `result.deltas` to `scores`. An **üres** hand (declarer
    net 0 → `result.empty`) does **not** increment `buli.handsPlayed` (dealer still
    shifts, hand replayed). `_markKotelezo`, `_settleBuli`
    (premium ±, kötelező penalties), `startBuli`, `prepareNextRound` (clears round-scoped
    fields, resets `redealMultiplier`/`felkezesReveal`/`felkezesFives`/`reserve`).
  - Snapshots: `biddingSnapshot` (hides concrete minor trump; includes `currentHighBid.round`),
    `buliSnapshot`, `publicDeclaration`, `handCounts`.
- **`game/scoring.js`** — `calculateRoundScore({..., stakeMultiplier})` → `{ components[],
  deltas{pid}, declarerRaw, cardTotal, partiDetail, declarerId, color, stakeMultiplier }`.
  `payout = base × kontraLevel × (hundred?2:1) × stakeMultiplier`; `deltas[declarer] =
  Σ payout × nDef`; **`declarerRaw = Σ component.delta`** (per-defender total — what buli uses).
- **`game/bidding.js`** — declaration build/validate/rank (server mirror of `client/lib/bids.js`).
- **`game/deck.js`** — deck + deal helpers. **`socket/handlers.js`** — all events (below).
  **`rooms/RoomManager.js`** — room lifecycle.

### State shape (server `state`, largely mirrored to clients)
- `phase`: `LOBBY | DEALING | BIDDING | PLAYING | SCORING | BULI_OVER`.
- `options`: `{ felkezes, fourAces (Négy ász biddable; default on), buli:{on,handsPerBuli,premium}, kotelezo:{on,ultiPenalty,betliPenalty}, stake }`.
- `bidding`: `{ mode:'felkezes'|'normal', phase:'BID'|'DISCARD'|'DECLARE'|'ROB_OFFER'|'POST_DEAL_DISCARD'|'DONE',
  currentBidderSeat, currentHighBid:{playerId, round, declaration}, kontra:{ [comp]:{level,step,lastParty} } (per-component bidding kontra; ×4/level),
  consecutivePasses, history }`. Closing = **the current high bidder passes on their turn**.
- `play`: `{ declarerId, defenderIds, declaration, felkezesBid (bool → drives ×4),
  kontra{comp:{level,step,lastParty}} (per-component, all modes; seeded from bidding.kontra; play kontra ×2/level),
  cardsPlayed{pid}, marriages, currentTrick, completedTricks, declarerFive, openingLeadDone, claim }`.
- Top-level: `scores` (non-buli), `declaredScores` (buli, RAW), `buli:{index,handsPlayed,points,kotelezo,over,history}`,
  `reserve`, `redealMultiplier`, `felkezesReveal`, `felkezesFives`, `talonInHand`, `roundResult`.

### Socket events
- **client→server:** `room:create` (w/ options), `room:join`, `game:start`, `bid:declare`,
  `bid:pass`, `bid:discard`, `bid:rob`, `bid:kontra` (félkez per-component bidding kontra; `{components}`), `play:firstLead`,
  `card:play`, `claim:start`, `claim:respond`, `round:continue`, `buli:next`.
- **server→client:** `room:created/joined`, `game:started`, `hand:dealt`, `talon:held`,
  `bid:state`, `bid:resolved`, `felkezes:redeal/reveal/playkontra`, `declarer:trump/marriages/revealed`,
  `marriage:announced`, `kontra:updated`, `opening:info` (declarer only), `play:turnStart`,
  `card:played`, `trick:completed`, `round:completed`, `buli:completed`, `round:ready`, `claim:pending/result`,
  `game:error`/`room:error`.
- Robbing sends **`bid:discard` then `bid:declare` back-to-back** (combined discard+declare UI).

### Client (`client/`)
- **`context/GameContext.js`** — reducer + big `state`. Notable staging fields: `pendingKontra`
  (per-component play kontra), `pendingBidKontra` (per-component félkez **bidding** kontra),
  `pendingDiscard` (combined discard+declare),
  `pendingMarriages`. Bidding mirror: `biddingMode`, `biddingPhase`, `currentHighBid` (incl `round`),
  `biddingKontra` (per-component bidding kontra map), `redealMultiplier`. `declaredScores`, `buli`.
  Event→dispatch wiring is in **`pages/game/[roomCode].js`**.
- **Components (`components/game`):** `GameTable` (info bar shows the standing bid during bidding),
  `BidPanel` (bidding + the combined discard+declare when phase is `DISCARD`; also the
  per-component **bidding-kontra** chips + `Kontrázok` in the félkez 5-card round via
  `TOGGLE_BID_KONTRA`/`bid:kontra`), `PlayerHand` (play + discard
  selection via `TOGGLE_DISCARD`; opening-lead gate uses `effectiveTrump = trumpSuit||pendingTrump`),
  `KontraBar` (per-component play kontra; shows carried-over bidding kontra levels),
  `MarriageBar`, `TrumpChoice` (concrete-suit pick before the opening lead; shown for any
  hidden-trump Normal contract, incl. the reopened félkez round), `RoundResult` (buli mode shows `declarerRaw`), `BuliScoreboard`,
  `BuliResult`/`BULI_OVER`, `Elszamolas` (client-only settlement). Lobby: `GameOptionsModal`, `WaitingRoom`.
- **`lib/bids.js`** — declaration helpers (mirror of `server/game/bidding.js`; keep in sync).
  **`lib/cards.js`** — card id ↔ image mapping.

### Key invariants (easy to break)
- **×4 is tied to `currentHighBid.round === 'felkezes'`** → `state.play.felkezesBid`. A bid won in
  the reopened (teljes kéz) round is a **normal ×1** bid. Cross-round outbids compare **effective
  value** (`rank × _felkezFactor × kontra`).
- **Buli scoring is RAW** (one unit per defender); the pairwise ×2 is applied **only in Elszámolás**.
- **Félkezes opening lead:** in the **5-card round** trump is named at declaration, so the
  client gates on `effectiveTrump = trumpSuit||pendingTrump`, not `pendingTrump` (else the
  declarer can't lead → freeze). In the **reopened round** trump is hidden and picked via
  `TrumpChoice` at the opening lead, exactly like the base game.
- **Kontra is per-component in every mode.** Base game / reopened round: during **play**
  (`eligibleKontra`/`applyKontra`, card timing, **×2**). Félkez 5-card round: during
  **bidding** (`biddingKontraOptions`/`applyBiddingKontra`, turn timing, **×4**), then seeded
  into `play.kontra` and continued in play. Both `state.bidding.kontra` and `state.play.kontra`
  are per-component `{ [comp]: { level, step, lastParty } }` maps — keep them in the same
  shape. **`level` is the scoring multiplier; `step` drives timing + Kontra/Rekontra/… naming**
  (don't use `log2(level)` for step — a ×4 kontra breaks that).

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
