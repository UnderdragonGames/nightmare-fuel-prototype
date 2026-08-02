import { Server, FlatFile } from 'boardgame.io/server';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { PostgresStore } from 'bgio-postgres';
import serve from 'koa-static';
import { resolve } from 'path';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { HexStringsGame } from './src/game/game.js';
import { playOneRandom, playOneEvaluator, playOneEvaluatorPlus, playDraftStep, type BotKind } from './src/game/bots.js';
import type { GState } from './src/game/types.js';

const GAME_NAME = 'hex-strings';

const rootDir = resolve(new URL('.', import.meta.url).pathname);
const APP_VERSION = (JSON.parse(await readFile(resolve(rootDir, 'package.json'), 'utf-8')) as { version: string }).version;

// USE_FLATFILE=1 runs without Postgres (local dev / tests); production uses
// DATABASE_URL or the DB_* variables.
const dbUrl = process.env.DATABASE_URL;
const dbConfig = process.env.USE_FLATFILE
	? new FlatFile({ dir: process.env.FLATFILE_DIR || './matches', logging: false })
	: dbUrl
		? new PostgresStore(dbUrl)
		: new PostgresStore({
				database: process.env.DB_NAME || 'nightmare_fuel',
				username: process.env.DB_USER || 'postgres',
				password: process.env.DB_PASSWORD || 'postgres',
				host: process.env.DB_HOST || 'localhost',
				port: Number(process.env.DB_PORT) || 5432,
				dialect: 'postgres',
			});

// Short, human-friendly match codes for sharing/typing: 6 chars from an
// alphabet without lookalikes (no 0/O, 1/I/L). ~890M combinations.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const shortMatchCode = (): string =>
	Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

const server = Server({
	games: [HexStringsGame],
	db: dbConfig,
	uuid: shortMatchCode,
	// uuid doubles as the credentials generator by default — keep credentials
	// long even though match codes are short.
	generateCredentials: () => randomUUID(),
	origins: [
		'http://localhost:5173',
		'http://localhost:3000',
		'http://127.0.0.1:5173',
		'https://nightmarefuel.underdragongames.com',
	],
});

const distDir = resolve(new URL('.', import.meta.url).pathname, 'dist');

// ─── Cancel endpoint ────────────────────────────────────────────────────────
//
// Any seated player may cancel a match, but boardgame.io only lets the
// CURRENT player make moves (and its multiplayer undo requires exactly one
// active player, so we can't give observers a stage). This endpoint verifies
// the requester's seat credentials, then performs the cancelMatch move as the
// current player through a short-lived headless client — the resulting
// gameover reaches every client through the normal state channel.
server.app.use(async (ctx, next) => {
	const match = ctx.path.match(new RegExp(`^/games/${GAME_NAME}/([^/]+)/cancel$`));
	if (!match || ctx.method !== 'POST') {
		await next();
		return;
	}
	const matchID = match[1]!;
	try {
		const chunks: Uint8Array[] = [];
		for await (const chunk of ctx.req) chunks.push(chunk as Uint8Array);
		const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') as { playerID?: string; credentials?: string };

		const db = dbConfig as unknown as AsyncStorage;
		const { metadata } = await db.fetch(matchID, { metadata: true });
		if (!metadata) {
			ctx.status = 404;
			ctx.body = { error: 'match not found' };
			return;
		}
		const seat = body.playerID !== undefined ? metadata.players[Number(body.playerID)] : undefined;
		if (!seat || !seat.credentials || seat.credentials !== body.credentials) {
			ctx.status = 403;
			ctx.body = { error: 'invalid credentials' };
			return;
		}

		const ok = await cancelAsCurrentPlayer(matchID, body.playerID!);
		ctx.status = ok ? 200 : 500;
		ctx.body = ok ? { cancelled: true } : { error: 'cancel did not apply' };
	} catch (err) {
		console.error(`cancel ${matchID} failed:`, err);
		ctx.status = 500;
		ctx.body = { error: 'cancel failed' };
	}
});

// Serve static files from Vite build output
server.app.use(serve(distDir));

