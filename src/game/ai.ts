/**
 * AI Bot System - Evaluator-Driven Planner with Micro-Step Simulation
 *
 * This module implements Part 1 and Part 2 from ai-planning.md:
 * - Correct micro-step simulation matching game rules
 * - Single source of truth for action enumeration
 * - Evaluator-driven decision making (no Monte Carlo rollouts)
 */

import type { Ctx, PlayerID } from 'boardgame.io';
import type { GState, Color, MovePlayCardArgs, MoveStashArgs, MoveTakeTreasureArgs, MoveRotateTileArgs, Card, PlayerPrefs } from './types';
import { buildAllCoords, canPlace, canPlacePath, key, neighbors, ringIndex } from './helpers';
import { computeScores } from './scoring';

// =============================================================================
// Types
// =============================================================================

export type BotKind = 'None' | 'Random' | 'Evaluator' | 'EvaluatorPlus';

export type ActionType = 'playCard' | 'rotateTile' | 'stashToTreasure' | 'takeFromTreasure' | 'endTurnAndRefill';

export type Action =
	| { type: 'playCard'; args: MovePlayCardArgs }
	| { type: 'rotateTile'; args: MoveRotateTileArgs }
	| { type: 'stashToTreasure'; args: MoveStashArgs }
	| { type: 'takeFromTreasure'; args: MoveTakeTreasureArgs }
	| { type: 'endTurnAndRefill' };

type BGIOClient = {
	getState(): ({ G: GState; ctx: Ctx } & { playerID?: PlayerID }) | undefined;
	moves: {
		playCard(a: MovePlayCardArgs): void;
		rotateTile(a: MoveRotateTileArgs): void;
		stashToTreasure(a: MoveStashArgs): void;
		takeFromTreasure(a: MoveTakeTreasureArgs): void;
		endTurnAndRefill(): void;
	};
};

// Dev-only instrumentation counters
const DEBUG = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
const debugCounters = {
	noOpMoves: 0,
	enumeratorRejects: 0,
	simulatorMismatches: 0,
};

// =============================================================================
// Part 1.5: Single Source of Truth Enumerator
// =============================================================================

/**
 * Enumerate all legal actions for a player in the current state.
 * This is the canonical enumerator - all other code should call this.
 */
export const enumerateActions = (G: GState, playerID: PlayerID): Action[] => {
	const actions: Action[] = [];
	const rules = G.rules;
	const coords = buildAllCoords(G.radius);
	const hand = G.hands[playerID] ?? [];

	// Enumerate playCard moves
	if (rules.MODE === 'path') {
		for (let i = 0; i < hand.length; i += 1) {
			const card = hand[i]!;
			for (const color of card.colors) {
				for (const source of coords) {
					for (const dest of neighbors(source)) {
						if (canPlacePath(G, source, dest, color as Color, rules)) {
							actions.push({ type: 'playCard', args: { handIndex: i, pick: color, source, coord: dest } });
						}
					}
				}
			}
		}
	} else {
		for (let i = 0; i < hand.length; i += 1) {
			const card = hand[i]!;
			for (const color of card.colors) {
				for (const co of coords) {
					if (canPlace(G, co, color as Color, rules)) {
						actions.push({ type: 'playCard', args: { handIndex: i, pick: color, coord: co } });
					}
				}
			}
		}
	}

	// Enumerate rotateTile moves (Part 1.3)
	if (rules.PLACEMENT.DISCARD_TO_ROTATE !== false) {
		for (let i = 0; i < hand.length; i += 1) {
			const card = hand[i]!;
			for (const co of coords) {
				const tile = G.board[key(co)];
				if (!tile || tile.colors.length === 0) continue;

				// Check match-color constraint
				if (rules.PLACEMENT.DISCARD_TO_ROTATE === 'match-color') {
					const hasMatchingColor = card.colors.some((c) => tile.colors.includes(c));
					if (!hasMatchingColor) continue;
				}

				// Valid rotation amounts: 1, 2, 4, 5 (exclude 3 = 180°)
				for (const rotation of [1, 2, 4, 5]) {
					actions.push({ type: 'rotateTile', args: { coord: co, handIndex: i, rotation } });
				}
			}
		}
	}

	// Enumerate stashToTreasure moves
	if (G.treasure.length < rules.TREASURE_MAX && hand.length > 0) {
		for (let i = 0; i < hand.length; i += 1) {
			actions.push({ type: 'stashToTreasure', args: { handIndex: i } });
		}
	}

	// Enumerate takeFromTreasure moves (Part 1.3)
	for (let i = 0; i < G.treasure.length; i += 1) {
		actions.push({ type: 'takeFromTreasure', args: { index: i } });
	}

	// Always allow ending turn
	actions.push({ type: 'endTurnAndRefill' });

	return actions;
};

