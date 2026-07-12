/**
 * Headless bot-vs-bot diagnostic harness.
 *
 * Plays full games using the real game setup/endIf and the real AI policies,
 * collecting behavioral metrics to identify concrete failure modes:
 *   npx tsx scripts/ai-diagnostics.ts [gamesPerMatchup]
 */
import type { Ctx, PlayerID } from 'boardgame.io';
import { HexStringsGame } from '../src/game/game';
import {
	enumerateActions,
	applyMicroAction,
	applyEndTurn,
	selectBestAction,
	selectWithLookahead,
	generateCandidates,
	evaluateAction,
	type Action,
} from '../src/game/ai';
import { countRimToCenterPaths } from '../src/game/helpers';
import { computeScoresRaw } from '../src/game/scoring';
import type { GState } from '../src/game/types';

type Policy = (G: GState, ctx: Ctx, pid: PlayerID) => Action | null;

const randomPolicy: Policy = (G, _ctx, pid) => {
	const actions = enumerateActions(G, pid).filter((a) => a.type !== 'endTurnAndRefill');
	if (actions.length === 0) return null;
	// Random ends turn with ~25% chance to avoid dumping whole hand every turn
	if (Math.random() < 0.25) return null;
	return actions[Math.floor(Math.random() * actions.length)]!;
};

const evaluatorPolicy: Policy = (G, ctx, pid) => selectBestAction(G, ctx, pid);
const evaluatorPlusPolicy: Policy = (G, ctx, pid) => selectWithLookahead(G, ctx, pid);

type PlayerStats = {
	microActions: number;
	byType: Record<string, number>;
	conversions: number;
	turns: number;
	decisionMs: number[];
	// Times the bot ended its turn while a strictly score-increasing playCard existed
	endedTurnWithScoringMove: number;
	// Times the bot chose an action with a worse immediate score delta than the best available playCard
	pickedWorseThanBestScoring: number;
	bestScoringDeltaMissed: number[];
	probes: { inCandidates: boolean; value: number; delta: number }[];
};

const newStats = (): PlayerStats => ({
	microActions: 0,
	byType: {},
	conversions: 0,
	turns: 0,
	decisionMs: [],
	endedTurnWithScoringMove: 0,
	pickedWorseThanBestScoring: 0,
	bestScoringDeltaMissed: [],
	probes: [],
});

/** Best immediate score delta among playCard actions (and the chosen action's delta). */
const scoringAnalysis = (G: GState, pid: PlayerID, chosen: Action | null) => {
	const base = computeScoresRaw(G)[pid] ?? 0;
	let bestDelta = 0;
	let bestAction: Action | null = null;
	for (const a of enumerateActions(G, pid)) {
		if (a.type !== 'playCard') continue;
		const next = applyMicroAction(G, a, pid);
		if (!next) continue;
		const delta = (computeScoresRaw(next)[pid] ?? 0) - base;
		if (delta > bestDelta) { bestDelta = delta; bestAction = a; }
	}
	let chosenDelta = 0;
	if (chosen) {
		const next = applyMicroAction(G, chosen, pid);
		if (next) chosenDelta = (computeScoresRaw(next)[pid] ?? 0) - base;
	}
	return { bestDelta, chosenDelta, bestAction };
};

type GameResult = {
	turns: number;
	scores: Record<string, number>;
	winner: string | 'draw';
	pathsCompleted: number;
	endReason: string;
	stats: Record<string, PlayerStats>;
};

const playGame = (policies: Record<PlayerID, Policy>, analyzeScoring: boolean): GameResult => {
	let ctx = {
		currentPlayer: '0',
		playOrder: ['0', '1'],
		numPlayers: 2,
		turn: 1,
		phase: null,
	} as unknown as Ctx;
	let G = (HexStringsGame.setup as (c: { ctx: Ctx }) => GState)({ ctx });
	// tsx has no vite env, so RULES defaults ACTION_CARDS to 'disabled'; the real
	// game runs one-per-turn (.env.local) — match it so bots face action cards.
	G = { ...G, rules: { ...G.rules, ACTION_CARDS: 'one-per-turn' } };
	const stats: Record<string, PlayerStats> = { '0': newStats(), '1': newStats() };

	let endReason = 'turn-cap';
	const TURN_CAP = 160;

	while (ctx.turn <= TURN_CAP) {
		const over = (HexStringsGame.endIf as (c: { G: GState; ctx: Ctx }) => unknown)({ G, ctx });
		if (over) {
			endReason = countRimToCenterPaths(G) >= G.rules.PLACEMENT.CONSOLIDATION_END
				? 'consolidation' : 'deck-exhausted';
			break;
		}
		const pid = ctx.currentPlayer as PlayerID;
		const st = stats[pid]!;
		st.turns += 1;

		for (let micro = 0; micro < 20; micro += 1) {
			const t0 = performance.now();
			const action = policies[pid]!(G, ctx, pid);
			st.decisionMs.push(performance.now() - t0);

			if (analyzeScoring) {
				const { bestDelta, chosenDelta, bestAction } = scoringAnalysis(G, pid, action);
				if (bestDelta > 0 && (action === null || chosenDelta < bestDelta)) {
					if (action === null) st.endedTurnWithScoringMove += 1;
					else st.pickedWorseThanBestScoring += 1;
					st.bestScoringDeltaMissed.push(action === null ? bestDelta : bestDelta - chosenDelta);
					// ROOT CAUSE PROBE: was the best-scoring move even a candidate,
					// and what value did the evaluator assign it?
					if (bestAction) {
						const cands = generateCandidates(G, pid, ctx);
						const key = JSON.stringify(bestAction.args);
						const inCandidates = cands.some((c) => c.type === 'playCard' && JSON.stringify(c.args) === key);
						const gAfter = applyMicroAction(G, bestAction, pid);
						const value = gAfter ? evaluateAction(G, gAfter, bestAction, pid, ctx) : NaN;
						st.probes.push({ inCandidates, value, delta: bestDelta });
					}
				}
			}

			if (!action) break;
			const next = applyMicroAction(G, action, pid);
			if (!next) break; // policy produced illegal action — itself a finding
			G = next;
			st.microActions += 1;
			st.byType[action.type] = (st.byType[action.type] ?? 0) + 1;
			if (action.type === 'playCard' && 'convert' in action.args && action.args.convert) {
				st.conversions += 1;
			}
		}

		const advanced = applyEndTurn(G, ctx, pid);
		G = advanced.G;
		ctx = advanced.ctx;
	}

	const scores = computeScoresRaw(G);
	const s0 = scores['0'] ?? 0;
	const s1 = scores['1'] ?? 0;
	return {
		turns: ctx.turn,
		scores,
		winner: s0 === s1 ? 'draw' : s0 > s1 ? '0' : '1',
		pathsCompleted: countRimToCenterPaths(G),
		endReason,
		stats,
	};
};

