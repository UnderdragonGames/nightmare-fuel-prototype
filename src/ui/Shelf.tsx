import React from 'react';
import type { Card, Color, Rules } from '../game/types';
import { asVisibleColor, serializeCard } from '../game/helpers';
import { NeuralCard } from './Hand';

/**
 * Desktop hand shelf (poker/Dominion style): a persistent bar along the
 * bottom edge. Cards are always visible; hovering raises a card and shows a
 * full-size readable zoom above it (no click needed — click means act).
 * During rotate/block, selected discard picks are styled distinctly (red,
 * lifted, ✕ badge) so the cost never reads as "back to your hand".
 */
export const Shelf: React.FC<{
	rules: Rules;
	cards: Card[];
	selectedIndex: number | null;
	discardSelection: number[];
	discardMode: boolean;
	onSelect: (index: number) => void;
	onPickColor: (index: number, color: Color) => void;
	deckCount: number;
	discardCount: number;
	onOpenDiscard: () => void;
	/** Docked on the right end of the shelf (undo / end-turn toolbar). */
	children?: React.ReactNode;
	/** Docked above the cards (the place/rotate/block mode strip). */
	topSlot?: React.ReactNode;
}> = ({
	rules,
	cards,
	selectedIndex,
	discardSelection,
	discardMode,
	onSelect,
	onPickColor,
	deckCount,
	discardCount,
	onOpenDiscard,
	children,
	topSlot,
}) => {
	const [hovered, setHovered] = React.useState<number | null>(null);

	return (
		<div className="shelf">
			{topSlot && <div className="shelf__top">{topSlot}</div>}
			<div className="shelf__row">
			<div className="shelf__piles">
				<div className="shelf__pile" title="Cards left in the deck">
					<b>{deckCount}</b>
					<span>Deck</span>
				</div>
				<button className="shelf__pile shelf__pile--btn" onClick={onOpenDiscard} title="Browse the discard pile">
					<b>{discardCount}</b>
					<span>Discard</span>
				</button>
			</div>

			<div className="shelf__cards">
				{cards.map((card, i) => {
					const isDiscardPick = discardMode && discardSelection.includes(i);
					const isSelected = !discardMode && i === selectedIndex;
					return (
						<div
							key={`${serializeCard(card)}-${i}`}
							className={[
								'shelf__card',
								isSelected ? 'shelf__card--selected' : '',
								isDiscardPick ? 'shelf__card--discard' : '',
								discardMode && !isDiscardPick ? 'shelf__card--dimmed' : '',
							].filter(Boolean).join(' ')}
							onMouseEnter={() => setHovered(i)}
							onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
						>
							{/* Hover-zoom: readable without a click */}
							{hovered === i && (
								<div className="shelf__zoom">
									<div className="shelf__zoom-name">{card.name}</div>
									{card.isAction ? (
										<>
											<div className="shelf__zoom-tag">
												{rules.ACTION_CARDS === 'one-per-turn' ? 'ACTION — one per turn' : 'ACTION'}
											</div>
											{card.text && <div className="shelf__zoom-text">{card.text}</div>}
										</>
									) : (
										<>
											<div className="shelf__zoom-text">Place a lane in one of these colors:</div>
											<div className="shelf__zoom-pips">
												{card.colors.map((c) => (
													<span
														key={c}
														className="shelf__zoom-pip"
														style={{ background: asVisibleColor(c), boxShadow: `0 0 5px ${asVisibleColor(c)}` }}
													/>
												))}
											</div>
										</>
									)}
								</div>
							)}
							<NeuralCard
								card={card}
								isSelected={isSelected || isDiscardPick}
								rules={rules}
								onSelect={() => onSelect(i)}
								onPickColor={(color) => onPickColor(i, color)}
							/>
						</div>
					);
				})}
				{cards.length === 0 && <div className="shelf__empty">No cards in hand</div>}
			</div>

			{children && <div className="shelf__tools">{children}</div>}
			</div>
		</div>
	);
};
