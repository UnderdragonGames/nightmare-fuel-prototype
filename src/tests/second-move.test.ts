import { describe, it, expect } from 'vitest';
import { enumerateActions, type Action } from '../game/ai';
import type { GState } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { makeCard } from '../game/cardFactory';
import { initActionState } from '../game/effects';

const EDGE_COLORS = ['Y', 'G', 'B', 'V', 'R', 'O'] as const;

const rules = {
  ...MODE_RULESETS.path,
  RADIUS: 3,
  RANDOM_CARDINAL_DIRECTIONS: false,
  EDGE_COLORS,
  COLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
};

const G: GState = {
  rules,
  radius: rules.RADIUS,
  board: {},
  lanes: [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' }],
  deck: [],
  discard: [],
  hands: { '0': [makeCard(['B', 'O', 'G'])] },
  treasure: [],
  prefs: {},
  nightmares: {},
  nightmareState: {},
  stats: { placements: 0 },
  meta: { deckExhaustionCycle: null, stashBonus: {}, actionPlaysThisTurn: {} },
  origins: [{ q: 0, r: 0 }],
  action: initActionState(['0']),
};

const actionKey = (a: Action): string => {
  switch (a.type) {
    case 'playCard': {
      const args = a.args;
      if ('source' in args) {
        return `play:${args.handIndex}:${args.pick}:${args.source.q},${args.source.r}->${args.coord.q},${args.coord.r}`;
      }
      return `play:${args.handIndex}:${args.pick}:${args.coord.q},${args.coord.r}`;
    }
    case 'rotateTile':
      return `rotate:${a.args.handIndex}:${a.args.coord.q},${a.args.coord.r}:${a.args.rotation}`;
    case 'stashToTreasure':
      return `stash:${a.args.handIndex}`;
    case 'takeFromTreasure':
      return `take:${a.args.index}`;
    case 'endTurnAndRefill':
      return 'end';
  }
};

describe('second-move', () => {
  it('matches expected actions', () => {
    const actual = enumerateActions(G, '0').map(actionKey).sort();
    const expected = [
      "play:0:B:0,0->1,0",
      "play:0:B:1,0->2,0",
      "play:0:O:0,0->-1,0",
      "play:0:G:0,0->1,-1",
      "play:0:G:1,0->2,-1",
      "stash:0",
      "end"
    ];
    expect(actual).toEqual([...expected].sort());
    const forbidden: string[] = [];
    for (const key of forbidden) expect(actual).not.toContain(key);
  });
});
