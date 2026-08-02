import { describe, it, expect } from 'vitest';
import type { Ctx } from 'boardgame.io';
import { HexStringsGame } from '../game/game';
import { NIGHTMARE_ACTIONS_BY_NAME } from '../game/nightmareActions';
import { NIGHTMARES } from '../game/nightmares';
import type { Co, GState, MoveUseAbilityArgs, PathLane } from '../game/types';

type MoveFn = (context: { G: GState; ctx: Ctx }, args?: MoveUseAbilityArgs) => unknown;
const stages = (HexStringsGame.turn as unknown as {
	stages: Record<string, { moves: Record<string, { move: MoveFn; undoable?: boolean }> }>;
}).stages;
const useAbility = stages.active!.moves.useNightmareAbility!;

const makeCtx = (currentPlayer = '0'): Ctx =>
	({ currentPlayer, playOrder: ['0', '1'], numPlayers: 2, turn: 3 }) as unknown as Ctx;

const setupWith = (nightmare: string, lanes: PathLane[] = []): GState => {
	const G = (HexStringsGame.setup as (c: { ctx: Ctx }) => GState)({ ctx: makeCtx() });
	const p = G.players['0']!;
	const def = NIGHTMARES.find((n) => n.name === nightmare)!;
	p.nightmare = nightmare;
	p.nightmareState = { abilityUsesRemaining: def.ability.uses, handSizeBonus: 0 };
	G.lanes = lanes;
	return G;
};

const lane = (fq: number, fr: number, tq: number, tr: number, color: PathLane['color']): PathLane => ({
	from: { q: fq, r: fr },
	to: { q: tq, r: tr },
	color,
});

const cast = (G: GState, args: MoveUseAbilityArgs = {}): void => {
	useAbility.move({ G, ctx: makeCtx() }, args);
};

describe('nightmare abilities', () => {
	it('every nightmare has a mapped, non-empty action list', () => {
		for (const n of NIGHTMARES) {
			expect(NIGHTMARE_ACTIONS_BY_NAME[n.name], n.name).toBeDefined();
			expect(NIGHTMARE_ACTIONS_BY_NAME[n.name]!.length, n.name).toBeGreaterThan(0);
		}
	});

	it('is not undoable and consumes a use', () => {
		expect(useAbility.undoable).toBe(false);
		const G = setupWith('Cultist');
		cast(G);
		expect(G.players['0']!.nightmareState.abilityUsesRemaining).toBe(1);
	});

	it('does nothing with zero uses remaining', () => {
		const G = setupWith('Cultist');
		G.players['0']!.nightmareState.abilityUsesRemaining = 0;
		const handBefore = G.players['0']!.hand.length;
		cast(G);
		expect(G.players['0']!.hand.length).toBe(handBefore);
	});

	it('Cultist draws 3', () => {
		const G = setupWith('Cultist');
		const before = G.players['0']!.hand.length;
		cast(G);
		expect(G.players['0']!.hand.length).toBe(before + 3);
	});

	it('Blob fills the treasure pile to max', () => {
		const G = setupWith('Blob');
		cast(G);
		expect(G.treasure.length).toBe(G.rules.TREASURE_MAX);
	});

	it('Alien permutes the color directions', () => {
		const G = setupWith('Alien');
		const before = [...G.rules.EDGE_COLORS];
		cast(G);
		expect([...G.rules.EDGE_COLORS].sort()).toEqual([...before].sort());
		expect(Object.keys(G.rules.COLOR_TO_DIR).sort()).toEqual([...before].sort());
	});

	it('Robot swaps secondary and tertiary priorities', () => {
		const G = setupWith('Robot');
		const { secondary, tertiary } = G.players['0']!.prefs;
		cast(G);
		expect(G.players['0']!.prefs.secondary).toBe(tertiary);
		expect(G.players['0']!.prefs.tertiary).toBe(secondary);
	});

	it('Zombie raises hand size for future refills', () => {
		const G = setupWith('Zombie');
		cast(G);
		expect(G.players['0']!.nightmareState.handSizeBonus).toBe(1);
	});

	it('Vampire steals a card from the target (and needs a valid target)', () => {
		const G = setupWith('Vampire');
		const mine = G.players['0']!.hand.length;
		const theirs = G.players['1']!.hand.length;
		expect(theirs).toBeGreaterThan(0);
		cast(G, {}); // no target: rejected, no use consumed
		expect(G.players['0']!.nightmareState.abilityUsesRemaining).toBe(2);
		cast(G, { targetPlayerId: '1' });
		expect(G.players['0']!.hand.length).toBe(mine + 1);
		expect(G.players['1']!.hand.length).toBe(theirs - 1);
		expect(G.players['0']!.nightmareState.abilityUsesRemaining).toBe(1);
	});

	it('Demon destroys the whole connected path at a node', () => {
		const G = setupWith('Demon', [
			lane(0, 1, 0, 2, 'G'),
			lane(0, 2, 0, 3, 'G'),
			lane(2, -2, 3, -3, 'B'), // separate path survives
		]);
		cast(G, { coord: { q: 0, r: 2 } });
		expect(G.lanes.length).toBe(1);
		expect(G.lanes[0]!.color).toBe('B');
	});

	it('Ghost removes a single lane picked by edge', () => {
		const G = setupWith('Ghost', [lane(0, 1, 0, 2, 'G'), lane(0, 2, 0, 3, 'G')]);
		cast(G, { laneIndex: 0 });
		expect(G.lanes.length).toBe(1);
	});

	it('Mutant recolors a lane', () => {
		const G = setupWith('Mutant', [lane(0, 1, 0, 2, 'G')]);
		cast(G, { laneIndex: 0, color: 'R' });
		expect(G.lanes[0]!.color).toBe('R');
		// same-color change is rejected without consuming a use
		cast(G, { laneIndex: 0, color: 'R' });
		expect(G.players['0']!.nightmareState.abilityUsesRemaining).toBe(1);
	});

	it('Witch destroys a node: incident lanes removed, tile dead', () => {
		const G = setupWith('Witch', [lane(0, 1, 0, 2, 'G'), lane(0, 2, 0, 3, 'G')]);
		cast(G, { coord: { q: 0, r: 2 } });
		expect(G.lanes.length).toBe(0);
		expect(G.board['0,2']!.dead).toBe(true);
	});

	it('Dragon/Werewolf place a free lane (direction-colored, validated, no card spent)', () => {
		for (const name of ['Dragon', 'Werewolf'] as const) {
			const G = setupWith(name, [lane(0, 1, 0, 2, 'G')]);
			// find the legal direction from (0,2) — color implied by direction
			const dirEntries = Object.entries(G.rules.COLOR_TO_DIR);
			let placed = false;
			for (const [, dir] of dirEntries) {
				const dest: Co = { q: 0 + dir.q, r: 2 + dir.r };
				const handBefore = G.players['0']!.hand.length;
				const lanesBefore = G.lanes.length;
				cast(G, { source: { q: 0, r: 2 }, coord: dest });
				if (G.lanes.length === lanesBefore + 1) {
					expect(G.players['0']!.hand.length).toBe(handBefore); // no card spent
					placed = true;
					break;
				}
			}
			expect(placed, name).toBe(true);
		}
	});

	it('invalid coord for Demon leaves the charge intact', () => {
		const G = setupWith('Demon', [lane(0, 1, 0, 2, 'G')]);
		cast(G, { coord: { q: 4, r: -4 } }); // no lanes there
		expect(G.players['0']!.nightmareState.abilityUsesRemaining).toBe(1);
		expect(G.lanes.length).toBe(1);
	});
});
