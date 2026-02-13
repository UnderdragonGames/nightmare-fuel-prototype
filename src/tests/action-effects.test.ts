import { describe, it, expect } from 'vitest';
import type { GState, PlayerID } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { makeCard } from '../game/cardFactory';
import { canPlace } from '../game/helpers';
import { applyGameEffects, initActionState, playActionCardFromHand, replaceHexWithDead } from '../game/effects';
import { resolveCardEffects } from '../game/cardActions';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

const rules = {
	...MODE_RULESETS.hex,
	RADIUS: 2,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
};

const createState = (playerIds: string[]): GState => ({
	rules,
	radius: rules.RADIUS,
	board: {},
	lanes: [],
	deck: [],
	discard: [],
	hands: {},
	treasure: [],
	prefs: {},
	nightmares: {},
	nightmareState: {},
	stats: { placements: 0 },
	meta: { deckExhaustionCycle: null, stashBonus: {}, actionPlaysThisTurn: {} },
	origins: [{ q: 0, r: 0 }],
	action: initActionState(playerIds as PlayerID[]),
});

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

describe('action effects', () => {
	it('TODO: Sabotage skips the target next turn and discards after skip', () => {
		const G = createState(['0', '1']);
		const sabotage = makeCard([], { id: 89, name: 'Sabotage', text: 'Skip their next turn.', isAction: true });
		G.hands['0'] = [sabotage];
		G.hands['1'] = [];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			targetPlayerId: '1',
			lastPlacedColor: null,
		});

		expect(G.action.skipNextTurn['1']).toBe(true);
		expect(G.action.attachedCards.some((a) => a.card.id === sabotage.id && a.targetPlayerId === '1')).toBe(true);

		// Simulate turn begin skip cleanup.
		G.action.skipNextTurn['1'] = false;
		G.discard.push(sabotage);
		G.action.attachedCards = G.action.attachedCards.filter((a) => a.card.id !== sabotage.id);

		expect(G.action.skipNextTurn['1']).toBe(false);
		expect(G.discard.some((c) => c.id === sabotage.id)).toBe(true);
	});
	it('replaces a hex with dead and blocks placement', () => {
		const G = createState(['0']);
		const coord = { q: 1, r: 0 };
		replaceHexWithDead(G, coord);
		expect(G.board['1,0']?.dead).toBe(true);
		expect(canPlace(G, coord, 'R', rules)).toBe(false);
	});

	it('plays an action that draws for all players', () => {
		const G = createState(['0', '1']);
		G.deck = [makeCard(['R']), makeCard(['G']), makeCard(['B'])];
		const actionCard = makeCard([], { id: 2, name: 'Allow a Brief Reprieve', text: 'Every player draws a card.', isAction: true });
		G.hands['0'] = [actionCard];
		G.hands['1'] = [];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(1);
		expect(G.hands['1'].length).toBe(1);
		expect(G.discard.some((c) => c.id === actionCard.id)).toBe(true);
	});

	it('supports reveal/draft/discard flow for Alter Fate', () => {
		const G = createState(['0']);
		G.deck = [
			makeCard(['R'], { id: 1 }),
			makeCard(['G'], { id: 2 }),
			makeCard(['B'], { id: 3 }),
			makeCard(['O'], { id: 4 }),
			makeCard(['Y'], { id: 5 }),
		];
		const actionCard = makeCard([], { id: 4, name: 'Alter Fate', text: 'Look at the top 5 cards...', isAction: true });
		G.hands['0'] = [actionCard];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			revealedPickIndex: 2,
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(1);
		expect(G.discard.length).toBe(5);
	});

	it('moves the played card to another hand instead of discarding', () => {
		const G = createState(['0', '1']);
		const actionCard = makeCard([], { id: 60, name: 'Monologue', text: 'Put this card in any player hand.', isAction: true });
		G.hands['0'] = [actionCard];
		G.hands['1'] = [];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			targetPlayerId: '1',
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(0);
		expect(G.hands['1'].some((c) => c.id === actionCard.id)).toBe(true);
		expect(G.discard.some((c) => c.id === actionCard.id)).toBe(false);
		expect(G.action.extraPlays['0']).toBe(1);
	});

	it('suppresses draws until all hands are empty', () => {
		const G = createState(['0']);
		const actionCard = makeCard([], { id: 10, name: 'Barren Wasteland', text: 'Players do not draw cards.', isAction: true });
		G.hands['0'] = [actionCard, makeCard(['R'])];
		G.deck = [makeCard(['G']), makeCard(['B'])];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			lastPlacedColor: null,
		});

		applyGameEffects(G, [{ type: 'drawCards', playerId: '0', count: 1 }], {
			currentPlayer: '0',
			markPlayedCardMoved: () => undefined,
		});
		expect(G.hands['0'].length).toBe(1);

		G.hands['0'] = [];
		applyGameEffects(G, [{ type: 'drawCards', playerId: '0', count: 1 }], {
			currentPlayer: '0',
			markPlayedCardMoved: () => undefined,
		});
		expect(G.hands['0'].length).toBe(1);
		expect(G.discard.some((c) => c.id === actionCard.id)).toBe(true);
	});

	it('draws 5 for Armed to the Teeth', () => {
		const G = createState(['0']);
		G.deck = [makeCard(['R']), makeCard(['G']), makeCard(['B']), makeCard(['O']), makeCard(['Y'])];
		const actionCard = makeCard([], { id: 8, name: 'Armed to the Teeth', text: 'Draw 5 cards.', isAction: true });
		G.hands['0'] = [actionCard];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(5);
	});

	it('randomly discards 1 from each player (Debilitate)', () => {
		const G = createState(['0', '1']);
		G.hands['0'] = [makeCard(['R']), makeCard(['G'])];
		G.hands['1'] = [makeCard(['B']), makeCard(['O'])];
		const actionCard = makeCard([], { id: 23, name: 'Debilitate', text: 'Discard 1 at random.', isAction: true });
		G.hands['0'].unshift(actionCard);

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(1);
		expect(G.hands['1'].length).toBe(1);
		expect(G.discard.length).toBe(3);
	});

	it('discard hands and draw 3 each (Embrace Chaos)', () => {
		const G = createState(['0', '1']);
		G.deck = [
			makeCard(['R']),
			makeCard(['G']),
			makeCard(['B']),
			makeCard(['O']),
			makeCard(['Y']),
			makeCard(['V']),
		];
		G.hands['0'] = [makeCard(['R']), makeCard(['G'])];
		G.hands['1'] = [makeCard(['B']), makeCard(['O'])];
		const actionCard = makeCard([], { id: 32, name: 'Embrace Chaos', text: 'Discard and draw 3.', isAction: true });
		G.hands['0'].unshift(actionCard);

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(3);
		expect(G.hands['1'].length).toBe(3);
		expect(G.discard.length).toBe(5);
	});

	it('replaces a hex with dead (Malfunction)', () => {
		const G = createState(['0']);
		const actionCard = makeCard([], { id: 54, name: 'Malfunction', text: 'Replace with dead.', isAction: true });
		G.hands['0'] = [actionCard];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			coord: { q: 1, r: 0 },
			lastPlacedColor: null,
		});

		expect(G.board['1,0']?.dead).toBe(true);
	});

	it('replaces a hex with dead (Placebo)', () => {
		const G = createState(['0']);
		const actionCard = makeCard([], { id: 73, name: 'Placebo', text: 'Replace with dead.', isAction: true });
		G.hands['0'] = [actionCard];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			coord: { q: 1, r: 0 },
			lastPlacedColor: null,
		});

		expect(G.board['1,0']?.dead).toBe(true);
	});

	it('steals a card at random from another player (Steal 82)', () => {
		const G = createState(['0', '1']);
		const actionCard = makeCard([], { id: 82, name: 'Steal', text: 'Take 1 card.', isAction: true });
		G.hands['0'] = [actionCard];
		G.hands['1'] = [makeCard(['R']), makeCard(['G'])];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			targetPlayerId: '1',
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(1);
		expect(G.hands['1'].length).toBe(1);
	});

	it('steals a card at random from another player (Steal 100)', () => {
		const G = createState(['0', '1']);
		const actionCard = makeCard([], { id: 100, name: 'Steal', text: 'Take 1 card.', isAction: true });
		G.hands['0'] = [actionCard];
		G.hands['1'] = [makeCard(['R']), makeCard(['G'])];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			targetPlayerId: '1',
			lastPlacedColor: null,
		});

		expect(G.hands['0'].length).toBe(1);
		expect(G.hands['1'].length).toBe(1);
	});

	it('replaces a hex color (This Prey is Mine)', () => {
		const G = createState(['0']);
		const actionCard = makeCard([], { id: 111, name: 'This Prey is Mine', text: 'Replace hex color.', isAction: true });
		G.hands['0'] = [actionCard];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			coord: { q: 1, r: 0 },
			replaceColor: 'R',
			lastPlacedColor: null,
		});

		expect(G.board['1,0']?.colors).toEqual(['R']);
	});

	it('applies choice for Combo (extra placements or extra action plays)', () => {
		const G = createState(['0']);
		const actionCard = makeCard([], { id: 19, name: 'Combo', text: 'Place 2 or play 2 actions.', isAction: true });
		G.hands['0'] = [actionCard];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0'],
			choiceIndex: 1,
			lastPlacedColor: null,
		});

		expect(G.action.extraActionPlays['0']).toBe(2);
	});
});
