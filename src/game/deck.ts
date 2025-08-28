import type { Card, Color } from './types';
import { RULES } from './rulesConfig';
import { shuffleInPlace } from './helpers';

const COLORS = RULES.COLORS;

const combinations = <T,>(arr: readonly T[], k: number): T[][] => {
	const result: T[][] = [];
	const combo: T[] = [];
	const backtrack = (start: number, depth: number) => {
		if (depth === k) {
			result.push([...combo]);
			return;
		}
		for (let i = start; i < arr.length; i += 1) {
			combo.push(arr[i]!);
			backtrack(i + 1, depth + 1);
			combo.pop();
		}
	};
	backtrack(0, 0);
	return result;
};

const repeatAndFlatten = (items: Color[][], targetCount: number): Card[] => {
	const out: Card[] = [];
	let i = 0;
	while (out.length < targetCount) {
		const colors = items[i % items.length]!;
		out.push({ colors });
		i += 1;
	}
	return out;
};

export const buildDeck = (rng: () => number = Math.random): Card[] => {
	const pairs = combinations(COLORS, 2);
	const triples = combinations(COLORS, 3);
	const quads = combinations(COLORS, 4);

	// If DECK_SIZE is specified, scale counts proportionally to the configured weights.
	const totalWeight = RULES.DECK_COUNTS.twoColor + RULES.DECK_COUNTS.threeColor + RULES.DECK_COUNTS.fourColor;
	const target = Math.max(1, RULES.DECK_SIZE ?? totalWeight);
	const t2 = Math.round((RULES.DECK_COUNTS.twoColor / totalWeight) * target);
	const t3 = Math.round((RULES.DECK_COUNTS.threeColor / totalWeight) * target);
	const t4 = Math.max(0, target - t2 - t3); // ensure sum matches target

	const c2 = repeatAndFlatten(pairs, t2);
	const c3 = repeatAndFlatten(triples, t3);
	const c4 = repeatAndFlatten(quads, t4);

	const deck = [...c2, ...c3, ...c4];
	shuffleInPlace(deck, rng);
	return deck;
};


