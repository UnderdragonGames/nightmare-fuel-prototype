import { describe, it, expect } from 'vitest';
import { CARDS } from '../game/cards';
import { CARD_ACTIONS_BY_ID, resolveCardActions } from '../game/cardActions';

const actionCards = CARDS.filter((card) => card.isAction && Boolean(card.text));

describe('card action schema', () => {
	it('covers every action card', () => {
		expect(actionCards.length).toBe(25);
		const missing = actionCards.filter((card) => resolveCardActions(card).length === 0);
		expect(missing.map((card) => `${card.id}:${card.name}`)).toEqual([]);
	});

	it('does not map non-action cards', () => {
		const mappedIds = Object.keys(CARD_ACTIONS_BY_ID).map((id) => Number(id));
		const invalid = mappedIds
			.map((id) => CARDS.find((card) => card.id === id))
			.filter((card) => !card || !card.isAction)
			.map((card) => (card ? `${card.id}:${card.name}` : 'unknown-card'));
		expect(invalid).toEqual([]);
	});

	it('does not define actions in two places', () => {
		const duplicated = CARDS.filter((card) => (card.actions?.length ?? 0) > 0)
			.filter((card) => (CARD_ACTIONS_BY_ID[card.id]?.length ?? 0) > 0)
			.map((card) => `${card.id}:${card.name}`);
		expect(duplicated).toEqual([]);
	});
});
