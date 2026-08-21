# Playtest log

Design changes with the subjective playtest reasons behind them, newest first.
Every gameplay-rule or balance change gets an entry (see CLAUDE.md). `[ux]`
marks UX changes born from playtest friction. **Outcome** is filled in after a
later playtest confirms or refutes the change.

---

## 2026-08-06 — v0.6.0

### [ux] Mobile install banner (PWA)
- **Feedback (Julian):** "I'd like to add a banner for mobile to install the PWA if it's not already installed. So it should detect it, show the banner if it's not in a PWA, dismissable of course, and when pressed to show instructions."
- **Change:** on mobile browsers that are NOT already running as an installed app (display-mode / iOS `navigator.standalone` detection), a dismissible banner sits in the quiet band between board and controls: "Add to Home Screen for the full game — and turn alerts." Tapping it triggers the real Chromium install prompt when available (`beforeinstallprompt`), otherwise platform-matched instructions (iOS: Share → Add to Home Screen; Android: menu → Install app). Dismissal is remembered per device; the banner also disappears live if the app gets installed.

## 2026-08-06 — v0.6.0

### [ux] Tap treasure/discard cards to view them full-size
- **Feedback (Julian):** "You should be able to tap on an action card in the treasure or discard and view it."
- **Change:** tapping any card in the treasure zone or the discard browser (desktop and mobile) opens a full-size inspector — name, action text, color pips. Treasure taps no longer take the card instantly: the inspector carries an explicit "Take to hand" button (disabled off-turn, with the reason shown), so viewing can't accidentally consume a treasure; the small Take button on the card remains as the quick path. Esc/backdrop closes just the inspector.

### Multiple games per device ("My games")
- **Feedback (Julian):** asked what happens when a user opens a different game in the PWA; answer was ugly — joining game B silently freed the seat in game A, re-gating A behind its waiting room and stopping its bots. Approved the fix and the mobile treatment: "Use the globe icon and add a badge and bouncing?"
- **Change:** the device now holds a seat in every joined match. Joining or creating another game keeps existing seats; the network menu gets a **My Games** list (code, your seat, whose move / finished / waiting) with one-tap switching, and Create/Join stay available while connected. The globe icon shows a **badge counting games waiting on you** (active game excluded) and does a **one-shot bounce when the count rises** — deliberately not a continuous bounce (noise, battery, and `prefers-reduced-motion` all argue against it). Turn-alert notifications now carry the match code, so tapping one switches the app to that game. Legacy single-session storage migrates automatically.
- **Also fixed on the way:** the waiting-room overlay used to cover the toolbar, locking you out of the network menu while a match waited for players; custom server endpoints (status/cancel/push/feedback) were missing CORS headers (invisible in same-origin production, broken in dev).

### [ux] Mobile install banner (Add to Home Screen)
- **Feedback (Julian):** "I'd like to add a banner for mobile to install the PWA if it's not already installed… dismissable of course, and when pressed to show instructions."
- **Change:** on mobile browsers (not the installed app), a slim dismissable banner offers "Add to Home Screen for the full game — and turn alerts." Tapping it fires Chromium's native install prompt when available; otherwise (notably iOS Safari) it opens platform-matched step-by-step instructions. Dismissal is remembered per device; the banner also hides itself live if the user installs.

## 2026-08-06 — v0.5.0

### In-game playtest feedback (post-game form + database)
- **Feedback (Julian):** "I'd like to build feedback into the game. So a db table, it should take note of the game ruleset, and should ask useful questions." Question design refined together: qualitative categories instead of numeric scales ("they will tend to lie to protect feelings"), engagement-posture and primary-feeling word grids, plus Schell's Wand and Doing questions.
- **Change:** the game-over screen now carries a short feedback form — four taps (posture: zoning out/casual/invested/scheming; feeling: 10-word mixed-valence grid, pick up to 2; length feel; play again right away?) with optional free text behind "Add details" (why, painful moment, delightful moment, magic wand, what-were-you-doing). Every submission stores the full rules snapshot, app version, questions version, match/seat/name, scores, turn count, and wall-clock duration — Postgres table `playtest_feedback` in production, JSONL locally. Offline submissions queue in the browser and retry on next load. Read back with `GET /feedback/export?key=$FEEDBACK_EXPORT_KEY` (set the env var on Railway to enable).
- **Design rationale:** grounded in Schell Games' FFWWDD and Microsoft's Product Reaction Cards (mixed-valence word choice avoids the politeness bias of numeric scales); one submission per finished game per device.

