import { Server, FlatFile } from 'boardgame.io/server';
import webpush from 'web-push';
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

const ALLOWED_ORIGINS = [
	'http://localhost:5173',
	'http://localhost:3000',
	'http://127.0.0.1:5173',
	'https://nightmarefuel.underdragongames.com',
];

const server = Server({
	games: [HexStringsGame],
	db: dbConfig,
	uuid: shortMatchCode,
	// uuid doubles as the credentials generator by default — keep credentials
	// long even though match codes are short.
	generateCredentials: () => randomUUID(),
	origins: ALLOWED_ORIGINS,
});

const distDir = resolve(new URL('.', import.meta.url).pathname, 'dist');

// CORS for the CUSTOM endpoints (status/cancel/push/feedback): boardgame.io's
// `origins` config only covers its own lobby routes. Same-origin production
// never notices, but the dev client (5173 → 8000) does.
server.app.use(async (ctx, next) => {
	const origin = ctx.get('Origin');
	if (origin && ALLOWED_ORIGINS.includes(origin)) {
		ctx.set('Access-Control-Allow-Origin', origin);
		ctx.set('Vary', 'Origin');
		if (ctx.method === 'OPTIONS') {
			ctx.set('Access-Control-Allow-Methods', 'GET,POST');
			ctx.set('Access-Control-Allow-Headers', 'Content-Type');
			ctx.status = 204;
			return;
		}
	}
	await next();
});

// ─── Web push (turn alerts) ─────────────────────────────────────────────────
//
// Subscriptions are per matchID:seat, held in memory. Clients re-register on
// every app load, so a restart self-heals as players open the app. Set
// VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY in the environment so subscriptions
// survive deploys; without them a fresh pair is generated (and logged) and
// existing browser subscriptions go stale until re-created.
const vapidKeys = (() => {
	const pub = process.env.VAPID_PUBLIC_KEY;
	const priv = process.env.VAPID_PRIVATE_KEY;
	if (pub && priv) return { publicKey: pub, privateKey: priv };
	const generated = webpush.generateVAPIDKeys();
	console.warn('VAPID keys not set — generated a temporary pair. Set these env vars to keep push subscriptions across deploys:');
	console.warn(`  VAPID_PUBLIC_KEY=${generated.publicKey}`);
	console.warn(`  VAPID_PRIVATE_KEY=${generated.privateKey}`);
	return generated;
})();
webpush.setVapidDetails('mailto:julian.kingman@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);

type StoredSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
const pushSubscriptions = new Map<string, StoredSubscription>(); // `${matchID}:${seat}`

const sendPush = async (matchID: string, seat: string, payload: { title: string; body: string; tag?: string }): Promise<void> => {
	const key = `${matchID}:${seat}`;
	const sub = pushSubscriptions.get(key);
	if (!sub) return;
	try {
		// url/matchID let a tapped notification open the app switched to the
		// right game ("My games" multi-session support).
		await webpush.sendNotification(sub as webpush.PushSubscription, JSON.stringify({ ...payload, tag: payload.tag ?? `nf-${matchID}`, url: `/?resume=${matchID}`, matchID }));
	} catch (err) {
		const status = (err as { statusCode?: number }).statusCode;
		if (status === 404 || status === 410) {
			pushSubscriptions.delete(key); // subscription expired/revoked
		} else {
			console.error(`push to ${key} failed:`, err);
		}
	}
};

// Register/unregister endpoints (credential-checked against the seat).
server.app.use(async (ctx, next) => {
	if (ctx.method === 'GET' && ctx.path === '/push/public-key') {
		ctx.body = { key: vapidKeys.publicKey };
		return;
	}
	const match = ctx.path.match(new RegExp(`^/games/${GAME_NAME}/([^/]+)/push-(subscribe|unsubscribe)$`));
	if (!match || ctx.method !== 'POST') {
		await next();
		return;
	}
	const [, matchID, action] = match;
	try {
		const chunks: Uint8Array[] = [];
		for await (const chunk of ctx.req) chunks.push(chunk as Uint8Array);
		const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') as {
			playerID?: string;
			credentials?: string;
			subscription?: StoredSubscription;
		};
		const db = dbConfig as unknown as AsyncStorage;
		const { metadata } = await db.fetch(matchID!, { metadata: true });
		const seatMeta = body.playerID !== undefined ? metadata?.players[Number(body.playerID)] : undefined;
		if (!metadata || !seatMeta || !body.credentials || seatMeta.credentials !== body.credentials) {
			ctx.status = 403;
			ctx.body = { error: 'invalid seat credentials' };
			return;
		}
		const key = `${matchID}:${body.playerID}`;
		if (action === 'subscribe') {
			if (!body.subscription?.endpoint || !body.subscription.keys) {
				ctx.status = 400;
				ctx.body = { error: 'missing subscription' };
				return;
			}
			pushSubscriptions.set(key, body.subscription);
		} else {
			pushSubscriptions.delete(key);
		}
		ctx.body = { ok: true };
	} catch (err) {
		console.error(`push ${action} for ${matchID} failed:`, err);
		ctx.status = 500;
		ctx.body = { error: 'push registration failed' };
	}
});

