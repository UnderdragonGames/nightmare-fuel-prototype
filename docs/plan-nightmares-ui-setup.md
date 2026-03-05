# Plan: Nightmares UI + Player Setup

## Goal
Expose `NIGHTMARES` in the UI and connect them to player setup/state.

## Scope
- UI selection / display of nightmares (name, evil plan, ability, priorities).
- Hook selected nightmare to `prefs` and any per‑nightmare state.

## Dependencies
- `src/game/nightmares.ts`
- Existing player setup flow in `src/game/game.ts` and UI components.

## Assumptions
- Preferences (primary/secondary/tertiary) remain the core scoring priorities.
- Ability execution will be handled by action primitives later.

## Steps
1. **Define nightmare selection model**
   - Add `nightmareId` or `nightmareName` per player in `GState`.
   - Decide default assignment (random or chosen).

2. **Update setup / game init**
   - On game start, assign nightmare and set `prefs` from priorities.
   - Ensure bots/AI can read the assigned nightmare.

3. **UI: selection and display**
   - Add a selection UI (dropdown/cards list).
   - Show current nightmare details: classes, ability name/effect, evil plan.

4. **State persistence**
   - Update any serialization / StateLab helpers to include nightmare.
   - Make sure rehydration keeps priorities consistent.

5. **Testing**
   - Unit test: selecting nightmare sets `prefs` correctly.
   - UI smoke test: renders nightmare details.

## Deliverables
- `src/game/types.ts` updates for nightmare selection
- UI components or updates in `src/ui/*`
- Tests validating preferences and selection

## Risks / Open Questions
- Whether nightmares should influence deck composition or hand size.
- How to handle ability uses and cooldowns in state.
