import type { Ctx, PlayerID } from 'boardgame.io';
import type { GState, Color, MovePlayCardArgs, MoveStashArgs } from './types';
import { RULES } from './rulesConfig';
import { buildAllCoords, canPlace } from './helpers';

export type BotKind = 'None' | 'Random';

type BGIOClient = {
	getState(): ({ G: GState; ctx: Ctx } & { playerID?: PlayerID }) | undefined;
	moves: {
		playCard(a: MovePlayCardArgs): void;
		endTurnAndRefill(): void;
		stashToTreasure(a: MoveStashArgs): void;
	};
};

export const playOneRandom = (client: BGIOClient, playerID: PlayerID): void => {
	const state = client.getState();
	if (!state || state.ctx.currentPlayer !== playerID) return;
	const G = state.G;
	// try any playCard
	const coords = buildAllCoords(G.radius);
	const hand = G.hands[playerID] ?? [];
	for (let i = 0; i < hand.length; i += 1) {
		const card = hand[i]!;
		for (const color of card.colors) {
			for (const co of coords) {
				if (canPlace(G, co, color as Color, RULES)) {
					client.moves.playCard({ handIndex: i, pick: color as Color, coord: co });
					client.moves.endTurnAndRefill();
					return;
				}
			}
		}
	}
	// otherwise stash first available if treasure space
	if ((G.treasure.length ?? 0) < RULES.TREASURE_MAX && hand.length > 0) {
		client.moves.stashToTreasure({ handIndex: 0 });
		client.moves.endTurnAndRefill();
		return;
	}
	// otherwise end
	client.moves.endTurnAndRefill();
};


