import React from 'react';
import type { Card } from '../game/types';
import { asVisibleColor, serializeCard } from '../game/helpers';

type Props = {
	cards: Card[];
	onTake: (index: number) => void;
};

export const Treasure: React.FC<Props> = ({ cards, onTake }) => {
	return (
		<div style={{ display: 'flex', gap: 8 }}>
			{cards.map((c, i) => (
				<div key={`${serializeCard(c)}-${i}`} style={{ border: '1px dashed #94a3b8', padding: 8, borderRadius: 6 }}>
					<div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
						{c.colors.map((color) => (
							<span key={color} style={{ background: asVisibleColor(color), width: 12, height: 12, borderRadius: 2, display: 'inline-block' }} />
						))}
					</div>
					<button onClick={() => onTake(i)} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1' }}>Take</button>
				</div>
			))}
		</div>
	);
};


