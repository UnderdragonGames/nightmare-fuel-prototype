import React from 'react';
import type { Card, Color, Rules } from '../game/types';
import { CardZone } from './CardZone';
import { Coverflow } from './Coverflow';

type Props = {
	rules: Rules;
	cards: Card[];
	isExpanded: boolean;
	onExpandChange: (expanded: boolean) => void;
	isMobile?: boolean;
	// For action card triggering:
	interactive?: boolean; // When true, cards are selectable
	onSelectCard?: (index: number) => void; // Called when a card is selected in interactive mode
};

/** A single card rendered in the discard coverflow. */
const DiscardCard: React.FC<{
	card: Card;
	rules: Rules;
	isFocal: boolean;
	interactive?: boolean;
	onSelect: () => void;
}> = ({ card, rules, isFocal, interactive = false, onSelect }) => {
	const sortedColors = [...card.colors].sort(
		(a, b) =>
			(rules.COLORS as Color[]).indexOf(a) -
			(rules.COLORS as Color[]).indexOf(b),
	);

	// Calculate pathway positions — same geometry as NeuralCard.
	const pathways = sortedColors.map((color, i) => {
		const angleOffset = -90;
		const spreadAngle = sortedColors.length === 1 ? 0 : 120;
		const startAngle = angleOffset - spreadAngle / 2;
		const angle =
			sortedColors.length === 1
				? angleOffset
				: startAngle + (i / (sortedColors.length - 1)) * spreadAngle;
		const rad = (angle * Math.PI) / 180;
		const endX = 40 + Math.cos(rad) * 24;
		const endY = 35 + Math.sin(rad) * 24;
		return { color, endX, endY };
	});

	const focalClass = isFocal ? ' discard-card--focal' : '';
	const interactiveClass = interactive ? ' discard-card--interactive' : '';

	if (card.isAction) {
		return (
			<div
				className={`discard-card discard-card--action${focalClass}${interactiveClass}`}
				onClick={interactive ? onSelect : undefined}
			>
				<div className="discard-card__name">{card.name}</div>
				{card.text && (
					<div className="discard-card__text discard-card__text--action">
						{card.text}
					</div>
				)}
				{interactive && isFocal && (
					<button className="discard-card__select-btn" onClick={onSelect}>
						Select
					</button>
				)}
			</div>
		);
	}

	return (
		<div
			className={`discard-card${focalClass}${interactiveClass}`}
			onClick={interactive ? onSelect : undefined}
		>
			<div className="discard-card__art">
				<svg viewBox="0 0 80 70" className="discard-card__pathways">
					{/* Central hub */}
					<circle cx="40" cy="35" r="6" className="neural-card__hub" />

					{/* Pathway lines and nodes — reuse neural-card__path color classes */}
					{pathways.map(({ color, endX, endY }) => (
						<g
							key={color}
							className={`neural-card__path neural-card__path--${color}`}
						>
							<line x1="40" y1="35" x2={endX} y2={endY} />
							<circle cx={endX} cy={endY} r="5" />
						</g>
					))}
				</svg>
			</div>

			{interactive && isFocal && (
				<button className="discard-card__select-btn" onClick={onSelect}>
					Select
				</button>
			)}
		</div>
	);
};

export const DiscardZone: React.FC<Props> = ({
	rules,
	cards,
	isExpanded,
	onExpandChange,
	isMobile,
	interactive = false,
	onSelectCard,
}) => {
	return (
		<CardZone
			corner="top-left"
			cards={cards}
			isExpanded={isExpanded}
			onExpandChange={onExpandChange}
			selectedIndex={null}
			onCardClick={() => {}}
			label="Discard"
			isMobile={isMobile}
			renderExpanded={() => (
				<div className="discard-zone__coverflow-wrapper">
					<Coverflow
						itemCount={cards.length}
						renderItem={(index, isFocal) => (
							<DiscardCard
								card={cards[index]}
								rules={rules}
								isFocal={isFocal}
								interactive={interactive}
								onSelect={() => onSelectCard?.(index)}
							/>
						)}
						itemWidth={270}
						itemHeight={360}
					/>
				</div>
			)}
		>
			{/* children unused — renderExpanded takes over */}
			{null}
		</CardZone>
	);
};
