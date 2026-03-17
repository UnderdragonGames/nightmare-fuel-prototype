import { describe, it, expect } from 'vitest';
import { canPlacePath, key } from '../game/helpers';
import { initActionState } from '../game/effects';
import type { GState, Rules, Co } from '../game/types';
import { PATH_RULES, buildColorToDir, BASE_EDGE_COLORS } from '../game/rulesConfig';

// Direction mapping (BASE_EDGE_COLORS = YGBVRO -> BASE_DIRECTIONS):
// Y -> N:  (0, -1)
// G -> NE: (1, -1)
// B -> E:  (1,  0)
// V -> SE: (0,  1)
// R -> SW: (-1, 1)
// O -> NW: (-1, 0)

const rulesStartingRing1: Rules = {
	...PATH_RULES,
	RANDOM_CARDINAL_DIRECTIONS: false,
	COLOR_TO_DIR: buildColorToDir(BASE_EDGE_COLORS),
	PLACEMENT: { ...PATH_RULES.PLACEMENT, STARTING_RING: 1 },
};

const rulesStartingRing0: Rules = {
	...PATH_RULES,
	RANDOM_CARDINAL_DIRECTIONS: false,
	COLOR_TO_DIR: buildColorToDir(BASE_EDGE_COLORS),
	PLACEMENT: { ...PATH_RULES.PLACEMENT, STARTING_RING: 0 },
};

const createTestState = (overrides: Partial<GState> = {}): GState => {
	const rules = overrides.rules ?? rulesStartingRing1;
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
	G.board[key(from)] ??= { colors: [], rotation: 0, dead: false };
	G.board[key(to)] ??= { colors: [], rotation: 0, dead: false };
};

describe('STARTING_RING rule', () => {
	describe('STARTING_RING=1: blocks new branches from ring 0', () => {
		it('rejects new branch from origin (ring 0) to ring 1', () => {
			const G = createTestState({ rules: rulesStartingRing1 });
			// B direction: (1, 0), so origin (0,0) -> (1,0) is a new branch from ring 0
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B', rulesStartingRing1)).toBe(false);
		});

		it('rejects all color directions from origin when no existing edges', () => {
			const G = createTestState({ rules: rulesStartingRing1 });
			// All 6 directions from origin should be blocked
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 0, r: -1 }, 'Y', rulesStartingRing1)).toBe(false);
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 1, r: -1 }, 'G', rulesStartingRing1)).toBe(false);
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B', rulesStartingRing1)).toBe(false);
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 0, r: 1 }, 'V', rulesStartingRing1)).toBe(false);
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: -1, r: 1 }, 'R', rulesStartingRing1)).toBe(false);
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: -1, r: 0 }, 'O', rulesStartingRing1)).toBe(false);
		});
	});

	describe('STARTING_RING=1: allows stacking on existing edges from ring 0', () => {
		it('allows stacking same color on existing directed edge from origin', () => {
			const G = createTestState({ rules: rulesStartingRing1 });
			addLane(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B');
			// Stacking B on existing edge (0,0)->(1,0) should be allowed
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B', rulesStartingRing1)).toBe(true);
		});

		it('allows stacking a different color on existing edge (new branch from ring 1 outward still works)', () => {
			const G = createTestState({ rules: rulesStartingRing1 });
			addLane(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B');
			// From ring 1, new branches are allowed
			// G direction: (1, -1), so (1,0) -> (2,-1) is from ring 1 outward
			expect(canPlacePath(G, { q: 1, r: 0 }, { q: 2, r: -1 }, 'G', rulesStartingRing1)).toBe(true);
		});
	});

	describe('STARTING_RING=1: allows branching from ring 1+', () => {
		it('allows new branch from ring 1 node', () => {
			const G = createTestState({ rules: rulesStartingRing1 });
			// Set up a path from origin to ring 1 (existing edge)
			addLane(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B');
			// B direction from (1,0): (1,0) -> (2,0) = ring 2 outward
			expect(canPlacePath(G, { q: 1, r: 0 }, { q: 2, r: 0 }, 'B', rulesStartingRing1)).toBe(true);
		});

		it('allows new branch from ring 2 node', () => {
			const G = createTestState({ rules: rulesStartingRing1 });
			addLane(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B');
			addLane(G, { q: 1, r: 0 }, { q: 2, r: 0 }, 'B');
			// B direction from (2,0): (2,0) -> (3,0) = ring 3 outward
			expect(canPlacePath(G, { q: 2, r: 0 }, { q: 3, r: 0 }, 'B', rulesStartingRing1)).toBe(true);
		});
	});

	describe('STARTING_RING=0: allows everything (legacy behavior)', () => {
		it('allows new branch from origin (ring 0)', () => {
			const G = createTestState({ rules: rulesStartingRing0 });
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B', rulesStartingRing0)).toBe(true);
		});

		it('allows all directions from origin', () => {
			const G = createTestState({ rules: rulesStartingRing0 });
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 0, r: -1 }, 'Y', rulesStartingRing0)).toBe(true);
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 1, r: -1 }, 'G', rulesStartingRing0)).toBe(true);
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B', rulesStartingRing0)).toBe(true);
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 0, r: 1 }, 'V', rulesStartingRing0)).toBe(true);
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: -1, r: 1 }, 'R', rulesStartingRing0)).toBe(true);
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: -1, r: 0 }, 'O', rulesStartingRing0)).toBe(true);
		});
	});

	describe('STARTING_RING=1: consolidation moves to ring 0 still work', () => {
		it('allows consolidation recolor on existing edge at ring 0', () => {
			// Build a path to the rim with one color, then consolidation-recolor an
			// existing edge at ring 0. The edge already exists so STARTING_RING should not block.
			const rules: Rules = {
				...rulesStartingRing1,
				PLACEMENT: { ...rulesStartingRing1.PLACEMENT, CONSOLIDATION: true },
			};
			const G = createTestState({ rules });
			// Build path: (0,0)->(1,0) B, (1,0)->(2,0) B, ... to rim at (5,0)
			addLane(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B');
			addLane(G, { q: 1, r: 0 }, { q: 2, r: 0 }, 'B');
			addLane(G, { q: 2, r: 0 }, { q: 3, r: 0 }, 'B');
			addLane(G, { q: 3, r: 0 }, { q: 4, r: 0 }, 'B');
			addLane(G, { q: 4, r: 0 }, { q: 5, r: 0 }, 'B');
			// B is now rim-connected. Consolidation recolor of existing edge (0,0)->(1,0) with B
			// (stacking same color on existing edge)
			expect(canPlacePath(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B', rules)).toBe(true);
		});
	});
});
