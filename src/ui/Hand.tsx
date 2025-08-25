import React from 'react';
import { Card, Color } from '../game/types';
import { asVisibleColor, serializeCard } from '../game/helpers';

type Props = {
	cards: Card[];
	selectedIndex: number | null;
	onSelect: (index: number) => void;
	onPickColor: (index: number, color: Color) => void;
};

export const Hand: React.FC<Props> = ({ cards, selectedIndex, onSelect, onPickColor }) => {
	return (
		<div style={{ display: 'flex', gap: 8 }}>
			{cards.map((c, i) => (
				<div key={`${serializeCard(c)}-${i}`} style={{ border: i === selectedIndex ? '2px solid #2563eb' : '1px solid #e5e7eb', padding: 8, borderRadius: 6 }} onClick={() => onSelect(i)}>
					<div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
						{c.colors.map((color) => (
							<span key={color} style={{ background: asVisibleColor(color), width: 12, height: 12, borderRadius: 2, display: 'inline-block' }} />
						))}
					</div>
					<div style={{ display: 'flex', gap: 6 }}>
						{c.colors.map((color) => (
							<button key={`b-${color}`} onClick={(e) => { e.stopPropagation(); onPickColor(i, color); }} style={{ padding: '2px 6px', background: asVisibleColor(color), color: 'white', border: 'none', borderRadius: 4 }}>
								{color}
							</button>
						))}
					</div>
				</div>
			))}
		</div>
	);
};


