import React from 'react';
import { axialToPixel, asVisibleColor, buildAllCoords, key, edgeIndexToColor, neighbors, ringIndex } from '../game/helpers';
import { Hex } from './Hex';
import type { Color, Co, HexTile, Rules, PathLane } from '../game/types';

type Props = {
	rules: Rules;
	board: Record<string, HexTile>;
	lanes?: PathLane[];
	phantomLanes?: PathLane[];
	phantomOpacity?: number;
	phantomDash?: string;
	radius: number;
	onHexClick: (coord: Co) => void;
	highlightCoords?: Co[];
	highlightColor?: string;
	highlightIsRotation?: boolean;
	origins?: Co[];
	pendingRotationTile?: Co | null;
	onRotationSelect?: (rotation: number) => void;
	selectedColor?: Color | null; // for path mode preview
	selectedSourceDot?: Co | null; // for path mode: currently selected source dot
	showCoords?: boolean;
};

export const Board: React.FC<Props> = ({ rules, board, lanes = [], phantomLanes = [], phantomOpacity = 0.35, phantomDash = '6,4', radius, onHexClick, highlightCoords = [], highlightColor = '#000000', highlightIsRotation = false, origins = [], pendingRotationTile = null, onRotationSelect, selectedColor = null, selectedSourceDot = null, showCoords = false }) => {
	const size = rules.UI.HEX_SIZE;
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
	
	const buildLaneSegments = (laneList: PathLane[], keyPrefix: string) => {
		const segments: Array<{ x1: number; y1: number; x2: number; y2: number; color: Color; key: string }> = [];
		if (!isPathMode || laneList.length === 0) return segments;

		// Group lanes by *undirected* edge so backtracking/recolor lanes render side-by-side, not on top.
		const groups = new Map<string, PathLane[]>();
		for (const ln of laneList) {
			const a = key(ln.from);
			const b = key(ln.to);
			const gk = a < b ? `${a}<->${b}` : `${b}<->${a}`;
			const arr = groups.get(gk) ?? [];
			arr.push(ln);
			groups.set(gk, arr);
		}

		for (const [gk, group] of groups) {
			const [aK, bK] = gk.split('<->');
			if (!aK || !bK) continue;
			const [aq, ar] = aK.split(',').map(Number);
			const [bq, br] = bK.split(',').map(Number);
			const a: Co = { q: aq!, r: ar! };
			const b: Co = { q: bq!, r: br! };
			const pA = axialToPixel(a, size);
			const pB = axialToPixel(b, size);

			// Canonical vector for consistent perpendicular offset (doesn't flip when a lane is reversed).
			const baseDx = pB.x - pA.x;
			const baseDy = pB.y - pA.y;
			const baseLen = Math.hypot(baseDx, baseDy) || 1;
			const perpX = -baseDy / baseLen;
			const perpY = baseDx / baseLen;

			// Stable ordering within the bundle (color first, then direction)
			const ordered = [...group].sort((x, y) => {
				if (x.color !== y.color) return x.color < y.color ? -1 : 1;
				const xDir = `${key(x.from)}->${key(x.to)}`;
				const yDir = `${key(y.from)}->${key(y.to)}`;
				return xDir < yDir ? -1 : xDir > yDir ? 1 : 0;
			});

			for (let i = 0; i < ordered.length; i += 1) {
				const ln = ordered[i]!;
				const offsetIndex = i - (ordered.length - 1) / 2;
				const offset = offsetIndex * laneGap;
				const offX = perpX * offset;
				const offY = perpY * offset;

				const pFrom = axialToPixel(ln.from, size);
				const pTo = axialToPixel(ln.to, size);
				const dx = pTo.x - pFrom.x;
				const dy = pTo.y - pFrom.y;

				const tStart = 0.15;
				const tEnd = 0.85;
				const x1 = pFrom.x + dx * tStart + offX;
				const y1 = pFrom.y + dy * tStart + offY;
				const x2 = pFrom.x + dx * tEnd + offX;
				const y2 = pFrom.y + dy * tEnd + offY;

				segments.push({
					x1, y1, x2, y2,
					color: ln.color,
					key: `${keyPrefix}-${gk}-${i}-${ln.color}-${key(ln.from)}->${key(ln.to)}`,
				});
			}
		}

		return segments;
	};

	// Precompute lane segments for path mode (rendered on layer above all hexes)
	const allLaneSegments = buildLaneSegments(lanes, 'lane');
	const phantomLaneSegments = buildLaneSegments(phantomLanes, 'phantom');

	return (
		<svg 
			width="100%" 
			height="100%" 
			viewBox={`${-marginX} ${-marginY} ${marginX * 2} ${marginY * 2}`}
			preserveAspectRatio="xMidYMid meet"
		>
			{/* Corner circles indicating color directions (core mechanic; applies in path mode too) */}
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
				const isDead = tile?.dead ?? false;
				const isInnerRing = rules.PLACEMENT.STARTING_RING > 0 && ringIndex(c) < rules.PLACEMENT.STARTING_RING;
				const occupants = tile?.colors ?? [];
				const rotation = tile?.rotation ?? 0;
				const order = rules.COLORS as Color[];
				const sortedOccupants = occupants.length > 1 ? [...occupants].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : occupants;
				const isOrigin = originSet.has(key(c));
				const isHighlighted = highlightSet.has(key(c));
				const isHighlight = isHighlighted && occupants.length === 0 && !isDead;
				const isRotatable = highlightIsRotation && isHighlighted && occupants.length > 0;
				const isPendingRotation = pendingRotationTile !== null && key(pendingRotationTile) === key(c);
				const showMoveStroke = !highlightIsRotation && isHighlighted && !isPathMode;
				const split = !isPathMode && !isDead && sortedOccupants.length >= 2 ? [asVisibleColor(sortedOccupants[0] as Color), asVisibleColor(sortedOccupants[1] as Color)] as [string, string] : null;

				// In path mode, hex fill is neutral - lanes show the colors
				// Dark theme: use dark fills instead of light grays
				const hexFill = isDead || isInnerRing
					? '#0a0a0e'
					: isPathMode
						? (isHighlight ? highlightColor : isOrigin ? '#2a1a2e' : '#1a1a24')
						: (sortedOccupants[0] ? asVisibleColor(sortedOccupants[0]) : isHighlight ? highlightColor : isOrigin ? '#2a1a2e' : '#1a1a24');
				
				return (
					<g key={key(c)}>
						<Hex
							center={center}
							size={size - 0.5}
							fill={hexFill}
							splitFills={isDead ? undefined : (split ?? undefined)}
							fillOpacity={isDead ? 1 : (isHighlight ? 0.35 : (isRotatable && !isPathMode ? 0.7 : 1))}
							stroke={isDead ? '#1a1020' : (isRotatable && !isPathMode ? highlightColor : (showMoveStroke ? highlightColor : (isOrigin ? '#bb88ee' : '#2a2a3d')))}
							strokeWidth={isDead ? 2 : (isRotatable && !isPathMode ? 3 : (showMoveStroke ? 2 : (isOrigin ? 2 : 1)))}
							onClick={() => !isPathMode && onHexClick(c)}
						>
							{isDead && (
								<g style={{ pointerEvents: 'none' }}>
									<line x1={-size * 0.25} y1={-size * 0.25} x2={size * 0.25} y2={size * 0.25} stroke="#2a1525" strokeWidth={2.5} strokeLinecap="round" />
									<line x1={size * 0.25} y1={-size * 0.25} x2={-size * 0.25} y2={size * 0.25} stroke="#2a1525" strokeWidth={2.5} strokeLinecap="round" />
								</g>
							)}
							{isOrigin && occupants.length === 0 && !isPathMode && !isDead && (
								<circle cx={0} cy={0} r={size * 0.3} fill="none" stroke="#bb88ee" strokeWidth={2} strokeDasharray="4,2" />
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
									// 4 distinct rotations placed on 4 neighbor hexes:
									// CW 60 (rot=1), CW 120 (rot=2), CCW 120 (rot=4), CCW 60 (rot=5)
									const arrowConfigs: Array<{ coord: Co; rot: number; cw: boolean; degrees: string }> = [];
									if (neigh[0]) arrowConfigs.push({ coord: neigh[0]!, rot: 1, cw: true, degrees: '60' });
									if (neigh[1]) arrowConfigs.push({ coord: neigh[1]!, rot: 2, cw: true, degrees: '120' });
									if (neigh[3]) arrowConfigs.push({ coord: neigh[3]!, rot: 4, cw: false, degrees: '120' });
									if (neigh[4]) arrowConfigs.push({ coord: neigh[4]!, rot: 5, cw: false, degrees: '60' });
									return arrowConfigs.map(({ coord, rot, cw, degrees }) => {
										const pos = axialToPixel(coord, size);
										const fillColor = cw ? '#3b82f6' : '#a855f7'; // blue for CW, purple for CCW
										return (
											<g
												key={`arrow-${rot}-${coord.q},${coord.r}`}
												transform={`translate(${pos.x}, ${pos.y})`}
												onClick={(e) => { e.stopPropagation(); onRotationSelect(rot); }}
												style={{ cursor: 'pointer' }}
											>
												<circle cx={0} cy={0} r={size * 0.45} fill={fillColor} stroke="white" strokeWidth={2} opacity={0.9} />
												<g transform={`rotate(${cw ? 0 : 180})`} style={{ pointerEvents: 'none' }}>
													<path d={`M ${-size * 0.15} 0 L ${size * 0.1} ${-size * 0.1} L ${size * 0.05} 0 L ${size * 0.1} ${size * 0.1} Z`} fill="white" />
												</g>
												<text x={0} y={size * 0.18} fontSize={size * 0.28} textAnchor="middle" fill="white" style={{ pointerEvents: 'none', userSelect: 'none', fontWeight: 'bold' }}>
													{degrees}
												</text>
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

			{/* Layer 3: Phantom lane segments (path mode only) - render above real lanes */}
			{isPathMode && phantomLaneSegments.length > 0 && (
				<g style={{ mixBlendMode: 'screen' }}>
					{phantomLaneSegments.map((seg) => (
						<g key={seg.key}>
							<line
								x1={seg.x1}
								y1={seg.y1}
								x2={seg.x2}
								y2={seg.y2}
								stroke="#ffffff"
								strokeWidth={laneWidth * 1.35}
								strokeLinecap="round"
								strokeDasharray={phantomDash}
								opacity={phantomOpacity * 0.4}
							/>
							<line
								x1={seg.x1}
								y1={seg.y1}
								x2={seg.x2}
								y2={seg.y2}
								stroke={asVisibleColor(seg.color)}
								strokeWidth={laneWidth * 1.1}
								strokeLinecap="round"
								strokeDasharray={phantomDash}
								opacity={phantomOpacity}
							/>
						</g>
					))}
				</g>
			)}
			
			{/* Layer 3.5: Preview lanes for highlighted hexes (path mode only) */}
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
							fill={isSelectedSource ? highlightColor : (isOrigin ? '#bb88ee' : '#3a3a4d')}
							stroke="#1a1a24"
							strokeWidth={0.5}
						/>
					</g>
				);
			})}
			
			{/* Layer 4: Coordinate labels - render above all overlays */}
			{showCoords && (
				<g className="board__coords">
					{coords.map((c) => {
						const center = axialToPixel(c, size);
						return (
							<text
								key={`coord-${key(c)}`}
								x={center.x}
								y={center.y + size * 0.55}
								fontSize={8}
								textAnchor="middle"
								fill="#9aa0b8"
							>
								{c.q},{c.r}
							</text>
						);
					})}
				</g>
			)}
		</svg>
	);
};
