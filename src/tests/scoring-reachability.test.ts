import { describe, it, expect } from 'vitest';
import { canPlacePath, countRimToCenterPaths } from '../game/helpers';
import { computeScoresRaw } from '../game/scoring';
import { HexStringsGame } from '../game/game';
import type { Ctx } from 'boardgame.io';
import type { GState, PathLane } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { initActionState } from '../game/effects';
import { buildPlayers } from './testHelpers';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

// Y=N G=NE B=E V=SE R=SW O=NW

const makeRules = (startingRing: number) => ({
	...MODE_RULESETS.path,
	RADIUS: 3,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
	PLACEMENT: { ...MODE_RULESETS.path.PLACEMENT, STARTING_RING: startingRing },
});

const makeG = (startingRing: number, lanes: PathLane[]): GState => ({
	rules: makeRules(startingRing),
	radius: 3,
	board: {},
	lanes: lanes.map((l) => ({ ...l })),
	secret: { deck: [] },
	discard: [],
	players: buildPlayers({ '0': [] }, { prefs: { primary: 'B', secondary: 'G', tertiary: 'Y' } }),
	treasure: [],
	stats: { placements: 0 },
	meta: { deckExhaustionCycle: null },
	origins: [{ q: 0, r: 0 }],
	action: initActionState(['0']),
} as unknown as GState);

// B chain from the starting ring to the rim — never touches the origin,
// which is exactly what real play produces under STARTING_RING=1.
const ringChain: PathLane[] = [
	{ from: { q: 1, r: 0 }, to: { q: 2, r: 0 }, color: 'B' },
	{ from: { q: 2, r: 0 }, to: { q: 3, r: 0 }, color: 'B' },
];

describe('scoring reachability (STARTING_RING as effective origin)', () => {
	it('a starting-ring-connected rim chain scores without touching the origin', () => {
		const G = makeG(1, ringChain);
		// 2 B edges, rim-connected and starting-ring-connected → raw 2 for primary B
		expect(computeScoresRaw(G)['0']).toBe(2);
	});

	it('with STARTING_RING=0, the same chain still requires true origin connectivity', () => {
		const G = makeG(0, ringChain);
		expect(computeScoresRaw(G)['0']).toBe(0);
	});
});

describe('finishing move into the origin', () => {
	it('a rim-connected color may finish from its own component', () => {
		const G = makeG(1, ringChain);
		expect(canPlacePath(G, { q: 1, r: 0 }, { q: 0, r: 0 }, 'B', G.rules)).toBe(true);
	});

	it('non-rim-connected colors and off-component sources cannot finish', () => {
		const G = makeG(1, ringChain);
		// O never reached the rim
		expect(canPlacePath(G, { q: 1, r: 0 }, { q: 0, r: 0 }, 'O', G.rules)).toBe(false);
		// (0,1) is a ring-1 node but not on B's component
		expect(canPlacePath(G, { q: 0, r: 1 }, { q: 0, r: 0 }, 'B', G.rules)).toBe(false);
	});

	it('finishing is blocked when CONSOLIDATE_TO_RING=1', () => {
		const G = makeG(1, ringChain);
		(G.rules.PLACEMENT as { CONSOLIDATE_TO_RING: number }).CONSOLIDATE_TO_RING = 1;
		expect(canPlacePath(G, { q: 1, r: 0 }, { q: 0, r: 0 }, 'B', G.rules)).toBe(false);
	});

	it('a finisher completes rim-to-center and can end the game at CONSOLIDATION_END', () => {
		const G = makeG(1, [...ringChain, { from: { q: 1, r: 0 }, to: { q: 0, r: 0 }, color: 'B' }]);
		expect(countRimToCenterPaths(G)).toBe(1);

		// Three finished colors trigger the end condition (CONSOLIDATION_END = 3).
		const three: PathLane[] = [
			...ringChain, { from: { q: 1, r: 0 }, to: { q: 0, r: 0 }, color: 'B' },
			{ from: { q: 0, r: -1 }, to: { q: 0, r: -2 }, color: 'Y' },
			{ from: { q: 0, r: -2 }, to: { q: 0, r: -3 }, color: 'Y' },
			{ from: { q: 0, r: -1 }, to: { q: 0, r: 0 }, color: 'Y' },
			{ from: { q: 0, r: 1 }, to: { q: 0, r: 2 }, color: 'V' },
			{ from: { q: 0, r: 2 }, to: { q: 0, r: 3 }, color: 'V' },
			{ from: { q: 0, r: 1 }, to: { q: 0, r: 0 }, color: 'V' },
		];
		const G3 = makeG(1, three);
		expect(countRimToCenterPaths(G3)).toBe(3);
		const ctx = { currentPlayer: '0', playOrder: ['0'], numPlayers: 1, turn: 10 } as unknown as Ctx;
		const over = (HexStringsGame.endIf as (c: { G: GState; ctx: Ctx }) => unknown)({ G: G3, ctx });
		expect(over).toBeTruthy();
	});
});
