/* eslint-disable no-console */
/* eslint-disable no-debugger */
import React from 'react';
import './App.css';
import type { Ctx, PlayerID } from 'boardgame.io';
import { Client, type BoardProps as BGIOBoardProps } from 'boardgame.io/react';
import { SocketIO } from 'boardgame.io/multiplayer';
import { HexStringsGame } from './game/game';
import { Board as HexBoard } from './ui/Board';
//
import type { Color, Co, GState } from './game/types';
import { Hand } from './ui/Hand';
import { Treasure } from './ui/Treasure';
//
import { computeScores } from './game/scoring';
import { RULES } from './game/rulesConfig';
import { buildAllCoords, canPlace, asVisibleColor, key } from './game/helpers';
import { useUIStore } from './ui/useUIStore';
import { Controls } from './ui/Controls';
import { Players } from './ui/Players';
import { playOneRandom, playOneDumb, playOneSmart, type BotKind } from './game/bots';

// Types

type MovesShape = {
	playCard: (a: { handIndex: number; pick: Color; coord: Co }) => void;
	stashToTreasure: (a: { handIndex: number }) => void;
	takeFromTreasure: (a: { index: number }) => void;
	endTurnAndRefill: () => void;
	rotateTile: (a: { coord: Co; handIndex: number; rotation: number }) => void;
};

type ExtraBoardProps = { viewer: PlayerID; onSetViewer: (pid: PlayerID) => void };

type BoardProps = { G: GState; ctx: Ctx; moves: MovesShape; playerID?: PlayerID } & ExtraBoardProps;

