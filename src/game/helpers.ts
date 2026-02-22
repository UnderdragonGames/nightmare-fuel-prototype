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

export const isNeighbor = (a: Co, b: Co): boolean =>
	neighbors(a).some((n) => n.q === b.q && n.r === b.r);

export const axialToPixel = (c: Co, size: number): { x: number; y: number } => {
	// flat-topped axial coordinates
	const x = size * (3 / 2) * c.q;
	const y = size * (Math.sqrt(3) / 2 * c.q + Math.sqrt(3) * c.r);
	return { x, y };
};

const buildOriginConnectedTiles = (G: GState): Set<string> => {
	const connected = new Set<string>();
	const queue: Co[] = [];

	for (const origin of G.origins) {
		const ok = key(origin);
		if (connected.has(ok)) continue;
		connected.add(ok);
		queue.push(origin);
	}

	while (queue.length > 0) {
		const cur = queue.shift()!;
		for (const n of neighbors(cur)) {
			if (!inBounds(n, G.radius)) continue;
			const nk = key(n);
			if (connected.has(nk)) continue;
			const isOrigin = G.origins.some((o) => o.q === n.q && o.r === n.r);
			const tile = G.board[nk];
			if (!isOrigin && (!tile || tile.colors.length === 0)) continue;
			connected.add(nk);
			queue.push(n);
		}
	}

	return connected;
};

const laneKey = (u: Co, v: Co): string => `${key(u)}->${key(v)}`;

const nodeHasAnyLane = (G: GState, coord: Co): boolean => {
	for (const ln of G.lanes) {
		if ((ln.from.q === coord.q && ln.from.r === coord.r) || (ln.to.q === coord.q && ln.to.r === coord.r)) {
			return true;
		}
	}
	return false;
};

const countDirectedLanes = (G: GState, from: Co, to: Co): number => {
	let count = 0;
	for (const ln of G.lanes) {
		if (ln.from.q === from.q && ln.from.r === from.r && ln.to.q === to.q && ln.to.r === to.r) count += 1;
	}
	return count;
};

const countUndirectedLanes = (G: GState, a: Co, b: Co): number =>
	countDirectedLanes(G, a, b) + countDirectedLanes(G, b, a);

const undirectedHasColor = (G: GState, a: Co, b: Co, color: Color): boolean => {
	for (const ln of G.lanes) {
		if (ln.color !== color) continue;
		const ab =
			(ln.from.q === a.q && ln.from.r === a.r && ln.to.q === b.q && ln.to.r === b.r) ||
			(ln.from.q === b.q && ln.from.r === b.r && ln.to.q === a.q && ln.to.r === a.r);
		if (ab) return true;
	}
	return false;
};

const nodeHasColorLane = (G: GState, coord: Co, color: Color): boolean => {
	for (const ln of G.lanes) {
		if (ln.color !== color) continue;
		const hit =
			(ln.from.q === coord.q && ln.from.r === coord.r) ||
			(ln.to.q === coord.q && ln.to.r === coord.r);
		if (hit) return true;
	}
	return false;
};

const countIncomingLanes = (G: GState, node: Co): { count: number; sources: Set<string> } => {
	let count = 0;
	const sources = new Set<string>();
	for (const ln of G.lanes) {
		if (ln.to.q === node.q && ln.to.r === node.r) {
			count += 1;
			sources.add(key(ln.from));
		}
	}
	return { count, sources };
};

type DirectedCaps = Map<string, number>; // key: `${uKey}->${vKey}`

const buildDirectedCaps = (G: GState): DirectedCaps => {
	const caps: DirectedCaps = new Map();
	for (const ln of G.lanes) {
		const k = laneKey(ln.from, ln.to);
		caps.set(k, (caps.get(k) ?? 0) + 1);
	}
	return caps;
};