// =============================================================================
// Part 1.2: Micro-Step Simulator
// =============================================================================

const deepClone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj));

/**
 * Apply a single micro-action to state WITHOUT ending turn.
 * This matches the exact semantics of HexStringsGame.turn.stages.active.moves.
 */
export const applyMicroAction = (G: GState, action: Action, playerID: PlayerID): GState | null => {
	const newG = deepClone(G);
	const rules = newG.rules;
	const hand = newG.hands[playerID]!;

	switch (action.type) {
		case 'playCard': {
			const args = action.args;
			const card = hand[args.handIndex];
			if (!card) return null;
			if (rules.ONE_COLOR_PER_CARD_PLAY && !card.colors.includes(args.pick)) return null;
			if (rules.MODE === 'path') {
				if (!('source' in args)) return null;
				if (!canPlacePath(newG, args.source, args.coord, args.pick, rules)) return null;
				newG.lanes.push({ from: args.source, to: args.coord, color: args.pick });
			} else {
				if (!canPlace(newG, args.coord, args.pick, rules)) return null;
				const k = key(args.coord);
				const tile = newG.board[k];
				if (tile) {
					tile.colors.push(args.pick);
				} else {
					newG.board[k] = { colors: [args.pick], rotation: 0 };
				}
			}
			newG.stats.placements += 1;
			const [used] = hand.splice(args.handIndex, 1);
			if (used) newG.discard.push(used);
			break;
		}

		case 'rotateTile': {
			const args = action.args;
			const tile = newG.board[key(args.coord)];
			if (!tile || tile.colors.length === 0) return null;
			if (rules.PLACEMENT.DISCARD_TO_ROTATE === false) return null;

			const card = hand[args.handIndex];
			if (!card) return null;

			// Validate rotation amount
			if (args.rotation < 1 || args.rotation > 5 || args.rotation === 3) return null;

			// match-color mode
			if (rules.PLACEMENT.DISCARD_TO_ROTATE === 'match-color') {
				const hasMatchingColor = card.colors.some((c) => tile.colors.includes(c));
				if (!hasMatchingColor) return null;
			}

			tile.rotation = (tile.rotation + args.rotation) % 6;
			const [used] = hand.splice(args.handIndex, 1);
			if (used) newG.discard.push(used);
			break;
		}

		case 'stashToTreasure': {
			const args = action.args;
			if (newG.treasure.length >= rules.TREASURE_MAX) return null;
			const card = hand[args.handIndex];
			if (!card) return null;

			newG.treasure.push(card);
			hand.splice(args.handIndex, 1);
			// No immediate draw — bonus draws happen at end of turn
			newG.meta.stashBonus[playerID] = (newG.meta.stashBonus[playerID] ?? 0) + 1;
			break;
		}

		case 'takeFromTreasure': {
			const args = action.args;
			const card = newG.treasure[args.index];
			if (!card) return null;

			hand.push(card);
			newG.treasure.splice(args.index, 1);
			break;
		}

		case 'endTurnAndRefill':
			// This is handled by applyEndTurn, not here
			return null;
	}

	return newG;
};

/**
 * Apply end-turn effects: refill hand, reset stash bonus, advance turn.
 * Matches HexStringsGame.turn.stages.active.moves.endTurnAndRefill.
 */
export const applyEndTurn = (G: GState, ctx: Ctx, playerID: PlayerID): { G: GState; ctx: Ctx } => {
	const newG = deepClone(G);
	const newCtx = { ...ctx };
	const rules = newG.rules;

	// First refill to hand size
	while (newG.hands[playerID]!.length < rules.HAND_SIZE) {
		const c = newG.deck.pop() ?? null;
		if (!c) break;
		newG.hands[playerID]!.push(c);
	}

	// Then pay out stash bonus draws ON TOP of normal hand
	const bonus = newG.meta.stashBonus[playerID] ?? 0;
	for (let i = 0; i < bonus; i += 1) {
		const c = newG.deck.pop() ?? null;
		if (!c) break;
		newG.hands[playerID]!.push(c);
	}
	newG.meta.stashBonus[playerID] = 0;

	// Mark deck exhaustion if needed
	if (rules.END_ON_DECK_EXHAUST && newG.deck.length === 0 && newG.meta.deckExhaustionCycle === null) {
		newG.meta.deckExhaustionCycle = ctx.turn;
	}

	// Advance turn
	newCtx.turn += 1;
	const nextPlayerIndex = (ctx.playOrder.indexOf(playerID) + 1) % ctx.numPlayers;
	newCtx.currentPlayer = ctx.playOrder[nextPlayerIndex] as PlayerID;

	return { G: newG, ctx: newCtx };
};

