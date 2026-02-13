import { describe, it, expect } from 'vitest';
import type { CardAction } from '../game/types';
import { CARDS } from '../game/cards';
import { resolveCardActions } from '../game/cardActions';

const getCardById = (id: number) => {
	const card = CARDS.find((c) => c.id === id);
	if (!card) throw new Error(`Missing card id ${id}`);
	return card;
};

const OBVIOUS_ACTIONS: Record<number, CardAction[]> = {
	2: [{ type: 'drawCards', count: 1, target: 'each' }], // Allow a Brief Reprieve
	8: [{ type: 'drawCards', count: 5, target: 'current' }], // Armed to the Teeth
	10: [
		{ type: 'placeOnDrawPileTopFaceUp' },
		{ type: 'suppressDrawsUntil', condition: 'handsEmpty' },
		{ type: 'moveSelfToDiscard', condition: 'handsEmpty' },
	], // Barren Wasteland
	23: [{ type: 'randomDiscard', count: 1, target: 'each' }], // Debilitate
	32: [
		{ type: 'discardHand', target: 'each' },
		{ type: 'drawCards', count: 3, target: 'each' },
	], // Embrace Chaos
	54: [{ type: 'replaceHexWithDead' }], // Malfunction
	73: [{ type: 'replaceHexWithDead' }], // Placebo
	82: [{ type: 'randomStealCard', count: 1 }], // Steal (82)
	89: [{ type: 'markSkipNextTurn' }, { type: 'discardSelfAfterSkip' }], // Sabotage
	100: [{ type: 'randomStealCard', count: 1 }], // Steal (100)
	111: [{ type: 'replaceHexColor' }], // This Prey is Mine
};

describe('action cards mapping', () => {
	it('all action cards have mapped actions', () => {
		const missing = CARDS.filter((c) => c.isAction).filter((c) => resolveCardActions(c).length === 0);
		expect(missing.map((c) => `${c.id}:${c.name}`)).toEqual([]);
	});

	for (const [idKey, expected] of Object.entries(OBVIOUS_ACTIONS)) {
		const id = Number(idKey);
		it(`maps ${id}:${getCardById(id).name}`, () => {
			const card = getCardById(id);
			expect(resolveCardActions(card)).toEqual(expected);
		});
	}

	const actionCards = CARDS.filter((c) => c.isAction).map((c) => c.id);
	const obviousIds = new Set(Object.keys(OBVIOUS_ACTIONS).map((id) => Number(id)));
	const ambiguousIds = actionCards.filter((id) => !obviousIds.has(id));

	for (const id of ambiguousIds) {
		const card = getCardById(id);
		it(`TODO: ${id}:${card.name}`, () => {
			expect(true).toBe(true);
		});
	}
});
