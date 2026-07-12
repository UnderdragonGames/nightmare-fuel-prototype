import { describe, it, expect } from 'vitest';
import { byId, makeState, playAction } from './cardTestUtils';

describe('#91 Seize the Opportunity', () => {
	it('grants an extra placement of the last-placed color', () => {
		const G = makeState({ hands: { '0': [byId(91)], '1': [] } });
		G.action.lastPlacedColor = 'V';
		playAction(G, '0', 0, { lastPlacedColor: 'V' });
		const extra = G.action.extraPlacements['0'];
		expect(extra?.count ?? 0).toBeGreaterThan(0);
		expect(extra?.color).toBe('V');
	});
});
