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
export type ConnectivityScope = 'global' | 'own';
export type DiscardToRotate = true | 'non-backwards' | false;
export type OriginRule = 'center' | 'random' | 'random-and-center';
export type OriginDirection = 'aligned' | 'random';

export type ScoringRules = {
	BY_RIM_TOUCH: boolean; // If true, scoring components require both center connectivity and rim touch for intersections
	ORIGIN_TO_ORIGIN: boolean; // If true, score points for tiles connecting multiple origins
	SHORTEST_PATH: boolean; // If true, only count tiles on shortest paths between entities (origins to rim, origins to origins)
};

export type Rules = {
	RADIUS: number;
	COLORS: readonly Color[];
	COLOR_TO_DIR: Record<Color, Co>;
	HAND_SIZE: number;
	TREASURE_MAX: number;
	DECK_SIZE: number; // target total number of cards in deck
	DECK_COUNTS: { twoColor: number; threeColor: number; fourColor: number };
	ONE_COLOR_PER_CARD_PLAY: boolean;
	OUTWARD_RULE: OutwardRule;
	CONNECTIVITY_SCOPE: ConnectivityScope;
	CENTER_SEED: Color | null;
	END_ON_DECK_EXHAUST: boolean;
	EQUAL_TURNS: boolean;
	SCORING: ScoringRules;
	UI: { HEX_SIZE: number; SHOW_AXES: boolean; SHOW_RING: boolean };
	MULTI_CAP_FIRST_RINGS: number; // rings [1..N] allow capacity 2 per hex (center excluded)
	MAX_PLAYERS: number;
	DISCARD_TO_ROTATE: DiscardToRotate;
	ORIGIN: OriginRule;
	ORIGIN_COUNT: number; // only used when ORIGIN='random'
	ORIGIN_DIRECTION: OriginDirection; // 'aligned' or 'random' - only used when ORIGIN includes 'random'
	MIN_ORIGIN_DISTANCE: number; // minimum distance between origins and each other or the edge
};

export type Scores = Record<PlayerID, number>;

export type MovePlayCardArgs = { handIndex: number; pick: Color; coord: Co };
export type MoveStashArgs = { handIndex: number };
export type MoveTakeTreasureArgs = { index: number };
export type MoveRotateTileArgs = { coord: Co; handIndex: number; rotation: number }; // rotation: 1-5 (60°-300°), excluding 3 (180°)


