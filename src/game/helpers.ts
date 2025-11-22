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

	// For relative directions, get the edge for this color at rotation 0 (new placement)
	// Then find which neighbor hex is in that direction
	const colorEdge = colorToEdgeIndex(color);
	const dir = edgeIndexToDirection(colorEdge, 0); // 0 rotation for new tile
	const origin: Co = { q: coord.q - dir.q, r: coord.r - dir.r };
	const originTile = G.board[key(origin)];
	// Allow placing the first step in the color direction when the origin is any origin and origins act as wild (no seed color)
	const originIsOrigin = G.origins.some((o) => o.q === origin.q && o.r === origin.r);
	const originsActAsWild = rules.CENTER_SEED === null;
	const dirOkay = (originTile && originTile.colors.length > 0) || (originIsOrigin && originsActAsWild);

	switch (rules.OUTWARD_RULE) {
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

export const canPlace = (G: GState, coord: Co, color: Color, rules: Rules): boolean => {
	const k = key(coord);
	if (!inBounds(coord, G.radius)) return false;
	// Origins are wild and cannot be occupied
	const isOrigin = G.origins.some((o) => o.q === coord.q && o.r === coord.r);
	if (isOrigin) return false;
	const ring = ringIndex(coord);
	const capacity = ring > 0 && ring <= rules.MULTI_CAP_FIRST_RINGS ? 2 : 1;
	const tile = G.board[k];
	if (tile && tile.colors.length >= capacity) return false;
	if (rules.CONNECTIVITY_SCOPE === 'global') {
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


