import { describe, it, expect } from 'vitest';
import type { NightmareAction } from '../game/types';
import { NIGHTMARES } from '../game/nightmares';
import { resolveNightmareActions } from '../game/nightmareActions';

const OBVIOUS_ACTIONS: Record<string, NightmareAction[]> = {
	Alien: [{ type: 'randomizeColorDirections' }],
	Blob: [{ type: 'fillTreasureToMax' }],
	Cultist: [{ type: 'drawCards', count: 3, target: 'current' }],
	Robot: [{ type: 'swapPrefsSecondaryTertiary' }],
	Vampire: [{ type: 'randomStealCard', count: 1 }],
	Zombie: [{ type: 'increaseHandSize', amount: 1 }],
};

describe('nightmare actions mapping', () => {
	it('all nightmares have mapped actions', () => {
		const missing = NIGHTMARES.filter((n) => resolveNightmareActions(n).length === 0);
		expect(missing.map((n) => n.name)).toEqual([]);
	});

	for (const [name, expected] of Object.entries(OBVIOUS_ACTIONS)) {
		it(`maps ${name}`, () => {
			const nightmare = NIGHTMARES.find((n) => n.name === name);
			if (!nightmare) throw new Error(`Missing nightmare ${name}`);
			expect(resolveNightmareActions(nightmare)).toEqual(expected);
		});
	}
});
