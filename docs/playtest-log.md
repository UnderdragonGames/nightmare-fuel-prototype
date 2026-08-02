# Playtest log

Design changes with the subjective playtest reasons behind them, newest first.
Every gameplay-rule or balance change gets an entry (see CLAUDE.md). `[ux]`
marks UX changes born from playtest friction. **Outcome** is filled in after a
later playtest confirms or refutes the change.

---

## 2026-08-02 — v0.2.0 (PR #6)

### [ux] Labeled toolbar + keyboard shortcuts; opponent-move sounds fixed
- **Feedback (Julian):** "we need more clarity on the undo and stash buttons"; "it doesn't seem to make sound effects when other players move."
- **Change:** all three toolbar buttons are labeled pills (Undo / Stash / End Turn) with tooltips that explain the action — and when disabled, why ("Select a card first, then stash it to Treasure…"). Keyboard: U undoes, E ends turn, Esc cancels. Sound playback rewritten on Web Audio: iOS only allows an <audio> element started inside a user gesture, which silenced opponent-move sounds arriving over the socket; one AudioContext unlocked on first tap now covers everything.

### [ux] Consistent icon set; de-crowded controls
- **Feedback (Julian, iPhone screenshot):** "There's no reason to have these buttons so crowded. Also, we should use consistent icons, an icon font, probably."
- **Change:** all emoji/text glyph buttons replaced with a single inline SVG stroke icon set (`src/ui/Icon.tsx` — Feather-style; chosen over an icon font: no font asset, crisp, inherits button color). Toolbar spacing widened with bigger touch targets, End Turn is a proper labeled pill on mobile, the dev export gear is hidden on mobile (it overlapped the Hand tab), and the version badge moved clear of the toolbar. Version badge now also shows the real commit on Railway builds (env sha fallback).

## 2026-08-02 — v0.1.0 (PR #5)

### [ux] Desktop hand shelf redesign (shipped)
- **Feedback (Julian):** "As pretty as the hand animation is, the way it disappears is unintuitive. It should stay as a shelf at the bottom. Take design cues from well-established card games like poker and Dominion." Also: "selecting cards for action discards should present the cards in a different way that doesn't feel like going back to your hand"; "every state needs to be cancellable"; "action cards need to be readable without a click."
- **Change:** hover-fan corner hand replaced by a persistent bottom shelf (always visible, hover raises, click selects) with deck/discard piles and the docked toolbar; hover-zoom shows a full-size readable card without clicking; block/rotate costs use a distinct red discard tray with slots + Cancel; Escape unwinds every transient state one level per press.
- **Outcome:** _pending next desktop playtest._

### Nightmare abilities enabled (all 12)
- **Change:** abilities are now playable — `useNightmareAbility` move with per-nightmare targeting (node pick for Demon/Witch, lane pick for Ghost/Mutant, free-lane placement for Dragon/Werewolf, target player for Vampire, instant for the rest). Uses are limited per game and shown in the panel; invalid targets don't consume a use; abilities are not undoable. Bots don't use abilities yet.
- **Reason (Julian):** "Let's turn on the nightmare abilities."
- **Design note:** Dragon/Werewolf's mapped effect (`grantExtraPlacements`) was a no-op — placements are already unlimited per turn — so "add a branch/segment" is implemented as a lane placed **without spending a card**, all normal placement rules applying.
- **Outcome:** _pending next playtest — balance of 1-vs-2-use abilities untested._

### [ux] Sound effects
- **Change:** sound pack (place, rotate, block, action card, ability, your-turn, game start, game over, cancel, undo) with a mute toggle next to the network button. Sounds fire off state changes, so you hear your opponent's placements too.
- **Reason (Julian):** asked what sound effects would involve; approved building with a pack.
- **Note:** pack is synthesized in-repo (`scripts/generate-sounds.mjs` → `public/sounds/*.wav`) because kenney.nl isn't reachable from the dev environment; swap the WAVs (same filenames) to reskin with recorded samples.

### Design caution: turn loss feels very harsh
- **Feedback (Julian):** "losing a turn, felt very harsh, we should be very careful with that."
- **Current sources of turn loss:** Sabotage (#89) registers a skip-turn hook (a blocked turn start auto-ends the turn).
- **Action:** none yet — recorded as a design principle: prefer weakening or limiting effects (skip a placement, discard a card) over full turn denial when adding or tuning cards.
- **Outcome:** _pending decision on softening Sabotage._

### [ux] Undo for moves (not action cards)
- **Change:** per-turn undo made to actually work in network games (it was broken by the cancel feature's observing stage — boardgame.io only allows multiplayer undo with exactly one active player; cancel now routes through a server endpoint instead). Action cards and cancel are explicitly not undoable; the button enables only when something is undoable.
- **Reason (Julian):** "We also need an undo button, for moves made on your turn (maybe just moves, as actions are complicated to undo)."

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
