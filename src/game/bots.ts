import type { Ctx, PlayerID } from 'boardgame.io';
import type { GState, Color, MovePlayCardArgs, MoveStashArgs, Card, Rules } from './types';
import { buildAllCoords, canPlace, key } from './helpers';
import { computeScores } from './scoring';

export type BotKind = 'None' | 'Random' | 'Dumb' | 'Smart';

// Calculate expected value of drawing a card based on deck composition
// Each player has 3 objective colors out of 6 total, so probability is the same for all
const calculateDrawValue = (rules: Rules, _prefs: { primary: Color; secondary: Color; tertiary: Color }): number => {
	const totalColors = rules.COLORS.length; // 6
	const nonObjectiveCount = totalColors - 3; // 3 non-objective colors
	
	// Calculate probability that a random card contains at least one objective color
	// Based on deck composition: twoColor, threeColor, fourColor
	
	const totalWeight = rules.DECK_COUNTS.twoColor + rules.DECK_COUNTS.threeColor + rules.DECK_COUNTS.fourColor;
	
	// Combinations: C(n,k) = n! / (k! * (n-k)!)
	// For twoColor: C(6,2) = 15 total, C(3,2) = 3 non-objective
	const combTwoTotal = (totalColors * (totalColors - 1)) / 2; // 15
	const combTwoNonObj = (nonObjectiveCount * (nonObjectiveCount - 1)) / 2; // 3
	const probTwoColor = (combTwoTotal - combTwoNonObj) / combTwoTotal; // 12/15 = 0.8
	
	// For threeColor: C(6,3) = 20 total, C(3,3) = 1 non-objective
	const combThreeTotal = (totalColors * (totalColors - 1) * (totalColors - 2)) / 6; // 20
	const combThreeNonObj = 1; // C(3,3) = 1
	const probThreeColor = (combThreeTotal - combThreeNonObj) / combThreeTotal; // 19/20 = 0.95
	
	// For fourColor: C(6,4) = C(6,2) = 15 total, C(3,4) = 0 non-objective
	const probFourColor = 1.0; // Always has objective color
	
	// Weighted average probability
	const weightedProb = (
		probTwoColor * rules.DECK_COUNTS.twoColor +
		probThreeColor * rules.DECK_COUNTS.threeColor +
		probFourColor * rules.DECK_COUNTS.fourColor
	) / totalWeight;
	
	// Expected value: probability of objective color × average objective value
	// Average objective value = (3 + 2 + 1) / 3 = 2
	const avgObjectiveValue = 2;
	return weightedProb * avgObjectiveValue;
};

// Heuristic evaluation helpers
const getColorValue = (color: Color, prefs: { primary: Color; secondary: Color; tertiary: Color }): number => {
	if (color === prefs.primary) return 3;
	if (color === prefs.secondary) return 2;
	if (color === prefs.tertiary) return 1;
	return 0;
};

const getCardValue = (card: Card, prefs: { primary: Color; secondary: Color; tertiary: Color }): number => {
	return Math.max(...card.colors.map((c) => getColorValue(c, prefs)));
};

const isObjectiveCard = (card: Card, prefs: { primary: Color; secondary: Color; tertiary: Color }): boolean => {
	return card.colors.some((c) => getColorValue(c, prefs) > 0);
};

const evaluateHandQuality = (hand: Card[], prefs: { primary: Color; secondary: Color; tertiary: Color }): number => {
	let totalValue = 0;
	for (const card of hand) {
		totalValue += getCardValue(card, prefs);
	}
	return totalValue / hand.length;
};

