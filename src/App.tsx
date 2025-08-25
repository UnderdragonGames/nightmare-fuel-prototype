import React, { useState } from 'react';
import './App.css';
import type { Ctx, PlayerID } from 'boardgame.io';
import { Client, type BoardProps as BGIOBoardProps } from 'boardgame.io/react';
import { HexStringsGame } from './game/game';
import { Board as HexBoard } from './ui/Board';
import type { Color, Co, GState, PlayerPrefs } from './game/types';
import { Hand } from './ui/Hand';
import { Treasure } from './ui/Treasure';
import { Controls } from './ui/Controls';
import { computeScores } from './game/scoring';
import { RULES } from './game/rulesConfig';
import { buildAllCoords, canPlace } from './game/helpers';

type MovesShape = {
	playCard: (a: { handIndex: number; pick: Color; coord: Co }) => void;
	stashToTreasure: (a: { handIndex: number }) => void;
	takeFromTreasure: (a: { index: number }) => void;
	endTurnAndRefill: () => void;
	setPrefs: (p: PlayerPrefs) => void;
};

type BoardProps = { G: GState; ctx: Ctx; moves: MovesShape; playerID?: PlayerID };

const GameBoard: React.FC<BoardProps> = ({ G, ctx, moves }) => {
	const [selectedCard, setSelectedCard] = useState<number | null>(null);
	const [selectedColor, setSelectedColor] = useState<Color | null>(null);
	const [scores, setScores] = useState<Record<string, number> | null>(null);
	const [bot, setBot] = useState<'None' | 'Random'>('None');
	const [showAxes, setShowAxes] = useState<boolean>(false);
	const [showRing, setShowRing] = useState<boolean>(false);

	const currentPlayer = ctx.currentPlayer;
	const hand = G.hands[currentPlayer] ?? [];

	const onHexClick = (coord: Co) => {
		if (selectedCard === null || !selectedColor || !moves.playCard) return;
		moves.playCard({ handIndex: selectedCard, pick: selectedColor, coord });
		setSelectedCard(null);
		setSelectedColor(null);
	};
	const onPickColor = (index: number, color: Color) => {
		setSelectedCard(index);
		setSelectedColor(color);
	};
	const onEndTurn = () => moves.endTurnAndRefill && moves.endTurnAndRefill();
	const onStash = () => {
		if (selectedCard !== null && moves.stashToTreasure) moves.stashToTreasure({ handIndex: selectedCard });
	};
	const onTakeTreasure = (i: number) => moves.takeFromTreasure && moves.takeFromTreasure({ index: i });
	const onChangePrefs = (prefs: PlayerPrefs) => moves.setPrefs && moves.setPrefs(prefs);
	const onScoreNow = () => setScores(computeScores(G));

	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, padding: 16 }}>
			<div>
				<HexBoard board={G.board} radius={G.radius} onHexClick={onHexClick} showAxes={showAxes} showRing={showRing} />
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
				<Controls
					currentPlayer={currentPlayer}
					deckCount={G.deck.length}
					discardCount={G.discard.length}
					onEndTurn={onEndTurn}
					onStash={onStash}
					prefs={G.prefs[currentPlayer]!}
					onChangePrefs={onChangePrefs}
					onScoreNow={onScoreNow}
					bot={bot}
					onBotChange={setBot}
					onBotPlay={() => {
						if (bot === 'Random') {
							const coords = buildAllCoords(G.radius);
							let acted = false;
							outer: for (let i = 0; i < hand.length; i += 1) {
								const card = hand[i]!;
								for (const color of card.colors) {
									for (const co of coords) {
										if (canPlace(G, co, color, RULES) && moves.playCard) {
											moves.playCard({ handIndex: i, pick: color, coord: co });
											acted = true;
											break outer;
										}
									}
								}
							}
							if (!acted && hand.length > 0) {
								if (G.treasure.length < RULES.TREASURE_MAX && moves.stashToTreasure) {
									moves.stashToTreasure({ handIndex: 0 });
								}
							}
							moves.endTurnAndRefill && moves.endTurnAndRefill();
						}
					}}
				/>
				<div style={{ display: 'flex', gap: 8 }}>
					<label><input type="checkbox" checked={showAxes} onChange={(e) => setShowAxes(e.target.checked)} /> Axes</label>
					<label><input type="checkbox" checked={showRing} onChange={(e) => setShowRing(e.target.checked)} /> Ring</label>
				</div>
				<div>
					<h4>Hand</h4>
					<Hand cards={hand} selectedIndex={selectedCard} onSelect={setSelectedCard} onPickColor={onPickColor} />
				</div>
				<div>
					<h4>Treasure</h4>
					<Treasure cards={G.treasure} onTake={onTakeTreasure} />
				</div>
				<div>
					<h4>Scores</h4>
					{scores ? (
						<ul>
							{Object.entries(scores).map(([pid2, s]) => (
								<li key={pid2}>P{pid2}: {s}</li>
							))}
						</ul>
					) : (
						<div>Click "Score Now"</div>
					)}
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

type AppBoardProps = BGIOBoardProps<GState> & BoardProps;

const HexStringsClient = Client<GState, AppBoardProps>({
	game: HexStringsGame,
	numPlayers: 2,
	board: GameBoard,
});

const App: React.FC = () => {
	const [activePlayer, setActivePlayer] = useState<PlayerID>('0');
	return (
		<div>
			<div style={{ padding: 8, display: 'flex', gap: 8 }}>
				<label>Active Seat: </label>
				<select value={activePlayer} onChange={(e) => setActivePlayer(e.target.value)}>
					<option value="0">P0</option>
					<option value="1">P1</option>
					<option value="2">P2</option>
					<option value="3">P3</option>
				</select>
			</div>
			<HexStringsClient playerID={activePlayer} />
		</div>
	);
};

export default App;
