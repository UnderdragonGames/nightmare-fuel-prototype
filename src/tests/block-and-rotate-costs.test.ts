import { describe, it, expect } from 'vitest';
import { enumerateActions, applyMicroAction, type Action } from '../game/ai';
import type { Co, GState, Rules } from '../game/types';
import { HEX_RULES, buildColorToDir, BASE_EDGE_COLORS } from '../game/rulesConfig';
import { key } from '../game/helpers';
import { makeCard } from '../game/cardFactory';
import { initActionState } from '../game/effects';

const TEST_RULES: Rules = {
	...HEX_RULES,
	RADIUS: 2,
	RANDOM_CARDINAL_DIRECTIONS: false,
	COLOR_TO_DIR: buildColorToDir(BASE_EDGE_COLORS),
	PLACEMENT: {
		...HEX_RULES.PLACEMENT,
		DISCARD_TO_ROTATE: 'any',
		COST_TO_ROTATE: 1,
		COST_TO_BLOCK: 2,
	},
};

const co = (q: number, r: number): Co => ({ q, r });

const createTestState = (overrides: Partial<GState> = {}): GState => {
	const rules = overrides.rules ?? TEST_RULES;
	return {
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
		action: initActionState([]),
		...overrides,
	};
};

const setTile = (G: GState, coord: Co, colors: string[], rotation = 0, dead = false): void => {
	G.board[key(coord)] = { colors: [...colors] as any, rotation, dead };
};

const setEmptyTile = (G: GState, coord: Co): void => {
	G.board[key(coord)] = { colors: [], rotation: 0, dead: false };
};

const actionKey = (a: Action): string => {
	switch (a.type) {
		case 'playCard': {
			const args = a.args;
			if ('source' in args) {
				return `play:${args.handIndex}:${args.pick}:${args.source.q},${args.source.r}->${args.coord.q},${args.coord.r}`;
			}
			return `play:${args.handIndex}:${args.pick}:${args.coord.q},${args.coord.r}`;
		}
		case 'rotateTile':
			return `rotate:${a.args.handIndices.join('+')}:${a.args.coord.q},${a.args.coord.r}:${a.args.rotation}`;
		case 'blockTile':
			return `block:${a.args.handIndices.join('+')}:${a.args.coord.q},${a.args.coord.r}`;
		case 'stashToTreasure':
			return `stash:${a.args.handIndex}`;
		case 'takeFromTreasure':
			return `take:${a.args.index}`;
		case 'endTurnAndRefill':
			return 'end';
	}
};

describe('COST_TO_ROTATE', () => {
	it('rotateTile discards COST_TO_ROTATE cards', () => {
		const G = createTestState({
			hands: { '0': [makeCard(['R']), makeCard(['B']), makeCard(['G'])] },
		});
		setTile(G, co(0, 0), ['B'], 0);

		const result = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [1], rotation: 1 } },
			'0'
		);

		expect(result).not.toBeNull();
		// Hand should have 2 cards remaining (was 3, discarded 1)
		expect(result!.hands['0']!.length).toBe(2);
		// Tile rotation should be updated
		expect(result!.board[key(co(0, 0))]!.rotation).toBe(1);
		// Discarded card should be in discard pile
		expect(result!.discard.length).toBe(1);
	});

	it('rotateTile with COST_TO_ROTATE=2 requires 2 cards', () => {
		const rules: Rules = {
			...TEST_RULES,
			PLACEMENT: {
				...TEST_RULES.PLACEMENT,
				COST_TO_ROTATE: 2,
			},
		};
		const G = createTestState({
			rules,
			hands: { '0': [makeCard(['R']), makeCard(['B']), makeCard(['G'])] },
		});
		setTile(G, co(0, 0), ['B'], 0);

		// Should fail with only 1 card
		const failResult = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [1], rotation: 1 } },
			'0'
		);
		expect(failResult).toBeNull();

		// Should succeed with 2 cards
		const successResult = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [0, 1], rotation: 1 } },
			'0'
		);
		expect(successResult).not.toBeNull();
		expect(successResult!.hands['0']!.length).toBe(1);
		expect(successResult!.discard.length).toBe(2);
	});

	it('rotateTile rejects duplicate hand indices', () => {
		const rules: Rules = {
			...TEST_RULES,
			PLACEMENT: {
				...TEST_RULES.PLACEMENT,
				COST_TO_ROTATE: 2,
			},
		};
		const G = createTestState({
			rules,
			hands: { '0': [makeCard(['R']), makeCard(['B']), makeCard(['G'])] },
		});
		setTile(G, co(0, 0), ['B'], 0);

		const result = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [1, 1], rotation: 1 } },
			'0'
		);
		expect(result).toBeNull();
	});

	it('match-color mode: at least one card must match tile color', () => {
		const rules: Rules = {
			...TEST_RULES,
			PLACEMENT: {
				...TEST_RULES.PLACEMENT,
				DISCARD_TO_ROTATE: 'match-color',
				COST_TO_ROTATE: 1,
			},
		};
		const G = createTestState({
			rules,
			hands: { '0': [makeCard(['R']), makeCard(['B'])] },
		});
		setTile(G, co(0, 0), ['B'], 0);

		// R card doesn't match B tile
		const failResult = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [0], rotation: 1 } },
			'0'
		);
		expect(failResult).toBeNull();

		// B card matches B tile
		const successResult = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [1], rotation: 1 } },
			'0'
		);
		expect(successResult).not.toBeNull();
	});

	it('enumerates rotateTile with correct handIndices combinations', () => {
		const G = createTestState({
			hands: { '0': [makeCard(['R']), makeCard(['B'])] },
		});
		setTile(G, co(0, 0), ['B'], 0);

		const actions = enumerateActions(G, '0');
		const rotateActions = actions.filter((a) => a.type === 'rotateTile');

		// With COST_TO_ROTATE=1, each card can rotate: 2 cards x 4 rotations = 8
		expect(rotateActions.length).toBe(8);

		// Verify handIndices are single-element arrays
		for (const action of rotateActions) {
			if (action.type === 'rotateTile') {
				expect(action.args.handIndices.length).toBe(1);
			}
		}
	});
});

