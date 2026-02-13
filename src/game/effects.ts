import type { Ctx } from 'boardgame.io';
import type {
	ActionState,
	AttachedCard,
	Card,
	Color,
	Co,
	GameEffect,
	GState,
	NightmareAction,
	PlayerID,
	PlayerPrefs,
	Stat,
	Trigger,
} from './types';
import { canPlace, inferPlacementRotation, inBounds, key } from './helpers';
import { buildColorToDir } from './rulesConfig';

export type EffectContext = {
	ctx?: Ctx;
	currentPlayer: PlayerID;
	rng?: () => number;
	playedCard?: Card;
	markPlayedCardMoved: () => void;
};

const ensurePlayerNumber = (record: Record<PlayerID, number>, playerId: PlayerID): void => {
	if (record[playerId] === undefined) record[playerId] = 0;
};

const ensurePlayerBool = (record: Record<PlayerID, boolean>, playerId: PlayerID): void => {
	if (record[playerId] === undefined) record[playerId] = false;
};

const ensurePlayerNullableStat = (record: Record<PlayerID, Stat | null>, playerId: PlayerID): void => {
	if (record[playerId] === undefined) record[playerId] = null;
};

const ensurePlayerNullableNumber = (record: Record<PlayerID, number | null>, playerId: PlayerID): void => {
	if (record[playerId] === undefined) record[playerId] = null;
};

const ensurePlayerPlacements = (record: Record<PlayerID, { count: number; color?: Color | null }>, playerId: PlayerID): void => {
	if (record[playerId] === undefined) record[playerId] = { count: 0, color: null };
};

const ensureHand = (G: GState, playerId: PlayerID): Card[] => {
	if (!G.hands[playerId]) G.hands[playerId] = [];
	return G.hands[playerId]!;
};

export const initActionState = (playerIDs: PlayerID[] = []): ActionState => {
	const extraPlays: Record<PlayerID, number> = {};
	const extraPlacements: Record<PlayerID, { count: number; color?: Color | null }> = {};
	const extraActionPlays: Record<PlayerID, number> = {};
	const skipNextTurn: Record<PlayerID, boolean> = {};
	const agendaOverrides: Record<PlayerID, Stat | null> = {};
	const revealUnusedVillainsUntil: Record<PlayerID, number | null> = {};
	for (const pid of playerIDs) {
		extraPlays[pid] = 0;
		extraPlacements[pid] = { count: 0, color: null };
		extraActionPlays[pid] = 0;
		skipNextTurn[pid] = false;
		agendaOverrides[pid] = null;
		revealUnusedVillainsUntil[pid] = null;
	}
	return {
		revealed: [],
		faceUpDrawPile: [],
		suppressedDraws: null,
		extraPlays,
		extraPlacements,
		extraActionPlays,
		skipNextTurn,
		agendaOverrides,
		revealUnusedVillainsUntil,
		attachedCards: [],
		triggers: [],
		lastPlacedColor: null,
	};
};

const allHandsEmpty = (G: GState): boolean => Object.values(G.hands).every((hand) => hand.length === 0);

const resolveSuppressedDrawsIfReady = (G: GState): void => {
	if (!G.action.suppressedDraws) return;
	if (G.action.suppressedDraws.condition !== 'handsEmpty') return;
	if (!allHandsEmpty(G)) return;
	const sourceCardId = G.action.suppressedDraws.sourceCardId;
	if (sourceCardId !== undefined) {
		const index = G.action.faceUpDrawPile.findIndex((card) => card.id === sourceCardId);
		if (index >= 0) {
			const [card] = G.action.faceUpDrawPile.splice(index, 1);
			if (card) G.discard.push(card);
		}
	}
	G.action.suppressedDraws = null;
};

const isDrawSuppressed = (G: GState): boolean => {
	if (!G.action.suppressedDraws) return false;
	resolveSuppressedDrawsIfReady(G);
	return G.action.suppressedDraws !== null;
};

export const readLastPlacedColor = (G: GState): Color | null => G.action.lastPlacedColor;

