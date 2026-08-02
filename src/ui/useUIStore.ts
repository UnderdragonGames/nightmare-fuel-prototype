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
	network: NetworkSession | null;
	playerName: string;
	aiPaused: boolean;
	soundMuted: boolean;
	/** This device wants push notifications for its network matches. */
	turnAlerts: boolean;
	setViewer: (v: PlayerID) => void;
	setNumPlayers: (n: number) => void;
	setBotFor: (pid: PlayerID, bot: BotMode) => void;
	resetBotsForCount: (count: number) => void;
	setNetwork: (session: NetworkSession | null) => void;
	setPlayerName: (name: string) => void;
	setAiPaused: (v: boolean) => void;
	setSoundMuted: (v: boolean) => void;
	setTurnAlerts: (v: boolean) => void;
};

export const useUIStore = create<UIState>()(
	persist(
		(set, get) => ({
			viewer: '0',
			numPlayers: 2,
			botByPlayer: { '0': 'None', '1': 'None' },
			network: null,
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
			setNetwork: (session) => set({ network: session }),
			setPlayerName: (name) => set({ playerName: name }),
			setAiPaused: (v) => set({ aiPaused: v }),
			setSoundMuted: (v) => set({ soundMuted: v }),
			setTurnAlerts: (v) => set({ turnAlerts: v }),
		}),
		{ name: 'ui-store' }
	)
);