// ─── Playtest feedback ──────────────────────────────────────────────────────
//
// One row per submitted form, with the full rules snapshot so answers can be
// compared across rulesets. Postgres in production (raw table via the store's
// sequelize handle); JSONL file under USE_FLATFILE for local dev.
// Read it back with GET /feedback/export?key=$FEEDBACK_EXPORT_KEY (endpoint
// is disabled unless the env var is set).

const feedbackFile = resolve(process.env.FLATFILE_DIR || './matches', 'feedback.jsonl');
const usingPostgres = !process.env.USE_FLATFILE;

const initFeedbackStore = async (): Promise<void> => {
	if (!usingPostgres) return;
	const { sequelize } = dbConfig as unknown as { sequelize: { query: (sql: string) => Promise<unknown> } };
	await sequelize.query(`
		CREATE TABLE IF NOT EXISTS playtest_feedback (
			id UUID PRIMARY KEY,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			app_version TEXT NOT NULL,
			questions_version INTEGER NOT NULL,
			match_id TEXT,
			seat TEXT,
			player_name TEXT,
			networked BOOLEAN NOT NULL DEFAULT false,
			gameover BOOLEAN NOT NULL DEFAULT false,
			turns INTEGER,
			duration_seconds INTEGER,
			scores JSONB,
			rules JSONB,
			answers JSONB NOT NULL
		)
	`);
	console.log('playtest_feedback table ready');
};

type FeedbackBody = {
	questionsVersion?: number;
	answers?: Record<string, unknown>;
	appVersion?: string;
	matchID?: string | null;
	seat?: string | null;
	playerName?: string | null;
	networked?: boolean;
	rules?: unknown;
	scores?: Record<string, number> | null;
	turns?: number | null;
	durationSeconds?: number | null;
	gameover?: boolean;
};

