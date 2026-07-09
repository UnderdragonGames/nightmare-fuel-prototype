import type { Card, PlayerID, PlayerState } from '../game/types';

/** Build a minimal PlayerState for testing. Only `hand` is required; rest defaults to zero values. */
export const buildPlayerState = (
	hand: Card[],
	overrides?: Partial<Omit<PlayerState, 'hand'>>,
): PlayerState => ({
	hand,
	prefs: overrides?.prefs ?? { primary: 'R', secondary: 'O', tertiary: 'Y' },
	nightmare: overrides?.nightmare ?? '',
	nightmareState: overrides?.nightmareState ?? { abilityUsesRemaining: 0, handSizeBonus: 0 },
	stashBonus: overrides?.stashBonus ?? 0,
	actionPlaysThisTurn: overrides?.actionPlaysThisTurn ?? 0,
});

/** Build a players record from a map of playerID → hand (convenience for tests that only set hands). */
export const buildPlayers = (
	hands: Record<PlayerID, Card[]>,
	overrides?: Partial<Omit<PlayerState, 'hand'>>,
): Record<PlayerID, PlayerState> => {
	const players: Record<PlayerID, PlayerState> = {};
	for (const [pid, hand] of Object.entries(hands)) {
		players[pid] = buildPlayerState(hand, overrides);
	}
	return players;
};
