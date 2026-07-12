import { describe, it, expect } from 'vitest';
import { byId, filler, makeState, playAction } from './cardTestUtils';

describe('#8 Armed to the Teeth', () => {
	it('draws 5 cards', () => {
		const G = makeState({ hands: { '0': [byId(8)], '1': [] } });
		playAction(G, '0', 0);
		expect(G.players['0']!.hand.length).toBe(5);
		expect(G.discard.map((c) => c.id)).toContain(8);
	});
});
