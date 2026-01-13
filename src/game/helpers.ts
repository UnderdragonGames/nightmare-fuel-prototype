import type { Card, Co, Color, GState, Rules } from './types';

export const key = (c: Co): string => `${c.q},${c.r}`;
export const parse = (s: string): Co => {
	const [q, r] = s.split(',').map(Number);
	return { q, r };
};

export const ringIndex = (c: Co): number => {
	return Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(-c.q - c.r));
};

export const inBounds = (c: Co, radius: number): boolean => ringIndex(c) <= radius;

export const neighbors = (c: Co): Co[] => [
	{ q: c.q + 1, r: c.r },
	{ q: c.q + 1, r: c.r - 1 },
	{ q: c.q, r: c.r - 1 },
	{ q: c.q - 1, r: c.r },
	{ q: c.q - 1, r: c.r + 1 },
	{ q: c.q, r: c.r + 1 },
];

export const axialToPixel = (c: Co, size: number): { x: number; y: number } => {
	// flat-topped axial coordinates
	const x = size * (3 / 2) * c.q;
	const y = size * (Math.sqrt(3) / 2 * c.q + Math.sqrt(3) * c.r);
	return { x, y };
};

const hasOccupiedNeighbor = (G: GState, coord: Co): boolean => {
	return neighbors(coord).some((n) => {
		const tile = G.board[key(n)];
		return tile !== undefined && tile.colors.length > 0;
	});
};

const satisfiesDirectionRule = (G: GState, coord: Co, color: Color, rules: Rules): boolean => {
	const targetRing = ringIndex(coord);
	const outwardOkay = neighbors(coord).some((n) => {
		const nk = key(n);
		const tile = G.board[nk];
		if (!tile || tile.colors.length === 0) return false;
		return ringIndex(n) <= targetRing;
	});

	// Directional rule: purely local, edge-colour + rotation based.
	// A placement is direction-ok if there exists at least one neighbouring
	// tile/origin whose edge facing this coord has colour `color`.

	let dirOkay = false;

	for (const n of neighbors(coord)) {
		// Treat origins as permanent tiles with fixed rotation 0.
		const isOrigin = G.origins.some((o) => o.q === n.q && o.r === n.r);
		const neighborTile = G.board[key(n)];
		const hasTile = neighborTile && neighborTile.colors.length > 0;
		if (!isOrigin && !hasTile) continue;

		const rotation = isOrigin ? 0 : neighborTile!.rotation;

		// Vector from neighbour to candidate coord.
		const dirVec: Co = { q: coord.q - n.q, r: coord.r - n.r };

		// Map this direction to a canonical edge index using COLOR_TO_DIR / EDGE_COLORS.
		let edgeIndexFacingCoord = -1;
		for (const [cKey, d] of Object.entries(rules.COLOR_TO_DIR)) {
			if (d.q === dirVec.q && d.r === dirVec.r) {
				edgeIndexFacingCoord = colorToEdgeIndex(cKey as Color, rules);
				break;
			}
		}
		if (edgeIndexFacingCoord === -1) continue;

		// What colour is on that edge, given the neighbour's rotation?
		const edgeCol = edgeIndexToColor(edgeIndexFacingCoord, rotation, rules);
		if (edgeCol === color) {
			dirOkay = true;
			break;
		}
	}

	switch (rules.PLACEMENT.OUTWARD_RULE) {
		case 'none':
			return true;
		case 'outwardOnly':
			return outwardOkay;
		case 'dirOnly':
			return dirOkay;
		case 'dirOrOutward':
		default:
			return outwardOkay || dirOkay;
	}
};

