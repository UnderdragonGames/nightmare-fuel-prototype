import { describe, it, expect } from 'vitest';
import type { Game, PlayerID } from 'boardgame.io';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { HexStringsGame } from '../game/game';
import { CARDS } from '../game/cards';
import { resolveCardEffects } from '../game/cardActions';
import { playDraftStep, playOneEvaluator, playOneEvaluatorPlus, runDraftStepDeferred } from '../game/ai';
import type { Card, GState } from '../game/types';

// Playtest report (2026-10-28): "Mystery box seems to get stuck when it goes
// to the next evaluator player." Earlier coverage drove playDraftStep through
// a hand-rolled shim; this drives REAL boardgame.io clients (Local master,
// playerView, stages, subscriptions) with the subscribe + nudge runner shape
// the app and server use.
//
// Root cause: draft moves ran optimistically on the bot's client; when the
// master rejected one (it validates against not-yet-persisted state if the
// move is sent from inside its own broadcast), the client sat one _stateID
// ahead, ignored every older master update, and — as the only active player —
// never saw a newer one. Fixed by making draftPick/draftPlace client:false,
// plus runDraftStepDeferred so the first attempt lands without a nudge.

const MYSTERY_BOX = 63;
const byId = (id: number): Card => ({ ...(CARDS as Card[]).find((c) => c.id === id)! });

type RawClient = ReturnType<typeof Client<GState>>;

/** HexStringsGame with P0 holding Mystery Box and a fixed seat order. */
const makeGame = (): Game<GState> => ({
	...HexStringsGame,
	setup: (ctx) => {
		const G = (HexStringsGame.setup as (c: typeof ctx) => GState)(ctx);
		G.rules = { ...G.rules, RANDOM_START_ORDER: false };
		G.players['0']!.hand = [byId(MYSTERY_BOX), ...G.players['0']!.hand.slice(1)];
		return G;
	},
});

type RunnerOpts = {
	/**
	 * 'sync': draft step dispatched inside the subscription callback (the
	 * worst case — what the runners did when the hang was reported).
	 * 'deferred': dispatched on the next macrotask, as useBotClients now does.
	 */
	dispatch: 'sync' | 'deferred';
	nudgeMs: number;
};

/** Mirror of the bot runner in useBotClients / server.ts spawnBot. */
const attachBot = (client: RawClient, seat: PlayerID, kind: 'Evaluator' | 'EvaluatorPlus', opts: RunnerOpts): (() => void) => {
	let playing = false;
	const isDrafter = (s: ReturnType<RawClient['getState']>): boolean =>
		(s?.ctx.activePlayers as Record<string, string> | null)?.[seat] === 'draft';
	const handle = (state: ReturnType<RawClient['getState']>): void => {
		if (!state || state.ctx.gameover) return;
		if (isDrafter(state)) {
			if (!playing) {
				playing = true;
				if (opts.dispatch === 'deferred') {
					// The production scheduler shared by useBotClients and server.ts.
					runDraftStepDeferred(client as never, seat, () => { playing = false; }, () => handle(client.getState()));
				} else {
					try {
						playDraftStep(client as never, seat);
					} finally {
						playing = false;
					}
				}
			}
			return;
		}
		if (state.ctx.currentPlayer !== seat) return;
		if (state.G.action?.pendingDraft) return;
		if (playing) return;
		playing = true;
		(async () => {
			try {
				if (kind === 'Evaluator') await playOneEvaluator(client as never, seat);
				else await playOneEvaluatorPlus(client as never, seat);
			} finally {
				playing = false;
			}
		})();
	};
	const unsub = client.subscribe(handle);
	const nudge = setInterval(() => handle(client.getState()), opts.nudgeMs);
	return () => {
		clearInterval(nudge);
		unsub();
	};
};

const waitFor = async (pred: () => boolean, ms: number): Promise<boolean> => {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (pred()) return true;
		await new Promise((r) => setTimeout(r, 20));
	}
	return pred();
};

const SCENARIOS: Array<{ name: string; kind: 'Evaluator' | 'EvaluatorPlus'; opts: RunnerOpts }> = [
	// Engine robustness: even a runner that dispatches inside the callback
	// (moves land on stale master storage and get rejected) must not hang —
	// rejected draft moves can't strand a client now that they're client:false.
	{ name: 'Evaluator, sync dispatch', kind: 'Evaluator', opts: { dispatch: 'sync', nudgeMs: 50 } },
	{ name: 'EvaluatorPlus, sync dispatch', kind: 'EvaluatorPlus', opts: { dispatch: 'sync', nudgeMs: 50 } },
	// Runner fix: deferred dispatch lands on the FIRST attempt — the nudge is
	// effectively off, so any rejection would show up as a stall.
	{ name: 'EvaluatorPlus, deferred dispatch, no nudge', kind: 'EvaluatorPlus', opts: { dispatch: 'deferred', nudgeMs: 60_000 } },
];

describe('Mystery Box hands off to evaluator bots (real clients)', () => {
	for (const { name, kind, opts } of SCENARIOS) {
		it(`draft passes through bot seats and returns control to P0 (${name})`, async () => {
			const game = makeGame();
			const matchID = `mb-${Math.random().toString(36).slice(2)}`;
			const numPlayers = 3;
			const clients: RawClient[] = [];
			for (let i = 0; i < numPlayers; i += 1) {
				const c = Client<GState>({ game, numPlayers, multiplayer: Local(), playerID: String(i), matchID });
				c.start();
				clients.push(c);
			}
			const detach = [attachBot(clients[1]!, '1', kind, opts), attachBot(clients[2]!, '2', kind, opts)];
			try {
				const human = clients[0]!;
				await waitFor(() => !!human.getState(), 1000);
				const s0 = human.getState()!;
				expect(s0.ctx.currentPlayer).toBe('0');
				const card = s0.G.players['0']!.hand[0]!;
				expect(card.id).toBe(MYSTERY_BOX);

				const effects = resolveCardEffects(card, {
					currentPlayerId: '0',
					playerOrder: s0.ctx.playOrder as PlayerID[],
					lastPlacedColor: s0.G.action.lastPlacedColor,
					mode: s0.G.rules.MODE,
				});
				human.moves.playActionCard({ handIndex: 0, effects });
				expect(await waitFor(() => !!human.getState()!.G.action.pendingDraft, 1000)).toBe(true);

				// Human takes the first pick (and places it if it's a lane).
				human.moves.draftPick({ index: 0 });
				await waitFor(() => {
					const d = human.getState()!.G.action.pendingDraft;
					return !d || d.position > 0 || !!d.placing;
				}, 1000);
				const afterPick = human.getState()!;
				if (afterPick.G.action.pendingDraft?.placing?.playerId === '0') {
					playDraftStep(human as never, '0'); // same first-legal placement a bot uses
				}

				// The bots must finish their picks and control must return to P0.
				// Without the nudge, 2s is ample only if every first attempt lands.
				const finished = await waitFor(() => {
					const s = human.getState()!;
					return s.G.action.pendingDraft === null
						&& (s.ctx.activePlayers as Record<string, string> | null)?.['0'] === 'active';
				}, opts.nudgeMs > 1000 ? 2000 : 4000);
				const s = human.getState()!;
				expect(
					finished,
					`stuck: pendingDraft=${JSON.stringify(s.G.action.pendingDraft)} activePlayers=${JSON.stringify(s.ctx.activePlayers)} revealed=${s.G.action.revealed.length}`,
				).toBe(true);
				expect(s.ctx.currentPlayer).toBe('0');
			} finally {
				for (const d of detach) d();
				for (const c of clients) c.stop();
			}
		});
	}
});
