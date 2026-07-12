import { describe, it, expect } from 'vitest';
import { byId, filler, makeState, playAction } from './cardTestUtils';

describe('#23 Debilitate', () => {
	it('every player discards 1 at random', () => {
		const G = makeState({ hands: { '0': [byId(23), ...filler(2, 960)], '1': filler(2, 970) } });
		playAction(G, '0', 0);
		expect(G.players['0']!.hand.length).toBe(1); // 2 fillers - 1 discarded
		expect(G.players['1']!.hand.length).toBe(1);
		expect(G.discard.length).toBe(3); // card 23 + one from each player
	});
});
