import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { CARDS } from '../game/cards';
import { buildDeck, DIGITALLY_EXCLUDED_CARD_IDS } from '../game/deck';
import { resolveCardEffects } from '../game/cardActions';
import { initActionState, playActionCardFromHand } from '../game/effects';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import type { Card, GState } from '../game/types';
import { buildPlayers } from './testHelpers';

const byId = (id: number): Card => {
	const c = (CARDS as Card[]).find((x) => x.id === id);
	if (!c) throw new Error(`card ${id} missing`);
	return { ...c };
};

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;
const rules = {
	...MODE_RULESETS.path,
	RADIUS: 3,
	RANDOM_CARDINAL_DIRECTIONS: false,
	EDGE_COLORS,
	COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
};

describe('digital deck exclusions', () => {
	it('excludes cards whose mechanics do not exist digitally', () => {
		const deck = buildDeck(rules, () => 0.5);
		for (const id of DIGITALLY_EXCLUDED_CARD_IDS) {
			expect(deck.some((c) => c.id === id)).toBe(false);
		}
		// Everything else still present
		expect(deck.length).toBe((CARDS as Card[]).length - DIGITALLY_EXCLUDED_CARD_IDS.size);
	});
});

describe('Mystery Box (reveal → draft → auto-play)', () => {
	const setup = () => {
		const mysteryBox = byId(63);
		const armed = byId(8);   // action: draw 5 — auto-plays with no input
		const steal = byId(82);  // action: needs targetPlayerId — must stay in hand
		const filler = Array.from({ length: 6 }, (_, i) => ({
			colors: ['R', 'O'], id: 1000 + i, name: `F${i}`, stats: {}, text: null,
			isAction: false, synergies: [], synergyCount: 0,
			flags: { needsNewPrint: false, needsDuplicate: false },
		} as unknown as Card));

		// revealTop pops from the END of secret.deck: reveal 2 → [steal, armed].
		// Draft picks: P0 takes index 0 (steal? no —) …
		// revealed = [steal, armed]? pop order: last element first → deck ends
		// with [..., armed, steal] → revealed [steal, armed].
		const G = {
			rules,
			radius: rules.RADIUS,
			board: {},
			lanes: [],
			secret: { deck: [...filler, armed, steal] },
			discard: [],
			players: buildPlayers({ '0': [byId(63)], '1': [] }),
			treasure: [],
			stats: { placements: 0 },
			meta: { deckExhaustionCycle: null },
			origins: [{ q: 0, r: 0 }],
			action: initActionState(['0', '1']),
		} as unknown as GState;
		void mysteryBox;
		const ctx = { currentPlayer: '0', playOrder: ['0', '1'], numPlayers: 2, turn: 3 } as unknown as Ctx;
		return { G, ctx };
	};

	it('auto-plays a drafted no-input action card and keeps input-requiring ones in hand', () => {
		const { G, ctx } = setup();
		// P0 drafts revealed[1] (armed, auto-plays); P1 drafts revealed[0] (steal, stays)
		const effects = resolveCardEffects(G.players['0']!.hand[0]!, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			draftPicks: { '0': 1, '1': 0 },
			mode: 'path',
		});
		playActionCardFromHand(G, ctx, '0', 0, effects, () => 0.5);

		// P0: Mystery Box discarded, Armed drafted + auto-played (discarded) → drew 5
		expect(G.players['0']!.hand.map((c) => c.id)).not.toContain(8);
		expect(G.players['0']!.hand.length).toBe(5); // the 5 drawn cards
		expect(G.discard.map((c) => c.id)).toEqual(expect.arrayContaining([63, 8]));

		// P1: Steal needs a target → stays in hand, not discarded
		expect(G.players['1']!.hand.map((c) => c.id)).toContain(82);
		expect(G.discard.map((c) => c.id)).not.toContain(82);

		// Draft state cleaned up
		expect(G.action.revealed).toEqual([]);
		expect(G.action.draftedHandIndex['0']).toBeNull();
		expect(G.action.draftedHandIndex['1']).toBeNull();
	});

	it('non-action drafted cards simply stay in hand', () => {
		const { G, ctx } = setup();
		// P0 drafts steal-position (index 0) — wait: pick the NON-action filler by
		// rebuilding the deck tail: replace armed with a plain card.
		const plain = { colors: ['B'], id: 2000, name: 'Plain', stats: {}, text: null, isAction: false, synergies: [], synergyCount: 0, flags: { needsNewPrint: false, needsDuplicate: false } } as unknown as Card;
		G.secret.deck[G.secret.deck.length - 2] = plain; // becomes revealed[1]
		const effects = resolveCardEffects(G.players['0']!.hand[0]!, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			draftPicks: { '0': 1, '1': 0 },
			mode: 'path',
		});
		playActionCardFromHand(G, ctx, '0', 0, effects, () => 0.5);
		expect(G.players['0']!.hand.map((c) => c.id)).toContain(2000);
		expect(G.players['1']!.hand.map((c) => c.id)).toContain(82);
	});
});