const evaluateStashValue = (
	move: Move,
	G: GState,
	playerID: PlayerID
): number => {
	if (move.move !== 'stashToTreasure') return 0;
	const rules = G.rules;
	
	const args = move.args[0] as MoveStashArgs;
	const hand = G.hands[playerID] ?? [];
	const card = hand[args.handIndex];
	if (!card) return 0;
	
	const prefs = G.prefs[playerID]!;
	const isObjective = isObjectiveCard(card, prefs);
	
	// Stash cards you DON'T want (non-objective) - they give bonus draws
	// Each bonus draw has expected value calculated from deck composition
	const drawValue = calculateDrawValue(rules, prefs);
	const stashBonusValue = drawValue; // 1 stash = 1 bonus draw
	
	// Stashing non-objective cards is good (removes bad cards, gets bonus draws)
	// Stashing objective cards is bad (wastes valuable cards)
	if (isObjective) {
		// Penalize stashing objective cards heavily
		return -5;
	} else {
		// Reward stashing non-objective cards
		return stashBonusValue;
	}
};

const evaluatePlayValue = (
	move: Move,
	G: GState,
	playerID: PlayerID
): number => {
	if (move.move !== 'playCard') return 0;
	
	const args = move.args[0] as MovePlayCardArgs;
	const hand = G.hands[playerID] ?? [];
	const card = hand[args.handIndex];
	if (!card) return 0;
	
	const prefs = G.prefs[playerID]!;
	const colorValue = getColorValue(args.pick, prefs);
	const isObjective = isObjectiveCard(card, prefs);
	
	// Prefer playing primary color (worth 3)
	// Playing objective cards is good
	if (!isObjective) {
		// Penalize playing non-objective cards - better to stash them
		return colorValue - 2;
	}
	
	// Playing objective cards is good, especially primary
	return colorValue;
};

type BGIOClient = {
	getState(): ({ G: GState; ctx: Ctx } & { playerID?: PlayerID }) | undefined;
	moves: {
		playCard(a: MovePlayCardArgs): void;
		endTurnAndRefill(): void;
		stashToTreasure(a: MoveStashArgs): void;
	};
};

type Move = { move: string; args: unknown[] };

const waitForStateUpdate = (): Promise<void> => {
	return new Promise((resolve) => {
		// Use requestAnimationFrame to wait for React to re-render
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				resolve();
			});
		});
	});
};

export const playOneRandom = async (client: BGIOClient, playerID: PlayerID): Promise<void> => {
	const maxMoves = 20; // Safety limit
	let movesMade = 0;
	
	// Loop until no more moves available
	while (movesMade < maxMoves) {
		// Wait for state to stabilize
		await waitForStateUpdate();
		
		const state = client.getState();
		if (!state || state.ctx.currentPlayer !== playerID) break;
		
		const G = state.G;
		const rules = G.rules;
		const coords = buildAllCoords(G.radius);
		const hand = G.hands[playerID] ?? [];
		const placementsBefore = G.stats.placements;
		const handSizeBefore = hand.length;
		const treasureSizeBefore = G.treasure.length;
		const deckSizeBefore = G.deck.length;
		let madeMove = false;
		
		// try any playCard
		for (let i = 0; i < hand.length; i += 1) {
			const card = hand[i]!;
			for (const color of card.colors) {
				for (const co of coords) {
						if (canPlace(G, co, color as Color, rules)) {
						client.moves.playCard({ handIndex: i, pick: color as Color, coord: co });
						madeMove = true;
						movesMade += 1;
						break;
					}
				}
				if (madeMove) break;
			}
			if (madeMove) break;
		}
		
		if (madeMove) {
			// Wait for React to update refs
			await waitForStateUpdate();
			// Verify state changed
			const stateAfter = client.getState();
			if (!stateAfter || stateAfter.ctx.currentPlayer !== playerID) break;
			
			const stateChanged = 
				stateAfter.G.stats.placements !== placementsBefore ||
				stateAfter.G.hands[playerID]?.length !== handSizeBefore ||
				stateAfter.G.treasure.length !== treasureSizeBefore ||
				stateAfter.G.deck.length !== deckSizeBefore;
			
			if (!stateChanged) {
				// Move was attempted but didn't change state - likely invalid, end turn
				client.moves.endTurnAndRefill();
				break;
			}
			continue;
		}
		
		// otherwise stash first available if treasure space
		if ((G.treasure.length ?? 0) < rules.TREASURE_MAX && hand.length > 0) {
			client.moves.stashToTreasure({ handIndex: 0 });
			madeMove = true;
			movesMade += 1;
			await waitForStateUpdate();
			
			// Verify stash actually succeeded
			const stateAfter = client.getState();
			if (!stateAfter || stateAfter.ctx.currentPlayer !== playerID) break;
			
			const stateChanged = 
				stateAfter.G.stats.placements !== placementsBefore ||
				stateAfter.G.hands[playerID]?.length !== handSizeBefore ||
				stateAfter.G.treasure.length !== treasureSizeBefore ||
				stateAfter.G.deck.length !== deckSizeBefore;
			
			if (!stateChanged) {
				// Move was attempted but didn't change state - likely invalid, end turn
				client.moves.endTurnAndRefill();
				break;
			}
			continue;
		}
		
		// no moves available, end turn
		client.moves.endTurnAndRefill();
		break;
	}
};

