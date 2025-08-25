import { Card, Color } from './types';
import { RULES } from './rulesConfig';
import { shuffleInPlace } from './helpers';

const COLORS = RULES.COLORS as readonly Color[];

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

	const c2 = repeatAndFlatten(pairs, RULES.DECK_COUNTS.twoColor);
	const c3 = repeatAndFlatten(triples, RULES.DECK_COUNTS.threeColor);
	const c4 = repeatAndFlatten(quads, RULES.DECK_COUNTS.fourColor);

	const deck = [...c2, ...c3, ...c4];
	shuffleInPlace(deck, rng);
	return deck;
};


