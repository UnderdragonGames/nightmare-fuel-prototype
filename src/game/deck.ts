import type { Card, Rules } from './types';
import { shuffleInPlace } from './helpers';
import { CARDS } from './cards';

// Action cards that depend on physical-prototype mechanics with no digital
// counterpart (stat tokens, stat agendas, synergy triggers). Excluded from the
// digital deck until those mechanics exist. (48 Ingenuity, 65 New Agenda,
// 86 Restrict, 90 Seal Power — see docs/spec-ai-improvements.md P0.)
export const DIGITALLY_EXCLUDED_CARD_IDS: ReadonlySet<number> = new Set([48, 65, 86, 90]);

export const buildDeck = (_rules: Rules, rng: () => number = Math.random): Card[] => {
	const deck = CARDS.filter((card) => !DIGITALLY_EXCLUDED_CARD_IDS.has(card.id)).map((card) => ({ ...card }));
	shuffleInPlace(deck, rng);
	return deck;
};

