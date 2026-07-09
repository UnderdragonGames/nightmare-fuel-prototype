import { describe, it, expect } from 'vitest';
import { canPlacePath, canConsolidate, applyConsolidation, countRimToCenterPaths } from '../game/helpers';
import type { GState, PathLane, Rules } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { initActionState } from '../game/effects';
import { enumerateActions, type Action } from '../game/ai';
import { buildPlayers } from './testHelpers';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

// Direction mapping:
// Y -> N:  (0, -1)
// G -> NE: (1, -1)
// B -> E:  (1,  0)
// V -> SE: (0,  1)
// R -> SW: (-1, 1)
// O -> NW: (-1, 0)

const baseRules = {
	...MODE_RULESETS.path,
	RADIUS: 3,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
};

// Lanes:
// Y path from origin to rim (north): (0,0)->(0,-1)->(0,-2)->(0,-3)
// R chain from rim reaching ring 1: (2,-3)->(1,-2)->(0,-1)
// This means (0,-1) is on R's rim-connected path AND on the Y edge from origin.
// Consolidation of R onto edge (0,-1)->(0,0) should be allowed with CONSOLIDATE_TO_RING=0.
const lanes: PathLane[] = [
	// Y path: origin -> north to rim (doubled first segment for fork support)
	{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' },
	{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' },
	{ from: { q: 0, r: -1 }, to: { q: 0, r: -2 }, color: 'Y' },
	{ from: { q: 0, r: -2 }, to: { q: 0, r: -3 }, color: 'Y' },

	// R chain from rim to ring 1 via (0,-1)
	{ from: { q: 2, r: -3 }, to: { q: 1, r: -2 }, color: 'R' },
	{ from: { q: 1, r: -2 }, to: { q: 0, r: -1 }, color: 'R' },
];

const makeState = (rules: Rules): GState => ({
	rules,
	radius: rules.RADIUS,
	board: {},
	lanes: lanes.map((l) => ({ ...l })),
	secret: { deck: [] },
	discard: [],
	players: buildPlayers({ '0': [{ colors: ['R', 'Y', 'B'], id: 0, name: 'Test', stats: {}, text: null, isAction: false, synergies: [], synergyCount: 0, flags: { needsNewPrint: false, needsDuplicate: false } }] }, { prefs: { primary: 'R', secondary: 'Y', tertiary: 'B' } }),
	treasure: [],
	stats: { placements: 0 },
	meta: { deckExhaustionCycle: null },
	origins: [{ q: 0, r: 0 }],
	action: initActionState(['0']),
});

const actionKey = (a: Action): string => {
	switch (a.type) {
		case 'playCard': {
			const args = a.args;
			if ('source' in args && 'convert' in args && args.convert) {
				return `convert:${args.handIndex}:${args.convert}->${args.pick}:${args.source.q},${args.source.r}->${args.coord.q},${args.coord.r}`;
			}
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

describe('consolidate-to-ring', () => {
	it('CONSOLIDATE_TO_RING=0 allows consolidation moves to reach the origin', () => {
		const rules = { ...baseRules, PLACEMENT: { ...baseRules.PLACEMENT, CONSOLIDATE_TO_RING: 0 } };
		const G = makeState(rules);

		// R can consolidate to the origin by CONVERTING one Y lane on edge (0,-1)-(0,0)
		const allowed = canConsolidate(G, { q: 0, r: -1 }, { q: 0, r: 0 }, 'Y', 'R', rules);
		expect(allowed).toBe(true);
		// Placement onto the origin is never legal
		expect(canPlacePath(G, { q: 0, r: -1 }, { q: 0, r: 0 }, 'R', rules)).toBe(false);
	});

	it('CONSOLIDATE_TO_RING=1 blocks consolidation moves to the origin', () => {
		const rules = { ...baseRules, PLACEMENT: { ...baseRules.PLACEMENT, CONSOLIDATE_TO_RING: 1 } };
		const G = makeState(rules);

		// R cannot consolidate to origin when CONSOLIDATE_TO_RING=1
		const blocked = canConsolidate(G, { q: 0, r: -1 }, { q: 0, r: 0 }, 'Y', 'R', rules);
		expect(blocked).toBe(false);
	});

	it('consolidation to origin is enumerated as a valid action with CONSOLIDATE_TO_RING=0', () => {
		const rules = { ...baseRules, PLACEMENT: { ...baseRules.PLACEMENT, CONSOLIDATE_TO_RING: 0 } };
		const G = makeState(rules);

		const actions = enumerateActions(G, '0').map(actionKey);
		// R conversion of a Y lane on edge (0,0)-(0,-1) should appear
		// (edge endpoints are keyed by the first lane's from/to: (0,0)->(0,-1))
		expect(actions).toContain('convert:0:Y->R:0,0->0,-1');
	});

	it('consolidation to origin is NOT enumerated with CONSOLIDATE_TO_RING=1', () => {
		const rules = { ...baseRules, PLACEMENT: { ...baseRules.PLACEMENT, CONSOLIDATE_TO_RING: 1 } };
		const G = makeState(rules);

		const actions = enumerateActions(G, '0').map(actionKey);
		expect(actions).not.toContain('convert:0:Y->R:0,0->0,-1');
	});

	it('countRimToCenterPaths detects completed path after consolidation to origin', () => {
		const rules = { ...baseRules, PLACEMENT: { ...baseRules.PLACEMENT, CONSOLIDATE_TO_RING: 0 } };
		const G = makeState(rules);

		// Before consolidation: R goes (2,-3)->(1,-2)->(0,-1) but not to center
		const beforeCount = countRimToCenterPaths(G);
		// Y already has a complete path: (0,0)->(0,-1)->(0,-2)->(0,-3)
		expect(beforeCount).toBe(1); // only Y

		// Apply the consolidation: convert ONE of the two Y lanes on edge (0,-1)-(0,0) to R.
		// The doubled segment keeps one Y lane, so Y's path survives the takeover.
		expect(applyConsolidation(G, { q: 0, r: -1 }, { q: 0, r: 0 }, 'Y', 'R')).toBe(true);

		const afterCount = countRimToCenterPaths(G);
		// Now R also has a complete rim-to-center path, and Y still does
		expect(afterCount).toBe(2); // Y + R
	});

	it('non-consolidation moves to origin remain blocked even with CONSOLIDATE_TO_RING=0', () => {
		const rules = { ...baseRules, PLACEMENT: { ...baseRules.PLACEMENT, CONSOLIDATE_TO_RING: 0 } };
		const G = makeState(rules);

		// Converting to the same color is meaningless and blocked
		const sameColor = canConsolidate(G, { q: 0, r: -1 }, { q: 0, r: 0 }, 'Y', 'Y', rules);
		expect(sameColor).toBe(false);

		// B has no rim connection, so B cannot convert anything
		const noRimConnection = canConsolidate(G, { q: 0, r: -1 }, { q: 0, r: 0 }, 'Y', 'B', rules);
		expect(noRimConnection).toBe(false);

		// Normal placement onto the origin is always blocked
		expect(canPlacePath(G, { q: 0, r: -1 }, { q: 0, r: 0 }, 'Y', rules)).toBe(false);
	});
});
