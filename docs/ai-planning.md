# AI Planning Document (v0)

### 1) Goals
1) **Rules-faithful bot behavior**: bot simulations match `HexStringsGame` move + turn semantics exactly.
2) **Efficient decision-making**: replace rollout-heavy bots with an evaluator-driven planner that operates on micro-steps within a turn.
3) **Maintainability**: single source of truth for action legality and state transitions; no duplicated move enumerators drifting over time.

### 2) Current state (baseline)
1) **UI bots** are implemented in `src/game/bots.ts` and invoked by `src/App.tsx`.
2) **Bot move set** today: `playCard`, `stashToTreasure`, and `endTurnAndRefill` only.
3) **Known mismatches / bugs**:
   1) **Simulated turn model is wrong**: `applyMoveToState()` in `src/game/bots.ts` applies an action and then *always* simulates end-turn + refill + next player.
   2) **Stash bonus mismatch**: real game `endTurnAndRefill` zeroes `stashBonus` and does not pay out bonus draws; bot simulator pays bonus draws.
   3) **Missing actions**: game supports `rotateTile` and `takeFromTreasure`; bots do not enumerate/simulate them.
   4) **“Random” isn’t random**: current implementation picks first legal placement by iteration order.
   5) **Duplicate enumerators**: `src/game/bots.ts` has `enumerateMoves`, and `src/game/game.ts` has `HexStringsGame.ai.enumerate`.

### 2.1) Action card plans to account for
1) **Action primitives + effects**: `docs/plan-action-primitives.md`
2) **CardAction schema + mapping**: `docs/plan-card-actions-schema.md`
3) **Action card list + required effects**: `docs/action-cards-plan.md`

### 3) Part 1 — Correctness fixes (make existing bot simulation match real rules)

#### 3.1 Decide + codify stash bonus rule (blocking question)
1) **Decision required**: should stashing grant:
   1) **Immediate draw only** (current `stashToTreasure` does immediate replacement draw), and **no end-turn bonus**, OR
   2) **Immediate draw + end-turn bonus draws**, OR
   3) **No immediate draw + end-turn bonus draws** (unlikely but list for completeness).
2) **Action**: update both:
   1) `src/game/game.ts` (real move + end-turn logic)
   2) `src/game/bots.ts` (simulator + stash heuristics)
3) **Acceptance**: game rules and bot simulator agree on stash consequences for hand size and deck consumption at every step.

#### 3.2 Refactor bot simulator into micro-step state transitions
1) **Split** `applyMoveToState()` into two phases:
   1) `applyMicroAction(state, action)`:
      - Applies one action (`playCard`, `stashToTreasure`, `rotateTile`, `takeFromTreasure`)
      - Does **not** change current player / turn counter
      - Applies forced effects of that action (discarding, rotations, treasure changes, immediate draw if rules say so)
   2) `applyEndTurn(state, playerID)`:
      - Applies end-turn-only effects (refill, stash-bonus payout if present, deck-exhaustion markers)
      - Advances player/turn
2) **Acceptance**: micro-action simulation can reproduce the same `G` mutations as the corresponding move in `HexStringsGame.turn.stages.active.moves`.

#### 3.3 Expand bot action set to match the real game
1) **Add** `rotateTile` and `takeFromTreasure` to:
   1) `enumerateMoves()` in `src/game/bots.ts` (or replace it with shared enumerator; see 3.5)
   2) simulator `applyMicroAction`
2) **Rotation legality** must match `game.ts`:
   - requires `rules.PLACEMENT.DISCARD_TO_ROTATE !== false`
   - rotation amount in {1,2,4,5} (excludes 3)
   - `match-color` requires discarded card shares a color with tile
3) **Acceptance**: bot never attempts illegal rotate/take moves; simulator rejects in same cases as game rules.

#### 3.4 Fix “Random” bot semantics
1) **Either**:
   1) Make it truly random over legal actions, OR
   2) Rename it to `FirstFit` and keep deterministic behavior.
2) **Acceptance**: behavior matches name; no hidden determinism.

#### 3.5 Eliminate enumerator duplication (pick one source of truth)
1) **Option A**: make `HexStringsGame.ai.enumerate` the canonical enumerator and reuse it in UI bots.
2) **Option B**: remove `HexStringsGame.ai.enumerate` and keep bot enumerator as canonical.
3) **Recommendation**: **A**, but only if we expand `ai.enumerate` to include rotate/take and keep it in lockstep with move logic.
4) **Acceptance**: one enumerator owns “what actions exist”; other code calls it.

#### 3.6 Instrumentation (no fallbacks; detect mismatches)
1) Add lightweight debug counters/logging (dev-only) for:
   - no-op moves attempted (state unchanged)
   - simulator rejected action that enumerator produced (should be impossible)
   - simulator vs real delta checks (optional snapshot compare in dev)
2) Acceptance: when issues occur, logs identify which rule path disagreed (stash, rotate legality, canPlace, etc.).

