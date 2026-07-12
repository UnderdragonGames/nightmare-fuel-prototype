import { describe, it, expect } from 'vitest';
import { byId, makeState } from './cardTestUtils';
import { buildDeck, DIGITALLY_EXCLUDED_CARD_IDS } from '../../game/deck';
import { resolveCardEffects } from '../../game/cardActions';

// 48 Ingenuity, 65 New Agenda (stat system), 86 Restrict, 90 Seal Power
// (stat/synergy triggers): mechanics don't exist digitally — excluded from deck.
describe('culled cards (48, 65, 86, 90)', () => {
	it('are excluded from the digital deck', () => {
		const deck = buildDeck(makeState().rules, () => 0.5);
		for (const id of [48, 65, 86, 90]) {
			expect(DIGITALLY_EXCLUDED_CARD_IDS.has(id)).toBe(true);
			expect(deck.some((c) => c.id === id)).toBe(false);
		}
	});

	it('stat cards (48, 65) still fail resolution — the mechanic is unimplemented', () => {
		for (const id of [48, 65]) {
			expect(() => resolveCardEffects(byId(id), {
				currentPlayerId: '0', playerOrder: ['0', '1'], mode: 'path',
			})).toThrow();
		}
	});
});
