import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { CARDS } from '../../game/cards';
import { buildDeck, DIGITALLY_EXCLUDED_CARD_IDS } from '../../game/deck';
import { resolveCardEffects } from '../../game/cardActions';
import { initActionState } from '../../game/effects';
import { HexStringsGame } from '../../game/game';
import { canPlacePath, neighbors } from '../../game/helpers';
import { MODE_RULESETS, buildColorToDir } from '../../game/rulesConfig';
import type { Card, Co, Color, GState, MoveDraftPickArgs, MoveDraftPlaceArgs, MovePlayActionArgs } from '../../game/types';
import { buildPlayers } from '../testHelpers';

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

// ── Interactive draft flow ──────────────────────────────────────────────────
// Playtest report (2026-08-02): "Mystery box doesn't really work as intended."
// The old flow had the playing player blind-type numeric picks for everyone
// before the cards were even revealed. Now each player picks on their own
// client in turn order, and a picked lane card must be placed immediately.

type MoveFn<A> = (context: { G: GState; ctx: Ctx; events: unknown; playerID: string }, args: A) => unknown;
const stages = (HexStringsGame.turn as unknown as {
	stages: Record<string, { moves: Record<string, { move: MoveFn<never>; undoable?: boolean }> }>;
}).stages;
const playActionMove = stages.active!.moves.playActionCard!.move as MoveFn<MovePlayActionArgs>;
const draftPickDef = stages.draft!.moves.draftPick!;
const draftPlaceDef = stages.draft!.moves.draftPlace!;
const draftPickMove = draftPickDef.move as MoveFn<MoveDraftPickArgs>;
const draftPlaceMove = draftPlaceDef.move as MoveFn<MoveDraftPlaceArgs>;

const makeCtx = (): Ctx => ({ currentPlayer: '0', playOrder: ['0', '1'], numPlayers: 2, turn: 3 }) as unknown as Ctx;

const makeEvents = () => {
	const calls: unknown[] = [];
	return { calls, setActivePlayers: (arg: unknown) => calls.push(arg) };
};

const plainCard = (id: number, colors: Color[]): Card => ({
	colors, id, name: `Plain${id}`, stats: {}, text: null, isAction: false,
	synergies: [], synergyCount: 0, flags: { needsNewPrint: false, needsDuplicate: false },
} as unknown as Card);

const setup = (deckTail: Card[]) => {
	const filler = Array.from({ length: 6 }, (_, i) => plainCard(1000 + i, ['R', 'O'] as Color[]));
	const G = {
		rules,
		radius: rules.RADIUS,
		board: {},
		lanes: [],
		secret: { deck: [...filler, ...deckTail] },
		discard: [],
		players: buildPlayers({ '0': [byId(63)], '1': [] }),
		treasure: [],
		stats: { placements: 0 },
		meta: { deckExhaustionCycle: null },
		origins: [{ q: 0, r: 0 }],
		action: initActionState(['0', '1']),
	} as unknown as GState;
	const ctx = makeCtx();
	const events = makeEvents();
	const playMysteryBox = () => {
		const effects = resolveCardEffects(G.players['0']!.hand[0]!, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			mode: 'path',
		});
		playActionMove({ G, ctx, events, playerID: '0' }, { handIndex: 0, effects });
	};
	return { G, ctx, events, playMysteryBox };
};

const legalPlacementFor = (G: GState, card: Card): { source: Co; coord: Co; pick: Color } => {
	for (const pick of card.colors as Color[]) {
		const dir = G.rules.COLOR_TO_DIR[pick];
		for (const source of neighbors({ q: 0, r: 0 })) {
			const coord = { q: source.q + dir.q, r: source.r + dir.r };
			if (canPlacePath(G, source, coord, pick, G.rules)) return { source, coord, pick };
		}
	}
	throw new Error('no legal placement found');
};