export const drawOne = (G: GState): Card | null => {
	if (isDrawSuppressed(G)) return null;
	const card = G.deck.pop() ?? null;
	return card;
};

export const drawCards = (G: GState, playerId: PlayerID, count: number): void => {
	const hand = ensureHand(G, playerId);
	for (let i = 0; i < count; i += 1) {
		const card = drawOne(G);
		if (!card) break;
		hand.push(card);
	}
};

export const discardCard = (G: GState, playerId: PlayerID, handIndex: number): void => {
	const hand = ensureHand(G, playerId);
	const [card] = hand.splice(handIndex, 1);
	if (card) G.discard.push(card);
};

export const discardHand = (G: GState, playerId: PlayerID): void => {
	const hand = ensureHand(G, playerId);
	while (hand.length > 0) {
		const card = hand.shift();
		if (card) G.discard.push(card);
	}
};

export const randomDiscard = (G: GState, playerId: PlayerID, count: number, rng: () => number): void => {
	const hand = ensureHand(G, playerId);
	for (let i = 0; i < count; i += 1) {
		if (hand.length === 0) return;
		const index = Math.floor(rng() * hand.length);
		const [card] = hand.splice(index, 1);
		if (card) G.discard.push(card);
	}
};

export const revealTop = (G: GState, count: number): Card[] => {
	const revealed: Card[] = [];
	for (let i = 0; i < count; i += 1) {
		const card = G.deck.pop();
		if (!card) break;
		revealed.push(card);
	}
	G.action.revealed = revealed;
	return revealed;
};

export const discardRevealed = (G: GState): void => {
	while (G.action.revealed.length > 0) {
		const card = G.action.revealed.shift();
		if (card) G.discard.push(card);
	}
};

export const draftInTurnOrder = (G: GState, order: PlayerID[], picks: Record<PlayerID, number>): void => {
	for (const playerId of order) {
		const index = picks[playerId];
		if (index === undefined) continue;
		if (index < 0 || index >= G.action.revealed.length) continue;
		const [card] = G.action.revealed.splice(index, 1);
		if (card) ensureHand(G, playerId).push(card);
	}
};

export const moveCardToPlayerHand = (G: GState, playerId: PlayerID, card: Card): void => {
	ensureHand(G, playerId).push(card);
};

export const placeOnDrawPileTopFaceUp = (G: GState, card: Card): void => {
	G.action.faceUpDrawPile.push(card);
};

export const randomStealCard = (G: GState, fromPlayerId: PlayerID, toPlayerId: PlayerID, count: number, rng: () => number): void => {
	const fromHand = ensureHand(G, fromPlayerId);
	const toHand = ensureHand(G, toPlayerId);
	for (let i = 0; i < count; i += 1) {
		if (fromHand.length === 0) break;
		const index = Math.floor(rng() * fromHand.length);
		const [card] = fromHand.splice(index, 1);
		if (card) toHand.push(card);
	}
};

export const grantExtraPlay = (G: GState, playerId: PlayerID, count: number): void => {
	ensurePlayerNumber(G.action.extraPlays, playerId);
	G.action.extraPlays[playerId] += count;
};

export const grantExtraPlacements = (G: GState, playerId: PlayerID, count: number, color?: Color): void => {
	ensurePlayerPlacements(G.action.extraPlacements, playerId);
	G.action.extraPlacements[playerId]!.count += count;
	if (color) G.action.extraPlacements[playerId]!.color = color;
};

export const grantExtraActionPlays = (G: GState, playerId: PlayerID, count: number): void => {
	ensurePlayerNumber(G.action.extraActionPlays, playerId);
	G.action.extraActionPlays[playerId] += count;
};

export const markSkipNextTurn = (G: GState, playerId: PlayerID): void => {
	ensurePlayerBool(G.action.skipNextTurn, playerId);
	G.action.skipNextTurn[playerId] = true;
};

export const suppressDrawsUntil = (G: GState, condition: 'handsEmpty', sourceCardId?: number): void => {
	G.action.suppressedDraws = { condition, sourceCardId };
};

