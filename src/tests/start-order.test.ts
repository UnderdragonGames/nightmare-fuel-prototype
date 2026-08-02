import { describe, it, expect } from 'vitest';
import { HexStringsGame } from '../game/game';
import type { GState } from '../game/types';

// Feedback (2026-08-02): "Let's randomize starting order."

type OrderCfg = {
	first: (ctx: unknown) => number;
	next: (ctx: { ctx: { playOrderPos: number; playOrder: string[] } }) => number;
	playOrder: (ctx: { G: GState; random?: { Shuffle<T>(a: T[]): T[] } }) => string[];
};
const order = (HexStringsGame.turn as unknown as { order: OrderCfg }).order;

const gWith = (randomStart: boolean): GState =>
	({
		rules: { RANDOM_START_ORDER: randomStart },
		players: { '0': {}, '1': {}, '2': {} },
	}) as unknown as GState;

describe('starting order', () => {
	it('shuffles the seat order when RANDOM_START_ORDER is on', () => {
		const reversed = <T,>(a: T[]): T[] => [...a].reverse();
		const result = order.playOrder({ G: gWith(true), random: { Shuffle: reversed } });
		expect(result).toEqual(['2', '1', '0']);
	});

	it('keeps seat order when RANDOM_START_ORDER is off', () => {
		let called = false;
		const result = order.playOrder({
			G: gWith(false),
			random: { Shuffle: (a) => { called = true; return a; } },
		});
		expect(result).toEqual(['0', '1', '2']);
		expect(called).toBe(false);
	});

	it('starts at position 0 and cycles', () => {
		expect(order.first({})).toBe(0);
		expect(order.next({ ctx: { playOrderPos: 2, playOrder: ['a', 'b', 'c'] } })).toBe(0);
		expect(order.next({ ctx: { playOrderPos: 0, playOrder: ['a', 'b', 'c'] } })).toBe(1);
	});
});
