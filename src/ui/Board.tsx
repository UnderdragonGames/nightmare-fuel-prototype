import React from 'react';
import { axialToPixel, asVisibleColor, buildAllCoords, key, edgeIndexToColor, ringIndex, dirToColor, rotateNeighbor } from '../game/helpers';
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
	/** Per-coord override of highlightColor (key(coord) → css color) so each
	 *  potential spot can show the color the move would actually play. */
	highlightColorByCoord?: Record<string, string>;
	highlightIsRotation?: boolean;
	origins?: Co[];
	pendingRotationTile?: Co | null;
	onRotationSelect?: (rotation: number) => void;
	selectedColor?: Color | null; // for path mode preview
	selectedSourceDot?: Co | null; // for path mode: currently selected source dot
	showCoords?: boolean;
};

export const Board: React.FC<Props> = ({ rules, board, lanes = [], phantomLanes = [], phantomOpacity = 0.35, phantomDash = '6,4', radius, onHexClick, highlightCoords = [], highlightColor = '#000000', highlightColorByCoord, highlightIsRotation = false, origins = [], pendingRotationTile = null, onRotationSelect, selectedColor = null, selectedSourceDot = null, showCoords = false }) => {
	const size = rules.UI.HEX_SIZE;
	const coords = buildAllCoords(radius);
	const width = size * 3 * (radius + 1);
	const height = Math.sqrt(3) * size * (radius * 2 + 1);
	const marginX = width / 2 + size * 2;
	const marginY = height / 2 + size * 2;
	const highlightSet = new Set(highlightCoords.map((c) => key(c)));
	const originSet = new Set(origins.map((c) => key(c)));
	const colorFor = (c: Co): string => highlightColorByCoord?.[key(c)] ?? highlightColor;
	
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
				const hasOutgoingLanes = isPathMode && lanes.some(l => key(l.from) === key(c));
				const isRotatable = highlightIsRotation && isHighlighted && (occupants.length > 0 || hasOutgoingLanes);
				const isPendingRotation = pendingRotationTile !== null && key(pendingRotationTile) === key(c);
				const showMoveStroke = !highlightIsRotation && isHighlighted && !isPathMode;
				const split = !isPathMode && !isDead && sortedOccupants.length >= 2 ? [asVisibleColor(sortedOccupants[0] as Color), asVisibleColor(sortedOccupants[1] as Color)] as [string, string] : null;

				// In path mode, hex fill is neutral - lanes show the colors
				// Dark theme: use dark fills instead of light grays
				const hexFill = isDead || isInnerRing
					? '#0a0a0e'
					: isPathMode
						? (isHighlight ? colorFor(c) : isOrigin ? '#2a1a2e' : '#1a1a24')
						: (sortedOccupants[0] ? asVisibleColor(sortedOccupants[0]) : isHighlight ? colorFor(c) : isOrigin ? '#2a1a2e' : '#1a1a24');
				
				return (
					<g key={key(c)}>
						<Hex
							center={center}
							size={size - 0.5}
							fill={hexFill}
							splitFills={isDead ? undefined : (split ?? undefined)}
							fillOpacity={isDead ? 1 : (isHighlight ? 0.35 : (isRotatable ? 0.7 : 1))}
							stroke={isDead ? '#1a1020' : (isRotatable ? highlightColor : (showMoveStroke ? colorFor(c) : (isOrigin ? '#bb88ee' : '#2a2a3d')))}
							strokeWidth={isDead ? 2 : (isRotatable ? 3 : (showMoveStroke ? 2 : (isOrigin ? 2 : 1)))}
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
							{/* Hex mode: rotation indicator (clean arrow symbol instead of emoji) */}
							{!isPathMode && isRotatable && !isPendingRotation && (
								<text x={0} y={size * 0.15} fontSize={size * 0.55} textAnchor="middle" fill={highlightColor} style={{ pointerEvents: 'none', userSelect: 'none' }}>↻</text>
							)}
						</Hex>
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
								stroke={colorFor(c)}
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
				const hasOutgoing = lanes.some(l => key(l.from) === key(c));
				const dotRotatable = highlightIsRotation && highlightSet.has(key(c)) && hasOutgoing;
				const dotPending = pendingRotationTile !== null && key(pendingRotationTile) === key(c);

				return (
					<g key={`dot-${key(c)}`} onClick={() => onHexClick(c)} style={{ cursor: 'pointer' }}>
						{/* Invisible hit area for dot */}
						<circle cx={center.x} cy={center.y} r={size * 0.4} fill="transparent" />
						{/* Rotatable indicator — outer ring + arrow symbol */}
						{dotRotatable && !dotPending && (
							<>
								<circle cx={center.x} cy={center.y} r={size * 0.32} fill="none" stroke={highlightColor} strokeWidth={1.5} strokeDasharray="3,2" opacity={0.8} />
								<text x={center.x} y={center.y - size * 0.35} fontSize={size * 0.4} textAnchor="middle" fill={highlightColor} style={{ pointerEvents: 'none', userSelect: 'none' }}>↻</text>
							</>
						)}
						{/* Pending rotation indicator — solid bright ring */}
						{dotPending && (
							<circle cx={center.x} cy={center.y} r={size * 0.35} fill="none" stroke="#f59e0b" strokeWidth={2.5} opacity={0.9} />
						)}
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
						{isHighlighted && !isSelectedSource && !dotRotatable && (
							<circle
								cx={center.x}
								cy={center.y}
								r={size * 0.25}
								fill="none"
								stroke={colorFor(c)}
								strokeWidth={1.5}
								strokeDasharray="3,2"
							/>
						)}
						{/* The dot itself */}
						<circle
							cx={center.x}
							cy={center.y}
							r={dotRotatable || dotPending ? size * 0.18 : size * 0.15}
							fill={isSelectedSource ? highlightColor : (dotPending ? '#f59e0b' : (dotRotatable ? highlightColor : (isOrigin ? '#bb88ee' : '#3a3a4d')))}
							stroke="#1a1a24"
							strokeWidth={0.5}
						/>
					</g>
				);
			})}
			
			{/* Layer 4: Coordinate labels */}
			{showCoords && (
				<g>
					{coords.map((c) => {
						const center = axialToPixel(c, size);
						return (
							<text
								key={`coord-${key(c)}`}
								x={center.x}
								y={center.y + size * 0.7}
								fontSize={size * 0.3}
								fontFamily="monospace"
								textAnchor="middle"
								fill="#888"
								opacity={0.5}
								style={{ pointerEvents: 'none' }}
							>
								{c.q},{c.r}
							</text>
						);
					})}
				</g>
			)}

			{/* Layer 5: Rotation picker — topmost layer. No dial, no labels: ghost
			    previews sit at the neighbor spots the piece can rotate toward,
			    and clicking one rotates it there. */}
			{pendingRotationTile && onRotationSelect && (() => {
				const c = pendingRotationTile;
				const center = axialToPixel(c, size);
				const ghostR = size * 0.34;
				// 180° (rotation 3) is not a legal rotation, so it is never offered.
				const ROTS = [1, 2, 4, 5];
				type Ghost = { rot: number; target: Co; color: string };
				const ghosts: Ghost[] = [];

				if (isPathMode) {
					// Reference piece = first outgoing lane; a click on a ghost puts
					// it there (all lanes at the node rotate together).
					const outgoing = lanes.filter((l) => key(l.from) === key(c));
					if (outgoing.length > 0) {
						const ref = outgoing[0]!;
						const refDirColor = dirToColor(rules, { q: ref.to.q - c.q, r: ref.to.r - c.r });
						const refConverted = ref.color !== refDirColor;
						for (const rot of ROTS) {
							// Offer only rotations every lane at this node can legally make.
							let ok = true;
							for (const lane of outgoing) {
								const newTo = rotateNeighbor(c, lane.to, rot);
								if (!dirToColor(rules, { q: newTo.q - c.q, r: newTo.r - c.r })) { ok = false; break; }
								const k = key(newTo);
								if (!board[k] || board[k]!.dead || originSet.has(k)) { ok = false; break; }
							}
							if (!ok) continue;
							const target = rotateNeighbor(c, ref.to, rot);
							const newColor = refConverted
								? ref.color
								: dirToColor(rules, { q: target.q - c.q, r: target.r - c.r })!;
							ghosts.push({ rot, target, color: asVisibleColor(newColor) });
						}
					}
				} else {
					// Hex mode: reference = the tile's first color; ghosts mark the
					// edge directions that color can rotate to face.
					const tile = board[key(c)];
					const refColor = tile?.colors[0];
					if (tile && refColor) {
						let refEdge = -1;
						for (let i = 0; i < 6; i += 1) {
							if (edgeIndexToColor(i, tile.rotation, rules) === refColor) { refEdge = i; break; }
						}
						if (refEdge >= 0) {
							for (const rot of ROTS) {
								const edge = (refEdge + rot) % 6;
								const dir = rules.COLOR_TO_DIR[rules.EDGE_COLORS[edge] as Color];
								ghosts.push({
									rot,
									target: { q: c.q + dir.q, r: c.r + dir.r },
									color: asVisibleColor(refColor),
								});
							}
						}
					}
				}

				return (
					<g>
						{/* Mark the piece being rotated */}
						<circle cx={center.x} cy={center.y} r={size * 0.4} fill="#f59e0b" opacity={0.3} />
						{ghosts.map(({ rot, target, color }) => {
							const t = axialToPixel(target, size);
							const dx = t.x - center.x;
							const dy = t.y - center.y;
							return (
								<g
									key={`rot-pick-${rot}`}
									onClick={(e) => { e.stopPropagation(); onRotationSelect(rot); }}
									style={{ cursor: 'pointer' }}
								>
									{/* Ghost of the rotated piece pointing at the spot */}
									<line
										x1={center.x + dx * 0.2}
										y1={center.y + dy * 0.2}
										x2={center.x + dx * 0.78}
										y2={center.y + dy * 0.78}
										stroke={color}
										strokeWidth={laneWidth}
										strokeLinecap="round"
										strokeDasharray="4,3"
										opacity={0.55}
									/>
									<circle cx={t.x} cy={t.y} r={ghostR} fill={color} stroke="#ffffff" strokeWidth={1.5} opacity={0.9} />
								</g>
							);
						})}
					</g>
				);
			})()}
		</svg>
	);
};
