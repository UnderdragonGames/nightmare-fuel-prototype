import React from 'react';

export type ActionMode = 'place' | 'rotate' | 'block';

type Props = {
	mode: ActionMode;
	onModeChange: (mode: ActionMode) => void;
	canRotate: boolean;
	canBlock: boolean;
	rotateCost: number;
	blockCost: number;
	disabled: boolean;
	discardCount: number;
	discardNeeded: number;
	handSize: number;
};

export const ActionModeStrip: React.FC<Props> = ({
	mode,
	onModeChange,
	canRotate,
	canBlock,
	rotateCost,
	blockCost,
	disabled,
	discardCount,
	discardNeeded,
	handSize,
}) => {
	if (!canRotate && !canBlock) return null;

	const costTooHigh = (cost: number) => handSize < cost;

	return (
		<div className="action-strip">
			<div className="action-strip__modes">
				<button
					className={`action-strip__btn ${mode === 'place' ? 'action-strip__btn--active' : ''}`}
					onClick={() => onModeChange('place')}
					disabled={disabled}
				>
					<span className="action-strip__icon">◆</span>
					<span className="action-strip__label">Place</span>
				</button>

				{canRotate && (
					<button
						className={`action-strip__btn ${mode === 'rotate' ? 'action-strip__btn--active' : ''}`}
						onClick={() => onModeChange('rotate')}
						disabled={disabled || costTooHigh(rotateCost)}
						title={costTooHigh(rotateCost) ? `Need ${rotateCost} card(s)` : `Discard ${rotateCost} to rotate`}
					>
						<span className="action-strip__icon">↻</span>
						<span className="action-strip__label">Rotate</span>
						<span className="action-strip__cost">{rotateCost}</span>
					</button>
				)}

				{canBlock && (
					<button
						className={`action-strip__btn ${mode === 'block' ? 'action-strip__btn--active' : ''}`}
						onClick={() => onModeChange('block')}
						disabled={disabled || costTooHigh(blockCost)}
						title={costTooHigh(blockCost) ? `Need ${blockCost} card(s)` : `Discard ${blockCost} to block`}
					>
						<span className="action-strip__icon">✕</span>
						<span className="action-strip__label">Block</span>
						<span className="action-strip__cost">{blockCost}</span>
					</button>
				)}
			</div>

			{discardNeeded > 0 && (
				<div className="action-strip__prompt">
					Select {discardNeeded} card{discardNeeded !== 1 ? 's' : ''} to discard
					{discardCount > 0 && (
						<span className="action-strip__progress">
							{discardCount}/{discardNeeded}
						</span>
					)}
				</div>
			)}
		</div>
	);
};
