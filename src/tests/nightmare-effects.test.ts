import { describe, it, expect } from 'vitest';
import type { GState, PlayerID } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { initActionState } from '../game/effects';
import { applyNightmareActions } from '../game/effects';
import { makeCard } from '../game/cardFactory';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

const baseRules = {
	...MODE_RULESETS.path,
	RADIUS: 3,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
};

const createState = (playerIds: PlayerID[]): GState => ({
	rules: { ...baseRules },
	radius: baseRules.RADIUS,
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
	action: initActionState(playerIds),
});

describe('nightmare effects', () => {
	it('randomizes color directions deterministically with rng', () => {
		const G = createState(['0']);
		applyNightmareActions(G, [{ type: 'randomizeColorDirections' }], {
			currentPlayer: '0',
			rng: () => 0,
		});
		expect(G.rules.EDGE_COLORS).toEqual(['G', 'B', 'V', 'R', 'O', 'Y']);
		expect(G.rules.COLOR_TO_DIR['G']).toEqual(buildColorToDir(G.rules.EDGE_COLORS)['G']);
	});

	it('fills treasure to max', () => {
		const G = createState(['0']);
		G.rules.TREASURE_MAX = 3;
		G.treasure = [makeCard(['R'])];
		G.deck = [makeCard(['G']), makeCard(['B']), makeCard(['O'])];
		applyNightmareActions(G, [{ type: 'fillTreasureToMax' }], { currentPlayer: '0' });
		expect(G.treasure.length).toBe(3);
		expect(G.deck.length).toBe(1);
	});

	it('destroys a connected path component', () => {
		const G = createState(['0']);
		G.lanes = [
			{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' },
			{ from: { q: 1, r: 0 }, to: { q: 2, r: 0 }, color: 'B' },
			{ from: { q: 2, r: 0 }, to: { q: 3, r: 0 }, color: 'B' },
		];
		applyNightmareActions(G, [{ type: 'destroyPath' }], {
			currentPlayer: '0',
			coord: { q: 1, r: 0 },
		});
		expect(G.lanes.length).toBe(0);
	});

	it('removes a single lane and recolors another', () => {
		const G = createState(['0']);
		G.lanes = [
			{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' },
			{ from: { q: 1, r: 0 }, to: { q: 2, r: 0 }, color: 'B' },
		];
		applyNightmareActions(G, [{ type: 'removeLane' }], { currentPlayer: '0', laneIndex: 0 });
		applyNightmareActions(G, [{ type: 'changeLaneColor' }], { currentPlayer: '0', laneIndex: 0, color: 'R' });
		expect(G.lanes.length).toBe(1);
		expect(G.lanes[0]?.color).toBe('R');
	});

	it('destroys a node by clearing lanes and marking dead', () => {
		const G = createState(['0']);
		G.lanes = [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' }];
		applyNightmareActions(G, [{ type: 'destroyNode' }], { currentPlayer: '0', coord: { q: 1, r: 0 } });
		expect(G.lanes.length).toBe(0);
		expect(G.board['1,0']?.dead).toBe(true);
	});

	it('swaps secondary and tertiary prefs', () => {
		const G = createState(['0']);
		G.prefs['0'] = { primary: 'R', secondary: 'G', tertiary: 'B' };
		applyNightmareActions(G, [{ type: 'swapPrefsSecondaryTertiary' }], { currentPlayer: '0' });
		expect(G.prefs['0']).toEqual({ primary: 'R', secondary: 'B', tertiary: 'G' });
	});

	it('increases hand size bonus', () => {
		const G = createState(['0']);
		G.nightmareState['0'] = { abilityUsesRemaining: 1, handSizeBonus: 0 };
		applyNightmareActions(G, [{ type: 'increaseHandSize', amount: 1 }], { currentPlayer: '0' });
		expect(G.nightmareState['0']?.handSizeBonus).toBe(1);
	});
});
