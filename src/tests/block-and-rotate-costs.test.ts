import { describe, it, expect } from 'vitest';
import { enumerateActions, applyMicroAction } from '../game/ai';
import type { Co, GState, Rules } from '../game/types';
import { HEX_RULES, PATH_RULES, buildColorToDir, BASE_EDGE_COLORS } from '../game/rulesConfig';
import { key, buildAllCoords } from '../game/helpers';
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

describe('path-mode rotateTile', () => {
	const PATH_TEST_RULES: Rules = {
		...PATH_RULES,
		RADIUS: 3,
		RANDOM_CARDINAL_DIRECTIONS: false,
		COLOR_TO_DIR: buildColorToDir(BASE_EDGE_COLORS),
		PLACEMENT: {
			...PATH_RULES.PLACEMENT,
			DISCARD_TO_ROTATE: 'any',
			COST_TO_ROTATE: 1,
		},
	};

	const pathState = (overrides: Partial<GState> = {}): GState => {
		const rules = overrides.rules ?? PATH_TEST_RULES;
		// Initialize full board so all coords exist (path mode requires board tiles)
		const board: Record<string, { colors: []; rotation: 0; dead: false }> = {};
		for (const c of buildAllCoords(rules.RADIUS)) {
			board[key(c)] = { colors: [], rotation: 0, dead: false };
		}
		return createTestState({ rules, board, ...overrides });
	};

	// With BASE_EDGE_COLORS = YGBVRO → N,NE,E,SE,SW,NW
	// Y→N(0,-1), G→NE(1,-1), B→E(1,0), V→SE(0,1), R→SW(-1,1), O→NW(-1,0)

	it('rotates outgoing lanes 60° CW and remaps colors', () => {
		const G = pathState({
			hands: { '0': [makeCard(['R']), makeCard(['B'])] },
			lanes: [
				{ from: co(0, 0), to: co(0, -1), color: 'Y' }, // N → should become NE (G)
			],
		});
		// Need tiles on board for both old and new destinations
		setEmptyTile(G, co(0, -1));
		setEmptyTile(G, co(1, -1));

		const result = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [0], rotation: 1 } },
			'0'
		);

		expect(result).not.toBeNull();
		expect(result!.lanes.length).toBe(1);
		// Lane should now point NE with color G
		expect(result!.lanes[0]!.to).toEqual(co(1, -1));
		expect(result!.lanes[0]!.color).toBe('G');
		// Card discarded
		expect(result!.hands['0']!.length).toBe(1);
		expect(result!.discard.length).toBe(1);
	});

	it('rotates multiple outgoing lanes together', () => {
		const G = pathState({
			hands: { '0': [makeCard(['R'])] },
			lanes: [
				{ from: co(0, 0), to: co(0, -1), color: 'Y' },  // N
				{ from: co(0, 0), to: co(1, 0), color: 'B' },   // E
			],
		});
		setEmptyTile(G, co(0, -1));
		setEmptyTile(G, co(1, -1));
		setEmptyTile(G, co(1, 0));
		setEmptyTile(G, co(0, 1));

		// 60° CW: N→NE, E→SE
		const result = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [0], rotation: 1 } },
			'0'
		);

		expect(result).not.toBeNull();
		expect(result!.lanes.length).toBe(2);
		// Find the two lanes
		const laneNE = result!.lanes.find(l => l.to.q === 1 && l.to.r === -1);
		const laneSE = result!.lanes.find(l => l.to.q === 0 && l.to.r === 1);
		expect(laneNE).toBeDefined();
		expect(laneNE!.color).toBe('G'); // NE = G
		expect(laneSE).toBeDefined();
		expect(laneSE!.color).toBe('V'); // SE = V
	});

	it('does not rotate incoming lanes', () => {
		const G = pathState({
			hands: { '0': [makeCard(['R'])] },
			lanes: [
				{ from: co(0, 0), to: co(1, 0), color: 'B' },   // outgoing E from origin
				{ from: co(1, 0), to: co(0, 0), color: 'O' },   // incoming from (1,0) — should stay
			],
		});
		setEmptyTile(G, co(1, 0));
		setEmptyTile(G, co(0, 1));

		// Rotate origin 60° CW: outgoing E→SE
		const result = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [0], rotation: 1 } },
			'0'
		);

		expect(result).not.toBeNull();
		// Incoming lane should be unchanged
		const incoming = result!.lanes.find(l => l.from.q === 1 && l.from.r === 0 && l.to.q === 0 && l.to.r === 0);
		expect(incoming).toBeDefined();
		expect(incoming!.color).toBe('O'); // unchanged
	});

	it('rejects rotation when destination would be off-board', () => {
		const G = pathState({
			hands: { '0': [makeCard(['R'])] },
			lanes: [
				// Lane pointing to rim edge — rotating further could go off-board
				{ from: co(0, -2), to: co(0, -3), color: 'Y' }, // N from ring 2 to ring 3 (rim)
			],
		});
		setEmptyTile(G, co(0, -2));
		setEmptyTile(G, co(0, -3));
		// (1, -3) is at ring 3 = rim, should exist
		setEmptyTile(G, co(1, -3));

		// 60° CW: N(0,-3) → NE(1,-3) — on board if radius=3
		const result = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, -2), handIndices: [0], rotation: 1 } },
			'0'
		);
		// (1,-3) is at ring 3, radius is 3, so it's valid
		expect(result).not.toBeNull();
	});

	it('rejects rotation when destination is a dead tile', () => {
		const G = pathState({
			hands: { '0': [makeCard(['R'])] },
			lanes: [
				{ from: co(0, 0), to: co(0, -1), color: 'Y' }, // N
			],
		});
		setEmptyTile(G, co(0, -1));
		G.board[key(co(1, -1))] = { colors: [], rotation: 0, dead: true }; // NE is dead

		// 60° CW: N→NE, but NE is dead
		const result = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [0], rotation: 1 } },
			'0'
		);
		expect(result).toBeNull();
	});

	it('rejects rotation when destination is an origin', () => {
		const G = pathState({
			hands: { '0': [makeCard(['R'])] },
			origins: [co(0, 0), co(1, -1)], // two origins
			lanes: [
				{ from: co(0, 0), to: co(0, -1), color: 'Y' }, // N
			],
		});
		setEmptyTile(G, co(0, -1));
		setEmptyTile(G, co(1, -1));

		// 60° CW: N→NE(1,-1), but that's an origin
		const result = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [0], rotation: 1 } },
			'0'
		);
		expect(result).toBeNull();
	});

	it('rejects rotation when node has no outgoing lanes', () => {
		const G = pathState({
			hands: { '0': [makeCard(['R'])] },
			lanes: [
				{ from: co(1, 0), to: co(0, 0), color: 'O' }, // incoming only
			],
		});
		setEmptyTile(G, co(1, 0));

		const result = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [0], rotation: 1 } },
			'0'
		);
		expect(result).toBeNull();
	});

	it('120° CW rotation works correctly', () => {
		const G = pathState({
			hands: { '0': [makeCard(['R'])] },
			lanes: [
				{ from: co(0, 0), to: co(0, -1), color: 'Y' }, // N
			],
		});
		setEmptyTile(G, co(0, -1));
		setEmptyTile(G, co(1, 0)); // E

		// 120° CW (rot=2): N→E
		const result = applyMicroAction(
			G,
			{ type: 'rotateTile', args: { coord: co(0, 0), handIndices: [0], rotation: 2 } },
			'0'
		);

		expect(result).not.toBeNull();
		expect(result!.lanes[0]!.to).toEqual(co(1, 0));
		expect(result!.lanes[0]!.color).toBe('B'); // E = B
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
