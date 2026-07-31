import { Server, FlatFile } from 'boardgame.io/server';
import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { PostgresStore } from 'bgio-postgres';
import serve from 'koa-static';
import { resolve } from 'path';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { HexStringsGame } from './src/game/game.js';
import { playOneRandom, playOneEvaluator, playOneEvaluatorPlus, type BotKind } from './src/game/bots.js';
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
};

type AsyncStorage = {
	listMatches: (opts: { gameName: string; where: { isGameover: boolean } }) => Promise<string[]>;
	fetch: (matchID: string, opts: { metadata: true }) => Promise<{ metadata?: MatchMetadata }>;
	setMetadata: (matchID: string, metadata: MatchMetadata) => Promise<void>;
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
		if (state.ctx.currentPlayer !== seat) return;
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
