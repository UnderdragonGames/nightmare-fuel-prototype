/* eslint-disable no-console */
/* eslint-disable no-debugger */
import React from 'react';
import './App.css';
import type { Ctx, PlayerID } from 'boardgame.io';
import { Client, type BoardProps as BGIOBoardProps } from 'boardgame.io/react';
import { HexStringsGame } from './game/game';
import { Board as HexBoard } from './ui/Board';
//
import type { Color, Co, GState } from './game/types';
import { Hand } from './ui/Hand';
import { Treasure } from './ui/Treasure';
//
import { computeScores } from './game/scoring';
import { RULES } from './game/rulesConfig';
import { buildAllCoords, canPlace, asVisibleColor } from './game/helpers';
import { useUIStore } from './ui/useUIStore';
import { Controls } from './ui/Controls';
import { Players } from './ui/Players';

// Types

type MovesShape = {
	playCard: (a: { handIndex: number; pick: Color; coord: Co }) => void;
	stashToTreasure: (a: { handIndex: number }) => void;
	takeFromTreasure: (a: { index: number }) => void;
	endTurnAndRefill: () => void;
};

type ExtraBoardProps = { viewer: PlayerID; onSetViewer: (pid: PlayerID) => void };

type BoardProps = { G: GState; ctx: Ctx; moves: MovesShape; playerID?: PlayerID } & ExtraBoardProps;

const GameBoard: React.FC<BoardProps> = ({ G, ctx, moves, playerID, viewer, onSetViewer }) => {
	const [selectedCard, setSelectedCard] = React.useState<number | null>(null);
	const [selectedColor, setSelectedColor] = React.useState<Color | null>(null);
	const showRing = useUIStore((s) => s.showRing);
	const setShowRing = useUIStore((s) => s.setShowRing);
	const botByPlayer = useUIStore((s) => s.botByPlayer);
	const setBotFor = useUIStore((s) => s.setBotFor);
	const [placeable, setPlaceable] = React.useState<Co[]>([]);

	const gRef = React.useRef(G);
	const ctxRef = React.useRef(ctx);
	React.useEffect(() => { gRef.current = G; ctxRef.current = ctx; }, [G, ctx]);

	const currentPlayer = ctx.currentPlayer;
	const isMyTurn = playerID === currentPlayer;
	const myHand = G.hands[playerID ?? currentPlayer] ?? [];
	const stage = (ctx.activePlayers ? (ctx.activePlayers as Record<PlayerID, string>)[currentPlayer as PlayerID] : undefined) ?? 'active';
	const locked = stage !== 'active';

	const nextTick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

	const onHexClick = (coord: Co) => {
		if (selectedCard === null || !isMyTurn || locked) return;
		const card = myHand[selectedCard];
		if (!card) return;
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

	React.useEffect(() => {
		if (locked) {
			setSelectedCard(null);
			setSelectedColor(null);
			setPlaceable([]);
		}
	}, [locked]);

	const botPlayUntilStuckOnce = async (pid: PlayerID) => {
		console.log('[bot] start', pid);
		const isOwnersTurn = (owner: PlayerID) => ctxRef.current.currentPlayer === owner;
		if (!isOwnersTurn(pid)) return;
		while (true) {
			const GG = gRef.current;
			if (!isOwnersTurn(pid)) break;
			const coords = buildAllCoords(GG.radius);
			const handNow = GG.hands[pid] ?? [];
			let acted = false;
			outer: for (let i = 0; i < handNow.length; i += 1) {
				const card = handNow[i]!;
				for (const color of card.colors) {
					for (const co of coords) {
						if (canPlace(GG, co, color, RULES)) {
							if (!isOwnersTurn(pid)) { acted = true; break outer; }
							moves.playCard({ handIndex: i, pick: color, coord: co });
							acted = true;
							break outer;
						}
					}
				}
			}
			if (!acted) break;
			await nextTick(0);
		}
		const GG2 = gRef.current;
		if (!isOwnersTurn(pid)) return;
		if ((GG2.hands[pid] ?? []).length > 0 && GG2.treasure.length < RULES.TREASURE_MAX) {
			moves.stashToTreasure({ handIndex: 0 });
			await nextTick(0);
		}
		if (isOwnersTurn(pid)) {
			moves.endTurnAndRefill();
		}
	};

	// Core autoplayer: if it's a bot's turn, ensure viewer matches owner first; once it does, run exactly one bot turn.
	const autoPlayingRef = React.useRef(false);
	React.useEffect(() => {
		const owner = ctx.currentPlayer as PlayerID;
		const isBot = !!botByPlayer[owner];
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
			await botPlayUntilStuckOnce(owner);
			autoPlayingRef.current = false;
		})());
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ctx.currentPlayer, playerID, viewer, botByPlayer]);

	// Ensure that when it's a human's turn, this board controls that seat
	React.useEffect(() => {
		const owner = ctx.currentPlayer as PlayerID;
		const isBot = !!botByPlayer[owner];
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
				/>
				<Players
					players={ctx.playOrder as PlayerID[]}
					currentPlayer={ctx.currentPlayer as PlayerID}
					scores={scores as Record<PlayerID, number>}
					goalsByPlayer={G.prefs as any}
					botByPlayer={botByPlayer}
					onToggleBot={(pid, v) => setBotFor(pid, v)}
				/>
				<button onClick={() => { const owner = ctx.currentPlayer as PlayerID; if (viewer !== owner) onSetViewer(owner); }}>Run Bots</button>
			</div>
			<div style={{ overflow: 'auto', maxHeight: '80vh' }}>
				<HexBoard
					board={G.board}
					radius={G.radius}
					onHexClick={onHexClick}
					showRing={showRing}
					highlightCoords={placeable}
					highlightColor={selectedColor ? asVisibleColor(selectedColor) : '#000'}
				/>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
	const ClientComp = React.useMemo(
		() => Client<GState, AppBoardProps>({ game: HexStringsGame, numPlayers, board: GameBoard }),
		[numPlayers]
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
					<button onClick={() => { const next = Math.min(8, numPlayers + 1); setNumPlayers(next); resetBotsForCount(next); }}>Add Player</button>
					<button onClick={() => { const next = Math.max(2, numPlayers - 1); setNumPlayers(next); resetBotsForCount(next); }} disabled={numPlayers <= 2}>Remove Player</button>
				</div>
				<div style={{ color: '#64748b', fontSize: 12 }}>Changing player count restarts the game.</div>
			</div>
			<div>
				<ClientComp playerID={viewer} viewer={viewer} onSetViewer={setViewer} />
			</div>
		</div>
	);
};

export default App;
