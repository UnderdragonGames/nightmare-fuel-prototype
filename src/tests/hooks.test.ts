import { describe, it, expect } from 'vitest';
import type { GState, HookDef } from '../game/types';
import { emitEvent, registerHook, removeHooksBySource } from '../game/hooks';
import { initActionState, applyGameEffects, drawOne, resolveDrawHooksIfReady } from '../game/effects';
import { resolveCardEffects } from '../game/cardActions';
import { CARDS } from '../game/cards';
import { buildPlayers } from './testHelpers';

const makeMinimalG = (playerIds: string[] = ['0', '1']): GState => {
	const hands: Record<string, any[]> = {};
	for (const pid of playerIds) {
		hands[pid] = [];
	}
	return {
		rules: {} as any,
		radius: 3,
		board: {},
		lanes: [],
		discard: [],
		treasure: [],
		stats: { placements: 0 },
		meta: {
			deckExhaustionCycle: null,
		},
		origins: [{ q: 0, r: 0 }],
		action: initActionState(playerIds),
		players: buildPlayers(hands, { prefs: { primary: 'R', secondary: 'G', tertiary: 'B' }, nightmare: 'test' }),
		secret: { deck: [] },
	} as GState;
};

const makeHook = (overrides: Partial<HookDef> = {}): HookDef => ({
	id: 'test-hook',
	event: 'onTurnStart',
	sourceCardId: 999,
	behavior: 'block',
	oneShot: true,
	sideEffects: [],
	...overrides,
});

