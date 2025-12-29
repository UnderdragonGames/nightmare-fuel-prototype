import type { Ctx, Game, PlayerID } from 'boardgame.io';
import { RULES, buildColorToDir } from './rulesConfig';
import { buildAllCoords, canPlace, key, shuffleInPlace, inBounds, ringIndex, inferPlacementRotation } from './helpers';
import type { Card, Color, GState, MovePlayCardArgs, MoveStashArgs, MoveTakeTreasureArgs, MoveRotateTileArgs, PlayerPrefs, HexTile, Co, Rules } from './types';
import { buildDeck } from './deck';
import { computeScores } from './scoring';

// Nightmare color combinations (each combination is associated with a nightmare)
// Color mapping: Red=R, Orange=O, Yellow=Y, Green=G, Blue=B, Purple=V
const MONSTER_COMBINATIONS: Array<{ nightmare: string; colors: [Color, Color, Color] }> = [
	{ nightmare: 'Alien', colors: ['B', 'G', 'V'] },
	{ nightmare: 'Dragon', colors: ['R', 'Y', 'B'] },
	{ nightmare: 'Cultist', colors: ['V', 'O', 'G'] },
	{ nightmare: 'Robot', colors: ['V', 'B', 'R'] },
	{ nightmare: 'Blob', colors: ['B', 'R', 'Y'] },
	{ nightmare: 'Zombie', colors: ['R', 'V', 'O'] },
	{ nightmare: 'Witch', colors: ['O', 'G', 'V'] },
	{ nightmare: 'Vampire', colors: ['O', 'R', 'Y'] },
	{ nightmare: 'Ghost', colors: ['Y', 'O', 'G'] },
	{ nightmare: 'Demon', colors: ['Y', 'B', 'R'] },
	{ nightmare: 'Werewolf', colors: ['G', 'V', 'O'] },
	{ nightmare: 'Mutant', colors: ['G', 'B', 'Y'] },
];

const buildPreferenceOptions = (): PlayerPrefs[] => {
	return MONSTER_COMBINATIONS.map(({ colors }) => ({
		primary: colors[0]!,
		secondary: colors[1]!,
		tertiary: colors[2]!,
	}));
};

const drawOne = (G: GState): Card | null => {
	const c = G.deck.pop() ?? null;
	if (!c) return null;
	return c;
};

const dealToHand = (G: GState, playerID: PlayerID, rules: Rules): void => {
	while (G.hands[playerID]!.length < rules.HAND_SIZE) {
		const c = drawOne(G);
		if (!c) break;
		G.hands[playerID]!.push(c);
	}
};

const initBoard = (radius: number, origins: Co[], rules: Rules): Record<string, HexTile> => {
	const b: Record<string, HexTile> = {};
	for (const c of buildAllCoords(radius)) {
		b[key(c)] = { colors: [], rotation: 0 };
	}
	// Only seed center if it's an origin
	const centerIsOrigin = origins.some((o) => o.q === 0 && o.r === 0);
	if (rules.CENTER_SEED && centerIsOrigin) {
		b['0,0'] = { colors: [rules.CENTER_SEED], rotation: 0 };
	}
	return b;
};

