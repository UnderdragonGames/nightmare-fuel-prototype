import React from 'react';
import './App.css';
import type { PlayerID } from 'boardgame.io';
import { Client, type BoardProps as BGIOBoardProps } from 'boardgame.io/react';
import { Local, SocketIO } from 'boardgame.io/multiplayer';
import { HexStringsGame } from './game/game';
import { useBotClients } from './useBotClients';
import { Board as HexBoard } from './ui/Board';
import type { CardAction, Color, Co, GState, MoveUseAbilityArgs, PlayerPrefs, Stat } from './game/types';
import { NeuralCard } from './ui/Hand';
import { Shelf } from './ui/Shelf';
import { Treasure, TreasureCard } from './ui/Treasure';
import { ActionCardModal } from './ui/ActionCardModal';
import { PlayerHandModal } from './ui/PlayerHandModal';
import { computeScores } from './game/scoring';
import { buildAllCoords, canPlace, canPlacePath, canConsolidate, isRotatableNode, neighbors, asVisibleColor, key, serializeCard } from './game/helpers';
import { useUIStore } from './ui/useUIStore';
import { PlayerCard } from './ui/PlayerCard';
import { StateLab } from './ui/StateLab';
import { getNightmareByName } from './game/nightmares';
import { resolveCardActions, resolveCardEffects, type CardActionResolveContext } from './game/cardActions';
import { actionEffectsInvalidReason } from './game/effects';
import { useIsMobile } from './ui/useIsMobile';
import { ZoneTabBar } from './ui/ZoneTabBar';
import { Icon } from './ui/Icon';
import { ActionModeStrip, type ActionMode } from './ui/ActionModeStrip';
import {
	cancelMatchRemote,
	createMatch,
	findMatchByCode,
	firstFreeSeat,
	getMatch,
	getServerURL,
	joinMatch,
	leaveMatch,
	playAgain,
	shareInvite,
} from './network/lobby';
import type { BotMode, NetworkSession } from './ui/useUIStore';
import { playSfx, primeSfx, setSfxMuted } from './sound/sfx';

// Types
type ExtraBoardProps = { viewer: PlayerID; onSetViewer: (pid: PlayerID) => void };
type AppBoardProps = BGIOBoardProps<GState> & ExtraBoardProps;

// Stable empty bot map: local bot clients are disabled while in a network match.
const EMPTY_BOTS: Record<PlayerID, BotMode> = {};

// Targeting flow for nightmare abilities (discriminated on `step`).
type AbilityFlow =
	| { step: 'coord' } // Demon/Witch: pick a node on a path
	| { step: 'edgeFrom' } // Ghost/Mutant: pick one end of a lane…
	| { step: 'edgeTo'; from: Co } // …then the other
	| { step: 'color'; laneIndex: number } // Mutant: pick the new color
	| { step: 'target' } // Vampire: pick an opponent
	| { step: 'source' } // Dragon/Werewolf: pick the node to build from…
	| { step: 'dest'; source: Co }; // …then the destination

// Mobile Status Bar Component
const MobileStatusBar: React.FC<{
	currentPlayer: PlayerID;
	currentPlayerScore: number;
	currentPlayerGoals: { primary: Color; secondary: Color; tertiary: Color };
	viewer: PlayerID;
	viewerScore: number;
	viewerGoals: { primary: Color; secondary: Color; tertiary: Color };
	isViewerTurn: boolean;
	deckCount: number;
}> = ({ currentPlayer, currentPlayerScore, currentPlayerGoals, viewer, viewerScore, viewerGoals, isViewerTurn, deckCount }) => {
	const currentGoals = [currentPlayerGoals.primary, currentPlayerGoals.secondary, currentPlayerGoals.tertiary];
	const viewerGoalColors = [viewerGoals.primary, viewerGoals.secondary, viewerGoals.tertiary];
	const showViewer = viewer !== currentPlayer;

	return (
		<div className="mobile-status">
			<div className="mobile-status__current">
				<div className="mobile-status__turn-badge">
					<span className="mobile-status__player">P{currentPlayer}</span>
					<span className="mobile-status__score">{currentPlayerScore}</span>
				</div>
				<div className="mobile-status__priorities">
					{currentGoals.map((col, i) => (
						<span
							key={`${col}-${i}`}
							className="mobile-status__dot"
							style={{ background: asVisibleColor(col), boxShadow: `0 0 4px ${asVisibleColor(col)}` }}
						/>
					))}
				</div>
				<span className="mobile-status__deck">◆{deckCount}</span>
			</div>
			{showViewer && (
				<div className="mobile-status__viewer">
					<span className="mobile-status__viewer-label">You (P{viewer})</span>
					<span className="mobile-status__viewer-score">{viewerScore}</span>
					<div className="mobile-status__priorities mobile-status__priorities--muted">
						{viewerGoalColors.map((col, i) => (
							<span
								key={`v-${col}-${i}`}
								className="mobile-status__dot mobile-status__dot--muted"
								style={{ background: asVisibleColor(col) }}
							/>
						))}
					</div>
				</div>
			)}
			{isViewerTurn && (
				<div className="mobile-status__your-turn">Your Turn!</div>
			)}
		</div>
	);
};

