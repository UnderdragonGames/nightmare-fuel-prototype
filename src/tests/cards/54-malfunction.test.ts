import { describe, it, expect } from 'vitest';
import { byId, makeState, playAction } from './cardTestUtils';

describe('#54 Malfunction', () => {
	it('replaces the target hex with a dead tile', () => {
		const G = makeState({ hands: { '0': [byId(54)], '1': [] }, board: { '1,0': { colors: ['R'], rotation: 0, dead: false } } });
		playAction(G, '0', 0, { coord: { q: 1, r: 0 } });
		expect(G.board['1,0']?.dead).toBe(true);
		expect(G.board['1,0']?.colors).toEqual([]);
	});
});
