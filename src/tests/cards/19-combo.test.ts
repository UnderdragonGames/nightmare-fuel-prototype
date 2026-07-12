import { describe, it, expect } from 'vitest';
import { byId, makeState, playAction } from './cardTestUtils';

describe('#19 Combo', () => {
	it('choice grants either 2 extra placements or 2 extra action plays', () => {
		const results: string[] = [];
		for (const choiceIndex of [0, 1]) {
			const G = makeState({ hands: { '0': [byId(19)], '1': [] } });
			playAction(G, '0', 0, { choiceIndex });
			const placements = G.action.extraPlacements['0']?.count ?? 0;
			const actionPlays = G.action.extraActionPlays['0'] ?? 0;
			if (placements >= 2) results.push('placements');
			if (actionPlays >= 2) results.push('actionPlays');
		}
		expect(results.sort()).toEqual(['actionPlays', 'placements']);
	});
});
