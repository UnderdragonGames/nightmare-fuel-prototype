import type { PlayerID } from 'boardgame.io';

export type Color = 'R' | 'O' | 'Y' | 'G' | 'B' | 'V';

export type Card = { colors: Color[] };

export type Co = { q: number; r: number };

export type PlayerPrefs = { primary: Color; secondary: Color; tertiary: Color };

export type HexTile = {
	colors: Color[];
	rotation: number; // 0-5, number of 60-degree clockwise rotations from default orientation
};

export type GState = {
	radius: number;
	board: Record<string, HexTile>;
	deck: Card[];
	discard: Card[];
	hands: Record<PlayerID, Card[]>;
	treasure: Card[];
	prefs: Record<PlayerID, PlayerPrefs>;
	stats: { placements: number };
	meta: {
		deckExhaustionCycle: number | null; // cycle index when deck was first exhausted
		stashBonus: Record<PlayerID, number>; // number of bonus cards to draw at end of turn from stashing
	};
	origins: Co[]; // starting places for scoring (center or random)
};

export type OutwardRule = 'none' | 'outwardOnly' | 'dirOnly' | 'dirOrOutward';
// Discard-to-rotate rule: 'any' (any card), 'match-color' (card must contain a tile color), false (disabled)
export type DiscardToRotate = false | 'any' | 'match-color';
// Overwrite rule: 'none' (disabled), 'match-4' (discard 4 of same color to overwrite)
export type PlacementOverwriteRule = 'none' | 'match-4';
export type OriginRule = 'center' | 'random' | 'random-and-center';
export type OriginDirection = 'aligned' | 'random';
// Game mode: 'hex' (traditional hex placement), 'path' (dot-to-dot path placement)
export type GameMode = 'hex' | 'path';

export type BaseScoringRules = {
	BY_RIM_TOUCH: boolean; // If true, scoring components require both center connectivity and rim touch for intersections
	ORIGIN_TO_ORIGIN: boolean; // If true, score points for tiles connecting multiple origins
	SHORTEST_PATH: boolean; // If true, only count tiles on shortest paths between entities (origins to rim, origins to origins)
};

export type ObjectiveScoringRules = BaseScoringRules & {
	// Primary / secondary / tertiary color point multipliers
	COLOR_POINTS: [number, number, number];
};

export type PlacementRules = {
	// Placement rule: 'none' (no restriction), 'outwardOnly' (must be outward from neighbor),
	// 'dirOnly' (must follow color direction), 'dirOrOutward' (either direction or outward)
	OUTWARD_RULE: OutwardRule;
	// Discard-to-rotate rule: 'any' (any card), 'match-color' (card must contain a tile color), false (disabled)
	DISCARD_TO_ROTATE: DiscardToRotate;
	// Number of rings (starting from ring 1) that allow higher capacity instead of 1 (hex mode)
	MULTI_CAP_FIRST_RINGS: number;
	// Hard cap on lanes per coord / path
	MAX_LANES_PER_PATH: number;
	// Special placement: discard 2 of same color to place ignoring direction rules
	TWO_TO_ROTATE: boolean;
	// Overwrite rule: 'none' (disabled), 'match-4' (discard 4 of same color to overwrite a lane)
	OVERWRITE: PlacementOverwriteRule;
};

export type Rules = {
	// Game mode: 'hex' (traditional) or 'path' (dot-to-dot)
	MODE: GameMode;
	// Maximum distance from center (ring count) - board is a hex of radius N
	RADIUS: number;
	// Available colors in the game
	COLORS: readonly Color[];
	// Maps each color to its directional offset vector in hex coordinates
	COLOR_TO_DIR: Record<Color, Co>;
	// Number of cards each player holds in hand
	HAND_SIZE: number;
	// Maximum number of cards that can be stashed in the treasure pile
	TREASURE_MAX: number;
	// Target total number of cards in the deck
	DECK_SIZE: number;
	// Counts of each card type used to build deck (proportionally scaled to DECK_SIZE)
	DECK_COUNTS: { twoColor: number; threeColor: number; fourColor: number };
	// If true, when playing a multi-color card, player must pick exactly one color to place
	ONE_COLOR_PER_CARD_PLAY: boolean;
	// Initial color placed at center (0,0); null means center is wild/unplaceable
	CENTER_SEED: Color | null;
	// If true, game ends when deck is exhausted (after all players have equal turns if EQUAL_TURNS is true)
	END_ON_DECK_EXHAUST: boolean;
	// If true, game ends only after all players have had equal turns since deck exhaustion
	EQUAL_TURNS: boolean;
	// Scoring configuration
	SCORING: ObjectiveScoringRules;
	// Placement configuration
	PLACEMENT: PlacementRules;
	// UI display settings
	UI: { HEX_SIZE: number; SHOW_AXES: boolean; SHOW_RING: boolean };
	// Maximum number of players allowed in the game
	MAX_PLAYERS: number;
	// Origin rule: 'center' (single origin at 0,0), 'random' (random origins only, excluding center), or 'random-and-center' (center + random origins)
	ORIGIN: OriginRule;
	// Number of origins when ORIGIN='random' or 'random-and-center'
	ORIGIN_COUNT: number;
	// Origin direction: 'aligned' (evenly spaced in cardinal directions) or 'random' (completely random positions) - only used when ORIGIN includes 'random'
	ORIGIN_DIRECTION: OriginDirection;
	// Minimum distance between origins and each other or the edge (0 = no restriction, 1 = at least 1 space between)
	MIN_ORIGIN_DISTANCE: number;
};

// Legacy type alias for backwards compatibility
export type ScoringRules = BaseScoringRules;

export type Scores = Record<PlayerID, number>;

export type MovePlayCardArgs = { handIndex: number; pick: Color; coord: Co };
export type MoveStashArgs = { handIndex: number };
export type MoveTakeTreasureArgs = { index: number };
export type MoveRotateTileArgs = { coord: Co; handIndex: number; rotation: number }; // rotation: 1-5 (60°-300°), excluding 3 (180°)