### 4) Part 2 — Evaluator-driven planner (micro-step ΔV policy)

#### 4.1 Architecture
1) Introduce a small AI module surface:
   1) `generateCandidates(state, pid): Action[]`
   2) `simulate(state, pid, action): state'` (calls Part 1 micro-step simulator)
   3) `evaluate(state, pid): number` (feature sum)
2) **Planner loop**:
   1) while in active stage and actions available:
      - enumerate small candidate set
      - compute ΔV for each action via simulate+evaluate
      - pick best ΔV action if ΔV > 0 (or > ε), apply
      - otherwise end turn

#### 4.2 Tight candidate generator (keep branching small)
1) **PlayCard candidates**:
   1) prioritize placements that immediately increase `computeScores(pid)` (or estimated scoring features)
   2) prioritize placements that increase future mobility (more legal placements next micro-step)
   3) prioritize placements that approach endpoints (rim/origin goals) with shortest-path heuristics
2) **Rotate candidates**:
   1) only consider tiles on/near contested routes or legality bottlenecks
   2) only consider rotations that strictly improve evaluator or unlock high-value placements
3) **Stash candidates**:
   1) model immediate draw option value vs giving others access to the stashed card
   2) account for treasure capacity (tempo / denial)
4) **TakeFromTreasure candidates**:
   1) only if it enables a high-value play/rotation sequence this turn.

#### 4.3 Evaluator (feature sum; mode-specific weights)
1) Must be fast, stable, and rule-robust; avoid relying on deep rollout.
2) **Hex mode (dirOnly)** candidate features:
   1) immediate score delta (or proxy) for pid (primary/secondary/tertiary weighted)
   2) “distance to completion” proxies under direction constraints
   3) mobility: count of legal placements next step (per objective color)
   4) limited opponent denial: only when it improves relative outcome (not “spite”)
3) **Path mode** candidate features:
   1) contact likelihood proxies: progress to rim/origin endpoints
   2) lane capacity / fork-support feasibility (reward supported backbones enabling branching)
   3) rotation value as rerouting that preserves legality and improves contact odds
4) **Calibration**: initial weights hand-tuned, then adjusted via self-play metrics.

#### 4.4 Volatility-triggered shallow lookahead (optional)
1) Only branch deeper when:
   - imminent scoring completions
   - contested rim/origin approaches
   - fork-support bottlenecks
   - rotation-based disruptions
2) Keep depth small (1–2 ply) and candidate set small to preserve speed.

### 5) Why this is more efficient than Monte Carlo (expected)
1) **Rollout approach** scales roughly with \( \#actions \times iterations \times playoutDepth \).
2) **Evaluator planner** scales roughly with \( \#candidates \times cost(simulate+evaluate) \), with \#candidates intentionally capped.
3) Tradeoff: evaluator needs thoughtful features/weights; but once stable it’s faster and less volatile than random playouts, and more robust to rules knobs.

### 6) Deliverables + acceptance criteria
1) **Part 1 complete when**:
   1) bot simulator and game rules match for micro-actions + end-turn
   2) bots can use rotate/take where legal
   3) stash rule is consistent across engine + AI
   4) only one enumerator exists (or one delegates to the other)
2) **Part 2 complete when**:
   1) evaluator-driven bot can play full turns via micro-step loop
   2) performance: decisions are bounded (e.g., < X ms per micro-step on typical boards)
   3) qualitative: bot uses rotate/stash/take intentionally (not never/always), and behavior changes predictably when rules knobs change

### 7) Action cards in AI planning (new)
1) **Move enumeration**:
   1) include `playActionCard` when legal
   2) respect `rules.ACTION_CARDS` (`'one-per-turn'` vs `'unlimited'`)
2) **Simulation**:
   1) resolve `CardAction[]` → `GameEffect[]` (or direct effect application) deterministically
   2) support choices/targets by generating bounded candidate selections
3) **Evaluation**:
   1) include immediate hand/board deltas (draws, discards, hex mutations)
   2) add value for turn-control effects (extra plays/placements, skip turns)
4) **Safety / gating**:
   1) avoid branching explosion by limiting action-card candidates per micro-step
   2) prioritize actions with direct board impact or clear tempo gain
5) **Acceptance**:
   1) planner can play action cards without desyncing game rules
   2) action cards are chosen in obvious high-value cases

### 8) Open questions (need product answers)
1) **Stash bonus**: is there an end-turn bonus draw mechanic or not?
2) **Rotate in path mode**: allowed? If yes, what does rotation mean for path-mode lanes (currently rotation exists on tiles; path constraints use it via `canPlace` directional rule).
3) **Treasure economy**: should `takeFromTreasure` be common/rare? Any costs/limits intended?
4) **Overwrite / two-to-rotate**: are these enabled in the “new rules” target? If yes, AI must generate/simulate discard bundles (multi-card costs).

