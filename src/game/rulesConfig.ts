import type { Color, Co, Rules, ScoringRules } from './types';

// Edge colors going clockwise from North: YGBVRO
// Each color maps to the hex coordinate offset in that direction
const DIR: Record<Color, Co> = {
	Y: { q: 0, r: -1 },  // N (edge 0)
	G: { q: +1, r: -1 }, // NE (edge 1)
	B: { q: +1, r: 0 },  // E (edge 2)
	V: { q: 0, r: +1 },  // SE (edge 3)
	R: { q: -1, r: +1 }, // SW (edge 4)
	O: { q: -1, r: 0 },  // NW (edge 5)
};

export const RULES: Rules = {
	// Maximum distance from center (ring count) - board is a hex of radius N
	RADIUS: 6,
	// Available colors in the game
	COLORS: ['R', 'O', 'Y', 'G', 'B', 'V'],
	// Maps each color to its directional offset vector in hex coordinates
	COLOR_TO_DIR: DIR,
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
	// Placement rule: 'none' (no restriction), 'outwardOnly' (must be outward from neighbor), 'dirOnly' (must follow color direction), 'dirOrOutward' (either direction or outward)
	OUTWARD_RULE: 'dirOnly',
	// Connectivity requirement: 'global' (must connect to existing pieces), 'own' (must connect to own pieces)
	CONNECTIVITY_SCOPE: 'global',
	// Initial color placed at center (0,0); null means center is wild/unplaceable
	CENTER_SEED: null,
	// If true, game ends when deck is exhausted (after all players have equal turns if EQUAL_TURNS is true)
	END_ON_DECK_EXHAUST: true,
	// If true, game ends only after all players have had equal turns since deck exhaustion
	EQUAL_TURNS: true,
	// Scoring configuration
	SCORING: {
		BY_RIM_TOUCH: true, // If true, scoring components require both center connectivity and rim touch for intersections
		ORIGIN_TO_ORIGIN: true, // If true, score points for tiles that connect multiple origins (in addition to origin-to-rim scoring)
		SHORTEST_PATH: true, // If true, only count tiles on shortest paths between entities (origins to rim, origins to origins)
	} satisfies ScoringRules,
	// UI display settings
	UI: { HEX_SIZE: 18, SHOW_AXES: false, SHOW_RING: false },
	// Number of rings (starting from ring 1) that allow capacity 2 per hex instead of 1
	MULTI_CAP_FIRST_RINGS: 2,
	// Maximum number of players allowed in the game
	MAX_PLAYERS: 6,
	// Discard a card to rotate a tile: true (any rotation), 'non-backwards' (only forward rotations), false (disabled)
	DISCARD_TO_ROTATE: true,
	// Origin rule: 'center' (single origin at 0,0), 'random' (random origins only, excluding center), or 'random-and-center' (center + random origins)
	ORIGIN: 'center',
	// Number of origins when ORIGIN='random' or 'random-and-center'
	ORIGIN_COUNT: 7,
	// Origin direction: 'aligned' (evenly spaced in cardinal directions) or 'random' (completely random positions) - only used when ORIGIN includes 'random'
	ORIGIN_DIRECTION: 'random',
	// Minimum distance between origins and each other or the edge (0 = no restriction, 1 = at least 1 space between)
	MIN_ORIGIN_DISTANCE: 2,
};


