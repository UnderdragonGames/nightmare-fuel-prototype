import { describe, it, expect } from 'vitest';
import { enumerateActions, type Action } from '../game/ai';
import { canConsolidate, applyConsolidation, countRimToCenterPaths } from '../game/helpers';
import type { GState, PathLane } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { initActionState } from '../game/effects';
import { buildPlayers } from './testHelpers';

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

// Board state with 3 complete radial paths from origin to rim (doubled first segments).
//
// Path 1 (Y, north):  (0,0)==>(0,-1)->(0,-2)->(0,-3)   [rim]
// Path 2 (B, east):   (0,0)==>(1,0)->(2,0)->(3,0)      [rim]
// Path 3 (V, south):  (0,0)==>(0,1)->(0,2)->(0,3)      [rim]
const basePaths: PathLane[] = [
	{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' },
	{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' },
	{ from: { q: 0, r: -1 }, to: { q: 0, r: -2 }, color: 'Y' },
	{ from: { q: 0, r: -2 }, to: { q: 0, r: -3 }, color: 'Y' },

	{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' },
	{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' },
	{ from: { q: 1, r: 0 }, to: { q: 2, r: 0 }, color: 'B' },
	{ from: { q: 2, r: 0 }, to: { q: 3, r: 0 }, color: 'B' },

	{ from: { q: 0, r: 0 }, to: { q: 0, r: 1 }, color: 'V' },
	{ from: { q: 0, r: 0 }, to: { q: 0, r: 1 }, color: 'V' },
	{ from: { q: 0, r: 1 }, to: { q: 0, r: 2 }, color: 'V' },
	{ from: { q: 0, r: 2 }, to: { q: 0, r: 3 }, color: 'V' },
];

// R chain from the rim down to (0,-1), crossing onto the Y path's inner node.
// R comp (rim-connected): (2,-3) [rim] -> (1,-2) -> (0,-1).
const rChain: PathLane[] = [
	{ from: { q: 2, r: -3 }, to: { q: 1, r: -2 }, color: 'R' },
	{ from: { q: 1, r: -2 }, to: { q: 0, r: -1 }, color: 'R' },
];

const makeState = (lanes: PathLane[]): GState => ({
	rules,
	radius: rules.RADIUS,
	board: {},
	lanes: lanes.map((l) => ({ ...l })),
	secret: { deck: [] },
	discard: [],
	players: buildPlayers({ '0': [{ colors: ['R', 'O', 'Y', 'G', 'B', 'V'] } as any] }, { prefs: { primary: 'Y', secondary: 'B', tertiary: 'V' } }),
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

describe('consolidation conversion', () => {
	it('matches expected actions on the clean three-path state (no conversions available)', () => {
		// Every path is already a single color from origin to rim, so nothing is
		// consolidatable: each color's rim-connected component only touches its own
		// path, and conversion requires the outer endpoint of a foreign edge.
		const actual = enumerateActions(makeState(basePaths), '0').map(actionKey).sort();
		const expected = [
			// Forward moves from intermediate nodes
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
		const convertActions = actual.filter((k) => k.startsWith('convert:'));
		expect(convertActions).toEqual([]);
	});

	it('enumerates the conversion where R meets the doubled Y segment', () => {
		const G = makeState([...basePaths, ...rChain]);
		// R's rim-connected component reaches (0,-1), so R may convert one Y lane
		// on the origin edge (0,0)-(0,-1).
		const actual = enumerateActions(G, '0').map(actionKey);
		expect(actual).toContain('convert:0:Y->R:0,0->0,-1');
		// But not the outer Y edge — its outer endpoint (0,-2) is not on R's component.
		expect(actual).not.toContain('convert:0:Y->R:0,-1->0,-2');
	});

	it('conversion preserves support and forward moves (geometry unchanged)', () => {
		const G = makeState([...basePaths, ...rChain]);
		const playsBefore = enumerateActions(G, '0').map(actionKey).filter((k) => k.startsWith('play:')).sort();

		expect(canConsolidate(G, { q: 0, r: 0 }, { q: 0, r: -1 }, 'Y', 'R', rules)).toBe(true);
		expect(applyConsolidation(G, { q: 0, r: 0 }, { q: 0, r: -1 }, 'Y', 'R')).toBe(true);

		// Geometry is unchanged, so the set of legal PLACEMENT moves is identical:
		// support, fork capacity, and intersections are all color-blind.
		const playsAfter = enumerateActions(G, '0').map(actionKey).filter((k) => k.startsWith('play:')).sort();
		expect(playsAfter).toEqual(playsBefore);

		// Concretely: stacking Y outward from (0,-1) and branching to the free
		// west node both remain available.
		expect(playsAfter).toContain('play:0:Y:0,-1->0,-2');
		expect(playsAfter).toContain('play:0:B:0,-1->1,-1');
	});

	it('conversion completes R rim-to-center while doubled Y survives the takeover', () => {
		const G = makeState([...basePaths, ...rChain]);
		expect(countRimToCenterPaths(G)).toBe(3); // Y, B, V

		applyConsolidation(G, { q: 0, r: 0 }, { q: 0, r: -1 }, 'Y', 'R');

		// R: (2,-3)[rim] -> (1,-2) -> (0,-1) -> (0,0) is now continuous.
		// Y keeps its path via the remaining Y lane on the doubled segment.
		expect(countRimToCenterPaths(G)).toBe(4); // Y, B, V, R
	});

	it('converting the last lane of a color breaks that color continuity (takeover)', () => {
		// Single-width Y first segment: conversion takes the only Y lane.
		const singleY = basePaths.filter((_, i) => i !== 0); // drop one doubled Y lane
		const G = makeState([...singleY, ...rChain]);
		expect(countRimToCenterPaths(G)).toBe(3); // Y, B, V

		expect(canConsolidate(G, { q: 0, r: 0 }, { q: 0, r: -1 }, 'Y', 'R', rules)).toBe(true);
		applyConsolidation(G, { q: 0, r: 0 }, { q: 0, r: -1 }, 'Y', 'R');

		// R completes, Y's rim-to-center path is broken at the converted edge.
		expect(countRimToCenterPaths(G)).toBe(3); // B, V, R — Y lost
	});
});