describe('COST_TO_BLOCK', () => {
	it('blockTile marks an empty tile as dead', () => {
		const G = createTestState({
			hands: { '0': [makeCard(['R']), makeCard(['B']), makeCard(['G'])] },
		});
		setEmptyTile(G, co(1, 0));

		const result = applyMicroAction(
			G,
			{ type: 'blockTile', args: { coord: co(1, 0), handIndices: [0, 1] } },
			'0'
		);

		expect(result).not.toBeNull();
		expect(result!.board[key(co(1, 0))]!.dead).toBe(true);
		// Discarded 2 cards
		expect(result!.hands['0']!.length).toBe(1);
		expect(result!.discard.length).toBe(2);
	});

	it('blockTile rejects when not enough cards', () => {
		const G = createTestState({
			hands: { '0': [makeCard(['R'])] },
		});
		setEmptyTile(G, co(1, 0));

		// Only 1 card, need 2
		const result = applyMicroAction(
			G,
			{ type: 'blockTile', args: { coord: co(1, 0), handIndices: [0] } },
			'0'
		);
		expect(result).toBeNull();
	});

	it('blockTile rejects occupied tiles', () => {
		const G = createTestState({
			hands: { '0': [makeCard(['R']), makeCard(['B'])] },
		});
		setTile(G, co(1, 0), ['B'], 0);

		const result = applyMicroAction(
			G,
			{ type: 'blockTile', args: { coord: co(1, 0), handIndices: [0, 1] } },
			'0'
		);
		expect(result).toBeNull();
	});

	it('blockTile rejects origin tiles', () => {
		const G = createTestState({
			hands: { '0': [makeCard(['R']), makeCard(['B'])] },
			origins: [co(0, 0)],
		});
		setEmptyTile(G, co(0, 0));

		const result = applyMicroAction(
			G,
			{ type: 'blockTile', args: { coord: co(0, 0), handIndices: [0, 1] } },
			'0'
		);
		expect(result).toBeNull();
	});

	it('blockTile rejects already dead tiles', () => {
		const G = createTestState({
			hands: { '0': [makeCard(['R']), makeCard(['B'])] },
		});
		G.board[key(co(1, 0))] = { colors: [], rotation: 0, dead: true };

		const result = applyMicroAction(
			G,
			{ type: 'blockTile', args: { coord: co(1, 0), handIndices: [0, 1] } },
			'0'
		);
		expect(result).toBeNull();
	});

	it('blockTile rejects duplicate hand indices', () => {
		const G = createTestState({
			hands: { '0': [makeCard(['R']), makeCard(['B'])] },
		});
		setEmptyTile(G, co(1, 0));

		const result = applyMicroAction(
			G,
			{ type: 'blockTile', args: { coord: co(1, 0), handIndices: [0, 0] } },
			'0'
		);
		expect(result).toBeNull();
	});

	it('blockTile disabled when COST_TO_BLOCK=0', () => {
		const rules: Rules = {
			...TEST_RULES,
			PLACEMENT: { ...TEST_RULES.PLACEMENT, COST_TO_BLOCK: 0 },
		};
		const G = createTestState({
			rules,
			hands: { '0': [makeCard(['R']), makeCard(['B'])] },
		});
		setEmptyTile(G, co(1, 0));

		const actions = enumerateActions(G, '0');
		const blockActions = actions.filter((a) => a.type === 'blockTile');
		expect(blockActions.length).toBe(0);
	});

	it('enumerates blockTile with all valid hand index combinations', () => {
		const G = createTestState({
			hands: { '0': [makeCard(['R']), makeCard(['B']), makeCard(['G'])] },
		});
		// Set several empty non-origin tiles
		setEmptyTile(G, co(1, 0));
		setEmptyTile(G, co(0, 1));

		const actions = enumerateActions(G, '0');
		const blockActions = actions.filter((a) => a.type === 'blockTile');

		// 3 cards choose 2 = 3 combinations, x 2 empty non-origin tiles = 6 block actions
		expect(blockActions.length).toBe(6);
	});
});

describe('cost constants are accessible from rules', () => {
	it('COST_TO_BLOCK defaults to 2', () => {
		expect(TEST_RULES.PLACEMENT.COST_TO_BLOCK).toBe(2);
	});

	it('COST_TO_ROTATE defaults to 1', () => {
		expect(TEST_RULES.PLACEMENT.COST_TO_ROTATE).toBe(1);
	});
});
