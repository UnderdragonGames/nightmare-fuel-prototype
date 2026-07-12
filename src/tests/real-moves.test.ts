import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { HexStringsGame } from '../game/game';
import { enumerateActions, applyMicroAction, type Action } from '../game/ai';
import { resolveCardEffects } from '../game/cardActions';
import type { GState } from '../game/types';

/**
 * Tests for the REAL boardgame.io move implementations in game.ts.
 * Everything else in the suite exercises ai.ts's simulator; these tests hit
 * the actual move handlers and assert the simulator stays in lockstep.
 */

type MoveFn = (context: { G: GState; ctx: Ctx; events?: Record<string, unknown> }, args?: unknown) => unknown;

const gameMoves = (HexStringsGame.turn as unknown as { stages: { active: { moves: Record<string, MoveFn | { move: MoveFn }> } } })
	.stages.active.moves;

const realMove = (name: string, G: GState, ctx: Ctx, args?: unknown): void => {
	const entry = gameMoves[name]!;
	const fn = typeof entry === 'function' ? entry : entry.move;
	fn({ G, ctx, events: {} }, args);
};

const makeCtx = (currentPlayer = '0'): Ctx =>
	({ currentPlayer, playOrder: ['0', '1'], numPlayers: 2, turn: 3 }) as unknown as Ctx;

const setupGame = (): GState => {
	const G = (HexStringsGame.setup as (c: { ctx: Ctx }) => GState)({ ctx: makeCtx() });
	// tsx/vitest env may leave ACTION_CARDS at its default; pin for determinism
	return { ...G, rules: { ...G.rules, ACTION_CARDS: 'one-per-turn' } };
};

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const executeReal = (G: GState, ctx: Ctx, action: Action): void => {
	// String-keyed dispatch: the real moves accept the same names as Action
	// types, and this stays compatible as new action types (playActionCard)
	// land from the AI branch.
	if (action.type === 'endTurnAndRefill') realMove('endTurnAndRefill', G, ctx);
	else realMove(action.type, G, ctx, 'args' in action ? action.args : undefined);
};

