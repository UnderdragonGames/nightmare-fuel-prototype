import type { Card, CardAction, Color, Co, GameEffect, PlayerID, PlayerPrefs, Stat, Trigger } from './types';

const drawEach = (count: number): CardAction => ({ type: 'drawCards', count, target: 'each' });
const drawCurrent = (count: number): CardAction => ({ type: 'drawCards', count, target: 'current' });
const randomDiscardEach = (count: number): CardAction => ({ type: 'randomDiscard', count, target: 'each' });
const discardHandEach = (): CardAction => ({ type: 'discardHand', target: 'each' });
const grantExtraPlacements = (count: number): CardAction => ({ type: 'grantExtraPlacements', count });
const grantExtraActionPlays = (count: number): CardAction => ({ type: 'grantExtraActionPlays', count });
const grantExtraPlay = (count: number): CardAction => ({ type: 'grantExtraPlay', count });
const choice = (...options: CardAction[][]): CardAction => ({ type: 'choice', options });

export const CARD_ACTIONS_BY_ID: Record<number, CardAction[]> = {
	2: [drawEach(1)],
	4: [{ type: 'revealTop', count: 5 }, { type: 'pickOneToHand' }, { type: 'discardRest' }],
	8: [drawCurrent(5)],
	10: [
		{ type: 'placeOnDrawPileTopFaceUp' },
		{ type: 'suppressDrawsUntil', condition: 'handsEmpty' },
		{ type: 'moveSelfToDiscard', condition: 'handsEmpty' },
	],
	19: [choice([grantExtraPlacements(2)], [grantExtraActionPlays(2)])],
	23: [randomDiscardEach(1)],
	28: [{ type: 'rotateHands', direction: 'clockwise' }],
	32: [discardHandEach(), drawEach(3)],
	43: [{ type: 'selectOwnedHex' }, { type: 'moveHex' }],
	48: [{ type: 'chooseStat' }, { type: 'placeTokenOnHex' }, { type: 'markHexCountsForTwoStats' }],
	54: [{ type: 'replaceHexWithDead' }],
	60: [{ type: 'moveCardToPlayerHand' }, grantExtraPlay(1)],
	63: [{ type: 'revealTop', count: 'playerCount' }, { type: 'draftInTurnOrder' }, { type: 'autoPlayPickedCard' }],
	65: [{ type: 'chooseAgenda' }, { type: 'chooseStat' }, { type: 'setAgendaOverride' }],
	73: [{ type: 'replaceHexWithDead' }],
	79: [{ type: 'grantRevealUnusedVillains', duration: 'round' }],
	82: [{ type: 'randomStealCard', count: 1 }],
	83: [{ type: 'reorderPlayerPrefs' }, { type: 'markAgendaTokens' }],
	86: [{ type: 'attachTokenToCard' }, { type: 'registerTrigger', trigger: 'onMoveStatOfType' }, { type: 'discardSelfOnTrigger' }],
	87: [{ type: 'privateRevealVillain' }],
	89: [{ type: 'markSkipNextTurn' }, { type: 'discardSelfAfterSkip' }],
	90: [{ type: 'attachToPlayer' }, { type: 'registerTrigger', trigger: 'onSynergy' }, { type: 'reduceSynergyOnce' }],
	91: [{ type: 'readLastPlacedColor' }, { type: 'grantExtraPlacement', color: 'lastPlaced' }],
	100: [{ type: 'randomStealCard', count: 1 }],
	111: [{ type: 'replaceHexColor' }],
};

export const resolveCardActions = (card: Card): CardAction[] => {
	const cardActions = card.actions ?? [];
	const mappedActions = CARD_ACTIONS_BY_ID[card.id] ?? [];
	if (cardActions.length > 0 && mappedActions.length > 0) {
		throw new Error(`Card ${card.id}:${card.name} defines actions in both card data and CARD_ACTIONS_BY_ID.`);
	}
	if (cardActions.length > 0) return cardActions;
	return mappedActions;
};

export type CardActionResolveContext = {
	currentPlayerId: PlayerID;
	playerOrder: PlayerID[];
	targetPlayerId?: PlayerID;
	revealedPickIndex?: number;
	draftPicks?: Record<PlayerID, number>;
	choiceIndex?: number;
	coord?: Co;
	replaceColor?: Color;
	moveFrom?: Co;
	moveTo?: Co;
	chosenStat?: Stat;
	playerPrefs?: PlayerPrefs;
	lastPlacedColor?: Color | null;
};