// =============================================================================
// Part 2.3: Evaluator (Feature-Based Scoring)
// =============================================================================

type EvalFeatures = {
	scoreDelta: number;           // Change in player's score
	scoreGapDelta: number;        // Change in (myScore - bestOpponentScore)
	opponentScoreDelta: number;   // Change in best opponent's score
	mobilityDelta: number;        // Change in number of legal placements
	opponentMobilityDenial: number; // Reduction in opponent legal placements (weighted by rivalry)
	rimProgress: number;          // Progress toward rim (for path mode)
	handQuality: number;          // Quality of hand after action
	treasureControl: number;      // Advantage from treasure manipulation
};

const getColorValue = (color: Color, prefs: PlayerPrefs): number => {
	if (color === prefs.primary) return 3;
	if (color === prefs.secondary) return 2;
	if (color === prefs.tertiary) return 1;
	return 0;
};

const getCardValue = (card: Card, prefs: PlayerPrefs): number => {
	return Math.max(...card.colors.map((c) => getColorValue(c, prefs)));
};

const isObjectiveCard = (card: Card, prefs: PlayerPrefs): boolean => {
	return card.colors.some((c) => getColorValue(c, prefs) > 0);
};

const evaluateHandQuality = (hand: Card[], prefs: PlayerPrefs): number => {
	if (hand.length === 0) return 0;
	let totalValue = 0;
	for (const card of hand) {
		totalValue += getCardValue(card, prefs);
	}
	return totalValue / hand.length;
};

/**
 * Calculate color overlap between two players' objectives.
 * Returns 0-3 based on how many colors they share (primary/secondary/tertiary).
 * Higher overlap = more direct competition.
 */
const getColorOverlap = (prefsA: PlayerPrefs, prefsB: PlayerPrefs): number => {
	const colorsA = [prefsA.primary, prefsA.secondary, prefsA.tertiary];
	const colorsB = new Set([prefsB.primary, prefsB.secondary, prefsB.tertiary]);
	let overlap = 0;
	for (const c of colorsA) {
		if (colorsB.has(c)) overlap += 1;
	}
	return overlap;
};

/**
 * Calculate rivalry score: how much we should care about blocking this opponent.
 * Based on color overlap and current score proximity.
 */
const getRivalryScore = (
	myPrefs: PlayerPrefs,
	myScore: number,
	oppPrefs: PlayerPrefs,
	oppScore: number
): number => {
	// Color overlap: 0-3 shared colors
	const colorOverlap = getColorOverlap(myPrefs, oppPrefs);
	
	// Score proximity: care more about close competitors
	const scoreDiff = Math.abs(myScore - oppScore);
	const proximityFactor = Math.max(0, 1 - scoreDiff / 20); // Falls off as gap grows
	
	// Combined rivalry: high overlap + close score = big rival
	// Base rivalry from color overlap (0, 0.5, 1.0, 1.5 for 0, 1, 2, 3 shared colors)
	const baseRivalry = colorOverlap * 0.5;
	
	// Boost rivalry for close competitors
	return baseRivalry + proximityFactor * 0.5;
};

/**
 * Count legal placements for a player's objective colors on a given board state.
 * Used to measure mobility denial.
 */
const countObjectivePlacements = (G: GState, playerID: PlayerID): number => {
	const prefs = G.prefs[playerID];
	if (!prefs) return 0;
	
	const coords = buildAllCoords(G.radius);
	const objectiveColors = [prefs.primary, prefs.secondary, prefs.tertiary];
	let count = 0;
	
	if (G.rules.MODE === 'path') {
		for (const color of objectiveColors) {
			for (const source of coords) {
				for (const dest of neighbors(source)) {
					if (canPlacePath(G, source, dest, color, G.rules)) count += 1;
				}
			}
		}
	} else {
		for (const color of objectiveColors) {
			for (const co of coords) {
				if (canPlace(G, co, color, G.rules)) {
					count += 1;
				}
			}
		}
	}
	
	return count;
};

/**
 * Count legal placements for objective colors.
 */
