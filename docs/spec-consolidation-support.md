# Spec: Fix fork-support / consolidation interaction in path mode

## Problem

Path-mode movement validation (`canPlacePath` in `src/game/helpers.ts`) classifies "backward/consolidation flow" **geometrically** — a lane is "inward" if it points to a lower ring (`isInwardLane`). That heuristic leaks in both directions and causes the two observed bugs:

1. **Illegal doubling (manufactured support).** Any inward-pointing lane *from* a node counts as "+1 through-traffic support" at that node — including plain normal moves and dead-end stubs. Verified repro: single-width path to a ring-2 node → doubling an outgoing edge is correctly blocked → place a dead-end inward stub → the same doubling is now allowed.
2. **Illegal blocking.**
   - The NO_INTERSECT check counts **all** arrivals at a node (`countIncomingLanes`), including consolidation backtracks — contradicting its own doc comment (helpers.ts:148–150). After a consolidation lane arrives at a node, normal moves into that node from other sources are rejected: near a consolidating path, only consolidation moves survive.
   - Asymmetric counting: existing inward lanes are excluded from fork counts, but the *candidate* lane is always counted (helpers.ts:477). The same shape is legal built one way and illegal built the other — order-dependent rules.
3. **Same-ring blind spot.** Ring comparison can't classify same-ring lanes, so a same-ring consolidation recolor is forever counted as forward branching at its from-node, silently consuming fork capacity.

The action-enumeration tests (`src/tests/*.test.ts`) are golden snapshots of current behavior, so they lock these bugs in.

## Intended model (confirmed with Julian, 2026-07-09)

- **Support is a tree from the center outward.** A node's capacity for outgoing lanes comes from the lanes feeding it from the origin side. Lanes consume capacity at their source and provide support at their destination — regardless of which ring they point to. Local per-node accounting is sufficient (no global trace-to-origin).
- **Consolidation is a RECOLOR, not a placement.** A consolidation move converts one existing lane on an edge to the consolidating color — physically, swapping one path piece for another (this must stay readable as a physical board game; additive overlay lanes were rejected for that reason). The board's lane geometry never changes during consolidation: no width growth, no new arrivals, no new forks.
- **Takeover semantics are intended.** Converting a lane destroys the old color's continuity through that edge. A multi-width segment converts one lane per move, so doubled segments let both colors coexist — width is the resource that resists takeover.
- **Origins and starting-ring nodes are free sources.** Unlimited parallel stacking from them (up to `MAX_LANES_PER_PATH`) is intended. The stale "cap at 2 from origins" comment is wrong and should be deleted.

## Design

### 1. Consolidation = lane color mutation

`PathLane` is **unchanged** (`{ from, to, color }`) — no kind flag, no state migration. A consolidation move is:

```
consolidate(edge, fromColor → toColor): find one lane on the edge with color
fromColor and set its color to toColor. Direction (from/to) is untouched.
```

Legality gates (mostly the existing `isConsolidationMove` conditions, re-expressed for conversion):
- `CONSOLIDATION` enabled, path mode.
- `toColor` is rim-connected (`hasRimConnectedPath`) — unchanged.
- The edge has at least one lane whose color ≠ `toColor` (something to convert). If several distinct colors are present, the move specifies which one converts (physical: you pick the piece to swap; AI enumerates each option).
- Contiguity: for different-ring edges, the **outer** endpoint must be in `toColor`'s rim-connected component (consolidation marches inward from the rim; outward steps only fill gaps already flanked by the color). For same-ring edges, either endpoint in the component suffices. *(Same-ring case previously required a direction-based "backtrack" — direction is meaningless for conversion, so this is intentionally loosened; flag any surprising new moves during test regen.)*
- `CONSOLIDATE_TO_RING`: unchanged — edges touching an origin are convertible only when the rule allows reaching that ring.
- **Deleted:** `CONSOLIDATION_EXCEEDS_LANES_PER_PATH` (nothing is added, nothing to exceed), the "new color on existing edge" placement branch in `canPlacePath`, and all fork-support/NO_INTERSECT exemptions for consolidation — a conversion adds no geometry, so those checks simply don't apply to it.

### 2. Normal placements: clean tree accounting

Delete `isInwardLane` and every ring-based inward/outward special case. Since consolidation no longer adds lanes, **every lane on the board is a normal tree lane**, and the counting rules become uniform:

- `totalIn` at source = all incoming lanes. No through-traffic bonus of any kind.
- Outgoing directions/totals at source = all outgoing lanes; the candidate is always counted. Symmetric — no order dependence.
- NO_INTERSECT at dest: incoming-lane sources, as today (the polluting additive backtracks no longer exist).
- The "already branching two ways" pre-check (helpers.ts:403) applies to every normal move uniformly (ring condition dropped).
- Origin / starting-ring sources keep bypassing FORK_SUPPORT (free stacking). Delete the stale "cap at 2" comment.
- `MAX_LANES_PER_PATH` counts all lanes on the directed edge, as today.

**Unchanged:** `hasRimConnectedPath`, `buildRimConnectedNodesForColor`, `countRimToCenterPaths` (color connectivity is undirected and placement-agnostic), lane removal in `effects.ts`, hex-mode `canPlace`.

### 3. Same-color bridges (verified 2026-07-09)

When the consolidation front meets an edge that already carries `toColor`, there is nothing to convert and nothing needed: color connectivity is undirected, so touching one end of a same-color segment joins the whole segment to the rim-connected component, and consolidation resumes from its far end. Verified on current code: a B→G→B path needs exactly one consolidation step (the G edge) to complete a rim-to-center B path.

### 4. Move plumbing & invariants to audit

- `game.ts` `placePath` / `ai.ts` `applyMicroAction`: consolidation stops pushing a lane and instead mutates the chosen lane's color. Move args gain the convert-target when ambiguous.
- `enumerateActions` (ai.ts): enumerate conversions per distinct convertible color on each eligible edge.
- UI (App.tsx placement preview): consolidation targets are edges, not empty destinations — verify the existing "consolidation move" preview path renders conversion correctly.
- **Audit any code assuming `lane.color` ⇒ direction** (e.g., path rotation, direction inference): converted lanes have colors that no longer match their geometric direction. This is already true of today's additive recolors, but conversion makes it more common.

## Test plan

Golden snapshot tests will shift. Regenerate after review, diffing every added/removed action against the model above — each change must be explainable by a rule in this spec.

New targeted regression tests (`src/tests/support-model.test.ts`):
1. Dead-end inward stub does **not** enable doubling (the confirmed exploit).
2. Order independence: same final shape legal/illegal regardless of placement order.
3. Consolidation conversion: single-width segment is taken over (old color's continuity breaks); double-width segment retains one lane of the old color (both colors' paths coexist).
4. Conversion adds no support and consumes no fork capacity (board geometry unchanged → all node counts unchanged).
5. Same-color bridge: B→G→B path completes rim-to-center with exactly one conversion.
6. Contiguity: conversion is blocked when the edge doesn't touch the color's rim-connected component; outward gap-fill works when flanked.
7. Free stacking from origin and starting-ring nodes still works (×3).
8. Normal moves near a consolidated route are not blocked by it (the old NO_INTERSECT pollution).

## Out of scope

- Hex mode (`canPlace`) — untouched.
- Scoring changes; width-based scoring for consolidated paths (width now = support width only).
- Global flow-based support verification (explicitly rejected in favor of local per-node).