export const replaceHexWithDead = (G: GState, coord: Co): void => {
	if (!inBounds(coord, G.radius)) return;
	const k = key(coord);
	const tile = G.board[k] ?? { colors: [], rotation: 0, dead: false };
	tile.colors = [];
	tile.rotation = 0;
	tile.dead = true;
	G.board[k] = tile;
};

export const replaceHexColor = (G: GState, coord: Co, color: Color): void => {
	if (!inBounds(coord, G.radius)) return;
	const isOrigin = G.origins.some((o) => o.q === coord.q && o.r === coord.r);
	if (isOrigin) return;
	const k = key(coord);
	const tile = G.board[k];
	if (tile?.dead) return;
	const rotation = inferPlacementRotation(G, coord, color);
	G.board[k] = { colors: [color], rotation, dead: false };
};

export const moveHex = (G: GState, from: Co, to: Co): void => {
	if (!inBounds(from, G.radius) || !inBounds(to, G.radius)) return;
	const fromKey = key(from);
	const toKey = key(to);
	const fromTile = G.board[fromKey];
	if (!fromTile || fromTile.dead || fromTile.colors.length === 0) return;
	const isOrigin = G.origins.some((o) => o.q === to.q && o.r === to.r);
	if (isOrigin) return;
	const toTile = G.board[toKey];
	if (toTile && (toTile.dead || toTile.colors.length > 0)) return;
	if (!canPlace(G, to, fromTile.colors[0]!, G.rules)) return;
	G.board[toKey] = { ...fromTile, dead: false };
	G.board[fromKey] = { colors: [], rotation: 0, dead: false };
};

export const reorderPlayerPrefs = (G: GState, playerId: PlayerID, order: PlayerPrefs): void => {
	G.prefs[playerId] = order;
};

export const setAgendaOverride = (G: GState, playerId: PlayerID, stat: Stat | null): void => {
	ensurePlayerNullableStat(G.action.agendaOverrides, playerId);
	G.action.agendaOverrides[playerId] = stat;
};

export const grantRevealUnusedVillains = (G: GState, playerId: PlayerID, untilRound: number | null): void => {
	ensurePlayerNullableNumber(G.action.revealUnusedVillainsUntil, playerId);
	G.action.revealUnusedVillainsUntil[playerId] = untilRound;
};

export const registerTrigger = (G: GState, trigger: Trigger): void => {
	G.action.triggers.push(trigger);
};

export const attachCard = (G: GState, attached: AttachedCard): void => {
	G.action.attachedCards.push(attached);
};

const shuffleInPlaceWithRng = <T,>(values: T[], rng: () => number): void => {
	for (let i = values.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rng() * (i + 1));
		[values[i], values[j]] = [values[j]!, values[i]!];
	}
};

export const randomizeColorDirections = (G: GState, rng: () => number = Math.random): void => {
	const next = [...G.rules.EDGE_COLORS];
	shuffleInPlaceWithRng(next, rng);
	G.rules.EDGE_COLORS = next;
	G.rules.COLOR_TO_DIR = buildColorToDir(next);
};

export const fillTreasureToMax = (G: GState): void => {
	while (G.treasure.length < G.rules.TREASURE_MAX) {
		const card = drawOne(G);
		if (!card) break;
		G.treasure.push(card);
	}
};

export const removeLane = (G: GState, laneIndex: number): void => {
	if (laneIndex < 0 || laneIndex >= G.lanes.length) return;
	G.lanes.splice(laneIndex, 1);
};

export const changeLaneColor = (G: GState, laneIndex: number, color: Color): void => {
	const lane = G.lanes[laneIndex];
	if (!lane) return;
	lane.color = color;
};

export const destroyNode = (G: GState, coord: Co): void => {
	G.lanes = G.lanes.filter((ln) => !(ln.from.q === coord.q && ln.from.r === coord.r) && !(ln.to.q === coord.q && ln.to.r === coord.r));
	replaceHexWithDead(G, coord);
};

