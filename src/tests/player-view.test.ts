import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { HexStringsGame } from '../game/game';
import type { GState, Rules } from '../game/types';

/**
 * Secret-state tests: what each client is allowed to see.
 * This is the layer behind the "stale client state shape" class of bugs —
 * previously completely untested.
 */

const makeCtx = (): Ctx => ({ currentPlayer: '0', playOrder: ['0', '1'], numPlayers: 2, turn: 1 }) as unknown as Ctx;

const setup = (): GState => (HexStringsGame.setup as (c: { ctx: Ctx }) => GState)({ ctx: makeCtx() });

type ViewFn = (c: { G: GState; ctx: Ctx; playerID: string | null }) => GState & { deckSize?: number };
const view = (G: GState, playerID: string | null): GState & { deckSize?: number } =>
	(HexStringsGame.playerView as ViewFn)({ G, ctx: makeCtx(), playerID });

describe('playerView (secret state)', () => {
	it('hides the deck but exposes its size', () => {
		const G = setup();
		const v = view(G, '0');
		expect(v.secret.deck).toEqual([]);
		expect(v.deckSize).toBe(G.secret.deck.length);
	});

	it('keeps your own hand, strips opponent hands but exposes handSize', () => {
		const G = setup();
		const v0 = view(G, '0');
		expect(v0.players['0']!.hand.length).toBe(G.players['0']!.hand.length);
		expect(v0.players['1']!.hand).toEqual([]);
		expect(v0.players['1']!.handSize).toBe(G.players['1']!.hand.length);

		const v1 = view(G, '1');
		expect(v1.players['1']!.hand.length).toBe(G.players['1']!.hand.length);
		expect(v1.players['0']!.hand).toEqual([]);
	});

	it('does not leak opponent hand contents anywhere in the serialized view', () => {
		const G = setup();
		// Mark an opponent card with a unique name, then scan the whole view
		G.players['1']!.hand[0]!.name = 'UNIQUE-SECRET-MARKER';
		const serialized = JSON.stringify(view(G, '0'));
		expect(serialized).not.toContain('UNIQUE-SECRET-MARKER');
	});

	it('does not leak deck contents in the serialized view', () => {
		const G = setup();
		G.secret.deck[0]!.name = 'DECK-SECRET-MARKER';
		const serialized = JSON.stringify(view(G, '0'));
		expect(serialized).not.toContain('DECK-SECRET-MARKER');
	});

	it('keeps public state intact: board, lanes, treasure, discard, prefs, nightmare', () => {
		const G = setup();
		const v = view(G, '0');
		expect(v.lanes).toEqual(G.lanes);
		expect(v.board).toEqual(G.board);
		expect(v.treasure).toEqual(G.treasure);
		expect(v.discard).toEqual(G.discard);
		// Nightmares/prefs are public unless HIDDEN_IDENTITY
		expect(v.players['1']!.prefs).toEqual(G.players['1']!.prefs);
		expect(v.players['1']!.nightmare).toBe(G.players['1']!.nightmare);
	});

	it('HIDDEN_IDENTITY additionally masks opponent prefs and nightmare', () => {
		const G = setup();
		(G.rules as Rules & { HIDDEN_IDENTITY?: boolean }).HIDDEN_IDENTITY = true;
		const v = view(G, '0');
		expect(v.players['1']!.nightmare).toBe('');
		expect(v.players['1']!.prefs).not.toEqual(G.players['1']!.prefs);
		// Own identity stays visible
		expect(v.players['0']!.nightmare).toBe(G.players['0']!.nightmare);
	});

	it('spectator view (null playerID) sees no hands at all', () => {
		const G = setup();
		const v = view(G, null);
		expect(v.players['0']!.hand).toEqual([]);
		expect(v.players['1']!.hand).toEqual([]);
	});
});
