import type { Color, Co, Rules } from './types';

const DIR: Record<Color, Co> = {
	R: { q: +1, r: -1 },
	O: { q: +1, r: 0 },
	Y: { q: 0, r: -1 },
	G: { q: -1, r: 0 },
	B: { q: -1, r: +1 },
	V: { q: 0, r: +1 },
};

export const RULES: Rules = {
	RADIUS: 7,
	COLORS: ['R', 'O', 'Y', 'G', 'B', 'V'],
	COLOR_TO_DIR: DIR,
	HAND_SIZE: 3,
	TREASURE_MAX: 4,
	DECK_COUNTS: { twoColor: 36, threeColor: 18, fourColor: 6 },
	ONE_COLOR_PER_CARD_PLAY: true,
	OUTWARD_RULE: 'dirOrOutward',
	CONNECTIVITY_SCOPE: 'global',
	CENTER_SEED: 'V',
	END_ON_DECK_EXHAUST: true,
	EQUAL_TURNS: true,
	SCORE_COMPONENTS_BY_RIM_TOUCH: true,
	UI: { HEX_SIZE: 18, SHOW_AXES: false, SHOW_RING: false },
	MULTI_CAP_FIRST_RINGS: 1,
};


