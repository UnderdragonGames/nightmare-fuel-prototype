import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { HexStringsGame } from '../game/game';
import { enumerateActions } from '../game/ai';
import type { GState } from '../game/types';

type MoveConfig = { undoable?: boolean };
type StageConfig = { moves: Record<string, MoveConfig | ((...a: unknown[]) => unknown)> };
const stages = (HexStringsGame.turn as unknown as { stages: Record<string, StageConfig> }).stages;

// Pin the seat-order shuffle off: this suite drives player 0's client and
// needs them to start (see CLAUDE.md — tests pin the flags they rely on).
const FixedOrderGame = {
	...HexStringsGame,
	setup: (context: Parameters<NonNullable<typeof HexStringsGame.setup>>[0]) => {
		const G = HexStringsGame.setup!(context) as GState;
		G.rules = { ...G.rules, RANDOM_START_ORDER: false };
		return G;
	},
};

describe('undo', () => {
	it('reverts a placement made this turn', () => {
		const client = Client<GState>({ game: FixedOrderGame, numPlayers: 2, playerID: '0', debug: false });
		client.start();
		const before = client.getState()!;
		const place = enumerateActions(before.G, '0').find((a) => a.type === 'playCard');
		expect(place).toBeDefined();
		if (!place || place.type !== 'playCard') throw new Error('no placement');

		client.moves.playCard!(place.args);
		const played = client.getState()!;
		expect(played.G.lanes.length).toBe(before.G.lanes.length + 1);
		expect(played.G.players['0']!.hand.length).toBe(before.G.players['0']!.hand.length - 1);

		client.undo();
		const undone = client.getState()!;
		expect(undone.G.lanes.length).toBe(before.G.lanes.length);
		expect(undone.G.players['0']!.hand.length).toBe(before.G.players['0']!.hand.length);
		client.stop();
	});

	it('action cards and cancelMatch are not undoable', () => {
		// Random effects and revealed information cannot be taken back.
		expect((stages.active!.moves.playActionCard as MoveConfig).undoable).toBe(false);
		expect((stages.active!.moves.cancelMatch as MoveConfig).undoable).toBe(false);
	});
});
