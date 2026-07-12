# Spec: AI improvements (v1) — DRAFT

Goal: make bots play visibly intelligent path-mode games at interactive speed.
Grounded in measurements from `scripts/ai-diagnostics.ts` (headless bot-vs-bot
games with behavioral metrics), 2026-07-12, after the scoring-reachability fix.

## Measured baseline (4 games, Evaluator vs Random)

| Metric | Evaluator | Random |
|---|---|---|
| Actions per turn | 0.4 | 1.7 |
| Result | 1W / 1L / 2D | — |
| Decisions leaving points on the table | **17%** (42 turn-ends with a scoring move available, avg +4.1 missed) | 5% |
| Decision latency | avg 1.8s, max 7.2s | ~1ms |
| Conversions played | 5 | 0 |

EvaluatorPlus (volatility lookahead): avg 170s/decision, max 2.4 **hours** —
unusable; gated out of the harness (`--plus`).

## Re-baseline after the -Infinity fix (4 games)

| Metric | before fix | after fix |
|---|---|---|
| Actions per turn | 0.4 | **1.2** |
| Result vs Random | 1W/1L/2D | **2W/0L/2D** |
| Conversions | 5 | 20 |
| Avg missed scoring delta | 4.1 | 1.4 |
| Decision latency | avg 1.8s | avg 3.5s, **max 504s** (more live options = bigger sweeps) |

Remaining misses now split cleanly: 24/57 best-scoring moves never entered the
candidate set (starvation grows as the bot gets livelier — top-15 crowds out),
and 32/57 were evaluated but rejected with finite negative values (avg −14.8):
the shared-scoring penalties genuinely refuse moves that also feed opponents —
that's design question 1, not a bug. Stash count doubled (63): the bot dumps
unplayable action cards, reasonable until action-card play exists.

## Problems, in priority order

### P1. Missed scoring moves — ROOT CAUSE FOUND AND FIXED
Probe results (34 missed-scoring events): only 4 were missing from candidates;
30 were evaluated and rejected with value **-Infinity**.

`getCardValue` did `Math.max(...card.colors.map(...))` — action cards have
`colors: []`, and `Math.max()` of nothing is `-Infinity`. Via
`evaluateHandQuality` (hand average), **holding any action card poisoned every
evaluation to -Infinity**: the bot could only pass, and its one escape hatch
was stashing the action card (explaining the stash addiction; once treasure
filled, it passed forever). Fixed: colorless cards value 0. Re-baseline below.

**Remaining P1 work after the fix:**
- Candidate generation: always include the top-K actions by actual immediate
  score delta (the 4/34 starvation cases).
- Shared-scoring calibration (open question 1): penalize opponent gains only to
  the extent the opponent could not take the same points themselves next turn.

### P2. Passivity (0.4 actions/turn)
Hand refills to 3 at end of turn regardless, so unplayed cards are mostly free
tempo left unused. `DELTA_V_THRESHOLD = 0.1` treats "end turn" as a neutral
baseline; it should carry an opportunity cost when the hand contains playable
objective cards. Target: ~1.5–2.5 actions/turn without spamming junk moves.

### P3. Decision latency (1.8s avg; Plus unusable)
`countMobility` / `countObjectivePlacements` sweep every coord × 6 neighbors ×
hand colors through `canPlacePath` for EVERY candidate evaluation (~25×). Fixes:
- Localize mobility deltas: a placement only changes legality near its edge —
  recompute mobility in a radius-2 neighborhood instead of the whole board.
- Cache per-evaluation invariants (origin-connected set, per-color rim
  components) inside a scratch context instead of rebuilding per call.
- Budget the lookahead: cap opponent-reply candidates (currently unbounded),
  and only recurse on the top few own candidates. Target: <100ms/decision
  for Evaluator, <500ms for Plus.

### P4. Consolidation & finishing awareness
The evaluator has no feature for progress toward rim-to-center completion —
the literal win condition. Add:
- `finisherProgress`: per rim-connected color, how many converted/owned edges
  remain to reach the origin (and whether a finisher is available NOW).
- Value conversions that extend own-objective-color components toward center;
  value takeovers that break an opponent's near-complete color.
- `CONSOLIDATION_END` proximity should trigger the (fixed) lookahead, not the
  current volatility heuristic.

### P5. Harness as permanent rig
Keep `scripts/ai-diagnostics.ts` in-repo; extend with a fixed-seed mode when
RNG injection lands, and a win-rate regression gate (new evaluator must beat
the old one >60% over N games) so AI changes are measured, not vibes.

## Non-goals (v1)
- Action-card planning (bots currently don't play action cards; separate pass).
- MCTS/deep search; the evaluator-driven planner architecture stays.
- Difficulty levels (comes free later via thresholds/noise once the evaluator is strong).

## Open questions for Julian
1. Shared scoring intent: when a move gives you +4 and a rival +6, is playing it
   generally right (points now, race on) or wrong (never feed the leader)? This
   calibrates P1's rebalance.
2. Should bots stash/deny via treasure aggressively, or is treasure play meant
   to stay light?
3. Acceptable AI think time in the browser (currently ~2s and blocking)?