const enumerateMoves = (G: GState, playerID: PlayerID): Move[] => {
	const moves: Move[] = [];
	const rules = G.rules;
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
};

const deepClone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj));

const applyMoveToState = (G: GState, ctx: Ctx, move: Move, playerID: PlayerID): { G: GState; ctx: Ctx } | null => {
	const newG = deepClone(G);
	const newCtx = { ...ctx };
	const rules = newG.rules;
	
	if (move.move === 'playCard') {
		const args = move.args[0] as MovePlayCardArgs;
		const hand = newG.hands[playerID]!;
		const card = hand[args.handIndex];
		if (!card) return null;
		if (rules.ONE_COLOR_PER_CARD_PLAY && !card.colors.includes(args.pick)) return null;
		if (!canPlace(newG, args.coord, args.pick, rules)) return null;
		
		const k = key(args.coord);
		const tile = newG.board[k];
		if (tile) {
			tile.colors.push(args.pick);
		} else {
			newG.board[k] = { colors: [args.pick], rotation: 0 };
		}
		newG.stats.placements += 1;
		const [used] = hand.splice(args.handIndex, 1);
		if (used) newG.discard.push(used);
	} else if (move.move === 'stashToTreasure') {
		const args = move.args[0] as MoveStashArgs;
		const hand = newG.hands[playerID]!;
		if (newG.treasure.length >= rules.TREASURE_MAX) return null;
		const card = hand[args.handIndex];
		if (!card) return null;
		newG.treasure.push(card);
		hand.splice(args.handIndex, 1);
		// Stashing gives bonus draw
		newG.meta.stashBonus[playerID] = (newG.meta.stashBonus[playerID] ?? 0) + 1;
		// Draw replacement immediately
		const drawn = newG.deck.pop() ?? null;
		if (drawn) hand.push(drawn);
	}
	
	// Simulate endTurnAndRefill
	const stashBonus = newG.meta.stashBonus[playerID] ?? 0;
	newG.meta.stashBonus[playerID] = 0;
	
	// Deal to hand size, then add bonus draws from stashing
	dealToHand(newG, playerID);
	for (let i = 0; i < stashBonus; i += 1) {
		const bonusCard = newG.deck.pop() ?? null;
		if (bonusCard) newG.hands[playerID]!.push(bonusCard);
	}
	
	newCtx.turn += 1;
	const nextPlayerIndex = (ctx.playOrder.indexOf(playerID) + 1) % ctx.numPlayers;
	newCtx.currentPlayer = ctx.playOrder[nextPlayerIndex] as PlayerID;
	
	return { G: newG, ctx: newCtx };
};

const dealToHand = (g: GState, pid: PlayerID): void => {
	const rules = g.rules;
	while (g.hands[pid]!.length < rules.HAND_SIZE) {
		const c = g.deck.pop() ?? null;
		if (!c) break;
		g.hands[pid]!.push(c);
	}
};