const buildDirectedCapsAfterLane = (G: GState, from: Co, to: Co): DirectedCaps => {
	const caps = buildDirectedCaps(G);
	{
		const k = laneKey(from, to);
		caps.set(k, (caps.get(k) ?? 0) + 1);
	}
	return caps;
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
	// Must be adjacent to an origin-connected occupied tile (or origin itself).
	const originConnected = buildOriginConnectedTiles(G);
	const hasNeighbor = neighbors(coord).some((n) => originConnected.has(key(n)));
	if (!hasNeighbor) {
		return false; // Disconnected placement - not allowed
	}

	// Compute the source of this edge: where the color "comes from"
	const dir = rules.COLOR_TO_DIR[color];
	const edgeSource: Co = { q: coord.q - dir.q, r: coord.r - dir.r };

	// CONSOLIDATION: once ANY path is rim-connected, allow "backward" reinforcement (inward edges)
	// - reinforcement only: target tile must already be occupied
	// - only applies to inward edges: source ring > destination ring
	// - still disallow edges from outside the board (source must be in bounds)
	// - require the source node to be "real": occupied tile OR origin
	if (rules.PLACEMENT.CONSOLIDATION && tile && tile.colors.length > 0) {
		const anyRimConnected = rules.COLORS.some((c) => hasRimConnectedPath(G, c));
		if (anyRimConnected) {
			const destRing = ringIndex(coord);
			const sourceRing = ringIndex(edgeSource);
			const isInwardEdge = sourceRing > destRing;
			if (isInwardEdge && inBounds(edgeSource, G.radius)) {
				const sourceIsOrigin = G.origins.some((o) => o.q === edgeSource.q && o.r === edgeSource.r);
				const sourceTile = G.board[key(edgeSource)];
				const sourceOccupied = !!sourceTile && sourceTile.colors.length > 0;
				if (sourceIsOrigin || sourceOccupied) {
					return true;
				}
			}
		}
	}

	// NO_BUILD_FROM_RIM: Can't build from tiles at the rim (paths terminate at rim)
	// Also blocks sources outside the board (ring > radius)
	if (rules.PLACEMENT.NO_BUILD_FROM_RIM) {
		const sourceRing = ringIndex(edgeSource);
		if (sourceRing >= G.radius) {
			return false; // Source is at or beyond rim, can't build from it
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

export const canPlacePath = (G: GState, source: Co, dest: Co, color: Color, rules: Rules): boolean => {
	if (rules.MODE !== 'path') return false;
	if (!inBounds(source, G.radius) || !inBounds(dest, G.radius)) return false;
	if (!isNeighbor(source, dest)) return false;

	// Origins are wild and cannot be occupied / used as destination
	const destIsOrigin = G.origins.some((o) => o.q === dest.q && o.r === dest.r);
	if (destIsOrigin) return false;

	// Must extend from an existing node (or origin)
	const sourceIsOrigin = G.origins.some((o) => o.q === source.q && o.r === source.r);
	if (!sourceIsOrigin && !nodeHasAnyLane(G, source)) return false;

	// Per-directed-segment capacity
	if (countDirectedLanes(G, source, dest) >= rules.PLACEMENT.MAX_LANES_PER_PATH) return false;

	// Core mechanic: normally, a color implies its direction.
	const dir = rules.COLOR_TO_DIR[color];
	const expectedDest: Co = { q: source.q + dir.q, r: source.r + dir.r };
	const directionMatch = expectedDest.q === dest.q && expectedDest.r === dest.r;

	let isConsolidationRecolorMove = false;
	let isConsolidationBacktrack = false;

	// If this undirected edge already exists, adding a *new color* to it is CONSOLIDATION-gated.
	// - stacking an existing color on the edge remains a normal move
	// - creating new edges remains a normal move
	{
		const edgeExists = countUndirectedLanes(G, source, dest) > 0;
		const isNewColorOnExistingEdge = edgeExists && !undirectedHasColor(G, source, dest, color);

		// Consolidation exception (ONLY): allow placing a new color on an existing edge,
		// and only if that same color has already reached the rim and is propagating.
		if (isNewColorOnExistingEdge) {
			if (!isConsolidationMove(G, source, dest, color, rules)) return false;
			// Prevent "global recolor": must extend from an existing segment of this color.
			if (!nodeHasColorLane(G, source, color) && !nodeHasColorLane(G, dest, color)) return false;
			isConsolidationRecolorMove = true;
			isConsolidationBacktrack = ringIndex(source) > ringIndex(dest);
		} else {
			// Origins can stack, but cap parallel lanes at 2 per edge from an origin.
			if (!directionMatch) return false;
			// If already branching from this node, only add a new outward direction when this color is already present.
			if (!sourceIsOrigin && ringIndex(dest) > ringIndex(source)) {
				const outgoing = new Set<string>();
				for (const ln of G.lanes) {
					if (ln.from.q === source.q && ln.from.r === source.r) {
						outgoing.add(key(ln.to));
					}
				}
				if (outgoing.size >= 2 && !outgoing.has(key(dest)) && !nodeHasColorLane(G, source, color)) {
					return false;
				}
			}
		}

		// Even for consolidation, disallow off-direction moves unless it is actually recoloring an existing edge.
		if (!directionMatch && !isNewColorOnExistingEdge) return false;
	}

	// NO_BUILD_FROM_RIM: cannot build FROM rim nodes
	if (rules.PLACEMENT.NO_BUILD_FROM_RIM && ringIndex(source) >= G.radius) return false;

	// NO_INTERSECT: all incoming lanes to dest must share the same source
	// Consolidation recolor is constrained to an already-existing edge, so it cannot introduce a geometric intersection.
	// Treat it as exempt from NO_INTERSECT's directed-incoming constraint (which would otherwise block "backtracking").
	if (rules.PLACEMENT.NO_INTERSECT && (!isConsolidationRecolorMove || !isConsolidationBacktrack)) {
		const { sources } = countIncomingLanes(G, dest);
		if (sources.size > 0 && !sources.has(key(source))) return false;
	}

	// Per-path node limit: at each non-origin source node, enforce three constraints:
	// 1. Unique outgoing DIRECTIONS cannot exceed total incoming lane count
	// 2. Same-color lanes per directed outgoing edge cannot exceed incoming lane count
	// 3. Total outgoing lanes cannot exceed IN + min(max(IN-1, 0), 2) (with tolerance for pre-existing violations)
	// Consolidation recolor on an existing edge is exempt (same reasoning as NO_INTERSECT).
	if (rules.PLACEMENT.FORK_SUPPORT && (!isConsolidationRecolorMove || !isConsolidationBacktrack)) {
		if (!sourceIsOrigin) {
			// Total incoming lanes to source
			let totalIn = 0;
			for (const ln of G.lanes) {
				if (ln.to.q === source.q && ln.to.r === source.r) totalIn++;
			}

			if (totalIn > 0) {
				// Constraint 1: unique outgoing directions must not exceed incoming lane count
				const outDirsBefore = new Set<string>();
				let totalOutBefore = 0;
				for (const ln of G.lanes) {
					if (ln.from.q === source.q && ln.from.r === source.r) {
						outDirsBefore.add(key(ln.to));
						totalOutBefore++;
					}
				}
				const destKey = key(dest);
				const outDirsAfter = new Set(outDirsBefore);
				outDirsAfter.add(destKey);
				if (outDirsAfter.size > totalIn && outDirsAfter.size > outDirsBefore.size) {
					return false;
				}

				// Constraint 2: same-color lanes per directed outgoing edge must not exceed incoming count
				let sameColorOnEdge = 0;
				for (const ln of G.lanes) {
					if (ln.from.q === source.q && ln.from.r === source.r
						&& ln.to.q === dest.q && ln.to.r === dest.r
						&& ln.color === color) {
						sameColorOnEdge++;
					}
				}
				if (sameColorOnEdge + 1 > totalIn) {
					return false;
				}

				// Constraint 3: total outgoing lanes (with before/after tolerance for pre-existing violations)
				const allowedExtra = Math.min(Math.max(totalIn - 1, 0), 2);
				const maxOut = totalIn + allowedExtra;
				const totalOutAfter = totalOutBefore + 1;
				if (totalOutAfter > maxOut) {
					const surplusBefore = Math.max(totalOutBefore - maxOut, 0);
					const surplusAfter = totalOutAfter - maxOut;
					if (surplusAfter > surplusBefore) return false;
				}
			}
		}
	}

	return true;
};

const buildRimConnectedNodesForColor = (G: GState, color: Color): Set<string> => {
	const adj = new Map<string, Set<string>>();
	const addAdj = (a: Co, b: Co): void => {
		const ak = key(a);
		const bk = key(b);
		if (!adj.has(ak)) adj.set(ak, new Set());
		if (!adj.has(bk)) adj.set(bk, new Set());
		adj.get(ak)!.add(bk);
		adj.get(bk)!.add(ak);
	};

	const rimSeeds: Co[] = [];
	for (const ln of G.lanes) {
		if (ln.color !== color) continue;
		addAdj(ln.from, ln.to);
		if (ringIndex(ln.from) === G.radius) rimSeeds.push(ln.from);
		if (ringIndex(ln.to) === G.radius) rimSeeds.push(ln.to);
	}

	const connected = new Set<string>();
	const queue: Co[] = [];
	for (const seed of rimSeeds) {
		const sk = key(seed);
		if (connected.has(sk)) continue;
		connected.add(sk);
		queue.push(seed);
	}

	while (queue.length > 0) {
		const cur = queue.shift()!;
		const nbrs = adj.get(key(cur));
		if (!nbrs) continue;
		for (const nk of nbrs) {
			if (connected.has(nk)) continue;
			connected.add(nk);
			queue.push(parse(nk));
		}
	}

	return connected;
};

export const isConsolidationMove = (G: GState, source: Co, dest: Co, color: Color, rules: Rules): boolean => {
	if (!rules.PLACEMENT.CONSOLIDATION) return false;
	if (rules.MODE !== 'path') return false;
	if (!hasRimConnectedPath(G, color)) return false;
	if (countUndirectedLanes(G, source, dest) === 0) return false;

	const sourceRing = ringIndex(source);
	const destRing = ringIndex(dest);
	if (sourceRing === destRing) return false;

	const outward = sourceRing > destRing ? source : dest;
	const rimConnected = buildRimConnectedNodesForColor(G, color);
	return rimConnected.has(key(outward));
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
 * Count colors that have a continuous same-color path from rim to center (origin at 0,0).
 * Used for CONSOLIDATION_END rule: game ends when this count meets the threshold.
 */
export const countRimToCenterPaths = (G: GState): number => {
	const radius = G.radius;
	const colors: readonly Color[] = G.rules.COLORS;
	let total = 0;

	// Check if center (0,0) is an origin
	const centerIsOrigin = G.origins.some((o) => o.q === 0 && o.r === 0);
	if (!centerIsOrigin) return 0;

	// Path mode: lanes are explicit; treat same-color connectivity as undirected on lane endpoints.
	if (G.rules.MODE === 'path') {
		const centerK = key({ q: 0, r: 0 });
		for (const color of colors) {
			const adj = new Map<string, Set<string>>();
			const add = (a: Co, b: Co): void => {
				const ak = key(a);
				const bk = key(b);
				if (!adj.has(ak)) adj.set(ak, new Set());
				if (!adj.has(bk)) adj.set(bk, new Set());
				adj.get(ak)!.add(bk);
				adj.get(bk)!.add(ak);
			};
			for (const ln of G.lanes) {
				if (ln.color !== color) continue;
				add(ln.from, ln.to);
			}

			// Seed from rim nodes incident to this color.
			const visited = new Set<string>();
			const queue: string[] = [];
			for (const ln of G.lanes) {
				if (ln.color !== color) continue;
				const ends: Co[] = [ln.from, ln.to];
				for (const e of ends) {
					if (ringIndex(e) !== radius) continue;
					const ek = key(e);
					if (visited.has(ek)) continue;
					visited.add(ek);
					queue.push(ek);
				}
			}
			while (queue.length) {
				const cur = queue.shift()!;
				if (cur === centerK) {
					total += 1;
					break;
				}
				const nbrs = adj.get(cur);
				if (!nbrs) continue;
				for (const nk of nbrs) {
					if (visited.has(nk)) continue;
					visited.add(nk);
					queue.push(nk);
				}
			}
		}
		return total;
	}

	for (const color of colors) {
		// BFS from rim tiles with this color, check if we reach center-adjacent
		let found = false;
		const visited = new Set<string>();
		const queue: Co[] = [];

		// Seed with rim tiles that have this color
		for (let q = -radius; q <= radius; q++) {
			for (let r = -radius; r <= radius; r++) {
				const s = -q - r;
				if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) !== radius) continue;
				const coord: Co = { q, r };
				const tile = G.board[key(coord)];
				if (!tile || !tile.colors.includes(color)) continue;
				const ck = key(coord);
				if (!visited.has(ck)) {
					visited.add(ck);
					queue.push(coord);
				}
			}
		}

		// BFS through same-color tiles
		while (queue.length > 0 && !found) {
			const cur = queue.shift()!;

			// Check if adjacent to center origin
			for (const n of neighbors(cur)) {
				if (n.q === 0 && n.r === 0) {
					total += 1;
					found = true;
					break;
				}
			}

			if (found) break;
			for (const n of neighbors(cur)) {
				if (!inBounds(n, radius)) continue;
				const nk = key(n);
				if (visited.has(nk)) continue;
				const tile = G.board[nk];
				if (!tile || !tile.colors.includes(color)) continue;
				visited.add(nk);
				queue.push(n);
			}
		}
	}

	return total;
};

/**
 * Check if a color has a continuous same-color segment from the rim that connects to the origin network.
 * Used for CONSOLIDATION rule: once rim-connected, can reinforce backward.
 * 
 * Requirements:
 * 1. Color exists on a rim tile
 * 2. There's a continuous same-color chain extending from that rim tile
 * 3. That chain connects to the origin-connected network (which can be multi-color)
 */
export const hasRimConnectedPath = (G: GState, color: Color): boolean => {
	// Path mode: "rim-connected" means there exists a lane of this color incident to the rim
	// that is connected back to any origin through the (any-color) lane graph.
	if (G.rules.MODE === 'path') {
		const radius = G.radius;
		const originKeys = new Set(G.origins.map((o) => key(o)));

		// Undirected adjacency for any-color lanes
		const adj = new Map<string, Set<string>>();
		const addAdj = (a: Co, b: Co): void => {
			const ak = key(a);
			const bk = key(b);
			if (!adj.has(ak)) adj.set(ak, new Set());
			if (!adj.has(bk)) adj.set(bk, new Set());
			adj.get(ak)!.add(bk);
			adj.get(bk)!.add(ak);
		};
		for (const ln of G.lanes) addAdj(ln.from, ln.to);

		// Origin-connected set
		const originConnected = new Set<string>();
		const q: string[] = [];
		for (const ok of originKeys) {
			originConnected.add(ok);
			q.push(ok);
		}
		while (q.length) {
			const cur = q.shift()!;
			const nbrs = adj.get(cur);
			if (!nbrs) continue;
			for (const nk of nbrs) {
				if (originConnected.has(nk)) continue;
				originConnected.add(nk);
				q.push(nk);
			}
		}

		for (const ln of G.lanes) {
			if (ln.color !== color) continue;
			const fromRim = ringIndex(ln.from) === radius;
			const toRim = ringIndex(ln.to) === radius;
			if (!(fromRim || toRim)) continue;
			if (originConnected.has(key(ln.from)) || originConnected.has(key(ln.to))) return true;
		}
		return false;
	}

	const radius = G.radius;
	const originKeys = new Set(G.origins.map((o) => key(o)));

	// Step 1: BFS from origins through ANY occupied tiles to get origin-connected set
	const reachableFromOrigin = new Set<string>();
	{
		const queue: Co[] = [];
		for (const origin of G.origins) {
			reachableFromOrigin.add(key(origin));
			for (const n of neighbors(origin)) {
				if (!inBounds(n, radius)) continue;
				const tile = G.board[key(n)];
				if (!tile || tile.colors.length === 0) continue;
				const nk = key(n);
				if (!reachableFromOrigin.has(nk)) {
					reachableFromOrigin.add(nk);
					queue.push(n);
				}
			}
		}
		while (queue.length > 0) {
			const cur = queue.shift()!;
			for (const n of neighbors(cur)) {
				if (!inBounds(n, radius)) continue;
				const nk = key(n);
				if (reachableFromOrigin.has(nk)) continue;
				if (originKeys.has(nk)) {
					reachableFromOrigin.add(nk);
					queue.push(n);
					continue;
				}
				const tile = G.board[nk];
				if (!tile || tile.colors.length === 0) continue;
				reachableFromOrigin.add(nk);
				queue.push(n);
			}
		}
	}

	// Step 2: Find tiles with this color that have "reached the rim"
	// This includes: tiles AT the rim, OR tiles adjacent to a rim origin
	const rimTilesWithColor: Co[] = [];
	const rimOrigins = G.origins.filter((o) => ringIndex(o) === radius);

	// First, check tiles AT the rim
	for (let q = -radius; q <= radius; q++) {
		for (let r = -radius; r <= radius; r++) {
			const s = -q - r;
			if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) !== radius) continue;
			const coord: Co = { q, r };
			const tile = G.board[key(coord)];
			if (tile && tile.colors.includes(color)) {
				rimTilesWithColor.push(coord);
			}
		}
	}

	// Also check tiles adjacent to rim origins
	for (const rimOrigin of rimOrigins) {
		for (const neighbor of neighbors(rimOrigin)) {
			if (!inBounds(neighbor, radius)) continue;
			const tile = G.board[key(neighbor)];
			if (tile && tile.colors.includes(color)) {
				// Avoid duplicates (tile might already be at rim)
				const alreadyAdded = rimTilesWithColor.some(
					(t) => t.q === neighbor.q && t.r === neighbor.r
				);
				if (!alreadyAdded) {
					rimTilesWithColor.push(neighbor);
				}
			}
		}
	}

	if (rimTilesWithColor.length === 0) return false;

	// Step 3: BFS from rim tiles through same-color tiles, check if chain connects to origin network
	const visitedSameColor = new Set<string>();
	const queue: Co[] = [];

	for (const rimTile of rimTilesWithColor) {
		const rk = key(rimTile);
		if (!visitedSameColor.has(rk)) {
			visitedSameColor.add(rk);
			queue.push(rimTile);
		}
	}

	while (queue.length > 0) {
		const cur = queue.shift()!;
		const curKey = key(cur);

		// Check if this same-color tile is adjacent to origin OR connects to origin network
		for (const n of neighbors(cur)) {
			if (originKeys.has(key(n))) {
				return true; // Same-color chain from rim reaches origin directly
			}
		}
		// Also check if connected to origin network through multi-color path
		if (reachableFromOrigin.has(curKey)) {
			// This tile is in the origin-connected network, so the same-color chain connects
			return true;
		}

		// Continue BFS through same-color tiles
		for (const n of neighbors(cur)) {
			if (!inBounds(n, radius)) continue;
			const nk = key(n);
			if (visitedSameColor.has(nk)) continue;
			const tile = G.board[nk];
			if (!tile || !tile.colors.includes(color)) continue;
			visitedSameColor.add(nk);
			queue.push(n);
		}
	}

	return false;
};

