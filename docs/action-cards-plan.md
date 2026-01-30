# Action Cards Plan

This plan treats any card with non-empty rules text as an action card.

## Action cards and required effects
- Allow a Brief Reprieve: Every player draws a card.
  - Actions: `drawCards(player, 1)` for each player.
- Alter Fate: Look at the top 5 cards of the deck, take one card, then discard the rest.
  - Actions: `revealTop(N=5)`, `pickOneToHand`, `discardRest`.
- Armed to the Teeth: Draw 5 cards.
  - Actions: `drawCards(currentPlayer, 5)`.
- Barren Wasteland: Place this card on the draw pile face up. Players do not draw cards. When all hands are empty, place this card in the discard pile.
  - Actions: `placeOnDrawPileTopFaceUp`, `suppressDrawsUntil(handsEmpty)`, `moveToDiscard`.
- Combo: Place 2 hexes or play 2 additional actions.
  - Actions: `grantExtraPlacements(2)` OR `grantExtraActionPlays(2)`.
- Debilitate: All players including you discard one card at random.
  - Actions: `randomDiscard(player, 1)` for each player.
- Dimensional Anomaly: Every player passes their hand to the right.
  - Actions: `rotateHands(clockwise)`.
- Embrace Chaos: All players discard their hands and draw 3 new cards.
  - Actions: `discardHand(player)`, `drawCards(player, 3)` for each player.
- Help Yourself Out: Move a hex of any color you control. (Must be revealed)
  - Actions: `selectOwnedHex`, `moveHex(from, to)`.
- Ingenuity: Place a stat token of your choice on a hex, it counts for both now. (Must be revealed)
  - Actions: `chooseStat`, `placeTokenOnHex`, `markHexCountsForTwoStats`.
- Malfunction: Replace any hex tile with a dead tile.
  - Actions: `replaceHexWithDead(coord)`.
- Monologue: No effect other than you feeling proud of yourself. Put this card in any player's hand. Play another card.
  - Actions: `moveCardToPlayerHand(target)`, `grantExtraPlay(1)`.
- Mystery Box: Reveal as many cards from the deck as there are players. In the order of play starting with you, each player picks one of the cards and immediately plays it.
  - Actions: `revealTop(N=playerCount)`, `draftInTurnOrder`, `autoPlayPickedCard`.
- New Agenda: Place a stat token of any color over one of your agendas. That is now your new agenda. (Must be revealed)
  - Actions: `chooseAgenda`, `chooseStat`, `setAgendaOverride`.
- Placebo: Replace any hex tile with a dead tile.
  - Actions: `replaceHexWithDead(coord)`.
- Procession of Elimination: You may look at the unused villain boards for the remainder of the round.
  - Actions: `grantRevealUnusedVillains(untilEndOfRound)`.
- Steal (82): Take 1 card at random from another player.
  - Actions: `randomStealCard(fromPlayer, toPlayer, 1)`.
- Re-examine Priorities: Switch around your primary, secondary and tertiary agendas. Mark the changes with stat tokens. (Must be revealed)
  - Actions: `reorderPlayerPrefs`, `markAgendaTokens`.
- Restrict: Place a stat token on this card. The next time a villain would move a stat token of the stat token's type, they put this card in the discard pile instead.
  - Actions: `attachTokenToCard`, `registerTrigger(onMoveStatOfType)`, `discardSelfOnTrigger`.
- Spy on Villain: Look at one player's villain card. Don't show anyone else.
  - Actions: `privateRevealVillain(player)`.
- Sabotage: Place this card next to another player. Skip their next turn and put this card in the discard pile.
  - Actions: `markSkipNextTurn(target)`, `discardSelfAfterSkip`.
- Seal Power: Place this card in front of a villain. The next time they use a synergy, it doesn't count. (They only place one hex)
  - Actions: `attachToPlayer`, `registerTrigger(onSynergy)`, `reduceSynergyOnce`.
- Seize the Opportunity: Place an additional hex of the same color as one the last person placed.
  - Actions: `readLastPlacedColor`, `grantExtraPlacement(matchingColor)`.
- Steal (100): Take 1 card at random from another player.
  - Actions: `randomStealCard(fromPlayer, toPlayer, 1)`.
- This Prey is Mine: Replace any hex with a hex of a different color. (Except dead hexes).
  - Actions: `replaceHexColor(coord, newColor)`.

## Core action primitives to implement
- Card flow: `drawCards`, `discardCard`, `discardHand`, `revealTop`, `draftInTurnOrder`, `autoPlayPickedCard`, `moveCardToPlayerHand`, `randomStealCard`.
- Turn control: `grantExtraPlay`, `grantExtraPlacements`, `grantExtraActionPlays`, `markSkipNextTurn`, `suppressDrawsUntil`.
- Board mutation: `replaceHexWithDead`, `replaceHexColor`, `moveHex`, `addPathSegment`, `removePath`, `destroyNode`.
- Player state: `reorderPlayerPrefs`, `setAgendaOverride`, `markAgendaTokens`, `grantRevealUnusedVillains`.
- Triggers: `registerTrigger(onMoveStatOfType)`, `registerTrigger(onSynergy)`.
- Metadata: `readLastPlacedColor`, `placeOnDrawPileTopFaceUp`.
