import type { Ctx, Game, PlayerID } from 'boardgame.io';
import { RULES } from './rulesConfig';
import { buildAllCoords, canPlace, key } from './helpers';
import type { Card, Color, GState, MovePlayCardArgs, MoveStashArgs, MoveTakeTreasureArgs, PlayerPrefs } from './types';
import { buildDeck } from './deck';
import { computeScores } from './scoring';

const randomPrefs = (colors: readonly Color[]): PlayerPrefs => {
	const shuffled = [...colors].sort(() => Math.random() - 0.5);
	return {
		primary: shuffled[0]!,
		secondary: shuffled[1]!,
		tertiary: shuffled[2]!,
	};
};

const drawOne = (G: GState): Card | null => {
	const c = G.deck.pop() ?? null;
	if (!c) return null;
	return c;
};

const dealToHand = (G: GState, playerID: PlayerID): void => {
	while (G.hands[playerID]!.length < RULES.HAND_SIZE) {
		const c = drawOne(G);
		if (!c) break;
		G.hands[playerID]!.push(c);
	}
};

const initBoard = (radius: number): Record<string, Color[]> => {
	const b: Record<string, Color[]> = {};
	for (const c of buildAllCoords(radius)) b[key(c)] = [];
	if (RULES.CENTER_SEED) b['0,0'].push(RULES.CENTER_SEED);
	return b;
};

const afterRefillMaybeMarkExhaust = (G: GState, ctx: Ctx): void => {
	if (!RULES.END_ON_DECK_EXHAUST) return;
	const deckEmpty = G.deck.length === 0;
	if (deckEmpty && G.meta.deckExhaustionCycle === null) {
		G.meta.deckExhaustionCycle = ctx.turn; // mark first turn index when deck exhausted
	}
};

export const HexStringsGame: Game<GState> = {
	setup: (context) => {
		const radius = RULES.RADIUS;
		const deck = buildDeck();
		const state: GState = {
			radius,
			board: initBoard(radius),
			deck,
			discard: [],
			hands: {},
			treasure: [],
			prefs: {},
			stats: { placements: 0 },
			meta: { deckExhaustionCycle: null },
		};
		for (const pid of context.ctx.playOrder) {
			state.hands[pid] = [];
			state.prefs[pid] = randomPrefs(RULES.COLORS);
		}
		for (const pid of context.ctx.playOrder) dealToHand(state, pid);
		return state;
	},
	turn: {
		activePlayers: { currentPlayer: 'active' },
		stages: {
			active: {
				moves: {
					playCard: {
						noLimit: true,
						move: (context, args: MovePlayCardArgs) => {
							const { G } = context;
							const pid = context.ctx.currentPlayer;
							const hand = G.hands[pid]!;
							const card = hand[args.handIndex];
							if (!card) return;
							if (RULES.ONE_COLOR_PER_CARD_PLAY) {
								if (!card.colors.includes(args.pick)) return;
							}
							if (!canPlace(G, args.coord, args.pick, RULES)) return;
							const k = key(args.coord);
							G.board[k].push(args.pick);
							G.stats.placements += 1;
							const [used] = hand.splice(args.handIndex, 1);
							if (used) G.discard.push(used);
						},
					},
					stashToTreasure: (context, args: MoveStashArgs) => {
						const { G, ctx, events } = context;
						const pid = context.ctx.currentPlayer;
						const hand = G.hands[pid]!;
						if (G.treasure.length >= RULES.TREASURE_MAX) return;
						const card = hand[args.handIndex];
						if (!card) return;
						G.treasure.push(card);
						hand.splice(args.handIndex, 1);
						const drawn = drawOne(G);
						if (drawn) hand.push(drawn);
						// auto end turn after refill
						dealToHand(G, ctx.currentPlayer);
						afterRefillMaybeMarkExhaust(G, ctx);
						events?.endTurn?.();
					},
					takeFromTreasure: (context, args: MoveTakeTreasureArgs) => {
						const { G } = context;
						const pid = context.ctx.currentPlayer;
						const card = G.treasure[args.index];
						if (!card) return;
						G.hands[pid]!.push(card);
						G.treasure.splice(args.index, 1);
					},
					endTurnAndRefill: (context) => {
						const { G, ctx, events } = context;
						dealToHand(G, ctx.currentPlayer);
						afterRefillMaybeMarkExhaust(G, ctx);
						events?.endTurn?.();
					},
				},
			},
			inactive: { moves: {} },
		},
	},
	endIf: (context) => {
		const { G, ctx } = context;
		if (!RULES.END_ON_DECK_EXHAUST) return undefined;
		if (G.meta.deckExhaustionCycle === null) return undefined;
		if (!RULES.EQUAL_TURNS) {
			return { scores: computeScores(G) };
		}
		const cycleWhenExhausted = G.meta.deckExhaustionCycle;
		if (cycleWhenExhausted === null) return undefined;
		const turnsSince = ctx.turn - cycleWhenExhausted;
		if (turnsSince >= ctx.numPlayers) {
			return { scores: computeScores(G) };
		}
		return undefined;
	},
};


