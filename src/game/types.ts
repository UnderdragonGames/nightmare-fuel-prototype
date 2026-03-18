import type { PlayerID as BgioPlayerID } from 'boardgame.io';

export type PlayerID = BgioPlayerID;

export type Color = 'R' | 'O' | 'Y' | 'G' | 'B' | 'V';

export type Stat = 'vitality' | 'form' | 'freedom' | 'sanity' | 'will' | 'hope';

export type CardFlags = { needsNewPrint: boolean; needsDuplicate: boolean };

export type CardActionTarget = 'current' | 'each' | 'player';
export type CardActionDuration = 'round';
export type CardActionCondition = 'handsEmpty';
export type CardActionPlacementColor = 'lastPlaced';
export type ActionCardsRule = 'disabled' | 'one-per-turn' | 'unlimited';

export type CardAction =
	| { type: 'drawCards'; count: number; target: CardActionTarget; playerId?: PlayerID }
	| { type: 'randomDiscard'; count: number; target: CardActionTarget; playerId?: PlayerID }
	| { type: 'discardHand'; target: CardActionTarget; playerId?: PlayerID }
	| { type: 'revealTop'; count: number | 'playerCount' }
	| { type: 'pickOneToHand' }
	| { type: 'discardRest' }
	| { type: 'placeOnDrawPileTopFaceUp' }
	| { type: 'registerBlockDrawsHook' }
	| { type: 'moveSelfToDiscard'; condition?: CardActionCondition }
	| { type: 'grantExtraPlacements'; count: number }
	| { type: 'grantExtraActionPlays'; count: number }
	| { type: 'grantExtraPlay'; count: number }
	| { type: 'rotateHands'; direction: 'clockwise' | 'counterclockwise' }
	| { type: 'selectOwnedHex' }
	| { type: 'moveHex' }
	| { type: 'chooseStat' }
	| { type: 'placeTokenOnHex' }
	| { type: 'markHexCountsForTwoStats' }
	| { type: 'replaceHexWithDead' }
	| { type: 'moveCardToPlayerHand' }
	| { type: 'draftInTurnOrder' }
	| { type: 'autoPlayPickedCard' }
	| { type: 'chooseAgenda' }
	| { type: 'setAgendaOverride' }
	| { type: 'reorderPlayerPrefs' }
	| { type: 'markAgendaTokens' }
	| { type: 'attachTokenToCard' }
	| { type: 'registerHook'; hookEvent: GameEventType }
	| { type: 'discardSelfOnTrigger' }
	| { type: 'privateRevealVillain' }
	| { type: 'registerSkipTurnHook' }
	| { type: 'attachToPlayer' }
	| { type: 'reduceSynergyOnce' }
	| { type: 'readLastPlacedColor' }
	| { type: 'grantExtraPlacement'; color: CardActionPlacementColor }
	| { type: 'randomStealCard'; count: number }
	| { type: 'replaceHexColor' }
	| { type: 'grantRevealUnusedVillains'; duration: CardActionDuration }
	| { type: 'choice'; options: CardAction[][] };

export type Card = {
	id: number;
	name: string;
	colors: Color[];
	stats: Partial<Record<Stat, number>>;
	text: string | null;
	isAction: boolean;
	actions?: CardAction[];
	synergies: string[];
	synergyCount: number;
	flags: CardFlags;
};

export type Co = { q: number; r: number };

export type PlayerPrefs = { primary: Color; secondary: Color; tertiary: Color };
export type NightmareId = string;
export type NightmareState = { abilityUsesRemaining: number; handSizeBonus: number };

export type NightmareAction =
	| { type: 'randomizeColorDirections' }
	| { type: 'fillTreasureToMax' }
	| { type: 'drawCards'; count: number; target: 'current' }
	| { type: 'destroyPath' }
	| { type: 'removeLane' }
	| { type: 'changeLaneColor' }
	| { type: 'destroyNode' }
	| { type: 'grantExtraPlacements'; count: number }
	| { type: 'randomStealCard'; count: number }
	| { type: 'swapPrefsSecondaryTertiary' }
	| { type: 'increaseHandSize'; amount: number };

export type AttachedCard = {
	card: Card;
	targetPlayerId?: PlayerID;
	token?: Stat;
	expires?: 'afterSkip' | 'afterTrigger' | 'endOfRound' | 'manual';
};

