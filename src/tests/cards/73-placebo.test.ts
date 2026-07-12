import { describe, it, expect } from 'vitest';
import { byId, makeState, playAction } from './cardTestUtils';

describe('#73 Placebo', () => {
	it('replaces the target hex with a dead tile (same as Malfunction)', () => {
		const G = makeState({ hands: { '0': [byId(73)], '1': [] }, board: { '1,0': { colors: ['B'], rotation: 0, dead: false } } });
		playAction(G, '0', 0, { coord: { q: 1, r: 0 } });
		expect(G.board['1,0']?.dead).toBe(true);
	});
});
