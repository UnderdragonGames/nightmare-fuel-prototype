# Plan: CardAction Schema + Mapping

## Goal
Add a structured action schema to cards and map the 25 action cards to typed effects.

## Scope
- Extend the card schema to support action metadata.
- Provide a mapping layer from `Card` to `CardAction[]`.

## Dependencies
- Action card list in `docs/action-cards-plan.md`.
- Core effect primitives from `docs/plan-action-primitives.md`.

## Assumptions
- Action cards are the cards with non-empty `text` in `src/game/cards.ts`.
- Cards can have multiple effects (e.g., “play another card” + “move card to hand”).

## Steps
1. **Define action types**
   - Create `CardAction` union types (e.g., `Draw`, `Discard`, `ReplaceHex`, `SkipTurn`).
   - Keep a narrow set; use params to specialize (e.g., `Draw { count, target }`).

2. **Extend Card schema**
   - Add `actions?: CardAction[]` to `Card` type.
   - Keep `text` for UX and compatibility.

3. **Create mapping file**
   - Add `src/game/cardActions.ts` mapping `card.id -> CardAction[]`.
   - Include helpers for common patterns (e.g., `drawEach(1)`).

4. **Implement resolver**
   - Add `resolveCardActions(card: Card): CardAction[]`.
   - Prefer explicit mapping; fallback to `[]`.

5. **Integrate with play flow**
   - Modify `playActionCard` (or equivalent) to use `actions`.
   - Ensure effects are queued/resolved in deterministic order.

6. **Validation and tests**
   - Unit test that all action cards have action definitions.
   - Snapshot or lint rule to prevent missing mappings.

## Deliverables
- `src/game/cardActions.ts`
- `src/game/types.ts` updated `Card` type
- Tests verifying mapping completeness

## Risks / Open Questions
- Some actions need modal input (target player, coord, color).
- Decide whether `actions` live in `cards.ts` or a separate mapping file.
