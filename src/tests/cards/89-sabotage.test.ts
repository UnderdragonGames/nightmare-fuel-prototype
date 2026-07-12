import { describe, it, expect } from 'vitest';
import { byId, makeState, playAction } from './cardTestUtils';
import { emitEvent } from '../../game/hooks';

describe('#89 Sabotage', () => {
	it("skips the target player's next turn (onTurnStart blocked, one-shot)", () => {
		const G = makeState({ hands: { '0': [byId(89)], '1': [] } });
		playAction(G, '0', 0, { targetPlayerId: '1' });
		expect(G.action.hooks.length).toBeGreaterThan(0);
		const first = emitEvent(G, { type: 'onTurnStart', playerId: '1' });
		expect(first.blocked).toBe(true);
		// One-shot: the following turn proceeds normally
		const second = emitEvent(G, { type: 'onTurnStart', playerId: '1' });
		expect(second.blocked).toBe(false);
	});
});