### Local bots could never make the opening move
- **Diagnosis (found while testing the form):** local bot clients only acted on state *changes* — when a bot was the game's opening player nothing ever changed, so the game deadlocked before the first move. Randomized starting order (v0.3.0) turned this from "never happens" (P0 was always human and always started) into a coin flip in every local game with bots.
- **Change:** bots get an immediate kick plus a periodic nudge, so a bot that should act always notices — including after React StrictMode's dev-mode double-mount.

## 2026-08-02 — v0.4.0

### [ux] Board colors no longer muted
- **Feedback (Julian):** "The colors on the board are muted, they should match the cards. Know why that is?"
- **Diagnosis:** the palettes were identical — but the whole board dropped to 50% opacity + 50% saturation whenever no card was selected (a "board not clickable" cue), which is most of the time. Lanes and arrows were literally desaturated versions of the card colors.
- **Change:** the dim is gone; the board always renders at full color (it *is* the game state). Clickability is signaled by highlights and cursor instead.

### [ux] Turn-alert push notifications (installable PWA)
- **Feedback (Julian):** "I think we can do push notifications, right?"
- **Change:** the app is now an installable PWA (manifest + icons + service worker), and a "Notify me on my turn" toggle in the network menu subscribes the device to web push for its match: it's-your-turn, Mystery Box your-pick, and place-your-drafted-card alerts, sent by the game server on its existing 3-second match scan. iOS requirement (Apple's rule): push only reaches apps **added to the Home Screen** (iOS 16.4+) — the toggle explains this when tapped in plain Safari. Subscriptions live in server memory and self-re-register on app load, so deploys self-heal; set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` on Railway (the server logs a generated pair on first boot) to keep subscriptions valid across restarts.
- **Known v1 edge:** alerts also fire on the device you're actively playing on (no presence detection yet) — the notification replaces rather than stacks, so it's mild; revisit if it annoys.

## 2026-08-02 — v0.3.0

### Randomized starting order
- **Feedback (Julian):** "Let's randomize starting order."
- **Change:** who goes first is now shuffled once per match (`RANDOM_START_ORDER`, default on; `VITE_RANDOM_START_ORDER=0` to pin, which tests and the UI smoke do). Turn order still proceeds clockwise from the shuffled first player. Existing matches keep their order (rules snapshot).
- **Reason (Julian):** "just fairness principle. Especially if I'm the one always starting the game, it feels weird to always go first just for that reason."

### Mystery Box becomes a real interactive draft
- **Feedback (Julian):** "Mystery box doesn't really work as intended." Design answers: full interactive draft; a drafted lane card "must place immediately."
- **Diagnosis:** the old flow had the playing player blind-type a numeric pick for every player *before* the cards were revealed; nobody ever saw the cards, and drafted lane cards just went to hand.
- **Change:** cards are revealed face-up to everyone; each player in play order (starting with the player of the card) picks on their own screen — the game hands stage control to each picker in sequence, even mid-turn. A picked action card still auto-plays ("immediately plays it"; ones needing input stay in hand). A picked lane card must now be placed immediately — the picker gets the same source→destination ghost-preview targeting as normal placement, and only if no legal placement exists anywhere does it fall into their hand. Bots pick and place for themselves; bots don't initiate Mystery Box (v1). Neither draft step is undoable (picks reveal information).
- **Outcome:** _pending first live multiplayer draft — watch for stalls if a player disconnects mid-pick._

## 2026-08-02 — v0.2.0 (PR #6)

### Re-examine Priorities: only your own colors, reordered
- **Feedback (Julian):** "Re-examine Priorities should raise an error if the person's own colors aren't included."
- **Change:** the reorder is now validated as a permutation of the player's current three colors — swapping in a color you don't have (or duplicating one) is rejected at three layers: the modal dropdowns only offer your own colors, an invalid combination shows an error before Play, and the engine refuses the move (card stays in hand) and the effect itself.

### [ux] Placement previews on the board point where the colors go
- **Feedback (Julian):** "When placing a card, the path direction should line up with the colors that they will become. […] I didn't mean on the card art, I meant when you place it on the board."
- **Change:** after picking a source dot, each valid destination now shows a dashed ghost lane from the source in the color that lane would become (the preview layer existed but was gated on a color selection that path mode never sets — only dotted rings ever showed). The card-art change (segments drawn in each color's true board direction) shipped alongside and stays.

### [ux] Use Ability button no longer vanishes off-turn
- **Feedback (Julian, screenshot):** "What happened to the use ability button? I used it once, now I don't see it."
- **Diagnosis:** the button only rendered on your own turn — after using an ability and ending the turn it disappeared, reading as "the ability is gone" even with uses left.
- **Change:** it stays visible whenever uses remain, disabled off-turn, and the uses line reads "Uses left: 1 — usable on your turn."

### [ux] Mobile: board pick completes the action card (no modal round-trip)
- **Feedback (Julian):** "on mobile we don't need an overlay when choosing a spot to place."
- **Change:** on mobile, when a board pick supplies the last thing an action card needs (Prey's lane, Seize's free-lane start), the card plays right there — the full-screen card overlay no longer reopens just to press Play. It still returns if more input is needed or the target is invalid. Desktop keeps the explicit confirm.
- **Outcome:** _pending — confirm this was the overlay that felt unnecessary._

### "This Prey is Mine" and "Seize the Opportunity" fixed (were silent no-ops)
- **Feedback (Julian):** "This Prey is Mine doesn't seem to have an effect. Seize the Opportunity also doesn't work."
- **Diagnosis:** Prey's lane recolor only matched a lane picked in the exact direction it was stored — picking the two ends in the other order silently did nothing and still consumed the card. Seize granted an "extra placement" counter that nothing in path mode ever consumes (placements are card-limited, not count-limited), so it was a guaranteed no-op — the same trap as the Dragon/Werewolf ability before it.
- **Change:** Prey now matches the lane in either direction, and requires an actually different color. Seize now places a **free lane** (no card spent) of the last-placed color — pick the start, the end auto-fills from the color's direction. Mistargeted plays are rejected up front (card stays in hand) with a reason shown in the modal, mirroring how abilities validate. Bots skip both cards (they don't do board-targeting cards yet).
- **Outcome:** _pending — confirm both cards feel right in the next playtest._

### Orange separated from yellow
- **Feedback (Julian):** "The orange color needs to be a little more distinct from the yellow, they are too close in value and Hue."
- **Change:** orange lane/arrow color moved from `#ffbb33` (amber, hue 38°) to `#f97316` (true orange, hue 25°) — darker in value and further in hue from yellow's `#ffee55`.
- **Outcome:** _pending — check O vs Y readability on the board next playtest._
- **Follow-up feedback (Julian, 2026-08-02, playing a version predating the fix):** "Potentially use more distinct colors, such as black or white. This is not an instruction, just to be added to the feedback section because yellow and orange are confusingly similar."
- **Design note:** if the new orange still isn't distinct enough in play, the next lever is replacing one of the pair with something categorically different (white is viable on the dark board; black would need an outline treatment). No change made — awaiting a playtest on the new palette first.

