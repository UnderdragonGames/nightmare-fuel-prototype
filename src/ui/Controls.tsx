import React from 'react';
//

type Props = {
	currentPlayer: string;
	deckCount: number;
	discardCount: number;
	onUndo: () => void;
	onEndTurn: () => void;
	onStash: () => void;
	canStash: boolean;
	canEndTurn: boolean;
	canUndo: boolean;
	stashBonus?: number;
	rotationMode?: boolean;
	onToggleRotationMode?: () => void;
	canRotate?: boolean;
};

export const Controls: React.FC<Props> = ({
	currentPlayer,
	deckCount,
	discardCount,
	onUndo,
	onEndTurn,
	onStash,
	canStash,
	canEndTurn,
	canUndo,
	stashBonus = 0,
	rotationMode = false,
	onToggleRotationMode,
	canRotate = false,
}) => {
	return (
		<div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
			<div><strong>Player</strong>: {currentPlayer}</div>
			<div><strong>Deck</strong>: {deckCount}</div>
			<div><strong>Discard</strong>: {discardCount}</div>
			{onToggleRotationMode && (
				<button 
					onClick={onToggleRotationMode} 
					disabled={!canRotate}
					style={{ 
						background: rotationMode ? '#3b82f6' : undefined,
						color: rotationMode ? 'white' : undefined
					}}
				>
					🔄 Rotate Mode
				</button>
			)}
			<button onClick={onUndo} disabled={!canUndo}>
				Undo
			</button>
			<button onClick={onStash} disabled={!canStash}>
				Stash{stashBonus > 0 && <span style={{ marginLeft: 4, color: '#22c55e' }}>+{stashBonus}</span>}
			</button>
			<button onClick={onEndTurn} disabled={!canEndTurn}>End Turn & Refill</button>
		</div>
	);
};


