/**
 * Poll the status of every held match for the "My games" list and the globe
 * badge. Light by design: one tiny GET per held match every POLL_MS, plus an
 * immediate refresh when the app regains focus (the moment that matters on a
 * phone). The ACTIVE match's live socket state should take precedence over
 * these snapshots where the caller has it.
 */
import React from 'react';
import { getServerURL } from './lobby';
import type { NetworkSession } from '../ui/useUIStore';

export type MatchStatus = {
	gameover: boolean;
	turn: number;
	currentPlayer: string;
	/** Seat the game is waiting on (draft picker/placer during Mystery Box). */
	actionOn: string | null;
	allSeatsJoined: boolean;
	/** Match no longer exists on the server (wiped/finished long ago). */
	missing?: boolean;
};

const POLL_MS = 20000;

export const fetchMatchStatus = async (matchID: string): Promise<MatchStatus | null> => {
	try {
		const res = await fetch(`${getServerURL()}/games/hex-strings/${matchID}/status`);
		if (res.status === 404) return { gameover: false, turn: 0, currentPlayer: '', actionOn: null, allSeatsJoined: false, missing: true };
		if (!res.ok) return null;
		return (await res.json()) as MatchStatus;
	} catch {
		return null; // offline — keep whatever we knew
	}
};

export const useMatchStatuses = (sessions: NetworkSession[]): Record<string, MatchStatus> => {
	const [statuses, setStatuses] = React.useState<Record<string, MatchStatus>>({});
	const idsKey = sessions.map((s) => s.matchID).join(',');

	React.useEffect(() => {
		if (idsKey.length === 0) {
			setStatuses({});
			return;
		}
		let cancelled = false;
		const refresh = async (): Promise<void> => {
			const ids = idsKey.split(',');
			const entries = await Promise.all(ids.map(async (id) => [id, await fetchMatchStatus(id)] as const));
			if (cancelled) return;
			setStatuses((prev) => {
				const next: Record<string, MatchStatus> = {};
				for (const [id, status] of entries) {
					const known = status ?? prev[id];
					if (known) next[id] = known;
				}
				return next;
			});
		};
		void refresh();
		const interval = setInterval(refresh, POLL_MS);
		const onVisible = (): void => {
			if (document.visibilityState === 'visible') void refresh();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			cancelled = true;
			clearInterval(interval);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, [idsKey]);

	return statuses;
};
