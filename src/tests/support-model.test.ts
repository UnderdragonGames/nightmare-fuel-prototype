import { describe, it, expect } from 'vitest';
import { canPlacePath, canConsolidate, applyConsolidation, countRimToCenterPaths } from '../game/helpers';
import type { GState, PathLane } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { initActionState } from '../game/effects';
import { buildPlayers } from './testHelpers';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

// Direction mapping:
// Y -> N: (0,-1)  G -> NE: (1,-1)  B -> E: (1,0)
// V -> SE: (0,1)  R -> SW: (-1,1)  O -> NW: (-1,0)

const makeRules = (radius: number) => ({
	...MODE_RULESETS.path,
	RADIUS: radius,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
});

const makeG = (radius: number, lanes: PathLane[]): GState => ({
	rules: makeRules(radius),
	radius,
	board: {},
	lanes: lanes.map((l) => ({ ...l })),
	secret: { deck: [] },
	discard: [],
	players: buildPlayers({ '0': [] }),
	treasure: [],
	stats: { placements: 0 },
	meta: { deckExhaustionCycle: null },
	origins: [{ q: 0, r: 0 }],
	action: initActionState(['0']),
} as unknown as GState);

describe('support model: no manufactured support', () => {
	// Single-width path: origin -> (1,0) [B] -> (2,-1) [G]. Node (2,-1) has support 1.
	const singlePath: PathLane[] = [
		{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' },
		{ from: { q: 1, r: 0 }, to: { q: 2, r: -1 }, color: 'G' },
	];

	it('blocks doubling an outgoing edge with only single support', () => {
		const G = makeG(5, [...singlePath, { from: { q: 2, r: -1 }, to: { q: 3, r: -1 }, color: 'B' }]);
		expect(canPlacePath(G, { q: 2, r: -1 }, { q: 3, r: -1 }, 'B', G.rules)).toBe(false);
	});

	it('a dead-end inward stub does NOT grant doubling support (the old exploit)', () => {
		// Place the inward stub first, then the outward lane: the stub consumes
		// the node's single unit of capacity instead of granting a bonus.
		const G = makeG(5, singlePath);
		expect(canPlacePath(G, { q: 2, r: -1 }, { q: 1, r: -1 }, 'O', G.rules)).toBe(true);

		const withStub = makeG(5, [...singlePath, { from: { q: 2, r: -1 }, to: { q: 1, r: -1 }, color: 'O' }]);
		// Second lane from a support-1 node is blocked...
		expect(canPlacePath(withStub, { q: 2, r: -1 }, { q: 3, r: -1 }, 'B', withStub.rules)).toBe(false);
		// ...and so is doubling, obviously.
		const withStubAndOut = makeG(5, [...withStub.lanes, { from: { q: 2, r: -1 }, to: { q: 3, r: -1 }, color: 'B' }]);
		expect(canPlacePath(withStubAndOut, { q: 2, r: -1 }, { q: 3, r: -1 }, 'B', withStubAndOut.rules)).toBe(false);
	});

	it('placement legality is order-independent (inward vs outward first)', () => {
		// Outward lane first: the inward stub is then blocked — same shape,
		// same verdict as placing the stub first and the outward lane second.
		const withOut = makeG(5, [...singlePath, { from: { q: 2, r: -1 }, to: { q: 3, r: -1 }, color: 'B' }]);
		expect(canPlacePath(withOut, { q: 2, r: -1 }, { q: 1, r: -1 }, 'O', withOut.rules)).toBe(false);

		const withStub = makeG(5, [...singlePath, { from: { q: 2, r: -1 }, to: { q: 1, r: -1 }, color: 'O' }]);
		expect(canPlacePath(withStub, { q: 2, r: -1 }, { q: 3, r: -1 }, 'B', withStub.rules)).toBe(false);
	});

	it('genuine doubled support does allow doubling', () => {
		const doubled: PathLane[] = [
			{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' },
			{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' },
			{ from: { q: 1, r: 0 }, to: { q: 2, r: 0 }, color: 'B' },
		];
		const G = makeG(5, doubled);
		expect(canPlacePath(G, { q: 1, r: 0 }, { q: 2, r: 0 }, 'B', G.rules)).toBe(true);
	});
});

describe('support model: free stacking from origins and starting ring', () => {
	it('origin allows parallel lanes up to MAX_LANES_PER_PATH with no support (STARTING_RING=0)', () => {
		// With the default STARTING_RING=1, building FROM the origin is blocked
		// (branches start at ring 1); origin free-stacking applies when it's 0.
		const rules = { ...makeRules(5), PLACEMENT: { ...makeRules(5).PLACEMENT, STARTING_RING: 0 } };
		const edge = (n: number): PathLane[] =>
			Array.from({ length: n }, () => ({ from: { q: 0, r: 0 }, to: { q: 0, r: 1 }, color: 'V' as const }));
		const withRules = (lanes: PathLane[]): GState => ({ ...makeG(5, lanes), rules });
		expect(canPlacePath(withRules(edge(0)), { q: 0, r: 0 }, { q: 0, r: 1 }, 'V', rules)).toBe(true);
		expect(canPlacePath(withRules(edge(1)), { q: 0, r: 0 }, { q: 0, r: 1 }, 'V', rules)).toBe(true);
		expect(canPlacePath(withRules(edge(2)), { q: 0, r: 0 }, { q: 0, r: 1 }, 'V', rules)).toBe(true);
		// MAX_LANES_PER_PATH = 3: the fourth is a width violation, not a support one.
		expect(canPlacePath(withRules(edge(3)), { q: 0, r: 0 }, { q: 0, r: 1 }, 'V', rules)).toBe(false);

		// And with the default STARTING_RING=1, origin builds are blocked entirely.
		expect(canPlacePath(makeG(5, []), { q: 0, r: 0 }, { q: 0, r: 1 }, 'V', makeRules(5))).toBe(false);
	});

	it('starting-ring nodes allow parallel lanes with no support (STARTING_RING=1)', () => {
		// (0,1) is on ring 1 = STARTING_RING: a free source.
		const edge = (n: number): PathLane[] =>
			Array.from({ length: n }, () => ({ from: { q: 0, r: 1 }, to: { q: 0, r: 2 }, color: 'V' as const }));
		expect(canPlacePath(makeG(5, edge(0)), { q: 0, r: 1 }, { q: 0, r: 2 }, 'V', makeRules(5))).toBe(true);
		expect(canPlacePath(makeG(5, edge(2)), { q: 0, r: 1 }, { q: 0, r: 2 }, 'V', makeRules(5))).toBe(true);
		expect(canPlacePath(makeG(5, edge(3)), { q: 0, r: 1 }, { q: 0, r: 2 }, 'V', makeRules(5))).toBe(false);
	});
});

describe('consolidation conversion: bridges and contiguity', () => {
	// Mixed path to the rim (radius 3): B, then G, then B touching rim.
	// The origin B edge is a same-color "bridge" for B's consolidation.
	const mixedPath: PathLane[] = [
		{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' },     // bridge
		{ from: { q: 1, r: 0 }, to: { q: 2, r: -1 }, color: 'G' },    // needs conversion
		{ from: { q: 2, r: -1 }, to: { q: 3, r: -1 }, color: 'B' },   // rim-connected B
	];

	it('same-color bridge: one conversion completes rim-to-center', () => {
		const G = makeG(3, mixedPath);
		expect(countRimToCenterPaths(G)).toBe(0);

		// Convert the G edge — its outer endpoint (2,-1) is on B's component.
		expect(canConsolidate(G, { q: 1, r: 0 }, { q: 2, r: -1 }, 'G', 'B', G.rules)).toBe(true);
		expect(applyConsolidation(G, { q: 1, r: 0 }, { q: 2, r: -1 }, 'G', 'B')).toBe(true);

		// The bridge edge needs no conversion (and none is possible: B is already there).
		expect(canConsolidate(G, { q: 0, r: 0 }, { q: 1, r: 0 }, 'B', 'B', G.rules)).toBe(false);
		expect(countRimToCenterPaths(G)).toBe(1);
	});

	it('contiguity: edges not touching the color component cannot convert', () => {
		const farChain: PathLane[] = [
			{ from: { q: 0, r: 0 }, to: { q: -1, r: 0 }, color: 'O' },
			{ from: { q: -1, r: 0 }, to: { q: -2, r: 0 }, color: 'O' },
		];
		const G = makeG(3, [...mixedPath, ...farChain]);
		// B's rim-connected component is {(3,-1),(2,-1)} — the far O chain does not touch it.
		expect(canConsolidate(G, { q: -1, r: 0 }, { q: -2, r: 0 }, 'O', 'B', G.rules)).toBe(false);
		// Different-ring edges also require the OUTER endpoint on the component:
		// (0,0)-(1,0)... the G edge conversion above worked because (2,-1) is on it,
		// but converting the O edge at the origin is out of reach entirely.
		expect(canConsolidate(G, { q: 0, r: 0 }, { q: -1, r: 0 }, 'O', 'B', G.rules)).toBe(false);
	});

	it('a color that never reached the rim cannot convert anything', () => {
		const G = makeG(3, mixedPath);
		expect(canConsolidate(G, { q: 1, r: 0 }, { q: 2, r: -1 }, 'G', 'O', G.rules)).toBe(false);
	});
});
