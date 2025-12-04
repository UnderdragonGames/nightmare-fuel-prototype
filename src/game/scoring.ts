import type { GState, Color } from './types';
import { buildAllCoords, key, neighbors, ringIndex, parse } from './helpers';
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

		// Compute shortest distances from origins (for shortest path calculation)
		const originDistances = new Map<string, number>();
		if (RULES.SCORING.SHORTEST_PATH && fromOrigins.size > 0) {
			const originQueue: Array<{ coord: { q: number; r: number }; dist: number }> = [];
			for (const origin of G.origins) {
				if (hasColorAt(origin.q, origin.r, color)) {
					const ok = key(origin);
					originDistances.set(ok, 0);
					originQueue.push({ coord: origin, dist: 0 });
				}
				for (const n of neighbors(origin)) {
					if (hasColorAt(n.q, n.r, color)) {
						const nk = key(n);
						if (!originDistances.has(nk)) {
							originDistances.set(nk, 1);
							originQueue.push({ coord: n, dist: 1 });
						}
					}
				}
			}
			while (originQueue.length > 0) {
				const { coord: cur, dist } = originQueue.shift()!;
				for (const n of neighbors(cur)) {
					if (!hasColorAt(n.q, n.r, color)) continue;
					const nk = key(n);
					if (originDistances.has(nk)) continue;
					originDistances.set(nk, dist + 1);
					originQueue.push({ coord: n, dist: dist + 1 });
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
		const rimDistances = new Map<string, number>();
		const queue: { q: number; r: number }[] = [];
		for (const c of coords) {
			if (!isRim(c.q, c.r)) continue;
			if (!hasColorAt(c.q, c.r, color)) continue;
			const ck = key(c);
			if (!fromRim.has(ck)) {
				fromRim.add(ck);
				if (RULES.SCORING.SHORTEST_PATH) {
					rimDistances.set(ck, 0);
				}
				queue.push(c);
			}
		}
		while (queue.length) {
			const cur = queue.shift()!;
			const curK = key(cur);
			const curDist = rimDistances.get(curK) ?? 0;
			for (const n of neighbors(cur)) {
				if (!hasColorAt(n.q, n.r, color)) continue;
				const nk = key(n);
				if (fromRim.has(nk)) continue;
				fromRim.add(nk);
				if (RULES.SCORING.SHORTEST_PATH) {
					rimDistances.set(nk, curDist + 1);
				}
				queue.push(n);
			}
		}

		// Count intersection tiles (tiles in both fromOrigins and fromRim)
		// Each tile counts individually, but exclude origin coordinates themselves
		// Being in both sets means there's a path from origin to rim through that tile
		const originKeys = new Set(G.origins.map((o) => key(o)));
		let count = 0;
		
		if (fromOrigins.size > 0 && fromRim.size > 0) {
			if (RULES.SCORING.SHORTEST_PATH) {
				// Only count tiles on shortest paths from origins to rim tiles
				// Find the overall shortest path length from any origin to any rim tile
				// Then count tiles where originDist + rimDist = shortestPathLength
				const shortestPathTiles = new Set<string>();
				
				// Find shortest path length: min over all tiles of (originDist + rimDist)
				let minPathLength = Infinity;
				for (const kC of fromOrigins) {
					if (originKeys.has(kC)) continue;
					if (!fromRim.has(kC)) continue;
					const originDist = originDistances.get(kC) ?? Infinity;
					const rimDist = rimDistances.get(kC) ?? Infinity;
					if (originDist !== Infinity && rimDist !== Infinity) {
						minPathLength = Math.min(minPathLength, originDist + rimDist);
					}
				}
				
				// Count tiles that are on shortest paths (originDist + rimDist = minPathLength)
				if (minPathLength !== Infinity) {
					for (const kC of fromOrigins) {
						if (originKeys.has(kC)) continue;
						if (!fromRim.has(kC)) continue;
						const originDist = originDistances.get(kC) ?? Infinity;
						const rimDist = rimDistances.get(kC) ?? Infinity;
						if (originDist + rimDist === minPathLength) {
							shortestPathTiles.add(kC);
						}
					}
					count = shortestPathTiles.size;
				}
			} else {
				// Original logic: count all tiles in intersection
				for (const kC of fromOrigins) {
					// Skip origin coordinates - they can't be placed on and shouldn't score
					if (originKeys.has(kC)) continue;
					if (fromRim.has(kC)) {
						count += 1;
					}
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
	for (const pid of Object.keys(G.prefs)) {
		scores[pid] = 0;
		const { primary, secondary, tertiary } = G.prefs[pid]!;
		scores[pid] += 3 * intersectionCountByColor[primary];
		scores[pid] += 2 * intersectionCountByColor[secondary];
		scores[pid] += 1 * intersectionCountByColor[tertiary];
	}
	return scores;
};


