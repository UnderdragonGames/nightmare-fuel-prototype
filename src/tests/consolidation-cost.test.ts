import { describe, it, expect } from 'vitest';
import { enumerateActions, applyMicroAction, type Action } from '../game/ai';
import { validateConvertExtras } from '../game/helpers';
import { makeCard } from '../game/cardFactory';
import { initActionState } from '../game/effects';
import type { Card, GState, PathLane, Rules } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { buildPlayers } from './testHelpers';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

const makeRules = (cost: number): Rules => ({
	...MODE_RULESETS.path,
	RADIUS: 3,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
	PLACEMENT: { ...MODE_RULESETS.path.PLACEMENT, STARTING_RING: 0, FORK_SUPPORT: true, COST_TO_CONSOLIDATE: cost },
});

// Doubled Y radial path north plus an R chain reaching the Y path's inner
// node: R may convert one Y lane on the origin edge (0,0)-(0,-1).
const lanes: PathLane[] = [
	{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' },
	{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' },
	{ from: { q: 0, r: -1 }, to: { q: 0, r: -2 }, color: 'Y' },
	{ from: { q: 0, r: -2 }, to: { q: 0, r: -3 }, color: 'Y' },
	{ from: { q: 2, r: -3 }, to: { q: 1, r: -2 }, color: 'R' },
	{ from: { q: 1, r: -2 }, to: { q: 0, r: -1 }, color: 'R' },
];

const makeState = (cost: number, hand: Card[]): GState => {
	const rules = makeRules(cost);
	return {
		rules,
		radius: rules.RADIUS,
		board: {},
		lanes: lanes.map((l) => ({ ...l })),
		secret: { deck: [] },
		discard: [],
		players: buildPlayers({ '0': hand }, { prefs: { primary: 'R', secondary: 'Y', tertiary: 'B' } }),
		treasure: [],
		stats: { placements: 0 },
		meta: { deckExhaustionCycle: null },
		origins: [{ q: 0, r: 0 }],
		action: initActionState(['0']),
	};
};

type PlayCardAction = Extract<Action, { type: 'playCard' }>;
const convertActions = (G: GState): PlayCardAction[] =>
	enumerateActions(G, '0').filter(
		(a): a is PlayCardAction => a.type === 'playCard' && 'convert' in a.args && !!a.args.convert,
	);
const convertKeys = (G: GState): Array<{ handIndex: number; extraDiscards?: number[] }> =>
	convertActions(G).map((a) => a.args as { handIndex: number; extraDiscards?: number[] });

// Playtest (2026-08-21): "a consolidation move should cost extra, 2 perhaps.
// So it's cheaper to make more paths than consolidate."
describe('consolidation conversion cost', () => {
	it('a one-card hand cannot afford a cost-2 conversion', () => {
		const G = makeState(2, [makeCard(['R'])]);
		expect(convertKeys(G)).toEqual([]);
		// The same hand CAN convert when the cost is pinned to 1.
		const free = makeState(1, [makeCard(['R'])]);
		expect(convertKeys(free).length).toBeGreaterThan(0);
	});

	it('enumerated conversions carry the extra discard indices', () => {
		const G = makeState(2, [makeCard(['R']), makeCard(['G'])]);
		const converts = convertKeys(G);
		expect(converts.length).toBeGreaterThan(0);
		for (const c of converts) {
			expect(c.extraDiscards).toHaveLength(1);
			expect(c.extraDiscards![0]).not.toBe(c.handIndex);
		}
	});

	it('applying a cost-2 conversion spends both cards to the discard', () => {
		const G = makeState(2, [makeCard(['R']), makeCard(['G'])]);
		const convert = convertActions(G)[0];
		expect(convert).toBeDefined();
		const next = applyMicroAction(G, convert!, '0');
		expect(next).not.toBeNull();
		expect(next!.players['0']!.hand).toHaveLength(0);
		expect(next!.discard).toHaveLength(2);
		expect(next!.lanes.some((ln) => ln.consolidated)).toBe(true);
	});

	it('a conversion without its extra discards is rejected', () => {
		const G = makeState(2, [makeCard(['R']), makeCard(['G'])]);
		const convert = convertActions(G)[0]!;
		const unpaid = JSON.parse(JSON.stringify(convert)) as PlayCardAction;
		(unpaid.args as { extraDiscards?: number[] }).extraDiscards = [];
		expect(applyMicroAction(G, unpaid, '0')).toBeNull();
		// Paying with the played card itself, a duplicate, or an out-of-range
		// index is equally rejected.
		expect(validateConvertExtras(2, 0, [0], G.rules)).toBeNull();
		expect(validateConvertExtras(2, 0, [1, 1], G.rules)).toBeNull();
		expect(validateConvertExtras(2, 0, [5], G.rules)).toBeNull();
		expect(validateConvertExtras(2, 0, [1], G.rules)).toEqual([1]);
	});
});
