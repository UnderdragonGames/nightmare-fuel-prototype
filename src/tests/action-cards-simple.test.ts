import { describe, it, expect } from 'vitest';
import type { GState, Card, PlayerID } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { makeCard } from '../game/cardFactory';
import { CARDS } from '../game/cards';
import { resolveCardEffects } from '../game/cardActions';
import { applyGameEffects, initActionState, playActionCardFromHand } from '../game/effects';
import type { EffectContext } from '../game/effects';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

const rules = {
	...MODE_RULESETS.hex,
	RADIUS: 3,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
};

const findCard = (id: number): Card => {
	const card = CARDS.find((c) => c.id === id);
	if (!card) throw new Error(`Card ${id} not found`);
	return { ...card };
};

const makeTestState = (playerIds: string[], overrides: Partial<GState> = {}): GState => ({
	rules,
	radius: rules.RADIUS,
	board: {},
	lanes: [],
	deck: [],
	discard: [],
	hands: {},
	treasure: [],
	prefs: { '0': { primary: 'R', secondary: 'O', tertiary: 'Y' } },
	nightmares: {},
	nightmareState: {},
	stats: { placements: 0 },
	meta: { deckExhaustionCycle: null, stashBonus: {}, actionPlaysThisTurn: {} },
	origins: [{ q: 0, r: 0 }],
	action: initActionState(playerIds as PlayerID[]),
	...overrides,
});

/** Play an action card from hand index 0, resolving effects with the given context. */
const playResolved = (
	G: GState,
	playerId: PlayerID,
	handIndex: number,
	context: Parameters<typeof resolveCardEffects>[1],
) => {
	const card = G.hands[playerId]?.[handIndex];
	if (!card) throw new Error('Missing card to play.');
	const effects = resolveCardEffects(card, context);
	playActionCardFromHand(G, undefined, playerId, handIndex, effects);
};

