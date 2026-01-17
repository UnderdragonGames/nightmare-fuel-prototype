import React from 'react';
import './App.css';
import type { PlayerID } from 'boardgame.io';
import { Client, type BoardProps as BGIOBoardProps } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { HexStringsGame } from './game/game';
import { Board as HexBoard } from './ui/Board';
import type { Color, Co, GState } from './game/types';
import { Hand } from './ui/Hand';
import { Treasure } from './ui/Treasure';
import { computeScores } from './game/scoring';
import { buildAllCoords, canPlace, asVisibleColor, key } from './game/helpers';
import { useUIStore } from './ui/useUIStore';
import { playOneRandom, playOneEvaluator, playOneEvaluatorPlus, type BotKind } from './game/bots';
import { PlayerCard } from './ui/PlayerCard';

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
	const [selectedCard, setSelectedCard] = React.useState<number | null>(null);
	const [selectedColor, setSelectedColor] = React.useState<Color | null>(null);
	const [rotationMode, setRotationMode] = React.useState(false);
	const [pendingRotationTile, setPendingRotationTile] = React.useState<Co | null>(null);
	const [selectedSourceDot, setSelectedSourceDot] = React.useState<Co | null>(null);
	const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
	const showRing = useUIStore((s) => s.showRing);
	const setShowRing = useUIStore((s) => s.setShowRing);
	const botByPlayer = useUIStore((s) => s.botByPlayer);
	const setBotFor = useUIStore((s) => s.setBotFor);
	const [placeable, setPlaceable] = React.useState<Co[]>([]);
	const [rotatable, setRotatable] = React.useState<Co[]>([]);

	const gRef = React.useRef(G);
	const ctxRef = React.useRef(ctx);
	React.useEffect(() => { gRef.current = G; ctxRef.current = ctx; }, [G, ctx]);

	const currentPlayer = ctx.currentPlayer;
	const isMyTurn = playerID === currentPlayer;
	const myHand = G.hands[playerID ?? currentPlayer] ?? [];
	const stage = (ctx.activePlayers ? (ctx.activePlayers as Record<PlayerID, string>)[currentPlayer as PlayerID] : undefined) ?? 'active';
	const locked = stage !== 'active';
	const isPathMode = rules.MODE === 'path';

	// Card is selected = board is interactable
	const boardInteractable = selectedCard !== null;

	// Helper: get color that connects source to destination (if they're neighbors)
	const getColorForDirection = (source: Co, dest: Co): Color | null => {
		const dq = dest.q - source.q;
		const dr = dest.r - source.r;
		for (const [color, dir] of Object.entries(rules.COLOR_TO_DIR)) {
			if (dir.q === dq && dir.r === dr) {
				return color as Color;
			}
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
		const sourceIsOrigin = isOriginCoord(source);

		for (const [, dir] of Object.entries(rules.COLOR_TO_DIR)) {
			const neighbor: Co = { q: source.q + dir.q, r: source.r + dir.r };
			if (isOriginCoord(neighbor)) {
				const colorToPlace = getColorForDirection(neighbor, source);
				if (colorToPlace && cardColors.includes(colorToPlace) && !sourceIsOrigin && canPlace(G, source, colorToPlace, rules)) {
					if (!dests.some((d) => d.q === neighbor.q && d.r === neighbor.r)) {
						dests.push(neighbor);
					}
				}
			}
		}

		for (const color of cardColors) {
			const dir = rules.COLOR_TO_DIR[color];
			const dest: Co = { q: source.q + dir.q, r: source.r + dir.r };
			if (!isOriginCoord(dest) && canPlace(G, dest, color, rules)) {
				if (!dests.some((d) => d.q === dest.q && d.r === dest.r)) {
					dests.push(dest);
				}
			}
		}
		return dests;
	};

	const onHexClick = (coord: Co) => {
		if (!isMyTurn || locked) return;

		if (pendingRotationTile !== null) {
			if (key(pendingRotationTile) !== key(coord)) {
				setPendingRotationTile(null);
			}
			return;
		}

		if (rotationMode && !isPathMode) {
			const tile = G.board[key(coord)];
			if (tile && tile.colors.length > 0 && selectedCard !== null && rules.PLACEMENT.DISCARD_TO_ROTATE !== false) {
				setPendingRotationTile(coord);
				return;
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
					setPlaceable(validDests);
					const firstDest = validDests[0]!;
					const color = getColorForDirection(coord, firstDest);
					setSelectedColor(color);
				}
				return;
			}

			if (key(coord) === key(selectedSourceDot)) {
				setSelectedSourceDot(null);
				setPlaceable([]);
				setSelectedColor(null);
				return;
			}

			const destIsOrigin = isOriginCoord(coord);
			if (destIsOrigin) {
				const oppositeColor = getColorForDirection(coord, selectedSourceDot);
				if (oppositeColor && card.colors.includes(oppositeColor) && canPlace(G, selectedSourceDot, oppositeColor, rules)) {
					moves.playCard({ handIndex: selectedCard, pick: oppositeColor, coord: selectedSourceDot });
					setSelectedCard(null);
					setSelectedColor(null);
					setSelectedSourceDot(null);
					setPlaceable([]);
					return;
				}
			} else {
				const color = getColorForDirection(selectedSourceDot, coord);
				if (color && card.colors.includes(color) && canPlace(G, coord, color, rules)) {
					moves.playCard({ handIndex: selectedCard, pick: color, coord });
					setSelectedCard(null);
					setSelectedColor(null);
					setSelectedSourceDot(null);
					setPlaceable([]);
					return;
				}
			}

			const validDests = getValidDestinations(coord, card.colors);
			if (validDests.length > 0) {
				setSelectedSourceDot(coord);
				setPlaceable(validDests);
				const firstDest = validDests[0]!;
				const inferredColor = getColorForDirection(coord, firstDest);
				setSelectedColor(inferredColor);
			} else {
				setSelectedSourceDot(null);
				setPlaceable([]);
				setSelectedColor(null);
			}
			return;
		}

		// HEX MODE
		if (selectedCard === null) return;
		const card = myHand[selectedCard];
		if (!card) return;

		const tile = G.board[key(coord)];
		if (tile && tile.colors.length > 0 && rules.PLACEMENT.DISCARD_TO_ROTATE !== false) {
			setPendingRotationTile(coord);
			return;
		}

		if (selectedColor) {
			if (canPlace(G, coord, selectedColor, rules)) {
				moves.playCard({ handIndex: selectedCard, pick: selectedColor, coord });
				setSelectedCard(null);
				setSelectedColor(null);
				setPlaceable([]);
			}
			return;
		}
		for (const color of card.colors) {
			if (canPlace(G, coord, color, rules)) {
				moves.playCard({ handIndex: selectedCard, pick: color, coord });
				setSelectedCard(null);
				setSelectedColor(null);
				setPlaceable([]);
				return;
			}
		}
	};

	const recomputePlaceable = (color: Color | null) => {
		if (!color) { setPlaceable([]); return; }
		const coords = buildAllCoords(G.radius);
		setPlaceable(coords.filter((c) => canPlace(G, c, color, rules)));
	};

	const computeValidSources = (cardColors: Color[]): Co[] => {
		const coords = buildAllCoords(G.radius);
		const sources: Co[] = [];
		for (const coord of coords) {
			const validDests = getValidDestinations(coord, cardColors);
			if (validDests.length > 0) {
				sources.push(coord);
			}
		}
		return sources;
	};

	const onPickColor = (index: number, color: Color) => {
		if (locked) return;
		setSelectedCard(index);
		setSelectedColor(color);
		setSelectedSourceDot(null);
		if (isPathMode) {
			const card = myHand[index];
			if (card) {
				setPlaceable(computeValidSources(card.colors));
			}
		} else {
			recomputePlaceable(color);
		}
	};

	const handleRotation = (rotation: number) => {
		if (pendingRotationTile === null || selectedCard === null) return;
		moves.rotateTile({ coord: pendingRotationTile, handIndex: selectedCard, rotation });
		setPendingRotationTile(null);
		setSelectedCard(null);
		setSelectedColor(null);
		setPlaceable([]);
		setRotatable([]);
	};

	React.useEffect(() => {
		if (locked) {
			setSelectedCard(null);
			setSelectedColor(null);
			setPlaceable([]);
			setRotationMode(false);
			setRotatable([]);
			setPendingRotationTile(null);
			setSelectedSourceDot(null);
		}
	}, [locked]);

	React.useEffect(() => {
		if (rotationMode && isMyTurn && !locked) {
			const coords = buildAllCoords(G.radius);
			setRotatable(coords.filter((c) => {
				const tile = G.board[key(c)];
				return tile && tile.colors.length > 0;
			}));
		} else {
			setRotatable([]);
		}
	}, [rotationMode, G.board, G.radius, isMyTurn, locked]);

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
				rotateTile: (args: { coord: Co; handIndex: number; rotation: number }) => {
					if (isOwnersTurn(pid)) moves.rotateTile(args);
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
	}, [ctx.currentPlayer, playerID, viewer, botByPlayer]);

	React.useEffect(() => {
		const owner = ctx.currentPlayer as PlayerID;
		const botKind = botByPlayer[owner] ?? 'None';
		const isBot = botKind !== 'None';
		if (isBot) return;
		if (playerID !== owner) {
			onSetViewer(owner);
		}
	}, [ctx.currentPlayer, playerID, botByPlayer, onSetViewer]);

	const onEndTurn = () => {
		if (moves.endTurnAndRefill) moves.endTurnAndRefill();
	};
	const onStash = () => {
		if (selectedCard !== null) {
			moves.stashToTreasure?.({ handIndex: selectedCard });
			setSelectedCard(null);
			setSelectedColor(null);
			setPlaceable([]);
		}
	};
	const onTakeTreasure = (i: number) => moves.takeFromTreasure && moves.takeFromTreasure({ index: i });

	const scores = computeScores(G);
	const stashBonus = isMyTurn ? (G.meta.stashBonus[currentPlayer as PlayerID] ?? 0) : 0;

	return (
		<div className="game-layout">
			{/* MOBILE STATUS BAR */}
			<MobileStatusBar
				currentPlayer={currentPlayer as PlayerID}
				currentPlayerScore={scores[currentPlayer as PlayerID] ?? 0}
				currentPlayerGoals={G.prefs[currentPlayer as PlayerID]!}
				viewer={viewer}
				viewerScore={scores[viewer] ?? 0}
				viewerGoals={G.prefs[viewer]!}
				isViewerTurn={isMyTurn}
				deckCount={G.deck.length}
			/>

			{/* MOBILE MENU TOGGLE */}
			<button
				className="mobile-menu-toggle"
				onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
				aria-label="Toggle players menu"
			>
				<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
					<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
				</svg>
				<span className="mobile-menu-toggle__count">{ctx.playOrder.length}</span>
			</button>

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
							botKind={botByPlayer[pid] ?? 'None'}
							onBotChange={(bot) => setBotFor(pid, bot)}
							isViewer={pid === viewer}
							onSetViewer={() => {
								onSetViewer(pid);
								setMobileMenuOpen(false);
							}}
						/>
					))}
				</div>
				<div className="game-players__controls">
					<label className="options-toggle">
						<input type="checkbox" checked={showRing} onChange={(e) => setShowRing(e.target.checked)} />
						Show Ring
					</label>
				</div>
			</aside>

			{/* MOBILE OVERLAY */}
			{mobileMenuOpen && (
				<div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
			)}

			{/* RIGHT PANEL - Board */}
			<main className={`game-board ${boardInteractable ? 'game-board--active' : 'game-board--inactive'}`}>
				<HexBoard
					rules={rules}
					board={G.board}
					radius={G.radius}
					onHexClick={onHexClick}
					showRing={showRing}
					highlightCoords={rotationMode ? rotatable : placeable}
					highlightColor={rotationMode ? '#8b5cf6' : (selectedColor ? asVisibleColor(selectedColor) : '#8b5cf6')}
					origins={G.origins}
					pendingRotationTile={pendingRotationTile}
					onRotationSelect={handleRotation}
					selectedColor={rotationMode ? null : selectedColor}
					selectedSourceDot={selectedSourceDot}
				/>
				{/* Mode hints */}
				{isPathMode && selectedCard !== null && !selectedSourceDot && (
					<div className="mode-hint mode-hint--path">
						Click a dot to select source, then click a neighbor to place.
					</div>
				)}
				{isPathMode && selectedSourceDot && (
					<div className="mode-hint mode-hint--source">
						Click a highlighted dot to place, or source again to deselect.
					</div>
				)}
			</main>

			{/* FLOATING CARDS */}
			<div className={`floating-hand ${selectedCard !== null ? 'floating-hand--has-selection' : ''}`}>
				<div className="floating-hand__cards">
					<Hand
						rules={rules}
						cards={myHand}
						selectedIndex={selectedCard}
						onSelect={(index) => {
							if (selectedCard === index) {
								setSelectedCard(null);
								setSelectedColor(null);
								setPlaceable([]);
								setSelectedSourceDot(null);
								return;
							}
							setSelectedCard(index);
							setSelectedSourceDot(null);
							const c = myHand[index];
							if (!c) return;
							if (isPathMode) {
								setPlaceable(computeValidSources(c.colors));
								setSelectedColor(null);
							} else if (selectedColor) {
								recomputePlaceable(selectedColor);
							} else {
								const coords = buildAllCoords(G.radius);
								const union = coords.filter((co) => c.colors.some((col) => canPlace(G, co, col, rules)));
								setPlaceable(union);
							}
						}}
						onPickColor={onPickColor}
					/>
				</div>
				<div className="floating-hand__actions">
					{!isPathMode && rules.PLACEMENT.DISCARD_TO_ROTATE !== false && (
						<button
							className={`floating-action ${rotationMode ? 'floating-action--active' : ''}`}
							onClick={() => {
								setRotationMode(!rotationMode);
								setSelectedCard(null);
								setSelectedColor(null);
								setPlaceable([]);
							}}
							disabled={!isMyTurn || locked}
							title="Rotate Mode"
						>
							↻
						</button>
					)}
					<button
						className="floating-action"
						onClick={() => {
							undo();
							setSelectedCard(null);
							setSelectedColor(null);
							setPlaceable([]);
							setPendingRotationTile(null);
							setRotatable([]);
							setRotationMode(false);
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
			</div>

			{/* FLOATING TREASURE */}
			{G.treasure.length > 0 && (
				<div className="floating-treasure">
					<div className="floating-treasure__label">Treasure</div>
					<Treasure rules={rules} cards={G.treasure} onTake={onTakeTreasure} />
				</div>
			)}

			{/* Game Over overlay */}
			{ctx.gameover && (
				<div className="game-over-overlay">
					<div className="game-over-modal">
						<h2>Game Over</h2>
						<ul className="game-over-scores">
							{Object.entries((ctx.gameover as { scores: Record<PlayerID, number> }).scores).map(([pid2, s]) => (
								<li key={`go-${pid2}`}>
									<span className="game-over-scores__player">P{pid2}</span>
									<span className="game-over-scores__value">{s}</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			)}
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
	const serverURL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8000';

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
		if (Number(viewer) >= numPlayers) setViewer(String(numPlayers - 1) as PlayerID);
	}, [numPlayers, viewer, setViewer]);

	return (
		<div className="app-root">
			{/* Setup controls in top-left corner */}
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
			</div>
			<ClientComp playerID={viewer} matchID={matchID || undefined} viewer={viewer} onSetViewer={setViewer} />
		</div>
	);
};

export default App;
