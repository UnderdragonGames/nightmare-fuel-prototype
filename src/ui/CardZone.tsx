import React, { useRef, useEffect, useCallback, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { Card } from '../game/types';
import { MiniCard } from './MiniCard';

type Corner = 'bottom-right' | 'top-right' | 'top-left';

const layoutTransition = {
	type: 'spring' as const,
	stiffness: 400,
	damping: 30,
};

export const CardZone: React.FC<{
	corner: Corner;
	cards: Card[];
	isExpanded: boolean;
	onExpandChange: (expanded: boolean) => void;
	selectedIndex: number | null;
	onCardClick: (index: number) => void;
	label: string;
	children: React.ReactNode;
	isMobile?: boolean;
	forceOpen?: boolean;
	/** When provided, replaces the per-card fan layout with custom content
	 *  (e.g., Coverflow for large card sets like the discard pile). */
	renderExpanded?: () => React.ReactNode;
}> = ({
	corner,
	cards,
	isExpanded,
	onExpandChange,
	selectedIndex,
	onCardClick,
	label,
	children,
	isMobile = false,
	forceOpen = false,
	renderExpanded,
}) => {
	// Simple hover with grace period.
	const [isHovered, setIsHovered] = useState(false);
	const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const prevHovered = useRef(false);
	const prevExpanded = useRef(isExpanded);

	// Track which individual card is hovered (expanded mode only).
	const [hoveredCardIndex, setHoveredCardIndex] = useState<number | null>(null);

	const clearGrace = useCallback(() => {
		if (graceTimer.current) {
			clearTimeout(graceTimer.current);
			graceTimer.current = null;
		}
	}, []);

	const handleMouseEnter = useCallback(() => {
		if (isMobile) return;
		clearGrace();
		setIsHovered(true);
	}, [isMobile, clearGrace]);

	const handleMouseLeave = useCallback(() => {
		if (isMobile) return;
		clearGrace();
		graceTimer.current = setTimeout(() => setIsHovered(false), 200);
	}, [isMobile, clearGrace]);

	useEffect(() => () => clearGrace(), [clearGrace]);

	// Drive expand/collapse from hover edges
	useEffect(() => {
		if (isMobile) return;
		if (isHovered && !prevHovered.current) {
			onExpandChange(true);
		}
		if (!isHovered && prevHovered.current && !forceOpen) {
			onExpandChange(false);
		}
		prevHovered.current = isHovered;
	}, [isHovered, forceOpen, isMobile, onExpandChange]);

	// When parent collapses us (mutual exclusion), reset hover
	useEffect(() => {
		if (prevExpanded.current && !isExpanded) {
			if (isHovered) {
				clearGrace();
				setIsHovered(false);
			}
			setHoveredCardIndex(null);
		}
		prevExpanded.current = isExpanded;
	}, [isExpanded, isHovered, clearGrace]);

	// Deterministic pseudo-random rotation per card index, range [0, 3] degrees.
	const getCardRotation = (index: number): number => {
		const seed = ((index * 2654435761) >>> 0) % 1000;
		const magnitude = (seed % 300) / 100;
		const sign = index % 2 === 0 ? 1 : -1;
		return sign * magnitude;
	};

	// Fan offset per card when expanded.
	// When a card is hovered, neighboring cards are pushed aside to reveal it fully.
	const getFanOffset = useCallback(
		(index: number, total: number, hovered: number | null) => {
			const spacing = 90;
			const position = index - (total - 1) / 2;

			// Extra offset when a card is hovered: push cards on each side apart.
			// Expanded cards are 270px wide with 90px spacing → 180px overlap.
			// Push neighbors by 150px to mostly clear the overlap.
			let hoverPush = 0;
			if (hovered !== null && index !== hovered) {
				const pushAmount = 150;
				// Direction depends on corner's spacing sign.
				// bottom-right/top-right use negative spacing; top-left uses positive.
				const pushSign = corner === 'top-left' ? -1 : 1;
				hoverPush = (index < hovered ? -pushSign : pushSign) * pushAmount;
			}

			switch (corner) {
				case 'bottom-right':
					return { x: position * -spacing + hoverPush, y: position * -14 };
				case 'top-right':
					return { x: position * -spacing + hoverPush, y: position * 14 };
				case 'top-left':
					return { x: position * spacing + hoverPush, y: position * 14 };
			}
		},
		[corner],
	);

	const gradientDirection = (() => {
		switch (corner) {
			case 'bottom-right':
				return 'to top left';
			case 'top-right':
				return 'to bottom left';
			case 'top-left':
				return 'to bottom right';
		}
	})();

	const childArray = React.Children.toArray(children);

	// Whether to use custom expanded rendering (e.g., Coverflow)
	const useCustomExpanded = !!renderExpanded;

	return (
		<LayoutGroup id={`zone-${corner}`}>
			<div
				className={`card-zone card-zone--${corner}`}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				onClick={() => { if (isMobile) onExpandChange(!isExpanded); }}
			>
				{/* Gradient overlay — behind cards */}
				<AnimatePresence>
					{isExpanded && (
						<motion.div
							className="card-zone__gradient"
							style={{
								backgroundImage: `linear-gradient(${gradientDirection}, rgba(15, 15, 24, 0.95) 0%, rgba(15, 15, 24, 0.6) 40%, transparent 80%)`,
							}}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
						/>
					)}
				</AnimatePresence>

				{/* Badge */}
				<div className="card-zone__badge">
					<span className="card-zone__badge-label">{label}</span>
					<span className="card-zone__badge-count">{cards.length}</span>
				</div>

				{/* Cards — either per-card layout animation or custom expanded content */}
				{useCustomExpanded ? (
					// Custom expanded mode (e.g., Coverflow for discard):
					// Collapsed shows mini-cards, expanded shows custom content.
					<>
						{/* Collapsed mini-cards */}
						{!isExpanded && (
							<div className="card-zone__cards card-zone__cards--collapsed">
								{cards.map((card, i) => (
									<div
										key={`${card.id}-${i}`}
										className="card-zone__card-wrapper"
										style={{
											zIndex: i,
										}}
									>
										<MiniCard
											card={card}
											isSelected={i === selectedIndex}
											hasSelection={selectedIndex !== null}
											onClick={() => onCardClick(i)}
										/>
									</div>
								))}
							</div>
						)}

						{/* Custom expanded content */}
						<AnimatePresence>
							{isExpanded && (
								<motion.div
									className="card-zone__custom-expanded"
									initial={{ opacity: 0, scale: 0.95 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.95 }}
									transition={{ duration: 0.2 }}
								>
									{renderExpanded()}
								</motion.div>
							)}
						</AnimatePresence>
					</>
				) : (
					// Per-card layout animation mode (Hand, Treasure):
					// Layout animation handles repositioning when cards are added/removed.
					// New cards appear at their final position; remaining cards slide smoothly.
					<div
						className={`card-zone__cards ${isExpanded ? 'card-zone__cards--expanded' : 'card-zone__cards--collapsed'}`}
					>
						{cards.map((card, i) => {
							const fan = getFanOffset(i, cards.length, isExpanded ? hoveredCardIndex : null);
							const rotation = getCardRotation(i);

							return (
								<motion.div
									key={`${card.id}-${i}`}
									layoutId={`${corner}-card-${card.id}-${i}`}
									layout
									className="card-zone__card-wrapper"
									style={{
										zIndex: isExpanded
											? (i === hoveredCardIndex
												? cards.length + 2
												: i === selectedIndex
													? cards.length + 1
													: i)
											: i,
									}}
									animate={
										isExpanded
											? {
													x: fan.x,
													y: fan.y,
													rotate: rotation,
													scale: 1,
												}
											: {
													x: 0,
													y: 0,
													rotate: rotation * 0.3,
													scale: 1,
												}
									}
									transition={layoutTransition}
									onMouseEnter={() => { if (isExpanded) setHoveredCardIndex(i); }}
									onMouseLeave={() => { if (isExpanded) setHoveredCardIndex(null); }}
								>
									{isExpanded ? (
										childArray[i] ?? null
									) : (
										<MiniCard
											card={card}
											isSelected={i === selectedIndex}
											hasSelection={selectedIndex !== null}
											onClick={() => onCardClick(i)}
										/>
									)}
								</motion.div>
							);
						})}
					</div>
				)}
			</div>
		</LayoutGroup>
	);
};