const GameBoard: React.FC<AppBoardProps> = ({
	G,
	ctx,
	moves,
	playerID,
	onSetViewer,
	undo,
	log,
	matchData,
}) => {
	const rules = G.rules;
	const isMobile = useIsMobile();
	const [selectedCard, setSelectedCard] = React.useState<number | null>(null);
	const [selectedColor, setSelectedColor] = React.useState<Color | null>(null);
	const [actionMode, setActionMode] = React.useState<ActionMode>('place');
	const [discardSelection, setDiscardSelection] = React.useState<number[]>([]);
	const [pendingRotationTile, setPendingRotationTile] = React.useState<Co | null>(null);
	const [selectedSourceDot, setSelectedSourceDot] = React.useState<Co | null>(null);
	const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
	const [expandedZone, setExpandedZone] = React.useState<'hand' | 'treasure' | 'discard' | null>(null);
	const [actionModalOpen, setActionModalOpen] = React.useState(false);
	const [viewingHandOf, setViewingHandOf] = React.useState<PlayerID | null>(null);
	const botByPlayer = useUIStore((s) => s.botByPlayer);
	const setBotFor = useUIStore((s) => s.setBotFor);
	const aiPaused = useUIStore((s) => s.aiPaused);
	const setAiPaused = useUIStore((s) => s.setAiPaused);
	const [rotatable, setRotatable] = React.useState<Co[]>([]);
	const [gameOverDismissed, setGameOverDismissed] = React.useState(false);
	const [abilityFlow, setAbilityFlow] = React.useState<AbilityFlow | null>(null);
	const [discardModalOpen, setDiscardModalOpen] = React.useState(false);
	const [exportCopied, setExportCopied] = React.useState(false);

	// Network session (null in local games). matchData is only provided by the
	// multiplayer server, so its presence — not the store — gates network UI.
	const network = useUIStore((s) => s.network);
	const setNetwork = useUIStore((s) => s.setNetwork);
	const playerName = useUIStore((s) => s.playerName);
	const [rematchBusy, setRematchBusy] = React.useState(false);
	const [rematchError, setRematchError] = React.useState<string | null>(null);
	const [inviteShared, setInviteShared] = React.useState<'idle' | 'copied'>('idle');

	const handleShareInvite = async () => {
		if (!network) return;
		const result = await shareInvite(network.matchID);
		if (result === 'copied') {
			setInviteShared('copied');
			setTimeout(() => setInviteShared('idle'), 1500);
		}
	};

	// Leave frees only this seat; cancel ends the match for everyone. On your
	// turn cancel is a direct move; otherwise the server performs it for you
	// (credential-checked) so undo can stay single-active-player.
	const handleLeaveMatch = async () => {
		if (network) {
			await leaveMatch(getServerURL(), network.matchID, network.seat, network.credentials);
		}
		setNetwork(null);
	};
	const handleCancelMatch = async () => {
		if (!window.confirm('Cancel this match for everyone?')) return;
		if (isMyTurn) {
			moves.cancelMatch?.({ by: playerID });
			return;
		}
		if (!network) return;
		try {
			await cancelMatchRemote(getServerURL(), network.matchID, network.seat, network.credentials);
		} catch (err) {
			console.warn('cancel failed:', err);
		}
	};

	// Game-start gate: in a network match the game technically starts at
	// creation, but we hold the board behind a waiting room until every seat
	// is claimed, then flash a start banner. Local() also supplies matchData
	// (with unnamed seats), so the store's session decides what "network" is.
	const isNetworked = network !== null && !!matchData;
	const allSeatsJoined = !isNetworked || !!matchData?.every((p) => !!p.name);
	const [startBanner, setStartBanner] = React.useState(false);
	const prevJoinedRef = React.useRef(allSeatsJoined);
	React.useEffect(() => {
		const was = prevJoinedRef.current;
		prevJoinedRef.current = allSeatsJoined;
		if (!was && allSeatsJoined) {
			setStartBanner(true);
			const t = setTimeout(() => setStartBanner(false), 3000);
			return () => clearTimeout(t);
		}
	}, [allSeatsJoined]);

	const nameOf = (pid: PlayerID): string | null =>
		matchData?.find((p) => String(p.id) === pid)?.name ?? null;

	const handleRematch = async () => {
		if (!network) return;
		setRematchBusy(true);
		setRematchError(null);
		try {
			const serverURL = getServerURL();
			// playAgain is idempotent per match: every player's button converges
			// on the same next match. Rejoin the same seat, or any free one.
			const nextMatchID = await playAgain(serverURL, network.matchID, network.seat, network.credentials);
			const myName = playerName.trim() || `Player ${network.seat}`;
			let seat = network.seat;
			let credentials: string;
			try {
				credentials = await joinMatch(serverURL, nextMatchID, seat, myName);
			} catch {
				const match = await getMatch(serverURL, nextMatchID);
				const free = firstFreeSeat(match);
				if (free === null) throw new Error('The rematch is already full.');
				seat = free;
				credentials = await joinMatch(serverURL, nextMatchID, seat, myName);
			}
			const session: NetworkSession = { matchID: nextMatchID, seat, credentials, numPlayers: network.numPlayers };
			setNetwork(session);
			setGameOverDismissed(false);
		} catch (e) {
			setRematchError(e instanceof Error ? e.message : 'Rematch failed.');
		} finally {
			setRematchBusy(false);
		}
	};
	const [showCoords, setShowCoords] = React.useState(false);
	const [actionTargetPlayer, setActionTargetPlayer] = React.useState<PlayerID | ''>('');
	const [actionChoiceIndex, setActionChoiceIndex] = React.useState('0');
	const [actionCoordInput, setActionCoordInput] = React.useState('');
	const [actionReplaceColor, setActionReplaceColor] = React.useState<Color | ''>('');
	const [actionMoveFromInput, setActionMoveFromInput] = React.useState('');
	const [actionMoveToInput, setActionMoveToInput] = React.useState('');
	const [actionChosenStat, setActionChosenStat] = React.useState<Stat | ''>('');
	const [actionPrefPrimary, setActionPrefPrimary] = React.useState<Color | ''>('');
	const [actionPrefSecondary, setActionPrefSecondary] = React.useState<Color | ''>('');
	const [actionPrefTertiary, setActionPrefTertiary] = React.useState<Color | ''>('');
	const [actionRevealedPickIndex, setActionRevealedPickIndex] = React.useState('');
	const [actionDraftPicks, setActionDraftPicks] = React.useState<Record<PlayerID, string>>({});
	const [actionPickingCoord, setActionPickingCoord] = React.useState<'coord' | 'moveFrom' | 'moveTo' | null>(null);
	const [actionContextJson, setActionContextJson] = React.useState('');

	// Toggle coordinate display with backtick key
	React.useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === '`') setShowCoords((v) => !v);
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, []);

	const currentPlayer = ctx.currentPlayer;
	const myID = playerID as PlayerID;
	const isMyTurn = myID === currentPlayer;
	const myHand = G.players[myID]?.hand ?? [];
	const stage = (ctx.activePlayers ? (ctx.activePlayers as Record<PlayerID, string>)[currentPlayer as PlayerID] : undefined) ?? 'active';
	const locked = stage !== 'active';
	const isPathMode = rules.MODE === 'path';
	const selectedActionCard = selectedCard !== null ? myHand[selectedCard] : null;
	const selectedActionList = selectedActionCard ? resolveCardActions(selectedActionCard) : [];

	// Zone mutual exclusion: opening one zone closes others
	const handleZoneExpand = React.useCallback(
		(zone: 'hand' | 'treasure' | 'discard') => (expanded: boolean) => {
			setExpandedZone(expanded ? zone : null);
		},
		[],
	);

	// Open action modal when an action card is selected
	React.useEffect(() => {
		if (selectedActionCard?.isAction) {
			setActionModalOpen(true);
		} else {
			setActionModalOpen(false);
		}
	}, [selectedActionCard]);


	const parseCoord = (value: string): Co | undefined => {
		const parts = value.split(',').map((p) => p.trim());
		if (parts.length !== 2) return undefined;
		const q = Number(parts[0]);
		const r = Number(parts[1]);
		if (Number.isNaN(q) || Number.isNaN(r)) return undefined;
		return { q, r };
	};

	React.useEffect(() => {
		setActionTargetPlayer('');
		setActionChoiceIndex('0');
		setActionCoordInput('');
		setActionReplaceColor('');
		setActionMoveFromInput('');
		setActionMoveToInput('');
		setActionChosenStat('');
		setActionPrefPrimary('');
		setActionPrefSecondary('');
		setActionPrefTertiary('');
		setActionRevealedPickIndex('');
		setActionDraftPicks({});
		setActionContextJson('');
	}, [selectedCard]);

	// Derived values for action modes
	const rotateCost = rules.PLACEMENT.COST_TO_ROTATE;
	const blockCost = rules.PLACEMENT.COST_TO_BLOCK;
	const canRotateRule = rules.PLACEMENT.DISCARD_TO_ROTATE !== false;
	const canBlockRule = blockCost > 0;
	const discardNeeded = actionMode === 'rotate' ? rotateCost : actionMode === 'block' ? blockCost : 0;
	const discardReady = discardSelection.length === discardNeeded;

	// Board is interactable: place mode needs a card selected; rotate/block need enough discard cards
	const boardInteractable = actionMode === 'place'
		? selectedCard !== null
		: discardReady;

	// Helper: get direction-color between two adjacent coords (path-mode core mechanic)
	const getColorForDirection = (source: Co, dest: Co): Color | null => {
		const dq = dest.q - source.q;
		const dr = dest.r - source.r;
		for (const [color, dir] of Object.entries(rules.COLOR_TO_DIR)) {
			if (dir.q === dq && dir.r === dr) return color as Color;
		}
		return null;
	};

	// Helper: check if a coord is an origin
	const isOriginCoord = (coord: Co): boolean => {
		return G.origins.some((o) => o.q === coord.q && o.r === coord.r);
	};

	// Helper: find a lane color on edge (a, b) that can be consolidation-converted to toColor.
	const findConvertibleColor = (a: Co, b: Co, toColor: Color): Color | null => {
		for (const ln of G.lanes) {
			const onEdge =
				(ln.from.q === a.q && ln.from.r === a.r && ln.to.q === b.q && ln.to.r === b.r) ||
				(ln.from.q === b.q && ln.from.r === b.r && ln.to.q === a.q && ln.to.r === a.r);
			if (!onEdge || ln.color === toColor) continue;
			if (canConsolidate(G, a, b, ln.color, toColor, rules)) return ln.color;
		}
		return null;
	};

	// Helper: get valid destination dots from a source
	const getValidDestinations = (source: Co, cardColors: Color[]): Co[] => {
		const dests: Co[] = [];
		if (rules.MODE === 'path') {
			// Core rule: a color implies a direction from the selected source.
			for (const col of cardColors) {
				const dir = rules.COLOR_TO_DIR[col];
				const dest: Co = { q: source.q + dir.q, r: source.r + dir.r };
				if (isOriginCoord(dest)) continue;
				if (canPlacePath(G, source, dest, col, rules)) {
					if (!dests.some((d) => d.q === dest.q && d.r === dest.r)) dests.push(dest);
				}
			}

			// Also check all neighbors for consolidation CONVERSIONS (recolor an
			// existing lane) and the origin FINISHING move. Check ALL card colors:
			// the click handler tries every card color, and narrowing to the
			// (auto-picked) selectedColor previously hid legal finishing spots —
			// e.g. a rim-connected green path couldn't see its move into the
			// center because the card's first color wasn't green.
			for (const col of cardColors) {
				for (const dest of neighbors(source)) {
					if (dests.some((d) => d.q === dest.q && d.r === dest.r)) continue;
					if (findConvertibleColor(source, dest, col)) {
						dests.push(dest);
						continue;
					}
					// Finishing move: off-direction placement into the origin.
					if (isOriginCoord(dest) && canPlacePath(G, source, dest, col, rules)) dests.push(dest);
				}
			}
			return dests;
		}
		return dests;
	};

	const availableMoveCoords = React.useMemo(() => {
		if (!isMyTurn || locked || selectedCard === null) return [];
		const card = myHand[selectedCard];
		if (!card) return [];

		if (isPathMode) {
			if (selectedSourceDot) {
				return getValidDestinations(selectedSourceDot, card.colors);
			}

			const sources: Co[] = [];
			const coords = buildAllCoords(G.radius);
			for (const source of coords) {
				if (getValidDestinations(source, card.colors).length > 0) sources.push(source);
			}
			return sources;
		}

		const coords = buildAllCoords(G.radius);
		const colors = selectedColor ? [selectedColor] : card.colors;
		const seen = new Set<string>();
		const moves: Co[] = [];

		for (const coord of coords) {
			for (const color of colors) {
				if (canPlace(G, coord, color, rules)) {
					const k = key(coord);
					if (!seen.has(k)) {
						seen.add(k);
						moves.push(coord);
					}
					break;
				}
			}
		}

		return moves;
	}, [G, isMyTurn, isPathMode, locked, myHand, rules, selectedCard, selectedColor, selectedSourceDot]);

	// Per-spot highlight colors: each potential placement is tinted with the
	// color the move would actually play there (in path mode the direction
	// dictates the color), instead of one uniform highlight.
	const highlightColorByCoord = React.useMemo(() => {
		if (!isMyTurn || locked || selectedCard === null || actionMode !== 'place') return undefined;
		const card = myHand[selectedCard];
		if (!card) return undefined;
		const map: Record<string, string> = {};

		if (isPathMode) {
			// Colors a click on `dest` could play from `source`, in the same
			// priority order the click handler uses (direction color first,
			// then conversion / origin-finishing candidates).
			const colorsForMove = (source: Co, dest: Co): Color[] => {
				const out: Color[] = [];
				const dirColor = getColorForDirection(source, dest);
				if (dirColor && card.colors.includes(dirColor) && canPlacePath(G, source, dest, dirColor, rules)) {
					out.push(dirColor);
				}
				const candidates: Color[] = selectedColor && card.colors.includes(selectedColor)
					? [selectedColor, ...(card.colors as Color[])]
					: (card.colors as Color[]);
				for (const col of candidates) {
					if (out.includes(col)) continue;
					if (col !== dirColor && isOriginCoord(dest) && canPlacePath(G, source, dest, col, rules)) out.push(col);
					else if (findConvertibleColor(source, dest, col)) out.push(col);
				}
				return out;
			};

			if (selectedSourceDot) {
				for (const dest of availableMoveCoords) {
					const cols = colorsForMove(selectedSourceDot, dest);
					if (cols.length > 0) map[key(dest)] = asVisibleColor(cols[0]!);
				}
			} else {
				// Source dots: tint only when every move from that dot plays a
				// single color; ambiguous sources keep the neutral highlight.
				for (const source of availableMoveCoords) {
					const colSet = new Set<Color>();
					for (const dest of getValidDestinations(source, card.colors as Color[])) {
						for (const col of colorsForMove(source, dest)) colSet.add(col);
					}
					if (colSet.size === 1) map[key(source)] = asVisibleColor([...colSet][0]!);
				}
			}
			return map;
		}

		// Hex mode: tint each spot with the color a click would place there.
		const colors: Color[] = selectedColor ? [selectedColor] : (card.colors as Color[]);
		for (const coord of availableMoveCoords) {
			for (const color of colors) {
				if (canPlace(G, coord, color, rules)) {
					map[key(coord)] = asVisibleColor(color);
					break;
				}
			}
		}
		return map;
		// eslint-disable-next-line react-hooks/exhaustive-deps -- helper fns capture only listed deps
	}, [G, actionMode, availableMoveCoords, isMyTurn, isPathMode, locked, myHand, rules, selectedCard, selectedColor, selectedSourceDot]);

	const blockableCoords = React.useMemo(() => {
		if (actionMode !== 'block' || !isMyTurn || locked) return [];
		if (rules.PLACEMENT.COST_TO_BLOCK <= 0) return [];
		return buildAllCoords(G.radius).filter((c) => {
			const tile = G.board[key(c)];
			if (!tile || tile.colors.length > 0 || tile.dead) return false;
			return !G.origins.some((o) => o.q === c.q && o.r === c.r);
		});
	}, [actionMode, G.board, G.radius, G.origins, isMyTurn, locked, rules.PLACEMENT.COST_TO_BLOCK]);

	const actionNeedsTargetPlayer = selectedActionList.some((action) =>
		['randomStealCard', 'registerSkipTurnHook', 'attachToPlayer', 'moveCardToPlayerHand'].includes(action.type)
	);
	const actionNeedsChoice = selectedActionList.some((action) => action.type === 'choice');
	const actionNeedsCoord = selectedActionList.some((action) =>
		action.type === 'replaceHexWithDead' || (action.type === 'replaceHexColor' && !isPathMode),
	);
	const actionNeedsMove = selectedActionList.some((action) =>
		action.type === 'moveHex' || (action.type === 'replaceHexColor' && isPathMode) || action.type === 'replaceLaneColor'
		|| (action.type === 'grantExtraPlacement' && isPathMode),
	);
	// Seize the Opportunity: the free lane's color is fixed (last placed), and in
	// path mode color == direction, so picking the start determines the end.
	const actionFreeLaneColor = (() => {
		if (!isPathMode) return null;
		const grant = selectedActionList.find((action) => action.type === 'grantExtraPlacement');
		if (!grant) return null;
		return ('color' in grant && grant.color === 'lastPlaced' ? G.action.lastPlacedColor : null);
	})();
	const actionNeedsReplaceColor = selectedActionList.some((action) =>
		action.type === 'replaceHexColor' || action.type === 'replaceLaneColor',
	);
	const actionNeedsStat = selectedActionList.some((action) =>
		['chooseStat', 'setAgendaOverride', 'attachTokenToCard', 'registerTrigger'].includes(action.type)
	);
	const actionNeedsPrefs = selectedActionList.some((action) => action.type === 'reorderPlayerPrefs');
	const actionNeedsRevealedPick = selectedActionList.some((action) => action.type === 'pickOneToHand');
	const actionNeedsDraftPicks = selectedActionList.some((action) => action.type === 'draftInTurnOrder');

	// Pre-select the only possible target so cards like Steal work in one click.
	React.useEffect(() => {
		if (!actionModalOpen || !actionNeedsTargetPlayer || actionTargetPlayer !== '') return;
		const opponents = (ctx.playOrder as PlayerID[]).filter((pid) => pid !== currentPlayer);
		if (opponents.length === 1) setActionTargetPlayer(opponents[0]!);
	}, [actionModalOpen, actionNeedsTargetPlayer, actionTargetPlayer, ctx.playOrder, currentPlayer]);

	const buildActionContext = (): CardActionResolveContext => {
		const ctxBase: CardActionResolveContext = {
			currentPlayerId: currentPlayer,
			playerOrder: ctx.playOrder as PlayerID[],
			lastPlacedColor: G.action.lastPlacedColor,
			mode: rules.MODE,
		};
		if (actionTargetPlayer) ctxBase.targetPlayerId = actionTargetPlayer;
		if (actionChoiceIndex !== '') ctxBase.choiceIndex = Number(actionChoiceIndex);
		const coord = parseCoord(actionCoordInput);
		if (coord) ctxBase.coord = coord;
		if (actionReplaceColor) ctxBase.replaceColor = actionReplaceColor;
		const moveFrom = parseCoord(actionMoveFromInput);
		if (moveFrom) ctxBase.moveFrom = moveFrom;
		const moveTo = parseCoord(actionMoveToInput);
		if (moveTo) ctxBase.moveTo = moveTo;
		if (actionChosenStat) ctxBase.chosenStat = actionChosenStat;
		if (actionPrefPrimary && actionPrefSecondary && actionPrefTertiary) {
			ctxBase.playerPrefs = {
				primary: actionPrefPrimary,
				secondary: actionPrefSecondary,
				tertiary: actionPrefTertiary,
			} satisfies PlayerPrefs;
		}
		if (actionRevealedPickIndex !== '') ctxBase.revealedPickIndex = Number(actionRevealedPickIndex);
		if (actionNeedsDraftPicks) {
			const draftPicks: Record<PlayerID, number> = {};
			for (const pid of ctx.playOrder as PlayerID[]) {
				const raw = actionDraftPicks[pid];
				if (raw === undefined || raw === '') continue;
				const value = Number(raw);
				if (!Number.isNaN(value)) draftPicks[pid] = value;
			}
			if (Object.keys(draftPicks).length > 0) ctxBase.draftPicks = draftPicks;
		}
		if (actionContextJson.trim().length > 0) {
			try {
				const extra = JSON.parse(actionContextJson) as Partial<CardActionResolveContext>;
				return { ...ctxBase, ...extra };
			} catch {
				return ctxBase;
			}
		}
		return ctxBase;
	};

	// Why an action card can't be played right now (null = playable).
	const actionBlockReason = (() => {
		if (!isMyTurn) return 'Not your turn.';
		if (locked) return 'Waiting for the current move to finish.';
		if (rules.ACTION_CARDS === 'disabled') return 'Action cards are disabled in this game.';
		if (rules.ACTION_CARDS === 'unlimited') return null;
		const played = G.players[currentPlayer]?.actionPlaysThisTurn ?? 0;
		const extra = G.action.extraActionPlays[currentPlayer] ?? 0;
		if (played === 0 || extra > 0) return null;
		return 'Action limit reached (one per turn).';
	})();
	const actionLimitAllows = selectedActionCard !== null && actionBlockReason === null;

	const handleModeChange = (newMode: ActionMode) => {
		setActionMode(newMode);
		setDiscardSelection([]);
		setSelectedCard(null);
		setSelectedColor(null);
		setPendingRotationTile(null);
		setSelectedSourceDot(null);
	};

	const humanizeActionError = (msg: string): string => {
		if (msg.includes('targetPlayerId')) return 'Choose a target player.';
		if (msg.includes('coord')) return 'Pick a target hex.';
		if (msg.includes('choiceIndex')) return 'Pick an option.';
		if (msg.includes('moveFrom') || msg.includes('moveTo')) return 'Pick the move source and destination.';
		if (msg.includes('replaceColor')) return 'Pick a replacement color.';
		if (msg.includes('lastPlacedColor')) return 'No lane has been placed yet — there is no color to copy.';
		if (msg.includes('chosenStat')) return 'Pick a stat.';
		return msg;
	};

	let actionResolveError: string | null = null;
	if (selectedActionCard && actionLimitAllows) {
		try {
			const resolved = resolveCardEffects(selectedActionCard, buildActionContext());
			// Board-targeting effects: mirror the engine's pre-check so a bad
			// target reads as an error here instead of a rejected move.
			actionResolveError = actionEffectsInvalidReason(G, resolved);
		} catch (err) {
			actionResolveError = humanizeActionError(err instanceof Error ? err.message : 'Action requires more input.');
		}
	}

	// Ability targeting can't outlive your turn.
	React.useEffect(() => {
		if (!isMyTurn) setAbilityFlow(null);
	}, [isMyTurn]);

	// Universal cancel: Escape unwinds the innermost transient state, one
	// level per press. Every state must be cancellable.
	const escStateRef = React.useRef({
		abilityFlow, actionPickingCoord, actionModalOpen, discardModalOpen,
		pendingRotationTile, actionMode, selectedSourceDot, selectedCard, expandedZone,
	});
	escStateRef.current = {
		abilityFlow, actionPickingCoord, actionModalOpen, discardModalOpen,
		pendingRotationTile, actionMode, selectedSourceDot, selectedCard, expandedZone,
	};
	const shortcutRef = React.useRef<{ undo: () => void; endTurn: () => void; isMyTurn: boolean }>({ undo: () => {}, endTurn: () => {}, isMyTurn: false });
	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
			if (e.key === 'u' || e.key === 'U') { shortcutRef.current.undo(); return; }
			if ((e.key === 'e' || e.key === 'E') && shortcutRef.current.isMyTurn) { shortcutRef.current.endTurn(); return; }
			if (e.key !== 'Escape') return;
			const s = escStateRef.current;
			if (s.abilityFlow !== null) { setAbilityFlow(null); return; }
			if (s.actionPickingCoord !== null) { setActionPickingCoord(null); return; }
			if (s.discardModalOpen) { setDiscardModalOpen(false); return; }
			if (s.actionModalOpen) { setActionModalOpen(false); setSelectedCard(null); setSelectedColor(null); return; }
			if (s.pendingRotationTile !== null) { setPendingRotationTile(null); return; }
			if (s.actionMode !== 'place') {
				setActionMode('place');
				setDiscardSelection([]);
				setPendingRotationTile(null);
				return;
			}
			if (s.selectedSourceDot !== null) { setSelectedSourceDot(null); return; }
			if (s.selectedCard !== null) { setSelectedCard(null); setSelectedColor(null); return; }
			if (s.expandedZone !== null) setExpandedZone(null);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	// ── Sound triggers driven by state changes (covers both players) ──
	const prevLanesRef = React.useRef(G.lanes.length);
	React.useEffect(() => {
		const prev = prevLanesRef.current;
		prevLanesRef.current = G.lanes.length;
		if (G.lanes.length > prev) playSfx('place');
		else if (G.lanes.length < prev) playSfx('block');
	}, [G.lanes.length]);

	// A turn ended (any player's): dramatic hit for everyone; then, if the new
	// turn is yours, the chime rings on top a beat later.
	const prevPlayerRef = React.useRef<string | null>(null);
	React.useEffect(() => {
		const was = prevPlayerRef.current;
		prevPlayerRef.current = currentPlayer;
		if (was === null || was === currentPlayer) return; // initial mount / no change
		if (ctx.gameover || !allSeatsJoined) return;
		playSfx('turn-end');
	}, [currentPlayer, ctx.gameover, allSeatsJoined]);

	const prevMyTurnRef = React.useRef(isMyTurn);
	React.useEffect(() => {
		const was = prevMyTurnRef.current;
		prevMyTurnRef.current = isMyTurn;
		if (!was && isMyTurn && !ctx.gameover && allSeatsJoined) {
			const t = setTimeout(() => playSfx('your-turn'), 380);
			return () => clearTimeout(t);
		}
	}, [isMyTurn, ctx.gameover, allSeatsJoined]);

	React.useEffect(() => {
		if (startBanner) playSfx('game-start');
	}, [startBanner]);

	const gameoverSoundedRef = React.useRef(false);
	React.useEffect(() => {
		if (!ctx.gameover || gameoverSoundedRef.current) return;
		gameoverSoundedRef.current = true;
		playSfx((ctx.gameover as { cancelled?: boolean }).cancelled ? 'cancel' : 'game-over');
	}, [ctx.gameover]);

	const castAbility = (args: MoveUseAbilityArgs) => {
		moves.useNightmareAbility?.(args);
		playSfx('ability');
		setAbilityFlow(null);
	};

	const startAbility = () => {
		const name = getNightmareByName(G.players[myID]?.nightmare)?.name;
		if (!name) return;
		if (name === 'Demon' || name === 'Witch') { setAbilityFlow({ step: 'coord' }); return; }
		if (name === 'Ghost' || name === 'Mutant') { setAbilityFlow({ step: 'edgeFrom' }); return; }
		if (name === 'Dragon' || name === 'Werewolf') { setAbilityFlow({ step: 'source' }); return; }
		if (name === 'Vampire') {
			const opponents = (ctx.playOrder as PlayerID[]).filter(
				(p2) => p2 !== myID && (G.players[p2]?.handSize ?? G.players[p2]?.hand.length ?? 0) > 0,
			);
			if (opponents.length === 1) { castAbility({ targetPlayerId: opponents[0] }); return; }
			setAbilityFlow({ step: 'target' });
			return;
		}
		castAbility({}); // Alien, Blob, Cultist, Robot, Zombie: no target
	};

	const onAbilityBoardClick = (coord: Co, flow: AbilityFlow) => {
		if (flow.step === 'coord') { castAbility({ coord }); return; }
		if (flow.step === 'edgeFrom') { setAbilityFlow({ step: 'edgeTo', from: coord }); return; }
		if (flow.step === 'edgeTo') {
			const { from } = flow;
			const idx = G.lanes.findIndex(
				(ln) =>
					(ln.from.q === from.q && ln.from.r === from.r && ln.to.q === coord.q && ln.to.r === coord.r) ||
					(ln.from.q === coord.q && ln.from.r === coord.r && ln.to.q === from.q && ln.to.r === from.r),
			);
			// No lane on that edge: treat the click as re-picking the first end.
			if (idx === -1) { setAbilityFlow({ step: 'edgeTo', from: coord }); return; }
			if (getNightmareByName(G.players[myID]?.nightmare)?.name === 'Mutant') {
				setAbilityFlow({ step: 'color', laneIndex: idx });
			} else {
				castAbility({ laneIndex: idx });
			}
			return;
		}
		if (flow.step === 'source') { setAbilityFlow({ step: 'dest', source: coord }); return; }
		if (flow.step === 'dest') { castAbility({ source: flow.source, coord }); }
	};

	const onHexClick = (coord: Co) => {
		// Nightmare ability targeting — intercept before everything else.
		if (abilityFlow !== null) {
			onAbilityBoardClick(coord, abilityFlow);
			return;
		}
		// Action card coordinate picking — intercept before normal logic.
		if (actionPickingCoord !== null) {
			const coordStr = `${coord.q},${coord.r}`;
			if (actionPickingCoord === 'coord') {
				setActionCoordInput(coordStr);
				setActionPickingCoord(null);
			} else if (actionPickingCoord === 'moveFrom') {
				setActionMoveFromInput(coordStr);
				if (actionFreeLaneColor) {
					// Free-lane placement: destination is dictated by the color's
					// direction, so fill it in instead of asking for a second pick.
					const dir = rules.COLOR_TO_DIR[actionFreeLaneColor];
					setActionMoveToInput(`${coord.q + dir.q},${coord.r + dir.r}`);
					setActionPickingCoord(null);
				} else {
					setActionPickingCoord('moveTo'); // auto-advance to picking destination
				}
			} else if (actionPickingCoord === 'moveTo') {
				setActionMoveToInput(coordStr);
				setActionPickingCoord(null);
			}
			return;
		}

		if (!isMyTurn || locked) return;

		if (pendingRotationTile !== null) {
			if (key(pendingRotationTile) !== key(coord)) {
				setPendingRotationTile(null);
			}
			return;
		}

		// BLOCK MODE — click a blockable hex to execute
		if (actionMode === 'block') {
			if (!discardReady) return;
			const tile = G.board[key(coord)];
			if (!tile || tile.colors.length > 0 || tile.dead) return;
			if (isOriginCoord(coord)) return;
			moves.blockTile({ coord, handIndices: [...discardSelection] });
			playSfx('block');
			setDiscardSelection([]);
			setActionMode('place');
			return;
		}

		// ROTATE MODE — click a rotatable node/tile to start rotation
		if (actionMode === 'rotate') {
			if (!discardReady || rules.PLACEMENT.DISCARD_TO_ROTATE === false) return;
			if (isPathMode) {
				// Path mode: node must have outgoing lanes
				if (isRotatableNode(G, coord)) {
					setPendingRotationTile(coord);
					return;
				}
			} else {
				// Hex mode: tile must have colors
				const tile = G.board[key(coord)];
				if (tile && tile.colors.length > 0) {
					setPendingRotationTile(coord);
					return;
				}
			}
			return;
		}

		// PATH MODE
		if (isPathMode) {
			if (selectedCard === null) return;
			const card = myHand[selectedCard];
			if (!card) return;

			if (selectedSourceDot === null) {
				const validDests = getValidDestinations(coord, card.colors);
				if (validDests.length > 0) {
					setSelectedSourceDot(coord);
					// Default pick to first card color; user can override via onPickColor.
					setSelectedColor(
						(selectedColor && card.colors.includes(selectedColor))
							? selectedColor
							: (card.colors[0] ?? null)
					);
				}
				return;
			}

			if (key(coord) === key(selectedSourceDot)) {
				setSelectedSourceDot(null);
				setSelectedColor(null);
				return;
			}

			// Normal path placement: direction determines required color.
			const dirColor = getColorForDirection(selectedSourceDot, coord);
			if (dirColor && card.colors.includes(dirColor) && canPlacePath(G, selectedSourceDot, coord, dirColor, rules)) {
				moves.playCard({ handIndex: selectedCard, pick: dirColor, source: selectedSourceDot, coord });
				setSelectedCard(null);
				setSelectedColor(null);
				setSelectedSourceDot(null);
				return;
			}

			// Consolidation-class moves: conversion of an existing lane, or the
			// finishing placement into the origin. Prefer the explicitly selected
			// color, then any other card color.
			{
				const tried = new Set<string>();
				const candidates: Color[] = [];
				if (selectedColor && card.colors.includes(selectedColor)) candidates.push(selectedColor);
				for (const col of card.colors) candidates.push(col as Color);
				for (const col of candidates) {
					if (tried.has(col)) continue;
					tried.add(col);
					if (col !== dirColor && canPlacePath(G, selectedSourceDot, coord, col, rules)) {
						// Off-direction legal placement = finishing move into the origin.
						moves.playCard({ handIndex: selectedCard, pick: col, source: selectedSourceDot, coord });
						setSelectedCard(null);
						setSelectedColor(null);
						setSelectedSourceDot(null);
						return;
					}
					const fromColor = findConvertibleColor(selectedSourceDot, coord, col);
					if (fromColor) {
						moves.playCard({ handIndex: selectedCard, pick: col, source: selectedSourceDot, coord, convert: fromColor });
						setSelectedCard(null);
						setSelectedColor(null);
						setSelectedSourceDot(null);
						return;
					}
				}
			}

			const validDests = getValidDestinations(coord, card.colors);
			if (validDests.length > 0) {
				setSelectedSourceDot(coord);
				setSelectedColor(
					(selectedColor && card.colors.includes(selectedColor))
						? selectedColor
						: (card.colors[0] ?? null)
				);
			} else {
				setSelectedSourceDot(null);
				setSelectedColor(null);
			}
			return;
		}

		// HEX MODE
		if (selectedCard === null) return;
		const card = myHand[selectedCard];
		if (!card) return;

		if (selectedColor) {
			if (canPlace(G, coord, selectedColor, rules)) {
				moves.playCard({ handIndex: selectedCard, pick: selectedColor, coord });
				setSelectedCard(null);
				setSelectedColor(null);
			}
			return;
		}
		for (const color of card.colors) {
			if (canPlace(G, coord, color, rules)) {
				moves.playCard({ handIndex: selectedCard, pick: color, coord });
				setSelectedCard(null);
				setSelectedColor(null);
				return;
			}
		}
	};

	const onPickColor = (index: number, color: Color) => {
		if (locked) return;
		setSelectedCard(index);
		setSelectedColor(color);
		setSelectedSourceDot(null);
	};

	const handleRotation = (rotation: number) => {
		if (pendingRotationTile === null || !discardReady) return;
		moves.rotateTile({ coord: pendingRotationTile, handIndices: [...discardSelection], rotation });
		playSfx('rotate');
		setPendingRotationTile(null);
		setDiscardSelection([]);
		setActionMode('place');
	};

	React.useEffect(() => {
		if (locked) {
			setSelectedCard(null);
			setSelectedColor(null);
			setActionMode('place');
			setDiscardSelection([]);
			setRotatable([]);
			setPendingRotationTile(null);
			setSelectedSourceDot(null);
		}
	}, [locked]);

	React.useEffect(() => {
		if (actionMode === 'rotate' && isMyTurn && !locked) {
			const coords = buildAllCoords(G.radius);
			if (isPathMode) {
				// Path mode: nodes with outgoing lanes
				setRotatable(coords.filter(c => isRotatableNode(G, c)));
			} else {
				// Hex mode: occupied tiles
				setRotatable(coords.filter((c) => {
					const tile = G.board[key(c)];
					return tile && tile.colors.length > 0;
				}));
			}
		} else {
			setRotatable([]);
		}
	}, [actionMode, G.board, G.lanes, G.radius, isMyTurn, isPathMode, locked]);

	// Bot play is handled by useBotClients hook at the App level — no more viewer-switching.

	const onEndTurn = () => {
		if (moves.endTurnAndRefill) moves.endTurnAndRefill();
	};
	const onStash = () => {
		if (selectedCard !== null) {
			moves.stashToTreasure?.({ handIndex: selectedCard });
			setSelectedCard(null);
			setSelectedColor(null);
		}
	};
	const onPlayAction = () => {
		if (selectedCard === null) return;
		const card = myHand[selectedCard];
		if (!card || !card.isAction) return;
		if (!actionLimitAllows) return;
		try {
			const effects = resolveCardEffects(card, buildActionContext());
			moves.playActionCard?.({ handIndex: selectedCard, effects });
			playSfx('action');
			setSelectedCard(null);
			setSelectedColor(null);
			setSelectedSourceDot(null);
			setPendingRotationTile(null);
			setRotatable([]);
		} catch (err) {
			console.warn('Action card could not resolve:', err);
		}
	};
	const onTakeTreasure = (i: number) => moves.takeFromTreasure && moves.takeFromTreasure({ index: i });

	const scores = computeScores(G);
	const viewerPlayer = G.players[myID];
	const stashBonus = isMyTurn ? (viewerPlayer?.stashBonus ?? 0) : 0;
	const viewerNightmare = getNightmareByName(viewerPlayer?.nightmare);
	const viewerNightmareState = viewerPlayer?.nightmareState;
	const viewerPrefs = viewerPlayer?.prefs;

	// Undo is enabled only when a move remains to undo this turn and the
	// last remaining one is undoable — a non-undoable move (an action card)
	// also locks everything played before it. Undone moves stay in the log
	// with an UNDO entry appended, so remaining = moves − undos.
	const canUndo = (() => {
		const thisTurn = Array.isArray(log)
			? (log as Array<{ turn?: number; action?: { type?: string; payload?: { type?: string } } }>).filter(
					(e) => e.turn === ctx.turn,
				)
			: [];
		const movesMade = thisTurn.filter((e) => e.action?.type === 'MAKE_MOVE');
		const undosDone = thisTurn.filter((e) => e.action?.type === 'UNDO').length;
		const remaining = movesMade.slice(0, Math.max(0, movesMade.length - undosDone));
		const lastMove = remaining[remaining.length - 1]?.action?.payload?.type;
		return isMyTurn && lastMove !== undefined && lastMove !== 'playActionCard' && lastMove !== 'cancelMatch';
	})();

	const handleUndo = () => {
		if (!canUndo) return;
		undo();
		playSfx('undo');
		setSelectedCard(null);
		setSelectedColor(null);
		setPendingRotationTile(null);
		setRotatable([]);
		setActionMode('place');
		setDiscardSelection([]);
	};

	// Every button says what it does — and, when disabled, why.
	const canStash = isMyTurn && selectedCard !== null && stage === 'active' && G.treasure.length < rules.TREASURE_MAX;
	const stashTitle = !isMyTurn
		? 'Wait for your turn'
		: selectedCard === null
			? 'Select a card first, then stash it to Treasure (you draw an extra card at end of turn)'
			: G.treasure.length >= rules.TREASURE_MAX
				? 'Treasure is full'
				: `Stash the selected card to Treasure — draw ${1 + stashBonus} extra at end of turn`;

	shortcutRef.current = { undo: handleUndo, endTurn: onEndTurn, isMyTurn };

	// Hearthstone-style cue: End Turn glows when nothing in hand can be
	// placed anywhere, so it's clearly time to pass.
	const hasAnyPlay = React.useMemo(() => {
		if (!isMyTurn || locked) return true; // no glow when it isn't your decision
		if (!isPathMode) return true;
		const coords = buildAllCoords(G.radius);
		for (const card of myHand) {
			if (card.isAction) return true; // an action card is always a potential play
			for (const source of coords) {
				if (getValidDestinations(source, card.colors as Color[]).length > 0) return true;
			}
		}
		return false;
		// eslint-disable-next-line react-hooks/exhaustive-deps -- getValidDestinations captures only listed deps
	}, [G, isMyTurn, isPathMode, locked, myHand]);

	// Undo / stash / end-turn toolbar. Mobile: floating bar. Desktop: docked
	// into the shelf's right end.
	const floatingToolbar = (
		<div className="floating-toolbar">
			<button
				className="floating-action floating-action--pill"
				onClick={handleUndo}
				disabled={!canUndo}
				title={canUndo ? 'Undo your last move (U)' : 'Nothing to undo this turn'}
			>
				<Icon name="undo" />
				<span className="floating-action__label">Undo</span>
			</button>
			<button
				className="floating-action floating-action--pill"
				onClick={onStash}
				disabled={!canStash}
				title={stashTitle}
			>
				<Icon name="stash" />
				<span className="floating-action__label">Stash</span>
			</button>
			<button
				className={`floating-action floating-action--pill floating-action--primary ${isMyTurn && !hasAnyPlay ? 'floating-action--glow' : ''}`}
				onClick={onEndTurn}
				disabled={!isMyTurn}
				title={isMyTurn ? 'End your turn and refill your hand (E)' : 'Wait for your turn'}
			>
				<Icon name="hourglass" />
				<span className="floating-action__label">End Turn</span>
			</button>
		</div>
	);


	return (
		<div className="game-layout">
			{/* MOBILE STATUS BAR */}
			<MobileStatusBar
				currentPlayer={currentPlayer as PlayerID}
				currentPlayerScore={scores[currentPlayer as PlayerID] ?? 0}
				currentPlayerGoals={G.players[currentPlayer as PlayerID]!.prefs}
				viewer={myID}
				viewerScore={scores[myID] ?? 0}
				viewerGoals={viewerPlayer!.prefs}
				isViewerTurn={isMyTurn}
				deckCount={G.deckSize ?? G.secret.deck.length}
			/>

			{/* MOBILE PLAYER ICONS */}
			<div className="mobile-player-icons">
				{(ctx.playOrder as PlayerID[]).map((pid) => {
					const prefs = G.players[pid]?.prefs;
					const isCurrent = pid === currentPlayer;
					return (
						<button
							key={pid}
							className={`mobile-player-icon ${isCurrent ? 'mobile-player-icon--active' : ''}`}
							onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
							aria-label={`P${pid} — open players`}
						>
							<span className="mobile-player-icon__id">P{pid}</span>
							{prefs && (
								<div className="mobile-player-icon__dots">
									{([prefs.primary, prefs.secondary, prefs.tertiary] as Color[]).map((col, i) => (
										<span
											key={`${col}-${i}`}
											className="mobile-player-icon__dot"
											style={{ background: asVisibleColor(col) }}
										/>
									))}
								</div>
							)}
						</button>
					);
				})}
			</div>

			{/* LEFT PANEL - Players (desktop + mobile menu) */}
			<aside className={`game-players ${mobileMenuOpen ? 'game-players--open' : ''}`}>
				<div className="game-players__header">
					<h2 className="game-players__title">Players</h2>
					<div className="game-players__info">
						<span className="deck-count">
							<span className="deck-count__icon">◆</span>
							{G.deckSize ?? G.secret.deck.length}
						</span>
						<span className="deck-count deck-count--discard">
							<span className="deck-count__icon">◇</span>
							{G.discard.length}
						</span>
					</div>
					<button
						className="game-players__close"
						onClick={() => setMobileMenuOpen(false)}
						aria-label="Close menu"
					>
						×
					</button>
				</div>
				<div className="game-players__list">
					{(ctx.playOrder as PlayerID[]).map((pid) => (
						<PlayerCard
							key={pid}
							pid={pid}
							isTurn={pid === currentPlayer}
							score={scores[pid] ?? 0}
							goals={G.players[pid]!.prefs}
							nightmareName={G.players[pid]?.nightmare}
							name={isNetworked ? nameOf(pid) : null}
							botSelectable={!isNetworked}
							botKind={botByPlayer[pid] ?? 'None'}
							onBotChange={(bot) => setBotFor(pid, bot)}
							isViewer={pid === myID}
							onSetViewer={() => {
								onSetViewer(pid);
								setMobileMenuOpen(false);
							}}
							handSize={G.players[pid]?.handSize ?? G.players[pid]?.hand.length ?? 0}
							onHandClick={() => setViewingHandOf(viewingHandOf === pid ? null : pid)}
						/>
					))}
				</div>
				<div className="game-players__nightmare">
					<div className="hand-nightmare__header">
						<span className="hand-nightmare__label">Nightmare</span>
						<span className="hand-nightmare__player">P{myID}</span>
					</div>
					{viewerNightmare ? (
						<div className="hand-nightmare__body">
							<div className="hand-nightmare__name">{viewerNightmare.name}</div>
							<div className="hand-nightmare__row">
								<span className="hand-nightmare__row-label">Evil Plan</span>
								<span className="hand-nightmare__row-value">{viewerNightmare.evilPlan}</span>
							</div>
							<div className="hand-nightmare__row">
								<span className="hand-nightmare__row-label">Classes</span>
								<div className="hand-nightmare__tags">
									{viewerNightmare.classes.map((tag) => (
										<span key={tag} className="hand-nightmare__tag">{tag}</span>
									))}
								</div>
							</div>
							<div className="hand-nightmare__row">
								<span className="hand-nightmare__row-label">Ability</span>
								<div className="hand-nightmare__ability">
									<div className="hand-nightmare__ability-name">{viewerNightmare.ability.name}</div>
									<div className="hand-nightmare__ability-effect">{viewerNightmare.ability.effect}</div>
									{viewerNightmareState && (
										<div className="hand-nightmare__ability-uses">
											Uses left: {viewerNightmareState.abilityUsesRemaining}
										</div>
									)}
									{isMyTurn && !locked && !ctx.gameover && (viewerNightmareState?.abilityUsesRemaining ?? 0) > 0 && (
										<button
											className="hand-nightmare__use-btn"
											onClick={startAbility}
											disabled={abilityFlow !== null}
										>
											{abilityFlow !== null ? 'Choosing target…' : <><Icon name="sparkles" size={14} /> Use Ability</>}
										</button>
									)}
								</div>
							</div>
							{viewerPrefs && (
								<div className="hand-nightmare__row">
									<span className="hand-nightmare__row-label">Priorities</span>
									<div className="hand-nightmare__priorities">
										{([viewerPrefs.primary, viewerPrefs.secondary, viewerPrefs.tertiary] as Color[]).map((col, i) => (
											<span
												key={`${col}-${i}`}
												className="hand-nightmare__priority-dot"
												style={{ background: asVisibleColor(col), boxShadow: `0 0 ${6 - i * 2}px ${asVisibleColor(col)}` }}
											/>
										))}
									</div>
								</div>
							)}
						</div>
					) : (
						<div className="hand-nightmare__empty">Nightmare pending...</div>
					)}
				</div>
				<div className="game-players__controls">
					{!isNetworked && (
						<button
							className={`ai-pause-btn ${aiPaused ? 'ai-pause-btn--paused' : ''}`}
							onClick={() => setAiPaused(!aiPaused)}
							title={aiPaused ? 'Resume AI' : 'Pause AI'}
						>
							{aiPaused ? '▶ Resume AI' : '⏸ Pause AI'}
						</button>
					)}
					{isNetworked && !ctx.gameover && (
						<button
							className="cancel-match-btn"
							onClick={handleCancelMatch}
							title="End this match for everyone"
						>
							✕ Cancel Match
						</button>
					)}
				</div>
			</aside>

			{/* MOBILE OVERLAY */}
			{mobileMenuOpen && (
				<div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
			)}

			{/* RIGHT PANEL - Board */}
			{/* Zones collapse via their own hover-out grace period (CardZone), not
			    the instant the pointer reaches the board. */}
			<main
				className={`game-board ${boardInteractable ? 'game-board--active' : 'game-board--inactive'}`}
			>
				<HexBoard
					rules={rules}
					board={G.board}
					lanes={G.lanes}
					radius={G.radius}
					onHexClick={onHexClick}
					highlightCoords={actionMode === 'rotate' ? rotatable : actionMode === 'block' ? blockableCoords : availableMoveCoords}
					highlightColor={actionMode === 'rotate' ? '#8b5cf6' : actionMode === 'block' ? '#ef4444' : (selectedColor ? asVisibleColor(selectedColor) : '#8b5cf6')}
					highlightColorByCoord={actionMode === 'place' ? highlightColorByCoord : undefined}
					highlightIsRotation={actionMode === 'rotate'}
					origins={G.origins}
					pendingRotationTile={pendingRotationTile}
					onRotationSelect={handleRotation}
					selectedColor={actionMode !== 'place' ? null : selectedColor}
					selectedSourceDot={selectedSourceDot}
					showCoords={showCoords}
				/>
			</main>

			{/* BACKGROUND DIM — subtle overlay when a zone is expanded */}
			{expandedZone !== null && !isMobile && (
				<div className="zone-backdrop-dim" onClick={() => setExpandedZone(null)} />
			)}

			{/* CARD SHELF — persistent desktop hand (mobile uses the tab bar) */}
			{!isMobile && (
				<>
					<Shelf
						rules={rules}
						cards={myHand}
						selectedIndex={actionMode === 'place' ? selectedCard : null}
						discardSelection={discardSelection}
						discardMode={actionMode !== 'place'}
						onSelect={(index) => {
							if (actionMode !== 'place') {
								// Multi-select for discard cost
								setDiscardSelection((prev) => {
									if (prev.includes(index)) return prev.filter((i) => i !== index);
									if (prev.length >= discardNeeded) return prev;
									return [...prev, index];
								});
								return;
							}
							// Place mode: single select
							if (selectedCard === index) {
								setSelectedCard(null);
								setSelectedColor(null);
								setSelectedSourceDot(null);
								return;
							}
							setSelectedCard(index);
							setSelectedSourceDot(null);
							const c = myHand[index];
							if (!c) return;
							if (isPathMode) setSelectedColor(null);
						}}
						onPickColor={(index, color) => {
							if (actionMode !== 'place') return;
							onPickColor(index, color);
						}}
						deckCount={G.deckSize ?? G.secret.deck.length}
						discardCount={G.discard.length}
						onOpenDiscard={() => setDiscardModalOpen(true)}
						topSlot={
							<ActionModeStrip
								mode={actionMode}
								onModeChange={handleModeChange}
								canRotate={canRotateRule}
								canBlock={canBlockRule}
								rotateCost={rotateCost}
								blockCost={blockCost}
								disabled={!isMyTurn || locked}
								discardCount={discardSelection.length}
								discardNeeded={discardNeeded}
								handSize={myHand.length}
							/>
						}
					>
						{floatingToolbar}
					</Shelf>

					{/* Discard-cost tray: a distinct prompt so the cost never reads
					    as "back to your hand". */}
					{actionMode !== 'place' && (
						<div className="discard-tray">
							<span className="discard-tray__title">
								<Icon name={actionMode === 'block' ? 'ban' : 'rotate'} size={14} /> {actionMode === 'block' ? 'Block' : 'Rotate'} — discard {discardNeeded} card{discardNeeded > 1 ? 's' : ''}
							</span>
							<div className="discard-tray__slots">
								{Array.from({ length: discardNeeded }, (_, i) => {
									const idx = discardSelection[i];
									return (
										<div
											key={`tray-${i}`}
											className={`discard-tray__slot ${idx !== undefined ? 'discard-tray__slot--filled' : ''}`}
										>
											{idx !== undefined ? myHand[idx]?.name : '+'}
										</div>
									);
								})}
							</div>
							<span className="discard-tray__hint">
								{discardReady
									? (actionMode === 'block' ? 'Now click a highlighted tile' : 'Now click a highlighted node')
									: 'Pick cards from your hand'}
							</span>
							<button className="discard-tray__cancel" onClick={() => handleModeChange('place')}>
								Cancel (Esc)
							</button>
						</div>
					)}

					<Treasure
						rules={rules}
						cards={G.treasure}
						onTake={onTakeTreasure}
						isExpanded={expandedZone === 'treasure'}
						onExpandChange={handleZoneExpand('treasure')}
					/>

					{/* Discard browser (opened from the shelf pile) */}
					{discardModalOpen && (
						<div className="modal-overlay" onClick={() => setDiscardModalOpen(false)}>
							<div className="modal-content discard-modal" onClick={(e) => e.stopPropagation()}>
								<div className="modal-header">
									<h2>Discard ({G.discard.length})</h2>
									<button className="modal-close" onClick={() => setDiscardModalOpen(false)}>×</button>
								</div>
								<div className="modal-body discard-modal__grid">
									{G.discard.map((card, i) => (
										<NeuralCard
											key={`dm-${card.id}-${i}`}
											card={card}
											isSelected={false}
											rules={rules}
											onSelect={() => {}}
											onPickColor={() => {}}
										/>
									))}
									{G.discard.length === 0 && <div className="discard-modal__empty">Nothing discarded yet</div>}
								</div>
							</div>
						</div>
					)}
				</>
			)}

			{/* MOBILE ZONE TAB BAR + EXPANDED CONTENT */}
			{isMobile && (
				<>
					<ZoneTabBar
						expandedZone={expandedZone}
						onZoneToggle={(zone) => setExpandedZone(expandedZone === zone ? null : zone)}
						handCount={myHand.length}
						treasureCount={G.treasure.length}
						discardCount={G.discard.length}
						hasHandSelection={actionMode === 'place' ? selectedCard !== null : discardSelection.length > 0}
						handSelectionColor={actionMode === 'place' && selectedColor ? asVisibleColor(selectedColor) : null}
					/>
					{expandedZone === 'hand' && (
						<div className="mobile-zone-panel">
							<div className="mobile-zone-panel__cards">
								{myHand.map((card, i) => (
									<NeuralCard
										key={`${serializeCard(card)}-${i}`}
										card={card}
										isSelected={actionMode !== 'place' ? discardSelection.includes(i) : i === selectedCard}
										rules={rules}
										onSelect={() => {
											if (actionMode !== 'place') {
												setDiscardSelection((prev) => {
													if (prev.includes(i)) return prev.filter((idx) => idx !== i);
													if (prev.length >= discardNeeded) return prev;
													return [...prev, i];
												});
												return;
											}
											if (selectedCard === i) {
												setSelectedCard(null);
												setSelectedColor(null);
												setSelectedSourceDot(null);
												return;
											}
											setSelectedCard(i);
											setSelectedSourceDot(null);
											const c = myHand[i];
											if (!c) return;
											if (isPathMode) setSelectedColor(null);
											// Close the panel so the board is immediately visible for
											// placement; the tab bar keeps showing the selection.
											setExpandedZone(null);
										}}
										onPickColor={(color) => {
											onPickColor(i, color);
											setExpandedZone(null);
										}}
									/>
								))}
							</div>
						</div>
					)}
					{expandedZone === 'treasure' && (
						<div className="mobile-zone-panel">
							<div className="mobile-zone-panel__cards">
								{G.treasure.map((card, i) => (
									<TreasureCard
										key={`${serializeCard(card)}-${i}`}
										card={card}
										rules={rules}
										onTake={() => onTakeTreasure(i)}
									/>
								))}
								{G.treasure.length === 0 && (
									<div className="mobile-zone-panel__empty">No treasure</div>
								)}
							</div>
						</div>
					)}
					{expandedZone === 'discard' && (
						<div className="mobile-zone-panel">
							<div className="mobile-zone-panel__cards">
								{G.discard.map((card, i) => (
									<NeuralCard
										key={`discard-${card.id}-${i}`}
										card={card}
										isSelected={false}
										rules={rules}
										onSelect={() => {}}
										onPickColor={() => {}}
									/>
								))}
								{G.discard.length === 0 && (
									<div className="mobile-zone-panel__empty">No discards</div>
								)}
							</div>
						</div>
					)}
				</>
			)}

			{/* NIGHTMARE ABILITY TARGETING BANNER */}
			{abilityFlow !== null && (
				<div className="coord-pick-banner">
					<span className="coord-pick-banner__text">
						{abilityFlow.step === 'coord' && 'Click a node on the path to destroy'}
						{abilityFlow.step === 'edgeFrom' && 'Click one end of the lane'}
						{abilityFlow.step === 'edgeTo' && 'Click the other end of the lane'}
						{abilityFlow.step === 'source' && 'Click the node to build from'}
						{abilityFlow.step === 'dest' && 'Click the destination node'}
						{abilityFlow.step === 'target' && 'Steal from:'}
						{abilityFlow.step === 'color' && 'New color:'}
					</span>
					{abilityFlow.step === 'target' &&
						(ctx.playOrder as PlayerID[])
							.filter((p2) => p2 !== myID)
							.map((p2) => (
								<button
									key={`ab-target-${p2}`}
									className="coord-pick-banner__cancel"
									onClick={() => castAbility({ targetPlayerId: p2 })}
								>
									{nameOf(p2) ?? `P${p2}`}
								</button>
							))}
					{abilityFlow.step === 'color' &&
						(rules.COLORS as Color[])
							.filter((c2) => G.lanes[abilityFlow.laneIndex]?.color !== c2)
							.map((c2) => (
								<button
									key={`ab-color-${c2}`}
									className="ability-color-btn"
									style={{ background: asVisibleColor(c2) }}
									onClick={() => castAbility({ laneIndex: abilityFlow.laneIndex, color: c2 })}
									title={c2}
								/>
							))}
					<button className="coord-pick-banner__cancel" onClick={() => setAbilityFlow(null)}>
						Cancel
					</button>
				</div>
			)}

			{/* COORD PICKING BANNER — shown when board is active for picking */}
			{actionPickingCoord !== null && (
				<div className="coord-pick-banner">
					<span className="coord-pick-banner__text">
						{actionPickingCoord === 'coord' && 'Click a hex to select target'}
						{actionPickingCoord === 'moveFrom' && (actionFreeLaneColor
							? `Click where the free ${actionFreeLaneColor} lane starts`
							: actionNeedsReplaceColor
								? 'Click one end of the lane to recolor'
								: 'Click a hex to select source')}
						{actionPickingCoord === 'moveTo' && (actionNeedsReplaceColor
							? 'Click the other end of the lane'
							: 'Click a hex to select destination')}
					</span>
					<button
						className="coord-pick-banner__cancel"
						onClick={() => setActionPickingCoord(null)}
					>
						Cancel
					</button>
				</div>
			)}

			{/* ACTION CARD MODAL — hidden (not unmounted) during coord picking */}
			{actionModalOpen && selectedActionCard?.isAction && (
				<ActionCardModal
					card={selectedActionCard}
					rules={rules}
					onClose={() => {
						setSelectedCard(null);
						setSelectedColor(null);
						setActionModalOpen(false);
						setActionPickingCoord(null);
					}}
					hidden={actionPickingCoord !== null}
				>
					<div className="action-panel__grid">
						{actionNeedsTargetPlayer && (
							<label className="action-panel__field">
								<span className="action-panel__label">Target Player</span>
								<select
									className="action-panel__select"
									value={actionTargetPlayer}
									onChange={(e) => setActionTargetPlayer(e.target.value as PlayerID)}
								>
									<option value="">Select player</option>
									{ctx.playOrder.map((pid) => (
										<option key={`ap-${pid}`} value={pid}>
											P{pid}{pid === currentPlayer ? ' (you)' : ''}
										</option>
									))}
								</select>
							</label>
						)}
						{actionNeedsChoice && (
							<label className="action-panel__field">
								<span className="action-panel__label">Choice</span>
								<select
									className="action-panel__select"
									value={actionChoiceIndex}
									onChange={(e) => setActionChoiceIndex(e.target.value)}
								>
									{(() => {
										const choice = selectedActionList.find((action) => action.type === 'choice') as { type: 'choice'; options: CardAction[][] } | undefined;
										if (!choice) return null;
										const describeOption = (actions: CardAction[]): string => {
											return actions.map((a) => {
												switch (a.type) {
													case 'grantExtraPlacements': return `+${a.count} hex placements`;
													case 'grantExtraActionPlays': return `+${a.count} action plays`;
													case 'grantExtraPlay': return `+${a.count} extra plays`;
													case 'drawCards': return `Draw ${a.count}`;
													default: return a.type;
												}
											}).join(', ');
										};
										return choice.options.map((actions, i) => (
											<option key={`choice-${i}`} value={String(i)}>
												{describeOption(actions)}
											</option>
										));
									})()}
								</select>
							</label>
						)}
						{actionNeedsCoord && (
							<div className="action-panel__field">
								<span className="action-panel__label">Target Hex</span>
								<div className="action-panel__coord-pick">
									{actionCoordInput ? (
										<>
											<span className="action-panel__coord-value">{actionCoordInput}</span>
											<button
												className="action-panel__coord-btn"
												onClick={() => setActionPickingCoord('coord')}
											>
												Re-pick
											</button>
										</>
									) : (
										<button
											className="action-panel__coord-btn action-panel__coord-btn--primary"
											onClick={() => setActionPickingCoord('coord')}
										>
											Pick on board
										</button>
									)}
								</div>
							</div>
						)}
						{actionNeedsMove && (
							<>
								<div className="action-panel__field">
									<span className="action-panel__label">
										{actionFreeLaneColor ? 'Lane start' : actionNeedsReplaceColor ? 'Lane end A' : 'Move From'}
									</span>
									<div className="action-panel__coord-pick">
										{actionMoveFromInput ? (
											<>
												<span className="action-panel__coord-value">{actionMoveFromInput}</span>
												<button
													className="action-panel__coord-btn"
													onClick={() => setActionPickingCoord('moveFrom')}
												>
													Re-pick
												</button>
											</>
										) : (
											<button
												className="action-panel__coord-btn action-panel__coord-btn--primary"
												onClick={() => setActionPickingCoord('moveFrom')}
											>
												Pick on board
											</button>
										)}
									</div>
								</div>
								<div className="action-panel__field">
									<span className="action-panel__label">
										{actionFreeLaneColor ? 'Lane end (auto)' : actionNeedsReplaceColor ? 'Lane end B' : 'Move To'}
									</span>
									<div className="action-panel__coord-pick">
										{actionMoveToInput ? (
											<>
												<span className="action-panel__coord-value">{actionMoveToInput}</span>
												<button
													className="action-panel__coord-btn"
													onClick={() => setActionPickingCoord('moveTo')}
												>
													Re-pick
												</button>
											</>
										) : (
											<button
												className="action-panel__coord-btn"
												disabled={!actionMoveFromInput}
												onClick={() => setActionPickingCoord('moveTo')}
											>
												{actionMoveFromInput ? 'Pick on board' : 'Pick "from" first'}
											</button>
										)}
									</div>
								</div>
							</>
						)}
						{actionNeedsReplaceColor && (
							<label className="action-panel__field">
								<span className="action-panel__label">Replace Color</span>
								<select
									className="action-panel__select"
									value={actionReplaceColor}
									onChange={(e) => setActionReplaceColor(e.target.value as Color)}
								>
									<option value="">Select color</option>
									{rules.COLORS.map((col) => (
										<option key={`rc-${col}`} value={col}>
											{col}
										</option>
									))}
								</select>
							</label>
						)}
						{actionNeedsStat && (
							<label className="action-panel__field">
								<span className="action-panel__label">Stat</span>
								<select
									className="action-panel__select"
									value={actionChosenStat}
									onChange={(e) => setActionChosenStat(e.target.value as Stat)}
								>
									<option value="">Select stat</option>
									{['vitality', 'form', 'freedom', 'sanity', 'will', 'hope'].map((stat) => (
										<option key={`stat-${stat}`} value={stat}>
											{stat}
										</option>
									))}
								</select>
							</label>
						)}
						{actionNeedsPrefs && (
							<>
								<label className="action-panel__field">
									<span className="action-panel__label">Primary</span>
									<select
										className="action-panel__select"
										value={actionPrefPrimary}
										onChange={(e) => setActionPrefPrimary(e.target.value as Color)}
									>
										<option value="">Select</option>
										{rules.COLORS.map((col) => (
											<option key={`pp-${col}`} value={col}>
												{col}
											</option>
										))}
									</select>
								</label>
								<label className="action-panel__field">
									<span className="action-panel__label">Secondary</span>
									<select
										className="action-panel__select"
										value={actionPrefSecondary}
										onChange={(e) => setActionPrefSecondary(e.target.value as Color)}
									>
										<option value="">Select</option>
										{rules.COLORS.map((col) => (
											<option key={`ps-${col}`} value={col}>
												{col}
											</option>
										))}
									</select>
								</label>
								<label className="action-panel__field">
									<span className="action-panel__label">Tertiary</span>
									<select
										className="action-panel__select"
										value={actionPrefTertiary}
										onChange={(e) => setActionPrefTertiary(e.target.value as Color)}
									>
										<option value="">Select</option>
										{rules.COLORS.map((col) => (
											<option key={`pt-${col}`} value={col}>
												{col}
											</option>
										))}
									</select>
								</label>
							</>
						)}
						{actionNeedsRevealedPick && (
							<label className="action-panel__field">
								<span className="action-panel__label">Pick Index</span>
								<input
									className="action-panel__input"
									type="number"
									min="0"
									value={actionRevealedPickIndex}
									onChange={(e) => setActionRevealedPickIndex(e.target.value)}
								/>
							</label>
						)}
						{actionNeedsDraftPicks && (
							<div className="action-panel__field action-panel__field--full">
								<span className="action-panel__label">Draft Picks (by player)</span>
								<div className="action-panel__draft">
									{ctx.playOrder.map((pid) => (
										<label key={`dp-${pid}`} className="action-panel__draft-row">
											<span>P{pid}</span>
											<input
												className="action-panel__input action-panel__input--compact"
												type="number"
												min="0"
												value={actionDraftPicks[pid] ?? ''}
												onChange={(e) =>
													setActionDraftPicks((prev) => ({ ...prev, [pid]: e.target.value }))
												}
											/>
										</label>
									))}
								</div>
							</div>
						)}
						<label className="action-panel__field action-panel__field--full">
							<span className="action-panel__label">Context JSON (optional)</span>
							<textarea
								className="action-panel__textarea"
								placeholder='{"targetPlayerId":"1","coord":{"q":0,"r":0}}'
								value={actionContextJson}
								onChange={(e) => setActionContextJson(e.target.value)}
							/>
						</label>
					</div>
					<div className="action-panel__footer">
						<button
							className="action-panel__button"
							onClick={onPlayAction}
							disabled={!actionLimitAllows || actionResolveError !== null}
							title={actionBlockReason ?? actionResolveError ?? 'Play action card'}
						>
							Play Action
						</button>
						{actionBlockReason && (
							<div className="action-panel__error">{actionBlockReason}</div>
						)}
						{actionResolveError && (
							<div className="action-panel__error">{actionResolveError}</div>
						)}
					</div>
				</ActionCardModal>
			)}

			{/* PLAYER HAND DISPLAY */}
			{viewingHandOf !== null && (
				<PlayerHandModal
					pid={viewingHandOf}
					handSize={G.players[viewingHandOf]?.handSize ?? G.players[viewingHandOf]?.hand.length ?? 0}
					onClose={() => setViewingHandOf(null)}
				/>
			)}

			{/* ACTION MODE STRIP — mobile keeps the floating strip; desktop docks
			    it into the shelf (modes are hand-actions). */}
			{isMobile && (
				<ActionModeStrip
					mode={actionMode}
					onModeChange={handleModeChange}
					canRotate={canRotateRule}
					canBlock={canBlockRule}
					rotateCost={rotateCost}
					blockCost={blockCost}
					disabled={!isMyTurn || locked}
					discardCount={discardSelection.length}
					discardNeeded={discardNeeded}
					handSize={myHand.length}
				/>
			)}

			{/* FLOATING ACTIONS TOOLBAR (mobile; desktop docks it in the shelf) */}
			{isMobile && floatingToolbar}

			{/* Secret export state button (desktop only — a dev tool) */}
			<button
				className="secret-export-btn"
				onClick={() => {
					navigator.clipboard.writeText(JSON.stringify(G));
					setExportCopied(true);
					setTimeout(() => setExportCopied(false), 1200);
				}}
				title="Export state to clipboard (for Lab)"
			>
				{exportCopied ? <Icon name="check" size={13} /> : <Icon name="gear" size={13} />}
			</button>

			{/* Your-turn indicator (desktop; the mobile status bar has its own) */}
			{isMyTurn && !ctx.gameover && allSeatsJoined && (
				<div className="turn-pill">Your turn</div>
			)}

			{/* WAITING ROOM — network match, not all seats claimed yet */}
			{isNetworked && !allSeatsJoined && !ctx.gameover && (
				<div className="waiting-room-overlay">
					<div className="waiting-room">
						<h2>Waiting for players…</h2>
						{network && (
							<>
								<div className="waiting-room__match">
									<span className="waiting-room__match-label">Match code</span>
									<code className="waiting-room__code">{network.matchID}</code>
									<button
										className="waiting-room__copy"
										onClick={() => navigator.clipboard.writeText(network.matchID)}
										title="Copy match code"
									>
										<Icon name="copy" size={14} />
									</button>
								</div>
								<button className="waiting-room__share" onClick={handleShareInvite}>
									{inviteShared === 'copied' ? 'Invite link copied!' : <><Icon name="share" size={15} /> Share Invite Link</>}
								</button>
							</>
						)}
						<ul className="waiting-room__seats">
							{matchData.map((seat) => {
								const isMe = String(seat.id) === playerID;
								return (
									<li
										key={`wr-${seat.id}`}
										className={`waiting-room__seat ${seat.name ? 'waiting-room__seat--claimed' : 'waiting-room__seat--open'}`}
									>
										<span className="waiting-room__seat-id">P{seat.id}</span>
										<span className="waiting-room__seat-name">
											{seat.name ?? 'Open seat'}
											{isMe ? ' (you)' : ''}
										</span>
										<span
											className={`waiting-room__seat-status ${seat.name ? (seat.isConnected ? 'waiting-room__seat-status--online' : 'waiting-room__seat-status--offline') : ''}`}
										>
											{seat.name ? (seat.isConnected ? 'online' : 'offline') : 'waiting'}
										</span>
									</li>
								);
							})}
						</ul>
						<p className="waiting-room__hint">The game starts once every seat is filled.</p>
						<div className="waiting-room__actions">
							<button className="waiting-room__leave" onClick={handleLeaveMatch}>
								Leave
							</button>
							<button className="waiting-room__cancel" onClick={handleCancelMatch}>
								Cancel Match
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Game-start banner */}
			{startBanner && (
				<div className="game-start-banner">All players in — game on!</div>
			)}

			{/* Game Over overlay */}
			{ctx.gameover && !gameOverDismissed && (() => {
				const gameover = ctx.gameover as { scores?: Record<PlayerID, number>; cancelled?: boolean; by?: PlayerID };
				return (
					<div className="game-over-overlay" onClick={() => setGameOverDismissed(true)}>
						<div className="game-over-modal" onClick={(e) => e.stopPropagation()}>
							<h2>{gameover.cancelled ? 'Match Cancelled' : 'Game Over'}</h2>
							{gameover.cancelled && gameover.by !== undefined && (
								<p className="game-over-cancelled-by">
									Cancelled by {nameOf(gameover.by) ?? `P${gameover.by}`}
								</p>
							)}
							{!gameover.cancelled && (
								<ul className="game-over-scores">
									{Object.entries(gameover.scores ?? {}).map(([pid2, s]) => (
										<li key={`go-${pid2}`}>
											<span className="game-over-scores__player">{nameOf(pid2 as PlayerID) ?? `P${pid2}`}</span>
											<span className="game-over-scores__value">{s}</span>
										</li>
									))}
								</ul>
							)}
							{isNetworked && (
								<button className="game-over-rematch" onClick={handleRematch} disabled={rematchBusy}>
									{rematchBusy ? 'Setting up rematch…' : 'Rematch'}
								</button>
							)}
							{rematchError && <div className="game-over-error">{rematchError}</div>}
							{isNetworked && (
								<button
									className="game-over-leave"
									onClick={() => {
										void handleLeaveMatch();
										setGameOverDismissed(true);
									}}
								>
									Leave Match
								</button>
							)}
							<button className="game-over-dismiss" onClick={() => setGameOverDismissed(true)}>
								Continue
							</button>
						</div>
					</div>
				);
			})()}
		</div>
	);
};

