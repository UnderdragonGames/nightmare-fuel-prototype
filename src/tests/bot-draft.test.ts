import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { HexStringsGame } from '../game/game';
import { enumerateActions, playDraftStep } from '../game/ai';
import { CARDS } from '../game/cards';
import type { Card, GState, MoveDraftPickArgs, MoveDraftPlaceArgs, MovePlayActionArgs } from '../game/types';

// Playtest note (2026-08-06): "Why don't bots initiate those? They should play
// it if it's in their hand." Bots now enumerate reveal-and-pick cards and
// drive the picks themselves via playDraftStep.

const byId = (id: number): Card => ({ ...(CARDS as Card[]).find((c) => c.id === id)! });

type MoveFn<A> = (context: { G: GState; ctx: Ctx; events: unknown; playerID: string }, args: A) => unknown;
const stages = (HexStringsGame.turn as unknown as {
	stages: Record<string, { moves: Record<string, { move: MoveFn<never> }> }>;
}).stages;
const playActionMove = stages.active!.moves.playActionCard!.move as MoveFn<MovePlayActionArgs>;
const draftPickMove = stages.draft!.moves.draftPick!.move as MoveFn<MoveDraftPickArgs>;
const draftPlaceMove = stages.draft!.moves.draftPlace!.move as MoveFn<MoveDraftPlaceArgs>;

const makeCtx = (): Ctx => ({ currentPlayer: '0', playOrder: ['0', '1'], numPlayers: 2, turn: 3 }) as unknown as Ctx;
const events = { setActivePlayers: () => {} };

const setupWith = (card: Card): GState => {
	const G = (HexStringsGame.setup as (c: { ctx: Ctx }) => GState)({ ctx: makeCtx() });
	G.players['0']!.hand = [card];
	return G;
};

/** Client-shaped shim: playDraftStep drives the REAL draft moves against G. */
const fakeClient = (G: GState, seat: string) => ({
	getState: () => ({
		G,
		ctx: {
			...makeCtx(),
			activePlayers: { [seat]: 'draft' },
		} as unknown as Ctx,
	}),
	moves: {
		draftPick: (a: MoveDraftPickArgs) => draftPickMove({ G, ctx: makeCtx(), events, playerID: seat }, a),
		draftPlace: (a: MoveDraftPlaceArgs) => draftPlaceMove({ G, ctx: makeCtx(), events, playerID: seat }, a),
	} as never,
});

describe('bots initiate reveal-and-pick cards', () => {
	it('enumerates Alter Fate and Mystery Box as playable actions', () => {
		for (const id of [4, 63]) {
			const G = setupWith(byId(id));
			const actions = enumerateActions(G, '0');
			const drafts = actions.filter(
				(a) => a.type === 'playActionCard' && (a.args.effects ?? []).some((e) => e.type === 'beginDraft'),
			);
			expect(drafts.length, `card ${id}`).toBeGreaterThan(0);
		}
	});

	it('plays Alter Fate end-to-end: reveal, bot picks to hand, rest discarded', () => {
		const G = setupWith(byId(4));
		const action = enumerateActions(G, '0').find(
			(a) => a.type === 'playActionCard' && (a.args.effects ?? []).some((e) => e.type === 'beginDraft'),
		)!;
		expect(action.type).toBe('playActionCard');
		playActionMove({ G, ctx: makeCtx(), events, playerID: '0' }, (action as { args: MovePlayActionArgs }).args);
		expect(G.action.pendingDraft).toMatchObject({ order: ['0'], take: 'hand' });

		const acted = playDraftStep(fakeClient(G, '0') as never, '0');
		expect(acted).toBe(true);
		expect(G.action.pendingDraft).toBeNull();
		expect(G.players['0']!.hand).toHaveLength(1); // the kept pick
		expect(G.action.revealed).toEqual([]);
	});

	it('drives a Mystery Box lane pick through placement', () => {
		const G = setupWith(byId(63));
		const action = enumerateActions(G, '0').find(
			(a) => a.type === 'playActionCard' && (a.args.effects ?? []).some((e) => e.type === 'beginDraft'),
		)!;
		playActionMove({ G, ctx: makeCtx(), events, playerID: '0' }, (action as { args: MovePlayActionArgs }).args);
		const draft = G.action.pendingDraft;
		expect(draft).not.toBeNull();

		// Step until this bot's participation resolves (pick, then place if the
		// pick was a lane card). Cap generously — each step must make progress.
		let steps = 0;
		while (G.action.pendingDraft && G.action.pendingDraft.order[G.action.pendingDraft.position] === '0' && steps < 5) {
			const acted = playDraftStep(fakeClient(G, '0') as never, '0');
			expect(acted).toBe(true);
			steps += 1;
		}
		// The draft is either finished or waiting on the OTHER player — never
		// stuck on the bot that initiated it.
		const after = G.action.pendingDraft;
		expect(after === null || after.order[after.position] === '1' || after.placing?.playerId === '1').toBe(true);
	});
});