const requireValue = <T,>(value: T | undefined, message: string): T => {
	if (value === undefined) throw new Error(message);
	return value;
};

const resolveTargetPlayers = (action: CardAction, ctx: CardActionResolveContext): PlayerID[] => {
	if (action.target === 'current') return [ctx.currentPlayerId];
	if (action.target === 'each') return [...ctx.playerOrder];
	const target = requireValue(action.playerId ?? ctx.targetPlayerId, 'Card action requires target playerId.');
	return [target];
};

export const resolveCardEffects = (card: Card, ctx: CardActionResolveContext): GameEffect[] => {
	const actions = resolveCardActions(card);
	const effects: GameEffect[] = [];

	const pushEffect = (effect: GameEffect) => {
		effects.push(effect);
	};

	for (const action of actions) {
		switch (action.type) {
			case 'drawCards': {
				for (const playerId of resolveTargetPlayers(action, ctx)) {
					pushEffect({ type: 'drawCards', playerId, count: action.count });
				}
				break;
			}
			case 'randomDiscard': {
				for (const playerId of resolveTargetPlayers(action, ctx)) {
					pushEffect({ type: 'randomDiscard', playerId, count: action.count });
				}
				break;
			}
			case 'discardHand': {
				for (const playerId of resolveTargetPlayers(action, ctx)) {
					pushEffect({ type: 'discardHand', playerId });
				}
				break;
			}
			case 'revealTop': {
				const count = action.count === 'playerCount' ? ctx.playerOrder.length : action.count;
				pushEffect({ type: 'revealTop', count });
				break;
			}
			case 'pickOneToHand': {
				const index = requireValue(ctx.revealedPickIndex, 'pickOneToHand requires revealedPickIndex.');
				pushEffect({
					type: 'draftInTurnOrder',
					order: [ctx.currentPlayerId],
					picks: { [ctx.currentPlayerId]: index },
				});
				break;
			}
			case 'discardRest':
				pushEffect({ type: 'discardRevealed' });
				break;
			case 'placeOnDrawPileTopFaceUp':
				pushEffect({ type: 'placeOnDrawPileTopFaceUp', usePlayedCard: true });
				break;
			case 'suppressDrawsUntil':
				pushEffect({ type: 'suppressDrawsUntil', condition: action.condition, sourceCardId: card.id });
				break;
			case 'moveSelfToDiscard':
				// No-op: played card is discarded unless moved elsewhere.
				break;
			case 'grantExtraPlacements':
				pushEffect({ type: 'grantExtraPlacements', playerId: ctx.currentPlayerId, count: action.count });
				break;
			case 'grantExtraActionPlays':
				pushEffect({ type: 'grantExtraActionPlays', playerId: ctx.currentPlayerId, count: action.count });
				break;
			case 'grantExtraPlay':
				pushEffect({ type: 'grantExtraPlay', playerId: ctx.currentPlayerId, count: action.count });
				break;
			case 'rotateHands':
				throw new Error('rotateHands is not implemented.');
			case 'selectOwnedHex':
				// Handled by UI selection; no direct effect.
				break;
			case 'moveHex': {
				const from = requireValue(ctx.moveFrom, 'moveHex requires moveFrom.');
				const to = requireValue(ctx.moveTo, 'moveHex requires moveTo.');
				pushEffect({ type: 'moveHex', from, to });
				break;
			}
			case 'chooseStat':
			case 'placeTokenOnHex':
			case 'markHexCountsForTwoStats':
				throw new Error(`${action.type} is not implemented.`);
			case 'replaceHexWithDead': {
				const coord = requireValue(ctx.coord, 'replaceHexWithDead requires coord.');
				pushEffect({ type: 'replaceHexWithDead', coord });
				break;
			}
			case 'moveCardToPlayerHand': {
				const targetPlayerId = ctx.targetPlayerId ?? ctx.currentPlayerId;
				pushEffect({ type: 'moveCardToPlayerHand', playerId: targetPlayerId, usePlayedCard: true });
				break;
			}
			case 'draftInTurnOrder': {
				const picks = requireValue(ctx.draftPicks, 'draftInTurnOrder requires draftPicks.');
				pushEffect({ type: 'draftInTurnOrder', order: ctx.playerOrder, picks });
				break;
			}
			case 'autoPlayPickedCard':
				throw new Error('autoPlayPickedCard requires explicit effects and is not implemented.');
			case 'chooseAgenda':
				// UI-driven selection before setAgendaOverride.
				break;
			case 'setAgendaOverride': {
				const stat = requireValue(ctx.chosenStat, 'setAgendaOverride requires chosenStat.');
				pushEffect({ type: 'setAgendaOverride', playerId: ctx.currentPlayerId, stat });
				break;
			}
			case 'reorderPlayerPrefs': {
				const order = requireValue(ctx.playerPrefs, 'reorderPlayerPrefs requires playerPrefs.');
				pushEffect({ type: 'reorderPlayerPrefs', playerId: ctx.currentPlayerId, order });
				break;
			}
			case 'markAgendaTokens':
				// Visual/metadata only.
				break;
			case 'attachTokenToCard': {
				const token = requireValue(ctx.chosenStat, 'attachTokenToCard requires chosenStat.');
				pushEffect({ type: 'attachCard', usePlayedCard: true, token, expires: 'afterTrigger' });
				break;
			}
			case 'registerTrigger': {
				const trigger: Trigger =
					action.trigger === 'onMoveStatOfType'
						? { type: 'onMoveStatOfType', stat: requireValue(ctx.chosenStat, 'registerTrigger requires chosenStat.'), card }
						: { type: 'onSynergy', card };
				pushEffect({ type: 'registerTrigger', trigger });
				break;
			}
			case 'discardSelfOnTrigger':
				// Discard handled by trigger resolution later.
				break;
			case 'privateRevealVillain':
				// UI-only.
				break;
			case 'markSkipNextTurn': {
				const target = requireValue(ctx.targetPlayerId, 'markSkipNextTurn requires targetPlayerId.');
				pushEffect({ type: 'markSkipNextTurn', playerId: target });
				break;
			}
			case 'discardSelfAfterSkip': {
				const target = requireValue(ctx.targetPlayerId, 'discardSelfAfterSkip requires targetPlayerId.');
				pushEffect({ type: 'attachCard', usePlayedCard: true, targetPlayerId: target, expires: 'afterSkip' });
				break;
			}
			case 'attachToPlayer': {
				const target = requireValue(ctx.targetPlayerId, 'attachToPlayer requires targetPlayerId.');
				pushEffect({ type: 'attachCard', usePlayedCard: true, targetPlayerId: target, expires: 'manual' });
				break;
			}
			case 'reduceSynergyOnce':
				// Trigger resolution will handle this once triggers are implemented.
				break;
			case 'readLastPlacedColor':
				// Used to inform grantExtraPlacement; no direct effect.
				break;
			case 'grantExtraPlacement': {
				const color = action.color === 'lastPlaced'
					? requireValue(ctx.lastPlacedColor ?? undefined, 'grantExtraPlacement requires lastPlacedColor.')
					: requireValue(ctx.replaceColor, 'grantExtraPlacement requires color.');
				pushEffect({ type: 'grantExtraPlacements', playerId: ctx.currentPlayerId, count: 1, color });
				break;
			}
			case 'randomStealCard': {
				const fromPlayerId = requireValue(ctx.targetPlayerId, 'randomStealCard requires targetPlayerId.');
				pushEffect({ type: 'randomStealCard', fromPlayerId, toPlayerId: ctx.currentPlayerId, count: action.count });
				break;
			}
			case 'replaceHexColor': {
				const coord = requireValue(ctx.coord, 'replaceHexColor requires coord.');
				const color = requireValue(ctx.replaceColor, 'replaceHexColor requires replaceColor.');
				pushEffect({ type: 'replaceHexColor', coord, color });
				break;
			}
			case 'grantRevealUnusedVillains': {
				pushEffect({ type: 'grantRevealUnusedVillains', playerId: ctx.currentPlayerId, untilRound: null });
				break;
			}
			case 'choice': {
				const index = requireValue(ctx.choiceIndex, 'choice requires choiceIndex.');
				const picked = action.options[index];
				if (!picked) throw new Error('choiceIndex out of range.');
				const nestedCard = { ...card, actions: picked };
				effects.push(...resolveCardEffects(nestedCard, ctx));
				break;
			}
			default:
				throw new Error(`Unknown card action ${(action as CardAction).type}`);
		}
	}

	return effects;
};
