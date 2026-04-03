import React from 'react';
import './App.css';
import type { PlayerID } from 'boardgame.io';
import { Client, type BoardProps as BGIOBoardProps } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { HexStringsGame } from './game/game';
import { Board as HexBoard } from './ui/Board';
import type { CardAction, Color, Co, GState, PlayerPrefs, Stat } from './game/types';
import { Hand, NeuralCard } from './ui/Hand';
import { Treasure, TreasureCard } from './ui/Treasure';
import { DiscardZone } from './ui/DiscardZone';
import { ActionCardModal } from './ui/ActionCardModal';
import { PlayerHandModal } from './ui/PlayerHandModal';
import { computeScores } from './game/scoring';
import { buildAllCoords, canPlace, canPlacePath, neighbors, asVisibleColor, key, serializeCard } from './game/helpers';
import { useUIStore } from './ui/useUIStore';
import { playOneRandom, playOneEvaluator, playOneEvaluatorPlus, type BotKind } from './game/bots';
import { PlayerCard } from './ui/PlayerCard';
import { StateLab } from './ui/StateLab';
import { getNightmareByName } from './game/nightmares';
import { resolveCardActions, resolveCardEffects, type CardActionResolveContext } from './game/cardActions';
import { useIsMobile } from './ui/useIsMobile';
import { ZoneTabBar } from './ui/ZoneTabBar';
import { ActionModeStrip, type ActionMode } from './ui/ActionModeStrip';

