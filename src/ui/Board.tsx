import React from 'react';
import { axialToPixel, asVisibleColor, buildAllCoords, key, ringIndex } from '../game/helpers';
import { Hex } from './Hex';
import { RULES } from '../game/rulesConfig';
import type { Color, Co } from '../game/types';

type Props = {
	board: Record<string, Color[]>;
	radius: number;
	onHexClick: (coord: Co) => void;
	showAxes?: boolean;
	showRing?: boolean;
};

export const Board: React.FC<Props> = ({ board, radius, onHexClick, showAxes = RULES.UI.SHOW_AXES, showRing = RULES.UI.SHOW_RING }) => {
	const size = RULES.UI.HEX_SIZE;
	const coords = buildAllCoords(radius);
	const margin = size * (radius + 2);

	return (
		<svg width={margin * 2} height={margin * 2} viewBox={`${-margin} ${-margin} ${margin * 2} ${margin * 2}`}>
			{coords.map((c) => {
				const center = axialToPixel(c, size);
				const occupants = board[key(c)] ?? [];
				return (
					<Hex key={key(c)} center={center} size={size - 0.5} fill={occupants[0] ? asVisibleColor(occupants[0]) : '#f3f4f6'} stroke="#9ca3af" onClick={() => onHexClick(c)}>
						{showRing && (
							<text x={0} y={4} fontSize={8} textAnchor="middle" fill="#111827">{ringIndex(c)}</text>
						)}
					</Hex>
				);
			})}
			{showAxes && (
				<g>
					<line x1={-margin} y1={0} x2={margin} y2={0} stroke="#94a3b8" strokeDasharray="4 2" />
					<line x1={0} y1={-margin} x2={0} y2={margin} stroke="#94a3b8" strokeDasharray="4 2" />
				</g>
			)}
		</svg>
	);
};