const simulateRandomPlayout = (
	G: GState,
	ctx: Ctx,
	playerID: PlayerID,
	maxTurns: number
): number => {
	if (maxTurns <= 0 || ctx.gameover) {
		const scores = computeScores(G);
		return scores[playerID] ?? 0;
	}

	const currentPlayer = ctx.currentPlayer as PlayerID;
	const moves = enumerateMoves(G, currentPlayer);
	
	if (moves.length === 0) {
		const scores = computeScores(G);
		return scores[playerID] ?? 0;
	}

	// Pick a random move
	const randomMove = moves[Math.floor(Math.random() * moves.length)]!;
	const result = applyMoveToState(G, ctx, randomMove, currentPlayer);
	
	if (!result) {
		const scores = computeScores(G);
		return scores[playerID] ?? 0;
	}

	// Continue simulation
	return simulateRandomPlayout(result.G, result.ctx, playerID, maxTurns - 1);
};

const playOneMonteCarloMove = async (
	client: BGIOClient,
	playerID: PlayerID,
	iterations: number,
	playoutDepth: number
): Promise<boolean> => {
	const stateBefore = client.getState();
	if (!stateBefore || stateBefore.ctx.currentPlayer !== playerID) return false;

	const allMoves = enumerateMoves(stateBefore.G, playerID);
	
	// Filter out endTurnAndRefill - we'll add it back only if no other moves exist
	const moves = allMoves.filter((m) => m.move !== 'endTurnAndRefill');
	
	// If no moves available, end turn
	if (moves.length === 0) {
		client.moves.endTurnAndRefill();
		return false; // Turn ended
	}

	const moveScores: Array<{ move: Move; score: number }> = [];
	const prefs = stateBefore.G.prefs[playerID]!;
	
	// Calculate heuristic bonuses for each move
	const heuristicBonuses = new Map<Move, number>();
	for (const move of moves) {
		let bonus = 0;
		
		// Stash valuable cards (objective colors)
		if (move.move === 'stashToTreasure') {
			const stashValue = evaluateStashValue(move, stateBefore.G, playerID);
			bonus += stashValue * 2; // Weight stash value heavily
		}
		
		// Prefer playing primary color
		if (move.move === 'playCard') {
			const playValue = evaluatePlayValue(move, stateBefore.G, playerID);
			bonus += playValue;
		}
		
		heuristicBonuses.set(move, bonus);
	}
	
	for (const move of moves) {
		let totalScore = 0;
		const samples = Math.max(1, Math.floor(iterations / moves.length));
		const heuristicBonus = heuristicBonuses.get(move) ?? 0;
		
		for (let i = 0; i < samples; i += 1) {
			const result = applyMoveToState(stateBefore.G, stateBefore.ctx, move, playerID);
			if (result) {
				// Simulate random playouts from this position to evaluate long-term value
				const finalScore = simulateRandomPlayout(result.G, result.ctx, playerID, playoutDepth);
				totalScore += finalScore;
			} else {
				// Fallback: use current score
				const scores = computeScores(stateBefore.G);
				totalScore += scores[playerID] ?? 0;
			}
		}
		
		// Combine Monte Carlo score with heuristic bonus
		const avgScore = totalScore / samples;
		const handQuality = evaluateHandQuality(stateBefore.G.hands[playerID] ?? [], prefs);
		
		// Adjust score: better hands mean more potential, factor that in
		const adjustedScore = avgScore + heuristicBonus + (handQuality * 0.5);
		
		moveScores.push({ move, score: adjustedScore });
	}
	
	// Select move with highest combined score, but verify it's still valid
	moveScores.sort((a, b) => b.score - a.score);
	
	// Try moves in order of preference until one succeeds
	for (const { move } of moveScores) {
		const rules = stateBefore.G.rules;
		// Re-validate move is still valid before executing
		if (move.move === 'playCard') {
			const args = move.args[0] as MovePlayCardArgs;
			const hand = stateBefore.G.hands[playerID] ?? [];
			const card = hand[args.handIndex];
			if (!card) continue;
			if (rules.ONE_COLOR_PER_CARD_PLAY && !card.colors.includes(args.pick)) continue;
			if (!canPlace(stateBefore.G, args.coord, args.pick, rules)) continue;
		} else if (move.move === 'stashToTreasure') {
			const args = move.args[0] as MoveStashArgs;
			const hand = stateBefore.G.hands[playerID] ?? [];
			if (stateBefore.G.treasure.length >= rules.TREASURE_MAX) continue;
			if (!hand[args.handIndex]) continue;
		}
		
		// Execute the move
		if (move.move === 'playCard') {
			client.moves.playCard(move.args[0] as MovePlayCardArgs);
		} else if (move.move === 'stashToTreasure') {
			client.moves.stashToTreasure(move.args[0] as MoveStashArgs);
		}
		
		return true; // Move executed, turn continues
	}
	
	// No valid moves found (they were enumerated but are now invalid), end turn
	client.moves.endTurnAndRefill();
	return false;
};

