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
	return neighbors(coord).some((n) => (G.board[key(n)] ?? []).length > 0);
};

const satisfiesDirectionRule = (G: GState, coord: Co, color: Color, rules: Rules): boolean => {
	const targetRing = ringIndex(coord);
	const outwardOkay = neighbors(coord).some((n) => {
		const nk = key(n);
		const occ = G.board[nk] ?? [];
		if (occ.length === 0) return false;
		return ringIndex(n) <= targetRing;
	});

	const dir = rules.COLOR_TO_DIR[color];
	const origin: Co = { q: coord.q - dir.q, r: coord.r - dir.r };
	const originOcc = G.board[key(origin)] ?? [];
	// Allow placing the first step in the color direction when the origin is the center and the center is wild (no seed color)
	const originIsCenter = origin.q === 0 && origin.r === 0;
	const centerActsAsWild = rules.CENTER_SEED === null;
	const dirOkay = originOcc.length > 0 || (originIsCenter && centerActsAsWild);

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
	// Center is wild and cannot be occupied
	if (coord.q === 0 && coord.r === 0) return false;
	const ring = ringIndex(coord);
	const capacity = ring > 0 && ring <= rules.MULTI_CAP_FIRST_RINGS ? 2 : 1;
	const occupants = G.board[k] ?? [];
	if (occupants.length >= capacity) return false;
	if (rules.CONNECTIVITY_SCOPE === 'global') {
		if (!hasOccupiedNeighbor(G, coord)) {
			// allow center if board empty and center is empty
			const anyOccupied = Object.values(G.board).some((v) => (v?.length ?? 0) > 0);
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


