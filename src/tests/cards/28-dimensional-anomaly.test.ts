import { describe, it, expect } from 'vitest';
import { byId, filler, makeState, playAction } from './cardTestUtils';

describe('#28 Dimensional Anomaly', () => {
	it('rotates hands between players', () => {
		const a = filler(1, 980)[0]!;
		const b = filler(1, 990)[0]!;
		const G = makeState({ hands: { '0': [byId(28), a], '1': [b] } });
		playAction(G, '0', 0);
		// After playing, P0's remaining hand [a] and P1's [b] rotate
		expect(G.players['0']!.hand.map((c) => c.id)).toEqual([b.id]);
		expect(G.players['1']!.hand.map((c) => c.id)).toEqual([a.id]);
	});
});
