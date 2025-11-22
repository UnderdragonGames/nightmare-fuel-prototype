import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlayerID } from 'boardgame.io';
import type { BotKind } from '../game/bots';

export type BotMode = BotKind;

export type UIState = {
	viewer: PlayerID;
	numPlayers: number;
	botByPlayer: Record<PlayerID, BotMode>;
	showRing: boolean;
	matchID: string | null;
	setViewer: (v: PlayerID) => void;
	setNumPlayers: (n: number) => void;
	setBotFor: (pid: PlayerID, bot: BotMode) => void;
	setShowRing: (v: boolean) => void;
	resetBotsForCount: (count: number) => void;
	setMatchID: (id: string | null) => void;
};

export const useUIStore = create<UIState>()(
	persist(
		(set, get) => ({
			viewer: '0',
			numPlayers: 2,
			botByPlayer: { '0': 'None', '1': 'None' },
			showRing: false,
			matchID: null,
			setViewer: (v) => set({ viewer: v }),
			setNumPlayers: (n) => set({ numPlayers: n }),
			setBotFor: (pid, bot) => set({ botByPlayer: { ...get().botByPlayer, [pid]: bot } }),
			setShowRing: (v) => set({ showRing: v }),
			resetBotsForCount: (count) => {
				const bots: Record<PlayerID, BotMode> = {} as Record<PlayerID, BotMode>;
				for (let i = 0; i < count; i += 1) bots[String(i) as PlayerID] = 'None';
				set({ botByPlayer: bots });
			},
			setMatchID: (id) => set({ matchID: id }),
		}),
		{ name: 'ui-store' }
	)
);
