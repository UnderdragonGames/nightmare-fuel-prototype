import { describe, it, expect } from 'vitest';
import { canPlace, key } from './helpers';
import type { GState, Rules } from './types';
import { PATH_RULES, buildColorToDir, BASE_EDGE_COLORS } from './rulesConfig';

/**
 * FORK SUPPORT INVARIANT - Mathematical Contract
 * ===============================================
 *
 * Graph Model:
 *   - Each tile at position P with color C creates a directed edge: (P - dir(C)) → P
 *   - Origins are source nodes with infinite supply
 *
 * The Invariant (Support-Based Branching):
 *   For every non-origin node N: OUT(N) ≤ IN(N) + allowedExtra(IN(N))
 *
 *   Where:
 *     IN(N)  = count of edges (X → N)
 *     OUT(N) = count of edges (N → Y)
 *     allowedExtra(n) = min(n - 1, 2)
 *
 * Branching by support level:
 *   - Single (IN=1): 0 extra branches → OUT ≤ 1 (no branching)
 *   - Double (IN=2): 1 extra branch  → OUT ≤ 3 (can branch once per node)
 *   - Triple (IN=3): 2 extra branches → OUT ≤ 5 (max branching: 2 per node)
 *
 * In plain English: Support indicates how many branches can spawn at a node.
 */

// Fixed color mapping for deterministic tests
// With BASE_EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] and BASE_DIRECTIONS:
// Y → { q: 0, r: -1 }  (North)   - edge comes FROM south
// G → { q: +1, r: -1 } (NE)      - edge comes FROM SW
// B → { q: +1, r: 0 }  (East)    - edge comes FROM west
// V → { q: 0, r: +1 }  (South)   - edge comes FROM north
// R → { q: -1, r: +1 } (SW)      - edge comes FROM NE
// O → { q: -1, r: 0 }  (West)    - edge comes FROM east
const TEST_RULES: Rules = {
	...PATH_RULES,
	RANDOM_CARDINAL_DIRECTIONS: false,
	COLOR_TO_DIR: buildColorToDir(BASE_EDGE_COLORS),
};

// Helper to create a minimal game state for testing
const createTestState = (overrides: Partial<GState> = {}): GState => {
	const rules = overrides.rules ?? TEST_RULES;
	return {
		rules,
		radius: rules.RADIUS,
		board: {},
		deck: [],
		discard: [],
		hands: {},
		treasure: [],
		prefs: {},
		stats: { placements: 0 },
		meta: { deckExhaustionCycle: null, stashBonus: {} },
		origins: [{ q: 0, r: 0 }], // Default: single origin at center
		...overrides,
	};
};

describe('Mathematical Contract: Connectivity', () => {
	it('first placement must be adjacent to origin', () => {
		const G = createTestState();
		// B creates edge (0,0) → (1,0), which is adjacent to origin at (0,0)
		expect(canPlace(G, { q: 1, r: 0 }, 'B', TEST_RULES)).toBe(true);
	});

	it('rejects placement not adjacent to origin or existing tile', () => {
		const G = createTestState();
		// (2,0) is not adjacent to origin at (0,0)
		expect(canPlace(G, { q: 2, r: 0 }, 'B', TEST_RULES)).toBe(false);
	});

	it('allows chaining from existing tiles', () => {
		const G = createTestState();
		G.board[key({ q: 1, r: 0 })] = { colors: ['B'], rotation: 0 };
		// (2,0) is adjacent to existing tile at (1,0)
		expect(canPlace(G, { q: 2, r: 0 }, 'B', TEST_RULES)).toBe(true);
	});
});

