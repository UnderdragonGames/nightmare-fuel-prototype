import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { HexStringsGame } from '../game/game';
import { resolveCardEffects } from '../game/cardActions';
import { actionEffectsInvalidReason } from '../game/effects';
import { CARDS } from '../game/cards';
import { neighbors } from '../game/helpers';
import type { Card, Co, GState, MovePlayActionArgs, PathLane } from '../game/types';

// Playtest report (2026-08-02): "This Prey is Mine doesn't seem to have an
// effect. Seize the Opportunity also doesn't work." Prey silently no-oped when
// the lane was picked in the reverse of its stored direction; Seize granted an
// extraPlacements counter nothing ever consumed in path mode.

type MoveFn = (context: { G: GState; ctx: Ctx }, args: MovePlayActionArgs) => unknown;
const stages = (HexStringsGame.turn as unknown as {
	stages: Record<string, { moves: Record<string, { move: MoveFn }> }>;
}).stages;
const playAction = stages.active!.moves.playActionCard!;

const makeCtx = (currentPlayer = '0'): Ctx =>
	({ currentPlayer, playOrder: ['0', '1'], numPlayers: 2, turn: 3 }) as unknown as Ctx;

const findCard = (id: number): Card => {
	const card = CARDS.find((c) => c.id === id);
	if (!card) throw new Error(`Card ${id} not found`);
	return { ...card };
};

const lane = (from: Co, to: Co, color: PathLane['color']): PathLane => ({ from, to, color });

const setupWithHand = (card: Card): GState => {
	const G = (HexStringsGame.setup as (c: { ctx: Ctx }) => GState)({ ctx: makeCtx() });
	G.players['0']!.hand = [card];
	return G;
};

describe('This Prey is Mine (111) — recolor a lane', () => {
	it('recolors a lane picked in the reverse of its stored direction', () => {
		const G = setupWithHand(findCard(111));
		G.lanes = [lane({ q: 1, r: 0 }, { q: 2, r: 0 }, 'O')];
		const effects = resolveCardEffects(G.players['0']!.hand[0]!, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			mode: 'path',
			moveFrom: { q: 2, r: 0 }, // reversed endpoints
			moveTo: { q: 1, r: 0 },
			replaceColor: 'B',
		});
		playAction.move({ G, ctx: makeCtx() }, { handIndex: 0, effects });
		expect(G.lanes[0]!.color).toBe('B');
		expect(G.players['0']!.hand).toHaveLength(0);
		expect(G.discard.some((c) => c.id === 111)).toBe(true);
	});

	it('rejects the move (card stays in hand) when no lane connects the picks', () => {
		const G = setupWithHand(findCard(111));
		G.lanes = [lane({ q: 1, r: 0 }, { q: 2, r: 0 }, 'O')];
		const effects = resolveCardEffects(G.players['0']!.hand[0]!, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			mode: 'path',
			moveFrom: { q: 0, r: 1 },
			moveTo: { q: 0, r: 2 },
			replaceColor: 'B',
		});
		expect(actionEffectsInvalidReason(G, effects)).not.toBeNull();
		playAction.move({ G, ctx: makeCtx() }, { handIndex: 0, effects });
		expect(G.lanes[0]!.color).toBe('O');
		expect(G.players['0']!.hand).toHaveLength(1);
		expect(G.players['0']!.actionPlaysThisTurn).toBe(0);
	});

	it('rejects recoloring a lane to its current color', () => {
		const G = setupWithHand(findCard(111));
		G.lanes = [lane({ q: 1, r: 0 }, { q: 2, r: 0 }, 'O')];
		const effects = resolveCardEffects(G.players['0']!.hand[0]!, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			mode: 'path',
			moveFrom: { q: 1, r: 0 },
			moveTo: { q: 2, r: 0 },
			replaceColor: 'O',
		});
		expect(actionEffectsInvalidReason(G, effects)).not.toBeNull();
	});
});

describe('Seize the Opportunity (91) — free lane of the last-placed color', () => {
	// COLOR_TO_DIR may be shuffled per game, so derive a legal placement from
	// the generated rules instead of hardcoding coordinates.
	const legalFreeLane = (G: GState, color: PathLane['color']): { source: Co; dest: Co } => {
		const dir = G.rules.COLOR_TO_DIR[color];
		for (const source of neighbors({ q: 0, r: 0 })) {
			const dest = { q: source.q + dir.q, r: source.r + dir.r };
			const probe = resolveCardEffects(findCard(91), {
				currentPlayerId: '0',
				playerOrder: ['0', '1'],
				mode: 'path',
				lastPlacedColor: color,
				moveFrom: source,
				moveTo: dest,
			});
			if (actionEffectsInvalidReason(G, probe) === null) return { source, dest };
		}
		throw new Error('No legal free-lane placement found from the starting ring.');
	};

	it('places a lane of the last-placed color without spending a lane card', () => {
		const G = setupWithHand(findCard(91));
		G.action.lastPlacedColor = 'O';
		const { source, dest } = legalFreeLane(G, 'O');
		const effects = resolveCardEffects(G.players['0']!.hand[0]!, {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			mode: 'path',
			lastPlacedColor: 'O',
			moveFrom: source,
			moveTo: dest,
		});
		expect(effects).toEqual([{ type: 'placeFreeLane', source, dest, color: 'O' }]);
		playAction.move({ G, ctx: makeCtx() }, { handIndex: 0, effects });
		expect(G.lanes).toHaveLength(1);
		expect(G.lanes[0]!.color).toBe('O');
		expect(G.players['0']!.hand).toHaveLength(0);
		// The old broken path: a counter nothing consumes must NOT be granted.
		expect(G.action.extraPlacements['0']!.count).toBe(0);
	});

	it('rejects a step that does not go in the last-placed color direction', () => {
		const G = setupWithHand(findCard(91));
		G.action.lastPlacedColor = 'O';
		const { source } = legalFreeLane(G, 'O');
		const wrongColor = G.rules.COLORS.find((c) => c !== 'O')!;
		const wrongDir = G.rules.COLOR_TO_DIR[wrongColor];
		const wrongDest = { q: source.q + wrongDir.q, r: source.r + wrongDir.r };
		const effects = resolveCardEffects(findCard(91), {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			mode: 'path',
			lastPlacedColor: 'O',
			moveFrom: source,
			moveTo: wrongDest,
		});
		expect(actionEffectsInvalidReason(G, effects)).not.toBeNull();
		playAction.move({ G, ctx: makeCtx() }, { handIndex: 0, effects });
		expect(G.lanes).toHaveLength(0);
		expect(G.players['0']!.hand).toHaveLength(1);
	});

	it('requires a board target in path mode (no silent counter grant)', () => {
		expect(() =>
			resolveCardEffects(findCard(91), {
				currentPlayerId: '0',
				playerOrder: ['0', '1'],
				mode: 'path',
				lastPlacedColor: 'O',
			}),
		).toThrow(/moveFrom/);
	});
});
