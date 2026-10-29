import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import fixture from './fixtures/barren-wasteland-stall.json';
import { CARDS } from '../game/cards';
import { HexStringsGame } from '../game/game';
import { drawOne } from '../game/effects';
import { enumerateActions, selectBestAction, selectWithLookahead, selectDrawBlockEscape, type Action } from '../game/ai';
import type { Card, GState } from '../game/types';

// Playtest report (2026-10-29), with the exported game state in
// fixtures/barren-wasteland-stall.json (empty board tiles and the discard
// trimmed): "I press 'End my turn,' and it briefly flashes to the bots, which
// seem to take no action. Then it comes back to me, and I don't have any new
// cards." A Barren Wasteland draw block was live; it lifts only when EVERY
// hand is empty, and bot P2 never played its last card — so nobody drew again.
// P2's hidden card is unknown, so the tests try the cards that stalled bots.

const byId = (id: number): Card => ({ ...(CARDS as Card[]).find((c) => c.id === id)! });
const ctx = { currentPlayer: '2', playOrder: ['0', '1', '2'], numPlayers: 3, turn: 27, activePlayers: { '2': 'active' } } as unknown as Ctx;

const load = (card: Card): GState => {
	const G = JSON.parse(JSON.stringify(fixture)) as GState;
	G.players['2']!.hand = [card];
	G.secret.deck = Array.from({ length: 20 }, (_, i) => ({ ...byId(66), id: 900 + i }));
	return G;
};

type MoveFn = (context: { G: GState; ctx: Ctx; events: unknown; playerID: string }, args?: unknown) => unknown;
const activeMoves = (HexStringsGame.turn as unknown as {
	stages: Record<string, { moves: Record<string, MoveFn | { move: MoveFn }> }>;
}).stages.active!.moves;

/** Apply a bot's chosen action through the REAL engine move (not the simulator). */
const applyReal = (G: GState, action: Action): void => {
	const def = activeMoves[action.type]!;
	const move = typeof def === 'function' ? def : def.move; // short- or long-form move
	move({ G, ctx, events: { endTurn: () => {}, setActivePlayers: () => {} }, playerID: '2' }, 'args' in action ? action.args : undefined);
};

// Cards no bot could ever play before (their target was never generated) —
// with a full treasure they couldn't even be stashed.
const UNTARGETABLE_BEFORE = [
	[43, 'Help Yourself Out'],
	[54, 'Malfunction'],
	[73, 'Placebo'],
	[83, 'Re-examine Priorities'],
	[91, 'Seize the Opportunity'], // in this game it sits in the treasure, but the gap was the same
	[111, 'This Prey is Mine'],
] as const;

describe('Barren Wasteland stall: bots must empty their hand under a draw block', () => {
	for (const [id, name] of UNTARGETABLE_BEFORE) {
		it(`Eval+ plays ${name} through the real move, emptying every hand and lifting the block`, () => {
			const G = load(byId(id));
			const action = selectWithLookahead(G, ctx, '2') ?? selectDrawBlockEscape(G, ctx, '2');
			expect(action, `${name}: bot found no move`).not.toBeNull();
			applyReal(G, action!);
			expect(G.players['2']!.hand, `${name}: real move rejected or left the card in hand`).toHaveLength(0);
			// All hands empty → the next draw releases the block and succeeds.
			expect(drawOne(G, '0')).not.toBeNull();
			expect(G.action.hooks.some((h) => h.event === 'onDraw')).toBe(false);
		});
	}

	it('targeted cards are now enumerable at all (they were never offered before)', () => {
		for (const [id, name] of UNTARGETABLE_BEFORE) {
			const plays = enumerateActions(load(byId(id)), '2').filter((a) => a.type === 'playActionCard');
			expect(plays.length, name).toBeGreaterThan(0);
		}
	});

	it('the basic Evaluator sheds a card it would otherwise hold (below its value threshold)', () => {
		const G = load(byId(7)); // Appear as a Dead Loved One (G/Y): Evaluator declined it here
		expect(selectBestAction(G, ctx, '2')).toBeNull(); // the old turn-ending decision
		const escape = selectDrawBlockEscape(G, ctx, '2');
		expect(escape).not.toBeNull();
		applyReal(G, escape!);
		expect(G.players['2']!.hand).toHaveLength(0);
	});

	it('without a draw block the escape never overrides normal play', () => {
		const G = load(byId(7));
		G.action.hooks = [];
		expect(selectDrawBlockEscape(G, ctx, '2')).toBeNull();
	});
});
