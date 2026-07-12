import type { Ctx } from 'boardgame.io';
import type { PlayerID } from 'boardgame.io';
import { CARDS } from '../../game/cards';
import { initActionState, playActionCardFromHand } from '../../game/effects';
import { resolveCardEffects, type CardActionResolveContext } from '../../game/cardActions';
import { MODE_RULESETS, buildColorToDir } from '../../game/rulesConfig';
import { buildPlayers } from '../testHelpers';
import type { Card, GState } from '../../game/types';

export const byId = (id: number): Card => {
	const c = (CARDS as Card[]).find((x) => x.id === id);
	if (!c) throw new Error(`card ${id} missing`);
	return { ...c };
};

export const filler = (n: number, idBase = 900): Card[] =>
	Array.from({ length: n }, (_, i) => ({
		colors: ['R', 'O'], id: idBase + i, name: `F${idBase + i}`, stats: {}, text: null,
		isAction: false, synergies: [], synergyCount: 0,
		flags: { needsNewPrint: false, needsDuplicate: false },
	} as unknown as Card));

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

export const makeState = (opts: {
	mode?: 'path' | 'hex';
	hands?: Record<string, Card[]>;
	deck?: Card[];
	lanes?: GState['lanes'];
	board?: GState['board'];
} = {}): GState => {
	const base = opts.mode === 'hex' ? MODE_RULESETS.hex : MODE_RULESETS.path;
	const rules = {
		...base,
		RADIUS: 3,
		RANDOM_CARDINAL_DIRECTIONS: false,
		EDGE_COLORS,
		COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
		ACTION_CARDS: 'one-per-turn' as const,
	};
	return {
		rules,
		radius: rules.RADIUS,
		board: opts.board ?? {},
		lanes: opts.lanes ?? [],
		secret: { deck: opts.deck ?? filler(10) },
		discard: [],
		players: buildPlayers(opts.hands ?? { '0': [], '1': [] }),
		treasure: [],
		stats: { placements: 0 },
		meta: { deckExhaustionCycle: null },
		origins: [{ q: 0, r: 0 }],
		action: initActionState(Object.keys(opts.hands ?? { '0': [], '1': [] }) as PlayerID[]),
	} as unknown as GState;
};

export const ctx2 = { currentPlayer: '0', playOrder: ['0', '1'], numPlayers: 2, turn: 3 } as unknown as Ctx;

/** Resolve and play the action card at handIndex for playerId. */
export const playAction = (
	G: GState,
	playerId: PlayerID,
	handIndex: number,
	resolveExtras: Partial<CardActionResolveContext> = {},
	rng: () => number = () => 0.5,
): void => {
	const card = G.players[playerId]!.hand[handIndex]!;
	const effects = resolveCardEffects(card, {
		currentPlayerId: playerId,
		playerOrder: ['0', '1'],
		lastPlacedColor: G.action.lastPlacedColor,
		mode: G.rules.MODE,
		...resolveExtras,
	});
	playActionCardFromHand(G, ctx2, playerId, handIndex, effects, rng);
};