export const destroyPath = (G: GState, coord: Co): void => {
	if (G.rules.MODE !== 'path') return;
	const startKey = key(coord);
	const adj = new Map<string, Set<string>>();
	const addAdj = (a: Co, b: Co): void => {
		const ak = key(a);
		const bk = key(b);
		if (!adj.has(ak)) adj.set(ak, new Set());
		if (!adj.has(bk)) adj.set(bk, new Set());
		adj.get(ak)!.add(bk);
		adj.get(bk)!.add(ak);
	};
	for (const ln of G.lanes) addAdj(ln.from, ln.to);
	const visited = new Set<string>();
	const queue = [startKey];
	visited.add(startKey);
	while (queue.length) {
		const cur = queue.shift()!;
		const nbrs = adj.get(cur);
		if (!nbrs) continue;
		for (const nk of nbrs) {
			if (visited.has(nk)) continue;
			visited.add(nk);
			queue.push(nk);
		}
	}
	G.lanes = G.lanes.filter((ln) => !visited.has(key(ln.from)) && !visited.has(key(ln.to)));
};

export const swapPrefsSecondaryTertiary = (G: GState, playerId: PlayerID): void => {
	const prefs = G.prefs[playerId];
	if (!prefs) return;
	G.prefs[playerId] = {
		primary: prefs.primary,
		secondary: prefs.tertiary,
		tertiary: prefs.secondary,
	};
};

export const increaseHandSize = (G: GState, playerId: PlayerID, amount: number): void => {
	const state = G.nightmareState[playerId];
	if (!state) return;
	state.handSizeBonus += amount;
};

export type NightmareActionContext = {
	currentPlayer: PlayerID;
	targetPlayerId?: PlayerID;
	coord?: Co;
	laneIndex?: number;
	color?: Color;
	rng?: () => number;
};

export const applyNightmareActions = (G: GState, actions: NightmareAction[], context: NightmareActionContext): void => {
	const rng = context.rng ?? Math.random;
	for (const action of actions) {
		switch (action.type) {
			case 'randomizeColorDirections':
				randomizeColorDirections(G, rng);
				break;
			case 'fillTreasureToMax':
				fillTreasureToMax(G);
				break;
			case 'drawCards':
				drawCards(G, context.currentPlayer, action.count);
				break;
			case 'destroyPath':
				if (context.coord) destroyPath(G, context.coord);
				break;
			case 'removeLane':
				if (context.laneIndex !== undefined) removeLane(G, context.laneIndex);
				break;
			case 'changeLaneColor':
				if (context.laneIndex !== undefined && context.color) changeLaneColor(G, context.laneIndex, context.color);
				break;
			case 'destroyNode':
				if (context.coord) destroyNode(G, context.coord);
				break;
			case 'grantExtraPlacements':
				grantExtraPlacements(G, context.currentPlayer, action.count);
				break;
			case 'randomStealCard':
				if (!context.targetPlayerId) break;
				randomStealCard(G, context.targetPlayerId, context.currentPlayer, action.count, rng);
				break;
			case 'swapPrefsSecondaryTertiary':
				swapPrefsSecondaryTertiary(G, context.currentPlayer);
				break;
			case 'increaseHandSize':
				increaseHandSize(G, context.currentPlayer, action.amount);
				break;
			default:
				break;
		}
	}
};