const countMobility = (G: GState, playerID: PlayerID): number => {
	const hand = G.hands[playerID] ?? [];
	const prefs = G.prefs[playerID];
	if (!prefs) return 0;

	const coords = buildAllCoords(G.radius);
	let count = 0;

	for (const card of hand) {
		for (const color of card.colors) {
			if (getColorValue(color as Color, prefs) === 0) continue;
			if (G.rules.MODE === 'path') {
				for (const source of coords) {
					for (const dest of neighbors(source)) {
						if (canPlacePath(G, source, dest, color as Color, G.rules)) count += 1;
					}
				}
			} else {
				for (const co of coords) {
					if (canPlace(G, co, color as Color, G.rules)) {
						count += 1;
					}
				}
			}
		}
	}

	return count;
};

/**
 * Estimate progress toward rim for path mode.
 * Returns a value based on how close objective-colored tiles are to the rim.
 */
const estimateRimProgress = (G: GState, playerID: PlayerID): number => {
	const prefs = G.prefs[playerID];
	if (!prefs) return 0;

	const radius = G.radius;
	let progress = 0;

	if (G.rules.MODE === 'path') {
		for (const ln of G.lanes) {
			const ring = ringIndex(ln.to);
			const distToRim = radius - ring;
			const value = getColorValue(ln.color, prefs);
			if (value > 0) {
				progress += value * (1 - distToRim / radius);
			}
		}
	} else {
		for (const [k, tile] of Object.entries(G.board)) {
			if (!tile || tile.colors.length === 0) continue;
			const co = { q: 0, r: 0 };
			const [qStr, rStr] = k.split(',');
			co.q = parseInt(qStr!, 10);
			co.r = parseInt(rStr!, 10);

			const ring = ringIndex(co);
			const distToRim = radius - ring;

			for (const color of tile.colors) {
				const value = getColorValue(color as Color, prefs);
				if (value > 0) {
					// Higher value for tiles closer to rim
					progress += value * (1 - distToRim / radius);
				}
			}
		}
	}

	return progress;
};

/**
 * Compute evaluation features comparing state before and after action.
 */
const computeFeatures = (
	gBefore: GState,
	gAfter: GState,
	playerID: PlayerID,
	ctx: Ctx
): EvalFeatures => {
	const prefs = gBefore.prefs[playerID]!;

	// Score calculations
	const scoresBefore = computeScores(gBefore);
	const scoresAfter = computeScores(gAfter);
	const myScoreBefore = scoresBefore[playerID] ?? 0;
	const myScoreAfter = scoresAfter[playerID] ?? 0;
	const scoreDelta = myScoreAfter - myScoreBefore;

	// Best opponent scores (for gap calculation)
	let bestOppScoreBefore = 0;
	let bestOppScoreAfter = 0;
	let opponentScoreDelta = 0;
	for (const pid of ctx.playOrder) {
		if (pid === playerID) continue;
		const before = scoresBefore[pid] ?? 0;
		const after = scoresAfter[pid] ?? 0;
		bestOppScoreBefore = Math.max(bestOppScoreBefore, before);
		bestOppScoreAfter = Math.max(bestOppScoreAfter, after);
		opponentScoreDelta = Math.max(opponentScoreDelta, after - before);
	}

	// Score gap delta: change in lead over best opponent
	const gapBefore = myScoreBefore - bestOppScoreBefore;
	const gapAfter = myScoreAfter - bestOppScoreAfter;
	const scoreGapDelta = gapAfter - gapBefore;

	// Mobility delta (own)
	const mobilityBefore = countMobility(gBefore, playerID);
	const mobilityAfter = countMobility(gAfter, playerID);
	const mobilityDelta = mobilityAfter - mobilityBefore;

	// Opponent mobility denial (weighted by rivalry)
	// Only reward BLOCKING opponents, don't penalize opening the board for them
	let opponentMobilityDenial = 0;
	for (const pid of ctx.playOrder) {
		if (pid === playerID) continue;
		const oppPrefs = gBefore.prefs[pid];
		if (!oppPrefs) continue;

		const oppMobilityBefore = countObjectivePlacements(gBefore, pid);
		const oppMobilityAfter = countObjectivePlacements(gAfter, pid);
		// Clamp to non-negative: only reward blocking, ignore board-opening
		const denial = Math.max(0, oppMobilityBefore - oppMobilityAfter);

		// Weight denial by rivalry (color overlap + score proximity)
		const oppScoreBefore = scoresBefore[pid] ?? 0;
		const rivalry = getRivalryScore(prefs, myScoreBefore, oppPrefs, oppScoreBefore);
		opponentMobilityDenial += denial * rivalry;
	}

	// Rim progress (for path mode)
	const rimProgressBefore = estimateRimProgress(gBefore, playerID);
	const rimProgressAfter = estimateRimProgress(gAfter, playerID);
	const rimProgress = rimProgressAfter - rimProgressBefore;

	// Hand quality
	const handAfter = gAfter.hands[playerID] ?? [];
	const handQuality = evaluateHandQuality(handAfter, prefs);

	// Treasure control
	const treasureBefore = gBefore.treasure.length;
	const treasureAfter = gAfter.treasure.length;
	const treasureControl = treasureBefore - treasureAfter; // Positive if we're taking from treasure

	return {
		scoreDelta,
		scoreGapDelta,
		opponentScoreDelta,
		mobilityDelta,
		opponentMobilityDenial,
		rimProgress,
		handQuality,
		treasureControl,
	};
};

