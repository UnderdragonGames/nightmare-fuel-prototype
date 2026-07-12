import { describe, it, expect } from 'vitest';
import { byId, makeState, playAction } from './cardTestUtils';

describe('#2 Allow a Brief Reprieve', () => {
	it('every player draws 1', () => {
		const G = makeState({ hands: { '0': [byId(2)], '1': [] } });
		const deckBefore = G.secret.deck.length;
		playAction(G, '0', 0);
		expect(G.players['0']!.hand.length).toBe(1); // played the card, drew 1
		expect(G.players['1']!.hand.length).toBe(1);
		expect(G.secret.deck.length).toBe(deckBefore - 2);
		expect(G.discard.map((c) => c.id)).toContain(2);
	});
});
