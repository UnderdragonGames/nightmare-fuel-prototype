# Card Zones UI Spec

## Overview

Replace the current fixed-position hand and treasure UI with a **corner-anchored zone system**. Three zones (Hand, Treasure, Discard) live in screen corners, collapse when idle, and expand on hover (desktop) or tap (mobile). Cards are ~3x their current size when expanded. Animations powered by Framer Motion.

---

## Zones

| Zone     | Corner       | Contents                  | Interaction              |
|----------|-------------|---------------------------|--------------------------|
| Hand     | Bottom-right | Current player's hand     | Select card, pick color  |
| Treasure | Top-right    | Current player's treasure | Take card into hand      |
| Discard  | Top-left     | Shared discard pile       | View; action cards can target |

**Mutual exclusion:** Expanding one zone collapses any other open zone — unless an action card is forcing a zone open (see Action Card Triggering below).

---

## Card Sizing

| State      | Approximate Size | Notes                        |
|------------|-----------------|------------------------------|
| Collapsed  | ~70×95px        | Mini preview, tightly packed |
| Expanded   | ~270×360px      | Full interactive size (3x current 90×120) |

---

## Collapsed State

Cards are shown as **mini previews** arranged close together, overlapping slightly — like cards held in a physical hand.

### Mini card design
- **Regular (color) cards:** Show **color dots** in the top-left corner of each mini card. Each dot matches one of the card's colors. No SVG pathways at this size.
- **Action cards:** Show a small action icon or abbreviated name.
- **Selected card:** Visually highlighted (brighter border, slight lift) so the player can see their selection even when collapsed.

Only the current player's hand is shown in the Hand zone. Other players' hands are represented elsewhere (see Other Players section).

---

## Expanded State

Cards **fan out** from the corner with slight random rotation per card, as if physically placed on a table.

### Fan behavior
- Cards radiate outward from the zone's corner anchor point.
- Each card gets a small random rotation (0–3°, alternating positive/negative), seeded per card ID for consistency across re-renders. Subtle, not chaotic.
- Fan arc should feel natural, not rigidly spaced.
- A **gradient overlay** fades from the corner outward, grounding the cards against the background.

### Coverflow (overflow handling)
A **reusable coverflow component** used by all three zones when cards exceed available space:
- All cards remain visible (no clipping), but cards toward the edges are scaled down and angled away.
- Hovering/mouse position shifts the focal point, sliding the visible window. Similar to Apple's old Cover Flow.
- No scroll bars — purely mouse-position-driven.
- **Must scale to ~126 cards** (full discard pile). At high card counts, cards compress tightly with heavy overlap — only the focal card and its immediate neighbors are fully visible, the rest form a dense compressed stack on either side.
- Focal card is at full expanded size; neighbors scale down progressively.
- On mobile, swipe replaces mouse-position control.

---

## Hover Safe Zone (Desktop)

Use the **Amazon mega-menu triangle pattern** to prevent accidental close:

1. When user hovers collapsed zone → zone begins expanding.
2. While expanded, track a virtual triangle between:
   - The cursor's position when it left the collapsed area
   - The two nearest corners of the expanded card area
3. As long as the cursor stays inside this triangle OR inside the expanded area, the zone stays open.
4. Moving outside the triangle + expanded area → zone collapses (with a ~150ms grace period).

This prevents the common problem of diagonal mouse movement accidentally leaving the hover target.

---

## Selection & Collapse Interaction

- **Selecting a regular card** does NOT force the zone to stay expanded. The player can collapse the hand and the selection persists.
- When collapsed with a selected card, the mini preview of that card is highlighted.
- **Clicking the board** with a card+color selected works the same as today — placement proceeds, selection clears.
- **Selecting an action card** opens a dedicated modal (see Action Card Modal below).

---

## Action Card Modal

Selecting an action card opens a **full-screen modal** with overlay:

- **Overlay:** Semi-transparent dark backdrop covering the entire screen (clicking overlay cancels/deselects).
- **Layout:** The selected action card is displayed at full expanded size on the **left** of the modal. The action form (target player, choices, coordinates, etc.) is on the **right**.
- **The card is isolated** — no other hand cards visible. This focuses the player on the action being configured.
- **Buttons:** "Play Action" and "Cancel" at the bottom of the form. Cancel closes the modal and deselects the card.
- **Zone triggering:** If the action needs to reference another zone (e.g., "choose from discard"), that zone opens *on top of* the modal overlay, with interactive selection affordances. Completing the selection returns to the modal.
- **Mobile:** Card stacks above the form vertically instead of side-by-side.

---

## Other Players' Hands

Each player row in the left panel gets a **mini hand indicator**:
- Shows small card-back icons representing the number of cards in that player's hand.
- **Tapping/clicking** opens a **modal** showing the card backs at readable size.
- **Action cards that target other players** (steal, etc.) invoke this modal programmatically, with interactive affordances (e.g., "pick a card to steal").
- Each player's modal is unique to that player — multiple can't be open simultaneously.

