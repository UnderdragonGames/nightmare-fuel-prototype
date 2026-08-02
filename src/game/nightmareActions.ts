import type { NightmareAction } from './types';
import type { Nightmare } from './nightmares';

const drawCurrent = (count: number): NightmareAction => ({ type: 'drawCards', count, target: 'current' });
const randomStealCard = (count: number): NightmareAction => ({ type: 'randomStealCard', count });

export const NIGHTMARE_ACTIONS_BY_NAME: Record<string, NightmareAction[]> = {
	Alien: [{ type: 'randomizeColorDirections' }],
	Blob: [{ type: 'fillTreasureToMax' }],
	Cultist: [drawCurrent(3)],
	Demon: [{ type: 'destroyPath' }],
	// "Add a branch/segment": a real lane placed without spending a card
	// (grantExtraPlacements was a no-op — placements are unlimited per turn).
	Dragon: [{ type: 'placeFreeLane' }],
	Ghost: [{ type: 'removeLane' }],
	Mutant: [{ type: 'changeLaneColor' }],
	Robot: [{ type: 'swapPrefsSecondaryTertiary' }],
	Vampire: [randomStealCard(1)],
	Werewolf: [{ type: 'placeFreeLane' }],
	Witch: [{ type: 'destroyNode' }],
	Zombie: [{ type: 'increaseHandSize', amount: 1 }],
};

export const resolveNightmareActions = (nightmare: Nightmare): NightmareAction[] => {
	return NIGHTMARE_ACTIONS_BY_NAME[nightmare.name] ?? [];
};
