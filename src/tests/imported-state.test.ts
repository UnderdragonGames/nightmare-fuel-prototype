import { describe, it, expect } from 'vitest';
import { enumerateActions, type Action, applyMicroAction } from '../game/ai';
import type { GState } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { computeScoresRaw } from '../game/scoring';

// Test to address strange inconsistencies between consolidation moves and regular moves

const EDGE_COLORS = ['V', 'O', 'R', 'B', 'G', 'Y'] as const;

const rules = {
	...MODE_RULESETS.path,
	RADIUS: 5,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
};

const G: GState = {
	rules,
	radius: rules.RADIUS,
	board: {
		"-5,0": { colors: [], rotation: 0 },
		"-5,1": { colors: [], rotation: 0 },
		"-5,2": { colors: [], rotation: 0 },
		"-5,3": { colors: [], rotation: 0 },
		"-5,4": { colors: [], rotation: 0 },
		"-5,5": { colors: [], rotation: 0 },
		"-4,-1": { colors: [], rotation: 0 },
		"-4,0": { colors: [], rotation: 0 },
		"-4,1": { colors: [], rotation: 0 },
		"-4,2": { colors: [], rotation: 0 },
		"-4,3": { colors: [], rotation: 0 },
		"-4,4": { colors: [], rotation: 0 },
		"-4,5": { colors: [], rotation: 0 },
		"-3,-2": { colors: [], rotation: 0 },
		"-3,-1": { colors: [], rotation: 0 },
		"-3,0": { colors: [], rotation: 0 },
		"-3,1": { colors: [], rotation: 0 },
		"-3,2": { colors: [], rotation: 0 },
		"-3,3": { colors: [], rotation: 0 },
		"-3,4": { colors: [], rotation: 0 },
		"-3,5": { colors: [], rotation: 0 },
		"-2,-3": { colors: [], rotation: 0 },
		"-2,-2": { colors: [], rotation: 0 },
		"-2,-1": { colors: [], rotation: 0 },
		"-2,0": { colors: [], rotation: 0 },
		"-2,1": { colors: [], rotation: 0 },
		"-2,2": { colors: [], rotation: 0 },
		"-2,3": { colors: [], rotation: 0 },
		"-2,4": { colors: [], rotation: 0 },
		"-2,5": { colors: [], rotation: 0 },
		"-1,-4": { colors: [], rotation: 0 },
		"-1,-3": { colors: [], rotation: 0 },
		"-1,-2": { colors: [], rotation: 0 },
		"-1,-1": { colors: [], rotation: 0 },
		"-1,0": { colors: [], rotation: 0 },
		"-1,1": { colors: [], rotation: 0 },
		"-1,2": { colors: [], rotation: 0 },
		"-1,3": { colors: [], rotation: 0 },
		"-1,4": { colors: [], rotation: 0 },
		"-1,5": { colors: [], rotation: 0 },
		"0,-5": { colors: [], rotation: 0 },
		"0,-4": { colors: [], rotation: 0 },
		"0,-3": { colors: [], rotation: 0 },
		"0,-2": { colors: [], rotation: 0 },
		"0,-1": { colors: [], rotation: 0 },
		"0,0": { colors: [], rotation: 0 },
		"0,1": { colors: [], rotation: 0 },
		"0,2": { colors: [], rotation: 0 },
		"0,3": { colors: [], rotation: 0 },
		"0,4": { colors: [], rotation: 0 },
		"0,5": { colors: [], rotation: 0 },
		"1,-5": { colors: [], rotation: 0 },
		"1,-4": { colors: [], rotation: 0 },
		"1,-3": { colors: [], rotation: 0 },
		"1,-2": { colors: [], rotation: 0 },
		"1,-1": { colors: [], rotation: 0 },
		"1,0": { colors: [], rotation: 0 },
		"1,1": { colors: [], rotation: 0 },
		"1,2": { colors: [], rotation: 0 },
		"1,3": { colors: [], rotation: 0 },
		"1,4": { colors: [], rotation: 0 },
		"2,-5": { colors: [], rotation: 0 },
		"2,-4": { colors: [], rotation: 0 },
		"2,-3": { colors: [], rotation: 0 },
		"2,-2": { colors: [], rotation: 0 },
		"2,-1": { colors: [], rotation: 0 },
		"2,0": { colors: [], rotation: 0 },
		"2,1": { colors: [], rotation: 0 },
		"2,2": { colors: [], rotation: 0 },
		"2,3": { colors: [], rotation: 0 },
		"3,-5": { colors: [], rotation: 0 },
		"3,-4": { colors: [], rotation: 0 },
		"3,-3": { colors: [], rotation: 0 },
		"3,-2": { colors: [], rotation: 0 },
		"3,-1": { colors: [], rotation: 0 },
		"3,0": { colors: [], rotation: 0 },
		"3,1": { colors: [], rotation: 0 },
		"3,2": { colors: [], rotation: 0 },
		"4,-5": { colors: [], rotation: 0 },
		"4,-4": { colors: [], rotation: 0 },
		"4,-3": { colors: [], rotation: 0 },
		"4,-2": { colors: [], rotation: 0 },
		"4,-1": { colors: [], rotation: 0 },
		"4,0": { colors: [], rotation: 0 },
		"4,1": { colors: [], rotation: 0 },
		"5,-5": { colors: [], rotation: 0 },
		"5,-4": { colors: [], rotation: 0 },
		"5,-3": { colors: [], rotation: 0 },
		"5,-2": { colors: [], rotation: 0 },
		"5,-1": { colors: [], rotation: 0 },
		"5,0": { colors: [], rotation: 0 }
	},
	lanes: [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'R' }, { from: { q: 1, r: 0 }, to: { q: 2, r: 0 }, color: 'R' }, { from: { q: 2, r: 0 }, to: { q: 1, r: 1 }, color: 'G' }, { from: { q: 0, r: 0 }, to: { q: 1, r: -1 }, color: 'O' }, { from: { q: 1, r: -1 }, to: { q: 2, r: -2 }, color: 'O' }, { from: { q: 1, r: 1 }, to: { q: 0, r: 2 }, color: 'G' }, { from: { q: 0, r: 2 }, to: { q: 1, r: 2 }, color: 'R' }, { from: { q: 2, r: -2 }, to: { q: 1, r: -2 }, color: 'Y' }, { from: { q: 1, r: 2 }, to: { q: 1, r: 3 }, color: 'B' }, { from: { q: 1, r: 3 }, to: { q: 2, r: 2 }, color: 'O' }, { from: { q: 2, r: 2 }, to: { q: 2, r: 1 }, color: 'V' }, { from: { q: 1, r: -2 }, to: { q: 1, r: -3 }, color: 'V' }, { from: { q: 1, r: -3 }, to: { q: 0, r: -2 }, color: 'G' }, { from: { q: 0, r: 0 }, to: { q: -1, r: 0 }, color: 'Y' }, { from: { q: 0, r: -2 }, to: { q: 0, r: -1 }, color: 'B' }, { from: { q: -1, r: 0 }, to: { q: -1, r: 1 }, color: 'B' }, { from: { q: -1, r: 1 }, to: { q: -1, r: 2 }, color: 'B' }, { from: { q: -1, r: 2 }, to: { q: 0, r: 1 }, color: 'O' }, { from: { q: 2, r: 1 }, to: { q: 3, r: 1 }, color: 'R' }, { from: { q: 3, r: 1 }, to: { q: 3, r: 0 }, color: 'V' }, { from: { q: 3, r: 0 }, to: { q: 4, r: 0 }, color: 'R' }, { from: { q: 4, r: 0 }, to: { q: 5, r: 0 }, color: 'R' }, { from: { q: 0, r: 0 }, to: { q: 1, r: -1 }, color: 'O' }, { from: { q: 0, r: 0 }, to: { q: 1, r: -1 }, color: 'O' }, { from: { q: 0, r: -1 }, to: { q: -1, r: -1 }, color: 'Y' }, { from: { q: -1, r: -1 }, to: { q: -2, r: -1 }, color: 'Y' }, { from: { q: -2, r: -1 }, to: { q: -3, r: 0 }, color: 'G' }, { from: { q: -3, r: 0 }, to: { q: -3, r: -1 }, color: 'V' }, { from: { q: -3, r: -1 }, to: { q: -3, r: -2 }, color: 'V' }, { from: { q: 1, r: -1 }, to: { q: 2, r: -2 }, color: 'O' }, { from: { q: 2, r: -2 }, to: { q: 3, r: -2 }, color: 'R' }, { from: { q: 4, r: -3 }, to: { q: 5, r: -3 }, color: 'R' }, { from: { q: 4, r: -3 }, to: { q: 3, r: -2 }, color: 'R' }, { from: { q: 3, r: -2 }, to: { q: 4, r: -3 }, color: 'O' }],
	deck: [],
	discard: [],
	hands: { '0': [{ colors: ['R', 'O', 'Y', 'G', 'B', 'V'] }] },
	treasure: [{ colors: [] }, { colors: [] }, { colors: [] }, { colors: [] }],
	prefs: { '0': { primary: 'R', secondary: 'V', tertiary: 'O' } },
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
			return `rotate:${a.args.handIndex}:${a.args.coord.q},${a.args.coord.r}:${a.args.rotation}`;
		case 'stashToTreasure':
			return `stash:${a.args.handIndex}`;
		case 'takeFromTreasure':
			return `take:${a.args.index}`;
		case 'endTurnAndRefill':
			return 'end';
	}
};

describe('imported-state', () => {
	it('matches expected actions', () => {
		const actual = enumerateActions(G, '0').map(actionKey).sort();
		const expected = [
  "play:0:B:3,-2->3,-1",
  "play:0:G:3,-2->2,-1",
  "play:0:O:1,-1->2,-2",
  "play:0:O:3,-2->4,-3",
  "play:0:R:0,0->1,0",
  "play:0:R:1,-1->2,-1",
  "play:0:R:1,-1->2,-2",
  "play:0:R:2,-2->1,-1",
  "play:0:R:2,-2->3,-2",
  "play:0:R:3,-2->4,-2",
  "play:0:V:3,-2->3,-3",
  "play:0:Y:0,0->-1,0",
  "play:0:Y:2,-2->1,-2",
  "take:0",
  "take:1",
  "take:2",
  "take:3",
  "end",
];
		expect(actual).toEqual([...expected].sort());
	});
	it('matches expected score deltas', () => {
		const baseScores = computeScoresRaw(G);
		const expectedScores = {};
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