describe('Mathematical Contract: Fork Support Invariant', () => {
	/**
	 * The invariant: OUT(N) ≤ IN(N) + min(IN(N) - 1, 2) for all non-origin nodes N
	 */

	it('allows single path (IN=1, OUT=0 at endpoint)', () => {
		const G = createTestState();
		// Place B at (1,0): creates edge (0,0) → (1,0)
		// Node (1,0): IN=1 (from origin), OUT=0
		// Invariant: 0 ≤ 1 ✓
		expect(canPlace(G, { q: 1, r: 0 }, 'B', TEST_RULES)).toBe(true);
	});

	it('allows extending path (IN=1, OUT=1 at intermediate node)', () => {
		const G = createTestState();
		// Existing: B at (1,0) creates edge (0,0) → (1,0)
		G.board[key({ q: 1, r: 0 })] = { colors: ['B'], rotation: 0 };

		// Place B at (2,0): creates edge (1,0) → (2,0)
		// Node (1,0): IN=1 (from origin), OUT=1 (to (2,0))
		// Invariant: 1 ≤ 1 ✓
		expect(canPlace(G, { q: 2, r: 0 }, 'B', TEST_RULES)).toBe(true);
	});

	it('BLOCKS unsupported fork (IN=1, OUT=2)', () => {
		const G = createTestState();
		// Setup: path from origin through (1,0) to (2,0)
		// B at (1,0): edge (0,0) → (1,0)
		// B at (2,0): edge (1,0) → (2,0)
		G.board[key({ q: 1, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 2, r: 0 })] = { colors: ['B'], rotation: 0 };

		// Try to add G at (2,-1): creates edge (1,0) → (2,-1)
		// This would make node (1,0): IN=1, OUT=2
		// Invariant: 2 ≤ 1 ✗ BLOCKED
		expect(canPlace(G, { q: 2, r: -1 }, 'G', TEST_RULES)).toBe(false);
	});

	it('ALLOWS supported fork (IN=2, OUT=2)', () => {
		const G = createTestState();
		// Build two paths to (1,0):
		// Path 1: B at (1,0) creates edge (0,0) → (1,0)
		// Path 2: V at (0,1) creates edge (0,0) → (0,1), then G at (1,0) creates edge (0,1) → (1,0)
		//
		// Wait, G at (1,0) creates edge (1,0) - dir(G) → (1,0)
		// dir(G) = (+1, -1), so edge comes from (0, 1) → (1,0)
		// But (0,1) needs to be reachable from origin first

		// Actually let's think about this more carefully:
		// To have IN=2 at (1,0), we need two edges pointing TO (1,0)
		// Edge 1: B at (1,0) creates (0,0) → (1,0)
		// Edge 2: Need another tile whose edge points to (1,0)
		//
		// G points NE (+1,-1), so G at position P creates edge (P.q-1, P.r+1) → P
		// For edge to point to (1,0), we need G at (1,0) which creates edge (0,1) → (1,0)

		// Setup: two paths to (1,0)
		G.board[key({ q: 1, r: 0 })] = { colors: ['B', 'G'], rotation: 0 };
		// B at (1,0): edge (0,0) → (1,0)
		// G at (1,0): edge (0,1) → (1,0)
		//
		// But wait, (0,1) isn't connected to origin! The edge graph doesn't require
		// intermediate nodes to be connected - it just counts edges.

		// For the invariant to work properly, we need (0,1) to also be reachable.
		// Let's add V at (0,1): edge (0,0) → (0,1)
		G.board[key({ q: 0, r: 1 })] = { colors: ['V'], rotation: 0 };

		// First branch: B at (2,0) creates edge (1,0) → (2,0)
		G.board[key({ q: 2, r: 0 })] = { colors: ['B'], rotation: 0 };

		// Now (1,0) has: IN=2 (from (0,0) via B, from (0,1) via G), OUT=1 (to (2,0))
		// Adding second branch: G at (2,-1) creates edge (1,0) → (2,-1)
		// Would make (1,0): IN=2, OUT=2
		// Invariant: 2 ≤ 2 ✓
		expect(canPlace(G, { q: 2, r: -1 }, 'G', TEST_RULES)).toBe(true);
	});

	it('ALLOWS triple fork with double support (IN=2, OUT=3)', () => {
		const G = createTestState();
		// Setup: two paths to (1,0), two branches already out
		G.board[key({ q: 1, r: 0 })] = { colors: ['B', 'G'], rotation: 0 };
		G.board[key({ q: 0, r: 1 })] = { colors: ['V'], rotation: 0 };
		G.board[key({ q: 2, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 2, r: -1 })] = { colors: ['G'], rotation: 0 };

		// (1,0) now has: IN=2, OUT=2
		// Try to add third branch: Y at (1,-1) creates edge (1,0) → (1,-1)
		// Would make (1,0): IN=2, OUT=3
		// New rule: IN=2 → allowedExtra=1 → maxOUT=3
		// Invariant: 3 ≤ 3 ✓ ALLOWED
		expect(canPlace(G, { q: 1, r: -1 }, 'Y', TEST_RULES)).toBe(true);
	});

	it('BLOCKS quad fork with double support (IN=2, OUT=4)', () => {
		const G = createTestState();
		// Setup: two paths to (1,0), three branches already out
		G.board[key({ q: 1, r: 0 })] = { colors: ['B', 'G'], rotation: 0 };
		G.board[key({ q: 0, r: 1 })] = { colors: ['V'], rotation: 0 };
		G.board[key({ q: 2, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 2, r: -1 })] = { colors: ['G'], rotation: 0 };
		G.board[key({ q: 1, r: -1 })] = { colors: ['Y'], rotation: 0 };

		// (1,0) now has: IN=2, OUT=3
		// Try to add fourth branch: R at (0,1) would need source at (1,0)
		// R points SW (-1,+1), so R at (0,1) creates edge (1,0) → (0,1)
		// But (0,1) already has V! Let's try V at (1,1)
		// V points S (0,+1), so V at (1,1) creates edge (1,0) → (1,1)
		// Would make (1,0): IN=2, OUT=4
		// New rule: IN=2 → allowedExtra=1 → maxOUT=3
		// Invariant: 4 ≤ 3 ✗ BLOCKED
		expect(canPlace(G, { q: 1, r: 1 }, 'V', TEST_RULES)).toBe(false);
	});
});

