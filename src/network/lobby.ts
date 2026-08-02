/**
 * Thin client for the boardgame.io Lobby REST API.
 *
 * Seats are claimed through join (returning per-seat credentials the socket
 * layer then enforces), freed through leave, and rematches go through
 * playAgain — which is idempotent per match, so every player's Rematch button
 * converges on the same nextMatchID.
 */
import type { PlayerID } from 'boardgame.io';
import type { BotKind } from '../game/bots';

export const GAME_NAME = 'hex-strings';

export type LobbySeat = { id: number; name?: string; isConnected?: boolean };

export type LobbyMatch = {
	matchID: string;
	players: LobbySeat[];
	setupData?: { bots?: Record<string, BotKind> };
	gameover?: unknown;
	nextMatchID?: string;
};

export const getServerURL = (): string =>
	(import.meta as { env?: Record<string, string> }).env?.VITE_SERVER_URL
	|| ((import.meta as { env?: Record<string, string | boolean> }).env?.DEV ? 'http://localhost:8000' : window.location.origin);

const post = async (url: string, body: Record<string, unknown>): Promise<Response> =>
	fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

export const getMatch = async (serverURL: string, matchID: string): Promise<LobbyMatch> => {
	const res = await fetch(`${serverURL}/games/${GAME_NAME}/${matchID}`);
	if (!res.ok) {
		throw new Error(res.status === 404 ? 'Match not found — check the match ID.' : 'Could not reach the match.');
	}
	return res.json();
};

export const createMatch = async (
	serverURL: string,
	numPlayers: number,
	bots: Record<string, BotKind>,
): Promise<string> => {
	const res = await post(`${serverURL}/games/${GAME_NAME}/create`, {
		numPlayers,
		setupData: { bots },
	});
	if (!res.ok) throw new Error('Failed to create match.');
	const data = (await res.json()) as { matchID: string };
	return data.matchID;
};

export const joinMatch = async (
	serverURL: string,
	matchID: string,
	playerID: PlayerID,
	playerName: string,
): Promise<string> => {
	const res = await post(`${serverURL}/games/${GAME_NAME}/${matchID}/join`, {
		playerID,
		playerName,
	});
	if (!res.ok) {
		throw new Error(res.status === 409 ? 'That seat was just taken — try again.' : 'Failed to join match.');
	}
	const data = (await res.json()) as { playerCredentials: string };
	return data.playerCredentials;
};

export const leaveMatch = async (
	serverURL: string,
	matchID: string,
	playerID: PlayerID,
	credentials: string,
): Promise<void> => {
	// Best-effort: the seat should free up, but a dead server must not trap
	// the client in a match it can no longer leave.
	try {
		await post(`${serverURL}/games/${GAME_NAME}/${matchID}/leave`, { playerID, credentials });
	} catch {
		/* ignore */
	}
};

/**
 * Cancel the match for everyone. Server-verified against the seat's
 * credentials; works for any seated player regardless of whose turn it is.
 */
export const cancelMatchRemote = async (
	serverURL: string,
	matchID: string,
	playerID: PlayerID,
	credentials: string,
): Promise<void> => {
	const res = await post(`${serverURL}/games/${GAME_NAME}/${matchID}/cancel`, { playerID, credentials });
	if (!res.ok) throw new Error('Failed to cancel the match.');
};

export const playAgain = async (
	serverURL: string,
	matchID: string,
	playerID: PlayerID,
	credentials: string,
): Promise<string> => {
	const res = await post(`${serverURL}/games/${GAME_NAME}/${matchID}/playAgain`, { playerID, credentials });
	if (!res.ok) throw new Error('Failed to start a rematch.');
	const data = (await res.json()) as { nextMatchID: string };
	return data.nextMatchID;
};

/** First seat that is unclaimed and not reserved for a server bot. */
export const firstFreeSeat = (match: LobbyMatch): PlayerID | null => {
	const botSeats = match.setupData?.bots ?? {};
	const seat = match.players.find((p) => !p.name && !botSeats[String(p.id)]);
	return seat !== undefined ? (String(seat.id) as PlayerID) : null;
};

/**
 * Look up a match by a typed or pasted code, forgivingly: accepts surrounding
 * whitespace, a pasted invite URL, and any letter case (new codes are
 * uppercase, but legacy nanoid IDs are mixed-case, so the exact form is
 * tried first).
 */
export const findMatchByCode = async (serverURL: string, input: string): Promise<LobbyMatch> => {
	let code = input.trim();
	const urlMatch = code.match(/[?&]join=([^&\s]+)/);
	if (urlMatch) code = decodeURIComponent(urlMatch[1]!);
	try {
		return await getMatch(serverURL, code);
	} catch (err) {
		const upper = code.toUpperCase();
		if (upper === code) throw err;
		return getMatch(serverURL, upper);
	}
};

/** Invite link that auto-joins the match when opened. */
export const buildInviteURL = (matchID: string): string =>
	`${window.location.origin}/?join=${encodeURIComponent(matchID)}`;

/**
 * Share an invite: native share sheet where available (iOS/Android — includes
 * standalone PWAs), clipboard otherwise. Returns how it was delivered so the
 * UI can confirm ("copied" needs feedback; the share sheet is its own).
 */
export const shareInvite = async (matchID: string): Promise<'shared' | 'copied' | 'failed'> => {
	const url = buildInviteURL(matchID);
	const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
	if (typeof nav.share === 'function') {
		try {
			await nav.share({
				title: 'Nightmare Fuel',
				text: `Join my Nightmare Fuel match — code ${matchID}`,
				url,
			});
			return 'shared';
		} catch (err) {
			// AbortError = user closed the sheet; anything else falls back to copy.
			if (err instanceof Error && err.name === 'AbortError') return 'shared';
		}
	}
	try {
		await navigator.clipboard.writeText(url);
		return 'copied';
	} catch {
		return 'failed'; // clipboard blocked — the visible code is the fallback
	}
};