// SPA fallback: serve index.html for non-API routes
server.app.use(async (ctx, next) => {
	await next();
	if (ctx.status === 404 && !ctx.path.startsWith('/games') && !ctx.path.startsWith('/.well-known')) {
		ctx.type = 'html';
		ctx.body = await readFile(resolve(distDir, 'index.html'), 'utf-8');
	}
});

const port = Number(process.env.PORT) || 8000;

// ─── Server-run bots ────────────────────────────────────────────────────────
//
// Matches created with AI seats carry them in setupData.bots ({seat: kind}).
// The server claims those seats in match metadata (name + credentials, so no
// human can take them), then drives each with a headless boardgame.io client
// connected to itself over socket.io. Because the bots live here and not in a
// browser, a client disconnecting never stalls the AI, and a server restart
// re-attaches bots to every unfinished match via the periodic scan.

const BOT_NAMES: Record<BotKind, string> = {
	None: '',
	Random: '🤖 Random',
	Evaluator: '🤖 Evaluator',
	EvaluatorPlus: '🤖 Evaluator+',
};

type BotRunner = { stop: () => void };
const botRunners = new Map<string, BotRunner>(); // `${matchID}:${seat}`
const botsPlaying = new Set<string>();

type SeatMetadata = { name?: string; credentials?: string };
type MatchMetadata = {
	gameName: string;
	players: Record<number, SeatMetadata>;
	setupData?: { bots?: Record<string, BotKind> };
	gameover?: unknown;
	createdAt?: number;
};

type AsyncStorage = {
	listMatches: (opts: { gameName: string; where: { isGameover: boolean } }) => Promise<string[]>;
	fetch: (matchID: string, opts: { metadata: true }) => Promise<{ metadata?: MatchMetadata }>;
	setMetadata: (matchID: string, metadata: MatchMetadata) => Promise<void>;
	wipe: (matchID: string) => Promise<void>;
};

// Grace period before an all-humans-left bot match is wiped — covers the gap
// between lobby create and the creator's join call.
const ABANDON_GRACE_MS = 2 * 60 * 1000;

// Perform cancelMatch as the current player via a short-lived headless client.
// Resolves true once the gameover is observed in the synced state.
const cancelAsCurrentPlayer = async (matchID: string, requestedBy: string): Promise<boolean> => {
	const db = dbConfig as unknown as AsyncStorage & {
		fetch: (id: string, opts: { state: true; metadata: true }) => Promise<{
			state?: { ctx: { currentPlayer: string } };
			metadata?: MatchMetadata;
		}>;
	};
	const { state, metadata } = await db.fetch(matchID, { state: true, metadata: true });
	if (!state || !metadata) return false;
	const current = state.ctx.currentPlayer;
	const credentials = metadata.players[Number(current)]?.credentials;

	return new Promise<boolean>((resolvePromise) => {
		const client = Client<GState>({
			game: HexStringsGame,
			numPlayers: Object.keys(metadata.players).length,
			playerID: current,
			matchID,
			credentials,
			multiplayer: SocketIO({ server: `http://localhost:${port}` }),
			debug: false,
		});
		let done = false;
		const finish = (ok: boolean): void => {
			if (done) return;
			done = true;
			unsubscribe();
			client.stop();
			resolvePromise(ok);
		};
		const timeout = setTimeout(() => finish(false), 5000);
		let moveSent = false;
		const unsubscribe = client.subscribe((s) => {
			if (!s) return;
			if (s.ctx.gameover) {
				clearTimeout(timeout);
				finish(true);
				return;
			}
			if (!moveSent) {
				moveSent = true;
				(client.moves as { cancelMatch: (a: { by: string }) => void }).cancelMatch({ by: requestedBy });
			}
		});
		client.start();
	});
};