---

## Animation

All transitions powered by **Framer Motion**.

### Collapse ↔ Expand
- Cards animate position, scale, and rotation between collapsed and expanded states.
- Use `layout` or `layoutId` for automatic FLIP-style transitions.
- Stagger: cards animate sequentially with ~30ms delay between each, starting from the anchor corner.
- Duration: ~300ms with spring physics (`type: "spring", stiffness: 300, damping: 25`).

### Card enter/exit
- New cards drawn into hand: animate in from the deck position (off-screen or board center) to their hand position.
- Cards played: animate from hand to the board coordinate where placed, then fade.
- Cards discarded: animate from current position toward discard zone corner.

### Zone open/close
- Gradient overlay fades in/out over ~200ms.
- Background dim (subtle) on the rest of the screen when a zone is expanded, to draw focus.

---

## Mobile

No hover on touch devices. Replace with a **tab menu**:

### Tab bar
- Fixed bottom bar with three buttons: **Hand**, **Treasure**, **Discard**.
- Tapping a button expands that zone full-width above the tab bar.
- Tapping the same button again (or tapping outside) collapses it.
- Only one zone open at a time.

### Mobile card layout
- Expanded cards are displayed in a horizontally scrollable strip.
- Cards are sized to fit ~2.5 cards on screen width, encouraging horizontal scroll.
- Same fan rotation is applied but with less jitter (tighter layout).

### Mobile breakpoint
- Tab menu activates at `≤768px` viewport width.
- Above 768px, use the desktop hover-zone behavior.

---

## Action Card Zone Triggering

Some action cards need to open other zones during play (e.g., "choose a card from discard"):
- The card's action resolution can **programmatically open a zone** and keep it open until the action completes.
- While triggered, the zone shows interactive affordances (highlight selectable cards, show "Select" buttons).
- Completing or canceling the action releases the zone back to normal collapse behavior.
- This is the one exception to mutual exclusion — both the hand zone and the triggered zone can be open simultaneously.

---

## Implementation Plan

### Phase 1: Foundation
1. `npm install framer-motion`
2. Create `src/ui/CardZone.tsx` — reusable zone component (collapsed/expanded, hover triangle, anchor corner)
3. Create `src/ui/useHoverTriangle.ts` — hook implementing the safe-zone geometry
4. Create `src/ui/MiniCard.tsx` — collapsed card preview component with color dots
5. Create `src/ui/Coverflow.tsx` — reusable coverflow/carousel component (used by all three zones, scales to 126+ cards)

### Phase 2: Hand Zone
6. Refactor `Hand.tsx` to use `CardZone` wrapper
7. Implement fan-out layout with random rotation (0–3°)
8. Wire card selection to work across collapsed/expanded states
9. Add gradient overlay
10. Integrate `Coverflow` for overflow handling

### Phase 3: Treasure & Discard
11. Move `Treasure.tsx` into `CardZone` wrapper, anchor top-right
12. Create `DiscardZone.tsx` using `CardZone` + `Coverflow`, anchor top-left
13. Wire mutual exclusion (expanding one collapses others)

### Phase 4: Action Card Modal
14. Create `src/ui/ActionCardModal.tsx` — full-screen modal with card + form layout
15. Migrate action panel logic from App.tsx into modal
16. Wire zone triggering from within modal (e.g., open discard for selection)

### Phase 5: Other Players
17. Mini hand indicator on player rows
18. Player hand modal (card backs, action card invocation for steal etc.)

### Phase 6: Mobile
19. Create `ZoneTabBar.tsx` — bottom tab menu
20. Responsive breakpoint switching between hover zones and tab bar
21. Mobile card strip layout
22. Mobile action card modal (vertical stack)

### Phase 7: Polish
23. Card enter/exit animations (draw, play, discard)
24. Spring physics tuning
25. Background dim effect on zone expand

---

## Files Modified

| File | Change |
|------|--------|
| `package.json` | Add `framer-motion` |
| `src/ui/CardZone.tsx` | **New** — reusable zone shell |
| `src/ui/useHoverTriangle.ts` | **New** — hover safe-zone hook |
| `src/ui/MiniCard.tsx` | **New** — collapsed card preview |
| `src/ui/Coverflow.tsx` | **New** — reusable coverflow carousel (scales to 126+ cards) |
| `src/ui/DiscardZone.tsx` | **New** — discard pile zone |
| `src/ui/ActionCardModal.tsx` | **New** — full-screen action card modal with form |
| `src/ui/ZoneTabBar.tsx` | **New** — mobile tab menu |
| `src/ui/Hand.tsx` | Refactor into CardZone, add fan layout |
| `src/ui/Treasure.tsx` | Refactor into CardZone, move to top-right |
| `src/ui/PlayerCard.tsx` | Add mini hand indicator + modal trigger |
| `src/App.tsx` | Zone state management, mutual exclusion, action modal state, remove old floating layout |
| `src/App.css` | Remove old floating styles, add zone positioning, modal styles, mobile tab bar |
