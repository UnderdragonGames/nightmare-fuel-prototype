import { describe, it, expect } from 'vitest';
import { byId, makeState, playAction } from './cardTestUtils';

describe('#111 This Prey is Mine', () => {
	it('replaces a lane color (path mode)', () => {
		const G = makeState({
			hands: { '0': [byId(111)], '1': [] },
			lanes: [{ from: { q: 1, r: 0 }, to: { q: 2, r: 0 }, color: 'B' }],
		});
		playAction(G, '0', 0, { moveFrom: { q: 1, r: 0 }, moveTo: { q: 2, r: 0 }, replaceColor: 'R' });
		expect(G.lanes[0]!.color).toBe('R');
	});
});
