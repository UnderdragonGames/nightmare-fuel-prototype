# Playtest log

Design changes with the subjective playtest reasons behind them, newest first.
Every gameplay-rule or balance change gets an entry (see CLAUDE.md). `[ux]`
marks UX changes born from playtest friction. **Outcome** is filled in after a
later playtest confirms or refutes the change.

---

## 2026-08-02 — v0.1.0 (PR #5)

### FORK_SUPPORT off by default
- **Change:** support-tree fork constraints disabled (`VITE_FORK_SUPPORT` knob added; default `0`).
- **Reason (Julian):** "it's a little too hard to fork. […] there's very little branching happening, which means that all the focus goes onto either rotating or blocking a single path, rather than building and keeping track of multiple paths, which is undesirable."
- **Design goal:** the game should be about building and tracking **multiple simultaneous paths**; evaluate future balance changes against that.
- **Outcome:** _pending next playtest — does branching actually happen more?_

### [ux] Origin finishing move hidden by color auto-pick
- **Change:** destination highlights now scan every card color, not just the auto-picked one.
- **Reason (Julian, reporting friend's game):** "It didn't let my friend consolidate to the middle spot" — engine allowed the move; the UI never highlighted it because the card's first color wasn't green.
- **Outcome:** fixed; regression test reconstructs the reported board.

### [ux] Rotation picker → click the spot to rotate toward
- **Change:** degree-labeled dial replaced with ghost previews at the target neighbor spots; dead 180° option removed.
- **Reason (Julian):** "degrees listed under each dot… it's a bad user experience, it should rotate towards the dot that you click… there should be no writing on it."

### [ux] Corner direction dots → arrows
- **Change:** the six corner color markers are arrows rotated along their travel direction.
- **Reason (Julian):** "the dots at the corners should be arrows, so it's clear they indicate directions."

### [ux] Placement spots color-coded
- **Change:** each potential placement highlight is tinted with the color the move would actually play there.
- **Reason (Julian):** "the 'potential spots' should be color coded correctly."

### Action cards enabled (one-per-turn)
- **Change:** `ACTION_CARDS` default flipped from `disabled` (env-gated legacy safety default) to `one-per-turn`.
- **Reason (Julian):** "Action cards aren't working (action limit reached even when none played)" — they were expected to be part of the game; the disabled default plus a misleading error made them look broken.
- **Outcome:** confirmed working in follow-up play.

### [ux] Hand zones stop snapping shut; mobile auto-close on select
- **Change:** board no longer force-collapses card zones on mouse-enter; mobile hand panel closes on card select with a selection dot on the tab.
- **Reason (Julian):** "the UX is a little bit confusing with how the hand controls disappear and reappear."

## Earlier (pre-log)

- **2026-07-11 playtest** (see `docs/spec-playtest-fixes.md`): rotation restricted to loose ends (mid-path rotation shredded connectivity), Steal card silent-failure UX, scoring reachability fixes.
