import { Server } from 'boardgame.io/server';
import { PostgresStore } from 'bgio-postgres';
import serve from 'koa-static';
import { resolve } from 'path';
import { readFile } from 'fs/promises';
import { HexStringsGame } from './src/game/game.js';

const dbUrl = process.env.DATABASE_URL;
const dbConfig = dbUrl
	? new PostgresStore(dbUrl)
	: new PostgresStore({
			database: process.env.DB_NAME || 'nightmare_fuel',
			username: process.env.DB_USER || 'postgres',
			password: process.env.DB_PASSWORD || 'postgres',
			host: process.env.DB_HOST || 'localhost',
			port: Number(process.env.DB_PORT) || 5432,
			dialect: 'postgres',
		});

const server = Server({
	games: [HexStringsGame],
	db: dbConfig,
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

server.run(port, () => {
	console.log(`Server running on port ${port}`);
});












