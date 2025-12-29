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

const countColorInTile = (tile: { colors: Color[] } | undefined, color: Color): number => {
	if (!tile) return 0;
	let n = 0;
	for (const c of tile.colors) if (c === color) n += 1;
	return n;
};

const buildColorCountsAfterPlacement = (
	G: GState,
	placeCoord: Co,
	color: Color
): Map<string, number> => {
	const counts = new Map<string, number>();
	for (const [k, tile] of Object.entries(G.board)) {
		if (!tile || tile.colors.length === 0) continue;
		const n = countColorInTile(tile, color);
		if (n > 0) counts.set(k, n);
	}
	const pk = key(placeCoord);
	counts.set(pk, (counts.get(pk) ?? 0) + 1);
	return counts;
};

const reachableFromCenterForColor = (
	counts: Map<string, number>,
	color: Color,
	rules: Rules
): Set<string> => {
	// In this ruleset, a color can only connect directly from center in its own direction.
	const dir = rules.COLOR_TO_DIR[color];
	const start: Co = { q: CENTER.q + dir.q, r: CENTER.r + dir.r };
	const startKey = key(start);
	if ((counts.get(startKey) ?? 0) <= 0) return new Set<string>();

	const seen = new Set<string>();
	const q: string[] = [startKey];
	seen.add(startKey);

	while (q.length > 0) {
		const curKey = q.shift()!;
		const cur = parse(curKey);
		for (const n of neighbors(cur)) {
			const nk = key(n);
			if (seen.has(nk)) continue;
			if ((counts.get(nk) ?? 0) <= 0) continue;
			seen.add(nk);
			q.push(nk);
		}
	}
	return seen;
};

const outwardBranchCount = (coord: Co, reachable: Set<string>, counts: Map<string, number>): number => {
	const baseRing = ringIndex(coord);
	let branches = 0;
	for (const n of neighbors(coord)) {
		const nk = key(n);
		if (!reachable.has(nk)) continue;
		if ((counts.get(nk) ?? 0) <= 0) continue;
		if (ringIndex(n) > baseRing) branches += 1;
	}
	return branches;
};

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

const maxSupportedLanesTo = (
	reachable: Set<string>,
	counts: Map<string, number>,
	color: Color,
	rules: Rules,
	targetKey: string
): number => {
	// Node capacity model: each coord node has capacity = count(color at coord).
	// Use node-splitting (in -> out edge with that capacity).
	const keys = Array.from(reachable);
	const allKeys = ['CENTER', ...keys];
	const idx = new Map<string, number>();
	for (let i = 0; i < allKeys.length; i += 1) idx.set(allKeys[i]!, i);

	const nodeCount = allKeys.length * 2;
	const g: FlowEdge[][] = Array.from({ length: nodeCount }, () => []);

	const inNode = (k: string): number => 2 * (idx.get(k)!);
	const outNode = (k: string): number => 2 * (idx.get(k)!) + 1;

	// capacity edges
	addFlowEdge(g, inNode('CENTER'), outNode('CENTER'), INF_CAP);
	for (const k of keys) {
		addFlowEdge(g, inNode(k), outNode(k), counts.get(k)!);
	}

	// adjacency edges (within reachable)
	for (const k of keys) {
		const c = parse(k);
		for (const n of neighbors(c)) {
			const nk = key(n);
			if (!reachable.has(nk)) continue;
			addFlowEdge(g, outNode(k), inNode(nk), INF_CAP);
		}
	}

	// center -> first coord edge for this color
	const dir = rules.COLOR_TO_DIR[color];
	const startKey = key({ q: CENTER.q + dir.q, r: CENTER.r + dir.r });
	if (reachable.has(startKey)) {
		addFlowEdge(g, outNode('CENTER'), inNode(startKey), INF_CAP);
	}

	const s = outNode('CENTER');
	const t = outNode(targetKey);
	return dinicMaxFlow(g, s, t);
};

const forkSupportOkAfterPlacement = (G: GState, placeCoord: Co, color: Color, rules: Rules): boolean => {
	const counts = buildColorCountsAfterPlacement(G, placeCoord, color);
	const reachable = reachableFromCenterForColor(counts, color, rules);
	if (reachable.size === 0) return true; // rule only constrains forks that are actually center-connected

	for (const k of reachable) {
		const coord = parse(k);
		const branches = outwardBranchCount(coord, reachable, counts);
		if (branches <= 1) continue; // not a fork

		const capHere = counts.get(k) ?? 0;
		if (capHere < branches) return false;

		const supported = maxSupportedLanesTo(reachable, counts, color, rules, k);
		if (supported < branches) return false;
	}

	return true;
};