const playOneMonteCarlo = async (
	client: BGIOClient,
	playerID: PlayerID,
	iterations: number,
	playoutDepth: number
): Promise<void> => {
	const maxMoves = 20; // Safety limit
	let movesMade = 0;
	
	// Loop until no more moves available
	while (movesMade < maxMoves) {
		// Wait for state to stabilize
		await waitForStateUpdate();
		
		const stateBefore = client.getState();
		if (!stateBefore || stateBefore.ctx.currentPlayer !== playerID) break;
		
		// Check moves available BEFORE making move
		const movesBefore = enumerateMoves(stateBefore.G, playerID).filter((m) => m.move !== 'endTurnAndRefill');
		if (movesBefore.length === 0) {
			// No moves available, end turn
			client.moves.endTurnAndRefill();
			break;
		}
		
		const placementsBefore = stateBefore.G.stats.placements;
		const handSizeBefore = stateBefore.G.hands[playerID]?.length ?? 0;
		const treasureSizeBefore = stateBefore.G.treasure.length;
		const deckSizeBefore = stateBefore.G.deck.length;
		
		const madeMove = await playOneMonteCarloMove(client, playerID, iterations, playoutDepth);
		if (!madeMove) break; // Turn ended (no moves available)
		
		movesMade += 1;
		
		// Wait for React to update refs after move
		await waitForStateUpdate();
		
		// Verify state changed and still our turn
		const stateAfter = client.getState();
		if (!stateAfter || stateAfter.ctx.currentPlayer !== playerID) break;
		
		// Verify something changed - check placements, hand size, treasure size, or deck size
		const placementsAfter = stateAfter.G.stats.placements;
		const handSizeAfter = stateAfter.G.hands[playerID]?.length ?? 0;
		const treasureSizeAfter = stateAfter.G.treasure.length;
		const deckSizeAfter = stateAfter.G.deck.length;
		
		// If nothing changed after making a move, we're stuck - break immediately
		const stateChanged = 
			placementsAfter !== placementsBefore ||
			handSizeAfter !== handSizeBefore ||
			treasureSizeAfter !== treasureSizeBefore ||
			deckSizeAfter !== deckSizeBefore;
		
		if (!stateChanged) {
			// Move was attempted but didn't change state - likely invalid, end turn
			client.moves.endTurnAndRefill();
			break;
		}
	}
};

export const playOneDumb = async (client: BGIOClient, playerID: PlayerID): Promise<void> => {
	await playOneMonteCarlo(client, playerID, 50, 3);
};

export const playOneSmart = async (client: BGIOClient, playerID: PlayerID): Promise<void> => {
	await playOneMonteCarlo(client, playerID, 500, 6);
};


