import React from 'react';
import { axialToPixel, asVisibleColor, buildAllCoords, key, ringIndex, edgeIndexToColor } from '../game/helpers';
import { Hex } from './Hex';
import { RULES } from '../game/rulesConfig';
import type { Color, Co, HexTile } from '../game/types';

type Props = {
	board: Record<string, HexTile>;
	radius: number;
	onHexClick: (coord: Co) => void;
	showRing?: boolean;
	highlightCoords?: Co[];
	highlightColor?: string;
	origins?: Co[];
	pendingRotationTile?: Co | null;
	onRotationSelect?: (rotation: number) => void;
};

export const Board: React.FC<Props> = ({ board, radius, onHexClick, showRing = RULES.UI.SHOW_RING, highlightCoords = [], highlightColor = '#000000', origins = [], pendingRotationTile = null, onRotationSelect }) => {
	const size = RULES.UI.HEX_SIZE;
	const coords = buildAllCoords(radius);
	const width = size * 3 * (radius + 1);
	const height = Math.sqrt(3) * size * (radius * 2 + 1);
	const marginX = width / 2 + size * 2;
	const marginY = height / 2 + size * 2;
	const highlightSet = new Set(highlightCoords.map((c) => key(c)));
	const originSet = new Set(origins.map((c) => key(c)));

	return (
		<svg width={marginX * 2} height={marginY * 2} viewBox={`${-marginX} ${-marginY} ${marginX * 2} ${marginY * 2}`}>
			{/* Corner circles indicating color directions, aligned to COLOR_TO_DIR */}
			<g>
				{(RULES.COLORS as Color[]).map((col) => {
					const dir = RULES.COLOR_TO_DIR[col];
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
			{coords.map((c) => {
				const center = axialToPixel(c, size);
				const tile = board[key(c)];
				const occupants = tile?.colors ?? [];
				const rotation = tile?.rotation ?? 0;
				const order = RULES.COLORS as Color[];
				const sortedOccupants = occupants.length > 1 ? [...occupants].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : occupants;
				const isOrigin = originSet.has(key(c));
				const isHighlighted = highlightSet.has(key(c));
				const isHighlight = isHighlighted && occupants.length === 0;
				const isRotatable = isHighlighted && occupants.length > 0;
				const isPendingRotation = pendingRotationTile !== null && key(pendingRotationTile) === key(c);
				const split = sortedOccupants.length >= 2 ? [asVisibleColor(sortedOccupants[0] as Color), asVisibleColor(sortedOccupants[1] as Color)] as [string, string] : null;
				
				// Only show edge markers on placed tiles (tiles with colors), or always on origins as reference
				const hasPlacedTile = occupants.length > 0 || isOrigin;
				
				// Calculate edge positions for colored edges (going clockwise from North)
				// Position markers inside the hex, closer to the edges but not overlapping
				const edgeRadius = size * 0.65; // Positioned well inside the hex
				const markerWidth = size * 0.25; // Width of rectangular marker
				const markerHeight = size * 0.15; // Height of rectangular marker
				const edgeMarkers: Array<{ x: number; y: number; angle: number; color: Color }> = [];
				
				if (hasPlacedTile) {
					// Edge mapping: Position 0 (N) = Yellow (edge 0), Position 1 (NE) = Green (edge 1),
					// Position 2 (E) = Blue (edge 2), Position 3 (SE) = Violet (edge 3),
					// Position 4 (SW) = Red (edge 4), Position 5 (NW) = Orange (edge 5)
					for (let i = 0; i < 6; i += 1) {
						// Calculate angle: start at -90° (North, pointing up) for flat-top hex, add 60° per edge going clockwise
						const baseAngle = (Math.PI / 180) * (-90 + 60 * i);
						// Direct mapping: visual position i corresponds to logical edge index i
						const logicalEdgeIndex = i;
						// Get the color that should be at this edge index after rotation
						const edgeColor = edgeIndexToColor(logicalEdgeIndex, rotation);
						edgeMarkers.push({
							x: center.x + edgeRadius * Math.cos(baseAngle),
							y: center.y + edgeRadius * Math.sin(baseAngle),
							angle: baseAngle,
							color: edgeColor,
						});
					}
				}
				
				return (
					<g key={key(c)}>
						<Hex
							center={center}
							size={size - 0.5}
							fill={sortedOccupants[0] ? asVisibleColor(sortedOccupants[0]) : isHighlight ? highlightColor : isOrigin ? '#d1d5db' : '#f3f4f6'}
							splitFills={split ?? undefined}
							fillOpacity={isHighlight ? 0.35 : (isRotatable ? 0.7 : 1)}
							stroke={isRotatable ? highlightColor : (isOrigin ? '#ef4444' : '#9ca3af')}
							strokeWidth={isRotatable ? 3 : (isOrigin ? 2 : 1)}
							onClick={() => onHexClick(c)}
						>
							{showRing && (
								<text x={0} y={4} fontSize={8} textAnchor="middle" fill="#111827">{ringIndex(c)}</text>
							)}
							{isOrigin && occupants.length === 0 && (
								<circle cx={0} cy={0} r={size * 0.3} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="4,2" />
							)}
							{isRotatable && !isPendingRotation && (
								<text x={0} y={-size * 0.4} fontSize={size * 0.6} textAnchor="middle" fill={highlightColor} style={{ pointerEvents: 'none', userSelect: 'none' }}>🔄</text>
							)}
						</Hex>
						{/* Rotation arrows - show when tile is pending rotation */}
						{isPendingRotation && onRotationSelect && (
							<g>
								{[1, 2, 4, 5].map((rot) => {
									// Position arrows at 4 positions: top (0°), right (90°), left (270°), bottom-right (240°)
									// Map rotations: 1→top, 2→right, 4→bottom-right, 5→left
									const positions: Record<number, number> = {
										1: 0,    // top
										2: 90,   // right
										4: 240,  // bottom-right
										5: 270,  // left
									};
									const angle = positions[rot]!;
									const angleRad = (angle * Math.PI) / 180;
									const arrowRadius = size * 1.3;
									const arrowX = center.x + arrowRadius * Math.cos(angleRad);
									const arrowY = center.y + arrowRadius * Math.sin(angleRad);
									const rotationDeg = rot * 60;
									
									return (
										<g
											key={`arrow-${rot}`}
											transform={`translate(${arrowX}, ${arrowY})`}
											onClick={(e) => {
												e.stopPropagation();
												onRotationSelect(rot);
											}}
											style={{ cursor: 'pointer' }}
										>
											<circle
												cx={0}
												cy={0}
												r={size * 0.4}
												fill="#3b82f6"
												stroke="white"
												strokeWidth={2}
												opacity={0.95}
											/>
											<text
												x={0}
												y={0}
												fontSize={size * 0.3}
												textAnchor="middle"
												dominantBaseline="central"
												fill="white"
												fontWeight="bold"
												style={{ pointerEvents: 'none', userSelect: 'none' }}
											>
												{rotationDeg}°
											</text>
											{/* Arrow pointing clockwise around the hex */}
											<g transform={`rotate(${angle + 90})`} style={{ pointerEvents: 'none' }}>
												<path
													d={`M ${size * 0.2} 0 L ${-size * 0.1} ${-size * 0.1} L ${-size * 0.05} 0 L ${-size * 0.1} ${size * 0.1} Z`}
													fill="white"
												/>
											</g>
										</g>
									);
								})}
							</g>
						)}
						{/* Colored edge markers - rectangular, positioned along edges - only on placed tiles */}
						{hasPlacedTile && edgeMarkers.map((marker, i) => {
							const angleDeg = (marker.angle * 180) / Math.PI;
							// Rotate the marker to align with the edge direction (perpendicular to edge)
							const markerRotation = angleDeg + 90;
							return (
								<g
									key={`edge-${i}`}
									transform={`translate(${marker.x}, ${marker.y}) rotate(${markerRotation})`}
								>
									<rect
										x={-markerWidth / 2}
										y={-markerHeight / 2}
										width={markerWidth}
										height={markerHeight}
										fill={asVisibleColor(marker.color)}
										stroke="#111827"
										strokeWidth={0.5}
										rx={2}
										ry={2}
									/>
								</g>
							);
						})}
					</g>
				);
			})}
		</svg>
	);
};


