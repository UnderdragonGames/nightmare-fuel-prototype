import React from 'react';
import type { Card, Color, Rules } from '../game/types';
import { serializeCard } from '../game/helpers';
import { CardZone } from './CardZone';

// Neural pathway card component
export const NeuralCard: React.FC<{
	card: Card;
	isSelected: boolean;
	rules: Rules;
	onSelect: () => void;
	onPickColor: (color: Color) => void;
	size?: 'normal' | 'expanded';
}> = ({ card, isSelected, rules, onSelect, onPickColor, size = 'normal' }) => {
	const sortedColors = [...card.colors].sort(
		(a, b) => (rules.COLORS as Color[]).indexOf(a) - (rules.COLORS as Color[]).indexOf(b)
	);

	// Calculate pathway positions - radiate from center
	const pathways = sortedColors.map((color, i) => {
		const angleOffset = -90; // Start from top
		const spreadAngle = sortedColors.length === 1 ? 0 : 120; // Total spread
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

	if (card.isAction) {
		return (
			<div
				className={`neural-card neural-card--action${expandedClass} ${isSelected ? 'neural-card--selected' : ''}`}
				onClick={onSelect}
			>
				<div className="neural-card__name">{card.name}</div>
				{card.text && (
					<div className="neural-card__text neural-card__text--action">
						{card.text}
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			className={`neural-card${expandedClass} ${isSelected ? 'neural-card--selected' : ''}`}
			onClick={onSelect}
		>
			<div className="neural-card__art">
				<svg viewBox="0 0 80 70" className="neural-card__pathways">
					{/* Central hub */}
					<circle cx="40" cy="35" r="6" className="neural-card__hub" />

					{/* Pathway lines and nodes */}
					{pathways.map(({ color, endX, endY }) => (
						<g key={color} className={`neural-card__path neural-card__path--${color}`}>
							<line x1="40" y1="35" x2={endX} y2={endY} />
							<circle cx={endX} cy={endY} r="5" />
						</g>
					))}
				</svg>
			</div>

			<div className="neural-card__actions">
				{card.colors.map((color) => (
					<button
						key={color}
						className={`neural-card__btn neural-card__btn--${color}`}
						onClick={(e) => {
							e.stopPropagation();
							onPickColor(color);
						}}
					>
						{color}
					</button>
				))}
			</div>
		</div>
	);
};

export const Hand: React.FC<{
	rules: Rules;
	cards: Card[];
	selectedIndex: number | null;
	onSelect: (index: number) => void;
	onPickColor: (index: number, color: Color) => void;
	isExpanded: boolean;
	onExpandChange: (expanded: boolean) => void;
	isMobile?: boolean;
	forceOpen?: boolean;
}> = ({ rules, cards, selectedIndex, onSelect, onPickColor, isExpanded, onExpandChange, isMobile, forceOpen }) => {
	// TODO: If the hand grows very large (e.g. > 10 cards), wrap expanded content
	// in a Coverflow component instead of relying on the CardZone fan layout.
	// For typical hand sizes (3-6 cards), the fan layout works well.
	// Coverflow integration is planned for the Discard zone first.

	return (
		<CardZone
			corner="bottom-right"
			cards={cards}
			isExpanded={isExpanded}
			onExpandChange={onExpandChange}
			selectedIndex={selectedIndex}
			onCardClick={onSelect}
			label="Hand"
			isMobile={isMobile}
			forceOpen={forceOpen}
		>
			{cards.map((card, i) => (
				<NeuralCard
					key={`${serializeCard(card)}-${i}`}
					card={card}
					isSelected={i === selectedIndex}
					rules={rules}
					onSelect={() => onSelect(i)}
					onPickColor={(color) => onPickColor(i, color)}
					size="expanded"
				/>
			))}
		</CardZone>
	);
};
