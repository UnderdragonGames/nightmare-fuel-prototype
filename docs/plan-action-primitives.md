# Plan: Action-Card Primitives

## Goal
Implement the core game actions required by action cards: draw/discard, turn control, reveals/drafts, and basic board mutations.

## Scope
- Engine-level functions and state hooks to support the action list in `docs/action-cards-plan.md`.
- No UI polish or balancing; focus on correctness and testability.

## Dependencies
- Existing game state and moves in `src/game/*`.
- Action card list in `docs/action-cards-plan.md`.

## Assumptions
- Action cards are a subset of `Card` with `isAction=true` and `text` present.
- Effects will be executed via new move(s) or helper functions, not via random construction.

## Steps
1. **Define action-effect primitives**
   - Add a `GameEffect` type (e.g. `drawCards`, `discardHand`, `grantExtraPlay`, `replaceHexWithDead`).
   - Decide where effect execution lives (e.g. `src/game/effects.ts`).

2. **Implement card flow effects**
   - `drawCards(playerId, n)`
   - `discardCard(playerId, handIndex)`
   - `discardHand(playerId)`
   - `revealTop(n)`
   - `draftInTurnOrder(revealed)`
   - `randomStealCard(from, to, n)`

3. **Implement turn-control effects**
   - `grantExtraPlay(n)` and/or `grantExtraPlacements(n)`
   - `markSkipNextTurn(playerId)`
   - `suppressDrawsUntil(condition)`

4. **Implement board mutation effects**
   - `replaceHexWithDead(coord)`
   - `replaceHexColor(coord, color)`
   - `moveHex(from, to)`

5. **Implement player-state effects**
   - `reorderPlayerPrefs(playerId, order)`
   - `setAgendaOverride(playerId, stat)`
   - `grantRevealUnusedVillains(playerId, duration)`

6. **Add trigger handling**
   - `registerTrigger(onMoveStatOfType)`
   - `registerTrigger(onSynergy)`

7. **Wire effects to moves**
   - Add a single `playActionCard` move that resolves effects.
   - Ensure state tracking for “face-up on draw pile” and “attached” cards.

8. **Testing**
   - Unit tests per effect with deterministic RNG.
   - Integration tests for 2–3 representative action cards.

## Deliverables
- `src/game/effects.ts` (or equivalent)
- Move wiring in `src/game/game.ts`
- Tests in `src/tests/*`

## Risks / Open Questions
- How to represent “face-up draw pile” and “attached to player” in state.
- Whether action cards can be played in the same turn as placements.
