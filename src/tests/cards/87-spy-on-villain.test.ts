import { describe, it, expect } from 'vitest';
import { byId, filler, makeState, playAction } from './cardTestUtils';

describe('#87 Spy on Villain', () => {
	it('is UI-only: resolves to no effects and discards cleanly', () => {
		const G = makeState({ hands: { '0': [byId(87)], '1': [] } });
		playAction(G, '0', 0, { targetPlayerId: '1' });
		expect(G.players['0']!.hand.length).toBe(0);
		expect(G.discard.map((c) => c.id)).toContain(87);
	});
});
