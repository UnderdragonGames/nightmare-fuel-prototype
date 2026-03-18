import { describe, it, expect } from 'vitest';
import { enumerateActions, type Action, applyMicroAction } from '../game/ai';
import type { GState } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { computeScoresRaw } from '../game/scoring';
import { initActionState } from '../game/effects';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

const rules = {
	...MODE_RULESETS.path,
	RADIUS: 3,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
	PLACEMENT: { ...MODE_RULESETS.path.PLACEMENT, STARTING_RING: 0 },
};

const G: GState = {
	rules,
	radius: rules.RADIUS,
	board: {},
	lanes: [{ from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' }, { from: { q: 0, r: -1 }, to: { q: 0, r: -2 }, color: 'Y' }, { from: { q: 0, r: 0 }, to: { q: 0, r: -1 }, color: 'Y' }, { from: { q: 0, r: -1 }, to: { q: -1, r: -1 }, color: 'O' }, { from: { q: 0, r: 0 }, to: { q: 0, r: 1 }, color: 'V' }, { from: { q: 0, r: 0 }, to: { q: 0, r: 1 }, color: 'V' }, { from: { q: 0, r: 0 }, to: { q: 0, r: 1 }, color: 'V' }, { from: { q: 0, r: 1 }, to: { q: 0, r: 2 }, color: 'V' }, { from: { q: 0, r: 1 }, to: { q: 0, r: 2 }, color: 'V' }, { from: { q: 0, r: 2 }, to: { q: 0, r: 3 }, color: 'V' }, { from: { q: 0, r: 1 }, to: { q: -1, r: 2 }, color: 'R' }, { from: { q: 0, r: 0 }, to: { q: 1, r: -1 }, color: 'G' }, { from: { q: 0, r: 0 }, to: { q: 1, r: -1 }, color: 'G' }, { from: { q: 1, r: -1 }, to: { q: 2, r: -1 }, color: 'B' }, { from: { q: 1, r: -1 }, to: { q: 2, r: -1 }, color: 'B' }, { from: { q: 2, r: -1 }, to: { q: 2, r: -2 }, color: 'Y' }, { from: { q: 2, r: -1 }, to: { q: 2, r: -2 }, color: 'Y' }, { from: { q: 2, r: -1 }, to: { q: 3, r: -2 }, color: 'G' }, { from: { q: 2, r: -2 }, to: { q: 3, r: -3 }, color: 'G' }, { from: { q: 2, r: -2 }, to: { q: 3, r: -3 }, color: 'G' }, { from: { q: 2, r: -2 }, to: { q: 2, r: -3 }, color: 'Y' }],
	deck: [],
	discard: [],
	hands: { '0': [{ colors: ['R', 'O', 'Y', 'G', 'B', 'V'] } as any] },
	treasure: [],
	prefs: { '0': { primary: 'R', secondary: 'O', tertiary: 'Y' } },
	nightmares: {},
	nightmareState: {},
	stats: { placements: 0 },
	meta: { deckExhaustionCycle: null, stashBonus: {}, actionPlaysThisTurn: {} },
	origins: [{ q: 0, r: 0 }],
	action: initActionState(['0']),
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

describe('per-path-node-limit', () => {
	it('matches expected actions', () => {
		const actual = enumerateActions(G, '0').map(actionKey).sort();
		const expected = [
  "play:0:R:-1,-1->-2,0",
  "play:0:R:-1,2->-2,3",
  "play:0:R:0,0->-1,1",
  "play:0:R:0,1->-1,2",
  "play:0:R:0,2->-1,3",
  "play:0:O:-1,-1->-2,-1",
  "play:0:O:-1,2->-2,2",
  "play:0:O:0,-2->-1,-2",
  "play:0:O:0,-1->-1,-1",
  "play:0:O:0,0->-1,0",
  "play:0:O:0,1->-1,1",
  "play:0:Y:-1,-1->-1,-2",
  "play:0:Y:-1,2->-1,1",
  "play:0:Y:0,-2->0,-3",
  "play:0:Y:0,-1->0,-2",
  "play:0:Y:0,0->0,-1",
  "play:0:Y:1,-1->2,-1",
  "play:0:Y:1,-1->1,-2",
  "play:0:Y:2,-1->1,-1",
  "play:0:G:0,-2->1,-3",
  "play:0:G:0,0->1,-1",
  "play:0:G:0,1->1,0",
  "play:0:G:0,2->1,1",
  "play:0:G:1,-1->2,-1",
  "play:0:G:2,-1->1,-1",
  "play:0:G:2,-2->2,-1",
  "play:0:B:0,-2->1,-2",
  "play:0:B:0,0->1,0",
  "play:0:B:0,2->1,2",
  "play:0:V:-1,-1->-1,0",
  "play:0:V:-1,2->-1,3",
  "play:0:V:0,1->0,2",
  "play:0:V:0,2->0,3",
  "play:0:V:1,-1->1,0",
  "stash:0",
  "end"
];
		expect(actual).toEqual([...expected].sort());
		const forbidden = [
  "play:0:B:1,-1->2,-1"
];
		for (const key of forbidden) expect(actual).not.toContain(key);
	});
	it('matches expected score deltas', () => {
		const baseScores = computeScoresRaw(G);
		const expectedScores: Record<string, number> = {};
		for (const action of enumerateActions(G, '0')) {
			const k = actionKey(action);
			if (expectedScores[k] === undefined) continue;
			const next = applyMicroAction(G, action, '0');
			expect(next).not.toBeNull();
			const scoresAfter = computeScoresRaw(next!);
			const delta = (scoresAfter['0'] ?? 0) - (baseScores['0'] ?? 0);
			expect(delta).toBe(expectedScores[k]);
		}
	});
});