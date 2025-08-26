import React from 'react';
//

type Props = {
	currentPlayer: string;
	deckCount: number;
	discardCount: number;
	onEndTurn: () => void;
	onStash: () => void;
	bot: 'None' | 'Random';
	onBotChange: (b: 'None' | 'Random') => void;
	onBotPlay: () => void;
};

export const Controls: React.FC<Props> = ({ currentPlayer, deckCount, discardCount, onEndTurn, onStash, bot, onBotChange, onBotPlay }) => {
	return (
		<div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
			<div><strong>Player</strong>: {currentPlayer}</div>
			<div><strong>Deck</strong>: {deckCount}</div>
			<div><strong>Discard</strong>: {discardCount}</div>
			<button onClick={onStash}>Stash</button>
			<button onClick={onEndTurn}>End Turn & Refill</button>
			<div>
				<label>Bot: </label>
				<select value={bot} onChange={(e) => onBotChange(e.target.value as 'None' | 'Random')}>
					<option>None</option>
					<option>Random</option>
				</select>
				<button onClick={onBotPlay} disabled={bot === 'None'}>Let Bot Play</button>
			</div>
		</div>
	);
};