// Network Lobby Modal
const NetworkModal: React.FC<{
	isOpen: boolean;
	onClose: () => void;
	/** Seed from a ?join= invite link: focused join prompt with name entry. */
	prefill?: { code: string; error: string | null; invited?: boolean } | null;
}> = ({ isOpen, onClose, prefill = null }) => {
	const network = useUIStore((s) => s.network);
	const setNetwork = useUIStore((s) => s.setNetwork);
	const numPlayers = useUIStore((s) => s.numPlayers);
	const botByPlayer = useUIStore((s) => s.botByPlayer);
	const playerName = useUIStore((s) => s.playerName);
	const setPlayerName = useUIStore((s) => s.setPlayerName);
	const [inputMatchID, setInputMatchID] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [shareState, setShareState] = React.useState<'idle' | 'copied'>('idle');
	const serverURL = getServerURL();

	React.useEffect(() => {
		if (prefill) {
			setInputMatchID(prefill.code);
			setError(prefill.error);
		}
	}, [prefill]);

	if (!isOpen) return null;

	const nameFor = (seat: PlayerID): string => playerName.trim() || `Player ${seat}`;

	// Seats configured as bots are reserved for the server's AI players.
	const botSeats = (): Record<string, BotMode> => {
		const bots: Record<string, BotMode> = {};
		for (let i = 0; i < numPlayers; i += 1) {
			const pid = String(i) as PlayerID;
			const kind = botByPlayer[pid] ?? 'None';
			if (kind !== 'None') bots[pid] = kind;
		}
		return bots;
	};

	const handleCreate = async () => {
		setBusy(true);
		setError(null);
		try {
			const bots = botSeats();
			const creatorSeat = Array.from({ length: numPlayers }, (_, i) => String(i) as PlayerID)
				.find((pid) => !bots[pid]);
			if (!creatorSeat) {
				throw new Error('Every seat is set to AI — leave at least one human seat.');
			}
			const matchID = await createMatch(serverURL, numPlayers, bots);
			const credentials = await joinMatch(serverURL, matchID, creatorSeat, nameFor(creatorSeat));
			setNetwork({ matchID, seat: creatorSeat, credentials, numPlayers });
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to create match');
		} finally {
			setBusy(false);
		}
	};

	const handleJoin = async () => {
		if (!inputMatchID.trim()) {
			setError('Enter a match code');
			return;
		}
		setBusy(true);
		setError(null);
		try {
			// Forgiving lookup: handles pasted invite links and any letter case.
			const match = await findMatchByCode(serverURL, inputMatchID);
			const seat = firstFreeSeat(match);
			if (seat === null) {
				throw new Error('Match is full — every seat is taken.');
			}
			// Following an invite while seated elsewhere: free the old seat.
			if (network && network.matchID !== match.matchID) {
				await leaveMatch(serverURL, network.matchID, network.seat, network.credentials);
			}
			const credentials = await joinMatch(serverURL, match.matchID, seat, nameFor(seat));
			setNetwork({ matchID: match.matchID, seat, credentials, numPlayers: match.players.length });
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to join match');
		} finally {
			setBusy(false);
		}
	};

	const handleShare = async () => {
		if (!network) return;
		const result = await shareInvite(network.matchID);
		if (result === 'copied') {
			setShareState('copied');
			setTimeout(() => setShareState('idle'), 1500);
		}
	};

	const handleDisconnect = async () => {
		if (network) {
			await leaveMatch(serverURL, network.matchID, network.seat, network.credentials);
		}
		setNetwork(null);
		setInputMatchID('');
		setError(null);
	};

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content network-modal" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2>Network Game</h2>
					<button className="modal-close" onClick={onClose}>×</button>
				</div>

				<div className="modal-body">
					{prefill?.invited && (!network || network.matchID !== prefill.code) ? (
						<div className="network-section">
							<h3>You're invited!</h3>
							<p className="network-hint">
								Join match <code className="network-invite-code">{inputMatchID}</code>
								{network ? ' — you will leave your current match' : ''}. Set your name first:
							</p>
							<input
								type="text"
								className="network-name-input"
								placeholder="Player"
								maxLength={24}
								autoFocus
								value={playerName}
								onChange={(e) => setPlayerName(e.target.value)}
								onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
							/>
							<button className="btn btn--primary network-invite-join" onClick={handleJoin} disabled={busy}>
								{busy ? 'Joining…' : 'Join Match'}
							</button>
						</div>
					) : network ? (
						<div className="network-status">
							<div className="network-status__connected">
								<span className="network-status__dot" />
								Connected as P{network.seat}
							</div>
							<div className="network-status__match-id">
								<label>Match ID:</label>
								<code>{network.matchID}</code>
								<button
									className="network-status__copy"
									onClick={() => navigator.clipboard.writeText(network.matchID)}
									title="Copy"
								>
									<Icon name="copy" size={14} />
								</button>
							</div>
							<div className="network-status__server">
								<label>Server:</label>
								<span>{serverURL}</span>
							</div>
							<button className="btn btn--primary" onClick={handleShare}>
								{shareState === 'copied' ? 'Link copied!' : <><Icon name="share" size={15} /> Share Invite</>}
							</button>
							<button className="btn btn--danger" onClick={handleDisconnect}>
								Leave Match
							</button>
						</div>
					) : (
						<>
							<div className="network-section">
								<h3>Your Name</h3>
								<input
									type="text"
									className="network-name-input"
									placeholder="Player"
									maxLength={24}
									value={playerName}
									onChange={(e) => setPlayerName(e.target.value)}
								/>
							</div>

							<div className="network-section">
								<h3>Create New Match</h3>
								<p className="network-hint">
									Starts a {numPlayers}-player match using the current player setup
									{Object.keys(botSeats()).length > 0
										? ` (${Object.keys(botSeats()).length} AI seat${Object.keys(botSeats()).length > 1 ? 's' : ''} played by the server)`
										: ''}
									. Share the match ID with the other players.
								</p>
								<button
									className="btn btn--primary"
									onClick={handleCreate}
									disabled={busy}
								>
									{busy ? 'Working…' : 'Create Match'}
								</button>
							</div>

							<div className="network-divider">
								<span>or</span>
							</div>

							<div className="network-section">
								<h3>Join Existing Match</h3>
								<p className="network-hint">You'll be seated in the first open spot.</p>
								<div className="network-join">
									<input
										type="text"
										placeholder="Match code or invite link"
										value={inputMatchID}
										onChange={(e) => setInputMatchID(e.target.value)}
										onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
									/>
									<button className="btn" onClick={handleJoin} disabled={busy}>
										{busy ? '…' : 'Join'}
									</button>
								</div>
							</div>
						</>
					)}

					{error && <div className="network-error">{error}</div>}
					<div className="network-version">
						v{__APP_VERSION__} ({__APP_COMMIT__}) · built {__APP_BUILT_AT__.slice(0, 10)}
					</div>
				</div>
			</div>
		</div>
	);
};