/**
 * Evaluate an action by computing delta-V (change in value).
 * Weights are tuned for each game mode.
 * 
 * Key strategic features:
 * - scoreGapDelta: Prioritize widening lead over best opponent (relative scoring)
 * - opponentMobilityDenial: Reward blocking rivals (weighted by color overlap)
 * - opponentScoreDelta: Penalize moves that help opponents
 */
export const evaluateAction = (
	gBefore: GState,
	gAfter: GState,
	action: Action,
	playerID: PlayerID,
	ctx: Ctx
): number => {
	const features = computeFeatures(gBefore, gAfter, playerID, ctx);
	const rules = gBefore.rules;
	const prefs = gBefore.prefs[playerID]!;

	// Mode-specific weights
	const isPathMode = rules.MODE === 'path';

	// Base weights
	const weights = {
		// Scoring: prefer gap improvement over raw score
		scoreDelta: 5.0,              // Still care about own score
		scoreGapDelta: 8.0,           // But care more about lead over opponents
		opponentScoreDelta: -3.0,     // Penalty for helping opponents
		
		// Mobility: own options + denying rivals
		mobilityDelta: 0.5,
		opponentMobilityDenial: 0.5,  // Reward blocking rivals (already rivalry-weighted)
		
		// Positional
		rimProgress: isPathMode ? 2.0 : 0.5,
		handQuality: 0.3,
		treasureControl: 0.2,
	};

	let value = 0;
	value += weights.scoreDelta * features.scoreDelta;
	value += weights.scoreGapDelta * features.scoreGapDelta;
	value += weights.opponentScoreDelta * features.opponentScoreDelta;
	value += weights.mobilityDelta * features.mobilityDelta;
	value += weights.opponentMobilityDenial * features.opponentMobilityDenial;
	value += weights.rimProgress * features.rimProgress;
	value += weights.handQuality * features.handQuality;
	value += weights.treasureControl * features.treasureControl;

	// Action-specific bonuses/penalties
	if (action.type === 'stashToTreasure') {
		const hand = gBefore.hands[playerID] ?? [];
		const card = hand[action.args.handIndex];
		if (card) {
			if (isObjectiveCard(card, prefs)) {
				value -= 5; // Penalty for stashing objective cards
			} else {
				value += 2; // Bonus for stashing non-objective cards
			}
		}
	}

	if (action.type === 'playCard') {
		const colorValue = getColorValue(action.args.pick, prefs);
		value += colorValue * 0.5; // Slight bonus for playing objective colors
	}

	if (action.type === 'rotateTile') {
		// Rotation should unlock valuable placements
		// The mobility delta already captures this, but add a small cost for rotating
		value -= 0.5; // Small cost to discourage frivolous rotations
	}

	return value;
};

// =============================================================================
// Part 2.2: Tight Candidate Generator
// =============================================================================

/**
 * Generate a prioritized subset of actions to evaluate.
 * This keeps branching factor small for efficiency.
 */