describe('Mystery Box — interactive draft', () => {
	it('playing it reveals playerCount cards and hands control to the first picker', () => {
		// revealTop pops from the END of the deck: tail [armed, steal] reveals [steal, armed].
		const { G, events, playMysteryBox } = setup([byId(8), byId(82)]);
		playMysteryBox();
		expect(G.action.revealed).toHaveLength(2);
		expect(G.action.pendingDraft).toEqual({ order: ['0', '1'], position: 0, placing: null });
		expect(G.discard.map((c) => c.id)).toContain(63);
		expect(events.calls).toContainEqual({ value: { '0': 'draft' } });
	});

	it('neither draft move is undoable', () => {
		expect(draftPickDef.undoable).toBe(false);
		expect(draftPlaceDef.undoable).toBe(false);
	});

	it('a drafted no-input action card auto-plays; input-requiring ones stay in hand', () => {
		// tail [armed(8: draw 5), steal(82: needs target)] → revealed [82, 8]
		const { G, ctx, events, playMysteryBox } = setup([byId(8), byId(82)]);
		playMysteryBox();

		// P0 picks Armed to the Teeth (index 1) — auto-plays, draws 5.
		draftPickMove({ G, ctx, events, playerID: '0' }, { index: 1 });
		expect(G.players['0']!.hand.map((c) => c.id)).not.toContain(8);
		expect(G.players['0']!.hand).toHaveLength(5);
		expect(G.discard.map((c) => c.id)).toContain(8);
		expect(G.action.pendingDraft?.position).toBe(1);
		expect(events.calls).toContainEqual({ value: { '1': 'draft' } });

		// P1 picks Steal (index 0) — needs a target, stays in hand; draft ends.
		draftPickMove({ G, ctx, events, playerID: '1' }, { index: 0 });
		expect(G.players['1']!.hand.map((c) => c.id)).toContain(82);
		expect(G.discard.map((c) => c.id)).not.toContain(82);
		expect(G.action.pendingDraft).toBeNull();
		expect(G.action.revealed).toEqual([]);
		expect(events.calls).toContainEqual({ currentPlayer: 'active' });
	});

	it('a drafted lane card must be placed immediately', () => {
		const lane = plainCard(2000, ['B'] as Color[]);
		const { G, ctx, events, playMysteryBox } = setup([lane, byId(8)]);
		// revealed = [8, lane]
		playMysteryBox();

		draftPickMove({ G, ctx, events, playerID: '0' }, { index: 1 });
		expect(G.action.pendingDraft?.placing).toEqual({ playerId: '0', handIndex: 0 });

		// Normal moves are for the 'active' stage — the draft is its own stage,
		// so nothing else can happen until the placement lands.
		const placement = legalPlacementFor(G, lane);
		draftPlaceMove({ G, ctx, events, playerID: '0' }, placement);
		expect(G.lanes).toHaveLength(1);
		expect(G.lanes[0]!.color).toBe('B');
		expect(G.players['0']!.hand.map((c) => c.id)).not.toContain(2000);
		expect(G.discard.map((c) => c.id)).toContain(2000);
		expect(G.action.pendingDraft?.position).toBe(1);
	});

	it('rejects picks and placements from the wrong player', () => {
		const { G, ctx, events, playMysteryBox } = setup([byId(8), byId(82)]);
		playMysteryBox();

		// P1 tries to pick out of turn — nothing happens.
		draftPickMove({ G, ctx, events, playerID: '1' }, { index: 0 });
		expect(G.action.revealed).toHaveLength(2);
		expect(G.action.pendingDraft?.position).toBe(0);

		// Bad index — nothing happens.
		draftPickMove({ G, ctx, events, playerID: '0' }, { index: 5 });
		expect(G.action.revealed).toHaveLength(2);
	});

	it('rejects an illegal placement and keeps waiting for a legal one', () => {
		const lane = plainCard(2000, ['B'] as Color[]);
		const { G, ctx, events, playMysteryBox } = setup([lane, byId(8)]);
		playMysteryBox();
		draftPickMove({ G, ctx, events, playerID: '0' }, { index: 1 });

		draftPlaceMove({ G, ctx, events, playerID: '0' }, { source: { q: 3, r: 0 }, coord: { q: 3, r: -3 }, pick: 'B' });
		expect(G.lanes).toHaveLength(0);
		expect(G.action.pendingDraft?.placing).not.toBeNull();
	});
});
