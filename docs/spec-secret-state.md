# Secret State & Player Isolation Spec

## Problem

The game stores all state publicly in a flat `GState` object. Every client receives every player's hand, the full deck order, and all per-player data. This causes three concrete issues:

1. **Network play is insecure.** Any player can inspect browser devtools and see opponents' hands and deck order.
2. **Local bot play leaks hands.** The `viewer` (and thus `playerID`) must switch to the bot for boardgame.io move authorization, causing the UI to briefly render from the bot's perspective. The current `humanSeat` workaround is fragile.
3. **No real enforcement.** Without `multiplayer: Local()`, the single Client embeds the game master directly. `playerView` filtering is cosmetic — the full unfiltered state lives in the Redux store.

---

## Goal

Adopt boardgame.io's multiplayer architecture with a custom `playerView`:

- Each client only receives state it's allowed to see
- Deck order is never sent to any client
- Bot moves execute from their own Client instances — no viewer-switching
- Filtering is rules-driven: variant flags control what's public vs secret

---

## Architecture Change: `multiplayer: Local()`

The single biggest change is switching from the default (no `multiplayer`) to `multiplayer: Local()`.

| | Current (no multiplayer) | Target (`Local()`) |
|---|---|---|
| Game master | None — Client IS the authority | `LocalMaster` in-browser, shared across clients |
| `playerView` | Cosmetic — `getState()` filters on read, full state in Redux store | **Authoritative** — master sends each client only their filtered state |
| Multiple players | Single Client, auto-assumes `currentPlayer` | Multiple `Client` instances, each with own `playerID` |
| Move execution | All moves execute immediately in client's reducer | Client sends to master, master validates + executes, returns filtered result |
| Bot play | Viewer-switch hack to reuse single Client | Each bot gets its own Client — moves are authorized naturally |

Clients sharing the same game config automatically share the same `LocalMaster` (boardgame.io maintains a global registry keyed by game object reference). Creating a bot client is just:

```typescript
const botClient = Client({ game: HexStringsGame, numPlayers, multiplayer: Local() });
// Automatically connects to the same LocalMaster as the human's client
```

---

## State Shape

### Current

```
GState {
  // Shared
  board, lanes, deck, discard, treasure, stats, meta, origins, action, rules, radius

  // Per-player (all visible to all clients)
  hands:          Record<PlayerID, Card[]>
  prefs:          Record<PlayerID, PlayerPrefs>
  nightmares:     Record<PlayerID, NightmareId>
  nightmareState: Record<PlayerID, NightmareState>
  meta.stashBonus:           Record<PlayerID, number>
  meta.actionPlaysThisTurn:  Record<PlayerID, number>
}
```

### Target

All per-player data consolidated into `G.players`. Deck moved to `G.secret`. The `playerView` function controls what each client sees.

```
GState {
  // Shared (visible to all) — unchanged
  board, lanes, discard, treasure, stats, origins, action, rules, radius

  // Server-only (stripped from all clients)
  secret: {
    deck: Card[]
  }

  // Per-player (filtered by playerView — see below)
  players: Record<PlayerID, {
    hand:                Card[]
    prefs:               PlayerPrefs
    nightmare:           NightmareId
    nightmareState:      NightmareState
    stashBonus:          number
    actionPlaysThisTurn: number
  }>

  // Shared meta (no per-player records)
  meta: {
    deckExhaustionCycle: number | null
  }
}
```

No `publicPlayers` — the `playerView` function handles selective exposure from `G.players`.

---

## Custom `playerView`

Instead of `PlayerView.STRIP_SECRETS` (which is all-or-nothing on `G.players`), a custom function gives rules-driven per-field control:

```typescript
playerView: ({ G, ctx, playerID }) => ({
  ...G,
  secret: undefined,
  deckSize: G.secret.deck.length,            // computed on the fly, not stored
  players: Object.fromEntries(
    Object.entries(G.players).map(([pid, state]) => [
      pid,
      pid === playerID
        ? state                              // own state: full visibility
        : filterOpponentState(G.rules, state) // opponent: rules-driven filtering
    ])
  ),
}),
```

The `filterOpponentState` function:

```typescript
function filterOpponentState(rules: Rules, state: PlayerState): Partial<PlayerState> {
  const visible: Partial<PlayerState> = {
    handSize: state.hand.length,           // always public (countable at a table)
  };

  if (!rules.HIDDEN_IDENTITY) {
    visible.prefs = state.prefs;           // public when identity is open
    visible.nightmare = state.nightmare;
    visible.nightmareState = state.nightmareState;
  }

  return visible;
}
```

This means:
- **Own state**: always fully visible
- **Opponent hand contents**: always hidden (replaced with `handSize`)
- **Opponent identity/prefs**: visible by default, hidden when `rules.HIDDEN_IDENTITY` is set
- **Deck order**: always hidden (`G.secret` stripped)
- **Deck count**: always visible (`deckSize` computed by playerView from `G.secret.deck.length`)

