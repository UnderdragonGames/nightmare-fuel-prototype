/**
 * Hook to manage headless bot Client instances for multiplayer: Local().
 *
 * Each bot player gets its own raw boardgame.io Client, connected to the
 * same LocalMaster as the human's React Client (via shared game reference).
 * Bot auto-play triggers when state updates show it's the bot's turn.
 */
import { useEffect, useRef } from 'react';
import { Client as RawClient } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import type { Game, PlayerID } from 'boardgame.io';
import type { GState } from './game/types';
import type { BotKind } from './game/bots';
import { playOneRandom, playOneEvaluator, playOneEvaluatorPlus } from './game/bots';

type RawClientInstance = ReturnType<typeof RawClient<GState>>;

export function useBotClients(
	game: Game<GState>,
	numPlayers: number,
	botByPlayer: Record<PlayerID, BotKind>,
	aiPaused: boolean,
): void {
	const clientsRef = useRef<Map<PlayerID, RawClientInstance>>(new Map());
	const playingRef = useRef<Set<PlayerID>>(new Set());

	// Create / destroy bot clients when bot assignments or numPlayers change
	useEffect(() => {
		const clients = clientsRef.current;
		const activePids = new Set<PlayerID>();

		for (let i = 0; i < numPlayers; i += 1) {
			const pid = String(i) as PlayerID;
			const botKind = botByPlayer[pid] ?? 'None';

			if (botKind !== 'None') {
				activePids.add(pid);
				if (!clients.has(pid)) {
					const client = RawClient<GState>({
						game,
						numPlayers,
						multiplayer: Local(),
						playerID: pid,
					});
					client.start();
					clients.set(pid, client);
				}
			}
		}

		// Remove clients for players that are no longer bots
		for (const [pid, client] of clients) {
			if (!activePids.has(pid)) {
				client.stop();
				clients.delete(pid);
			}
		}

		// Cleanup all on unmount
		return () => {
			for (const client of clients.values()) client.stop();
			clients.clear();
		};
	}, [game, numPlayers, botByPlayer]);

	// Subscribe to state changes and auto-play when it's a bot's turn
	useEffect(() => {
		const clients = clientsRef.current;
		const unsubs: (() => void)[] = [];

		for (const [pid, client] of clients) {
			const botKind = botByPlayer[pid] ?? 'None';
			if (botKind === 'None') continue;

			const unsub = client.subscribe((state) => {
				if (!state) return;
				if (state.ctx.currentPlayer !== pid) return;
				if (aiPaused) return;
				if (playingRef.current.has(pid)) return;

				playingRef.current.add(pid);

				(async () => {
					try {
						const bgioClient = {
							getState: () => client.getState() as { G: GState; ctx: typeof state.ctx } | undefined,
							moves: client.moves as {
								playCard: (a: unknown) => void;
								rotateTile: (a: unknown) => void;
								blockTile: (a: unknown) => void;
								stashToTreasure: (a: unknown) => void;
								takeFromTreasure: (a: unknown) => void;
								endTurnAndRefill: () => void;
							},
						};

						if (botKind === 'Random') {
							await playOneRandom(bgioClient, pid);
						} else if (botKind === 'Evaluator') {
							await playOneEvaluator(bgioClient, pid);
						} else if (botKind === 'EvaluatorPlus') {
							await playOneEvaluatorPlus(bgioClient, pid);
						}
					} finally {
						playingRef.current.delete(pid);
					}
				})();
			});

			unsubs.push(unsub);
		}

		return () => {
			for (const fn of unsubs) fn();
		};
	}, [botByPlayer, aiPaused]);
}
