import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlayerID } from 'boardgame.io';
import type { BotKind } from '../game/bots';

export type BotMode = BotKind;

/** A claimed seat in a network match. Persisted so a refresh reconnects. */
export type NetworkSession = {
	matchID: string;
	seat: PlayerID;
	credentials: string;
	numPlayers: number;
};

export type UIState = {
	viewer: PlayerID;
	numPlayers: number;
	botByPlayer: Record<PlayerID, BotMode>;
	/**
	 * Match ID of the current LOCAL game. Local matches live in the in-memory
	 * Local() master keyed by matchID, so starting a NEW local game means
	 * switching to a fresh ID — mutating numPlayers alone never resets state.
	 */
	localMatchID: string;
	/** The ACTIVE network session (the match this client is connected to). */
	network: NetworkSession | null;
	/**
	 * Every seat this device holds, active one included. Joining another match
	 * no longer frees the old seat — switching is non-destructive; only an
	 * explicit Leave Match drops a session.
	 */
	sessions: NetworkSession[];
	playerName: string;
	aiPaused: boolean;
	soundMuted: boolean;
	/** This device wants push notifications for its network matches. */
	turnAlerts: boolean;
	setViewer: (v: PlayerID) => void;
	setNumPlayers: (n: number) => void;
	setBotFor: (pid: PlayerID, bot: BotMode) => void;
	resetBotsForCount: (count: number) => void;
	/** Start a fresh local match with this seat setup (and leave any active network view). */
	newLocalGame: (count: number, bots: Record<PlayerID, BotMode>) => void;
	/** Set the active session; non-null sessions are upserted into the held list. */
	setNetwork: (session: NetworkSession | null) => void;
	/** Make a held session active (no-op for unknown matchIDs). */
	switchSession: (matchID: string) => void;
	/** Forget a held session; if it was active, fall back to another held one. */
	removeSession: (matchID: string) => void;
	setPlayerName: (name: string) => void;
	setAiPaused: (v: boolean) => void;
	setSoundMuted: (v: boolean) => void;
	setTurnAlerts: (v: boolean) => void;
};

/** v0 → v1: the single `network` session becomes the seed of `sessions`. */
export const migrateUIStore = (persisted: unknown, version: number): unknown => {
	if (version >= 1) return persisted;
	const state = (persisted ?? {}) as { network?: NetworkSession | null; sessions?: NetworkSession[] };
	return {
		...state,
		sessions: state.sessions ?? (state.network ? [state.network] : []),
	};
};

const upsert = (sessions: NetworkSession[], session: NetworkSession): NetworkSession[] => {
	const rest = sessions.filter((s) => s.matchID !== session.matchID);
	return [session, ...rest];
};

export const useUIStore = create<UIState>()(
	persist(
		(set, get) => ({
			viewer: '0',
			numPlayers: 2,
			botByPlayer: { '0': 'None', '1': 'None' },
			localMatchID: 'local-default',
			network: null,
			sessions: [],
			playerName: '',
			aiPaused: false,
			soundMuted: false,
			turnAlerts: false,
			setViewer: (v) => set({ viewer: v }),
			setNumPlayers: (n) => set({ numPlayers: n }),
			setBotFor: (pid, bot) => set({ botByPlayer: { ...get().botByPlayer, [pid]: bot } }),
			resetBotsForCount: (count) => {
				const bots: Record<PlayerID, BotMode> = {} as Record<PlayerID, BotMode>;
				for (let i = 0; i < count; i += 1) bots[String(i) as PlayerID] = 'None';
				set({ botByPlayer: bots });
			},
			newLocalGame: (count, bots) =>
				set({
					numPlayers: count,
					botByPlayer: bots,
					network: null,
					viewer: '0',
					localMatchID: `local-${Date.now().toString(36)}`,
				}),
			setNetwork: (session) =>
				set((state) => ({
					network: session,
					sessions: session ? upsert(state.sessions, session) : state.sessions,
				})),
			switchSession: (matchID) =>
				set((state) => {
					const target = state.sessions.find((s) => s.matchID === matchID);
					return target ? { network: target } : {};
				}),
			removeSession: (matchID) =>
				set((state) => {
					const sessions = state.sessions.filter((s) => s.matchID !== matchID);
					const network = state.network?.matchID === matchID
						? (sessions[0] ?? null)
						: state.network;
					return { sessions, network };
				}),
			setPlayerName: (name) => set({ playerName: name }),
			setAiPaused: (v) => set({ aiPaused: v }),
			setSoundMuted: (v) => set({ soundMuted: v }),
			setTurnAlerts: (v) => set({ turnAlerts: v }),
		}),
		{ name: 'ui-store', version: 1, migrate: migrateUIStore }
	)
);
