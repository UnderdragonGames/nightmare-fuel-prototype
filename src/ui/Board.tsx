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
			{/* Corner arrows indicating color directions */}
			<g>
				{(['R','O','Y','G','B','V'] as Color[]).map((col, i) => {
					const angle = (60 * i - 30) * Math.PI / 180; // point toward hex corner
					const r = Math.max(marginX, marginY) - size * 1.2;
					const cx = Math.cos(angle) * r;
					const cy = Math.sin(angle) * r;
					const tri = [
						`${cx},${cy}`,
						`${cx - 8 * Math.cos(angle - Math.PI / 2)},${cy - 8 * Math.sin(angle - Math.PI / 2)}`,
						`${cx - 8 * Math.cos(angle + Math.PI / 2)},${cy - 8 * Math.sin(angle + Math.PI / 2)}`,
					].join(' ');
					return (
						<polygon key={`arrow-${col}`} points={tri} fill={asVisibleColor(col)} opacity={0.9} />
					);
				})}
			</g>
			{coords.map((c) => {
				const center = axialToPixel(c, size);
				const occupants = board[key(c)] ?? [];
				const isCenter = c.q === 0 && c.r === 0;
				const isHighlight = highlightSet.has(key(c)) && occupants.length === 0;
				const split = occupants.length >= 2 ? [asVisibleColor(occupants[0] as Color), asVisibleColor(occupants[1] as Color)] as [string, string] : null;
				return (
					<Hex
						key={key(c)}
						center={center}
						size={size - 0.5}
						fill={occupants[0] ? asVisibleColor(occupants[0]) : isHighlight ? highlightColor : isCenter ? '#d1d5db' : '#f3f4f6'}
						splitFills={split ?? undefined}
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


