import { describe, it, expect } from 'vitest';
import { canConsolidate, applyConsolidation, listRimToCenterColors } from '../game/helpers';
import { replaceLaneColor, actionEffectsInvalidReason, initActionState } from '../game/effects';
import { computeScores } from '../game/scoring';
import type { GState, PathLane, Rules } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { buildPlayers } from './testHelpers';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

const makeRules = (consolidationBonus: number): Rules => ({
	...MODE_RULESETS.path,
	RADIUS: 3,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
	PLACEMENT: { ...MODE_RULESETS.path.PLACEMENT, STARTING_RING: 0, FORK_SUPPORT: true },
	SCORING: { ...MODE_RULESETS.path.SCORING, CONSOLIDATION_BONUS: consolidationBonus },
});

// Doubled Y radial path north plus an R chain reaching the Y path's inner
// node — same shape as consolidation-backtrack.test.ts.
const basePaths: PathLane[] = [
	{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' },
	{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' },
	{ from: { q: 0, r: -1 }, to: { q: 0, r: -2 }, color: 'Y' },
	{ from: { q: 0, r: -2 }, to: { q: 0, r: -3 }, color: 'Y' },

	{ from: { q: 2, r: -3 }, to: { q: 1, r: -2 }, color: 'R' },
	{ from: { q: 1, r: -2 }, to: { q: 0, r: -1 }, color: 'R' },
];

const makeState = (lanes: PathLane[], consolidationBonus = 0): GState => {
	const rules = makeRules(consolidationBonus);
	return {
		rules,
		radius: rules.RADIUS,
		board: {},
		lanes: lanes.map((l) => ({ ...l })),
		secret: { deck: [] },
		discard: [],
		players: buildPlayers({ '0': [] }, { prefs: { primary: 'Y', secondary: 'B', tertiary: 'V' } }),
		treasure: [],
		stats: { placements: 0 },
		meta: { deckExhaustionCycle: null },
		origins: [{ q: 0, r: 0 }],
		action: initActionState(['0']),
	};
};

// Playtest (2026-08-21): "Consolidated paths shouldn't be re-consolidatable
// (they should be fixed)."
describe('consolidation lock', () => {
	const a = { q: 0, r: 0 };
	const b = { q: 0, r: -1 };

	it('applyConsolidation marks the converted lane as consolidated', () => {
		const G = makeState(basePaths);
		expect(applyConsolidation(G, a, b, 'Y', 'R')).toBe(true);
		const converted = G.lanes.find((ln) => ln.color === 'R' && ln.from.q === 0 && ln.from.r === 0);
		expect(converted?.consolidated).toBe(true);
	});

	it('a consolidated lane can never be consolidated again', () => {
		const G = makeState(basePaths);
		applyConsolidation(G, a, b, 'Y', 'R');
		// The R lane on the origin edge is fixed: even with Y rim-connected via
		// its surviving doubled lane, R -> Y conversion on this edge is illegal.
		expect(canConsolidate(G, a, b, 'R', 'Y', G.rules)).toBe(false);
		expect(applyConsolidation(G, a, b, 'R', 'Y')).toBe(false);
	});

	it('canConsolidate ignores edges whose only fromColor lane is consolidated', () => {
		// Same shape, but the single Y lane on the origin edge is pre-locked.
		const lanes = basePaths.filter((_, i) => i !== 0).map((l, i) => (i === 0 ? { ...l, consolidated: true } : l));
		const G = makeState(lanes);
		expect(canConsolidate(G, a, b, 'Y', 'R', G.rules)).toBe(false);
	});

	it('lane-recoloring cards refuse consolidated lanes', () => {
		const G = makeState(basePaths);
		applyConsolidation(G, a, b, 'Y', 'R');
		// Direct effect helper refuses…
		expect(replaceLaneColor(G, a, b, 'B')).toBe(false);
		// …and the pre-check rejects the card play with a readable reason.
		const reason = actionEffectsInvalidReason(G, [{ type: 'replaceLaneColor', from: a, to: b, color: 'B' }]);
		expect(reason).toMatch(/consolidated/);
	});
});

// Playtest (2026-08-21): "Extra points for consolidation needs to be a
// setting. I like the idea of extra points. Needs to be codified."
describe('consolidation scoring bonus', () => {
	it('adds CONSOLIDATION_BONUS to a color with a completed rim-to-center path', () => {
		const withBonus = makeState(basePaths, 5);
		expect(listRimToCenterColors(withBonus)).toEqual(['Y']);
		const without = makeState(basePaths, 0);
		// Y raw count is 3 edges; primary weight 3. Bonus adds 5 raw -> +15.
		const scoreWithout = computeScores(without)['0']!;
		const scoreWith = computeScores(withBonus)['0']!;
		expect(scoreWith - scoreWithout).toBe(5 * 3);
	});

	it('no bonus while the path stops short of the center', () => {
		// Drop the origin-edge lanes: Y runs (0,-1)..(0,-3) only.
		const partial = basePaths.slice(2);
		expect(listRimToCenterColors(makeState(partial))).toEqual([]);
		const scoreWith = computeScores(makeState(partial, 5))['0']!;
		const scoreWithout = computeScores(makeState(partial, 0))['0']!;
		expect(scoreWith).toBe(scoreWithout);
	});
});
