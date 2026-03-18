import { describe, it, expect } from 'vitest';
import type { GState, PlayerID } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { makeCard } from '../game/cardFactory';
import { initActionState, playActionCardFromHand, rotateHands } from '../game/effects';
import { CARD_ACTIONS_BY_ID, resolveCardEffects } from '../game/cardActions';

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

describe('rotateHands', () => {
	it('2-player clockwise rotation swaps hands', () => {
		const G = createState(['0', '1']);
		const cardA = makeCard(['R'], { id: 201 });
		const cardB = makeCard(['G'], { id: 202 });
		G.hands['0'] = [cardA];
		G.hands['1'] = [cardB];

		rotateHands(G, ['0', '1'], 'clockwise');

		expect(G.hands['0'].map((c) => c.id)).toEqual([202]);
		expect(G.hands['1'].map((c) => c.id)).toEqual([201]);
	});

	it('3-player clockwise rotation: each player gets the hand of the player to their left', () => {
		const G = createState(['0', '1', '2']);
		const cardA = makeCard(['R'], { id: 301 });
		const cardB = makeCard(['G'], { id: 302 });
		const cardC = makeCard(['B'], { id: 303 });
		G.hands['0'] = [cardA];
		G.hands['1'] = [cardB];
		G.hands['2'] = [cardC];

		// Clockwise: player i gets hand of player i-1 (wrapping)
		// Player 0 gets player 2's hand, player 1 gets player 0's hand, player 2 gets player 1's hand
		rotateHands(G, ['0', '1', '2'], 'clockwise');

		expect(G.hands['0'].map((c) => c.id)).toEqual([303]); // was player 2's
		expect(G.hands['1'].map((c) => c.id)).toEqual([301]); // was player 0's
		expect(G.hands['2'].map((c) => c.id)).toEqual([302]); // was player 1's
	});

	it('handles empty hands correctly', () => {
		const G = createState(['0', '1', '2']);
		const cardA = makeCard(['R'], { id: 401 });
		G.hands['0'] = [cardA];
		G.hands['1'] = [];
		G.hands['2'] = [];

		rotateHands(G, ['0', '1', '2'], 'clockwise');

		expect(G.hands['0']).toEqual([]);
		expect(G.hands['1'].map((c) => c.id)).toEqual([401]);
		expect(G.hands['2']).toEqual([]);
	});

	it('full card pipeline: card 28 resolves and applies rotateHands', () => {
		const G = createState(['0', '1', '2']);
		const cardA = makeCard(['R'], { id: 501 });
		const cardB = makeCard(['G'], { id: 502 });
		const cardC = makeCard(['B'], { id: 503 });

		// Card 28 is "Dimensional Anomaly"
		const actionCard = makeCard([], {
			id: 28,
			name: 'Dimensional Anomaly',
			text: 'Every player passes their hand to the right.',
			isAction: true,
		});

		// Verify card 28 has the rotateHands action defined
		const actions = CARD_ACTIONS_BY_ID[28];
		expect(actions).toBeDefined();
		expect(actions![0]!.type).toBe('rotateHands');

		G.hands['0'] = [actionCard, cardA];
		G.hands['1'] = [cardB];
		G.hands['2'] = [cardC];

		playResolved(G, '0', 0, {
			currentPlayerId: '0',
			playerOrder: ['0', '1', '2'],
			lastPlacedColor: null,
		});

		// After clockwise rotation:
		// Player 0 had [cardA] (after action card removed), gets player 2's [cardC]
		// Player 1 had [cardB], gets player 0's [cardA]
		// Player 2 had [cardC], gets player 1's [cardB]
		expect(G.hands['0'].map((c) => c.id)).toEqual([503]);
		expect(G.hands['1'].map((c) => c.id)).toEqual([501]);
		expect(G.hands['2'].map((c) => c.id)).toEqual([502]);

		// Action card should be in discard
		expect(G.discard.some((c) => c.id === 28)).toBe(true);
	});
});
