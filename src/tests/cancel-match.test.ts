import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { HexStringsGame } from '../game/game';
import type { GState } from '../game/types';

type MoveFn = (context: { G: GState; ctx: Ctx; playerID?: string }) => unknown;

const makeCtx = (currentPlayer = '0'): Ctx =>
	({ currentPlayer, playOrder: ['0', '1'], numPlayers: 2, turn: 3 }) as unknown as Ctx;

const setupGame = (): GState =>
	(HexStringsGame.setup as (c: { ctx: Ctx }) => GState)({ ctx: makeCtx() });

const turnConfig = HexStringsGame.turn as unknown as {
	activePlayers: Record<string, string>;
	stages: Record<string, { moves: Record<string, MoveFn | { move: MoveFn }> }>;
};

const stageMove = (stage: string, name: string): MoveFn => {
	const entry = turnConfig.stages[stage]!.moves[name]!;
	return typeof entry === 'function' ? entry : entry.move;
};

const endIf = HexStringsGame.endIf as (c: { G: GState; ctx: Ctx }) => { cancelled?: boolean; by?: string } | undefined;

describe('cancelMatch', () => {
	it('is available to both the active player and observers', () => {
		expect(turnConfig.stages.active!.moves.cancelMatch).toBeDefined();
		expect(turnConfig.stages.observing!.moves.cancelMatch).toBeDefined();
		// Non-current players must be placed in the observing stage to use it.
		expect(turnConfig.activePlayers).toEqual({ currentPlayer: 'active', others: 'observing' });
	});

	it('records the cancelling player and ends the game via endIf', () => {
		const G = setupGame();
		const ctx = makeCtx();
		expect(endIf({ G, ctx })).toBeUndefined();

		// A non-current player cancels from the observing stage.
		stageMove('observing', 'cancelMatch')({ G, ctx, playerID: '1' });
		expect(G.meta.cancelledBy).toBe('1');

		const result = endIf({ G, ctx });
		expect(result?.cancelled).toBe(true);
		expect(result?.by).toBe('1');
	});

	it('falls back to the current player when the move context has no playerID', () => {
		const G = setupGame();
		const ctx = makeCtx('0');
		stageMove('active', 'cancelMatch')({ G, ctx });
		expect(G.meta.cancelledBy).toBe('0');
	});
});
