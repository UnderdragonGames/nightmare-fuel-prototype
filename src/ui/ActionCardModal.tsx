import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card, Rules } from '../game/types';

type Props = {
	card: Card;
	rules: Rules;
	onClose: () => void;
	children: React.ReactNode;
	/** When true, the modal is visually hidden but stays mounted (preserves form state). */
	hidden?: boolean;
};

export const ActionCardModal: React.FC<Props> = ({ card, onClose, children, hidden = false }) => {
	return (
		<AnimatePresence>
			<motion.div
				className="action-modal__overlay"
				onClick={onClose}
				initial={{ opacity: 0 }}
				animate={{ opacity: hidden ? 0 : 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.2 }}
				style={{
					pointerEvents: hidden ? 'none' : 'auto',
					visibility: hidden ? 'hidden' : 'visible',
				}}
			>
				<motion.div
					className="action-modal__content"
					onClick={(e) => e.stopPropagation()}
					initial={{ opacity: 0, scale: 0.95 }}
					animate={{ opacity: hidden ? 0 : 1, scale: hidden ? 0.95 : 1 }}
					exit={{ opacity: 0, scale: 0.95 }}
					transition={{ type: 'spring', stiffness: 300, damping: 25 }}
				>
					<button className="action-modal__close" onClick={onClose}>
						&times;
					</button>
					<div className="action-modal__card">
						<div className="neural-card neural-card--action neural-card--expanded neural-card--selected">
							<div className="neural-card__name">{card.name}</div>
							{card.text && (
								<div className="neural-card__text neural-card__text--action">
									{card.text}
								</div>
							)}
						</div>
					</div>
					<div className="action-modal__form">
						{children}
					</div>
				</motion.div>
			</motion.div>
		</AnimatePresence>
	);
};
