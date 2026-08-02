import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { HexStringsGame } from '../game/game';
import type { GState } from '../game/types';

type MoveFn = (context: { G: GState; ctx: Ctx; playerID?: string }, args?: { by?: string }) => unknown;

const makeCtx = (currentPlayer = '0'): Ctx =>
	({ currentPlayer, playOrder: ['0', '1'], numPlayers: 2, turn: 3 }) as unknown as Ctx;

const setupGame = (): GState =>
	(HexStringsGame.setup as (c: { ctx: Ctx }) => GState)({ ctx: makeCtx() });

const turnConfig = HexStringsGame.turn as unknown as {
	activePlayers: Record<string, string>;
	stages: Record<string, { moves: Record<string, MoveFn | { move: MoveFn; undoable?: boolean }> }>;
};

const cancelEntry = turnConfig.stages.active!.moves.cancelMatch!;
const cancelMove: MoveFn = typeof cancelEntry === 'function' ? cancelEntry : cancelEntry.move;

const endIf = HexStringsGame.endIf as (c: { G: GState; ctx: Ctx }) => { cancelled?: boolean; by?: string } | undefined;

describe('cancelMatch', () => {
	it('keeps exactly one active player so multiplayer undo stays available', () => {
		// boardgame.io rejects UNDO server-side whenever more than one player is
		// in activePlayers — non-current players cancel via the server endpoint.
		expect(turnConfig.activePlayers).toEqual({ currentPlayer: 'active' });
		expect(cancelEntry).toBeDefined();
		expect(typeof cancelEntry === 'object' && cancelEntry.undoable).toBe(false);
	});

	it('records the cancelling player and ends the game via endIf', () => {
		const G = setupGame();
		const ctx = makeCtx('0');
		expect(endIf({ G, ctx })).toBeUndefined();

		// Server endpoint path: current player performs the move on behalf of
		// the non-current requester, attributed via args.by.
		cancelMove({ G, ctx, playerID: '0' }, { by: '1' });
		expect(G.meta.cancelledBy).toBe('1');

		const result = endIf({ G, ctx });
		expect(result?.cancelled).toBe(true);
		expect(result?.by).toBe('1');
	});

	it('falls back to the acting player when no valid attribution is given', () => {
		const G = setupGame();
		cancelMove({ G, ctx: makeCtx('0'), playerID: '0' }, { by: 'not-a-player' });
		expect(G.meta.cancelledBy).toBe('0');

		const G2 = setupGame();
		cancelMove({ G: G2, ctx: makeCtx('0') });
		expect(G2.meta.cancelledBy).toBe('0');
	});
});
