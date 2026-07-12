import { describe, it, expect } from 'vitest';
import { byId, filler, makeState, playAction } from './cardTestUtils';

describe('#43 Help Yourself Out', () => {
	it('moves a hex tile to an empty destination (hex mode)', () => {
		const G = makeState({
			mode: 'hex',
			hands: { '0': [byId(43)], '1': [] },
			board: { '1,0': { colors: ['R'], rotation: 0, dead: false } },
		});
		// Destination must satisfy hex placement rules (dirOnly): the origin's
		// SW edge is R, so an R tile may move to (-1,1).
		playAction(G, '0', 0, { moveFrom: { q: 1, r: 0 }, moveTo: { q: -1, r: 1 } });
		expect(G.board['1,0']?.colors ?? []).toEqual([]);
		expect(G.board['-1,1']?.colors).toEqual(['R']);
	});
});