// Infer initial rotation for a newly placed tile of `color` at `coord`.
// If we extend from a neighbouring tile/origin whose edge of colour `color`
// faces this coord, copy that neighbour's rotation so the new tile keeps
// the chain's orientation. Otherwise, default to rotation 0.
export const inferPlacementRotation = (G: GState, coord: Co, color: Color): number => {
	// 1) If there is any neighbouring tile, prefer to inherit *some* rotation
	//    rather than always defaulting to 0. When multiple neighbours exist,
	//    use the first one that contains `color`; otherwise fall back to the
	//    first neighbouring tile we see.
	let fallbackRotation: number | null = null;

	for (const n of neighbors(coord)) {
		const neighborTile = G.board[key(n)];
		if (!neighborTile || neighborTile.colors.length === 0) continue;

		if (fallbackRotation === null) {
			fallbackRotation = neighborTile.rotation;
		}

		if (neighborTile.colors.includes(color)) {
			return neighborTile.rotation;
		}
	}

	// 2) If no neighbour has the colour, but there is at least one neighbour
	//    tile, inherit its rotation as a best-effort guess. Otherwise 0.
	return fallbackRotation ?? 0;
};

export const canPlace = (G: GState, coord: Co, color: Color, rules: Rules): boolean => {
	const k = key(coord);
	if (!inBounds(coord, G.radius)) return false;
	// Origins are wild and cannot be occupied
	const isOrigin = G.origins.some((o) => o.q === coord.q && o.r === coord.r);
	if (isOrigin) return false;
	const ring = ringIndex(coord);
	// Path mode: always allow up to MAX_LANES_PER_PATH
	// Hex mode: ring 1..N uses higher cap; outer rings use 1
	const capacity =
		rules.MODE === 'path'
			? rules.PLACEMENT.MAX_LANES_PER_PATH
			: (ring > 0 && ring <= rules.PLACEMENT.MULTI_CAP_FIRST_RINGS
				? rules.PLACEMENT.MAX_LANES_PER_PATH
				: 1);
	const tile = G.board[k];
	if (tile && tile.colors.length >= capacity) return false;

	// Global connectivity (always enforced)
	// Must be adjacent to either an occupied tile OR an origin
	const hasNeighbor = hasOccupiedNeighbor(G, coord);
	const isAdjacentToOrigin = neighbors(coord).some((n) =>
		G.origins.some((o) => o.q === n.q && o.r === n.r)
	);
	if (!hasNeighbor && !isAdjacentToOrigin) {
		return false; // Disconnected placement - not allowed
	}

	// Compute the source of this edge: where the color "comes from"
	const dir = rules.COLOR_TO_DIR[color];
	const edgeSource: Co = { q: coord.q - dir.q, r: coord.r - dir.r };

	// NO_BUILD_FROM_RIM: Can't build from tiles at the rim (paths terminate at rim)
	if (rules.PLACEMENT.NO_BUILD_FROM_RIM) {
		const sourceRing = ringIndex(edgeSource);
		if (sourceRing === G.radius) {
			return false; // Source is at rim, can't build from it
		}
	}

	// NO_INTERSECT: All edges at a tile must come from the same source
	if (rules.PLACEMENT.NO_INTERSECT && tile && tile.colors.length > 0) {
		// Check that existing colors at this tile all come from the same source as the new color
		for (const existingColor of tile.colors) {
			const existingDir = rules.COLOR_TO_DIR[existingColor];
			const existingSource: Co = { q: coord.q - existingDir.q, r: coord.r - existingDir.r };
			if (existingSource.q !== edgeSource.q || existingSource.r !== edgeSource.r) {
				return false; // Different sources = intersection not allowed
			}
		}
	}

	if (!satisfiesDirectionRule(G, coord, color, rules)) return false;
	if (rules.MODE === 'path' && rules.PLACEMENT.FORK_SUPPORT) {
		if (!forkSupportOkAfterPlacement(G, coord, color, rules)) return false;
	}
	return true;
};

export const shuffleInPlace = <T,>(arr: T[], rng: () => number = Math.random): void => {
	for (let i = arr.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rng() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
};

export const buildAllCoords = (radius: number): Co[] => {
	const coords: Co[] = [];
	for (let q = -radius; q <= radius; q += 1) {
		for (let r = -radius; r <= radius; r += 1) {
			const s = -q - r;
			if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= radius) {
				coords.push({ q, r });
			}
		}
	}
	return coords;
};

