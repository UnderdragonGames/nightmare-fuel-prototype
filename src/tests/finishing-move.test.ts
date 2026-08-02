import { describe, it, expect } from 'vitest';
import { canPlacePath, canConsolidate, buildAllCoords, key, ringIndex } from '../game/helpers';
import { enumerateActions } from '../game/ai';
import { PATH_RULES, buildColorToDir } from '../game/rulesConfig';
import { initActionState } from '../game/effects';
import type { Card, Co, Color, GState, HexTile, PathLane, Rules } from '../game/types';

/**
 * Regression for a real playtest board: green's chain (0,1)→(0,2)→(0,3)→
 * (-1,3)→(-1,4)→(-1,5) reaches the rim, so the finishing move from (0,1)
 * into the center origin must be legal — and must be offered even when the
 * player's card lists another color first (the UI used to hide it when the
 * auto-picked color wasn't green).
 */

// The playtest game had shuffled cardinal directions.
const EDGE_COLORS: Color[] = ['R', 'B', 'Y', 'G', 'V', 'O'];
const rules: Rules = {
	...PATH_RULES,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
};

const card = (id: number, colors: Color[]): Card => ({
	id,
	name: `test-${id}`,
	colors,
	stats: {},
	text: null,
	isAction: false,
	synergies: [],
	synergyCount: 0,
	flags: { needsNewPrint: false, needsDuplicate: false },
});

const makeState = (hand: Card[]): GState => {
	const board: Record<string, HexTile> = {};
	for (const c of buildAllCoords(5)) {
		board[key(c)] = { colors: [], rotation: 0, dead: c.q === 0 && c.r === 5 };
	}
	const lane = (fq: number, fr: number, tq: number, tr: number, color: Color): PathLane => ({
		from: { q: fq, r: fr },
		to: { q: tq, r: tr },
		color,
	});
	return {
		rules,
		radius: 5,
		board,
		lanes: [
			lane(1, -1, 2, -2, 'B'),
			lane(1, 0, 2, 0, 'Y'),
			lane(2, 0, 3, 0, 'Y'),
			lane(3, 0, 4, 0, 'Y'),
			lane(4, 0, 5, 0, 'Y'),
			lane(2, -2, 3, -3, 'B'),
			lane(0, 1, 0, 2, 'G'),
			lane(0, 2, 0, 3, 'G'),
			lane(0, 3, -1, 3, 'G'),
			lane(3, -3, 4, -4, 'B'),
			lane(4, -4, 5, -5, 'B'),
			lane(0, -1, 0, -2, 'R'),
			lane(0, -2, 0, -3, 'R'),
			lane(-1, 3, -1, 4, 'G'),
			lane(1, 0, 2, 0, 'Y'),
			lane(1, -1, 0, 0, 'B'), // blue already finished into the center
			lane(-1, 4, -1, 5, 'G'),
			lane(0, 1, 0, 2, 'G'),
		],
		discard: [],
		treasure: [],
		stats: { placements: 19 },
		meta: { deckExhaustionCycle: null, turn: 8 },
		origins: [{ q: 0, r: 0 }],
		action: initActionState(['0', '1']),
		players: {
			'0': { hand: [], prefs: { primary: 'B', secondary: 'R', tertiary: 'Y' }, nightmare: '', nightmareState: { abilityUsesRemaining: 0, handSizeBonus: 0 }, stashBonus: 0, actionPlaysThisTurn: 0 },
			'1': { hand, prefs: { primary: 'G', secondary: 'B', tertiary: 'Y' }, nightmare: '', nightmareState: { abilityUsesRemaining: 0, handSizeBonus: 0 }, stashBonus: 0, actionPlaysThisTurn: 0 },
		},
		secret: { deck: [] },
	};
};

const SRC: Co = { q: 0, r: 1 };
const CENTER: Co = { q: 0, r: 0 };

describe('origin finishing move (playtest regression)', () => {
	it('green chain reaches the rim', () => {
		const G = makeState([]);
		expect(ringIndex({ q: -1, r: 5 })).toBe(5);
		expect(G.lanes.some((l) => l.color === 'G' && ringIndex(l.to) === 5)).toBe(true);
	});

	it('allows the rim-connected color to finish into the center', () => {
		const G = makeState([]);
		expect(canPlacePath(G, SRC, CENTER, 'G', rules)).toBe(true);
	});

	it('rejects finishing with colors that are not rim-connected', () => {
		const G = makeState([]);
		for (const col of ['R', 'V', 'O'] as Color[]) {
			expect(canPlacePath(G, SRC, CENTER, col, rules)).toBe(false);
		}
	});

	it('a second path may finish into a center that already has one (no-intersect exempt)', () => {
		// Blue already finished (1,-1)→(0,0); green converging is still legal.
		const G = makeState([]);
		expect(G.lanes.some((l) => l.to.q === 0 && l.to.r === 0)).toBe(true);
		expect(canPlacePath(G, SRC, CENTER, 'G', rules)).toBe(true);
	});

	it('is enumerated for a card even when green is not its first color', () => {
		const G = makeState([card(1, ['R', 'G'])]);
		const finish = enumerateActions(G, '1').find(
			(a) =>
				a.type === 'playCard' &&
				!('convert' in a.args && a.args.convert) &&
				'source' in a.args &&
				a.args.source.q === SRC.q && a.args.source.r === SRC.r &&
				a.args.coord.q === CENTER.q && a.args.coord.r === CENTER.r,
		);
		expect(finish).toBeDefined();
		expect(finish && finish.type === 'playCard' ? finish.args.pick : null).toBe('G');
	});

	it('does not allow converting an unrelated path\'s center lane', () => {
		// The blue lane into the center is not on green's chain: no conversion.
		const G = makeState([]);
		expect(canConsolidate(G, { q: 1, r: -1 }, CENTER, 'B', 'G', rules)).toBe(false);
	});
});
