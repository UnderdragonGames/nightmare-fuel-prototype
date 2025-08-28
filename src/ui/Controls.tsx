import React from 'react';
//

type Props = {
	currentPlayer: string;
	deckCount: number;
	discardCount: number;
	onEndTurn: () => void;
	onStash: () => void;
	canStash: boolean;
	canEndTurn: boolean;
};

export const Controls: React.FC<Props> = ({ currentPlayer, deckCount, discardCount, onEndTurn, onStash, canStash, canEndTurn }) => {
	return (
		<div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
			<div><strong>Player</strong>: {currentPlayer}</div>
			<div><strong>Deck</strong>: {deckCount}</div>
			<div><strong>Discard</strong>: {discardCount}</div>
			<button onClick={onStash} disabled={!canStash}>Stash</button>
			<button onClick={onEndTurn} disabled={!canEndTurn}>End Turn & Refill</button>
		</div>
	);
};


