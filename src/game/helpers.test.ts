import { describe, it, expect } from 'vitest';
import { canPlacePath, key } from './helpers';
import { initActionState } from './effects';
import type { GState, Rules, Co } from './types';
import { PATH_RULES, buildColorToDir, BASE_EDGE_COLORS } from './rulesConfig';

const TEST_RULES: Rules = {
	...PATH_RULES,
	RANDOM_CARDINAL_DIRECTIONS: false,
	COLOR_TO_DIR: buildColorToDir(BASE_EDGE_COLORS),
	PLACEMENT: { ...PATH_RULES.PLACEMENT, STARTING_RING: 0 },
};

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

const addLane = (G: GState, from: Co, to: Co, color: 'R' | 'O' | 'Y' | 'G' | 'B' | 'V'): void => {
	G.lanes.push({ from, to, color });
	// keep board nodes present for UI parity (not required for rules)
	G.board[key(from)] ??= { colors: [], rotation: 0, dead: false };
	G.board[key(to)] ??= { colors: [], rotation: 0, dead: false };
};

describe('Path mode: basic connectivity', () => {
	it('allows first placement from origin to adjacent node', () => {
		const G = createTestState();
		expect(canPlacePath(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B', TEST_RULES)).toBe(true);
	});

	it('rejects off-direction placement for a color', () => {
		const G = createTestState();
		// B is (+1,0) under TEST_RULES; (0,1) is NOT in that direction from origin.
		expect(canPlacePath(G, { q: 0, r: 0 }, { q: 0, r: 1 }, 'B', TEST_RULES)).toBe(false);
	});

	it('rejects placement from disconnected non-origin source', () => {
		const G = createTestState();
		expect(canPlacePath(G, { q: 2, r: 0 }, { q: 3, r: 0 }, 'B', TEST_RULES)).toBe(false);
	});
});

describe('Path mode: NO_INTERSECT (incoming lanes share same source)', () => {
	const rulesNoIntersect: Rules = { ...TEST_RULES, PLACEMENT: { ...TEST_RULES.PLACEMENT, NO_INTERSECT: true, FORK_SUPPORT: false } };

	it('blocks a second incoming source to same destination', () => {
		const G = createTestState({ rules: rulesNoIntersect });
		// Existing incoming to (1,0) from origin
		addLane(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'O');
		// Try incoming to (1,0) from (1,-1) (also connected via origin)
		addLane(G, { q: 0, r: 0 }, { q: 1, r: -1 }, 'O');
		expect(canPlacePath(G, { q: 1, r: -1 }, { q: 1, r: 0 }, 'O', rulesNoIntersect)).toBe(false);
	});
});

describe('Path mode: NO_BUILD_FROM_RIM', () => {
	const rulesNoRimBuild: Rules = { ...TEST_RULES, PLACEMENT: { ...TEST_RULES.PLACEMENT, NO_BUILD_FROM_RIM: true, FORK_SUPPORT: false } };

	it('blocks building from rim node', () => {
		const G = createTestState({ rules: rulesNoRimBuild });
		// Build a chain to a rim-ish source at (5,0) (radius=5)
		addLane(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B');
		addLane(G, { q: 1, r: 0 }, { q: 2, r: 0 }, 'B');
		addLane(G, { q: 2, r: 0 }, { q: 3, r: 0 }, 'B');
		addLane(G, { q: 3, r: 0 }, { q: 4, r: 0 }, 'B');
		addLane(G, { q: 4, r: 0 }, { q: 5, r: 0 }, 'B');

		expect(canPlacePath(G, { q: 5, r: 0 }, { q: 5, r: -1 }, 'V', rulesNoRimBuild)).toBe(false);
	});
});

describe('Path mode: CONSOLIDATION gates recoloring an existing edge', () => {
	const rulesNoConsolidation: Rules = { ...TEST_RULES, PLACEMENT: { ...TEST_RULES.PLACEMENT, CONSOLIDATION: false, FORK_SUPPORT: false } };
	const rulesWithConsolidation: Rules = { ...rulesNoConsolidation, PLACEMENT: { ...rulesNoConsolidation.PLACEMENT, CONSOLIDATION: true } };

	it('blocks adding a new color to an existing edge before rim-connected; allows after rim-connected for that color', () => {
		// Build a multi-color path to the rim, with final lane color V touching rim.
		const base = createTestState({ rules: rulesWithConsolidation });
		addLane(base, { q: 0, r: 0 }, { q: 1, r: 0 }, 'O');
		addLane(base, { q: 1, r: 0 }, { q: 2, r: 0 }, 'Y');
		addLane(base, { q: 2, r: 0 }, { q: 3, r: 0 }, 'G');
		addLane(base, { q: 3, r: 0 }, { q: 4, r: 0 }, 'B');
		addLane(base, { q: 4, r: 0 }, { q: 5, r: 0 }, 'V'); // touches rim (radius 5)

		// Existing edge (4,0)->(5,0) already exists and is V already; propagate V one step inward by recoloring an existing edge.
		// NOTE: This is an off-direction move for V in general, so it should only be allowed via consolidation.
		// First, ensure we have V incident at (4,0)/(5,0), then recolor the adjacent existing edge (3,0)->(4,0).
		expect(canPlacePath(base, { q: 3, r: 0 }, { q: 4, r: 0 }, 'V', rulesWithConsolidation)).toBe(true);

		// Without consolidation enabled, recoloring an existing edge is blocked.
		const noCon = createTestState({ rules: rulesNoConsolidation, lanes: base.lanes, board: base.board });
		expect(canPlacePath(noCon, { q: 3, r: 0 }, { q: 4, r: 0 }, 'V', rulesNoConsolidation)).toBe(false);

		// A different color that is NOT rim-connected cannot recolor that edge even with consolidation.
		expect(canPlacePath(base, { q: 3, r: 0 }, { q: 4, r: 0 }, 'R', rulesWithConsolidation)).toBe(false);
	});

	it('allows backtracking recolor from the join node (even though NO_INTERSECT would block it)', () => {
		// Shape: ... R, R, V at the end, and we "backtrack" V onto the last R edge from the join node.
		// Nodes: 2 -> 3 (R), 3 -> 4 (R), 4 -> 5 (V, rim). Join node is 4.
		const G = createTestState({ rules: rulesWithConsolidation });
		addLane(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'O');
		addLane(G, { q: 1, r: 0 }, { q: 2, r: 0 }, 'Y');
		addLane(G, { q: 2, r: 0 }, { q: 3, r: 0 }, 'R');
		addLane(G, { q: 3, r: 0 }, { q: 4, r: 0 }, 'R');
		addLane(G, { q: 4, r: 0 }, { q: 5, r: 0 }, 'V'); // rim-touching V

		// Recolor existing undirected edge (3,0)-(4,0) with V, but in the *reverse* direction: 4 -> 3.
		// This is off-direction for V and would also add a second incoming source into (3,0) (violating NO_INTERSECT)
		// unless we treat consolidation recolor as exempt (since it follows an existing edge).
		expect(canPlacePath(G, { q: 4, r: 0 }, { q: 3, r: 0 }, 'V', rulesWithConsolidation)).toBe(true);
	});
});
