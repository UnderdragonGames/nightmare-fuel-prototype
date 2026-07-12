import { describe, it, expect } from 'vitest';
import { byId, filler, makeState, playAction } from './cardTestUtils';

describe('#79 Procession of Elimination', () => {
	it('grants reveal of unused villains for the round', () => {
		const G = makeState({ hands: { '0': [byId(79)], '1': [] } });
		playAction(G, '0', 0);
		const values = Object.values(G.action.revealUnusedVillainsUntil);
		expect(values.some((v) => v !== null)).toBe(true);
	});
});
