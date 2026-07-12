# Spec: Playtest fixes — rotation, Steal UX, scoring reachability

Three issues from Julian's 2026-07-11 playtest. Decisions confirmed interactively 2026-07-12.

## 1. Rotation only works on loose ends

**Problem:** any node with outgoing lanes can rotate, swinging those lanes to new
destinations while lanes *continuing from* the old destinations stay put — mid-path
rotation detaches segments and shreds connectivity (bots spam this: 71 rotations in
one diagnostic game). README already says "unconnected paths may rotate."

**Rule:** a node is rotatable iff it has at least one outgoing lane AND every
outgoing lane ends in a **loose end** — the destination has no other lane incident
to it (no continuation, no other arrivals). Rotation still moves all outgoing lanes
together, and destination validity checks are unchanged.

**Touch points:** shared `isRotatableNode(G, coord)` in helpers.ts, used by
`game.ts` rotateTile validation, `ai.ts` applyMicroAction + rotate enumeration,
and the App/UI rotatable-node computations.

## 2. Steal card: silent failure without a target

**Problem:** Steal ("Take 1 card at random from another player" — random by design,
no hand-picking) opens the action modal with a Target Player dropdown, but Play can
be clicked with no target selected; `resolveCardEffects` throws and the error goes
to `console.warn` — looks like the card simply doesn't work.

**Fix (UI only):**
- Auto-select the sole opponent when the game has exactly one.
- Disable Play until all required inputs for the card are set (target player,
  coord, move from/to, choice, etc. — derive from the existing `actionNeeds*` flags).
- Surface resolve errors inside the modal instead of the console.

## 3. Scoring reachability ("no points at all")

**Problem:** with `STARTING_RING=1`, no lane can ever touch the center origin
(placement to origin blocked; building from ring 0 blocked; rotation can't point at
origins; conversion needs an existing lane on the edge). Path-mode scoring requires
origin-connectivity through the lane graph, so **all scores are permanently 0**, and
`CONSOLIDATION_END` / `CONSOLIDATE_TO_RING=0` can never trigger. Confirmed by
bot-vs-bot games: 108 turns, deck exhausted, 0–0, zero scoring moves ever legal.
This also starves the AI evaluator of its primary signal (score deltas), which is
why bots mostly pass. Predates the consolidation refactor; test fixtures masked it.

**Decision: "Both"**
- **Scoring** treats starting-ring nodes as effective origins (mirroring
  `hasRimConnectedPath`): seed the origin-connected set with ring-`STARTING_RING`
  nodes in `computeIntersectionCountByColorPath`. Points flow during normal play.
- **Game end** still requires true rim-to-center completion, enabled by a new
  **finishing move**: placing a lane from a ring-1 node INTO the origin, allowed iff
  - `CONSOLIDATION` enabled and `CONSOLIDATE_TO_RING === 0`,
  - the placed color is rim-connected AND the source node is on that color's
    rim-connected component (contiguity — same rule as conversion),
  - the color is not already on that origin edge; total lanes on the edge under
    `MAX_LANES_PER_PATH`.
  - Direction is ignored (consolidation-class move, like conversions).
  - Fork support: source is a starting-ring node (free source), so no support
    question arises; NO_INTERSECT doesn't apply to origins (wild).
- `countRimToCenterPaths` needs no change — once a finisher lane touches center,
  the color chain reaches `centerK`.
- Finished origin edges are convertible by other rim-connected colors
  (`CONSOLIDATE_TO_RING=0` satisfied) — takeover rules apply all the way to the end.

**Consequence for AI:** evaluator score-delta features come alive; re-baseline bot
behavior after this lands (separate AI work).

## Test plan
- Loose-end rotation: unit tests for `isRotatableNode` (tip vs mid-path vs branch);
  golden tests' rotate sections regenerate where mid-path rotations disappear.
- Scoring: starting-ring-connected chain scores without touching origin; finisher
  placement legality (rim-connected + contiguous only); game ends at
  `CONSOLIDATION_END` after finishers; converted finisher keeps end condition.
- Steal UX: manual (UI-only), plus existing action-card tests stay green.