export type GameEventType = 'onPlacement' | 'onStatMove' | 'onSynergyUse' | 'onDraw' | 'onTurnStart' | 'onTurnEnd';

export type GameEvent =
	| { type: 'onPlacement'; playerId: PlayerID; coord: [Co, Co]; color: Color }
	| { type: 'onStatMove'; stat: Stat; playerId: PlayerID }
	| { type: 'onSynergyUse'; playerId: PlayerID; synergyName: string }
	| { type: 'onDraw'; playerId: PlayerID }
	| { type: 'onTurnStart'; playerId: PlayerID }
	| { type: 'onTurnEnd'; playerId: PlayerID };

export type HookSideEffect =
	| { type: 'discardSourceCard'; sourceCardId: number }
	| { type: 'moveFaceUpToDiscard'; sourceCardId: number };

export type HookDef = {
	id: string;
	event: GameEventType;
	sourceCardId: number;
	behavior: 'block' | 'modify' | 'observe';
	oneShot: boolean;
	targetPlayerId?: PlayerID;
	stat?: Stat;
	sideEffects: HookSideEffect[];
};

export type ActionState = {
	revealed: Card[];
	faceUpDrawPile: Card[];
	hooks: HookDef[];
	extraPlays: Record<PlayerID, number>;
	extraPlacements: Record<PlayerID, { count: number; color?: Color | null }>;
	extraActionPlays: Record<PlayerID, number>;
	agendaOverrides: Record<PlayerID, Stat | null>;
	revealUnusedVillainsUntil: Record<PlayerID, number | null>;
	attachedCards: AttachedCard[];
	lastPlacedColor: Color | null;
};

// Path-mode lane segment between adjacent nodes.
export type PathLane = { from: Co; to: Co; color: Color };

export type HexTile = {
	colors: Color[];
	rotation: number; // 0-5, number of 60-degree clockwise rotations from default orientation
	dead: boolean;
};

export type GState = {
	rules: Rules;
	radius: number;
	board: Record<string, HexTile>;
	// Path-mode only: explicit lane segments (independent of COLOR_TO_DIR)
	lanes: PathLane[];
	deck: Card[];
	discard: Card[];
	hands: Record<PlayerID, Card[]>;
	treasure: Card[];
	prefs: Record<PlayerID, PlayerPrefs>;
	nightmares: Record<PlayerID, NightmareId>;
	nightmareState: Record<PlayerID, NightmareState>;
	stats: { placements: number };
	meta: {
		deckExhaustionCycle: number | null; // cycle index when deck was first exhausted
		stashBonus: Record<PlayerID, number>; // bonus draws earned this turn (paid out at endTurnAndRefill, then reset)
		actionPlaysThisTurn: Record<PlayerID, number>;
	};
	origins: Co[]; // starting places for scoring (center or random)
	action: ActionState;
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
	// Path-mode option: support indicates number of branches that can spawn at a node.
	// Single (1 lane) = no branching, Double (2 lanes) = 1 branch per node, Triple (3 lanes) = 2 branches per node (max).
	FORK_SUPPORT: boolean;
	// Path-mode option: paths cannot intersect (all edges at a tile must come from same source)
	NO_INTERSECT: boolean;
	// Path-mode option: tiles at the rim (edge of board) cannot have outgoing edges
	NO_BUILD_FROM_RIM: boolean;
	// Special placement: discard 2 of same color to place ignoring direction rules
	TWO_TO_ROTATE: boolean;
	// Overwrite rule: 'none' (disabled), 'match-4' (discard 4 of same color to overwrite a lane)
	OVERWRITE: PlacementOverwriteRule;
	// Consolidation: once a pathway reaches the rim, can place backwards along existing paths (reinforcement limits apply)
	CONSOLIDATION: boolean;
	// Consolidation win: game ends when this many continuous paths reach from rim back to center
	CONSOLIDATION_END: number;
	// If true, consolidation moves can exceed MAX_LANES_PER_PATH (widths 4+ possible)
	CONSOLIDATION_EXCEEDS_LANES_PER_PATH: boolean;
	// Minimum ring a consolidation move can reach (0 = center origin, 1 = ring 1 adjacent to origin)
	CONSOLIDATE_TO_RING: number;
	// Minimum ring from which new path branches can originate (0 = center allowed, 1 = must start from ring 1+)
	// Stacking on existing edges from lower rings is still allowed.
	STARTING_RING: number;
	// Number of cards to discard to block an empty tile (mark as dead). 0 = disabled.
	COST_TO_BLOCK: number;
	// Number of cards to discard to rotate a tile. Must match DISCARD_TO_ROTATE being enabled.
	COST_TO_ROTATE: number;
};

