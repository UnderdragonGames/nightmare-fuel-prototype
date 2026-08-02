import { describe, it, expect } from 'vitest';
import { actionEffectsInvalidReason } from '../../game/effects';
import { resolveCardEffects } from '../../game/cardActions';
import { byId, makeState, playAction } from './cardTestUtils';

// Default test prefs are R/O/Y (see testHelpers.buildPlayerState).

describe('#83 Re-examine Priorities', () => {
	it('reorders the player prefs as chosen (permutation of own colors)', () => {
		const G = makeState({ hands: { '0': [byId(83)], '1': [] } });
		const order = { primary: 'Y' as const, secondary: 'R' as const, tertiary: 'O' as const };
		playAction(G, '0', 0, { playerPrefs: order });
		expect(G.players['0']!.prefs).toEqual(order);
	});

	it('rejects colors the player does not have', () => {
		const G = makeState({ hands: { '0': [byId(83)], '1': [] } });
		const order = { primary: 'V' as const, secondary: 'B' as const, tertiary: 'G' as const };
		const effects = resolveCardEffects(byId(83), {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			mode: 'path',
			playerPrefs: order,
		});
		expect(actionEffectsInvalidReason(G, effects)).not.toBeNull();
		// Defense in depth: even applied directly, the effect refuses.
		playAction(G, '0', 0, { playerPrefs: order });
		expect(G.players['0']!.prefs).toEqual({ primary: 'R', secondary: 'O', tertiary: 'Y' });
	});

	it('rejects duplicating one of the player’s own colors', () => {
		const G = makeState({ hands: { '0': [byId(83)], '1': [] } });
		const order = { primary: 'R' as const, secondary: 'R' as const, tertiary: 'Y' as const };
		const effects = resolveCardEffects(byId(83), {
			currentPlayerId: '0',
			playerOrder: ['0', '1'],
			mode: 'path',
			playerPrefs: order,
		});
		expect(actionEffectsInvalidReason(G, effects)).not.toBeNull();
		playAction(G, '0', 0, { playerPrefs: order });
		expect(G.players['0']!.prefs).toEqual({ primary: 'R', secondary: 'O', tertiary: 'Y' });
	});
});