export const asVisibleColor = (c: Color): string => {
	switch (c) {
		case 'R':
			return '#ff4444'; // Arterial red
		case 'O':
			return '#ff8c22'; // Fever orange
		case 'Y':
			return '#ffdd33'; // Electric yellow
		case 'G':
			return '#33ff88'; // Toxic green
		case 'B':
			return '#4499ff'; // Spectral blue
		case 'V':
			return '#aa66ff'; // Nightmare violet
	}
};

export const serializeCard = (card: Card): string => card.colors.join('');

// Get edge index (0-5) for a color in default orientation
export const colorToEdgeIndex = (color: Color, rules: Rules): number => {
	const idx = rules.EDGE_COLORS.indexOf(color);
	if (idx === -1) throw new Error(`Color ${color} missing from rules.EDGE_COLORS`);
	return idx;
};

// Get color for an edge index considering rotation
export const edgeIndexToColor = (edgeIndex: number, rotation: number, rules: Rules): Color => {
	const rotatedEdge = (edgeIndex - rotation + 6) % 6;
	const col = rules.EDGE_COLORS[rotatedEdge];
	if (!col) throw new Error(`Invalid edge index ${edgeIndex} / rotation ${rotation}`);
	return col;
};

// Get absolute direction (Co) for a relative edge index considering rotation
export const edgeIndexToDirection = (edgeIndex: number, rotation: number, rules: Rules): Co => {
	const rotatedEdge = (edgeIndex - rotation + 6) % 6;
	const color = rules.EDGE_COLORS[rotatedEdge];
	if (!color) throw new Error(`Invalid edge index ${edgeIndex} / rotation ${rotation}`);
	return rules.COLOR_TO_DIR[color];
};

// Get relative edge index for an absolute direction considering rotation
export const directionToEdgeIndex = (dir: Co, rotation: number, rules: Rules): number => {
	// Find which color matches this direction
	for (const [color, colorDir] of Object.entries(rules.COLOR_TO_DIR)) {
		if (colorDir.q === dir.q && colorDir.r === dir.r) {
			const baseEdge = colorToEdgeIndex(color as Color, rules);
			return (baseEdge + rotation) % 6;
		}
	}
	throw new Error(`Direction not found in rules.COLOR_TO_DIR: (${dir.q},${dir.r})`);
};

// Get color's relative edge index for a tile with given rotation
export const colorToRelativeEdge = (color: Color, rotation: number, rules: Rules): number => {
	const baseEdge = colorToEdgeIndex(color, rules);
	return (baseEdge + rotation) % 6;
};

// Edge capacity map: key is `${srcKey}->${dstKey}`, value is edge count
type EdgeCaps = Map<string, number>; // key: `${uKey}->${vKey}`

const edgeKey = (uKey: string, vKey: string): string => `${uKey}->${vKey}`;

const buildEdgeCapsAfterPlacement = (G: GState, placeCoord: Co, placeColor: Color, rules: Rules): EdgeCaps => {
	const caps: EdgeCaps = new Map();

	const add = (src: Co, dst: Co, inc: number): void => {
		if (!inBounds(src, G.radius) || !inBounds(dst, G.radius)) return;
		const k = edgeKey(key(src), key(dst));
		caps.set(k, (caps.get(k) ?? 0) + inc);
	};

	// Existing lanes: each tile color occurrence is an edge from (coord - dir(color)) -> coord.
	for (const [dstKey, tile] of Object.entries(G.board)) {
		if (!tile || tile.colors.length === 0) continue;
		const dst = parse(dstKey);
		for (const c of tile.colors) {
			const dir = rules.COLOR_TO_DIR[c];
			const src: Co = { q: dst.q - dir.q, r: dst.r - dir.r };
			add(src, dst, 1);
		}
	}

	// Hypothetical new lane
	{
		const dst = placeCoord;
		const dir = rules.COLOR_TO_DIR[placeColor];
		const src: Co = { q: dst.q - dir.q, r: dst.r - dir.r };
		add(src, dst, 1);
	}

	return caps;
};