export const generateCandidates = (G: GState, playerID: PlayerID, _ctx: Ctx): Action[] => {
	const allActions = enumerateActions(G, playerID);
	const prefs = G.prefs[playerID]!;
	const rules = G.rules;

	// Separate actions by type
	const playActions: Action[] = [];
	const rotateActions: Action[] = [];
	const stashActions: Action[] = [];
	const takeActions: Action[] = [];

	for (const action of allActions) {
		switch (action.type) {
			case 'playCard':
				playActions.push(action);
				break;
			case 'rotateTile':
				rotateActions.push(action);
				break;
			case 'stashToTreasure':
				stashActions.push(action);
				break;
			case 'takeFromTreasure':
				takeActions.push(action);
				break;
		}
	}

	const candidates: Action[] = [];

	// PlayCard candidates: prioritize objective colors and rim-adjacent placements
	const scoredPlayActions = playActions.map((action) => {
		if (action.type !== 'playCard') return { action, score: 0 };
		const colorValue = getColorValue(action.args.pick, prefs);
		const ring = ringIndex(action.args.coord);
		const rimBonus = ring === G.radius ? 2 : ring >= G.radius - 1 ? 1 : 0;
		return { action, score: colorValue * 2 + rimBonus };
	});
	scoredPlayActions.sort((a, b) => b.score - a.score);

	// Take top N play actions
	const maxPlayCandidates = Math.min(15, playActions.length);
	for (let i = 0; i < maxPlayCandidates; i += 1) {
		candidates.push(scoredPlayActions[i]!.action);
	}

	// Rotate candidates: only include if they might unlock valuable placements
	// Limit to tiles with objective colors that are near the rim
	const scoredRotateActions = rotateActions
		.filter((action) => {
			if (action.type !== 'rotateTile') return false;
			const tile = G.board[key(action.args.coord)];
			if (!tile) return false;
			// Only consider tiles with objective colors
			return tile.colors.some((c) => getColorValue(c as Color, prefs) > 0);
		})
		.map((action) => {
			if (action.type !== 'rotateTile') return { action, score: 0 };
			const ring = ringIndex(action.args.coord);
			return { action, score: G.radius - ring }; // Prefer tiles closer to center (more impact)
		});
	scoredRotateActions.sort((a, b) => b.score - a.score);

	const maxRotateCandidates = Math.min(4, scoredRotateActions.length);
	for (let i = 0; i < maxRotateCandidates; i += 1) {
		candidates.push(scoredRotateActions[i]!.action);
	}

	// Stash candidates: prioritize non-objective cards
	const scoredStashActions = stashActions.map((action) => {
		if (action.type !== 'stashToTreasure') return { action, score: 0 };
		const hand = G.hands[playerID] ?? [];
		const card = hand[action.args.handIndex];
		if (!card) return { action, score: -100 };
		const isObjective = isObjectiveCard(card, prefs);
		return { action, score: isObjective ? -5 : 3 };
	});
	scoredStashActions.sort((a, b) => b.score - a.score);

	// Only include stash if treasure has space and we have non-objective cards
	if (G.treasure.length < rules.TREASURE_MAX && scoredStashActions.length > 0 && scoredStashActions[0]!.score > 0) {
		candidates.push(scoredStashActions[0]!.action);
	}

	// Take candidates: only if treasure has objective cards we want
	const scoredTakeActions = takeActions.map((action) => {
		if (action.type !== 'takeFromTreasure') return { action, score: 0 };
		const card = G.treasure[action.args.index];
		if (!card) return { action, score: -100 };
		const cardValue = getCardValue(card, prefs);
		return { action, score: cardValue };
	});
	scoredTakeActions.sort((a, b) => b.score - a.score);

	// Only take if there's a valuable card
	if (scoredTakeActions.length > 0 && scoredTakeActions[0]!.score >= 2) {
		candidates.push(scoredTakeActions[0]!.action);
	}

	return candidates;
};

// =============================================================================
// Part 2.4: Evaluator-Driven Planner Loop
// =============================================================================

const DELTA_V_THRESHOLD = 0.1; // Minimum value to take an action (vs ending turn)

/**
 * Select the best action for the current micro-step.
 * Returns null if ending turn is the best choice.
 */
export const selectBestAction = (G: GState, ctx: Ctx, playerID: PlayerID): Action | null => {
	const candidates = generateCandidates(G, playerID, ctx);

	if (candidates.length === 0) {
		return null; // End turn
	}

	let bestAction: Action | null = null;
	let bestValue = DELTA_V_THRESHOLD; // Must beat threshold to be selected

	for (const action of candidates) {
		const gAfter = applyMicroAction(G, action, playerID);
		if (!gAfter) {
			if (DEBUG) debugCounters.enumeratorRejects += 1;
			continue;
		}

		const value = evaluateAction(G, gAfter, action, playerID, ctx);
		if (value > bestValue) {
			bestValue = value;
			bestAction = action;
		}
	}

	return bestAction;
};

// =============================================================================
// Part 2.5: Volatility-Triggered Shallow Lookahead (Optional)
// =============================================================================

/**
 * Check if the current state is "volatile" and warrants deeper search.
 */