export const applyGameEffect = (G: GState, effect: GameEffect, context: EffectContext): void => {
	const rng = context.rng ?? Math.random;
	switch (effect.type) {
		case 'drawCards':
			drawCards(G, effect.playerId, effect.count);
			break;
		case 'discardCard':
			discardCard(G, effect.playerId, effect.handIndex);
			break;
		case 'discardHand':
			discardHand(G, effect.playerId);
			break;
		case 'randomDiscard':
			randomDiscard(G, effect.playerId, effect.count, rng);
			break;
		case 'revealTop':
			revealTop(G, effect.count);
			break;
		case 'discardRevealed':
			discardRevealed(G);
			break;
		case 'draftInTurnOrder':
			draftInTurnOrder(G, effect.order, effect.picks);
			break;
		case 'autoPlayPickedCard': {
			const card = G.action.revealed[effect.revealedIndex];
			if (!card) break;
			G.action.revealed.splice(effect.revealedIndex, 1);
			if (card.isAction && effect.effects && effect.effects.length > 0) {
				playActionCardFromCard(G, context.ctx, effect.playerId, card, effect.effects, rng);
			} else {
				moveCardToPlayerHand(G, effect.playerId, card);
			}
			break;
		}
		case 'moveCardToPlayerHand': {
			const card = effect.usePlayedCard ? context.playedCard : effect.card;
			if (!card) break;
			moveCardToPlayerHand(G, effect.playerId, card);
			if (effect.usePlayedCard) context.markPlayedCardMoved();
			break;
		}
		case 'placeOnDrawPileTopFaceUp': {
			const card = effect.usePlayedCard ? context.playedCard : effect.card;
			if (!card) break;
			placeOnDrawPileTopFaceUp(G, card);
			if (effect.usePlayedCard) context.markPlayedCardMoved();
			break;
		}
		case 'randomStealCard':
			randomStealCard(G, effect.fromPlayerId, effect.toPlayerId, effect.count, rng);
			break;
		case 'grantExtraPlay':
			grantExtraPlay(G, effect.playerId, effect.count);
			break;
		case 'grantExtraPlacements':
			grantExtraPlacements(G, effect.playerId, effect.count, effect.color);
			break;
		case 'grantExtraActionPlays':
			grantExtraActionPlays(G, effect.playerId, effect.count);
			break;
		case 'markSkipNextTurn':
			markSkipNextTurn(G, effect.playerId);
			break;
		case 'suppressDrawsUntil':
			suppressDrawsUntil(G, effect.condition, effect.sourceCardId);
			break;
		case 'replaceHexWithDead':
			replaceHexWithDead(G, effect.coord);
			break;
		case 'replaceHexColor':
			replaceHexColor(G, effect.coord, effect.color);
			break;
		case 'moveHex':
			moveHex(G, effect.from, effect.to);
			break;
		case 'reorderPlayerPrefs':
			reorderPlayerPrefs(G, effect.playerId, effect.order);
			break;
		case 'setAgendaOverride':
			setAgendaOverride(G, effect.playerId, effect.stat);
			break;
		case 'grantRevealUnusedVillains':
			grantRevealUnusedVillains(G, effect.playerId, effect.untilRound ?? null);
			break;
		case 'registerTrigger':
			registerTrigger(G, effect.trigger);
			break;
		case 'attachCard': {
			const card = effect.usePlayedCard ? context.playedCard : effect.card;
			if (!card) break;
			attachCard(G, { card, targetPlayerId: effect.targetPlayerId, token: effect.token, expires: effect.expires });
			if (effect.usePlayedCard) context.markPlayedCardMoved();
			break;
		}
		default:
			break;
	}
};

export const applyGameEffects = (G: GState, effects: GameEffect[], context: EffectContext): void => {
	for (const effect of effects) {
		applyGameEffect(G, effect, context);
	}
};

export const playActionCardFromCard = (
	G: GState,
	ctx: Ctx | undefined,
	playerId: PlayerID,
	card: Card,
	effects: GameEffect[],
	rng: () => number = Math.random,
): void => {
	let playedCardMoved = false;
	const context: EffectContext = {
		ctx,
		currentPlayer: playerId,
		rng,
		playedCard: card,
		markPlayedCardMoved: () => {
			playedCardMoved = true;
		},
	};
	applyGameEffects(G, effects, context);
	if (!playedCardMoved) {
		G.discard.push(card);
	}
};

export const playActionCardFromHand = (
	G: GState,
	ctx: Ctx | undefined,
	playerId: PlayerID,
	handIndex: number,
	effects: GameEffect[],
	rng: () => number = Math.random,
): void => {
	const hand = ensureHand(G, playerId);
	const card = hand[handIndex];
	if (!card || !card.isAction) return;
	hand.splice(handIndex, 1);
	playActionCardFromCard(G, ctx, playerId, card, effects, rng);
};
