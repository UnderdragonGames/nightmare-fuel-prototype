import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PlayerID } from 'boardgame.io';

type Props = {
	pid: PlayerID;
	handSize: number;
	onClose: () => void;
	/** Interactive mode for action cards (e.g., "Pick a card to steal"). */
	interactiveLabel?: string;
	onPickCard?: (index: number) => void;
};

/** Deterministic pseudo-random rotation seeded by index, range [-3, 3] degrees. */
function cardRotation(index: number): number {
	const seed = ((index * 2654435761) >>> 0) % 1000;
	const magnitude = (seed % 300) / 100;
	const sign = index % 2 === 0 ? 1 : -1;
	return sign * magnitude;
}

const cardSpring = {
	type: 'spring' as const,
	stiffness: 300,
	damping: 25,
};

export const PlayerHandModal: React.FC<Props> = ({
	pid,
	handSize,
	onClose,
	interactiveLabel,
	onPickCard,
}) => {
	const isInteractive = !!interactiveLabel && !!onPickCard;

	return (
		<AnimatePresence>
			{/* Gradient backdrop — same style as card zone gradient */}
			<motion.div
				className="player-hand-display__backdrop"
				onClick={onClose}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.2 }}
			/>

			{/* Floating label */}
			<motion.div
				className="player-hand-display__label"
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.2 }}
			>
				<span>P{pid}'s Hand</span>
				{isInteractive && (
					<span className="player-hand-display__action">{interactiveLabel}</span>
				)}
			</motion.div>

			{/* Card backs — fanned out in center of screen */}
			<div className="player-hand-display__cards">
				{Array.from({ length: handSize }, (_, i) => {
					const total = handSize;
					const position = i - (total - 1) / 2;
					const spacing = Math.min(100, 600 / Math.max(total, 1));
					const rotation = cardRotation(i);
					const yOffset = Math.abs(position) * 8;

					return (
						<motion.div
							key={i}
							className={`player-hand-display__card ${isInteractive ? 'player-hand-display__card--interactive' : ''}`}
							style={{
								zIndex: i,
							}}
							initial={{
								opacity: 0,
								x: 0,
								y: 40,
								scale: 0.7,
								rotate: 0,
							}}
							animate={{
								opacity: 1,
								x: position * spacing,
								y: yOffset,
								scale: 1,
								rotate: rotation,
							}}
							exit={{
								opacity: 0,
								y: 40,
								scale: 0.7,
							}}
							transition={{
								...cardSpring,
								delay: i * 0.03,
							}}
							onClick={isInteractive ? (e) => {
								e.stopPropagation();
								onPickCard(i);
							} : undefined}
						>
							<div className="player-hand-display__card-face">
								<div className="player-hand-display__card-border" />
							</div>
						</motion.div>
					);
				})}
			</div>
		</AnimatePresence>
	);
};