// App
const App: React.FC = () => {
	const numPlayers = useUIStore((s) => s.numPlayers);
	const setNumPlayers = useUIStore((s) => s.setNumPlayers);
	const resetBotsForCount = useUIStore((s) => s.resetBotsForCount);
	const botByPlayer = useUIStore((s) => s.botByPlayer);
	const aiPaused = useUIStore((s) => s.aiPaused);
	const network = useUIStore((s) => s.network);
	const serverURL = getServerURL();
	const soundMuted = useUIStore((s) => s.soundMuted);
	const setSoundMuted = useUIStore((s) => s.setSoundMuted);
	const [networkModalOpen, setNetworkModalOpen] = React.useState(false);
	const [isLabRoute, setIsLabRoute] = React.useState(false);
	const [joinPrefill, setJoinPrefill] = React.useState<{ code: string; error: string | null; invited?: boolean } | null>(null);

	// Sounds: preload on first gesture (iOS unlock) and honor the mute setting.
	React.useEffect(() => {
		primeSfx();
	}, []);
	React.useEffect(() => {
		setSfxMuted(soundMuted);
	}, [soundMuted]);
	const joinLinkHandled = React.useRef(false);

	// Invite links: /?join=<code> opens a join prompt seeded with the code so
	// the incoming player can set their name before claiming a seat. Any
	// lookup error (full, not found, server down) shows in the same prompt.
	React.useEffect(() => {
		if (joinLinkHandled.current) return;
		const code = new URLSearchParams(window.location.search).get('join');
		if (!code) return;
		joinLinkHandled.current = true;
		window.history.replaceState(null, '', window.location.pathname + window.location.hash);
		(async () => {
			const { network: current } = useUIStore.getState();
			try {
				const match = await findMatchByCode(serverURL, code);
				if (current?.matchID === match.matchID) return; // already seated here
				if (firstFreeSeat(match) === null) throw new Error('Match is full — every seat is taken.');
				setJoinPrefill({ code: match.matchID, error: null, invited: true });
			} catch (e) {
				setJoinPrefill({ code, error: e instanceof Error ? e.message : 'Failed to join match', invited: true });
			}
			setNetworkModalOpen(true);
		})();
	}, [serverURL]);

	// Local games: the human is always seat "0" and bots run in-browser.
	// Network games: the seat was claimed through the lobby (with credentials),
	// and AI seats are played by the server.
	const humanPlayerID = network ? network.seat : ('0' as PlayerID);
	const clientNumPlayers = network ? network.numPlayers : numPlayers;

	const ClientComp = React.useMemo(
		() => Client<GState, AppBoardProps>({
			game: HexStringsGame,
			numPlayers: clientNumPlayers,
			board: GameBoard,
			multiplayer: network ? SocketIO({ server: serverURL }) : Local(),
		}),
		[clientNumPlayers, network, serverURL]
	);

	// Create headless bot clients that auto-play when it's their turn
	// (local games only — network bot seats are driven by the server).
	useBotClients(HexStringsGame, numPlayers, network ? EMPTY_BOTS : botByPlayer, aiPaused);

	React.useEffect(() => {
		const update = () => {
			const path = window.location.pathname;
			const hash = window.location.hash;
			setIsLabRoute(path === '/lab' || hash === '#lab');
		};
		update();
		window.addEventListener('popstate', update);
		window.addEventListener('hashchange', update);
		return () => {
			window.removeEventListener('popstate', update);
			window.removeEventListener('hashchange', update);
		};
	}, []);

	return (
		<div className="app-root">
			{/* Setup controls in top-left corner */}
			{!isLabRoute && (
				<div className="setup-controls">
					<button onClick={() => {
						const next = Math.min(8, numPlayers + 1);
						setNumPlayers(next);
						resetBotsForCount(next);
					}} disabled={network !== null} title={network ? 'Leave the network match to change players' : undefined}>+</button>
					<span className="setup-controls__count">{clientNumPlayers}P</span>
					<button onClick={() => {
						const next = Math.max(2, numPlayers - 1);
						setNumPlayers(next);
						resetBotsForCount(next);
					}} disabled={network !== null || numPlayers <= 2} title={network ? 'Leave the network match to change players' : undefined}>−</button>
					<button
						className="setup-controls__network"
						onClick={() => setSoundMuted(!soundMuted)}
						title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
					>
						<Icon name={soundMuted ? 'volume-off' : 'volume'} />
					</button>
					<button
						className={`setup-controls__network ${network ? 'setup-controls__network--connected' : ''}`}
						onClick={() => setNetworkModalOpen(true)}
						title={network ? 'Connected to network game' : 'Network game'}
					>
						<Icon name="globe" />
					</button>
				</div>
			)}
			{isLabRoute
				? <StateLab onExit={() => window.location.assign('/')} />
				: <ClientComp
						playerID={humanPlayerID}
						matchID={network?.matchID}
						credentials={network?.credentials}
						viewer={humanPlayerID}
						onSetViewer={() => {}}
					/>
			}
			{!isLabRoute && (
				<NetworkModal
					isOpen={networkModalOpen}
					onClose={() => setNetworkModalOpen(false)}
					prefill={joinPrefill}
				/>
			)}
			<div
				className="version-badge"
				title={`Built ${__APP_BUILT_AT__} from commit ${__APP_COMMIT__}`}
			>
				v{__APP_VERSION__} ({__APP_COMMIT__})
			</div>
		</div>
	);
};

export default App;
