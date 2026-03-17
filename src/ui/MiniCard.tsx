import React from 'react';
import type { Card, Color } from '../game/types';

const COLOR_MAP: Record<Color, string> = {
	R: 'var(--color-R)',
	O: 'var(--color-O)',
	Y: 'var(--color-Y)',
	G: 'var(--color-G)',
	B: 'var(--color-B)',
	V: 'var(--color-V)',
};

export const MiniCard: React.FC<{
	card: Card;
	isSelected: boolean;
	hasSelection: boolean;
	onClick: () => void;
}> = ({ card, isSelected, hasSelection, onClick }) => {
	const dimmed = hasSelection && !isSelected;

	const classes = [
		'mini-card',
		card.isAction ? 'mini-card--action' : '',
		isSelected ? 'mini-card--selected' : '',
		dimmed ? 'mini-card--dimmed' : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={classes} onClick={onClick}>
			{card.isAction ? (
				<span className="mini-card__label">
					{card.name.length > 8 ? card.name.slice(0, 8) + '\u2026' : card.name}
				</span>
			) : (
				<div className="mini-card__dots">
					{card.colors.map((color) => (
						<span
							key={color}
							className="mini-card__dot"
							style={{ backgroundColor: COLOR_MAP[color] }}
						/>
					))}
				</div>
			)}
		</div>
	);
};