// ---------------------------------------------------------------------------
// Card #4 — Alter Fate: revealTop(5), pickOneToHand, discardRest
// ---------------------------------------------------------------------------
describe('Card #4 "Alter Fate"', () => {
	it('reveals 5 cards, picks index 2 to hand, discards the rest', () => {
		const G = makeTestState(['0']);
		// Deck has 6 cards; top of deck is last element (popped first).
		const deckCards = [
			makeCard(['R'], { id: 101 }),
			makeCard(['O'], { id: 102 }),
			makeCard(['Y'], { id: 103 }),
			makeCard(['G'], { id: 104 }),
			makeCard(['B'], { id: 105 }),
			makeCard(['V'], { id: 106 }),
		];
		G.deck = [...deckCards];

		const alterFate = makeCard([], {
			id: 4,
			name: 'Alter Fate',
			text: 'Look at the top 5 cards of the deck, take one card, then discard the rest.',
			isAction: true,
		});
		G.hands['0'] = [alterFate];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			revealedPickIndex: 2,
			lastPlacedColor: null,
		});

		// Player should have exactly 1 card in hand (the picked one).
		expect(G.hands['0'].length).toBe(1);
		// 4 remaining revealed cards + the played action card = 5 in discard.
		expect(G.discard.length).toBe(5);
		// 1 card should remain in the deck (the 6th one that wasn't revealed).
		expect(G.deck.length).toBe(1);
		expect(G.deck[0]!.id).toBe(101);
	});

	it('handles deck with fewer than 5 cards gracefully', () => {
		const G = makeTestState(['0']);
		G.deck = [makeCard(['R'], { id: 201 }), makeCard(['G'], { id: 202 }), makeCard(['B'], { id: 203 })];

		const alterFate = makeCard([], {
			id: 4,
			name: 'Alter Fate',
			text: 'Look at the top 5 cards of the deck, take one card, then discard the rest.',
			isAction: true,
		});
		G.hands['0'] = [alterFate];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			revealedPickIndex: 0,
			lastPlacedColor: null,
		});

		// Picked 1, discarded the other 2 revealed + action card = 3 in discard.
		expect(G.hands['0'].length).toBe(1);
		expect(G.discard.length).toBe(3);
		expect(G.deck.length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Card #19 — Combo: choice([grantExtraPlacements(2)], [grantExtraActionPlays(2)])
// ---------------------------------------------------------------------------
describe('Card #19 "Combo"', () => {
	it('choiceIndex=0 grants 2 extra placements', () => {
		const G = makeTestState(['0']);
		const combo = makeCard([], {
			id: 19,
			name: 'Combo',
			text: 'Place 2 or play 2 actions.',
			isAction: true,
		});
		G.hands['0'] = [combo];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			choiceIndex: 0,
			lastPlacedColor: null,
		});

		expect(G.action.extraPlacements['0']!.count).toBe(2);
		// Extra action plays should remain at 0.
		expect(G.action.extraActionPlays['0']).toBe(0);
	});

	it('choiceIndex=1 grants 2 extra action plays', () => {
		const G = makeTestState(['0']);
		const combo = makeCard([], {
			id: 19,
			name: 'Combo',
			text: 'Place 2 or play 2 actions.',
			isAction: true,
		});
		G.hands['0'] = [combo];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			choiceIndex: 1,
			lastPlacedColor: null,
		});

		expect(G.action.extraActionPlays['0']).toBe(2);
		// Extra placements should remain at initial value.
		expect(G.action.extraPlacements['0']!.count).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Card #54 "Malfunction" and Card #73 "Placebo" — replaceHexWithDead
// ---------------------------------------------------------------------------
describe('replaceHexWithDead cards', () => {
	it('Card #54 "Malfunction" turns an existing hex into dead', () => {
		const G = makeTestState(['0']);
		// Place a hex tile on the board first.
		G.board['1,0'] = { colors: ['R'], rotation: 0, dead: false };

		const malfunction = makeCard([], {
			id: 54,
			name: 'Malfunction',
			text: 'Destroy a hex tile.',
			isAction: true,
		});
		G.hands['0'] = [malfunction];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			coord: { q: 1, r: 0 },
			lastPlacedColor: null,
		});

		expect(G.board['1,0']?.dead).toBe(true);
		expect(G.board['1,0']?.colors).toEqual([]);
		expect(G.board['1,0']?.rotation).toBe(0);
	});

	it('Card #73 "Placebo" turns an existing hex into dead', () => {
		const G = makeTestState(['0']);
		G.board['2,-1'] = { colors: ['B', 'G'], rotation: 3, dead: false };

		const placebo = makeCard([], {
			id: 73,
			name: 'Placebo',
			text: 'Destroy a hex tile.',
			isAction: true,
		});
		G.hands['0'] = [placebo];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			coord: { q: 2, r: -1 },
			lastPlacedColor: null,
		});

		expect(G.board['2,-1']?.dead).toBe(true);
		expect(G.board['2,-1']?.colors).toEqual([]);
	});

	it('replaceHexWithDead on empty coord creates a dead tile there', () => {
		const G = makeTestState(['0']);

		const malfunction = makeCard([], {
			id: 54,
			name: 'Malfunction',
			text: 'Destroy a hex tile.',
			isAction: true,
		});
		G.hands['0'] = [malfunction];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			coord: { q: 1, r: -1 },
			lastPlacedColor: null,
		});

		expect(G.board['1,-1']?.dead).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Card #82 and #100 "Steal" — randomStealCard(1)
