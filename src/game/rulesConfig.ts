import type { ActionCardsRule, Color, Co, ObjectiveScoringRules, PlacementRules, Rules } from './types';

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

// Env overrides for rules knobs. Read Vite's import.meta.env in the browser
// and process.env on the server (tsx/bun have no VITE_* injection), so both
// the Local() setup and the multiplayer server resolve the same rule.
const envValue = (name: string): string | undefined => {
	const fromVite = (import.meta as { env?: Record<string, string> }).env?.[name];
	const fromNode = typeof process !== 'undefined' ? process.env?.[name] : undefined;
	return fromVite ?? fromNode;
};

const envActionCardsRule = (): ActionCardsRule | null => {
	const value = envValue('VITE_ACTION_CARDS');
	return value === 'disabled' || value === 'one-per-turn' || value === 'unlimited' ? value : null;
};

// Boolean rules flag: "1"/"true"/"on" → true, "0"/"false"/"off" → false, unset → null.
const envFlag = (name: string): boolean | null => {
	const value = envValue(name);
	if (value === undefined || value === '') return null;
	return value === '1' || value === 'true' || value === 'on';
};

// Integer rules knob: unset/invalid → null.
const envInt = (name: string): number | null => {
	const value = envValue(name);
	if (value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isInteger(n) ? n : null;
};

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
	NO_INTERSECT: false,
	NO_BUILD_FROM_RIM: false,
	// Special placement rules (disabled for base hex mode)
	TWO_TO_ROTATE: false,
	OVERWRITE: 'none',
	CONSOLIDATION: false,
	CONSOLIDATION_END: 0,
	CONSOLIDATE_TO_RING: 1,
	STARTING_RING: 0,
	COST_TO_BLOCK: 2,
	COST_TO_ROTATE: 1,
	// Total cards a consolidation conversion costs (the played card counts;
	// 2 = discard one extra card). Makes consolidating dearer than building
	// new paths (2026-08: "it's cheaper to make more paths than consolidate").
	// VITE_CONSOLIDATION_COST tunes; 1 restores the old free conversion.
	COST_TO_CONSOLIDATE: envInt('VITE_CONSOLIDATION_COST') ?? 2,
};

const HEX_SCORING: ObjectiveScoringRules = {
	BY_RIM_TOUCH: true,
	ORIGIN_TO_ORIGIN: true,
	SHORTEST_PATH: true,
	// Primary / secondary / tertiary weights (legacy behaviour)
	COLOR_POINTS: [3, 2, 1],
	// Completed rim-to-center path (the consolidation goal) adds this flat
	// bonus to that color's raw count before pref weighting (2026-08 playtest:
	// "I like the idea of extra points. Needs to be codified").
	// Tune per-deploy with VITE_CONSOLIDATION_BONUS; 0 disables.
	CONSOLIDATION_BONUS: envInt('VITE_CONSOLIDATION_BONUS') ?? 5,
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
	// If true, shuffle the seat order once per new game (who goes first).
	// Flip per-deploy with VITE_RANDOM_START_ORDER=1|0; tests pin it off.
	RANDOM_START_ORDER: envFlag('VITE_RANDOM_START_ORDER') ?? true,
	// Maps each color to its directional offset vector in hex coordinates (derived from EDGE_COLORS)
	COLOR_TO_DIR: buildColorToDir(BASE_EDGE_COLORS),
	// Number of cards each player holds in hand
	HAND_SIZE: 3,
	// Extra copies of the draw-flavored action cards mixed into the deck
	// (2026-08 decision: pace the deck-exhaust ending through draw CARDS, not
	// an automatic per-turn bonus draw). VITE_EXTRA_DRAW_COPIES tunes it.
	EXTRA_DRAW_CARD_COPIES: envInt('VITE_EXTRA_DRAW_COPIES') ?? 2,
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
	// Action card play rule (env: VITE_ACTION_CARDS=disabled|one-per-turn|unlimited)
	ACTION_CARDS: envActionCardsRule() ?? 'one-per-turn',
	// Scoring configuration
	SCORING: HEX_SCORING,
	// Placement configuration
	PLACEMENT: HEX_PLACEMENT,
	// UI display settings
	UI: { HEX_SIZE: 18, SHOW_AXES: false },
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
	RADIUS: 5,
	MODE: 'path',
	PLACEMENT: {
		...HEX_PLACEMENT,
		// Path mode: no edge-color matching, just connectivity + fork support
		OUTWARD_RULE: 'none',
		// In path mode, allow up to 3 instances per path segment
		MAX_LANES_PER_PATH: 3,
		// Fork support: lanes determine branching capacity (single=0, double=1,
		// triple=2 branches per node). Off by default after playtests found
		// forking too hard; flip per-deploy with VITE_FORK_SUPPORT=1|0.
		FORK_SUPPORT: envFlag('VITE_FORK_SUPPORT') ?? false,
		// Paths cannot intersect: all incoming edges at a tile must come from same source
		NO_INTERSECT: true,
		// Tiles at rim cannot have outgoing edges (paths terminate at rim)
		NO_BUILD_FROM_RIM: true,
		// Consolidation: once a color reaches the rim, it may CONVERT existing lanes along its path back toward center (recolor in place)
		CONSOLIDATION: true,
		// The game ends when this many colors have consolidated rim-to-center
		// paths (0 disables — deck exhaust becomes the only ending). Briefly
		// defaulted to 0 over "trigger advantage" concerns (2026-08); restored
		// to 3 ("Let's keep consolidation at 3 actually") with the advantage
		// addressed by COST_TO_CONSOLIDATE instead. VITE_CONSOLIDATION_END tunes.
		CONSOLIDATION_END: envInt('VITE_CONSOLIDATION_END') ?? 3,
		// Consolidation can reach center ring (ring 0) for game-ending paths
		CONSOLIDATE_TO_RING: 0,
		// New branches must start from ring 1 or further out (not from center ring 0)
		STARTING_RING: 1,
	},
	SCORING: {
		...HEX_SCORING,
		// Default path-mode scoring is lane-symmetric; tweak after playtests.
		COLOR_POINTS: [3, 2, 1],
	},
};

export const MODE_RULESETS: { hex: Rules; path: Rules } = {
	hex: HEX_RULES,
	path: PATH_RULES,
};

// Active ruleset for the current build; switch between hex and path mode here
export const RULES: Rules = MODE_RULESETS.path;
