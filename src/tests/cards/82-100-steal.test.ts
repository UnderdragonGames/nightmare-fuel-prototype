import { describe, it, expect } from 'vitest';
import { byId, filler, makeState, playAction } from './cardTestUtils';

describe('#82/#100 Steal', () => {
	for (const id of [82, 100]) {
		it(`#${id} takes 1 random card from the target player`, () => {
			const mark = filler(1, 940)[0]!;
			const G = makeState({ hands: { '0': [byId(id)], '1': [mark] } });
			playAction(G, '0', 0, { targetPlayerId: '1' });
			expect(G.players['1']!.hand.length).toBe(0);
			expect(G.players['0']!.hand.map((c) => c.id)).toContain(mark.id);
			expect(G.discard.map((c) => c.id)).toContain(id);
		});
	}
});