### [ux] Mode strip docked into the desktop shelf; End Turn nudge
- **Feedback (Julian):** approved the guidance ("I like") to dock the Place/Rotate/Block strip into the shelf and nudge toward End Turn; also asked whether the labeled pills work on mobile ("that takes up a lot of horizontal room").
- **Change:** on desktop the Place/Rotate/Block strip now sits inside the hand shelf (one control surface instead of a floating box over the board); mobile keeps the floating strip. End Turn pulses gently when it's your turn and you have no playable card/placement left. Mobile widths verified: all three labeled pills fit at 390px; below 380px Undo/Stash collapse to icons while End Turn keeps its label.

### [ux] Big hands squeeze poker-style on the shelf
- **Feedback (Julian):** "keep in mind you could have 10 cards in your hand, not sure if you accounted for that."
- **Change:** it wasn't — 10 cards in a flat row would have pushed the shelf past the viewport edge. Once the hand outgrows its width budget, shelf cards now overlap like a held poker hand (hovering or selecting raises the card above its neighbors; the hover-zoom stays fully readable). Verified with a forced 10-card hand at 1280px (~43px of each card visible) and 1024px (~22px), both clear of the sidebar.

### [ux] Turn-end drama + your-turn bell
- **Feedback (Julian):** "we need a dramatic sound for whenever a turn has ended and a chime of some kind when it's your turn."
- **Change:** new timpani-style turn-end hit plays for everyone whenever any turn ends; the your-turn sound is now a proper two-strike bell chime (inharmonic partials, long decay) that rings a beat after the turn-end hit when the turn is yours.

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
