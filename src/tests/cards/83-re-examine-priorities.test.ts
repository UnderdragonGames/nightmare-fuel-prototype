import { describe, it, expect } from 'vitest';
import { byId, makeState, playAction } from './cardTestUtils';

describe('#83 Re-examine Priorities', () => {
	it('reorders the player prefs as chosen', () => {
		const G = makeState({ hands: { '0': [byId(83)], '1': [] } });
		const order = { primary: 'V' as const, secondary: 'B' as const, tertiary: 'G' as const };
		playAction(G, '0', 0, { playerPrefs: order });
		expect(G.players['0']!.prefs).toEqual(order);
	});
});