describe('real moves: basic lifecycle', () => {
	it('playCard places a lane, consumes and discards the card', () => {
		const G = setupGame();
		const ctx = makeCtx();
		const place = enumerateActions(G, '0').find((a) => a.type === 'playCard');
		expect(place).toBeDefined();
		const handBefore = G.players['0']!.hand.length;
		const lanesBefore = G.lanes.length;

		executeReal(G, ctx, place!);

		expect(G.lanes.length).toBe(lanesBefore + 1);
		expect(G.players['0']!.hand.length).toBe(handBefore - 1);
		expect(G.discard.length).toBe(1);
		expect(G.stats.placements).toBe(1);
	});

	it('rejects an illegal playCard (state unchanged)', () => {
		const G = setupGame();
		const ctx = makeCtx();
		const before = JSON.stringify(G);
		// Origin as destination with no rim-connected color is never legal
		realMove('playCard', G, ctx, { handIndex: 0, pick: G.players['0']!.hand[0]!.colors[0], source: { q: 1, r: 0 }, coord: { q: 0, r: 0 } });
		expect(JSON.stringify(G)).toBe(before);
	});

	it('stashToTreasure banks a bonus draw instead of drawing immediately', () => {
		const G = setupGame();
		const ctx = makeCtx();
		const deckBefore = G.secret.deck.length;
		realMove('stashToTreasure', G, ctx, { handIndex: 0 });
		expect(G.treasure.length).toBe(1);
		expect(G.players['0']!.hand.length).toBe(G.rules.HAND_SIZE - 1); // no immediate draw
		expect(G.secret.deck.length).toBe(deckBefore); // deck untouched until end of turn
		expect(G.players['0']!.stashBonus).toBe(1);
	});

	it('takeFromTreasure moves the card into hand', () => {
		const G = setupGame();
		const ctx = makeCtx();
		realMove('stashToTreasure', G, ctx, { handIndex: 0 });
		const stashed = G.treasure[0]!;
		realMove('takeFromTreasure', G, ctx, { index: 0 });
		expect(G.treasure.length).toBe(0);
		expect(G.players['0']!.hand.some((c) => c === undefined ? false : JSON.stringify(c) === JSON.stringify(stashed))).toBe(true);
	});

	it('playActionCard applies effects and enforces one-per-turn', () => {
		const G = setupGame();
		const ctx = makeCtx();
		// Give P0 a known no-input action card: Armed to the Teeth (draw 5)
		const armed = G.secret.deck.find((c) => c.id === 8) ?? { ...G.secret.deck[0]!, id: 8, name: 'Armed to the Teeth', isAction: true, colors: [] };
		G.players['0']!.hand = [clone(armed), clone(armed)];
		const effects = resolveCardEffects(G.players['0']!.hand[0]!, {
			currentPlayerId: '0', playerOrder: ['0', '1'], mode: G.rules.MODE,
		});
		realMove('playActionCard', G, ctx, { handIndex: 0, effects });
		expect(G.players['0']!.hand.length).toBe(1 + 5); // second copy + 5 drawn
		expect(G.players['0']!.actionPlaysThisTurn).toBe(1);

		// Second action card this turn is rejected
		const before = JSON.stringify(G);
		realMove('playActionCard', G, ctx, { handIndex: 0, effects });
		expect(JSON.stringify(G)).toBe(before);
	});

	it('endTurnAndRefill refills to HAND_SIZE plus banked stash bonus', () => {
		const G = setupGame();
		const ctx = makeCtx();
		realMove('stashToTreasure', G, ctx, { handIndex: 0 }); // stashBonus 1
		G.players['0']!.hand.splice(0, 2); // burn two cards
		realMove('endTurnAndRefill', G, ctx);
		expect(G.players['0']!.hand.length).toBe(G.rules.HAND_SIZE + 1);
		expect(G.players['0']!.stashBonus).toBe(0); // bonus consumed
	});

	it('deck exhaustion marks the cycle and endIf fires after equal turns', () => {
		const G = setupGame();
		const ctx = makeCtx();
		G.secret.deck = []; // exhaust
		realMove('endTurnAndRefill', G, ctx);
		expect(G.meta.deckExhaustionCycle).not.toBeNull();

		const endIf = HexStringsGame.endIf as (c: { G: GState; ctx: Ctx }) => unknown;
		// Not over immediately under EQUAL_TURNS…
		expect(endIf({ G, ctx: { ...ctx, turn: G.meta.deckExhaustionCycle! } as Ctx })).toBeUndefined();
		// …but over once everyone had equal turns since exhaustion
		expect(endIf({ G, ctx: { ...ctx, turn: G.meta.deckExhaustionCycle! + 2 } as Ctx })).toBeTruthy();
	});
});

describe('simulator parity: applyMicroAction matches real moves', () => {
	it('every enumerated action produces identical state in sim and real move', () => {
		// Walk a few games forward with real moves, checking parity at each step.
		for (let game = 0; game < 3; game += 1) {
			let G = setupGame();
			const ctx = makeCtx();
			let checked = 0;

			for (let step = 0; step < 12; step += 1) {
				const actions = enumerateActions(G, '0')
					// Random effects (steal/discard) can't be compared bit-for-bit;
					// everything else must match exactly. (playActionCard is only
					// enumerated on the AI branch; compare by string to stay
					// forward-compatible.)
					.filter((a) => !((a.type as string) === 'playActionCard' && JSON.stringify('args' in a ? a.args : {}).includes('random')));

				for (const action of actions) {
					if (action.type === 'endTurnAndRefill') continue;
					const gReal = clone(G);
					const gSim = applyMicroAction(clone(G), action, '0');
					executeReal(gReal, ctx, action);

					if (gSim === null) {
						// Simulator rejected: the real move must be a no-op too
						expect(JSON.stringify(gReal), `real accepted but sim rejected: ${JSON.stringify(action)}`).toBe(JSON.stringify(G));
					} else {
						expect(JSON.stringify(gSim), `sim/real divergence on: ${JSON.stringify(action).slice(0, 120)}`).toBe(JSON.stringify(gReal));
					}
					checked += 1;
				}

				// Advance the real game by one action (or end turn) so later steps
				// check parity on deeper states.
				const progress = actions.find((a) => a.type === 'playCard') ?? actions[0];
				if (!progress) break;
				executeReal(G, ctx, progress);
				if (step % 4 === 3) {
					realMove('endTurnAndRefill', G, ctx);
					(ctx as { currentPlayer: string }).currentPlayer = '0'; // keep checking P0
				}
			}
			expect(checked).toBeGreaterThan(20);
		}
	});
});
