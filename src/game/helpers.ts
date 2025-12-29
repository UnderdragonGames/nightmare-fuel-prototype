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
	if (!hasOccupiedNeighbor(G, coord)) {
		// allow placements adjacent to any origin at any time
		const isAdjacentToOrigin = neighbors(coord).some((n) =>
			G.origins.some((o) => o.q === n.q && o.r === n.r)
		);
		if (!isAdjacentToOrigin) {
			// also allow if board is still completely empty (first move)
			const anyOccupied = Object.values(G.board).some((t) => t && t.colors.length > 0);
			if (anyOccupied) return false;
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
			return '#ef4444';
		case 'O':
			return '#f97316';
		case 'Y':
			return '#eab308';
		case 'G':
			return '#22c55e';
		case 'B':
			return '#3b82f6';
		case 'V':
			return '#8b5cf6';
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

type FlowEdge = { to: number; rev: number; cap: number };

const INF_CAP = 1_000_000_000;
const CENTER: Co = { q: 0, r: 0 };

const addFlowEdge = (g: FlowEdge[][], u: number, v: number, cap: number): void => {
	const fromList = g[u]!;
	const toList = g[v]!;
	const fwd: FlowEdge = { to: v, rev: toList.length, cap };
	const rev: FlowEdge = { to: u, rev: fromList.length, cap: 0 };
	fromList.push(fwd);
	toList.push(rev);
};

const dinicMaxFlow = (g: FlowEdge[][], s: number, t: number): number => {
	const n = g.length;
	let flow = 0;
	const level = new Array<number>(n);
	const it = new Array<number>(n);

	const bfs = (): boolean => {
		level.fill(-1);
		const q: number[] = [];
		level[s] = 0;
		q.push(s);
		while (q.length > 0) {
			const v = q.shift()!;
			for (const e of g[v]!) {
				if (e.cap <= 0) continue;
				if (level[e.to]! >= 0) continue;
				level[e.to] = level[v]! + 1;
				q.push(e.to);
			}
		}
		return level[t]! >= 0;
	};

	const dfs = (v: number, pushed: number): number => {
		if (pushed === 0) return 0;
		if (v === t) return pushed;
		for (; it[v]! < g[v]!.length; it[v]! += 1) {
			const i = it[v]!;
			const e = g[v]![i]!;
			if (e.cap <= 0) continue;
			if (level[e.to] !== level[v]! + 1) continue;
			const tr = dfs(e.to, Math.min(pushed, e.cap));
			if (tr === 0) continue;
			e.cap -= tr;
			g[e.to]![e.rev]!.cap += tr;
			return tr;
		}
		return 0;
	};

	while (bfs()) {
		it.fill(0);
		while (true) {
			const pushed = dfs(s, INF_CAP);
			if (pushed === 0) break;
			flow += pushed;
		}
	}
	return flow;
};

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

const collectNodesFromEdges = (caps: EdgeCaps): string[] => {
	const nodes = new Set<string>();
	nodes.add(key(CENTER));
	for (const k of caps.keys()) {
		const [u, v] = k.split('->');
		if (!u || !v) continue;
		nodes.add(u);
		nodes.add(v);
	}
	return Array.from(nodes);
};

const buildDinicGraph = (nodes: string[], caps: EdgeCaps): { g: FlowEdge[][]; idx: Map<string, number> } => {
	const idx = new Map<string, number>();
	for (let i = 0; i < nodes.length; i += 1) idx.set(nodes[i]!, i);
	const g: FlowEdge[][] = Array.from({ length: nodes.length }, () => []);

	for (const [k, cap] of caps.entries()) {
		if (cap <= 0) continue;
		const [uKey, vKey] = k.split('->');
		if (!uKey || !vKey) continue;
		const u = idx.get(uKey);
		const v = idx.get(vKey);
		if (u === undefined || v === undefined) continue;
		addFlowEdge(g, u, v, cap);
	}
	return { g, idx };
};

const countOutwardBranches = (node: Co, caps: EdgeCaps): number => {
	const uKey = key(node);
	const baseRing = ringIndex(node);
	let branches = 0;
	for (const n of neighbors(node)) {
		if (ringIndex(n) <= baseRing) continue;
		const vKey = key(n);
		branches += caps.get(edgeKey(uKey, vKey)) ?? 0;
	}
	return branches;
};

const forkSupportOkAfterPlacement = (G: GState, placeCoord: Co, placeColor: Color, rules: Rules): boolean => {
	// In path mode, lanes are edges: each tile color occurrence is an edge from (dst - dir(color)) -> dst.
	// Fork at node U = total outward outgoing edge capacity from U is > 1.
	// Constraint: for every fork node, max flow from center to that node must be >= outward branches.
	const caps = buildEdgeCapsAfterPlacement(G, placeCoord, placeColor, rules);
	const nodes = collectNodesFromEdges(caps);

	const centerKey = key(CENTER);
	const centerIdx = nodes.indexOf(centerKey);
	if (centerIdx < 0) return true;

	// Only need to check nodes that can be forks (have 2+ outward outgoing lanes).
	for (const nodeKey of nodes) {
		if (nodeKey === centerKey) continue;
		const node = parse(nodeKey);
		const branches = countOutwardBranches(node, caps);
		if (branches <= 1) continue;

		// Build a fresh residual graph per sink (Dinic mutates capacities).
		const { g, idx } = buildDinicGraph(nodes, caps);
		const s = idx.get(centerKey);
		const t = idx.get(nodeKey);
		if (s === undefined || t === undefined) return false;

		const supported = dinicMaxFlow(g, s, t);
		if (supported < branches) return false;
	}

	return true;
};


