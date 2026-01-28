import { describe, it, expect } from 'vitest';
import { enumerateActions, type Action } from '../game/ai';
import type { GState } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';

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
  lanes: [{ from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, color: 'B' }, { from: { q: 1, r: 0 }, to: { q: 2, r: 0 }, color: 'B' }, { from: { q: 2, r: 0 }, to: { q: 3, r: 0 }, color: 'B' }, { from: { q: 0, r: 0 }, to: { q: -1, r: 0 }, color: 'O' }, { from: { q: -1, r: 0 }, to: { q: -2, r: 0 }, color: 'O' }, { from: { q: -2, r: 0 }, to: { q: -3, r: 0 }, color: 'O' }, { from: { q: 0, r: 0 }, to: { q: -1, r: 0 }, color: 'O' }, { from: { q: 0, r: 0 }, to: { q: -1, r: 0 }, color: 'O' }, { from: { q: -1, r: 0 }, to: { q: -2, r: 0 }, color: 'O' }, { from: { q: 0, r: 0 }, to: { q: 1, r: -1 }, color: 'G' }, { from: { q: 1, r: -1 }, to: { q: 2, r: -2 }, color: 'G' }, { from: { q: 2, r: -2 }, to: { q: 3, r: -3 }, color: 'G' }, { from: { q: 0, r: 0 }, to: { q: 1, r: -1 }, color: 'G' }],
  deck: [],
  discard: [],
  hands: { '0': [{ colors: ['B', 'O', 'G'] }] },
  treasure: [],
  prefs: {},
  stats: { placements: 0 },
  meta: { deckExhaustionCycle: null, stashBonus: {} },
  origins: [{ q: 0, r: 0 }],
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

describe('support', () => {
  it('matches expected actions', () => {
    const actual = enumerateActions(G, '0').map(actionKey).sort();
    const expected = [
      "play:0:B:0,0->1,0",
      "play:0:B:1,-1->2,-1",
      "play:0:G:-1,0->0,-1",
      "play:0:G:-2,0->-1,-1",
      "play:0:G:0,0->1,-1",
      "play:0:G:1,-1->2,-2",
      "play:0:O:-1,0->-2,0",
      "play:0:O:-2,0->-3,0",
      "play:0:O:1,-1->0,-1",
      "stash:0",
      "end"
    ];
    expect(actual).toEqual([...expected].sort());
    const forbidden = [];
    for (const key of forbidden) expect(actual).not.toContain(key);
  });
});