// Types
type ExtraBoardProps = { viewer: PlayerID; onSetViewer: (pid: PlayerID) => void };
type AppBoardProps = BGIOBoardProps<GState> & ExtraBoardProps;

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
	viewer,
	onSetViewer,
	undo,
	log,
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

	const gRef = React.useRef(G);
	const ctxRef = React.useRef(ctx);
	React.useEffect(() => { gRef.current = G; ctxRef.current = ctx; }, [G, ctx]);

	// Toggle coordinate display with backtick key
	React.useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === '`') setShowCoords((v) => !v);
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, []);

	const currentPlayer = ctx.currentPlayer;
	// The human's seat: the first non-bot player (stable across turns, even when viewer switches to watch bots)
	const humanSeat = React.useMemo(() => {
		const first = (ctx.playOrder as PlayerID[]).find((pid) => (botByPlayer[pid] ?? 'None') === 'None');
		return first ?? (playerID as PlayerID);
	}, [ctx.playOrder, botByPlayer, playerID]);
	const isMyTurn = humanSeat === currentPlayer;
	const myHand = G.hands[humanSeat] ?? [];
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

			// Also check all neighbors for consolidation moves (off-direction recoloring).
			// When a color is explicitly selected, only check that color; otherwise check all card colors.
			const colorsToCheck = selectedColor && cardColors.includes(selectedColor)
				? [selectedColor]
				: cardColors;
			for (const col of colorsToCheck) {
				for (const dest of neighbors(source)) {
					if (isOriginCoord(dest)) continue;
					if (dests.some((d) => d.q === dest.q && d.r === dest.r)) continue;
					if (canPlacePath(G, source, dest, col, rules)) dests.push(dest);
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
		action.type === 'moveHex' || (action.type === 'replaceHexColor' && isPathMode) || action.type === 'replaceLaneColor',
	);
	const actionNeedsReplaceColor = selectedActionList.some((action) =>
		action.type === 'replaceHexColor' || action.type === 'replaceLaneColor',
	);
	const actionNeedsStat = selectedActionList.some((action) =>
		['chooseStat', 'setAgendaOverride', 'attachTokenToCard', 'registerTrigger'].includes(action.type)
	);
	const actionNeedsPrefs = selectedActionList.some((action) => action.type === 'reorderPlayerPrefs');
	const actionNeedsRevealedPick = selectedActionList.some((action) => action.type === 'pickOneToHand');
	const actionNeedsDraftPicks = selectedActionList.some((action) => action.type === 'draftInTurnOrder');

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

	const actionLimitAllows = (() => {
		if (!isMyTurn || locked || selectedActionCard === null) return false;
		if (rules.ACTION_CARDS === 'disabled') return false;
		if (rules.ACTION_CARDS === 'unlimited') return true;
		const played = G.meta.actionPlaysThisTurn[currentPlayer] ?? 0;
		const extra = G.action.extraActionPlays[currentPlayer] ?? 0;
		return played === 0 || extra > 0;
	})();

	const handleModeChange = (newMode: ActionMode) => {
		setActionMode(newMode);
		setDiscardSelection([]);
		setSelectedCard(null);
		setSelectedColor(null);
		setPendingRotationTile(null);
		setSelectedSourceDot(null);
	};

	let actionResolveError: string | null = null;
	if (selectedActionCard && actionLimitAllows) {
		try {
			resolveCardEffects(selectedActionCard, buildActionContext());
		} catch (err) {
			actionResolveError = err instanceof Error ? err.message : 'Action requires more input.';
		}
	}

	const onHexClick = (coord: Co) => {
		// Action card coordinate picking — intercept before normal logic.
		if (actionPickingCoord !== null) {
			const coordStr = `${coord.q},${coord.r}`;
			if (actionPickingCoord === 'coord') {
				setActionCoordInput(coordStr);
				setActionPickingCoord(null);
			} else if (actionPickingCoord === 'moveFrom') {
				setActionMoveFromInput(coordStr);
				setActionPickingCoord('moveTo'); // auto-advance to picking destination
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
			setDiscardSelection([]);
			setActionMode('place');
			return;
		}

		// ROTATE MODE — click a rotatable node/tile to start rotation
		if (actionMode === 'rotate') {
			if (!discardReady || rules.PLACEMENT.DISCARD_TO_ROTATE === false) return;
			if (isPathMode) {
				// Path mode: node must have outgoing lanes
				const hasOutgoing = G.lanes.some(l => key(l.from) === key(coord));
				if (hasOutgoing) {
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

			// Consolidation exception: allow using explicitly selected color (e.g. purple) off-direction
			// when canPlacePath gates it as a consolidation move.
			if (selectedColor && card.colors.includes(selectedColor) && canPlacePath(G, selectedSourceDot, coord, selectedColor, rules)) {
				moves.playCard({ handIndex: selectedCard, pick: selectedColor, source: selectedSourceDot, coord });
				setSelectedCard(null);
				setSelectedColor(null);
				setSelectedSourceDot(null);
				return;
			}

			// Fallback: try ALL card colors to find any valid move to this destination.
			// This handles cases where the valid color is neither the direction color nor
			// the explicitly selected color (e.g., consolidation with an unselected color).
			for (const col of card.colors) {
				if (col === dirColor || col === selectedColor) continue; // already tried
				if (canPlacePath(G, selectedSourceDot, coord, col as Color, rules)) {
					moves.playCard({ handIndex: selectedCard, pick: col as Color, source: selectedSourceDot, coord });
					setSelectedCard(null);
					setSelectedColor(null);
					setSelectedSourceDot(null);
					return;
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
				const outgoingKeys = new Set(G.lanes.map(l => key(l.from)));
				setRotatable(coords.filter(c => outgoingKeys.has(key(c))));
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

	const botPlayOnce = async (pid: PlayerID, botKind: BotKind) => {
		const isOwnersTurn = (owner: PlayerID) => ctxRef.current.currentPlayer === owner;
		if (!isOwnersTurn(pid)) return;

		const client = {
			getState: () => {
				const g = gRef.current;
				const c = ctxRef.current;
				return g && c ? { G: g, ctx: c, playerID: pid } : undefined;
			},
			moves: {
				playCard: (args: { handIndex: number; pick: Color; coord: Co }) => {
					if (isOwnersTurn(pid)) moves.playCard(args);
				},
				rotateTile: (args: { coord: Co; handIndices: number[]; rotation: number }) => {
					if (isOwnersTurn(pid)) moves.rotateTile(args);
				},
				blockTile: (args: { coord: Co; handIndices: number[] }) => {
					if (isOwnersTurn(pid)) moves.blockTile(args);
				},
				stashToTreasure: (args: { handIndex: number }) => {
					if (isOwnersTurn(pid)) moves.stashToTreasure(args);
				},
				takeFromTreasure: (args: { index: number }) => {
					if (isOwnersTurn(pid)) moves.takeFromTreasure(args);
				},
				endTurnAndRefill: () => {
					if (isOwnersTurn(pid)) moves.endTurnAndRefill();
				},
			},
		};

		if (botKind === 'Random') {
			await playOneRandom(client, pid);
		} else if (botKind === 'Evaluator') {
			await playOneEvaluator(client, pid);
		} else if (botKind === 'EvaluatorPlus') {
			await playOneEvaluatorPlus(client, pid);
		}
	};

	const autoPlayingRef = React.useRef(false);
	React.useEffect(() => {
		const owner = ctx.currentPlayer as PlayerID;
		const botKind = botByPlayer[owner] ?? 'None';
		const isBot = botKind !== 'None';
		if (!isBot) return;
		if (aiPaused) return;
		if (playerID !== owner) {
			onSetViewer(owner);
			return;
		}
		if (autoPlayingRef.current) return;
		autoPlayingRef.current = true;
		(void (async () => {
			if (ctxRef.current.currentPlayer !== owner) { autoPlayingRef.current = false; return; }
			await botPlayOnce(owner, botKind);
			autoPlayingRef.current = false;
		})());
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ctx.currentPlayer, playerID, viewer, botByPlayer, aiPaused]);

	React.useEffect(() => {
		const owner = ctx.currentPlayer as PlayerID;
		const ownerBotKind = botByPlayer[owner] ?? 'None';
		const isOwnerBot = ownerBotKind !== 'None';
		if (isOwnerBot) return; // Bot turns handled by the auto-play effect above
		const allHuman = (ctx.playOrder as PlayerID[]).every((pid) => (botByPlayer[pid] ?? 'None') === 'None');
		if (allHuman) {
			// Hot-seat mode (all human): auto-switch viewer to whoever's turn it is
			if (playerID !== owner) {
				onSetViewer(owner);
			}
		} else {
			// Human vs bots: switch viewer back to the current (human) player's seat
			if (playerID !== owner) {
				onSetViewer(owner);
			}
		}
	}, [ctx.currentPlayer, ctx.playOrder, playerID, botByPlayer, onSetViewer]);

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
	const stashBonus = isMyTurn ? (G.meta.stashBonus[humanSeat] ?? 0) : 0;
	const viewerNightmare = getNightmareByName(G.nightmares[humanSeat]);
	const viewerNightmareState = G.nightmareState[humanSeat];
	const viewerPrefs = G.prefs[humanSeat];

	return (
		<div className="game-layout">
			{/* MOBILE STATUS BAR */}
			<MobileStatusBar
				currentPlayer={currentPlayer as PlayerID}
				currentPlayerScore={scores[currentPlayer as PlayerID] ?? 0}
				currentPlayerGoals={G.prefs[currentPlayer as PlayerID]!}
				viewer={humanSeat}
				viewerScore={scores[humanSeat] ?? 0}
				viewerGoals={G.prefs[humanSeat]!}
				isViewerTurn={isMyTurn}
				deckCount={G.deck.length}
			/>

			{/* MOBILE PLAYER ICONS */}
			<div className="mobile-player-icons">
				{(ctx.playOrder as PlayerID[]).map((pid) => {
					const prefs = G.prefs[pid];
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
							{G.deck.length}
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
							goals={G.prefs[pid]!}
							nightmareName={G.nightmares[pid]}
							botKind={botByPlayer[pid] ?? 'None'}
							onBotChange={(bot) => setBotFor(pid, bot)}
							isViewer={pid === humanSeat}
							onSetViewer={() => {
								onSetViewer(pid);
								setMobileMenuOpen(false);
							}}
							handSize={(G.hands[pid] ?? []).length}
							onHandClick={() => setViewingHandOf(viewingHandOf === pid ? null : pid)}
						/>
					))}
				</div>
				<div className="game-players__nightmare">
					<div className="hand-nightmare__header">
						<span className="hand-nightmare__label">Nightmare</span>
						<span className="hand-nightmare__player">P{humanSeat}</span>
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
					<button
						className={`ai-pause-btn ${aiPaused ? 'ai-pause-btn--paused' : ''}`}
						onClick={() => setAiPaused(!aiPaused)}
						title={aiPaused ? 'Resume AI' : 'Pause AI'}
					>
						{aiPaused ? '▶ Resume AI' : '⏸ Pause AI'}
					</button>
				</div>
			</aside>

			{/* MOBILE OVERLAY */}
			{mobileMenuOpen && (
				<div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
			)}

			{/* RIGHT PANEL - Board */}
			<main
				className={`game-board ${boardInteractable ? 'game-board--active' : 'game-board--inactive'}`}
				onMouseEnter={() => setExpandedZone(null)}
			>
				<HexBoard
					rules={rules}
					board={G.board}
					lanes={G.lanes}
					radius={G.radius}
					onHexClick={onHexClick}
					highlightCoords={actionMode === 'rotate' ? rotatable : actionMode === 'block' ? blockableCoords : availableMoveCoords}
					highlightColor={actionMode === 'rotate' ? '#8b5cf6' : actionMode === 'block' ? '#ef4444' : (selectedColor ? asVisibleColor(selectedColor) : '#8b5cf6')}
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

			{/* CARD ZONES — hidden on mobile (tab bar controls them) */}
			{!isMobile && (
				<>
					<Hand
						rules={rules}
						cards={myHand}
						selectedIndex={actionMode === 'place' ? selectedCard : null}
						selectedIndices={actionMode !== 'place' ? discardSelection : undefined}
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
						isExpanded={expandedZone === 'hand'}
						onExpandChange={handleZoneExpand('hand')}
					/>

					<Treasure
						rules={rules}
						cards={G.treasure}
						onTake={onTakeTreasure}
						isExpanded={expandedZone === 'treasure'}
						onExpandChange={handleZoneExpand('treasure')}
					/>

					<DiscardZone
						rules={rules}
						cards={G.discard}
						isExpanded={expandedZone === 'discard'}
						onExpandChange={handleZoneExpand('discard')}
					/>
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
										}}
										onPickColor={(color) => onPickColor(i, color)}
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

			{/* COORD PICKING BANNER — shown when board is active for picking */}
			{actionPickingCoord !== null && (
				<div className="coord-pick-banner">
					<span className="coord-pick-banner__text">
						{actionPickingCoord === 'coord' && 'Click a hex to select target'}
						{actionPickingCoord === 'moveFrom' && 'Click a hex to select source'}
						{actionPickingCoord === 'moveTo' && 'Click a hex to select destination'}
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
											P{pid}
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
									<span className="action-panel__label">Move From</span>
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
									<span className="action-panel__label">Move To</span>
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
							title={
								!actionLimitAllows
									? 'Action limit reached'
									: (actionResolveError ?? 'Play action card')
							}
						>
							Play Action
						</button>
						{!actionLimitAllows && (
							<div className="action-panel__error">Action limit reached.</div>
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
					handSize={(G.hands[viewingHandOf] ?? []).length}
					onClose={() => setViewingHandOf(null)}
				/>
			)}

			{/* ACTION MODE STRIP — above hand zone */}
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

			{/* FLOATING ACTIONS TOOLBAR */}
			<div className="floating-toolbar">
				<button
					className="floating-action"
					onClick={() => {
						undo();
						setSelectedCard(null);
						setSelectedColor(null);
						setPendingRotationTile(null);
						setRotatable([]);
						setActionMode('place');
						setDiscardSelection([]);
					}}
					disabled={!isMyTurn || !Array.isArray(log) || log.length === 0}
					title="Undo"
				>
					⟲
				</button>
				<button
					className="floating-action"
					onClick={onStash}
					disabled={!isMyTurn || selectedCard === null || stage !== 'active' || G.treasure.length >= rules.TREASURE_MAX}
					title={stashBonus > 0 ? `Stash (+${stashBonus})` : 'Stash'}
				>
					⬇
				</button>
				<button
					className="floating-action floating-action--primary"
					onClick={onEndTurn}
					disabled={!isMyTurn}
					title="End Turn"
				>
					✓
				</button>
			</div>

			{/* Secret export state button */}
			<button
				className="secret-export-btn"
				onClick={() => {
					navigator.clipboard.writeText(JSON.stringify(G));
					const btn = document.querySelector('.secret-export-btn') as HTMLElement | null;
					if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = '⚙'; }, 1200); }
				}}
				title="Export state to clipboard (for Lab)"
			>
				⚙
			</button>

			{/* Game Over overlay */}
			{ctx.gameover && !gameOverDismissed && (
				<div className="game-over-overlay" onClick={() => setGameOverDismissed(true)}>
					<div className="game-over-modal" onClick={(e) => e.stopPropagation()}>
						<h2>Game Over</h2>
						<ul className="game-over-scores">
							{Object.entries((ctx.gameover as { scores: Record<PlayerID, number> }).scores).map(([pid2, s]) => (
								<li key={`go-${pid2}`}>
									<span className="game-over-scores__player">P{pid2}</span>
									<span className="game-over-scores__value">{s}</span>
								</li>
							))}
						</ul>
						<button className="game-over-dismiss" onClick={() => setGameOverDismissed(true)}>
							Continue
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

// Network Lobby Modal
const NetworkModal: React.FC<{
	isOpen: boolean;
	onClose: () => void;
	matchID: string | null;
	onSetMatchID: (id: string | null) => void;
	numPlayers: number;
	serverURL: string;
}> = ({ isOpen, onClose, matchID, onSetMatchID, numPlayers, serverURL }) => {
	const [inputMatchID, setInputMatchID] = React.useState('');
	const [isCreating, setIsCreating] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	if (!isOpen) return null;

	const handleCreate = async () => {
		setIsCreating(true);
		setError(null);
		try {
			const res = await fetch(`${serverURL}/games/hex-strings/create`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ numPlayers }),
			});
			if (!res.ok) throw new Error('Failed to create match');
			const data = await res.json();
			onSetMatchID(data.matchID);
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to create match');
		} finally {
			setIsCreating(false);
		}
	};

	const handleJoin = () => {
		if (!inputMatchID.trim()) {
			setError('Enter a match ID');
			return;
		}
		setError(null);
		onSetMatchID(inputMatchID.trim());
		onClose();
	};

	const handleDisconnect = () => {
		onSetMatchID(null);
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
					{matchID ? (
						<div className="network-status">
							<div className="network-status__connected">
								<span className="network-status__dot" />
								Connected
							</div>
							<div className="network-status__match-id">
								<label>Match ID:</label>
								<code>{matchID}</code>
								<button 
									className="network-status__copy"
									onClick={() => navigator.clipboard.writeText(matchID)}
									title="Copy"
								>
									📋
								</button>
							</div>
							<div className="network-status__server">
								<label>Server:</label>
								<span>{serverURL}</span>
							</div>
							<button className="btn btn--danger" onClick={handleDisconnect}>
								Disconnect
							</button>
						</div>
					) : (
						<>
							<div className="network-section">
								<h3>Create New Match</h3>
								<p className="network-hint">Start a new {numPlayers}-player game and share the match ID</p>
								<button 
									className="btn btn--primary" 
									onClick={handleCreate}
									disabled={isCreating}
								>
									{isCreating ? 'Creating...' : 'Create Match'}
								</button>
							</div>
							
							<div className="network-divider">
								<span>or</span>
							</div>
							
							<div className="network-section">
								<h3>Join Existing Match</h3>
								<div className="network-join">
									<input
										type="text"
										placeholder="Enter match ID"
										value={inputMatchID}
										onChange={(e) => setInputMatchID(e.target.value)}
										onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
									/>
									<button className="btn" onClick={handleJoin}>
										Join
									</button>
								</div>
							</div>
						</>
					)}
					
					{error && <div className="network-error">{error}</div>}
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
	const viewer = useUIStore((s) => s.viewer);
	const setViewer = useUIStore((s) => s.setViewer);
	const matchID = useUIStore((s) => s.matchID);
	const setMatchID = useUIStore((s) => s.setMatchID);
	const serverURL = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin);
	const [networkModalOpen, setNetworkModalOpen] = React.useState(false);
	const [isLabRoute, setIsLabRoute] = React.useState(false);

	const ClientComp = React.useMemo(
		() => Client<GState, AppBoardProps>({
			game: HexStringsGame,
			numPlayers,
			board: GameBoard,
			multiplayer: matchID ? SocketIO({ server: serverURL }) : undefined,
		}),
		[numPlayers, matchID, serverURL]
	);
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
	React.useEffect(() => {
		if (Number(viewer) >= numPlayers) setViewer(String(numPlayers - 1) as PlayerID);
	}, [numPlayers, viewer, setViewer]);

	return (
		<div className="app-root">
			{/* Setup controls in top-left corner */}
			{!isLabRoute && (
				<div className="setup-controls">
					<button onClick={() => {
						const next = Math.min(8, numPlayers + 1);
						setNumPlayers(next);
						resetBotsForCount(next);
						if (matchID) setMatchID(`match-${Date.now()}`);
					}}>+</button>
					<span className="setup-controls__count">{numPlayers}P</span>
					<button onClick={() => {
						const next = Math.max(2, numPlayers - 1);
						setNumPlayers(next);
						resetBotsForCount(next);
						if (matchID) setMatchID(`match-${Date.now()}`);
					}} disabled={numPlayers <= 2}>−</button>
					<button 
						className={`setup-controls__network ${matchID ? 'setup-controls__network--connected' : ''}`}
						onClick={() => setNetworkModalOpen(true)}
						title={matchID ? 'Connected to network game' : 'Network game'}
					>
						<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
							<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
						</svg>
					</button>
				</div>
			)}
			{isLabRoute
				? <StateLab onExit={() => window.location.assign('/')} />
				: <ClientComp playerID={viewer} matchID={matchID || undefined} viewer={viewer} onSetViewer={setViewer} />
			}
			{!isLabRoute && (
				<NetworkModal
					isOpen={networkModalOpen}
					onClose={() => setNetworkModalOpen(false)}
					matchID={matchID}
					onSetMatchID={setMatchID}
					numPlayers={numPlayers}
					serverURL={serverURL}
				/>
			)}
		</div>
	);
};

export default App;
