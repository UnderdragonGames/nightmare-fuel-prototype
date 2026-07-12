import { describe, it, expect } from 'vitest';
import { byId, filler, makeState, playAction } from './cardTestUtils';

describe('#32 Embrace Chaos', () => {
	it('everyone discards their hand and draws 3', () => {
		const G = makeState({ hands: { '0': [byId(32), ...filler(2, 960)], '1': filler(1, 970) } });
		playAction(G, '0', 0);
		expect(G.players['0']!.hand.length).toBe(3);
		expect(G.players['1']!.hand.length).toBe(3);
		// discard: card 32 + P0's 2 fillers + P1's 1 filler
		expect(G.discard.length).toBe(4);
	});
});