describe('hook system', () => {
	describe('emitEvent', () => {
		it('returns not blocked when no hooks match', () => {
			const G = makeMinimalG();
			const result = emitEvent(G, { type: 'onTurnStart', playerId: '0' });
			expect(result.blocked).toBe(false);
			expect(result.firedHookIds).toEqual([]);
		});

		it('single block hook blocks and fires side effects', () => {
			const G = makeMinimalG();
			G.action.attachedCards = [{ card: { id: 50 } as any, targetPlayerId: '0' }];
			registerHook(G, makeHook({
				id: 'skip-1',
				sideEffects: [{ type: 'discardSourceCard', sourceCardId: 50 }],
			}));

			const result = emitEvent(G, { type: 'onTurnStart', playerId: '0' });
			expect(result.blocked).toBe(true);
			expect(result.firedHookIds).toEqual(['skip-1']);
			// Side effect: attached card moved to discard
			expect(G.action.attachedCards).toHaveLength(0);
			expect(G.discard.some((c) => c.id === 50)).toBe(true);
		});

		it('one-shot hooks are removed after firing', () => {
			const G = makeMinimalG();
			registerHook(G, makeHook({ id: 'one-shot', oneShot: true }));
			expect(G.action.hooks).toHaveLength(1);

			emitEvent(G, { type: 'onTurnStart', playerId: '0' });
			expect(G.action.hooks).toHaveLength(0);
		});

		it('non-oneShot hooks persist after firing', () => {
			const G = makeMinimalG();
			registerHook(G, makeHook({ id: 'persistent', oneShot: false }));

			emitEvent(G, { type: 'onTurnStart', playerId: '0' });
			expect(G.action.hooks).toHaveLength(1);
		});

		it('multiple block hooks are deduplicated — only one fires', () => {
			const G = makeMinimalG();
			registerHook(G, makeHook({ id: 'block-1' }));
			registerHook(G, makeHook({ id: 'block-2' }));

			const result = emitEvent(G, { type: 'onTurnStart', playerId: '0' });
			expect(result.blocked).toBe(true);
			expect(result.firedHookIds).toHaveLength(1);
		});

		it('block + observe both fire (different behaviors)', () => {
			const G = makeMinimalG();
			registerHook(G, makeHook({ id: 'blocker', behavior: 'block' }));
			registerHook(G, makeHook({ id: 'observer', behavior: 'observe' }));

			const result = emitEvent(G, { type: 'onTurnStart', playerId: '0' });
			expect(result.blocked).toBe(true);
			expect(result.firedHookIds).toContain('blocker');
			expect(result.firedHookIds).toContain('observer');
		});

		it('filters by targetPlayerId', () => {
			const G = makeMinimalG();
			registerHook(G, makeHook({ id: 'for-p1', targetPlayerId: '1' }));

			// Player 0's turn — should not match
			const r0 = emitEvent(G, { type: 'onTurnStart', playerId: '0' });
			expect(r0.blocked).toBe(false);

			// Player 1's turn — should match
			const r1 = emitEvent(G, { type: 'onTurnStart', playerId: '1' });
			expect(r1.blocked).toBe(true);
		});

		it('filters by stat', () => {
			const G = makeMinimalG();
			registerHook(G, makeHook({
				id: 'block-vitality',
				event: 'onStatMove',
				stat: 'vitality',
			}));

			const rVitality = emitEvent(G, { type: 'onStatMove', stat: 'vitality', playerId: '0' });
			expect(rVitality.blocked).toBe(true);

			const rForm = emitEvent(G, { type: 'onStatMove', stat: 'form', playerId: '0' });
			expect(rForm.blocked).toBe(false);
		});

		it('observe hooks do not block', () => {
			const G = makeMinimalG();
			registerHook(G, makeHook({ id: 'obs', behavior: 'observe' }));

			const result = emitEvent(G, { type: 'onTurnStart', playerId: '0' });
			expect(result.blocked).toBe(false);
			expect(result.firedHookIds).toEqual(['obs']);
		});
	});

	describe('registerHook', () => {
		it('adds hook to G.action.hooks', () => {
			const G = makeMinimalG();
			registerHook(G, makeHook({ id: 'test' }));
			expect(G.action.hooks).toHaveLength(1);
			expect(G.action.hooks[0]!.id).toBe('test');
		});
	});

	describe('removeHooksBySource', () => {
		it('removes all hooks with matching sourceCardId', () => {
			const G = makeMinimalG();
			registerHook(G, makeHook({ id: 'a', sourceCardId: 10 }));
			registerHook(G, makeHook({ id: 'b', sourceCardId: 10 }));
			registerHook(G, makeHook({ id: 'c', sourceCardId: 20 }));

			removeHooksBySource(G, 10);
			expect(G.action.hooks).toHaveLength(1);
			expect(G.action.hooks[0]!.id).toBe('c');
		});
	});

	describe('Sabotage (#89) end-to-end', () => {
		it('registers hook → onTurnStart blocks → hook removed', () => {
			const G = makeMinimalG();
			const sabotage = CARDS.find((c) => c.id === 89)!;
			G.players['0']!.hand = [sabotage];

			const effects = resolveCardEffects(sabotage, {
				currentPlayerId: '0',
				playerOrder: ['0', '1'],
				targetPlayerId: '1',
				lastPlacedColor: null,
			});

			// Apply effects
			applyGameEffects(G, effects, {
				currentPlayer: '0',
				playedCard: sabotage,
				markPlayedCardMoved: () => {},
			});

			// Hook should be registered
			const hook = G.action.hooks.find((h) => h.event === 'onTurnStart' && h.targetPlayerId === '1');
			expect(hook).toBeDefined();
			expect(hook!.behavior).toBe('block');
			expect(hook!.oneShot).toBe(true);

			// Card should be attached
			expect(G.action.attachedCards.some((a) => a.card.id === 89 && a.targetPlayerId === '1')).toBe(true);

			// Simulate onTurnStart for player 1
			const result = emitEvent(G, { type: 'onTurnStart', playerId: '1' });
			expect(result.blocked).toBe(true);

			// Hook should be removed (oneShot)
			expect(G.action.hooks.filter((h) => h.event === 'onTurnStart')).toHaveLength(0);

			// Side effect: attached card discarded
			expect(G.discard.some((c) => c.id === 89)).toBe(true);
			expect(G.action.attachedCards.filter((a) => a.card.id === 89)).toHaveLength(0);
		});
	});

	describe('Barren Wasteland (#10) end-to-end', () => {
		it('registers hook → draws blocked → hands empty → hook removed', () => {
			const G = makeMinimalG();
			const barren = CARDS.find((c) => c.id === 10)!;
			G.players['0']!.hand = [barren];
			G.secret.deck = [
				{ id: 200, name: 'A', colors: ['R'], stats: {}, text: null, isAction: false, synergies: [], synergyCount: 0, flags: { needsNewPrint: false, needsDuplicate: false } },
				{ id: 201, name: 'B', colors: ['G'], stats: {}, text: null, isAction: false, synergies: [], synergyCount: 0, flags: { needsNewPrint: false, needsDuplicate: false } },
			];

			const effects = resolveCardEffects(barren, {
				currentPlayerId: '0',
				playerOrder: ['0', '1'],
				lastPlacedColor: null,
			});

			applyGameEffects(G, effects, {
				currentPlayer: '0',
				playedCard: barren,
				markPlayedCardMoved: () => {},
			});

			// Hook should be registered (onDraw block, non-oneShot)
			const hook = G.action.hooks.find((h) => h.event === 'onDraw' && h.behavior === 'block');
			expect(hook).toBeDefined();
			expect(hook!.oneShot).toBe(false);

			// Card should be on face-up draw pile
			expect(G.action.faceUpDrawPile.some((c) => c.id === barren.id)).toBe(true);

			// Draws should be blocked
			const drawn = drawOne(G, '0');
			expect(drawn).toBeNull();
			expect(G.secret.deck).toHaveLength(2); // Deck unchanged

			// Make all hands empty
			G.players['0']!.hand = [];
			G.players['1']!.hand = [];

			// Now resolveDrawHooksIfReady should clear the hook
			resolveDrawHooksIfReady(G);
			expect(G.action.hooks.filter((h) => h.event === 'onDraw')).toHaveLength(0);

			// Face-up card should be moved to discard
			expect(G.action.faceUpDrawPile.filter((c) => c.id === barren.id)).toHaveLength(0);
			expect(G.discard.some((c) => c.id === barren.id)).toBe(true);

			// Draws should now work
			const card = drawOne(G, '0');
			expect(card).not.toBeNull();
		});
	});
});
