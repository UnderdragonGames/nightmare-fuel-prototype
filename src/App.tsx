/* eslint-disable no-console */
/* eslint-disable no-debugger */
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

// Types
type ExtraBoardProps = { viewer: PlayerID; onSetViewer: (pid: PlayerID) => void };
type AppBoardProps = BGIOBoardProps<GState> & ExtraBoardProps;

// PlayersStrip component for header
const PlayersStrip: React.FC<{
	players: PlayerID[];
	currentPlayer: PlayerID;
	scores: Record<PlayerID, number>;
	goalsByPlayer: Record<PlayerID, { primary: Color; secondary: Color; tertiary: Color }>;
	botByPlayer: Record<PlayerID, BotKind>;
}> = ({ players, currentPlayer, scores, goalsByPlayer, botByPlayer }) => {
	return (
		<div className="players-strip">
			{players.map((pid) => {
				const isTurn = pid === currentPlayer;
				const goals = goalsByPlayer[pid]!;
				return (
					<div key={pid} className={`player-badge ${isTurn ? 'player-badge--active' : ''}`}>
						<span className="player-badge__id">P{pid}</span>
						<span className="player-badge__score">{scores[pid] ?? 0}</span>
						<div className="player-badge__goals">
							{[goals.primary, goals.secondary, goals.tertiary].map((col, i) => (
								<span key={`${col}-${i}`} className={`player-badge__goal player-badge__goal--${col}`} />
							))}
						</div>
						{botByPlayer[pid] !== 'None' && (
							<span className="player-badge__bot">BOT</span>
						)}
					</div>
				);
			})}
		</div>
	);
};

