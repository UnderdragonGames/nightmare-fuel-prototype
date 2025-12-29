import type { GState, Color } from './types';
import { buildAllCoords, key, neighbors, ringIndex, parse, inBounds } from './helpers';
import { RULES } from './rulesConfig';

export const computeScores = (G: GState): Record<string, number> => {
	const radius = G.radius;
	const coords = buildAllCoords(radius);

	const isRim = (q: number, r: number): boolean => ringIndex({ q, r }) === radius;
	const hasColorAt = (q: number, r: number, color: Color): boolean => {
		const k = `${q},${r}`;
		const tile = G.board[k];
		return tile !== undefined && tile.colors.includes(color);
	};
	const hasAnyAt = (q: number, r: number): boolean => {
		const k = `${q},${r}`;
		const tile = G.board[k];
		return tile !== undefined && tile.colors.length > 0;
	};

	// Origins are conceptual start nodes for connectivity even if they don't have a tile/color on them.
	const originKeys = new Set(G.origins.map((o) => key(o)));
	const isOriginKey = (k: string): boolean => originKeys.has(k);

	// Multi-color connectivity from origins: treat any occupied tile as traversable, plus origin coordinates.
	// This enables "path can change colors; only rim color segment scores".
	const originDistAny = new Map<string, number>();
	{
		const queue: Array<{ q: number; r: number }> = [];
		for (const o of G.origins) {
			const ok = key(o);
			if (originDistAny.has(ok)) continue;
			originDistAny.set(ok, 0);
			queue.push(o);
		}
		while (queue.length) {
			const cur = queue.shift()!;
			const curK = key(cur);
			const curDist = originDistAny.get(curK) ?? 0;
			for (const n of neighbors(cur)) {
				if (!inBounds(n, radius)) continue;
				const nk = key(n);
				// Only traverse through occupied tiles or origins (origins may be empty but still connect)
				if (!isOriginKey(nk) && !hasAnyAt(n.q, n.r)) continue;
				if (originDistAny.has(nk)) continue;
				originDistAny.set(nk, curDist + 1);
				queue.push(n);
			}
		}
	}

	// Rim distances on the same multi-color traversable graph (used only in SHORTEST_PATH mode).
	const rimDistAny = new Map<string, number>();
	if (RULES.SCORING.SHORTEST_PATH) {
		const queue: Array<{ q: number; r: number }> = [];
		for (const c of coords) {
			if (!isRim(c.q, c.r)) continue;
			const ck = key(c);
			if (!isOriginKey(ck) && !hasAnyAt(c.q, c.r)) continue;
			if (rimDistAny.has(ck)) continue;
			rimDistAny.set(ck, 0);
			queue.push(c);
		}
		while (queue.length) {
			const cur = queue.shift()!;
			const curK = key(cur);
			const curDist = rimDistAny.get(curK) ?? 0;
			for (const n of neighbors(cur)) {
				if (!inBounds(n, radius)) continue;
				const nk = key(n);
				if (!isOriginKey(nk) && !hasAnyAt(n.q, n.r)) continue;
				if (rimDistAny.has(nk)) continue;
				rimDistAny.set(nk, curDist + 1);
				queue.push(n);
			}
		}
	}


	const intersectionCountByColor: Record<Color, number> = {
		R: 0, O: 0, Y: 0, G: 0, B: 0, V: 0,
	};

	const colors: readonly Color[] = RULES.COLORS;

	for (const color of colors) {
		// Same-color connectivity emanating from all origins.
		// Seed with all origins that have the color, and their same-color neighbors.
		// Origins can connect through each other.
		const fromOrigins = new Set<string>();
		const seed: { q: number; r: number }[] = [];
		for (const origin of G.origins) {
			if (hasColorAt(origin.q, origin.r, color)) seed.push(origin);
			for (const n of neighbors(origin)) {
				if (hasColorAt(n.q, n.r, color)) {
					// Avoid duplicates
					const nk = key(n);
					if (!seed.some((s) => key(s) === nk)) {
						seed.push(n);
					}
				}
			}
		}
		if (seed.length > 0) {
			const stack: { q: number; r: number }[] = [...seed];
			for (const s of seed) fromOrigins.add(key(s));
			while (stack.length) {
				const cur = stack.pop()!;
				for (const n of neighbors(cur)) {
					if (!hasColorAt(n.q, n.r, color)) continue;
					const nk = key(n);
					if (fromOrigins.has(nk)) continue;
					fromOrigins.add(nk);
					stack.push(n);
				}
			}
		}

		// Origin-to-origin connectivity: find tiles that connect multiple origins
		// Only count tiles that are actually on paths connecting multiple origins
		// This avoids counting unrelated tiles that happen to be in the same connected component
		const originAdjacentSets: Set<string>[] = [];
		for (const origin of G.origins) {
			const adjacentSet = new Set<string>();
			for (const n of neighbors(origin)) {
				if (hasColorAt(n.q, n.r, color)) {
					adjacentSet.add(key(n));
				}
			}
			if (adjacentSet.size > 0) {
				originAdjacentSets.push(adjacentSet);
			}
		}
		const originToOriginTiles = new Set<string>();
		let originToOriginPathCount = 0;
		if (originAdjacentSets.length >= 2) {
			if (RULES.SCORING.SHORTEST_PATH) {
				// Only count tiles on shortest paths between origins
				// For each pair of origins, find shortest path and mark tiles on it
				const originIndices: number[] = [];
				for (let i = 0; i < G.origins.length; i += 1) {
					if (hasColorAt(G.origins[i]!.q, G.origins[i]!.r, color)) {
						originIndices.push(i);
					}
				}
				
				// Compute shortest distances from each origin
				const distancesFromOrigins: Map<string, number>[] = [];
				for (const originIdx of originIndices) {
					const origin = G.origins[originIdx]!;
					const distMap = new Map<string, number>();
					const queue: Array<{ coord: { q: number; r: number }; dist: number }> = [];
					const ok = key(origin);
					distMap.set(ok, 0);
					queue.push({ coord: origin, dist: 0 });
					
					for (const n of neighbors(origin)) {
						if (hasColorAt(n.q, n.r, color)) {
							const nk = key(n);
							if (!distMap.has(nk)) {
								distMap.set(nk, 1);
								queue.push({ coord: n, dist: 1 });
							}
						}
					}
					
					while (queue.length > 0) {
						const { coord: cur, dist } = queue.shift()!;
						for (const n of neighbors(cur)) {
							if (!hasColorAt(n.q, n.r, color)) continue;
							const nk = key(n);
							if (distMap.has(nk)) continue;
							distMap.set(nk, dist + 1);
							queue.push({ coord: n, dist: dist + 1 });
						}
					}
					distancesFromOrigins.push(distMap);
				}
				
				// For each pair of origins, find tiles on shortest paths
				for (let i = 0; i < originIndices.length; i += 1) {
					for (let j = i + 1; j < originIndices.length; j += 1) {
						const distI = distancesFromOrigins[i]!;
						const distJ = distancesFromOrigins[j]!;
						const originI = G.origins[originIndices[i]!]!;
						const originJ = G.origins[originIndices[j]!]!;
						const okI = key(originI);
						const okJ = key(originJ);
						
						// Find shortest path length (in edges)
						let minPathLength = Infinity;
						for (const [tileK, distFromI] of distI) {
							const distFromJ = distJ.get(tileK);
							if (distFromJ !== undefined) {
								const pathLength = distFromI + distFromJ;
								minPathLength = Math.min(minPathLength, pathLength);
							}
						}
						
						// Mark tiles on shortest paths and accumulate path length
						if (minPathLength !== Infinity) {
							// Each connection contributes (edges - 1) scoring tiles (excluding the origins).
							if (minPathLength > 0) {
								originToOriginPathCount += Math.max(0, minPathLength - 1);
							}

							for (const [tileK, distFromI] of distI) {
								if (tileK === okI || tileK === okJ) continue;
								const distFromJ = distJ.get(tileK);
								if (distFromJ !== undefined && distFromI + distFromJ === minPathLength) {
									originToOriginTiles.add(tileK);
								}
							}
						}
					}
				}
			} else {
				// Original logic: use multi-source BFS
				// Use multi-source BFS from all origin-adjacent tiles
				// Mark which origins each tile can reach
				const tileToOrigins = new Map<string, Set<number>>();
				const queue: Array<{ tile: string; origins: Set<number> }> = [];
				
				// Initialize queue with all origin-adjacent tiles
				for (let i = 0; i < originAdjacentSets.length; i += 1) {
					for (const tileK of originAdjacentSets[i]!) {
						if (!tileToOrigins.has(tileK)) {
							tileToOrigins.set(tileK, new Set());
						}
						tileToOrigins.get(tileK)!.add(i);
						queue.push({ tile: tileK, origins: new Set([i]) });
					}
				}
				
				// BFS to propagate origin reachability
				while (queue.length > 0) {
					const { tile: curK, origins } = queue.shift()!;
					const cur = parse(curK);
					
					for (const n of neighbors(cur)) {
						if (!hasColorAt(n.q, n.r, color)) continue;
						const nk = key(n);
						if (!fromOrigins.has(nk)) continue;
						
						const nOrigins = tileToOrigins.get(nk) ?? new Set();
						const newOrigins = new Set(origins);
						let changed = false;
						for (const o of origins) {
							if (!nOrigins.has(o)) {
								nOrigins.add(o);
								changed = true;
							}
						}
						
						if (changed) {
							tileToOrigins.set(nk, nOrigins);
							if (nOrigins.size >= 2) {
								// This tile connects multiple origins
								originToOriginTiles.add(nk);
							}
							queue.push({ tile: nk, origins: nOrigins });
						}
					}
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
			const curK = key(cur);
			for (const n of neighbors(cur)) {
				if (!hasColorAt(n.q, n.r, color)) continue;
				const nk = key(n);
				if (fromRim.has(nk)) continue;
				fromRim.add(nk);
				queue.push(n);
			}
		}

		// Count intersection tiles (tiles in both fromOrigins and fromRim)
		// NEW RULE:
		// - Connectivity from origins is multi-color (occupied-graph), so the path may change colors.
		// - Only the rim-connected color segment scores: (same-color-from-rim) ∩ (any-color-from-origins).
		// Always exclude origin coordinates themselves from scoring.
		let count = 0;
		
		if (fromRim.size > 0 && originDistAny.size > 0) {
			if (RULES.SCORING.SHORTEST_PATH) {
				// Only count rim-color tiles that lie on shortest paths (in the occupied-graph)
				// from any origin to any rim node.
				const shortestPathTiles = new Set<string>();

				// Find shortest path length: min over all traversable nodes of (originDistAny + rimDistAny)
				let minPathLength = Infinity;
				for (const [kC, oDist] of originDistAny) {
					const rDist = rimDistAny.get(kC);
					if (rDist === undefined) continue;
					minPathLength = Math.min(minPathLength, oDist + rDist);
				}
				
				// Mark traversable nodes on shortest paths (originDistAny + rimDistAny = minPathLength),
				// then count only those nodes that belong to the rim-connected same-color component.
				if (minPathLength !== Infinity) {
					for (const [kC, oDist] of originDistAny) {
						if (originKeys.has(kC)) continue;
						const rDist = rimDistAny.get(kC);
						if (rDist === undefined) continue;
						if (oDist + rDist !== minPathLength) continue;
						// Exclude empty non-origin nodes (origins can be empty, but they are excluded above anyway).
						const { q, r } = parse(kC);
						if (!hasAnyAt(q, r)) continue;
						shortestPathTiles.add(kC);
					}
					for (const kC of shortestPathTiles) {
						if (!fromRim.has(kC)) continue;
						count += 1;
					}
				}
			} else {
				// Count all rim-connected same-color tiles that are connected back to any origin
				// through occupied adjacency (multi-color).
				for (const kC of fromRim) {
					if (originKeys.has(kC)) continue;
					if (!originDistAny.has(kC)) continue;
					count += 1;
				}
			}
		}
		
		// Origin-to-origin connections.
		// If ORIGIN_TO_ORIGIN is enabled, count these in addition to origin-to-rim connections.
		if (RULES.SCORING.ORIGIN_TO_ORIGIN) {
			if (RULES.SCORING.SHORTEST_PATH) {
				// Under SHORTEST_PATH, score by number of tiles on shortest paths between each origin pair.
				count += originToOriginPathCount;
			} else if (originToOriginTiles.size > 0) {
				// Legacy behaviour: score by distinct tiles that connect multiple origins, avoiding double-counting
				// tiles that are already part of origin-to-rim intersections.
				const originToOriginReachingRim = new Set<string>();
				if (fromRim.size > 0) {
					for (const kC of originToOriginTiles) {
						if (fromRim.has(kC)) {
							originToOriginReachingRim.add(kC);
						}
					}
				}

				for (const kC of originToOriginTiles) {
					// Skip origin coordinates
					if (originKeys.has(kC)) continue;
					// Skip tiles already counted as intersection tiles
					if (originToOriginReachingRim.has(kC)) continue;
					count += 1;
				}
			}
		}
		
		intersectionCountByColor[color] = count;
	}

	const scores: Record<string, number> = {};
	const [primaryWeight, secondaryWeight, tertiaryWeight] = RULES.SCORING.COLOR_POINTS;
	for (const pid of Object.keys(G.prefs)) {
		scores[pid] = 0;
		const { primary, secondary, tertiary } = G.prefs[pid]!;
		scores[pid] += primaryWeight * intersectionCountByColor[primary];
		scores[pid] += secondaryWeight * intersectionCountByColor[secondary];
		scores[pid] += tertiaryWeight * intersectionCountByColor[tertiary];
	}
	return scores;
};


