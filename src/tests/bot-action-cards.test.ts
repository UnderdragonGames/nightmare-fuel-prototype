import { describe, it, expect } from 'vitest';
import { enumerateActions, applyMicroAction } from '../game/ai';
import { CARDS } from '../game/cards';
import { initActionState } from '../game/effects';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import type { Card, GState } from '../game/types';
import { buildPlayers } from './testHelpers';

const byId = (id: number): Card => ({ ...(CARDS as Card[]).find((x) => x.id === id)! });

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;
const rules = {
	...MODE_RULESETS.path,
	RADIUS: 3,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
	ACTION_CARDS: 'one-per-turn' as const,
};

const makeG = (hand: Card[]): GState => ({
	rules,
	radius: rules.RADIUS,
	board: {},
	lanes: [],
	secret: { deck: Array.from({ length: 8 }, (_, i) => ({ colors: ['R', 'O'], id: 900 + i, name: `D${i}`, stats: {}, text: null, isAction: false, synergies: [], synergyCount: 0, flags: { needsNewPrint: false, needsDuplicate: false } } as unknown as Card)) },
	discard: [],
	players: buildPlayers({ '0': hand, '1': [byId(8)] }),
	treasure: [],
	stats: { placements: 0 },
	meta: { deckExhaustionCycle: null },
	origins: [{ q: 0, r: 0 }],
	action: initActionState(['0', '1']),
} as unknown as GState);

describe('bots enumerate and play action cards', () => {
	it('enumerates a no-input action card (Armed to the Teeth: draw 5)', () => {
		const G = makeG([byId(8)]);
		const acts = enumerateActions(G, '0').filter((a) => a.type === 'playActionCard');
		expect(acts.length).toBe(1);

		const next = applyMicroAction(G, acts[0]!, '0');
		expect(next).not.toBeNull();
		expect(next!.players['0']!.hand.length).toBe(5); // played the card, drew 5
		expect(next!.discard.map((c) => c.id)).toContain(8);
		expect(next!.players['0']!.actionPlaysThisTurn).toBe(1);
	});

	it('enumerates Steal once per opponent target', () => {
		const G = makeG([byId(82)]);
		const acts = enumerateActions(G, '0').filter((a) => a.type === 'playActionCard');
		expect(acts.length).toBe(1); // one opponent → one action

		const next = applyMicroAction(G, acts[0]!, '0');
		expect(next).not.toBeNull();
		// Stole opponent's only card
		expect(next!.players['1']!.hand.length).toBe(0);
		expect(next!.players['0']!.hand.map((c) => c.id)).toContain(8);
	});

	it('enumerates each option of a choice card (Combo)', () => {
		const G = makeG([byId(19)]);
		const acts = enumerateActions(G, '0').filter((a) => a.type === 'playActionCard');
		expect(acts.length).toBeGreaterThanOrEqual(2); // distinct choice options
	});

	it('respects the one-per-turn limit in simulation', () => {
		const G = makeG([byId(8), byId(8)]);
		const acts = enumerateActions(G, '0').filter((a) => a.type === 'playActionCard');
		const afterFirst = applyMicroAction(G, acts[0]!, '0')!;
		const actsAfter = enumerateActions(afterFirst, '0').filter((a) => a.type === 'playActionCard');
		expect(actsAfter.length).toBe(0); // limit consumed

		// And applying anyway is rejected
		expect(applyMicroAction(afterFirst, acts[0]!, '0')).toBeNull();
	});

	it('skips coord-targeting cards it cannot contextualize (Malfunction)', () => {
		const G = makeG([byId(54)]);
		const acts = enumerateActions(G, '0').filter((a) => a.type === 'playActionCard');
		expect(acts.length).toBe(0);
	});

	it('does not enumerate action cards when disabled', () => {
		const G = makeG([byId(8)]);
		(G.rules as { ACTION_CARDS: string }).ACTION_CARDS = 'disabled';
		const acts = enumerateActions(G, '0').filter((a) => a.type === 'playActionCard');
		expect(acts.length).toBe(0);
	});
});
