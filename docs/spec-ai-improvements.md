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

## Direction (per Julian, 2026-07-12)

- **Emergent over hand-programmed**: don't encode "should I feed a rival"
  as weights; let it fall out of simulating consequences. → bounded search.
- **Action cards are the main gap**: bots must learn to PLAY them, not park
  them in treasure.
- **Think time: whatever it takes** (quality over speed) — but bounded; the
  measured 8-minute pathological decision is a bug, not a budget.

## Plan, in priority order

### P0. Finish action card implementation — DONE (merged to main 2026-07-12)
Audit of all 25 action cards found 3 hard-broken and 2 silently dead:
- **Culled** (mechanics don't exist digitally; definitions kept, excluded from
  deck via `DIGITALLY_EXCLUDED_CARD_IDS`): 48 Ingenuity, 65 New Agenda (stat
  system), 86 Restrict, 90 Seal Power (stat/synergy triggers).
- **Mystery Box (63) finished**: drafted action cards auto-play at APPLY time
  (new `autoPlayDrafted` effect); input-requiring drafts stay in hand.
- All 21 remaining in-deck action cards verified to resolve and apply; hook
  cards (Sabotage skip-turn, Barren Wasteland draw-block) confirmed wired via
  onTurnStart/onDraw events.


### P1. Bots play action cards
`enumerateActions` / `applyMicroAction` don't know `playActionCard` at all —
bots hold or stash every action card forever (the -Infinity bug made this
worse, but the capability gap is the real issue; ai-planning.md §7 was never
built). Work:
- Enumerate `playActionCard` with bounded context candidates: for cards needing
  a target player, enumerate opponents; choices, each option; coords, a small
  scored subset (own/rival hotspots). Cap total action-card candidates per
  micro-step.
- Simulate via the same effect resolution the move uses (`resolveCardEffects`
  + `playActionCardFromHand`) so sim matches game exactly.
- Evaluate with existing features (score/hand/tempo deltas capture most
  effects); special-case turn-control effects (extra plays) as tempo value.
- Treasure policy follows automatically: stash only genuinely dead cards
  (action cards are no longer dead).

### P2. Emergent strategy via bounded search
Replace the greedy threshold loop with a small search so choices like
"complete a shared chain that feeds a rival" emerge from consequences:
- **Own-turn planning**: search micro-action *sequences* within the turn
  (beam over top-N candidates, depth = plays remaining), not one action at a
  time. Fixes combo blindness (support lane → double; convert → finisher).
- **Opponent reply sampling**: after our turn, simulate each opponent's best
  greedy reply (1 ply). Shared-scoring caution then comes from seeing the
  rival's actual follow-up, not from scoreGapDelta weights — soften those
  weights (they currently reject scoring moves at −14.8 avg).
- **Budget, not threshold**: hard cap per decision (default ~3s, configurable);
  beam width shrinks under pressure. Kill the 504s outlier class and the
  unusable EvaluatorPlus volatility recursion (superseded by this).

### P2 RESULTS (2026-07-12): ACCEPTED
Search vs greedy Evaluator, 6 games: **4W/1L/1D (67%)**. Four games ended via
CONSOLIDATION (rim-to-center completion) — the first win-condition endings ever
measured; previously 100% deck exhaustion. 1.8 actions/turn, 51 conversions,
avg game 60 turns (was ~100). Latency avg 1.5s; one 29s outlier — the budget
check is too coarse (no check inside candidate loops); fix in P5.

### P3. Candidate integrity
Always include the top-K actions by actual immediate score delta (24/57 of
missed scoring moves never reached evaluation via the color/rim heuristic).
Cheap: one `computeScoresRaw` pass per enumerated playCard, already done by
the harness.

### P4. Win-condition awareness in the leaf evaluator
- `finisherProgress` per rim-connected color: remaining edges to origin,
  finisher availability now; value own progress, penalize rivals' near-complete
  colors (enables emergent blocking via search).
- Value conversions extending own components toward center; takeovers that
  break rival completions.

### P5. Performance in service of depth
Same eval-cost work as before, now motivated by search depth per budget:
localized mobility deltas (radius-2 neighborhood instead of full-board sweeps),
cached per-color components / origin-connected sets per node expansion.

### P6. Harness as regression gate
`scripts/ai-diagnostics.ts` stays in-repo. Acceptance for this work:
- New bot beats current (post--Infinity-fix) Evaluator ≥60% over 12+ games.
- Bots play action cards in obviously-good spots (measured: >0 per game,
  and hand contains no permanently-parked action cards).
- Median decision ≤3s, p99 ≤10s.
- Actions/turn in the 1.5–3 range; missed-scoring decisions <5%.

## Non-goals (v1)
- Difficulty levels (comes later via budget/noise knobs).
- Self-play weight learning (revisit if hand-set leaf weights + search
  underperform; the harness makes it possible later).
