import type { Card, Rules } from './types';
import { shuffleInPlace } from './helpers';
import { CARDS } from './cards';

export const buildDeck = (_rules: Rules, rng: () => number = Math.random): Card[] => {
	const deck = CARDS.map((card) => ({ ...card }));
	shuffleInPlace(deck, rng);
	return deck;
};