const GameBoard: React.FC<BoardProps> = ({ G, ctx, moves, playerID, viewer, onSetViewer }) => {
	const [selectedCard, setSelectedCard] = React.useState<number | null>(null);
	const [selectedColor, setSelectedColor] = React.useState<Color | null>(null);
	const [rotationMode, setRotationMode] = React.useState(false);
	const [pendingRotationTile, setPendingRotationTile] = React.useState<Co | null>(null);
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


	const onHexClick = (coord: Co) => {
		if (!isMyTurn || locked) return;
		
		// If clicking elsewhere while rotation is pending, cancel it
		if (pendingRotationTile !== null) {
			if (key(pendingRotationTile) !== key(coord)) {
				setPendingRotationTile(null);
			}
			return;
		}
		
		// Rotation mode: click tile to show rotation options (requires card selected)
		if (rotationMode) {
			const tile = G.board[key(coord)];
			if (tile && tile.colors.length > 0 && selectedCard !== null && RULES.DISCARD_TO_ROTATE !== false) {
				setPendingRotationTile(coord);
				return;
			}
			return;
		}
		
		// Normal placement mode
		if (selectedCard === null) return;
		const card = myHand[selectedCard];
		if (!card) return;
		
		// Check if hex has an existing tile - if so, show rotation options (legacy behavior)
		const tile = G.board[key(coord)];
		if (tile && tile.colors.length > 0 && RULES.DISCARD_TO_ROTATE !== false) {
			setPendingRotationTile(coord);
			return;
		}
		
		// Otherwise, try to place the card
		if (selectedColor) {
			if (canPlace(G, coord, selectedColor, RULES)) {
				moves.playCard({ handIndex: selectedCard, pick: selectedColor, coord });
				setSelectedCard(null);
				setSelectedColor(null);
				setPlaceable([]);
			}
			return;
		}
		for (const color of card.colors) {
			if (canPlace(G, coord, color, RULES)) {
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
		setPlaceable(coords.filter((c) => canPlace(G, c, color, RULES)));
	};

	const onPickColor = (index: number, color: Color) => {
		if (locked) return;
		setSelectedCard(index);
		setSelectedColor(color);
		recomputePlaceable(color);
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
		}
	}, [locked]);

	// Update rotatable tiles when rotation mode or board changes
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
				endTurnAndRefill: () => {
					if (isOwnersTurn(pid)) moves.endTurnAndRefill();
				},
				stashToTreasure: (args: { handIndex: number }) => {
					if (isOwnersTurn(pid)) moves.stashToTreasure(args);
				},
			},
		};

		if (botKind === 'Random') {
			await playOneRandom(client, pid);
		} else if (botKind === 'Dumb') {
			await playOneDumb(client, pid);
		} else if (botKind === 'Smart') {
			await playOneSmart(client, pid);
		}
	};

	// Core autoplayer: if it's a bot's turn, ensure viewer matches owner first; once it does, run exactly one bot turn.
	const autoPlayingRef = React.useRef(false);
	React.useEffect(() => {
		const owner = ctx.currentPlayer as PlayerID;
		const botKind = botByPlayer[owner] ?? 'None';
		const isBot = botKind !== 'None';
		if (!isBot) return;
		// Ensure this board is controlling the owner seat before attempting any moves
		if (playerID !== owner) {
			console.log('[autoplay] switching viewer to owner', owner);
			onSetViewer(owner);
			return; // new GameBoard will mount for owner
		}
		if (autoPlayingRef.current) return;
		autoPlayingRef.current = true;
		(void (async () => {
			// In case turn has advanced between render and async start
			if (ctxRef.current.currentPlayer !== owner) { autoPlayingRef.current = false; return; }
			await botPlayOnce(owner, botKind);
			autoPlayingRef.current = false;
		})());
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ctx.currentPlayer, playerID, viewer, botByPlayer]);

	// Ensure that when it's a human's turn, this board controls that seat
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
	const onStash = () => { if (selectedCard !== null) { moves.stashToTreasure?.({ handIndex: selectedCard }); setSelectedCard(null); setSelectedColor(null); setPlaceable([]); } };
	const onTakeTreasure = (i: number) => moves.takeFromTreasure && moves.takeFromTreasure({ index: i });

	const scores = computeScores(G);

	return (
		<div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, padding: 16 }}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
				<Controls
					currentPlayer={currentPlayer}
					deckCount={G.deck.length}
					discardCount={G.discard.length}
					onEndTurn={onEndTurn}
					onStash={onStash}
					canStash={isMyTurn && selectedCard !== null && stage === 'active' && G.treasure.length < RULES.TREASURE_MAX}
					canEndTurn={isMyTurn}
					stashBonus={isMyTurn ? (G.meta.stashBonus[currentPlayer as PlayerID] ?? 0) : 0}
					rotationMode={rotationMode}
					onToggleRotationMode={() => {
						setRotationMode(!rotationMode);
						setSelectedCard(null);
						setSelectedColor(null);
						setPlaceable([]);
					}}
					canRotate={isMyTurn && !locked && RULES.DISCARD_TO_ROTATE !== false}
				/>
				<Players
					players={ctx.playOrder as PlayerID[]}
					currentPlayer={ctx.currentPlayer as PlayerID}
					scores={scores as Record<PlayerID, number>}
					goalsByPlayer={G.prefs}
					botByPlayer={botByPlayer}
					onToggleBot={(pid, v) => setBotFor(pid, v)}
				/>
				<button type="button" onClick={() => { const owner = ctx.currentPlayer as PlayerID; if (viewer !== owner) onSetViewer(owner); }}>Run Bots</button>
			</div>
			<div style={{ overflow: 'auto', maxHeight: '80vh' }}>
				<HexBoard
					board={G.board}
					radius={G.radius}
					onHexClick={onHexClick}
					showRing={showRing}
					highlightCoords={rotationMode ? rotatable : placeable}
					highlightColor={rotationMode ? '#3b82f6' : (selectedColor ? asVisibleColor(selectedColor) : '#000')}
					origins={G.origins}
					pendingRotationTile={pendingRotationTile}
					onRotationSelect={handleRotation}
				/>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
				{rotationMode && (
					<div style={{ padding: 8, background: '#dbeafe', border: '1px solid #3b82f6', borderRadius: 4, fontSize: 12 }}>
						<strong>Rotation Mode:</strong> Select a card from your hand, then click a highlighted tile and choose rotation amount (costs 1 card).
					</div>
				)}
				{pendingRotationTile !== null && (
					<div style={{ padding: 8, background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 4, fontSize: 12 }}>
						Click an arrow around the tile to rotate, or click elsewhere to cancel.
					</div>
				)}
				<div style={{ display: 'flex', gap: 8 }}>
					<label><input type="checkbox" checked={showRing} onChange={(e) => setShowRing(e.target.checked)} /> Ring</label>
				</div>
				<div>
					<h4>Hand</h4>
					<Hand
						cards={myHand}
						selectedIndex={selectedCard}
						onSelect={(index) => {
							setSelectedCard(index);
							const c = myHand[index];
							if (!c) return;
							if (selectedColor) {
								recomputePlaceable(selectedColor);
							} else {
								const coords = buildAllCoords(G.radius);
								const union = coords.filter((co) => c.colors.some((col) => canPlace(G, co, col, RULES)));
								setPlaceable(union);
							}
						}}
						onPickColor={onPickColor}
					/>
				</div>
				<div>
					<h4>Treasure</h4>
					<Treasure cards={G.treasure} onTake={onTakeTreasure} />
				</div>
				<div>
					<h4>Scores</h4>
					<ul>
						{Object.entries(scores).map(([pid2, s]) => (
							<li key={pid2}>P{pid2}: {s}</li>
						))}
					</ul>
					{ctx.gameover && (ctx.gameover as { scores: Record<PlayerID, number> }).scores && (
						<div style={{ marginTop: 8 }}>
							<strong>Game Over</strong>
							<ul>
								{Object.entries((ctx.gameover as { scores: Record<PlayerID, number> }).scores).map(([pid2, s]) => (
									<li key={`go-${pid2}`}>P{pid2}: {s}</li>
								))}
							</ul>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

// App

type AppBoardProps = BGIOBoardProps<GState> & BoardProps;

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
		<div style={{ display: 'grid', gridTemplateColumns: '260px 1fr' }}>
			<div style={{ padding: 12, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 12 }}>
				<div><strong>Players</strong></div>
				<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<label>Viewer:</label>
					<select value={viewer} onChange={(e) => setViewer(e.target.value as PlayerID)}>
						{Array.from({ length: numPlayers }).map((_, i) => (
							<option key={i} value={String(i)}>{`P${i}`}</option>
						))}
					</select>
				</div>
				<div style={{ display: 'flex', gap: 8 }}>
					<button type="button" onClick={() => { 
						const next = Math.min(8, numPlayers + 1); 
						setNumPlayers(next); 
						resetBotsForCount(next);
						if (matchID) {
							setMatchID(`match-${Date.now()}`);
						}
					}}>Add Player</button>
					<button type="button" onClick={() => { 
						const next = Math.max(2, numPlayers - 1); 
						setNumPlayers(next); 
						resetBotsForCount(next);
						if (matchID) {
							setMatchID(`match-${Date.now()}`);
						}
					}} disabled={numPlayers <= 2}>Remove Player</button>
				</div>
				<div style={{ color: '#64748b', fontSize: 12 }}>Changing player count restarts the game.</div>
				<div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
					<div><strong>Match</strong></div>
					<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
						<label>Match ID:</label>
						<input
							type="text"
							value={matchID || ''}
							onChange={(e) => setMatchID(e.target.value || null)}
							placeholder="local"
							style={{ flex: 1, padding: 4 }}
						/>
					</div>
					<div style={{ display: 'flex', gap: 8 }}>
						<button type="button" onClick={() => setMatchID(`match-${Date.now()}`)}>New Match</button>
						<button type="button" onClick={() => setMatchID(null)} disabled={!matchID}>Local</button>
					</div>
					<div style={{ color: '#64748b', fontSize: 12 }}>
						{matchID ? `Connected to ${serverURL}` : 'Local mode (no persistence)'}
					</div>
				</div>
			</div>
			<div>
				<ClientComp playerID={viewer} matchID={matchID || undefined} viewer={viewer} onSetViewer={setViewer} />
			</div>
		</div>
	);
};

export default App;