const initOrigins = (radius: number, rules: Rules): Co[] => {
	if (rules.ORIGIN === 'center') {
		return [{ q: 0, r: 0 }];
	}
	const center = { q: 0, r: 0 };
	
	let randomOrigins: Co[];
	if (rules.ORIGIN_DIRECTION === 'aligned') {
		// Place origins evenly spaced in the 6 cardinal directions
		// Use ring positions that avoid center
		const targetRing = Math.max(2, Math.floor(radius / 2));
		const directions: Co[] = [
			{ q: 0, r: -1 },  // N
			{ q: +1, r: -1 }, // NE
			{ q: +1, r: 0 },  // E
			{ q: 0, r: +1 },  // SE
			{ q: -1, r: +1 }, // SW
			{ q: -1, r: 0 },  // NW
		];
		randomOrigins = [];
		for (let i = 0; i < rules.ORIGIN_COUNT; i += 1) {
			const dirIndex = i % directions.length;
			const ringOffset = Math.floor(i / directions.length);
			const dir = directions[dirIndex]!;
			const ring = targetRing + ringOffset;
			const coord: Co = {
				q: dir.q * ring,
				r: dir.r * ring,
			};
			// Ensure coord is in bounds and not center
			if ((coord.q !== 0 || coord.r !== 0) && inBounds(coord, radius)) {
				randomOrigins.push(coord);
			}
		}
	} else {
		// random: select ORIGIN_COUNT random coordinates with optional distance constraint
		const allCoords = buildAllCoords(radius);
		// Always exclude center from candidate coords (it will be added later if needed)
		const candidateCoords = allCoords.filter((c) => c.q !== 0 || c.r !== 0);
		
		// Apply MIN_ORIGIN_DISTANCE constraint if set
		const validCoords = rules.MIN_ORIGIN_DISTANCE > 0
			? candidateCoords.filter((c) => {
				const ring = ringIndex(c);
				return ring <= radius - rules.MIN_ORIGIN_DISTANCE; // At least MIN_ORIGIN_DISTANCE spaces from edge
			})
			: candidateCoords;
		
		const shuffled = [...validCoords];
		shuffleInPlace(shuffled);
		randomOrigins = [];
		
		// Greedily select origins ensuring minimum distance between them
		// If 'random-and-center', also check distance from center origin
		const originsToCheckAgainst = rules.ORIGIN === 'random-and-center' ? [center] : [];
		
		for (const coord of shuffled) {
			if (randomOrigins.length >= rules.ORIGIN_COUNT) break;
			if (rules.MIN_ORIGIN_DISTANCE > 0) {
				// Check if this coord is at least MIN_ORIGIN_DISTANCE + 1 spaces from all existing origins
				const tooCloseToExisting = randomOrigins.some((existing) => {
					const dq = coord.q - existing.q;
					const dr = coord.r - existing.r;
					const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr));
					return dist <= rules.MIN_ORIGIN_DISTANCE; // Need at least MIN_ORIGIN_DISTANCE spaces between
				});
				// Also check distance from center if using 'random-and-center'
				const tooCloseToCenter = originsToCheckAgainst.some((existing) => {
					const dq = coord.q - existing.q;
					const dr = coord.r - existing.r;
					const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr));
					return dist <= rules.MIN_ORIGIN_DISTANCE;
				});
				if (tooCloseToExisting || tooCloseToCenter) continue;
			}
			randomOrigins.push(coord);
		}
	}
	
	if (rules.ORIGIN === 'random-and-center') {
		// Include center if not already in random origins
		const hasCenter = randomOrigins.some((c) => c.q === 0 && c.r === 0);
		if (!hasCenter) {
			// Replace one random origin with center, or append if we have fewer than ORIGIN_COUNT
			if (randomOrigins.length >= rules.ORIGIN_COUNT) {
				randomOrigins[0] = center;
			} else {
				randomOrigins.push(center);
			}
		}
		return randomOrigins;
	}
	// RULES.ORIGIN === 'random'
	return randomOrigins;
};

const afterRefillMaybeMarkExhaust = (G: GState, ctx: Ctx, rules: Rules): void => {
	if (!rules.END_ON_DECK_EXHAUST) return;
	const deckEmpty = G.deck.length === 0;
	if (deckEmpty && G.meta.deckExhaustionCycle === null) {
		G.meta.deckExhaustionCycle = ctx.turn; // mark first turn index when deck exhausted
	}
};

const initRulesForNewGame = (baseRules: Rules): Rules => {
	if (!baseRules.RANDOM_CARDINAL_DIRECTIONS) return baseRules;
	const edgeColors = [...baseRules.EDGE_COLORS];
	shuffleInPlace(edgeColors);
	return { ...baseRules, EDGE_COLORS: edgeColors, COLOR_TO_DIR: buildColorToDir(edgeColors) };
};

