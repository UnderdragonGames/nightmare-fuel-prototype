import React from 'react';
import type { Card, Color, Rules } from '../game/types';
import { asVisibleColor } from '../game/helpers';

/**
 * Full-size readable view of any card, opened by tapping it in the treasure
 * or discard piles (small cards make action text unreadable, especially on
 * mobile). Optionally carries one primary action (e.g. "Take to hand") so
 * viewing and acting are separate, deliberate steps.
 */
export const CardInspector: React.FC<{
	card: Card;
	rules: Rules;
	/** Where the card was tapped — shown as a small context tag. */
	source: 'treasure' | 'discard';
	action?: { label: string; onAct: () => void; disabledReason?: string | null };
	onClose: () => void;
}> = ({ card, rules, source, action, onClose }) => {
	React.useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [onClose]);

	return (
		<div className="card-inspector" onClick={onClose}>
			<div className="card-inspector__card" onClick={(e) => e.stopPropagation()}>
				<div className="card-inspector__source">{source === 'treasure' ? 'Treasure' : 'Discard pile'}</div>
				<div className="card-inspector__name">{card.name}</div>
				{card.isAction ? (
					<>
						<div className="card-inspector__tag">
							{rules.ACTION_CARDS === 'one-per-turn' ? 'ACTION — one per turn' : 'ACTION'}
						</div>
						{card.text && <div className="card-inspector__text">{card.text}</div>}
					</>
				) : (
					<>
						<div className="card-inspector__text">Place a lane in one of these colors:</div>
						<div className="card-inspector__pips">
							{card.colors.map((c) => (
								<span
									key={c}
									className="card-inspector__pip"
									style={{ background: asVisibleColor(c as Color), boxShadow: `0 0 6px ${asVisibleColor(c as Color)}` }}
								/>
							))}
						</div>
					</>
				)}
				<div className="card-inspector__actions">
					{action && (
						<button
							className="btn btn--primary"
							onClick={action.onAct}
							disabled={!!action.disabledReason}
							title={action.disabledReason ?? undefined}
						>
							{action.label}
						</button>
					)}
					{action?.disabledReason && (
						<div className="card-inspector__reason">{action.disabledReason}</div>
					)}
					<button className="btn" onClick={onClose}>Close</button>
				</div>
			</div>
		</div>
	);
};
