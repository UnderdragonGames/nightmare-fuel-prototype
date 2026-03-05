# Event Bus / Hook System

Unified, declarative system for cards that intercept future game events. Replaces the old hand-rolled `skipNextTurn`, `suppressedDraws`, and `triggers[]` fields on `ActionState`.

## Core Concepts

Hooks are **fully serializable** (no function references) — required by boardgame.io state sync. They live on `G.action.hooks: HookDef[]`.

A hook declares:
- **event**: which game event to listen for
- **behavior**: `block` (prevent the action), `modify` (alter it), or `observe` (react after)
- **filters**: `targetPlayerId`, `stat` — AND-combined to narrow matching
- **oneShot**: if true, removed after firing once
- **sideEffects**: declarative actions executed when the hook fires

## Types

```typescript
type GameEventType = 'onPlacement' | 'onStatMove' | 'onSynergyUse' | 'onDraw' | 'onTurnStart' | 'onTurnEnd';

type HookSideEffect =
  | { type: 'discardSourceCard'; sourceCardId: number }   // attached card → discard
  | { type: 'moveFaceUpToDiscard'; sourceCardId: number } // face-up pile → discard

type HookDef = {
  id: string;
  event: GameEventType;
  sourceCardId: number;
  behavior: 'block' | 'modify' | 'observe';
  oneShot: boolean;
  targetPlayerId?: PlayerID;
  stat?: Stat;
  sideEffects: HookSideEffect[];
};
```

## Hook Resolution (`src/game/hooks.ts`)

`emitEvent(G, event) → { blocked: boolean, firedHookIds: string[] }`

1. Find all hooks matching `event.type` + declarative filters
2. Sort: block → modify → observe
3. **Deduplicate by behavior type** — multiple 'block' hooks = one block; different behavior types all fire
4. Execute side effects for each fired hook
5. Remove one-shot hooks
6. Return whether action was blocked

Also exports: `registerHook(G, hook)`, `removeHooksBySource(G, sourceCardId)`

## Emit Points

| Event | File | Location | Effect |
|-------|------|----------|--------|
| `onTurnStart` | `game.ts` | `turn.onBegin` | If blocked → `endTurn()` (Sabotage) |
| `onPlacement` | `game.ts` | `playCard` move, after placement | Observe-only. Coord is `[source, dest]` in path mode, `[dest, dest]` in hex mode |
| `onPlacement` | `ai.ts` | `applyMicroAction`, after placement | Same as above, so AI simulator sees hooks |
| `onDraw` | `effects.ts` | `drawOne()` when playerId provided | If blocked → skip draw (Barren Wasteland) |
| `onTurnEnd` | `game.ts` | `endTurnAndRefill`, before `events.endTurn()` | Observe-only, for future cleanup hooks |
| `onStatMove` | TBD | When stat movement is implemented | Restrict (#86) hooks here |
| `onSynergyUse` | TBD | When synergy resolution is implemented | Seal Power (#90) hooks here |

## Card Implementations

### Sabotage (#89) — Skip Target's Next Turn
```
CardAction: [{ type: 'registerSkipTurnHook' }]
```
Registers:
- `attachCard` effect (card attached to target, expires `afterSkip`)
- `registerHook` with `{ event: 'onTurnStart', behavior: 'block', oneShot: true, targetPlayerId, sideEffects: [discardSourceCard] }`

When the target's turn starts, `onTurnStart` fires → blocked → `endTurn()` called → hook removed → attached card discarded.

### Barren Wasteland (#10) — Suppress All Draws
```
CardAction: [{ type: 'placeOnDrawPileTopFaceUp' }, { type: 'registerBlockDrawsHook' }]
```
Registers:
- `placeOnDrawPileTopFaceUp` effect (card goes face-up on draw pile)
- `registerHook` with `{ event: 'onDraw', behavior: 'block', oneShot: false, sideEffects: [moveFaceUpToDiscard] }`

Every `drawOne(G, playerId)` call checks `onDraw` → blocked → no card drawn. Before each draw check, `resolveDrawHooksIfReady()` checks if all hands are empty — if so, removes the hook and fires its side effects (moving the face-up card to discard).

### Restrict (#86) — Block a Stat Move
```
CardAction: [{ type: 'attachTokenToCard' }, { type: 'registerHook', hookEvent: 'onStatMove' }, { type: 'discardSelfOnTrigger' }]
```
Registers:
- `attachCard` effect (card attached with chosen stat token, expires `afterTrigger`)
- `registerHook` with `{ event: 'onStatMove', behavior: 'block', stat: chosenStat, oneShot: true, sideEffects: [discardSourceCard] }`

Fires when `onStatMove` emit point is added (not yet implemented).

### Seal Power (#90) — Block a Synergy
```
CardAction: [{ type: 'attachToPlayer' }, { type: 'registerHook', hookEvent: 'onSynergyUse' }, { type: 'reduceSynergyOnce' }]
```
Registers:
- `attachCard` effect (card attached to target player, expires `manual`)
- `registerHook` with `{ event: 'onSynergyUse', behavior: 'block', targetPlayerId, oneShot: true, sideEffects: [discardSourceCard] }`

Fires when `onSynergyUse` emit point is added (not yet implemented).

## Adding New Hooks

To add a new card that intercepts game events:

1. Define a `CardAction` type (or reuse `registerHook` with a new `hookEvent`)
2. In `resolveCardEffects`, produce a `{ type: 'registerHook', hook: HookDef }` effect
3. If the event emit point doesn't exist yet, add `emitEvent(G, { type: '...', ... })` at the appropriate location
4. Add tests in `src/tests/hooks.test.ts`

## Files

- `src/game/types.ts` — `GameEvent`, `HookDef`, `HookSideEffect` types; `hooks` field on `ActionState`
- `src/game/hooks.ts` — `emitEvent`, `registerHook`, `removeHooksBySource`
- `src/game/effects.ts` — `drawOne` checks `onDraw` hooks; `resolveDrawHooksIfReady` handles Barren Wasteland condition
- `src/game/game.ts` — emits `onTurnStart`, `onPlacement`, `onTurnEnd`
- `src/game/ai.ts` — emits `onPlacement` in micro-action simulator
- `src/game/cardActions.ts` — card action resolution produces `registerHook` effects
- `src/tests/hooks.test.ts` — unit + integration tests
