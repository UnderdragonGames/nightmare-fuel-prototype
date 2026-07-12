import { describe, it, expect } from 'vitest';
import { byId, makeState, playAction } from './cardTestUtils';

describe('#60 Monologue', () => {
	it('gives the played card to the target player and grants an extra play', () => {
		const G = makeState({ hands: { '0': [byId(60)], '1': [] } });
		playAction(G, '0', 0, { targetPlayerId: '1' });
		// The card itself moves to P1's hand instead of the discard
		expect(G.players['1']!.hand.map((c) => c.id)).toContain(60);
		expect(G.discard.map((c) => c.id)).not.toContain(60);
		// The extra play goes to the GIVER (tempo compensation for gifting a card)
		expect(G.action.extraPlays['0'] ?? 0).toBeGreaterThan(0);
	});
});
