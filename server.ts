import { Server } from 'boardgame.io/server';
import { PostgresStore } from 'bgio-postgres';
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
});

const port = Number(process.env.PORT) || 8000;

server.run(port, () => {
	console.log(`Server running on port ${port}`);
});











