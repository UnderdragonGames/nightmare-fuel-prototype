import React from 'react';
import { axialToPixel, asVisibleColor, buildAllCoords, key, ringIndex, edgeIndexToColor, neighbors } from '../game/helpers';
import { Hex } from './Hex';
import type { Color, Co, HexTile, Rules } from '../game/types';

type Props = {
	rules: Rules;
	board: Record<string, HexTile>;
	radius: number;
	onHexClick: (coord: Co) => void;
	showRing?: boolean;
	highlightCoords?: Co[];
	highlightColor?: string;
	origins?: Co[];
	pendingRotationTile?: Co | null;
	onRotationSelect?: (rotation: number) => void;
	selectedColor?: Color | null; // for path mode preview
	selectedSourceDot?: Co | null; // for path mode: currently selected source dot
};

export const Board: React.FC<Props> = ({ rules, board, radius, onHexClick, showRing, highlightCoords = [], highlightColor = '#000000', origins = [], pendingRotationTile = null, onRotationSelect, selectedColor = null, selectedSourceDot = null }) => {
	const size = rules.UI.HEX_SIZE;
	const effectiveShowRing = showRing ?? rules.UI.SHOW_RING;
	const coords = buildAllCoords(radius);
	const width = size * 3 * (radius + 1);
	const height = Math.sqrt(3) * size * (radius * 2 + 1);
	const marginX = width / 2 + size * 2;
	const marginY = height / 2 + size * 2;
	const highlightSet = new Set(highlightCoords.map((c) => key(c)));
	const originSet = new Set(origins.map((c) => key(c)));
	
	const isPathMode = rules.MODE === 'path';
	
	// Lane segment width and offset for parallel rendering
	const laneWidth = size * 0.2;
	const laneGap = laneWidth * 1.1;
	
	// Precompute all lane segments for path mode (rendered on layer above all hexes)
	const allLaneSegments: Array<{ x1: number; y1: number; x2: number; y2: number; color: Color; key: string }> = [];
	
	if (isPathMode) {
		for (const c of coords) {
			const tile = board[key(c)];
			if (!tile || tile.colors.length === 0) continue;
			const center = axialToPixel(c, size);
			
			for (let laneIdx = 0; laneIdx < tile.colors.length; laneIdx += 1) {
				const laneColor = tile.colors[laneIdx];
				if (!laneColor) continue;
				const dirVec = rules.COLOR_TO_DIR[laneColor];
				// Draw from this tile toward the neighbor in the OPPOSITE direction (source)
				const source = axialToPixel({ q: c.q - dirVec.q, r: c.r - dirVec.r }, size);
				
				// Calculate offset for parallel lanes
				const dx = center.x - source.x;
				const dy = center.y - source.y;
				const len = Math.hypot(dx, dy) || 1;
				// Perpendicular vector
				const perpX = -dy / len;
				const perpY = dx / len;
				
				// Count same-color lanes at this tile for this direction
				const sameColorCount = tile.colors.filter((tc) => tc === laneColor).length;
				// If multiple lanes same color, we need unique offset per occurrence
				const occurrenceIndex = tile.colors.slice(0, laneIdx + 1).filter((tc) => tc === laneColor).length - 1;
				
				// Offset from center based on total lanes and this lane's index
				const totalLanes = tile.colors.length;
				const offsetIndex = laneIdx - (totalLanes - 1) / 2;
				// But if same color occurs multiple times, spread those specifically
				const baseOffset = sameColorCount === 1 ? offsetIndex : occurrenceIndex - (sameColorCount - 1) / 2 + offsetIndex * 0.3;
				const offset = baseOffset * laneGap;
				
				// Apply perpendicular offset
				const offX = perpX * offset;
				const offY = perpY * offset;
				
				// Draw from 15% to 85% of the way (lane crosses hex border, stops short of dots)
				const tStart = 0.15;
				const tEnd = 0.85;
				const x1 = source.x + dx * tStart + offX;
				const y1 = source.y + dy * tStart + offY;
				const x2 = source.x + dx * tEnd + offX;
				const y2 = source.y + dy * tEnd + offY;
				
				allLaneSegments.push({
					x1, y1, x2, y2,
					color: laneColor,
					key: `${key(c)}-${laneIdx}-${laneColor}`,
				});
			}
		}
	}

	return (
		<svg width={marginX * 2} height={marginY * 2} viewBox={`${-marginX} ${-marginY} ${marginX * 2} ${marginY * 2}`}>
			{/* Corner circles indicating color directions, aligned to COLOR_TO_DIR */}
			<g>
				{(rules.COLORS as Color[]).map((col) => {
					const dir = rules.COLOR_TO_DIR[col];
					const step = axialToPixel(dir, 1);
					const len = Math.hypot(step.x, step.y) || 1;
					const ux = step.x / len;
					const uy = step.y / len;
					const r = Math.max(marginX, marginY) - size * 1.2;
					const cx = ux * r;
					const cy = uy * r;
					return (
						<circle key={`dir-${col}`} cx={cx} cy={cy} r={8} fill={asVisibleColor(col)} stroke="#111827" strokeWidth={0.75} />
					);
				})}
			</g>
			
			{/* Layer 1: All hex backgrounds */}
			{coords.map((c) => {
				const center = axialToPixel(c, size);
				const tile = board[key(c)];
				const occupants = tile?.colors ?? [];
				const rotation = tile?.rotation ?? 0;
				const order = rules.COLORS as Color[];
				const sortedOccupants = occupants.length > 1 ? [...occupants].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : occupants;
				const isOrigin = originSet.has(key(c));
				const isHighlighted = highlightSet.has(key(c));
				const isHighlight = isHighlighted && occupants.length === 0;
				const isRotatable = isHighlighted && occupants.length > 0;
				const isPendingRotation = pendingRotationTile !== null && key(pendingRotationTile) === key(c);
				const split = !isPathMode && sortedOccupants.length >= 2 ? [asVisibleColor(sortedOccupants[0] as Color), asVisibleColor(sortedOccupants[1] as Color)] as [string, string] : null;
				
				// In path mode, hex fill is neutral - lanes show the colors
				const hexFill = isPathMode
					? (isHighlight ? highlightColor : isOrigin ? '#d1d5db' : '#f3f4f6')
					: (sortedOccupants[0] ? asVisibleColor(sortedOccupants[0]) : isHighlight ? highlightColor : isOrigin ? '#d1d5db' : '#f3f4f6');
				
				return (
					<g key={key(c)}>
						<Hex
							center={center}
							size={size - 0.5}
							fill={hexFill}
							splitFills={split ?? undefined}
							fillOpacity={isHighlight ? 0.35 : (isRotatable && !isPathMode ? 0.7 : 1)}
							stroke={isRotatable && !isPathMode ? highlightColor : (isOrigin ? '#ef4444' : '#9ca3af')}
							strokeWidth={isRotatable && !isPathMode ? 3 : (isOrigin ? 2 : 1)}
							onClick={() => !isPathMode && onHexClick(c)}
						>
							{effectiveShowRing && (
								<text x={0} y={4} fontSize={8} textAnchor="middle" fill="#111827">{ringIndex(c)}</text>
							)}
							{isOrigin && occupants.length === 0 && !isPathMode && (
								<circle cx={0} cy={0} r={size * 0.3} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="4,2" />
							)}
							{/* Rotation indicator - hide in path mode */}
							{!isPathMode && isRotatable && !isPendingRotation && (
								<text x={0} y={-size * 0.4} fontSize={size * 0.6} textAnchor="middle" fill={highlightColor} style={{ pointerEvents: 'none', userSelect: 'none' }}>🔄</text>
							)}
						</Hex>
						{/* Rotation arrows - show when tile is pending rotation - hide in path mode */}
						{!isPathMode && isPendingRotation && onRotationSelect && (
							<g>
								{(() => {
									const neigh = neighbors(c);
									const arrowConfigs: Array<{ coord: Co; rot: number; cw: boolean }> = [];
									if (neigh[0]) arrowConfigs.push({ coord: neigh[0]!, rot: 1, cw: true });
									if (neigh[1]) arrowConfigs.push({ coord: neigh[1]!, rot: 1, cw: true });
									if (neigh[3]) arrowConfigs.push({ coord: neigh[3]!, rot: 5, cw: false });
									if (neigh[4]) arrowConfigs.push({ coord: neigh[4]!, rot: 5, cw: false });
									return arrowConfigs.map(({ coord, rot, cw }) => {
										const pos = axialToPixel(coord, size);
										return (
											<g
												key={`arrow-${rot}-${coord.q},${coord.r}`}
												transform={`translate(${pos.x}, ${pos.y})`}
												onClick={(e) => { e.stopPropagation(); onRotationSelect(rot); }}
												style={{ cursor: 'pointer' }}
											>
												<circle cx={0} cy={0} r={size * 0.4} fill="#3b82f6" stroke="white" strokeWidth={2} opacity={0.9} />
												<g transform={`rotate(${cw ? 0 : 180})`} style={{ pointerEvents: 'none' }}>
													<path d={`M ${-size * 0.15} 0 L ${size * 0.1} ${-size * 0.1} L ${size * 0.05} 0 L ${size * 0.1} ${size * 0.1} Z`} fill="white" />
												</g>
											</g>
										);
									});
								})()}
							</g>
						)}
						{/* Hex mode: Colored edge markers - hide in path mode */}
						{!isPathMode && (occupants.length > 0 || isOrigin) && (() => {
							const edgeRadius = size * 0.65;
							const markerWidth = size * 0.25;
							const markerHeight = size * 0.15;
							const markers: Array<{ x: number; y: number; angle: number; color: Color }> = [];
							for (let i = 0; i < 6; i += 1) {
								const baseAngle = (Math.PI / 180) * (-90 + 60 * i);
								const edgeColor = edgeIndexToColor(i, rotation, rules);
								markers.push({
									x: center.x + edgeRadius * Math.cos(baseAngle),
									y: center.y + edgeRadius * Math.sin(baseAngle),
									angle: baseAngle,
									color: edgeColor,
								});
							}
							return markers.map((marker, i) => {
								const angleDeg = (marker.angle * 180) / Math.PI;
								const markerRotation = angleDeg + 90;
								return (
									<g key={`edge-${i}`} transform={`translate(${marker.x}, ${marker.y}) rotate(${markerRotation})`}>
										<rect x={-markerWidth / 2} y={-markerHeight / 2} width={markerWidth} height={markerHeight} fill={asVisibleColor(marker.color)} stroke="#111827" strokeWidth={0.5} rx={2} ry={2} />
									</g>
								);
							});
						})()}
					</g>
				);
			})}
			
			{/* Layer 2: All lane segments (path mode only) - rendered on top of all hexes */}
			{isPathMode && (
				<g>
					{allLaneSegments.map((seg) => (
						<line
							key={seg.key}
							x1={seg.x1}
							y1={seg.y1}
							x2={seg.x2}
							y2={seg.y2}
							stroke={asVisibleColor(seg.color)}
							strokeWidth={laneWidth}
							strokeLinecap="round"
						/>
					))}
				</g>
			)}
			
			{/* Layer 2.5: Preview lanes for highlighted hexes (path mode only) */}
			{isPathMode && selectedColor && selectedSourceDot && (
				<g>
					{highlightCoords.map((c) => {
						const center = axialToPixel(c, size);
						const sourceCenter = axialToPixel(selectedSourceDot, size);
						const dx = center.x - sourceCenter.x;
						const dy = center.y - sourceCenter.y;
						const tStart = 0.15;
						const tEnd = 0.85;
						const x1 = sourceCenter.x + dx * tStart;
						const y1 = sourceCenter.y + dy * tStart;
						const x2 = sourceCenter.x + dx * tEnd;
						const y2 = sourceCenter.y + dy * tEnd;
						return (
							<line
								key={`preview-${key(c)}`}
								x1={x1}
								y1={y1}
								x2={x2}
								y2={y2}
								stroke={asVisibleColor(selectedColor)}
								strokeWidth={laneWidth}
								strokeLinecap="round"
								strokeDasharray="4,3"
								opacity={0.7}
							/>
						);
					})}
				</g>
			)}
			
			{/* Layer 3: Dots and overlays (path mode) - on top of lanes */}
			{isPathMode && coords.map((c) => {
				const center = axialToPixel(c, size);
				const isOrigin = originSet.has(key(c));
				const isHighlighted = highlightSet.has(key(c));
				const isSelectedSource = selectedSourceDot !== null && key(selectedSourceDot) === key(c);
				
				return (
					<g key={`dot-${key(c)}`} onClick={() => onHexClick(c)} style={{ cursor: 'pointer' }}>
						{/* Invisible hit area for dot */}
						<circle cx={center.x} cy={center.y} r={size * 0.4} fill="transparent" />
						{/* Selection ring for source dot */}
						{isSelectedSource && (
							<circle
								cx={center.x}
								cy={center.y}
								r={size * 0.25}
								fill="none"
								stroke={highlightColor}
								strokeWidth={2}
							/>
						)}
						{/* Highlight ring for valid destinations */}
						{isHighlighted && !isSelectedSource && (
							<circle
								cx={center.x}
								cy={center.y}
								r={size * 0.25}
								fill="none"
								stroke={highlightColor}
								strokeWidth={1.5}
								strokeDasharray="3,2"
							/>
						)}
						{/* The dot itself */}
						<circle
							cx={center.x}
							cy={center.y}
							r={size * 0.15}
							fill={isSelectedSource ? highlightColor : (isOrigin ? '#ef4444' : '#e5e7eb')}
							stroke="#111827"
							strokeWidth={0.5}
						/>
					</g>
				);
			})}
		</svg>
	);
};