export type Rules = {
	// Game mode: 'hex' (traditional) or 'path' (dot-to-dot)
	MODE: GameMode;
	// Maximum distance from center (ring count) - board is a hex of radius N
	RADIUS: number;
	// Available colors in the game
	COLORS: readonly Color[];
	// Edge colors going clockwise from North (edges 0-5). Also defines tile default orientation.
	EDGE_COLORS: readonly Color[];
	// If true, shuffle EDGE_COLORS once per new game (and derive COLOR_TO_DIR from that shuffled order).
	RANDOM_CARDINAL_DIRECTIONS: boolean;
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
	// Action card play rule: 'one-per-turn' or 'unlimited'
	ACTION_CARDS: ActionCardsRule;
	// Scoring configuration
	SCORING: ObjectiveScoringRules;
	// Placement configuration
	PLACEMENT: PlacementRules;
	// UI display settings
	UI: { HEX_SIZE: number; SHOW_AXES: boolean };
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

export type GameEffect =
	| { type: 'drawCards'; playerId: PlayerID; count: number }
	| { type: 'discardCard'; playerId: PlayerID; handIndex: number }
	| { type: 'discardHand'; playerId: PlayerID }
	| { type: 'randomDiscard'; playerId: PlayerID; count: number }
	| { type: 'revealTop'; count: number }
	| { type: 'discardRevealed' }
	| { type: 'draftInTurnOrder'; order: PlayerID[]; picks: Record<PlayerID, number> }
	| { type: 'autoPlayPickedCard'; playerId: PlayerID; revealedIndex: number; effects?: GameEffect[] }
	| { type: 'moveCardToPlayerHand'; playerId: PlayerID; card?: Card; usePlayedCard?: boolean }
	| { type: 'placeOnDrawPileTopFaceUp'; card?: Card; usePlayedCard?: boolean }
	| { type: 'randomStealCard'; fromPlayerId: PlayerID; toPlayerId: PlayerID; count: number }
	| { type: 'grantExtraPlay'; playerId: PlayerID; count: number }
	| { type: 'grantExtraPlacements'; playerId: PlayerID; count: number; color?: Color }
	| { type: 'grantExtraActionPlays'; playerId: PlayerID; count: number }
	| { type: 'registerHook'; hook: HookDef }
	| { type: 'replaceHexWithDead'; coord: Co }
	| { type: 'replaceHexColor'; coord: Co; color: Color }
	| { type: 'moveHex'; from: Co; to: Co }
	| { type: 'reorderPlayerPrefs'; playerId: PlayerID; order: PlayerPrefs }
	| { type: 'setAgendaOverride'; playerId: PlayerID; stat: Stat | null }
	| { type: 'grantRevealUnusedVillains'; playerId: PlayerID; untilRound?: number | null }
	| { type: 'attachCard'; card?: Card; usePlayedCard?: boolean; targetPlayerId?: PlayerID; token?: Stat; expires?: AttachedCard['expires'] }
	| { type: 'rotateHands'; direction: 'clockwise' | 'counterclockwise'; playerOrder: PlayerID[] };

export type MovePlayCardArgs =
	// Hex mode: place a color at a coord
	| { handIndex: number; pick: Color; coord: Co }
	// Path mode: place a lane from -> coord (must be adjacent)
	| { handIndex: number; pick: Color; coord: Co; source: Co };
export type MovePlayActionArgs = { handIndex: number; effects?: GameEffect[] };
export type MoveStashArgs = { handIndex: number };
export type MoveTakeTreasureArgs = { index: number };
export type MoveRotateTileArgs = { coord: Co; handIndices: number[]; rotation: number }; // rotation: 1-5 (60°-300°), excluding 3 (180°); handIndices: cards to discard (length must equal COST_TO_ROTATE)
export type MoveBlockTileArgs = { coord: Co; handIndices: number[] }; // handIndices: cards to discard (length must equal COST_TO_BLOCK)
