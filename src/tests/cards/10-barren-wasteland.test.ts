import { describe, it, expect } from 'vitest';
import { byId, filler, makeState, playAction } from './cardTestUtils';
import { drawOne } from '../../game/effects';

describe('#10 Barren Wasteland', () => {
	it('goes face-up on the draw pile and blocks draws until all hands are empty', () => {
		const G = makeState({ hands: { '0': [byId(10)], '1': [filler(1, 950)[0]!] } });
		playAction(G, '0', 0);
		expect(G.action.faceUpDrawPile.map((c) => c.id)).toContain(10);
		expect(G.action.hooks.length).toBeGreaterThan(0);
		// P1 still holds a card → draws are blocked
		expect(drawOne(G, '0')).toBeFalsy();
		// Empty every hand → block resolves, draws work again
		G.players['1']!.hand.length = 0;
		expect(drawOne(G, '0')).toBeTruthy();
	});
});