const storeFeedback = async (body: FeedbackBody): Promise<void> => {
	const row = {
		id: randomUUID(),
		created_at: new Date().toISOString(),
		app_version: String(body.appVersion ?? 'unknown').slice(0, 40),
		questions_version: Number(body.questionsVersion) || 0,
		match_id: body.matchID ? String(body.matchID).slice(0, 40) : null,
		seat: body.seat != null ? String(body.seat).slice(0, 8) : null,
		player_name: body.playerName ? String(body.playerName).slice(0, 64) : null,
		networked: !!body.networked,
		gameover: !!body.gameover,
		turns: Number.isFinite(body.turns) ? Number(body.turns) : null,
		duration_seconds: Number.isFinite(body.durationSeconds) ? Math.round(Number(body.durationSeconds)) : null,
		scores: body.scores ?? null,
		rules: body.rules ?? null,
		answers: body.answers ?? {},
	};
	if (usingPostgres) {
		const { sequelize } = dbConfig as unknown as {
			sequelize: { query: (sql: string, opts: { bind: unknown[] }) => Promise<unknown> };
		};
		await sequelize.query(
			`INSERT INTO playtest_feedback
				(id, created_at, app_version, questions_version, match_id, seat, player_name, networked, gameover, turns, duration_seconds, scores, rules, answers)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
			{
				bind: [
					row.id, row.created_at, row.app_version, row.questions_version, row.match_id,
					row.seat, row.player_name, row.networked, row.gameover, row.turns,
					row.duration_seconds, JSON.stringify(row.scores), JSON.stringify(row.rules), JSON.stringify(row.answers),
				],
			},
		);
	} else {
		const { appendFile, mkdir } = await import('fs/promises');
		await mkdir(resolve(feedbackFile, '..'), { recursive: true });
		await appendFile(feedbackFile, `${JSON.stringify(row)}\n`, 'utf-8');
	}
};

server.app.use(async (ctx, next) => {
	if (ctx.path === '/feedback' && ctx.method === 'POST') {
		try {
			const chunks: Uint8Array[] = [];
			for await (const chunk of ctx.req) chunks.push(chunk as Uint8Array);
			const raw = Buffer.concat(chunks).toString('utf-8');
			if (raw.length > 64 * 1024) {
				ctx.status = 413;
				ctx.body = { error: 'feedback too large' };
				return;
			}
			const body = JSON.parse(raw || '{}') as FeedbackBody;
			if (!body.answers || typeof body.answers !== 'object' || Object.keys(body.answers).length === 0) {
				ctx.status = 400;
				ctx.body = { error: 'no answers' };
				return;
			}
			await storeFeedback(body);
			ctx.body = { ok: true };
		} catch (err) {
			console.error('feedback store failed:', err);
			ctx.status = 500;
			ctx.body = { error: 'feedback store failed' };
		}
		return;
	}
	if (ctx.path === '/feedback/export' && ctx.method === 'GET') {
		const exportKey = process.env.FEEDBACK_EXPORT_KEY;
		if (!exportKey || ctx.query.key !== exportKey) {
			ctx.status = 403;
			ctx.body = { error: 'export disabled or bad key' };
			return;
		}
		try {
			if (usingPostgres) {
				const { sequelize } = dbConfig as unknown as {
					sequelize: { query: (sql: string, opts: { type: string }) => Promise<unknown[]> };
				};
				const rows = await sequelize.query('SELECT * FROM playtest_feedback ORDER BY created_at DESC', { type: 'SELECT' });
				ctx.body = rows;
			} else {
				const text = await readFile(feedbackFile, 'utf-8').catch(() => '');
				ctx.body = text.trim().length > 0 ? text.trim().split('\n').map((l) => JSON.parse(l)) : [];
			}
		} catch (err) {
			console.error('feedback export failed:', err);
			ctx.status = 500;
			ctx.body = { error: 'export failed' };
		}
		return;
	}
	await next();
});

// ─── Match status (for the "My games" list / globe badge) ───────────────────
//
// Cheap unauthenticated read: whose action a match is waiting on. Exposes
// only what every player at the table can already see.
server.app.use(async (ctx, next) => {
	const match = ctx.path.match(new RegExp(`^/games/${GAME_NAME}/([^/]+)/status$`));
	if (!match || ctx.method !== 'GET') {
		await next();
		return;
	}
	try {
		const db = dbConfig as unknown as {
			fetch: (id: string, opts: { state: true; metadata: true }) => Promise<{
				state?: {
					ctx: { currentPlayer: string; turn: number; gameover?: unknown };
					G: { action?: { pendingDraft?: { order: string[]; position: number; placing: { playerId: string } | null } | null } };
				};
				metadata?: MatchMetadata;
			}>;
		};
		const { state, metadata } = await db.fetch(match[1]!, { state: true, metadata: true });
		if (!state || !metadata) {
			ctx.status = 404;
			ctx.body = { error: 'match not found' };
			return;
		}
		const draft = state.G.action?.pendingDraft ?? null;
		ctx.body = {
			gameover: !!state.ctx.gameover,
			turn: state.ctx.turn,
			currentPlayer: state.ctx.currentPlayer,
			// During a Mystery Box draft the waiting player differs from the turn owner.
			actionOn: draft
				? (draft.placing ? draft.placing.playerId : draft.order[draft.position] ?? null)
				: state.ctx.currentPlayer,
			allSeatsJoined: Object.values(metadata.players).every((p) => !!p.name),
		};
	} catch (err) {
		console.error('status fetch failed:', err);
		ctx.status = 500;
		ctx.body = { error: 'status failed' };
	}
});

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

	const handle = (state: ReturnType<typeof client.getState>): void => {
		if (!state) return;
		if (state.ctx.gameover) return;
		// Reveal-and-pick draft: the bot may need to pick/place during ANY turn.
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
	};

	const unsubscribe = client.subscribe(handle);
	// Nudge: when the bot itself plays a reveal-and-pick card, its turn loop
	// exits and no further state change would re-trigger the subscription —
	// without this the draft (and the game) would hang on the bot's own pick.
	const nudge = setInterval(() => handle(client.getState()), 2000);

	botRunners.set(key, {
		stop: () => {
			clearInterval(nudge);
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

// ─── Turn-alert push loop ───────────────────────────────────────────────────
//
// Rides the same cadence as the bot scan: watch each subscribed match for
// "who must act" changes (turn owner, Mystery Box picker/placer) and push to
// that seat. The first observation of a match only records state — nobody is
// notified for merely being current when the server starts.
type NotifyState = {
	state?: {
		ctx: { currentPlayer: string; turn: number; gameover?: unknown };
		G: { action?: { pendingDraft?: { order: string[]; position: number; placing: { playerId: string } | null } | null } };
	};
};
const lastNotifyKey = new Map<string, string>();

const notifyTurnChanges = async (): Promise<void> => {
	if (pushSubscriptions.size === 0) return;
	const db = dbConfig as unknown as AsyncStorage & {
		fetch: (id: string, opts: { state: true }) => Promise<NotifyState>;
	};
	const matchIDs = await db.listMatches({ gameName: GAME_NAME, where: { isGameover: false } });
	const liveMatches = new Set(matchIDs);
	const subscribedMatches = new Set<string>();
	for (const key of pushSubscriptions.keys()) subscribedMatches.add(key.split(':')[0]!);

	for (const matchID of matchIDs) {
		if (!subscribedMatches.has(matchID)) continue;
		const { state } = await db.fetch(matchID, { state: true });
		if (!state || state.ctx.gameover) continue;
		const draft = state.G.action?.pendingDraft ?? null;
		const target = draft
			? (draft.placing ? draft.placing.playerId : draft.order[draft.position])
			: state.ctx.currentPlayer;
		const key = draft
			? `draft:${target}:${draft.position}:${draft.placing ? 'place' : 'pick'}`
			: `turn:${state.ctx.turn}:${target}`;
		const prev = lastNotifyKey.get(matchID);
		lastNotifyKey.set(matchID, key);
		if (prev === undefined || prev === key || !target) continue;
		const body = draft
			? (draft.placing ? 'Place your drafted card!' : 'Your pick — choose a card!')
			: "It's your turn!";
		await sendPush(matchID, target, { title: 'Nightmare Fuel', body });
	}

	// Forget finished/deleted matches (and their subscriptions).
	for (const matchID of [...lastNotifyKey.keys()]) {
		if (!liveMatches.has(matchID)) lastNotifyKey.delete(matchID);
	}
	for (const key of [...pushSubscriptions.keys()]) {
		if (!liveMatches.has(key.split(':')[0]!)) pushSubscriptions.delete(key);
	}
};

server.run(port, () => {
	console.log(`Server running on port ${port} — nightmare-fuel-prototype v${APP_VERSION}`);
	initFeedbackStore().catch((err) => console.error('feedback table init failed:', err));
	setInterval(() => {
		ensureServerBots().catch((err) => console.error('bot scan failed:', err));
		notifyTurnChanges().catch((err) => console.error('push scan failed:', err));
	}, 3000);
});
