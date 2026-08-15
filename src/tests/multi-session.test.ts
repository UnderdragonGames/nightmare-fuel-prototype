import { describe, it, expect, beforeEach } from 'vitest';
import { migrateUIStore, useUIStore, type NetworkSession } from '../ui/useUIStore';

const session = (matchID: string, seat = '0'): NetworkSession =>
	({ matchID, seat, credentials: `cred-${matchID}`, numPlayers: 2 }) as NetworkSession;

describe('ui-store migration v0 → v1', () => {
	it('seeds sessions from the legacy single network session', () => {
		const migrated = migrateUIStore({ network: session('AAAA11') }, 0) as { sessions: NetworkSession[] };
		expect(migrated.sessions).toEqual([session('AAAA11')]);
	});

	it('handles a legacy store with no network session', () => {
		const migrated = migrateUIStore({ network: null }, 0) as { sessions: NetworkSession[] };
		expect(migrated.sessions).toEqual([]);
	});

	it('leaves already-migrated state alone', () => {
		const state = { network: session('BBBB22'), sessions: [session('BBBB22'), session('CCCC33')] };
		expect(migrateUIStore(state, 1)).toBe(state);
	});
});

describe('multi-session actions', () => {
	beforeEach(() => {
		useUIStore.setState({ network: null, sessions: [] });
	});

	it('setNetwork upserts into the held list', () => {
		useUIStore.getState().setNetwork(session('AAAA11'));
		useUIStore.getState().setNetwork(session('BBBB22'));
		const { network, sessions } = useUIStore.getState();
		expect(network?.matchID).toBe('BBBB22');
		expect(sessions.map((s) => s.matchID)).toEqual(['BBBB22', 'AAAA11']);
	});

	it('re-joining the same match replaces, not duplicates', () => {
		useUIStore.getState().setNetwork(session('AAAA11', '0'));
		useUIStore.getState().setNetwork(session('AAAA11', '1'));
		const { sessions } = useUIStore.getState();
		expect(sessions).toHaveLength(1);
		expect(sessions[0]!.seat).toBe('1');
	});

	it('switchSession activates a held session without dropping others', () => {
		useUIStore.getState().setNetwork(session('AAAA11'));
		useUIStore.getState().setNetwork(session('BBBB22'));
		useUIStore.getState().switchSession('AAAA11');
		const { network, sessions } = useUIStore.getState();
		expect(network?.matchID).toBe('AAAA11');
		expect(sessions).toHaveLength(2);
	});

	it('switchSession ignores unknown match ids', () => {
		useUIStore.getState().setNetwork(session('AAAA11'));
		useUIStore.getState().switchSession('NOPE99');
		expect(useUIStore.getState().network?.matchID).toBe('AAAA11');
	});

	it('removeSession of the active match falls back to the next held game', () => {
		useUIStore.getState().setNetwork(session('AAAA11'));
		useUIStore.getState().setNetwork(session('BBBB22'));
		useUIStore.getState().removeSession('BBBB22');
		const { network, sessions } = useUIStore.getState();
		expect(network?.matchID).toBe('AAAA11');
		expect(sessions.map((s) => s.matchID)).toEqual(['AAAA11']);
	});

	it('removing the last session goes offline', () => {
		useUIStore.getState().setNetwork(session('AAAA11'));
		useUIStore.getState().removeSession('AAAA11');
		expect(useUIStore.getState().network).toBeNull();
		expect(useUIStore.getState().sessions).toEqual([]);
	});
});