const isVolatileState = (G: GState, playerID: PlayerID, _ctx: Ctx): boolean => {
	const prefs = G.prefs[playerID];
	if (!prefs) return false;

	// Check for imminent scoring completions
	const scores = computeScores(G);
	const currentScore = scores[playerID] ?? 0;

	// Volatile if score is high (late game)
	if (currentScore > 20) return true;

	// Check for rim-adjacent objective placements
	const hand = G.hands[playerID] ?? [];
	const coords = buildAllCoords(G.radius);

	for (const card of hand) {
		for (const color of card.colors) {
			const colorValue = getColorValue(color as Color, prefs);
			if (colorValue === 0) continue;

			if (G.rules.MODE === 'path') {
				for (const source of coords) {
					for (const dest of neighbors(source)) {
						if (ringIndex(dest) !== G.radius) continue;
						if (canPlacePath(G, source, dest, color as Color, G.rules)) return true;
					}
				}
			} else {
				for (const co of coords) {
					if (ringIndex(co) !== G.radius) continue;
					if (canPlace(G, co, color as Color, G.rules)) {
						return true; // Rim placement available
					}
				}
			}
		}
	}

	return false;
};

/**
 * Perform 1-ply lookahead for volatile situations.
 */
const selectWithLookahead = (G: GState, ctx: Ctx, playerID: PlayerID): Action | null => {
	const candidates = generateCandidates(G, playerID, ctx);

	if (candidates.length === 0) {
		return null;
	}

	let bestAction: Action | null = null;
	let bestValue = DELTA_V_THRESHOLD;

	for (const action of candidates) {
		const gAfter = applyMicroAction(G, action, playerID);
		if (!gAfter) continue;

		// Immediate value
		let value = evaluateAction(G, gAfter, action, playerID, ctx);

		// 1-ply lookahead: what's the best follow-up action?
		const followUpCandidates = generateCandidates(gAfter, playerID, ctx);
		let bestFollowUp = 0;

		for (const followUp of followUpCandidates) {
			const gAfterFollowUp = applyMicroAction(gAfter, followUp, playerID);
			if (!gAfterFollowUp) continue;
			const followUpValue = evaluateAction(gAfter, gAfterFollowUp, followUp, playerID, ctx);
			bestFollowUp = Math.max(bestFollowUp, followUpValue);
		}

		// Discount follow-up value
		value += bestFollowUp * 0.5;

		if (value > bestValue) {
			bestValue = value;
			bestAction = action;
		}
	}

	return bestAction;
};

// =============================================================================
// Part 1.4: Random Bot (Actually Random)
// =============================================================================

const waitForStateUpdate = (): Promise<void> => {
	return new Promise((resolve) => {
		const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
		if (raf) {
			raf(() => {
				raf(() => {
					resolve();
				});
			});
		} else {
			// Node.js environment - resolve immediately
			resolve();
		}
	});
};

/**
 * Play one turn using truly random action selection.
 */
export const playOneRandom = async (client: BGIOClient, playerID: PlayerID): Promise<void> => {
	const maxMoves = 20;
	let movesMade = 0;

	while (movesMade < maxMoves) {
		await waitForStateUpdate();

		const state = client.getState();
		if (!state || state.ctx.currentPlayer !== playerID) break;

		const G = state.G;
		const actions = enumerateActions(G, playerID).filter((a) => a.type !== 'endTurnAndRefill');

		if (actions.length === 0) {
			client.moves.endTurnAndRefill();
			break;
		}

		// Truly random selection
		const randomIndex = Math.floor(Math.random() * actions.length);
		const action = actions[randomIndex]!;

		const stateBefore = {
			placements: G.stats.placements,
			handSize: G.hands[playerID]?.length ?? 0,
			treasureSize: G.treasure.length,
			deckSize: G.deck.length,
		};

		executeAction(client, action);
		movesMade += 1;

		await waitForStateUpdate();

		const stateAfter = client.getState();
		if (!stateAfter || stateAfter.ctx.currentPlayer !== playerID) break;

		const stateChanged =
			stateAfter.G.stats.placements !== stateBefore.placements ||
			stateAfter.G.hands[playerID]?.length !== stateBefore.handSize ||
			stateAfter.G.treasure.length !== stateBefore.treasureSize ||
			stateAfter.G.deck.length !== stateBefore.deckSize;

		if (!stateChanged) {
			if (DEBUG) debugCounters.noOpMoves += 1;
			client.moves.endTurnAndRefill();
			break;
		}
	}
};

// =============================================================================
// Evaluator Bot
// =============================================================================

const executeAction = (client: BGIOClient, action: Action): void => {
	switch (action.type) {
		case 'playCard':
			client.moves.playCard(action.args);
			break;
		case 'rotateTile':
			client.moves.rotateTile(action.args);
			break;
		case 'stashToTreasure':
			client.moves.stashToTreasure(action.args);
			break;
		case 'takeFromTreasure':
			client.moves.takeFromTreasure(action.args);
			break;
		case 'endTurnAndRefill':
			client.moves.endTurnAndRefill();
			break;
	}
};

/**
 * Play one turn using the evaluator-driven planner.
 */
