/**
 * Bot System - Re-exports from new AI module
 *
 * This file maintains backwards compatibility while delegating to the new
 * evaluator-driven AI system in ai.ts.
 *
 * The old Monte Carlo bots (Dumb/Smart) are replaced with Evaluator/EvaluatorPlus
 * which are faster and more rule-consistent.
 */

import type { Ctx, PlayerID } from 'boardgame.io';
import type { GState } from './types';

// Re-export from the new AI module
export type { BotKind } from './ai';
export {
	playOneRandom,
	playOneEvaluator,
	playOneEvaluatorPlus,
	enumerateActions,
	applyMicroAction,
	applyEndTurn,
	evaluateAction,
	generateCandidates,
	selectBestAction,
	getDebugCounters,
	resetDebugCounters,
	verifySimulatorMatch,
} from './ai';

// Legacy aliases for backwards compatibility
import { playOneEvaluator, playOneEvaluatorPlus } from './ai';

export const playOneDumb = playOneEvaluator;
export const playOneSmart = playOneEvaluatorPlus;

// Type for client interface (used by UI)
type BGIOClient = {
	getState(): ({ G: GState; ctx: Ctx } & { playerID?: PlayerID }) | undefined;
	moves: {
		playCard(a: unknown): void;
		rotateTile(a: unknown): void;
		stashToTreasure(a: unknown): void;
		takeFromTreasure(a: unknown): void;
		endTurnAndRefill(): void;
	};
};

// Re-export type
export type { BGIOClient };
