import React from 'react';
import type { PlayerID } from 'boardgame.io';
import { asVisibleColor } from '../game/helpers';
import type { Color } from '../game/types';
import type { BotKind } from '../game/bots';

type Props = {
	pid: PlayerID;
	isTurn: boolean;
	score: number;
	goals: { primary: Color; secondary: Color; tertiary: Color };
	nightmareName?: string | null;
	botKind: BotKind;
	onBotChange: (bot: BotKind) => void;
	isViewer: boolean;
	onSetViewer: () => void;
	handSize: number;
	onHandClick?: () => void;
};

export const PlayerCard: React.FC<Props> = ({
	pid,
	isTurn,
	score,
	goals,
	nightmareName,
	botKind,
	onBotChange,
	isViewer,
	onSetViewer,
	handSize,
	onHandClick,
}) => {
	const goalColors = [goals.primary, goals.secondary, goals.tertiary];

	return (
		<div
			className={`player-card ${isTurn ? 'player-card--active' : ''} ${isViewer ? 'player-card--viewer' : ''}`}
			onClick={onSetViewer}
		>
			<div className="player-card__row">
				<div className="player-card__left">
					<span className="player-card__id">P{pid}</span>
					{isTurn && <span className="player-card__turn-indicator">●</span>}
					<span className="player-card__score">{score}</span>
				</div>
				<div className="player-card__priorities">
					{goalColors.map((col, i) => (
						<span
							key={`${col}-${i}`}
							className="player-card__priority-dot"
							style={{
								background: asVisibleColor(col),
								boxShadow: `0 0 ${6 - i * 2}px ${asVisibleColor(col)}`,
							}}
						/>
					))}
				</div>
			</div>
			{nightmareName && (
				<div className="player-card__nightmare" title="Assigned nightmare">
					{nightmareName}
				</div>
			)}
			{handSize > 0 && (
				<div
					className="player-card__hand"
					onClick={(e) => {
						e.stopPropagation();
						onHandClick?.();
					}}
					title={`${handSize} card${handSize !== 1 ? 's' : ''} in hand`}
				>
					<div className="player-card__hand-cards">
						{Array.from({ length: handSize }, (_, i) => (
							<div
								key={i}
								className="player-card__card-back"
								style={{ marginLeft: i > 0 ? -8 : 0, zIndex: i }}
							/>
						))}
					</div>
					<span className="player-card__hand-count">{handSize}</span>
				</div>
			)}
			<select
				value={botKind}
				onChange={(e) => {
					e.stopPropagation();
					onBotChange(e.target.value as BotKind);
				}}
				onClick={(e) => e.stopPropagation()}
				className="player-card__bot-select"
			>
				<option value="None">Human</option>
				<option value="Random">Random</option>
				<option value="Evaluator">Evaluator</option>
				<option value="EvaluatorPlus">Eval+</option>
			</select>
		</div>
	);
};
