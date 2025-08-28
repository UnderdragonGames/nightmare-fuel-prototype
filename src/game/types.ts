import type { PlayerID } from 'boardgame.io';

export type Color = 'R' | 'O' | 'Y' | 'G' | 'B' | 'V';

export type Card = { colors: Color[] };

export type Co = { q: number; r: number };

export type PlayerPrefs = { primary: Color; secondary: Color; tertiary: Color };

export type GState = {
	radius: number;
	board: Record<string, Color[]>;
	deck: Card[];
	discard: Card[];
	hands: Record<PlayerID, Card[]>;
	treasure: Card[];
	prefs: Record<PlayerID, PlayerPrefs>;
	stats: { placements: number };
	meta: {
		deckExhaustionCycle: number | null; // cycle index when deck was first exhausted
	};
};

export type OutwardRule = 'none' | 'outwardOnly' | 'dirOnly' | 'dirOrOutward';
export type ConnectivityScope = 'global' | 'own';

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
	SCORE_COMPONENTS_BY_RIM_TOUCH: boolean;
	UI: { HEX_SIZE: number; SHOW_AXES: boolean; SHOW_RING: boolean };
	MULTI_CAP_FIRST_RINGS: number; // rings [1..N] allow capacity 2 per hex (center excluded)
};

export type Scores = Record<PlayerID, number>;

export type MovePlayCardArgs = { handIndex: number; pick: Color; coord: Co };
export type MoveStashArgs = { handIndex: number };
export type MoveTakeTreasureArgs = { index: number };


