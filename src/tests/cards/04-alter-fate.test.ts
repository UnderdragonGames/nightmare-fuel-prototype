import { describe, it, expect } from 'vitest';
import { byId, makeState, playAction } from './cardTestUtils';

describe('#4 Alter Fate', () => {
	it('reveals 5, keeps the picked one, discards the rest', () => {
		const G = makeState({ hands: { '0': [byId(4)], '1': [] } });
		const deckBefore = G.secret.deck.length;
		const topCard = G.secret.deck[G.secret.deck.length - 1]!; // revealed first
		playAction(G, '0', 0, { revealedPickIndex: 0, draftPicks: { '0': 0 } });
		expect(G.secret.deck.length).toBe(deckBefore - 5);
		expect(G.players['0']!.hand.map((c) => c.id)).toContain(topCard.id);
		expect(G.players['0']!.hand.length).toBe(1);
		// 4 unpicked revealed cards + the played card itself
		expect(G.discard.length).toBe(5);
		expect(G.action.revealed).toEqual([]);
	});
});
