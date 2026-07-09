import { describe, it, expect } from 'vitest';
import { canPlacePath, canConsolidate, key } from './helpers';
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
		secret: { deck: [] },
		discard: [],
		players: {},
		treasure: [],
		stats: { placements: 0 },
		meta: { deckExhaustionCycle: null },
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

	it('blocks converting an edge before rim-connected; allows conversion after rim-connected for that color', () => {
		// Build a multi-color path to the rim, with final lane color V touching rim.
		const base = createTestState({ rules: rulesWithConsolidation });
		addLane(base, { q: 0, r: 0 }, { q: 1, r: 0 }, 'O');
		addLane(base, { q: 1, r: 0 }, { q: 2, r: 0 }, 'Y');
		addLane(base, { q: 2, r: 0 }, { q: 3, r: 0 }, 'G');
		addLane(base, { q: 3, r: 0 }, { q: 4, r: 0 }, 'B');
		addLane(base, { q: 4, r: 0 }, { q: 5, r: 0 }, 'V'); // touches rim (radius 5)

		// Propagate V one step inward by CONVERTING the adjacent existing B edge (3,0)-(4,0).
		expect(canConsolidate(base, { q: 3, r: 0 }, { q: 4, r: 0 }, 'B', 'V', rulesWithConsolidation)).toBe(true);

		// Placement-based recolor no longer exists: V cannot be PLACED on that edge.
		expect(canPlacePath(base, { q: 3, r: 0 }, { q: 4, r: 0 }, 'V', rulesWithConsolidation)).toBe(false);

		// Without consolidation enabled, conversion is blocked.
		const noCon = createTestState({ rules: rulesNoConsolidation, lanes: base.lanes, board: base.board });
		expect(canConsolidate(noCon, { q: 3, r: 0 }, { q: 4, r: 0 }, 'B', 'V', rulesNoConsolidation)).toBe(false);

		// A color that is NOT rim-connected cannot convert that edge even with consolidation.
		expect(canConsolidate(base, { q: 3, r: 0 }, { q: 4, r: 0 }, 'B', 'R', rulesWithConsolidation)).toBe(false);
	});

	it('conversion works regardless of edge direction and cannot create intersections', () => {
		// Shape: ... R, R, V at the end; V converts the last R edge walking back toward center.
		// Nodes: 2 -> 3 (R), 3 -> 4 (R), 4 -> 5 (V, rim). Join node is 4.
		const G = createTestState({ rules: rulesWithConsolidation });
		addLane(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'O');
		addLane(G, { q: 1, r: 0 }, { q: 2, r: 0 }, 'Y');
		addLane(G, { q: 2, r: 0 }, { q: 3, r: 0 }, 'R');
		addLane(G, { q: 3, r: 0 }, { q: 4, r: 0 }, 'R');
		addLane(G, { q: 4, r: 0 }, { q: 5, r: 0 }, 'V'); // rim-touching V

		// Conversion is undirected: (4,0)-(3,0) and (3,0)-(4,0) are the same edge.
		// Geometry never changes, so NO_INTERSECT is unaffected by design.
		expect(canConsolidate(G, { q: 4, r: 0 }, { q: 3, r: 0 }, 'R', 'V', rulesWithConsolidation)).toBe(true);
		expect(canConsolidate(G, { q: 3, r: 0 }, { q: 4, r: 0 }, 'R', 'V', rulesWithConsolidation)).toBe(true);
	});
});