/**
 * Collect all nodes that appear in the edge graph.
 */
const collectNodesFromEdges = (caps: EdgeCaps): Set<string> => {
	const nodes = new Set<string>();
	for (const k of caps.keys()) {
		const [u, v] = k.split('->');
		if (u) nodes.add(u);
		if (v) nodes.add(v);
	}
	return nodes;
};

/**
 * Count incoming edges to a node: IN(N) = |{edges (X → N)}|
 */
const countIncoming = (nodeKey: string, caps: EdgeCaps, allNodes: Set<string>): number => {
	let count = 0;
	for (const srcKey of allNodes) {
		count += caps.get(edgeKey(srcKey, nodeKey)) ?? 0;
	}
	return count;
};

/**
 * Count outgoing edges from a node: OUT(N) = |{edges (N → Y)}|
 */
const countOutgoing = (nodeKey: string, caps: EdgeCaps, allNodes: Set<string>): number => {
	let count = 0;
	for (const dstKey of allNodes) {
		count += caps.get(edgeKey(nodeKey, dstKey)) ?? 0;
	}
	return count;
};

const DEBUG_FORK_SUPPORT = false; // Set to true to enable debug logging

/**
 * FORK SUPPORT INVARIANT (Kirchhoff's Law)
 * =========================================
 *
 * Mathematical Model:
 * - Graph G = (V, E) where each tile at position P with color C creates edge: (P - dir(C)) → P
 * - Origins are source nodes (infinite supply)
 *
 * The Invariant:
 *   For every non-origin node N: OUT(N) ≤ IN(N)
 *
 *   Where:
 *     IN(N)  = count of edges (X → N)
 *     OUT(N) = count of edges (N → Y)
 *
 * In plain English: You cannot fork into more branches than paths feeding into you.
 */
const forkSupportOkAfterPlacement = (G: GState, placeCoord: Co, placeColor: Color, rules: Rules): boolean => {
	const caps = buildEdgeCapsAfterPlacement(G, placeCoord, placeColor, rules);
	const allNodes = collectNodesFromEdges(caps);
	const originKeys = new Set(G.origins.map((o) => key(o)));

	if (DEBUG_FORK_SUPPORT) {
		const dir = rules.COLOR_TO_DIR[placeColor];
		const segmentSrc: Co = { q: placeCoord.q - dir.q, r: placeCoord.r - dir.r };
		console.log('[ForkSupport] Placing edge:', key(segmentSrc), '→', key(placeCoord), `(color: ${placeColor})`);
		console.log('[ForkSupport] Origins:', Array.from(originKeys).join(', '));
		console.log('[ForkSupport] All edges:', Array.from(caps.entries()).map(([k, v]) => `${k}(${v})`).join(', '));
	}

	// Check the invariant: OUT(N) ≤ IN(N) for every non-origin node
	for (const nodeKey of allNodes) {
		// Origins have infinite supply, skip them
		if (originKeys.has(nodeKey)) continue;

		const inCount = countIncoming(nodeKey, caps, allNodes);
		const outCount = countOutgoing(nodeKey, caps, allNodes);

		if (DEBUG_FORK_SUPPORT) {
			console.log(`[ForkSupport] Node ${nodeKey}: IN=${inCount}, OUT=${outCount}`, outCount > inCount ? '← VIOLATION!' : '✓');
		}

		// THE INVARIANT: OUT(N) ≤ IN(N)
		if (outCount > inCount) {
			if (DEBUG_FORK_SUPPORT) {
				console.log(`[ForkSupport] BLOCKED: Node ${nodeKey} has OUT(${outCount}) > IN(${inCount})`);
			}
			return false;
		}
	}

	return true;
};