describe('Mathematical Contract: Edge Direction', () => {
	/**
	 * Edge direction is determined by color:
	 * A tile at position P with color C creates edge: (P - dir(C)) → P
	 */

	it('B (East) at (1,0) creates edge (0,0) → (1,0)', () => {
		const G = createTestState();
		// B points East (+1,0), so edge comes from West
		// Tile at (1,0) with B: edge from (1,0)-(+1,0) = (0,0) to (1,0)
		expect(canPlace(G, { q: 1, r: 0 }, 'B', TEST_RULES)).toBe(true);
	});

	it('O (West) at (-1,0) creates edge (0,0) → (-1,0)', () => {
		const G = createTestState();
		// O points West (-1,0), so edge comes from East
		// Tile at (-1,0) with O: edge from (-1,0)-(-1,0) = (0,0) to (-1,0)
		expect(canPlace(G, { q: -1, r: 0 }, 'O', TEST_RULES)).toBe(true);
	});

	it('V (South) at (0,1) creates edge (0,0) → (0,1)', () => {
		const G = createTestState();
		// V points South (0,+1), so edge comes from North
		// Tile at (0,1) with V: edge from (0,1)-(0,+1) = (0,0) to (0,1)
		expect(canPlace(G, { q: 0, r: 1 }, 'V', TEST_RULES)).toBe(true);
	});

	it('Y (North) at (0,-1) creates edge (0,0) → (0,-1)', () => {
		const G = createTestState();
		// Y points North (0,-1), so edge comes from South
		// Tile at (0,-1) with Y: edge from (0,-1)-(0,-1) = (0,0) to (0,-1)
		expect(canPlace(G, { q: 0, r: -1 }, 'Y', TEST_RULES)).toBe(true);
	});
});

describe('Mathematical Contract: Lane Capacity', () => {
	const rulesNoFork: Rules = {
		...TEST_RULES,
		PLACEMENT: { ...TEST_RULES.PLACEMENT, FORK_SUPPORT: false, NO_INTERSECT: false },
	};

	it('rejects when tile at max capacity (3 colors)', () => {
		const G = createTestState({ rules: rulesNoFork });
		G.board[key({ q: 1, r: 0 })] = { colors: ['B', 'G', 'Y'], rotation: 0 };

		// At capacity, any additional color rejected
		expect(canPlace(G, { q: 1, r: 0 }, 'V', rulesNoFork)).toBe(false);
	});
});

