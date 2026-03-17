import React from 'react';
import type { Card, Color, Rules } from '../game/types';
import { serializeCard } from '../game/helpers';
import { CardZone } from './CardZone';

// Treasure card component (similar to NeuralCard but with Take button)
export const TreasureCard: React.FC<{
	card: Card;
	rules: Rules;
	onTake: () => void;
	size?: 'normal' | 'expanded';
}> = ({ card, rules, onTake, size = 'normal' }) => {
	const sortedColors = [...card.colors].sort(
		(a, b) => (rules.COLORS as Color[]).indexOf(a) - (rules.COLORS as Color[]).indexOf(b)
	);

	// Calculate pathway positions
	const pathways = sortedColors.map((color, i) => {
		const angleOffset = -90;
		const spreadAngle = sortedColors.length === 1 ? 0 : 120;
		const startAngle = angleOffset - spreadAngle / 2;
		const angle = sortedColors.length === 1
			? angleOffset
			: startAngle + (i / (sortedColors.length - 1)) * spreadAngle;
		const rad = (angle * Math.PI) / 180;
		const endX = 40 + Math.cos(rad) * 24;
		const endY = 35 + Math.sin(rad) * 24;
		return { color, endX, endY };
	});

	const expandedClass = size === 'expanded' ? ' neural-card--expanded' : '';

	return (
		<div className={`neural-card neural-card--treasure${expandedClass}`} onClick={onTake}>
			<div className="neural-card__art">
				<svg viewBox="0 0 80 70" className="neural-card__pathways">
					<circle cx="40" cy="35" r="6" className="neural-card__hub" />
					{pathways.map(({ color, endX, endY }) => (
						<g key={color} className={`neural-card__path neural-card__path--${color}`}>
							<line x1="40" y1="35" x2={endX} y2={endY} />
							<circle cx={endX} cy={endY} r="5" />
						</g>
					))}
				</svg>
			</div>
			<div className="neural-card__actions">
				<button
					className="action-btn action-btn--secondary"
					onClick={(e) => {
						e.stopPropagation();
						onTake();
					}}
					style={{ fontSize: '0.7rem', padding: '4px 8px' }}
				>
					Take
				</button>
			</div>
		</div>
	);
};

export const Treasure: React.FC<{
	rules: Rules;
	cards: Card[];
	onTake: (index: number) => void;
	isExpanded: boolean;
	onExpandChange: (expanded: boolean) => void;
	isMobile?: boolean;
}> = ({ rules, cards, onTake, isExpanded, onExpandChange, isMobile }) => {
	return (
		<CardZone
			corner="top-right"
			cards={cards}
			isExpanded={isExpanded}
			onExpandChange={onExpandChange}
			selectedIndex={null}
			onCardClick={(i) => onTake(i)}
			label="Treasure"
			isMobile={isMobile}
		>
			{cards.map((card, i) => (
				<TreasureCard
					key={`${serializeCard(card)}-${i}`}
					card={card}
					rules={rules}
					onTake={() => onTake(i)}
					size="expanded"
				/>
			))}
		</CardZone>
	);
};