const spawnBot = (matchID: string, seat: string, kind: BotKind, credentials: string, numPlayers: number): void => {
	const key = `${matchID}:${seat}`;
	const client = Client<GState>({
		game: HexStringsGame,
		numPlayers,
		playerID: seat,
		matchID,
		credentials,
		multiplayer: SocketIO({ server: `http://localhost:${port}` }),
		debug: false,
	});
	client.start();

	const unsubscribe = client.subscribe((state) => {
		if (!state) return;
		if (state.ctx.gameover) return;
		// Mystery Box draft: the bot may need to pick/place during ANY turn.
		if ((state.ctx.activePlayers as Record<string, string> | null)?.[seat] === 'draft') {
			if (!botsPlaying.has(key)) {
				botsPlaying.add(key);
				try {
					playDraftStep(client as unknown as Parameters<typeof playDraftStep>[0], seat);
				} catch (err) {
					console.error(`bot ${key} failed a draft step:`, err);
				} finally {
					botsPlaying.delete(key);
				}
			}
			return;
		}
		if (state.ctx.currentPlayer !== seat) return;
		// A draft is live but it's not this bot's pick — wait, don't take a turn.
		if (state.G.action?.pendingDraft) return;
		// Game-start gate: hold until every seat is claimed, mirroring the UI.
		const md = client.matchData;
		if (!md || !md.every((p) => !!p.name)) return;
		if (botsPlaying.has(key)) return;
		botsPlaying.add(key);

		(async () => {
			try {
				const bot = client as unknown as Parameters<typeof playOneRandom>[0];
				if (kind === 'Random') await playOneRandom(bot, seat);
				else if (kind === 'Evaluator') await playOneEvaluator(bot, seat);
				else if (kind === 'EvaluatorPlus') await playOneEvaluatorPlus(bot, seat);
			} catch (err) {
				console.error(`bot ${key} failed a turn:`, err);
			} finally {
				botsPlaying.delete(key);
			}
		})();
	});

	botRunners.set(key, {
		stop: () => {
			unsubscribe();
			client.stop();
		},
	});
	console.log(`bot attached: ${key} (${kind})`);
};

const ensureServerBots = async (): Promise<void> => {
	const db = dbConfig as unknown as AsyncStorage;
	const matchIDs = await db.listMatches({ gameName: GAME_NAME, where: { isGameover: false } });
	const live = new Set<string>();

	for (const matchID of matchIDs) {
		const { metadata } = await db.fetch(matchID, { metadata: true });
		const bots = metadata?.setupData?.bots;
		if (!metadata || !bots) continue;
		const numPlayers = Object.keys(metadata.players).length;

		// Abandoned bot match: every human seat unclaimed (humans leaving a
		// bots-only match never triggers boardgame.io's own all-left wipe,
		// because bot seats stay claimed). Wipe it instead of playing on.
		const humanSeatClaimed = Object.entries(metadata.players)
			.some(([seat, meta]) => !bots[seat] && !!meta.name);
		const age = Date.now() - (metadata.createdAt ?? 0);
		if (!humanSeatClaimed && age > ABANDON_GRACE_MS) {
			await db.wipe(matchID);
			console.log(`wiped abandoned bot match: ${matchID}`);
			continue; // runners (if any) detach via the live-set sweep below
		}

		for (const [seat, kind] of Object.entries(bots)) {
			if (kind === 'None' || !BOT_NAMES[kind]) continue;
			const seatMeta = metadata.players[Number(seat)];
			if (!seatMeta) continue;

			// Claim the seat so humans can't join it and the credentials
			// survive server restarts.
			if (!seatMeta.name) {
				seatMeta.name = BOT_NAMES[kind];
				seatMeta.credentials = randomUUID();
				await db.setMetadata(matchID, metadata);
			}
			if (!seatMeta.credentials) continue; // seat claimed by something else

			const key = `${matchID}:${seat}`;
			live.add(key);
			if (!botRunners.has(key)) {
				spawnBot(matchID, seat, kind, seatMeta.credentials, numPlayers);
			}
		}
	}

	// Detach runners for finished or deleted matches.
	for (const [key, runner] of botRunners) {
		if (!live.has(key)) {
			runner.stop();
			botRunners.delete(key);
			console.log(`bot detached: ${key}`);
		}
	}
};

server.run(port, () => {
	console.log(`Server running on port ${port} — nightmare-fuel-prototype v${APP_VERSION}`);
	setInterval(() => {
		ensureServerBots().catch((err) => console.error('bot scan failed:', err));
	}, 3000);
});