describe('Mathematical Contract: No Intersection', () => {
	const rulesWithIntersect: Rules = {
		...TEST_RULES,
		PLACEMENT: { ...TEST_RULES.PLACEMENT, NO_INTERSECT: true, FORK_SUPPORT: false },
	};

	it('allows multiple colors from same source', () => {
		const G = createTestState({ rules: rulesWithIntersect });
		// B at (1,0): edge (0,0) → (1,0)
		G.board[key({ q: 1, r: 0 })] = { colors: ['B'], rotation: 0 };

		// G at (1,0) would create edge (0,1) → (1,0) - DIFFERENT source!
		// But O at (1,0) creates edge (2,0) → (1,0) - also different source
		// We need a color that also comes from (0,0)
		// V points South (0,+1), so V at (0,1) creates edge (0,0) → (0,1)
		// Wait, we need colors pointing TO (1,0) FROM (0,0)
		// B points East (+1,0), so B at (1,0) = edge from (0,0) → (1,0) ✓
		// What other color points from (0,0) to (1,0)? Only B does.
		// Actually for same-source stacking, you'd stack the SAME color multiple times
		// Let's test that
		expect(canPlace(G, { q: 1, r: 0 }, 'B', rulesWithIntersect)).toBe(true);
	});

	it('blocks colors from different sources (intersection)', () => {
		const G = createTestState({ rules: rulesWithIntersect });
		// B at (1,0): edge (0,0) → (1,0)
		G.board[key({ q: 1, r: 0 })] = { colors: ['B'], rotation: 0 };

		// G points NE (+1,-1), so G at (1,0) creates edge (0,1) → (1,0)
		// Source (0,1) ≠ source (0,0) of existing B
		expect(canPlace(G, { q: 1, r: 0 }, 'G', rulesWithIntersect)).toBe(false);
	});
});

describe('Mathematical Contract: No Build From Rim', () => {
	const rulesNoRimBuild: Rules = {
		...TEST_RULES,
		PLACEMENT: { ...TEST_RULES.PLACEMENT, NO_BUILD_FROM_RIM: true, FORK_SUPPORT: false },
	};

	it('allows building from non-rim tiles', () => {
		const G = createTestState({ rules: rulesNoRimBuild });
		// Build path: (0,0) → (1,0) → (2,0)
		G.board[key({ q: 1, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 2, r: 0 })] = { colors: ['B'], rotation: 0 };

		// (2,0) is ring 2, not at rim (radius=4), so can build from it
		expect(canPlace(G, { q: 3, r: 0 }, 'B', rulesNoRimBuild)).toBe(true);
	});

	it('blocks building from rim tiles', () => {
		const G = createTestState({ rules: rulesNoRimBuild });
		// PATH_RULES.RADIUS = 5, so rim is at ring 5
		// Build path to rim: (0,0) → (1,0) → (2,0) → (3,0) → (4,0) → (5,0)
		G.board[key({ q: 1, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 2, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 3, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 4, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 5, r: 0 })] = { colors: ['B'], rotation: 0 };

		// (5,0) is at rim (ring 5 = radius), can't build FROM it
		// Y points N (0,-1), so Y at (5,-1) creates edge (5,0) → (5,-1)
		// Source is (5,0) which is at rim - should be blocked
		expect(canPlace(G, { q: 5, r: -1 }, 'Y', rulesNoRimBuild)).toBe(false);
	});

	it('blocks building with source outside board (color pointing outward from rim)', () => {
		const G = createTestState({ rules: rulesNoRimBuild });
		// PATH_RULES.RADIUS = 5, so rim is at ring 5
		// Build path to rim: (0,0) → (1,0) → (2,0) → (3,0) → (4,0) → (5,0)
		G.board[key({ q: 1, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 2, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 3, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 4, r: 0 })] = { colors: ['B'], rotation: 0 };
		G.board[key({ q: 5, r: 0 })] = { colors: ['B'], rotation: 0 };

		// At rim (5,0), try to place with color pointing OUTWARD (East)
		// O points West (-1,0), so O at (5,0) creates edge (6,0) → (5,0)
		// Source (6,0) is OUTSIDE the board (ring 6 > radius 5)
		// This should also be blocked - can't have edges from outside
		expect(canPlace(G, { q: 5, r: 0 }, 'O', rulesNoRimBuild)).toBe(false);
	});
});