export const HexStringsGame: Game<GState> = {
		setup: (context) => {
		const rules = initRulesForNewGame(RULES);
		const radius = rules.RADIUS;
		const deck = buildDeck(rules);
		const origins = initOrigins(radius, rules);
		const stashBonus: Record<PlayerID, number> = {};
		const state: GState = {
			rules,
			radius,
			board: initBoard(radius, origins, rules),
			deck,
			discard: [],
			hands: {},
			treasure: [],
			prefs: {},
			stats: { placements: 0 },
			meta: { deckExhaustionCycle: null, stashBonus },
			origins,
		};
		const prefOptions = buildPreferenceOptions();
		const shuffledOptions = [...prefOptions];
		shuffleInPlace(shuffledOptions);
		for (const pid of context.ctx.playOrder) {
			state.hands[pid] = [];
			const assigned = shuffledOptions.pop()!;
			state.prefs[pid] = assigned;
			stashBonus[pid] = 0;
		}
		for (const pid of context.ctx.playOrder) dealToHand(state, pid, rules);
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
							const rules = G.rules;
							const pid = context.ctx.currentPlayer;
							const hand = G.hands[pid]!;
							const card = hand[args.handIndex];
							if (!card) return;
							if (rules.ONE_COLOR_PER_CARD_PLAY) {
								if (!card.colors.includes(args.pick)) return;
							}
							if (!canPlace(G, args.coord, args.pick, rules)) return;
							const k = key(args.coord);
							const tile = G.board[k];
							if (tile) {
								tile.colors.push(args.pick);
							} else {
								const rotation = inferPlacementRotation(G, args.coord, args.pick);
								G.board[k] = { colors: [args.pick], rotation };
							}
							G.stats.placements += 1;
							const [used] = hand.splice(args.handIndex, 1);
							if (used) G.discard.push(used);
						},
					},
					rotateTile: {
						move: (context, args: MoveRotateTileArgs) => {
							const { G } = context;
							const rules = G.rules;
							const pid = context.ctx.currentPlayer;
							const hand = G.hands[pid]!;
							const tile = G.board[key(args.coord)];
							if (!tile || tile.colors.length === 0) return;
							if (rules.PLACEMENT.DISCARD_TO_ROTATE === false) return;
							const card = hand[args.handIndex];
							if (!card) return;
							
							// Validate rotation amount: 1-5, excluding 3 (180°)
							if (args.rotation < 1 || args.rotation > 5 || args.rotation === 3) return;
							
							// match-color mode: card must contain a color from the tile
							if (rules.PLACEMENT.DISCARD_TO_ROTATE === 'match-color') {
								const hasMatchingColor = card.colors.some((c) => tile.colors.includes(c));
								if (!hasMatchingColor) return;
							}
							
							// Rotate tile by specified amount (rotation 0-5 wraps)
							tile.rotation = (tile.rotation + args.rotation) % 6;
							
							// Discard the card
							const [used] = hand.splice(args.handIndex, 1);
							if (used) G.discard.push(used);
						},
					},
					stashToTreasure: (context, args: MoveStashArgs) => {
						const { G } = context;
						const rules = G.rules;
						const pid = context.ctx.currentPlayer;
						const hand = G.hands[pid]!;
						if (G.treasure.length >= rules.TREASURE_MAX) return;
						const card = hand[args.handIndex];
						if (!card) return;
						G.treasure.push(card);
						hand.splice(args.handIndex, 1);
						const drawn = drawOne(G);
						if (drawn) hand.push(drawn);
						G.meta.stashBonus[pid] = (G.meta.stashBonus[pid] ?? 0) + 1;
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
						const rules = G.rules;
						const pid = ctx.currentPlayer;
						// Reset stash bonus counter for next turn
						G.meta.stashBonus[pid] = 0;
						dealToHand(G, ctx.currentPlayer, rules);
						afterRefillMaybeMarkExhaust(G, ctx, rules);
						events?.endTurn?.();
					},
				},
			},
			inactive: { moves: {} },
		},
	},
	endIf: (context) => {
		const { G, ctx } = context;
		const rules = G.rules;
		if (!rules.END_ON_DECK_EXHAUST) return undefined;
		if (G.meta.deckExhaustionCycle === null) return undefined;
		if (!rules.EQUAL_TURNS) {
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
	ai: {
		enumerate: (G: GState, ctx: Ctx) => {
			const rules = G.rules;
			const moves: Array<{ move: string; args: unknown[] }> = [];
			const playerID = ctx.currentPlayer as PlayerID;
			const coords = buildAllCoords(G.radius);
			const hand = G.hands[playerID] ?? [];
			
			// Enumerate playCard moves
			for (let i = 0; i < hand.length; i += 1) {
				const card = hand[i]!;
				for (const color of card.colors) {
					for (const co of coords) {
						if (canPlace(G, co, color as Color, rules)) {
							moves.push({ move: 'playCard', args: [{ handIndex: i, pick: color, coord: co }] });
						}
					}
				}
			}
			
			// Enumerate stashToTreasure moves
			if (G.treasure.length < rules.TREASURE_MAX && hand.length > 0) {
				for (let i = 0; i < hand.length; i += 1) {
					moves.push({ move: 'stashToTreasure', args: [{ handIndex: i }] });
				}
			}
			
			// Always allow ending turn
			moves.push({ move: 'endTurnAndRefill', args: [] });
			
			return moves;
		},
	},
};


