# Action Cards — Implementation Status

## Category A: Implemented (effect logic complete, no UI input needed)
| ID | Card | Effect |
|----|------|--------|
| 2 | Allow a Brief Reprieve | `drawEach(1)` — every player draws 1 |
| 8 | Armed to the Teeth | `drawCurrent(5)` — draw 5 cards |
| 10 | Barren Wasteland | Place on draw pile face-up, suppress draws until all hands empty |
| 23 | Debilitate | `randomDiscardEach(1)` — all players discard 1 at random |
| 32 | Embrace Chaos | All discard hands, all draw 3 |
| 60 | Monologue | Give card to any player's hand + grant extra play |
| 79 | Procession of Elimination | Reveal unused villain boards for round |
| 87 | Spy on Villain | Look at one player's villain card (UI-only) |

## Category B: Easily Implemented (effect logic exists, just needs UI input wiring)
| ID | Card | Input Needed | Notes |
|----|------|-------------|-------|
| 4 | Alter Fate | `revealedPickIndex` | Reveal 5, pick 1, discard rest |
| 19 | Combo | `choiceIndex` | Choose: 2 extra placements OR 2 extra actions |
| 54 | Malfunction | `coord` | Pick hex → replace with dead tile |
| 73 | Placebo | `coord` | Same as Malfunction |
| 82 | Steal | `targetPlayerId` | Steal 1 random card from target |
| 100 | Steal | `targetPlayerId` | Same as #82 |
| 91 | Seize the Opportunity | `lastPlacedColor` (from state) | Extra placement of last-placed color |

## Category C: Requires Architecture

### C1: Hand rotation system
| ID | Card | What's needed |
|----|------|--------------|
| 28 | Dimensional Anomaly | `rotateHands(clockwise)` — pass all hands to the right. Needs: implement the rotate function in effects.ts |

### C2: Hex selection + board mutation UI
| ID | Card | What's needed |
|----|------|--------------|
| 43 | Help Yourself Out | Select owned hex → pick empty destination → move hex. Needs: hex selection modal, destination picker, ownership check |
| 111 | This Prey is Mine | Select hex → pick new color → replace. Needs: hex picker + color picker UI |

### C3: Player targeting UI
| ID | Card | What's needed |
|----|------|--------------|
| 89 | Sabotage | Pick target player → skip their next turn. Needs: player picker UI, turn-start skip check |

### C4: Preference/agenda reordering UI
| ID | Card | What's needed |
|----|------|--------------|
| 83 | Re-examine Priorities | Reorder primary/secondary/tertiary agendas. Needs: drag-and-drop or swap UI for 3 priorities |
| 65 | New Agenda | Choose a stat → override one agenda slot. Needs: stat picker + agenda slot picker |

### C5: Stat token / hex annotation system (NEW ARCHITECTURE)
| ID | Card | What's needed |
|----|------|--------------|
| 48 | Ingenuity | Place stat token on hex → counts for 2 stats. Needs: hex annotation data model, stat picker, scoring integration |

### C6: Trigger / event system (NEW ARCHITECTURE)
| ID | Card | What's needed |
|----|------|--------------|
| 86 | Restrict | Attach stat token to card, trigger when villain moves that stat → discard. Needs: trigger resolution in game loop |
| 90 | Seal Power | Attach to villain, trigger on synergy use → negate once. Needs: synergy event hook |

### C7: Draft / reveal flow (multi-step async)
| ID | Card | What's needed |
|----|------|--------------|
| 63 | Mystery Box | Reveal N cards → players draft in turn order → auto-play if action. Needs: multi-player sequential UI flow, interrupts for drafted action cards |
