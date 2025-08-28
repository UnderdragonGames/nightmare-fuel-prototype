import type { GState, Color } from './types';
import { buildAllCoords, key, neighbors, ringIndex } from './helpers';
import { RULES } from './rulesConfig';

export const computeScores = (G: GState): Record<string, number> => {
	const radius = G.radius;
	const coords = buildAllCoords(radius);

	const isRim = (q: number, r: number): boolean => ringIndex({ q, r }) === radius;
	const hasColorAt = (q: number, r: number, color: Color): boolean => {
		const k = `${q},${r}`;
		const occ = G.board[k] ?? [];
		return occ.includes(color);
	};

	const center = { q: 0, r: 0 };

	const intersectionCountByColor: Record<Color, number> = {
		R: 0, O: 0, Y: 0, G: 0, B: 0, V: 0,
	};

	const colors: readonly Color[] = RULES.COLORS;

	for (const color of colors) {
		// Same-color connectivity emanating from the source at (0,0).
		// The source counts for every color: seed with center if it has the color,
		// and also seed with any same-color neighbors of the center.
		const fromCenter = new Set<string>();
		const seed: { q: number; r: number }[] = [];
		if (hasColorAt(center.q, center.r, color)) seed.push(center);
		for (const n of neighbors(center)) {
			if (hasColorAt(n.q, n.r, color)) seed.push(n);
		}
		if (seed.length > 0) {
			const stack: { q: number; r: number }[] = [...seed];
			for (const s of seed) fromCenter.add(key(s));
			while (stack.length) {
				const cur = stack.pop()!;
				for (const n of neighbors(cur)) {
					if (!hasColorAt(n.q, n.r, color)) continue;
					const nk = key(n);
					if (fromCenter.has(nk)) continue;
					fromCenter.add(nk);
					stack.push(n);
				}
			}
		}

		// Same-color connectivity from rim (multi-source BFS)
		const fromRim = new Set<string>();
		const queue: { q: number; r: number }[] = [];
		for (const c of coords) {
			if (!isRim(c.q, c.r)) continue;
			if (!hasColorAt(c.q, c.r, color)) continue;
			const ck = key(c);
			if (!fromRim.has(ck)) {
				fromRim.add(ck);
				queue.push(c);
			}
		}
		while (queue.length) {
			const cur = queue.shift()!;
			for (const n of neighbors(cur)) {
				if (!hasColorAt(n.q, n.r, color)) continue;
				const nk = key(n);
				if (fromRim.has(nk)) continue;
				fromRim.add(nk);
				queue.push(n);
			}
		}

		// Intersection tiles count once
		let count = 0;
		if (fromCenter.size > 0 && fromRim.size > 0) {
			for (const kC of fromCenter) if (fromRim.has(kC)) count += 1;
		}
		intersectionCountByColor[color] = count;
	}

	const scores: Record<string, number> = {};
	for (const pid of Object.keys(G.prefs)) {
		scores[pid] = 0;
		const { primary, secondary, tertiary } = G.prefs[pid]!;
		scores[pid] += 3 * intersectionCountByColor[primary];
		scores[pid] += 2 * intersectionCountByColor[secondary];
		scores[pid] += 1 * intersectionCountByColor[tertiary];
	}
	return scores;
};