/**
 * FORK SUPPORT INVARIANT (Support-Based Branching)
 * =================================================
 *
 * Mathematical Model:
 * - Graph G = (V, E) where each tile at position P with color C creates edge: (P - dir(C)) → P
 * - Origins are source nodes (infinite supply)
 *
 * The Invariant:
 *   For every non-origin node N: OUT(N) ≤ IN(N) + allowedExtra(IN(N))
 *
 *   Where:
 *     IN(N)  = count of edges (X → N)
 *     OUT(N) = count of edges (N → Y)
 *     allowedExtra(n) = min(n - 1, 2)
 *
 * Branching by support level:
 *   - Single (IN=1): 0 extra branches → OUT ≤ 1 (no branching)
 *   - Double (IN=2): 1 extra branch  → OUT ≤ 3 (can branch once per node)
 *   - Triple (IN=3): 2 extra branches → OUT ≤ 5 (max branching: 2 per node)
 *
 * In plain English: Support indicates how many branches can spawn at a node.
 * Single lanes can't branch. Each additional lane adds branching capacity (up to 2 max).
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

	// Check the invariant: OUT(N) ≤ IN(N) + allowedExtra for every non-origin node
	for (const nodeKey of allNodes) {
		// Origins have infinite supply, skip them
		if (originKeys.has(nodeKey)) continue;

		const inCount = countIncoming(nodeKey, caps, allNodes);
		const outCount = countOutgoing(nodeKey, caps, allNodes);
		// Support-based branching: extra branches allowed = min(IN - 1, 2)
		const allowedExtra = Math.min(Math.max(inCount - 1, 0), 2);
		const maxOut = inCount + allowedExtra;

		if (DEBUG_FORK_SUPPORT) {
			console.log(`[ForkSupport] Node ${nodeKey}: IN=${inCount}, OUT=${outCount}, maxOUT=${maxOut}`, outCount > maxOut ? '← VIOLATION!' : '✓');
		}

		// THE INVARIANT: OUT(N) ≤ IN(N) + allowedExtra
		if (outCount > maxOut) {
			if (DEBUG_FORK_SUPPORT) {
				console.log(`[ForkSupport] BLOCKED: Node ${nodeKey} has OUT(${outCount}) > maxOUT(${maxOut})`);
			}
			return false;
		}
	}

	return true;
};
