import type { Color } from './types';

export type NightmareAbility = {
	name: string;
	timing: string;
	uses: number;
	effect: string;
	notes?: string;
};

export type Nightmare = {
	name: string;
	evilPlan: string;
	classes: string[];
	priorities: { primary: Color; secondary: Color; tertiary: Color };
	ability: NightmareAbility;
};

export const NIGHTMARES: Nightmare[] = [
	{
		name: 'Alien',
		evilPlan: 'Abduct',
		classes: ['magical', 'technological'],
		priorities: { primary: 'B', secondary: 'G', tertiary: 'V' },
		ability: {
			name: 'Gravity Shift',
			timing: 'during your turn',
			uses: 1,
			effect: 'Randomize all color directions for the round.',
		},
	},
	{
		name: 'Blob',
		evilPlan: 'Absorb',
		classes: ['monster', 'tough'],
		priorities: { primary: 'B', secondary: 'R', tertiary: 'Y' },
		ability: {
			name: 'Engulf',
			timing: 'during your turn',
			uses: 2,
			effect: 'Fill the treasure pile to its maximum by drawing from the deck.',
		},
	},
	{
		name: 'Cultist',
		evilPlan: 'Devour',
		classes: ['charismatic', 'magical'],
		priorities: { primary: 'V', secondary: 'G', tertiary: 'O' },
		ability: {
			name: 'Forbidden Lore',
			timing: 'during your turn',
			uses: 2,
			effect: 'Draw 3 cards.',
		},
	},
	{
		name: 'Demon',
		evilPlan: 'Torment',
		classes: ['charismatic', 'magical', 'monster'],
		priorities: { primary: 'Y', secondary: 'O', tertiary: 'G' },
		ability: {
			name: 'Rend the Road',
			timing: 'during your turn',
			uses: 1,
			effect: 'Destroy a path (remove all connected lanes of a chosen path).',
		},
	},
	{
		name: 'Dragon',
		evilPlan: 'Claim',
		classes: ['magical', 'monster', 'tough'],
		priorities: { primary: 'R', secondary: 'Y', tertiary: 'B' },
		ability: {
			name: 'Forked Flame',
			timing: 'during your turn',
			uses: 2,
			effect: 'Add a branch to one of your existing paths.',
		},
	},
	{
		name: 'Ghost',
		evilPlan: 'Haunt',
		classes: ['magical', 'monster', 'tough'],
		priorities: { primary: 'Y', secondary: 'R', tertiary: 'B' },
		ability: {
			name: 'Erase Trail',
			timing: 'during your turn',
			uses: 1,
			effect: 'Remove a single path from the board.',
		},
	},
	{
		name: 'Mutant',
		evilPlan: 'Alter',
		classes: ['charismatic', 'monster', 'technological', 'tough'],
		priorities: { primary: 'G', secondary: 'B', tertiary: 'Y' },
		ability: {
			name: 'Mutate Route',
			timing: 'during your turn',
			uses: 2,
			effect: 'Change the color of a path you control to another color.',
		},
	},
	{
		name: 'Robot',
		evilPlan: 'Assimilate',
		classes: ['technological', 'tough'],
		priorities: { primary: 'V', secondary: 'B', tertiary: 'R' },
		ability: {
			name: 'Reorder Objectives',
			timing: 'during your turn',
			uses: 2,
			effect: 'Swap your secondary and tertiary priorities for the round.',
		},
	},
	{
		name: 'Vampire',
		evilPlan: 'Dominate',
		classes: ['charismatic', 'magical', 'tough'],
		priorities: { primary: 'O', secondary: 'R', tertiary: 'Y' },
		ability: {
			name: 'Blood Tithe',
			timing: 'during your turn',
			uses: 2,
			effect: 'Steal 1 card from a targeted player.',
		},
	},
	{
		name: 'Werewolf',
		evilPlan: 'Infect',
		classes: ['monster', 'tough'],
		priorities: { primary: 'G', secondary: 'V', tertiary: 'O' },
		ability: {
			name: 'Hunt Path',
			timing: 'during your turn',
			uses: 2,
			effect: 'Add a new path segment from a node you control.',
		},
	},
	{
		name: 'Witch',
		evilPlan: 'Enthrall',
		classes: ['charismatic', 'magical'],
		priorities: { primary: 'O', secondary: 'G', tertiary: 'V' },
		ability: {
			name: 'Hex the Node',
			timing: 'during your turn',
			uses: 1,
			effect: 'Destroy a single node (remove its lanes or tile).',
		},
	},
	{
		name: 'Zombie',
		evilPlan: 'Zombify',
		classes: ['monster', 'tough'],
		priorities: { primary: 'R', secondary: 'V', tertiary: 'O' },
		ability: {
			name: 'Horde Hunger',
			timing: 'passive',
			uses: 1,
			effect: 'Your hand size is increased by 1 for the rest of the game.',
			notes: 'Apply once at game start or when this ability is first used.',
		},
	},
];