---

## Implementation Plan

One continuous change, three logical steps executed together.

### Step 1: Restructure GState

Move per-player fields into `G.players[pid].*` and deck into `G.secret.deck`.

| File | What changes |
|------|-------------|
| `src/game/types.ts` | New `PlayerState` type with `hand`, `prefs`, `nightmare`, `nightmareState`, `stashBonus`, `actionPlaysThisTurn`. New `SecretState` type. `GState` gets `players`, `secret`. Old fields removed. Add `handSize` as optional field (present on filtered opponent state). |
| `src/game/game.ts` | `setup()` populates new shape. All moves read/write `G.players[pid].*` and `G.secret.deck`. Add `playerView` function to game config. |
| `src/game/effects.ts` | All effect functions updated to new paths. `drawCards` reads `G.secret.deck`. `discardCard` reads `G.players[pid].hand`. |
| `src/game/ai.ts` | Access paths updated. AI receives filtered state (same as the bot's client) — it can see its own hand but not opponents'. Remove opponent-hand-peeking from evaluation heuristics (rivalry scoring, hand quality comparison). AI should infer opponent intent from observable board state (lane colors, build directions) instead. |
| `src/game/scoring.ts` | Reads `G.players[pid].prefs` instead of `G.prefs[pid]`. |
| `src/game/hooks.ts` | Updated to new field paths. |
| `src/game/helpers.ts` | Add `filterOpponentState` function (or co-locate with `playerView` in game.ts). |
| All test files | Update GState construction. Write a `buildPlayerState()` helper to reduce boilerplate. |

### Step 2: Switch to `multiplayer: Local()`

| File | What changes |
|------|-------------|
| `src/App.tsx` | `Client()` call gets `multiplayer: Local()`. Import `Local` from `boardgame.io/multiplayer`. |
| `src/App.tsx` | Create hidden `Client` instances for each bot player. Store in a ref, keyed by playerID. Clean up on unmount. |
| `src/App.tsx` | Bot auto-play effect uses bot client's `moves` object directly instead of viewer-switching. Remove `onSetViewer(owner)` from bot effect. |
| `src/App.tsx` | `playerID` prop is always the human's seat — never changes. Remove `humanSeat` workaround. `myHand` reads `G.players[playerID].hand`. |
| `src/App.tsx` | Deck count reads `G.deckSize` (computed by playerView — `G.secret` is stripped). |
| `src/App.tsx` | Opponent hand sizes from `G.players[pid].handSize` (computed by playerView). |
| `src/App.tsx` | Remove the auto-viewer-switch effects (both bot and human turn). Keep hot-seat switch only for all-human games. |

### Step 3: Verify and clean up

- Run full test suite (162 tests)
- Play a local game with 1 human + 2 bots — verify hand stays stable, bots play correctly
- Inspect state in React devtools — verify opponents' hands are not visible
- Verify deck order is not in client state
- Remove dead code: `humanSeat`, viewer-switching logic for bots

---

## Files Changed

| File | Scope |
|------|-------|
| `src/game/types.ts` | `PlayerState`, `SecretState` types; `GState` restructured |
| `src/game/game.ts` | setup, moves, `playerView` |
| `src/game/effects.ts` | All draw/discard/hand functions |
| `src/game/ai.ts` | State access paths |
| `src/game/scoring.ts` | Prefs access path |
| `src/game/hooks.ts` | State access paths |
| `src/game/helpers.ts` | `filterOpponentState` |
| `src/App.tsx` | `Local()` multiplayer, bot clients, remove viewer hack |
| `src/ui/Board.tsx` | No change (no per-player state access) |
| `src/ui/Hand.tsx` | No change (receives cards as prop) |
| `src/ui/ActionModeStrip.tsx` | No change |
| Test files | GState construction updated |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| `Local()` changes state flow timing (async vs sync) | Moves that currently execute synchronously will now round-trip through master. UI may need to handle brief optimistic states. Test interactive flows (place, rotate, block) for responsiveness. |
| Bot client lifecycle | Store in ref, create on mount, tear down on unmount. Recreate when numPlayers changes. |
| Test files construct raw GState without `Local()` | Tests bypass the client — they call game functions directly with full state. No change needed for test execution model, only for state shape. |
| AI plays weaker without opponent hand info | Expected and correct. AI should infer opponent intent from board state. Can be improved later with heuristics based on lane placement patterns. |
| Hot-seat (multi-human local) | Deferred. Not needed for prototype. When added: turn-handoff overlay + per-human Client instances. |

---

## Out of Scope

- Network lobby / matchmaking (already separate)
- Spectator mode (`playerID: null` works with custom `playerView` — spectators get opponent-level filtering for all players)
- Hot-seat multi-human (deferred — prototype is 1 human + bots)
- `SocketIO` transport (identical `playerView` behavior — swap `Local()` for `SocketIO()` when needed)