// ---------------------------------------------------------------------------
describe('Steal cards (#82 and #100)', () => {
	it('Card #82 steals 1 card from target player', () => {
		const G = makeTestState(['0', '1']);
		const targetCards = [makeCard(['R'], { id: 301 }), makeCard(['G'], { id: 302 }), makeCard(['B'], { id: 303 })];
		G.hands['0'] = [
			makeCard([], { id: 82, name: 'Steal', text: 'Take 1 card.', isAction: true }),
		];
		G.hands['1'] = [...targetCards];

		const initialTargetSize = G.hands['1'].length;

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			targetPlayerId: '1',
			lastPlacedColor: null,
		});

		// Player 0 should have gained 1 card (stolen).
		expect(G.hands['0'].length).toBe(1);
		// Player 1 should have lost 1 card.
		expect(G.hands['1'].length).toBe(initialTargetSize - 1);
		// The stolen card should be one of the original target cards.
		const stolenCard = G.hands['0'][0]!;
		expect(targetCards.some((c) => c.id === stolenCard.id)).toBe(true);
	});

	it('Card #100 steals 1 card from target player', () => {
		const G = makeTestState(['0', '1']);
		G.hands['0'] = [
			makeCard([], { id: 100, name: 'Steal', text: 'Take 1 card.', isAction: true }),
		];
		G.hands['1'] = [makeCard(['O'], { id: 401 }), makeCard(['V'], { id: 402 })];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			targetPlayerId: '1',
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(1);
		expect(G.hands['1'].length).toBe(1);
	});

	it('stealing from a player with 1 card leaves them empty', () => {
		const G = makeTestState(['0', '1']);
		const singleCard = makeCard(['Y'], { id: 501 });
		G.hands['0'] = [
			makeCard([], { id: 82, name: 'Steal', text: 'Take 1 card.', isAction: true }),
		];
		G.hands['1'] = [singleCard];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			targetPlayerId: '1',
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(1);
		expect(G.hands['0'][0]!.id).toBe(singleCard.id);
		expect(G.hands['1'].length).toBe(0);
	});

	it('stealing from a player with 0 cards does nothing', () => {
		const G = makeTestState(['0', '1']);
		G.hands['0'] = [
			makeCard([], { id: 100, name: 'Steal', text: 'Take 1 card.', isAction: true }),
		];
		G.hands['1'] = [];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			targetPlayerId: '1',
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(0);
		expect(G.hands['1'].length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Card #91 "Seize the Opportunity" — readLastPlacedColor → grantExtraPlacement
// ---------------------------------------------------------------------------
describe('Card #91 "Seize the Opportunity"', () => {
	it('grants 1 extra placement of the last placed color', () => {
		const G = makeTestState(['0']);
		const seize = makeCard([], {
			id: 91,
			name: 'Seize the Opportunity',
			text: 'Place one more tile of the color you just placed.',
			isAction: true,
		});
		G.hands['0'] = [seize];
		// Simulate that the player last placed blue.
		G.action.lastPlacedColor = 'B';

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			lastPlacedColor: 'B',
		});

		expect(G.action.extraPlacements['0']!.count).toBe(1);
		expect(G.action.extraPlacements['0']!.color).toBe('B');
	});

	it('grants extra placement with a different color (R)', () => {
		const G = makeTestState(['0']);
		const seize = makeCard([], {
			id: 91,
			name: 'Seize the Opportunity',
			text: 'Place one more tile of the color you just placed.',
			isAction: true,
		});
		G.hands['0'] = [seize];
		G.action.lastPlacedColor = 'R';

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			lastPlacedColor: 'R',
		});

		expect(G.action.extraPlacements['0']!.count).toBe(1);
		expect(G.action.extraPlacements['0']!.color).toBe('R');
	});

	it('throws when lastPlacedColor is not provided', () => {
		const G = makeTestState(['0']);
		const seize = makeCard([], {
			id: 91,
			name: 'Seize the Opportunity',
			text: 'Place one more tile of the color you just placed.',
			isAction: true,
		});
		G.hands['0'] = [seize];

		expect(() => {
			playResolved(G, '0', 0, {
				currentPlayerId: '0',
				playerOrder: ['0'],
				lastPlacedColor: null,
			});
		}).toThrow('grantExtraPlacement requires lastPlacedColor');
	});
});

// ---------------------------------------------------------------------------
// End-to-end: card definitions from CARDS array match expected behavior
// ---------------------------------------------------------------------------
describe('card definitions from CARDS array', () => {
	it('Card #4 is an action card named "Alter Fate"', () => {
		const card = findCard(4);
		expect(card.isAction).toBe(true);
		expect(card.name).toBe('Alter Fate');
	});

	it('Card #19 is an action card named "Combo"', () => {
		const card = findCard(19);
		expect(card.isAction).toBe(true);
		expect(card.name).toBe('Combo');
	});

	it('Card #54 is an action card named "Malfunction"', () => {
		const card = findCard(54);
		expect(card.isAction).toBe(true);
		expect(card.name).toBe('Malfunction');
	});

	it('Card #73 is an action card named "Placebo"', () => {
		const card = findCard(73);
		expect(card.isAction).toBe(true);
		expect(card.name).toBe('Placebo');
	});

	it('Card #82 is an action card named "Steal"', () => {
		const card = findCard(82);
		expect(card.isAction).toBe(true);
		expect(card.name).toBe('Steal');
	});

	it('Card #91 is an action card named "Seize the Opportunity"', () => {
		const card = findCard(91);
		expect(card.isAction).toBe(true);
		expect(card.name).toBe('Seize the Opportunity');
	});

	it('Card #100 is an action card named "Steal"', () => {
		const card = findCard(100);
		expect(card.isAction).toBe(true);
		expect(card.name).toBe('Steal');
	});
});
