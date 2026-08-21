import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { HexStringsGame } from '../../game/game';
import type { GState, MoveDraftPickArgs } from '../../game/types';
import { byId, makeState, playAction } from './cardTestUtils';

// Playtest report (2026-08-06): "that card should bring up a little selector
// for the top five cards of the deck." The old flow required a blind numeric
// pick BEFORE the reveal; now it opens the interactive reveal-and-pick.

type MoveFn<A> = (context: { G: GState; ctx: Ctx; events: unknown; playerID: string }, args: A) => unknown;
const stages = (HexStringsGame.turn as unknown as {
	stages: Record<string, { moves: Record<string, { move: MoveFn<never> }> }>;
}).stages;
const draftPickMove = stages.draft!.moves.draftPick!.move as MoveFn<MoveDraftPickArgs>;

const ctx2 = { currentPlayer: '0', playOrder: ['0', '1'], numPlayers: 2, turn: 3 } as unknown as Ctx;
const makeEvents = () => {
	const calls: unknown[] = [];
	return { calls, setActivePlayers: (arg: unknown) => calls.push(arg) };
};

describe('#4 Alter Fate', () => {
	it('reveals 5 for a solo hand-pick; the pick is kept and the rest discarded', () => {
		const G = makeState({ hands: { '0': [byId(4)], '1': [] } });
		const deckBefore = G.secret.deck.length;
		const topCard = G.secret.deck[G.secret.deck.length - 1]!; // revealed first
		const events = makeEvents();

		playAction(G, '0', 0, {});
		expect(G.secret.deck.length).toBe(deckBefore - 5);
		expect(G.action.revealed).toHaveLength(5);
		expect(G.action.pendingDraft).toMatchObject({
			order: ['0'],
			position: 0,
			take: 'hand',
			title: 'Alter Fate',
		});

		draftPickMove({ G, ctx: ctx2, events, playerID: '0' }, { index: 0 });
		expect(G.players['0']!.hand.map((c) => c.id)).toContain(topCard.id);
		expect(G.players['0']!.hand).toHaveLength(1);
		// 4 unpicked revealed cards + the played Alter Fate itself
		expect(G.discard).toHaveLength(5);
		expect(G.action.revealed).toEqual([]);
		expect(G.action.pendingDraft).toBeNull();
		expect(events.calls).toContainEqual({ currentPlayer: 'active' });
	});

	it('a picked action card is kept, not auto-played (take: hand)', () => {
		const G = makeState({ hands: { '0': [byId(4)], '1': [] } });
		// Put a draw-5 action card on top of the deck (revealed index 0).
		G.secret.deck.push(byId(8));
		const events = makeEvents();
		playAction(G, '0', 0, {});
		draftPickMove({ G, ctx: ctx2, events, playerID: '0' }, { index: 0 });
		expect(G.players['0']!.hand.map((c) => c.id)).toContain(8);
		expect(G.players['0']!.hand).toHaveLength(1); // kept, not played (no 5 drawn cards)
	});
});
