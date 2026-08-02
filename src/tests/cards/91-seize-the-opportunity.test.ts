import { describe, it, expect } from 'vitest';
import { actionEffectsInvalidReason } from '../../game/effects';
import { resolveCardEffects } from '../../game/cardActions';
import { neighbors } from '../../game/helpers';
import type { Co } from '../../game/types';
import { byId, makeState, playAction } from './cardTestUtils';

describe('#91 Seize the Opportunity', () => {
	it('path mode: places a free lane of the last-placed color (no counter grant)', () => {
		const G = makeState({ hands: { '0': [byId(91)], '1': [] } });
		G.action.lastPlacedColor = 'V';
		const dir = G.rules.COLOR_TO_DIR.V;
		// Find a legal starting-ring placement under the test ruleset.
		let picked: { source: Co; dest: Co } | null = null;
		for (const source of neighbors({ q: 0, r: 0 })) {
			const dest = { q: source.q + dir.q, r: source.r + dir.r };
			const probe = resolveCardEffects(byId(91), {
				currentPlayerId: '0',
				playerOrder: ['0', '1'],
				mode: 'path',
				lastPlacedColor: 'V',
				moveFrom: source,
				moveTo: dest,
			});
			if (actionEffectsInvalidReason(G, probe) === null) {
				picked = { source, dest };
				break;
			}
		}
		expect(picked).not.toBeNull();
		playAction(G, '0', 0, { lastPlacedColor: 'V', moveFrom: picked!.source, moveTo: picked!.dest });
		expect(G.lanes).toHaveLength(1);
		expect(G.lanes[0]!.color).toBe('V');
		// The legacy counter (consumed by nothing in path mode) must stay at 0.
		expect(G.action.extraPlacements['0']!.count).toBe(0);
	});

	it('hex mode: grants an extra placement of the last-placed color', () => {
		const G = makeState({ mode: 'hex', hands: { '0': [byId(91)], '1': [] } });
		G.action.lastPlacedColor = 'V';
		playAction(G, '0', 0, { lastPlacedColor: 'V' });
		const extra = G.action.extraPlacements['0'];
		expect(extra?.count ?? 0).toBeGreaterThan(0);
		expect(extra?.color).toBe('V');
	});
});
