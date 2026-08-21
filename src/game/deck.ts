import type { Card, Rules } from './types';
import { shuffleInPlace } from './helpers';
import { CARDS } from './cards';

// Action cards that depend on physical-prototype mechanics with no digital
// counterpart (stat tokens, stat agendas, synergy triggers). Excluded from the
// digital deck until those mechanics exist. (48 Ingenuity, 65 New Agenda,
// 86 Restrict, 90 Seal Power — see docs/spec-ai-improvements.md P0.)
export const DIGITALLY_EXCLUDED_CARD_IDS: ReadonlySet<number> = new Set([48, 65, 86, 90]);

// Draw-flavored action cards: extra copies of these are mixed into the deck
// (rules.EXTRA_DRAW_CARD_COPIES each) so the deck-exhaust ending arrives at a
// playable pace without an automatic per-turn bonus draw.
// 2 Allow a Brief Reprieve (drawEach 1), 8 Armed to the Teeth (draw 5),
// 32 Embrace Chaos (discard hands, drawEach 3).
export const DRAW_CARD_IDS: readonly number[] = [2, 8, 32];

export const buildDeck = (rules: Rules, rng: () => number = Math.random): Card[] => {
	const deck = CARDS.filter((card) => !DIGITALLY_EXCLUDED_CARD_IDS.has(card.id)).map((card) => ({ ...card }));
	const extraCopies = rules.EXTRA_DRAW_CARD_COPIES ?? 0;
	for (const id of DRAW_CARD_IDS) {
		const template = CARDS.find((card) => card.id === id);
		if (!template) continue;
		for (let i = 0; i < extraCopies; i += 1) deck.push({ ...template });
	}
	shuffleInPlace(deck, rng);
	return deck;
};

