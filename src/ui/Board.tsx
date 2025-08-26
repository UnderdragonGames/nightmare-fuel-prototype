import React from 'react';
import { axialToPixel, asVisibleColor, buildAllCoords, key, ringIndex } from '../game/helpers';
import { Hex } from './Hex';
import { RULES } from '../game/rulesConfig';
import type { Color, Co } from '../game/types';

type Props = {
	board: Record<string, Color[]>;
	radius: number;
	onHexClick: (coord: Co) => void;
	showRing?: boolean;
  highlightCoords?: Co[];
  highlightColor?: string;
};

export const Board: React.FC<Props> = ({ board, radius, onHexClick, showRing = RULES.UI.SHOW_RING, highlightCoords = [], highlightColor = '#000000' }) => {
	const size = RULES.UI.HEX_SIZE;
	const coords = buildAllCoords(radius);
	const width = size * 3 * (radius + 1);
	const height = Math.sqrt(3) * size * (radius * 2 + 1);
	const marginX = width / 2 + size * 2;
	const marginY = height / 2 + size * 2;
	const highlightSet = new Set(highlightCoords.map((c) => key(c)));

	return (
		<svg width={marginX * 2} height={marginY * 2} viewBox={`${-marginX} ${-marginY} ${marginX * 2} ${marginY * 2}`}>
			{coords.map((c) => {
				const center = axialToPixel(c, size);
				const occupants = board[key(c)] ?? [];
				const isCenter = c.q === 0 && c.r === 0;
				const isHighlight = highlightSet.has(key(c)) && occupants.length === 0;
				return (
					<Hex
						key={key(c)}
						center={center}
						size={size - 0.5}
						fill={occupants[0] ? asVisibleColor(occupants[0]) : isHighlight ? highlightColor : isCenter ? '#d1d5db' : '#f3f4f6'}
						fillOpacity={isHighlight ? 0.35 : 1}
						stroke="#9ca3af"
						onClick={() => onHexClick(c)}
					>
						{showRing && (
							<text x={0} y={4} fontSize={8} textAnchor="middle" fill="#111827">{ringIndex(c)}</text>
						)}
					</Hex>
				);
			})}
		</svg>
	);
};


