import { describe, it, expect } from 'vitest';
import { enumerateActions, type Action } from './ai';
import type { Card, Co, GState, PlayerID, Rules } from './types';
import { PATH_RULES, HEX_RULES, buildColorToDir, BASE_EDGE_COLORS } from './rulesConfig';
import { key } from './helpers';
import { makeCard } from './cardFactory';
import { initActionState } from './effects';

const TEST_PATH_RULES: Rules = {
	...PATH_RULES,
	RADIUS: 1,
	RANDOM_CARDINAL_DIRECTIONS: false,
	COLOR_TO_DIR: buildColorToDir(BASE_EDGE_COLORS),
};

const TEST_HEX_RULES: Rules = {
	...HEX_RULES,
	RADIUS: 1,
	RANDOM_CARDINAL_DIRECTIONS: false,
	COLOR_TO_DIR: buildColorToDir(BASE_EDGE_COLORS),
	PLACEMENT: {
		...HEX_RULES.PLACEMENT,
		DISCARD_TO_ROTATE: 'match-color',
	},
};

const createTestState = (overrides: Partial<GState> = {}): GState => {
	const rules = overrides.rules ?? TEST_PATH_RULES;
	return {
		rules,
		radius: rules.RADIUS,
		board: {},
		lanes: [],
		deck: [],
		discard: [],
		hands: {},
		treasure: [],
		prefs: {},
		nightmares: {},
		nightmareState: {},
		stats: { placements: 0 },
		meta: { deckExhaustionCycle: null, stashBonus: {}, actionPlaysThisTurn: {} },
		origins: [{ q: 0, r: 0 }],
		action: initActionState([]),
		...overrides,
	};
};

const co = (q: number, r: number): Co => ({ q, r });

const setTile = (G: GState, coord: Co, colors: Card['colors'], rotation = 0): void => {
	G.board[key(coord)] = { colors: [...colors], rotation, dead: false };
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

const play = (handIndex: number, pick: Card['colors'][number], source: Co, dest: Co): string =>
	actionKey({ type: 'playCard', args: { handIndex, pick, source, coord: dest } });

const rotate = (handIndex: number, coord: Co, rotation: number): string =>
	actionKey({ type: 'rotateTile', args: { handIndex, coord, rotation } });

const stash = (handIndex: number): string => actionKey({ type: 'stashToTreasure', args: { handIndex } });
const end = (): string => actionKey({ type: 'endTurnAndRefill' });

const enumerateKeys = (G: GState, playerID: PlayerID): string[] =>
	enumerateActions(G, playerID).map(actionKey).sort();

const expectExact = (actual: string[], expected: string[]): void => {
	expect(actual).toEqual([...expected].sort());
};

const expectAbsent = (actual: string[], forbidden: string[]): void => {
	for (const key of forbidden) {
		expect(actual).not.toContain(key);
	}
};

describe('enumerateActions', () => {
	it('path mode: simple origin-only placements + stash + end', () => {
		const G = createTestState({
			hands: { '0': [makeCard(['B', 'O'])] },
		});

		const allowed = [
			play(0, 'B', co(0, 0), co(1, 0)), // B = E
			play(0, 'O', co(0, 0), co(-1, 0)), // O = NW
			stash(0),
			end(),
		];
		const forbidden = [
			play(0, 'B', co(0, 0), co(0, 1)), // off-direction for B
			play(0, 'O', co(0, 0), co(1, 0)), // off-direction for O
		];

		const actual = enumerateKeys(G, '0');
		expectExact(actual, allowed);
		expectAbsent(actual, forbidden);
	});

	it('hex mode: rotateTile only when discard card matches tile color', () => {
		const G = createTestState({
			rules: TEST_HEX_RULES,
			origins: [],
			hands: { '0': [makeCard(['R']), makeCard(['B'])] },
		});
		setTile(G, co(0, 0), ['B'], 0);

		const allowed = [
			rotate(1, co(0, 0), 1),
			rotate(1, co(0, 0), 2),
			rotate(1, co(0, 0), 4),
			rotate(1, co(0, 0), 5),
			stash(0),
			stash(1),
			end(),
		];
		const forbidden = [
			rotate(0, co(0, 0), 1),
			rotate(0, co(0, 0), 2),
			rotate(0, co(0, 0), 4),
			rotate(0, co(0, 0), 5),
		];

		const actual = enumerateKeys(G, '0');
		expectExact(actual, allowed);
		expectAbsent(actual, forbidden);
	});
});
