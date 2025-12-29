import type { Card, Co, Color, GState, Rules } from './types';
import { RULES } from './rulesConfig';

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
				edgeIndexFacingCoord = colorToEdgeIndex(cKey as Color);
				break;
			}
		}
		if (edgeIndexFacingCoord === -1) continue;

		// What colour is on that edge, given the neighbour's rotation?
		const edgeCol = edgeIndexToColor(edgeIndexFacingCoord, rotation);
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
export const inferPlacementRotation = (G: GState, coord: Co, color: Color, rules: Rules): number => {
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
	return satisfiesDirectionRule(G, coord, color, rules);
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

// Edge colors going clockwise from North: YGBVRO (edges 0-5)
const EDGE_COLORS: readonly Color[] = ['Y', 'G', 'B', 'V', 'R', 'O'];

// Get edge index (0-5) for a color in default orientation
export const colorToEdgeIndex = (color: Color): number => {
	return EDGE_COLORS.indexOf(color);
};

// Get color for an edge index considering rotation
export const edgeIndexToColor = (edgeIndex: number, rotation: number): Color => {
	const rotatedEdge = (edgeIndex - rotation + 6) % 6;
	return EDGE_COLORS[rotatedEdge]!;
};

// Get absolute direction (Co) for a relative edge index considering rotation
export const edgeIndexToDirection = (edgeIndex: number, rotation: number): Co => {
	const rotatedEdge = (edgeIndex - rotation + 6) % 6;
	const color = EDGE_COLORS[rotatedEdge]!;
	return RULES.COLOR_TO_DIR[color];
};

// Get relative edge index for an absolute direction considering rotation
export const directionToEdgeIndex = (dir: Co, rotation: number): number => {
	// Find which color matches this direction
	for (const [color, colorDir] of Object.entries(RULES.COLOR_TO_DIR)) {
		if (colorDir.q === dir.q && colorDir.r === dir.r) {
			const baseEdge = colorToEdgeIndex(color as Color);
			return (baseEdge + rotation) % 6;
		}
	}
	return 0; // fallback
};

// Get color's relative edge index for a tile with given rotation
export const colorToRelativeEdge = (color: Color, rotation: number): number => {
	const baseEdge = colorToEdgeIndex(color);
	return (baseEdge + rotation) % 6;
};


