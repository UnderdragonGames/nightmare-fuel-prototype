import type { GState, Color } from './types';
import { buildAllCoords, key, neighbors, ringIndex, parse } from './helpers';

export const computeScores = (G: GState): Record<string, number> => {
	const radius = G.radius;
	const visited: Record<Color, Record<string, boolean>> = {
		R: {}, O: {}, Y: {}, G: {}, B: {}, V: {},
	};
	const componentsByColor: Record<Color, string[][]> = {
		R: [], O: [], Y: [], G: [], B: [], V: [],
	};
	const coords = buildAllCoords(radius);
	for (const c of coords) {
		const k = key(c);
		const occupants = G.board[k] ?? [];
		if (occupants.length === 0) continue;
		for (const color of occupants) {
			if (visited[color]![k]) continue;
			const comp: string[] = [];
			const stack = [c];
			visited[color]![k] = true;
			while (stack.length) {
				const cur = stack.pop()!;
				const ck = key(cur);
				comp.push(ck);
				for (const n of neighbors(cur)) {
					const nk = key(n);
					const occ = G.board[nk] ?? [];
					if (!occ.includes(color) || visited[color]![nk]) continue;
					visited[color]![nk] = true;
					stack.push(n);
				}
			}
			componentsByColor[color].push(comp);
		}
	}

	const scores: Record<string, number> = {};
	for (const pid of Object.keys(G.prefs)) {
		scores[pid] = 0;
		const { primary, secondary, tertiary } = G.prefs[pid]!;
		const countRimTouch = (color: Color): number => {
			const comps = componentsByColor[color];
			let count = 0;
			for (const comp of comps) {
				let touches = false;
				for (const sk of comp) {
					if (ringIndex(parse(sk)) === radius) {
						touches = true;
						break;
					}
				}
				if (!touches) continue;
				count += 1;
			}
			return count;
		};
		scores[pid] += 3 * countRimTouch(primary);
		scores[pid] += 2 * countRimTouch(secondary);
		scores[pid] += 1 * countRimTouch(tertiary);
	}
	return scores;
};


