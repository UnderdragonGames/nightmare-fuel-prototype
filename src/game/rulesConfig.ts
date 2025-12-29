import type { Color, Co, ObjectiveScoringRules, PlacementRules, Rules } from './types';

// Canonical hex edge directions going clockwise from North (edges 0-5).
export const BASE_DIRECTIONS: readonly Co[] = [
	{ q: 0, r: -1 }, // N (edge 0)
	{ q: +1, r: -1 }, // NE (edge 1)
	{ q: +1, r: 0 }, // E (edge 2)
	{ q: 0, r: +1 }, // SE (edge 3)
	{ q: -1, r: +1 }, // SW (edge 4)
	{ q: -1, r: 0 }, // NW (edge 5)
];

// Default edge colors going clockwise from North (edges 0-5): YGBVRO
export const BASE_EDGE_COLORS: readonly Color[] = ['Y', 'G', 'B', 'V', 'R', 'O'];

export const buildColorToDir = (edgeColors: readonly Color[]): Record<Color, Co> => {
	if (edgeColors.length !== 6) {
		throw new Error(`EDGE_COLORS must be length 6, got ${edgeColors.length}`);
	}
	const uniq = new Set(edgeColors);
	if (uniq.size !== 6) {
		throw new Error(`EDGE_COLORS must contain 6 unique colors, got ${edgeColors.join('')}`);
	}
	const out = {} as Record<Color, Co>;
	for (let i = 0; i < 6; i += 1) {
		const color = edgeColors[i]!;
		out[color] = BASE_DIRECTIONS[i]!;
	}
	return out;
};

const HEX_PLACEMENT: PlacementRules = {
	// Placement rule: 'none' (no restriction), 'outwardOnly' (must be outward from neighbor),
	// 'dirOnly' (must follow color direction), 'dirOrOutward' (either direction or outward)
	OUTWARD_RULE: 'dirOnly',
	// Discard-to-rotate rule: 'any' (any card), 'match-color' (card must contain a tile color), false (disabled)
	DISCARD_TO_ROTATE: 'any',
	// Number of rings (starting from ring 1) that allow higher capacity instead of 1
	MULTI_CAP_FIRST_RINGS: 2,
	// Hard cap on lanes per coord / path (hex mode effectively uses up to 2)
	MAX_LANES_PER_PATH: 2,
	// Path-mode only (ignored in hex mode)
	FORK_SUPPORT: false,
	// Special placement rules (disabled for base hex mode)
	TWO_TO_ROTATE: false,
	OVERWRITE: 'none',
};

const HEX_SCORING: ObjectiveScoringRules = {
	BY_RIM_TOUCH: true,
	ORIGIN_TO_ORIGIN: true,
	SHORTEST_PATH: true,
	// Primary / secondary / tertiary weights (legacy behaviour)
	COLOR_POINTS: [3, 2, 1],
};

export const HEX_RULES: Rules = {
	MODE: 'hex',
	// Maximum distance from center (ring count) - board is a hex of radius N
	RADIUS: 6,
	// Available colors in the game
	COLORS: ['R', 'O', 'Y', 'G', 'B', 'V'],
	// Edge colors going clockwise from North (edges 0-5). Also defines tile default orientation.
	EDGE_COLORS: BASE_EDGE_COLORS,
	// If true, shuffle EDGE_COLORS once per new game (and derive COLOR_TO_DIR from that shuffled order).
	RANDOM_CARDINAL_DIRECTIONS: true,
	// Maps each color to its directional offset vector in hex coordinates (derived from EDGE_COLORS)
	COLOR_TO_DIR: buildColorToDir(BASE_EDGE_COLORS),
	// Number of cards each player holds in hand
	HAND_SIZE: 3,
	// Maximum number of cards that can be stashed in the treasure pile
	TREASURE_MAX: 4,
	// Target total number of cards in the deck
	DECK_SIZE: 100,
	// Counts of each card type used to build deck (proportionally scaled to DECK_SIZE)
	DECK_COUNTS: { twoColor: 36, threeColor: 18, fourColor: 6 },
	// If true, when playing a multi-color card, player must pick exactly one color to place
	ONE_COLOR_PER_CARD_PLAY: true,
	// Initial color placed at center (0,0); null means center is wild/unplaceable
	CENTER_SEED: null,
	// If true, game ends when deck is exhausted (after all players have equal turns if EQUAL_TURNS is true)
	END_ON_DECK_EXHAUST: true,
	// If true, game ends only after all players have had equal turns since deck exhaustion
	EQUAL_TURNS: true,
	// Scoring configuration
	SCORING: HEX_SCORING,
	// Placement configuration
	PLACEMENT: HEX_PLACEMENT,
	// UI display settings
	UI: { HEX_SIZE: 18, SHOW_AXES: false, SHOW_RING: false },
	// Maximum number of players allowed in the game
	MAX_PLAYERS: 6,
	// Origin rule: 'center' (single origin at 0,0), 'random' (random origins only, excluding center), or 'random-and-center' (center + random origins)
	ORIGIN: 'center',
	// Number of origins when ORIGIN='random' or 'random-and-center'
	ORIGIN_COUNT: 7,
	// Origin direction: 'aligned' (evenly spaced in cardinal directions) or 'random' (completely random positions) - only used when ORIGIN includes 'random'
	ORIGIN_DIRECTION: 'random',
	// Minimum distance between origins and each other or the edge (0 = no restriction, 1 = at least 1 space between)
	MIN_ORIGIN_DISTANCE: 2,
};

// Path mode rules - dot-to-dot placement
export const PATH_RULES: Rules = {
	...HEX_RULES,
  RADIUS: 4,
	MODE: 'path',
	PLACEMENT: {
		...HEX_PLACEMENT,
		// In path mode, allow up to 3 lanes per path; keep other defaults identical for now.
		MAX_LANES_PER_PATH: 3,
		// New path-mode rule option:
		// require forks to be supported by parallel same-color lanes back to center.
		FORK_SUPPORT: true,
	},
	SCORING: {
		...HEX_SCORING,
		// Default path-mode scoring is lane-symmetric; tweak after playtests.
		COLOR_POINTS: [1, 1, 1],
	},
};

export const MODE_RULESETS: { hex: Rules; path: Rules } = {
	hex: HEX_RULES,
	path: PATH_RULES,
};

// Active ruleset for the current build; switch between hex and path mode here
export const RULES: Rules = MODE_RULESETS.path;
