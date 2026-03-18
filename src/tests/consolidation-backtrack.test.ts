import { describe, it, expect } from 'vitest';
import { enumerateActions, type Action } from '../game/ai';
import type { GState } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

// Direction mapping (EDGE_COLORS -> BASE_DIRECTIONS):
// Y -> N:  (0, -1)
// G -> NE: (1, -1)
// B -> E:  (1,  0)
// V -> SE: (0,  1)
// R -> SW: (-1, 1)
// O -> NW: (-1, 0)

const rules = {
	...MODE_RULESETS.path,
	RADIUS: 3,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
	PLACEMENT: { ...MODE_RULESETS.path.PLACEMENT, STARTING_RING: 0 },
};

// Board state with 3 complete paths from origin to rim and a consolidation backtrack lane.
//
// Path 1 (Y, north):  (0,0)==>(0,-1)->(0,-2)->(0,-3)   [rim]  (doubled first segment)
// Path 2 (B, east):   (0,0)==>(1,0)->(2,0)->(3,0)      [rim]  (doubled first segment)
// Path 3 (V, south):  (0,0)==>(0,1)->(0,2)->(0,3)      [rim]  (doubled first segment)
//
// Consolidation backtrack lane: (0,-1)->(0,0) color B
//   - goes inward (ring 1 -> ring 0)
//   - on the undirected edge {(0,0),(0,-1)} which already has forward lane Y
//   - this is a consolidation recolor (different color on an existing edge)
//
// The backtrack lane must NOT inflate outgoing counts at (0,-1) and thereby
// block normal forward moves from that node.

const G: GState = {
	rules,
	radius: rules.RADIUS,
	board: {},
	lanes: [
		// Path 1: Y (north) from origin to rim - doubled first segment for capacity
		{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' },
		{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' },
		{ from: { q: 0, r: -1 }, to: { q: 0, r: -2 }, color: 'Y' },
		{ from: { q: 0, r: -2 }, to: { q: 0, r: -3 }, color: 'Y' },

		// Path 2: B (east) from origin to rim - doubled first segment for capacity
		{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' },
		{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' },
		{ from: { q: 1, r: 0 }, to: { q: 2, r: 0 }, color: 'B' },
		{ from: { q: 2, r: 0 }, to: { q: 3, r: 0 }, color: 'B' },

		// Path 3: V (south) from origin to rim - doubled first segment for capacity
		{ from: { q: 0, r: 0 }, to: { q: 0, r: 1 }, color: 'V' },
		{ from: { q: 0, r: 0 }, to: { q: 0, r: 1 }, color: 'V' },
		{ from: { q: 0, r: 1 }, to: { q: 0, r: 2 }, color: 'V' },
		{ from: { q: 0, r: 2 }, to: { q: 0, r: 3 }, color: 'V' },

		// Consolidation backtrack lane: B going inward on the Y-path edge
		// (0,-1) ring 1 -> (0,0) ring 0, on edge that has forward lane (0,0)->(0,-1) color Y
		{ from: { q: 0, r: -1 }, to: { q: 0, r: 0 }, color: 'B' },
	],
	deck: [],
	discard: [],
	hands: { '0': [{ colors: ['R', 'O', 'Y', 'G', 'B', 'V'] }] },
	treasure: [],
	prefs: { '0': { primary: 'Y', secondary: 'B', tertiary: 'V' } },
	stats: { placements: 0 },
	meta: { deckExhaustionCycle: null, stashBonus: {} },
	origins: [{ q: 0, r: 0 }],
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

describe('consolidation-backtrack', () => {
	it('matches expected actions', () => {
		const actual = enumerateActions(G, '0').map(actionKey).sort();
		const expected = [
			// Forward moves from intermediate nodes (NOT blocked by backtrack lane)
			"play:0:Y:0,-1->0,-2",
			"play:0:G:0,-1->1,-2",
			"play:0:B:0,-1->1,-1",
			"play:0:R:0,-1->-1,0",
			"play:0:O:0,-1->-1,-1",
			// Forward moves from origin
			"play:0:Y:0,0->0,-1",
			"play:0:G:0,0->1,-1",
			"play:0:B:0,0->1,0",
			"play:0:V:0,0->0,1",
			"play:0:R:0,0->-1,1",
			"play:0:O:0,0->-1,0",
			// Forward moves from other intermediate nodes
			"play:0:B:1,0->2,0",
			"play:0:G:1,0->2,-1",
			"play:0:Y:1,0->1,-1",
			"play:0:V:1,0->1,1",
			"play:0:V:0,1->0,2",
			"play:0:B:0,1->1,1",
			"play:0:R:0,1->-1,2",
			"play:0:O:0,1->-1,1",
			// Non-play actions
			"stash:0",
			"end",
		];
		expect(actual).toEqual([...expected].sort());
		// The backtrack lane must not block forward moves from (0,-1)
		const forbidden: string[] = [
			// If backtrack inflated outgoing count, these would be missing - ensure they are NOT forbidden
		];
		for (const key of forbidden) expect(actual).not.toContain(key);
	});

	it('forward moves from node with backtrack lane are not blocked', () => {
		const actual = enumerateActions(G, '0').map(actionKey).sort();
		const playActions = actual.filter((k) => k.startsWith('play:'));

		// Node (0,-1) has a consolidation backtrack lane going inward (0,-1)->(0,0).
		// It should still allow normal forward moves from (0,-1) outward.
		const movesFromBacktrackNode = playActions.filter((k) => k.includes('0,-1->'));
		expect(movesFromBacktrackNode.length).toBeGreaterThan(0);

		// Specifically, stacking Y on (0,-1)->(0,-2) must be available
		expect(actual).toContain('play:0:Y:0,-1->0,-2');

		// Branching from (0,-1) to other directions should also be available
		expect(actual).toContain('play:0:G:0,-1->1,-2');
		expect(actual).toContain('play:0:B:0,-1->1,-1');
	});

	it('total playCard count is not drastically reduced by backtrack lane', () => {
		const actual = enumerateActions(G, '0').map(actionKey).sort();
		const playActions = actual.filter((k) => k.startsWith('play:'));

		// With 3 full paths, 6-color hand, doubled first segments, and consolidation enabled,
		// the backtrack lane should not drastically reduce options.
		expect(playActions.length).toBeGreaterThanOrEqual(10);
	});
});