export const playOneEvaluator = async (client: BGIOClient, playerID: PlayerID): Promise<void> => {
	const maxMoves = 20;
	let movesMade = 0;

	while (movesMade < maxMoves) {
		await waitForStateUpdate();

		const state = client.getState();
		if (!state || state.ctx.currentPlayer !== playerID) break;

		const G = state.G;
		const ctx = state.ctx;

		const action = selectBestAction(G, ctx, playerID);

		if (!action) {
			client.moves.endTurnAndRefill();
			break;
		}

		const stateBefore = {
			placements: G.stats.placements,
			handSize: G.hands[playerID]?.length ?? 0,
			treasureSize: G.treasure.length,
			deckSize: G.deck.length,
		};

		executeAction(client, action);
		movesMade += 1;

		await waitForStateUpdate();

		const stateAfter = client.getState();
		if (!stateAfter || stateAfter.ctx.currentPlayer !== playerID) break;

		const stateChanged =
			stateAfter.G.stats.placements !== stateBefore.placements ||
			stateAfter.G.hands[playerID]?.length !== stateBefore.handSize ||
			stateAfter.G.treasure.length !== stateBefore.treasureSize ||
			stateAfter.G.deck.length !== stateBefore.deckSize;

		if (!stateChanged) {
			if (DEBUG) debugCounters.noOpMoves += 1;
			client.moves.endTurnAndRefill();
			break;
		}
	}
};

/**
 * Play one turn using the evaluator with optional lookahead.
 */
export const playOneEvaluatorPlus = async (client: BGIOClient, playerID: PlayerID): Promise<void> => {
	const maxMoves = 20;
	let movesMade = 0;

	while (movesMade < maxMoves) {
		await waitForStateUpdate();

		const state = client.getState();
		if (!state || state.ctx.currentPlayer !== playerID) break;

		const G = state.G;
		const ctx = state.ctx;

		// Use lookahead in volatile situations
		const action = isVolatileState(G, playerID, ctx)
			? selectWithLookahead(G, ctx, playerID)
			: selectBestAction(G, ctx, playerID);

		if (!action) {
			client.moves.endTurnAndRefill();
			break;
		}

		const stateBefore = {
			placements: G.stats.placements,
			handSize: G.hands[playerID]?.length ?? 0,
			treasureSize: G.treasure.length,
			deckSize: G.deck.length,
		};

		executeAction(client, action);
		movesMade += 1;

		await waitForStateUpdate();

		const stateAfter = client.getState();
		if (!stateAfter || stateAfter.ctx.currentPlayer !== playerID) break;

		const stateChanged =
			stateAfter.G.stats.placements !== stateBefore.placements ||
			stateAfter.G.hands[playerID]?.length !== stateBefore.handSize ||
			stateAfter.G.treasure.length !== stateBefore.treasureSize ||
			stateAfter.G.deck.length !== stateBefore.deckSize;

		if (!stateChanged) {
			if (DEBUG) debugCounters.noOpMoves += 1;
			client.moves.endTurnAndRefill();
			break;
		}
	}
};

// =============================================================================
// Part 1.6: Debug Instrumentation
// =============================================================================

export const getDebugCounters = (): typeof debugCounters => ({ ...debugCounters });

export const resetDebugCounters = (): void => {
	debugCounters.noOpMoves = 0;
	debugCounters.enumeratorRejects = 0;
	debugCounters.simulatorMismatches = 0;
};

/**
 * Verify that simulator produces the same result as the actual game move.
 * Call this in dev mode after each bot move for mismatch detection.
 */
export const verifySimulatorMatch = (
	gBefore: GState,
	gAfter: GState,
	action: Action,
	playerID: PlayerID
): boolean => {
	if (!DEBUG) return true;

	const simulated = applyMicroAction(gBefore, action, playerID);
	if (!simulated) {
		debugCounters.simulatorMismatches += 1;
		console.warn('[AI] Simulator rejected action that game accepted:', action);
		return false;
	}

	// Compare key state fields
	if (simulated.stats.placements !== gAfter.stats.placements) {
		debugCounters.simulatorMismatches += 1;
		console.warn('[AI] Placement count mismatch:', {
			simulated: simulated.stats.placements,
			actual: gAfter.stats.placements,
		});
		return false;
	}

	if (simulated.hands[playerID]?.length !== gAfter.hands[playerID]?.length) {
		debugCounters.simulatorMismatches += 1;
		console.warn('[AI] Hand size mismatch:', {
			simulated: simulated.hands[playerID]?.length,
			actual: gAfter.hands[playerID]?.length,
		});
		return false;
	}

	return true;
};