const pct = (n: number, d: number) => (d === 0 ? '0%' : `${Math.round((100 * n) / d)}%`);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const runMatchup = (name: string, pol0: Policy, pol1: Policy, games: number, analyzeScoring: boolean) => {
	console.log(`\n=== ${name} (${games} games) ===`);
	const wins: Record<string, number> = { '0': 0, '1': 0, draw: 0 };
	const agg: Record<string, PlayerStats> = { '0': newStats(), '1': newStats() };
	let totalTurns = 0;
	const endReasons: Record<string, number> = {};

	for (let i = 0; i < games; i += 1) {
		// Alternate seats so first-player advantage doesn't skew win rates
		const swap = i % 2 === 1;
		const res = playGame({ '0': swap ? pol1 : pol0, '1': swap ? pol0 : pol1 } as Record<PlayerID, Policy>, analyzeScoring);
		const w = res.winner === 'draw' ? 'draw' : (swap ? (res.winner === '0' ? '1' : '0') : res.winner);
		wins[w] = (wins[w] ?? 0) + 1;
		totalTurns += res.turns;
		endReasons[res.endReason] = (endReasons[res.endReason] ?? 0) + 1;
		for (const seat of ['0', '1'] as const) {
			const logical = swap ? (seat === '0' ? '1' : '0') : seat;
			const src = res.stats[seat]!;
			const dst = agg[logical]!;
			dst.microActions += src.microActions;
			dst.turns += src.turns;
			dst.conversions += src.conversions;
			dst.endedTurnWithScoringMove += src.endedTurnWithScoringMove;
			dst.pickedWorseThanBestScoring += src.pickedWorseThanBestScoring;
			dst.bestScoringDeltaMissed.push(...src.bestScoringDeltaMissed);
			dst.probes.push(...src.probes);
			dst.decisionMs.push(...src.decisionMs);
			for (const [k, v] of Object.entries(src.byType)) dst.byType[k] = (dst.byType[k] ?? 0) + v;
		}
		process.stdout.write('.');
	}
	console.log('');
	console.log(`wins: A=${wins['0']} B=${wins['1']} draw=${wins['draw']} | avg turns ${Math.round(totalTurns / games)} | end: ${JSON.stringify(endReasons)}`);
	for (const p of ['0', '1'] as const) {
		const s = agg[p]!;
		console.log(`  ${p === '0' ? 'A' : 'B'}: ${s.microActions} actions over ${s.turns} turns (${(s.microActions / Math.max(1, s.turns)).toFixed(1)}/turn)`
			+ ` | types ${JSON.stringify(s.byType)} | conversions ${s.conversions}`
			+ ` | decision avg ${avg(s.decisionMs).toFixed(0)}ms max ${Math.max(0, ...s.decisionMs).toFixed(0)}ms`);
		if (analyzeScoring) {
			console.log(`     missed-scoring: endedTurn ${s.endedTurnWithScoringMove}, pickedWorse ${s.pickedWorseThanBestScoring},`
				+ ` avg missed delta ${avg(s.bestScoringDeltaMissed).toFixed(1)} (${pct(s.endedTurnWithScoringMove + s.pickedWorseThanBestScoring, s.decisionMs.length)} of decisions)`);
			if (s.probes.length) {
				const notCand = s.probes.filter((pr) => !pr.inCandidates).length;
				const negValue = s.probes.filter((pr) => pr.inCandidates && pr.value <= 0.1).length;
				const posValue = s.probes.filter((pr) => pr.inCandidates && pr.value > 0.1).length;
				console.log(`     probe: bestScoring move missing from candidates ${notCand}/${s.probes.length},`
					+ ` evaluated<=threshold ${negValue}, evaluated>threshold ${posValue};`
					+ ` avg value when evaluated ${avg(s.probes.filter((pr) => pr.inCandidates).map((pr) => pr.value)).toFixed(1)}`);
			}
		}
	}
};

const N = Number(process.argv[2]) || 8;
if (!process.argv.includes('--plus-only')) {
	runMatchup('Evaluator (A) vs Random (B)', evaluatorPolicy, randomPolicy, N, true);
}
if (process.argv.includes('--plus') || process.argv.includes('--plus-only')) {
	runMatchup('Search/Plus (A) vs Evaluator (B)', evaluatorPlusPolicy, evaluatorPolicy, N, false);
}