// DeckPile component for visual deck/discard
const DeckPile: React.FC<{ count: number; label: string }> = ({ count, label }) => {
	const visibleCards = Math.min(count, 5);
	return (
		<div className="deck-pile">
			<div className="deck-pile__stack">
				{Array.from({ length: visibleCards }).map((_, i) => (
					<div
						key={i}
						className="deck-pile__card"
						style={{
							transform: `translateY(${-i * 2}px) rotate(${(i - 2) * 1.5}deg)`,
						}}
					/>
				))}
				{count === 0 && <div className="deck-pile__empty" />}
			</div>
			<div className="deck-pile__count">{count}</div>
			<div className="deck-pile__label">{label}</div>
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
	const showRing = useUIStore((s) => s.showRing);
	const setShowRing = useUIStore((s) => s.setShowRing);
	const botByPlayer = useUIStore((s) => s.botByPlayer);
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
		console.log('[bot] start', pid, botKind);
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
			console.log('[autoplay] switching viewer to owner', owner);
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

	const onEndTurn = async () => {
		moves.endTurnAndRefill && moves.endTurnAndRefill();
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
		<div className="game-container">
			{/* HEADER */}
			<header className="game-header">
				<div className="game-header__left">
					<span className="game-header__title">Nightmare Fuel</span>
					<PlayersStrip
						players={ctx.playOrder as PlayerID[]}
						currentPlayer={ctx.currentPlayer as PlayerID}
						scores={scores as Record<PlayerID, number>}
						goalsByPlayer={G.prefs}
						botByPlayer={botByPlayer}
					/>
				</div>
				<div className="game-header__right">
					<div className="deck-info">
						<span className="deck-info__item">Deck: <span className="deck-info__count">{G.deck.length}</span></span>
						<span className="deck-info__item">Discard: <span className="deck-info__count">{G.discard.length}</span></span>
					</div>
					<div className="action-bar">
						{!isPathMode && rules.PLACEMENT.DISCARD_TO_ROTATE !== false && (
							<button
								className={`action-btn ${rotationMode ? 'action-btn--primary' : 'action-btn--ghost'}`}
								onClick={() => {
									setRotationMode(!rotationMode);
									setSelectedCard(null);
									setSelectedColor(null);
									setPlaceable([]);
								}}
								disabled={!isMyTurn || locked}
							>
								Rotate
							</button>
						)}
						<button
							className="action-btn action-btn--ghost"
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
						>
							Undo
						</button>
						<button
							className="action-btn action-btn--secondary"
							onClick={onStash}
							disabled={!isMyTurn || selectedCard === null || stage !== 'active' || G.treasure.length >= rules.TREASURE_MAX}
						>
							Stash{stashBonus > 0 && <span className="bonus">+{stashBonus}</span>}
						</button>
						<button
							className="action-btn action-btn--primary"
							onClick={onEndTurn}
							disabled={!isMyTurn}
						>
							End Turn
						</button>
					</div>
					<label className="options-toggle">
						<input type="checkbox" checked={showRing} onChange={(e) => setShowRing(e.target.checked)} />
						Ring
					</label>
				</div>
			</header>

			{/* BOARD AREA */}
			<main className="game-board-area">
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
						<strong>Path Mode:</strong> Click a dot to select source, then click a neighbor to place.
					</div>
				)}
				{isPathMode && selectedSourceDot && (
					<div className="mode-hint mode-hint--source">
						Source selected! Click a highlighted dot to place, or click source again to deselect.
					</div>
				)}
			</main>

			{/* BOTTOM DOCK */}
			<footer className="game-dock">
				<div className="game-dock__section game-dock__hand">
					<h4 className="game-dock__section-title">Your Hand</h4>
					<Hand
						rules={rules}
						cards={myHand}
						selectedIndex={selectedCard}
						onSelect={(index) => {
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
				<div className="game-dock__section game-dock__decks">
					<DeckPile count={G.deck.length} label="Deck" />
					<DeckPile count={G.discard.length} label="Discard" />
				</div>
				<div className="game-dock__section game-dock__treasure">
					<h4 className="game-dock__section-title">Treasure</h4>
					<Treasure rules={rules} cards={G.treasure} onTake={onTakeTreasure} />
				</div>
			</footer>

			{/* Game Over overlay */}
			{ctx.gameover && (
				<div style={{
					position: 'fixed',
					inset: 0,
					background: 'rgba(0,0,0,0.8)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					zIndex: 100,
				}}>
					<div style={{
						background: 'var(--bg-surface)',
						padding: 32,
						borderRadius: 12,
						textAlign: 'center',
					}}>
						<h2 style={{ marginBottom: 16 }}>Game Over</h2>
						<ul style={{ textAlign: 'left' }}>
							{Object.entries((ctx.gameover as { scores: Record<PlayerID, number> }).scores).map(([pid2, s]) => (
								<li key={`go-${pid2}`} style={{ padding: '4px 0' }}>
									Player {pid2}: <strong>{s}</strong>
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
	const botByPlayer = useUIStore((s) => s.botByPlayer);
	const setBotFor = useUIStore((s) => s.setBotFor);
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
		<div className="app-layout">
			<aside className="setup-sidebar">
				<div className="setup-sidebar__section">
					<div className="setup-sidebar__title">Players</div>
					<div className="setup-sidebar__row">
						<label>Viewer:</label>
						<select value={viewer} onChange={(e) => setViewer(e.target.value as PlayerID)}>
							{Array.from({ length: numPlayers }).map((_, i) => (
								<option key={i} value={String(i)}>{`P${i}`}</option>
							))}
						</select>
					</div>
					<div className="setup-sidebar__row">
						<button onClick={() => {
							const next = Math.min(8, numPlayers + 1);
							setNumPlayers(next);
							resetBotsForCount(next);
							if (matchID) setMatchID(`match-${Date.now()}`);
						}}>Add</button>
						<button onClick={() => {
							const next = Math.max(2, numPlayers - 1);
							setNumPlayers(next);
							resetBotsForCount(next);
							if (matchID) setMatchID(`match-${Date.now()}`);
						}} disabled={numPlayers <= 2}>Remove</button>
					</div>
					<div className="setup-sidebar__hint">Changing count restarts game.</div>
				</div>

				<div className="setup-sidebar__section">
					<div className="setup-sidebar__title">Bot Controls</div>
					{Array.from({ length: numPlayers }).map((_, i) => {
						const pid = String(i) as PlayerID;
						return (
							<div key={pid} className="setup-sidebar__row">
								<span style={{ minWidth: 30 }}>P{pid}</span>
								<select value={botByPlayer[pid] ?? 'None'} onChange={(e) => setBotFor(pid, e.target.value as BotKind)}>
									<option value="None">Human</option>
									<option value="Random">Random</option>
									<option value="Evaluator">Evaluator</option>
									<option value="EvaluatorPlus">Evaluator+</option>
								</select>
							</div>
						);
					})}
				</div>

				<div className="setup-sidebar__section">
					<div className="setup-sidebar__title">Match</div>
					<div className="setup-sidebar__row">
						<input
							type="text"
							value={matchID || ''}
							onChange={(e) => setMatchID(e.target.value || null)}
							placeholder="local"
							style={{ flex: 1 }}
						/>
					</div>
					<div className="setup-sidebar__row">
						<button onClick={() => setMatchID(`match-${Date.now()}`)}>New Match</button>
						<button onClick={() => setMatchID(null)} disabled={!matchID}>Local</button>
					</div>
					<div className="setup-sidebar__hint">
						{matchID ? `Connected to ${serverURL}` : 'Local mode'}
					</div>
				</div>
			</aside>
			<main className="app-layout__main">
				<ClientComp playerID={viewer} matchID={matchID || undefined} viewer={viewer} onSetViewer={setViewer} />
			</main>
		</div>
	);
};

export default App;
