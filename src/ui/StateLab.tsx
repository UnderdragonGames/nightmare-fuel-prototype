import React from 'react';
import type { PlayerID } from 'boardgame.io';
import type { Action } from '../game/ai';
import { applyMicroAction, enumerateActions } from '../game/ai';
import type { Card, Co, Color, GState, Rules } from '../game/types';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { Board } from './Board';
import { asVisibleColor, key, neighbors } from '../game/helpers';
import { computeScoresRaw } from '../game/scoring';

type EditMode = 'origin' | 'hex' | 'path';
type HexTool = 'add' | 'remove' | 'clear' | 'rotate';
type PathTool = 'add' | 'remove';

type IllegalForm =
	| { type: 'playCard'; handIndex: number; pick: Color; coord: string; source: string }
	| { type: 'rotateTile'; handIndex: number; coord: string; rotation: number }
	| { type: 'stashToTreasure'; handIndex: number }
	| { type: 'takeFromTreasure'; index: number }
	| { type: 'endTurnAndRefill' };

type AllowedForm = IllegalForm;

const COLOR_ORDER: Color[] = ['R', 'O', 'Y', 'G', 'B', 'V'];

const ColorPicker: React.FC<{
	value: Color;
	onChange: (c: Color) => void;
}> = ({ value, onChange }) => (
	<div className="state-lab__color-picker">
		{COLOR_ORDER.map((c) => (
			<button
				key={c}
				type="button"
				className={`state-lab__color-dot ${value === c ? 'state-lab__color-dot--active' : ''}`}
				onClick={() => onChange(c)}
				style={{ background: asVisibleColor(c) }}
				aria-label={`Select ${c}`}
				title={c}
			/>
		))}
	</div>
);

const GoalPicker: React.FC<{
	value: { primary: Color; secondary: Color; tertiary: Color };
	onChange: (next: { primary: Color; secondary: Color; tertiary: Color }) => void;
}> = ({ value, onChange }) => (
	<div className="state-lab__goal-picker">
		<div className="state-lab__goal-row">
			<span>Primary</span>
			<ColorPicker value={value.primary} onChange={(primary) => onChange({ ...value, primary })} />
		</div>
		<div className="state-lab__goal-row">
			<span>Secondary</span>
			<ColorPicker value={value.secondary} onChange={(secondary) => onChange({ ...value, secondary })} />
		</div>
		<div className="state-lab__goal-row">
			<span>Tertiary</span>
			<ColorPicker value={value.tertiary} onChange={(tertiary) => onChange({ ...value, tertiary })} />
		</div>
	</div>
);

const parseColors = (value: string): Color[] => {
	const raw = value.toUpperCase().replace(/[^ROYGBV]/g, '');
	return raw.split('').filter((c) => COLOR_ORDER.includes(c as Color)) as Color[];
};

const parseCoord = (value: string): Co | null => {
	const match = value.trim().match(/^(-?\d+)\s*,\s*(-?\d+)$/);
	if (!match) return null;
	return { q: Number(match[1]), r: Number(match[2]) };
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

const actionToLabel = (a: Action): string => {
	switch (a.type) {
		case 'playCard':
			if ('source' in a.args) {
				return `play card ${a.args.handIndex} as ${a.args.pick} from (${a.args.source.q},${a.args.source.r}) to (${a.args.coord.q},${a.args.coord.r})`;
			}
			return `play card ${a.args.handIndex} as ${a.args.pick} at (${a.args.coord.q},${a.args.coord.r})`;
		case 'rotateTile':
			return `rotate (${a.args.coord.q},${a.args.coord.r}) by ${a.args.rotation}`;
		case 'stashToTreasure':
			return `stash card ${a.args.handIndex}`;
		case 'takeFromTreasure':
			return `take treasure ${a.args.index}`;
		case 'endTurnAndRefill':
			return 'end turn & refill';
	}
};

const serializeBoard = (board: Record<string, { colors: Color[]; rotation: number }>): string => {
	const entries = Object.entries(board);
	if (entries.length === 0) return '{}';
	const lines = entries.map(([k, tile]) =>
		`\t\t"${k}": { colors: [${tile.colors.map((c) => `'${c}'`).join(', ')}], rotation: ${tile.rotation} }`
	);
	return `{\n${lines.join(',\n')}\n\t}`;
};

const serializeCoords = (coords: Co[]): string =>
	`[${coords.map((c) => `{ q: ${c.q}, r: ${c.r} }`).join(', ')}]`;

const serializeCards = (cards: Card[]): string =>
	`[${cards.map((c) => `{ colors: [${c.colors.map((col) => `'${col}'`).join(', ')}] }`).join(', ')}]`;

const serializeLanes = (lanes: { from: Co; to: Co; color: Color }[]): string =>
	`[${lanes.map((l) => `{ from: { q: ${l.from.q}, r: ${l.from.r} }, to: { q: ${l.to.q}, r: ${l.to.r} }, color: '${l.color}' }`).join(', ')}]`;

const buildRules = (mode: 'hex' | 'path', radius: number, edgeColors: string): Rules => {
	const base = MODE_RULESETS[mode];
	const parsed = parseColors(edgeColors);
	const edge = parsed.length === 6 ? parsed : (base.EDGE_COLORS as Color[]);
	return {
		...base,
		RADIUS: radius,
		EDGE_COLORS: edge,
		RANDOM_CARDINAL_DIRECTIONS: false,
		COLOR_TO_DIR: buildColorToDir(edge),
	};
};

export const StateLab: React.FC<{ onExit: () => void }> = ({ onExit }) => {
	const [mode, setMode] = React.useState<'hex' | 'path'>(MODE_RULESETS.path.MODE);
	const [radius, setRadius] = React.useState(3);
	const [edgeColors, setEdgeColors] = React.useState((MODE_RULESETS.path.EDGE_COLORS as Color[]).join(''));
	const [title, setTitle] = React.useState('enumerate-actions');
	const [playerID, setPlayerID] = React.useState<PlayerID>('0');
	const [goalPrefs, setGoalPrefs] = React.useState<{ primary: Color; secondary: Color; tertiary: Color }>({
		primary: 'R',
		secondary: 'O',
		tertiary: 'Y',
	});
	const [editMode, setEditMode] = React.useState<EditMode>('path');
	const [hexTool, setHexTool] = React.useState<HexTool>('add');
	const [pathTool, setPathTool] = React.useState<PathTool>('add');
	const [selectedColor, setSelectedColor] = React.useState<Color>('B');
	const [rotationValue, setRotationValue] = React.useState(0);
	const [pendingSource, setPendingSource] = React.useState<Co | null>(null);
	const [extraAllowed, setExtraAllowed] = React.useState<string[]>([]);
	const [excludedAllowed, setExcludedAllowed] = React.useState<Set<string>>(new Set());
	const [expectedIllegal, setExpectedIllegal] = React.useState<string[]>([]);
	const [expectedScores, setExpectedScores] = React.useState<Record<string, number>>({});
	const [allowedForm, setAllowedForm] = React.useState<AllowedForm>({
		type: 'playCard',
		handIndex: 0,
		pick: 'B',
		coord: '0,0',
		source: '0,0',
	});
	const [illegalForm, setIllegalForm] = React.useState<IllegalForm>({
		type: 'playCard',
		handIndex: 0,
		pick: 'B',
		coord: '0,0',
		source: '0,0',
	});
	const [createStatus, setCreateStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const [createMessage, setCreateMessage] = React.useState<string | null>(null);

	const rules = React.useMemo(() => buildRules(mode, radius, edgeColors), [mode, radius, edgeColors]);

	const [G, setG] = React.useState<GState>(() => ({
		rules,
		radius: rules.RADIUS,
		board: {},
		lanes: [],
		deck: [],
		discard: [],
		hands: { '0': [{ colors: ['B', 'O'] }] },
		treasure: [],
		prefs: {},
		stats: { placements: 0 },
		meta: { deckExhaustionCycle: null, stashBonus: {} },
		origins: [{ q: 0, r: 0 }],
	}));

	React.useEffect(() => {
		setG((prev) => ({
			...prev,
			rules,
			radius: rules.RADIUS,
		}));
	}, [rules]);

	React.useEffect(() => {
		setG((prev) => ({
			...prev,
			prefs: { ...prev.prefs, [playerID]: goalPrefs },
		}));
	}, [goalPrefs, playerID]);

	React.useEffect(() => {
		setEditMode(mode === 'path' ? 'path' : 'hex');
		setPendingSource(null);
	}, [mode]);

	React.useEffect(() => {
		setEdgeColors((MODE_RULESETS[mode].EDGE_COLORS as Color[]).join(''));
	}, [mode]);

	const hand = G.hands[playerID] ?? [];
	const highlightCoords = React.useMemo(() => {
		if (mode !== 'path' || editMode !== 'path' || !pendingSource) return [];
		return neighbors(pendingSource);
	}, [mode, editMode, pendingSource]);

	const updateHand = (next: Card[]) => {
		setG((prev) => ({
			...prev,
			hands: { ...prev.hands, [playerID]: next },
		}));
	};

	const updateTreasure = (next: Card[]) => {
		setG((prev) => ({
			...prev,
			treasure: next,
		}));
	};

	const toggleOrigin = (coord: Co) => {
		setG((prev) => {
			const exists = prev.origins.some((o) => o.q === coord.q && o.r === coord.r);
			const origins = exists
				? prev.origins.filter((o) => !(o.q === coord.q && o.r === coord.r))
				: [...prev.origins, coord];
			return { ...prev, origins };
		});
	};

	const updateHexTile = (coord: Co) => {
		setG((prev) => {
			const nextBoard = { ...prev.board };
			const k = key(coord);
			const tile = nextBoard[k];

			if (hexTool === 'clear') {
				delete nextBoard[k];
				return { ...prev, board: nextBoard };
			}

			if (hexTool === 'rotate') {
				if (!tile) return prev;
				nextBoard[k] = { ...tile, rotation: ((rotationValue % 6) + 6) % 6 };
				return { ...prev, board: nextBoard };
			}

			const colors = tile ? [...tile.colors] : [];
			const has = colors.includes(selectedColor);

			if (hexTool === 'add' && !has) colors.push(selectedColor);
			if (hexTool === 'remove' && has) {
				const idx = colors.indexOf(selectedColor);
				if (idx >= 0) colors.splice(idx, 1);
			}

			if (colors.length === 0) {
				delete nextBoard[k];
			} else {
				nextBoard[k] = { colors, rotation: tile?.rotation ?? 0 };
			}

			return { ...prev, board: nextBoard };
		});
	};

	const updatePathLane = (coord: Co) => {
		if (!pendingSource) {
			setPendingSource(coord);
			return;
		}

		if (key(coord) === key(pendingSource)) {
			setPendingSource(null);
			return;
		}

		const isNeighbor = neighbors(pendingSource).some((n) => n.q === coord.q && n.r === coord.r);
		if (!isNeighbor) {
			setPendingSource(coord);
			return;
		}

		setG((prev) => {
			const nextLanes = [...prev.lanes];
			const matching = nextLanes.filter(
				(l) => l.from.q === pendingSource.q && l.from.r === pendingSource.r
					&& l.to.q === coord.q && l.to.r === coord.r
					&& l.color === selectedColor
			);
			const maxPerEdge = prev.rules.PLACEMENT.MAX_LANES_PER_PATH;

			if (pathTool === 'add') {
				if (matching.length < maxPerEdge) {
					nextLanes.push({ from: pendingSource, to: coord, color: selectedColor });
				}
			}
			if (pathTool === 'remove') {
				const lastIndex = nextLanes.findLastIndex(
					(l) => l.from.q === pendingSource.q && l.from.r === pendingSource.r
						&& l.to.q === coord.q && l.to.r === coord.r
						&& l.color === selectedColor
				);
				if (lastIndex !== -1) nextLanes.splice(lastIndex, 1);
			}

			return { ...prev, lanes: nextLanes };
		});
		setPendingSource(null);
	};

	const onHexClick = (coord: Co) => {
		if (editMode === 'origin') {
			toggleOrigin(coord);
			return;
		}
		if (mode === 'hex' && editMode === 'hex') {
			updateHexTile(coord);
			return;
		}
		if (mode === 'path' && editMode === 'path') {
			updatePathLane(coord);
		}
	};

	const actions = React.useMemo(() => enumerateActions(G, playerID), [G, playerID]);
	const actionKeys = React.useMemo(() => actions.map(actionKey), [actions]);
	const scoresBefore = React.useMemo(() => computeScoresRaw(G), [G]);
	const scoreDeltaByAction = React.useMemo(() => {
		const deltas: Record<string, number> = {};
		for (const action of actions) {
			const keyValue = actionKey(action);
			const next = applyMicroAction(G, action, playerID);
			if (!next) continue;
			const scoresAfter = computeScoresRaw(next);
			deltas[keyValue] = (scoresAfter[playerID] ?? 0) - (scoresBefore[playerID] ?? 0);
		}
		return deltas;
	}, [actions, G, playerID, scoresBefore]);

	const buildActionKey = (form: AllowedForm | IllegalForm): string | null => {
		switch (form.type) {
			case 'playCard': {
				const coord = parseCoord(form.coord);
				if (!coord) return null;
				if (mode === 'path') {
					const source = parseCoord(form.source);
					if (!source) return null;
					return actionKey({
						type: 'playCard',
						args: { handIndex: form.handIndex, pick: form.pick, source, coord },
					});
				}
				return actionKey({
					type: 'playCard',
					args: { handIndex: form.handIndex, pick: form.pick, coord },
				});
			}
			case 'rotateTile': {
				const coord = parseCoord(form.coord);
				if (!coord) return null;
				return actionKey({
					type: 'rotateTile',
					args: { handIndex: form.handIndex, coord, rotation: form.rotation },
				});
			}
			case 'stashToTreasure':
				return actionKey({ type: 'stashToTreasure', args: { handIndex: form.handIndex } });
			case 'takeFromTreasure':
				return actionKey({ type: 'takeFromTreasure', args: { index: form.index } });
			case 'endTurnAndRefill':
				return actionKey({ type: 'endTurnAndRefill' });
		}
	};

	const exportTest = React.useMemo(() => {
		const edge = parseColors(edgeColors);
		const edgeLiteral = edge.length === 6 ? edge : (rules.EDGE_COLORS as Color[]);
		const boardLiteral = serializeBoard(G.board);
		const lanesLiteral = serializeLanes(G.lanes);
		const originsLiteral = serializeCoords(G.origins);
		const handLiteral = serializeCards(hand);
		const treasureLiteral = serializeCards(G.treasure);
		const expected = Array.from(new Set(actionKeys.filter((k) => !excludedAllowed.has(k)).concat(extraAllowed)));
		const forbidden = expectedIllegal;
		const expectedScoreMap: Record<string, number> = {};
		for (const keyValue of expected) {
			if (expectedScores[keyValue] !== undefined) {
				expectedScoreMap[keyValue] = expectedScores[keyValue]!;
			}
		}

		const safeTitle = title.trim() || 'enumerate-actions';
		return `import { describe, it, expect } from 'vitest';
import { enumerateActions, type Action } from './ai';
import { applyMicroAction } from './ai';
import type { GState } from './types';
import { MODE_RULESETS, buildColorToDir } from './rulesConfig';
import { computeScoresRaw } from './scoring';

const EDGE_COLORS = [${edgeLiteral.map((c) => `'${c}'`).join(', ')}] as const;

const rules = {
\t...MODE_RULESETS.${mode},
\tRADIUS: ${rules.RADIUS},
\tRANDOM_CARDINAL_DIRECTIONS: false,
\tEDGE_COLORS,
\tCOLOR_TO_DIR: buildColorToDir(EDGE_COLORS),
};

const G: GState = {
\trules,
\tradius: rules.RADIUS,
\tboard: ${boardLiteral},
\tlanes: ${lanesLiteral},
\tdeck: [],
\tdiscard: [],
\thands: { '${playerID}': ${handLiteral} },
\ttreasure: ${treasureLiteral},
\tprefs: { '${playerID}': { primary: '${goalPrefs.primary}', secondary: '${goalPrefs.secondary}', tertiary: '${goalPrefs.tertiary}' } },
\tstats: { placements: 0 },
\tmeta: { deckExhaustionCycle: null, stashBonus: {} },
\torigins: ${originsLiteral},
};

const actionKey = (a: Action): string => {
\tswitch (a.type) {
\t\tcase 'playCard': {
\t\t\tconst args = a.args;
\t\t\tif ('source' in args) {
\t\t\t\treturn \`play:\${args.handIndex}:\${args.pick}:\${args.source.q},\${args.source.r}->\${args.coord.q},\${args.coord.r}\`;
\t\t\t}
\t\t\treturn \`play:\${args.handIndex}:\${args.pick}:\${args.coord.q},\${args.coord.r}\`;
\t\t}
\t\tcase 'rotateTile':
\t\t\treturn \`rotate:\${a.args.handIndex}:\${a.args.coord.q},\${a.args.coord.r}:\${a.args.rotation}\`;
\t\tcase 'stashToTreasure':
\t\t\treturn \`stash:\${a.args.handIndex}\`;
\t\tcase 'takeFromTreasure':
\t\t\treturn \`take:\${a.args.index}\`;
\t\tcase 'endTurnAndRefill':
\t\t\treturn 'end';
\t}
};

describe('${safeTitle.replace(/'/g, "\\'")}', () => {
\tit('matches expected actions', () => {
\t\tconst actual = enumerateActions(G, '${playerID}').map(actionKey).sort();
\t\tconst expected = ${JSON.stringify(expected, null, 2)};
\t\texpect(actual).toEqual([...expected].sort());
\t\tconst forbidden = ${JSON.stringify(forbidden, null, 2)};
\t\tfor (const key of forbidden) expect(actual).not.toContain(key);
\t});
\tit('matches expected score deltas', () => {
\t\tconst baseScores = computeScoresRaw(G);
\t\tconst expectedScores = ${JSON.stringify(expectedScoreMap, null, 2)};
\t\tfor (const action of enumerateActions(G, '${playerID}')) {
\t\t\tconst k = actionKey(action);
\t\t\tif (expectedScores[k] === undefined) continue;
\t\t\tconst next = applyMicroAction(G, action, '${playerID}');
\t\t\texpect(next).not.toBeNull();
\t\t\tconst scoresAfter = computeScoresRaw(next!);
\t\t\tconst delta = (scoresAfter['${playerID}'] ?? 0) - (baseScores['${playerID}'] ?? 0);
\t\t\texpect(delta).toBe(expectedScores[k]);
\t\t}
\t});
});`;
	}, [G, hand, actionKeys, extraAllowed, excludedAllowed, expectedIllegal, expectedScores, edgeColors, rules, mode, playerID, title, goalPrefs]);

	const slugify = (value: string): string =>
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'enumerate-actions';

	const createTestFile = async () => {
		setCreateStatus('saving');
		setCreateMessage(null);
		try {
			const filename = `state-lab.${slugify(title)}.test.ts`;
			if ('showDirectoryPicker' in window) {
				const dirHandle = await (window as Window & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
				const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
				const writable = await fileHandle.createWritable();
				await writable.write(exportTest);
				await writable.close();
				setCreateStatus('saved');
				setCreateMessage(`Saved ${filename} in the selected folder.`);
				return;
			}

			const blob = new Blob([exportTest], { type: 'text/plain' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			setCreateStatus('saved');
			setCreateMessage(`Downloaded ${filename}. Move it into src/game/.`);
		} catch (err) {
			setCreateStatus('error');
			setCreateMessage(err instanceof Error ? err.message : 'Failed to create file.');
		}
	};

	return (
		<div className="state-lab">
			<header className="state-lab__header">
				<div className="state-lab__title">
					<strong>State Lab</strong>
					<span>Build a GState + expected moves</span>
				</div>
				<button className="state-lab__exit" onClick={onExit}>Exit Lab</button>
			</header>
			<div className="state-lab__body">
				<aside className="state-lab__sidebar">
					<section className="state-lab__section">
						<h3>Ruleset</h3>
						<div className="state-lab__row">
							<label>Title</label>
							<input
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="enumerate-actions"
							/>
						</div>
						<div className="state-lab__row">
							<label>Mode</label>
							<select value={mode} onChange={(e) => setMode(e.target.value as 'hex' | 'path')}>
								<option value="path">path</option>
								<option value="hex">hex</option>
							</select>
						</div>
						<div className="state-lab__row">
							<label>Radius</label>
							<input
								type="number"
								min={1}
								max={8}
								value={radius}
								onChange={(e) => setRadius(Number(e.target.value) || 1)}
							/>
						</div>
						<div className="state-lab__row">
							<label>Edge colors</label>
							<input
								type="text"
								value={edgeColors}
								onChange={(e) => setEdgeColors(e.target.value.toUpperCase())}
								maxLength={6}
							/>
						</div>
						<div className="state-lab__divider">
							<span>Overrides</span>
						</div>
						<div className="state-lab__note">No overrides set.</div>
						<div className="state-lab__row">
							<label>Player ID</label>
							<input value={playerID} onChange={(e) => setPlayerID(e.target.value as PlayerID)} />
						</div>
					</section>

					<section className="state-lab__section">
						<h3>Scoring</h3>
						<div className="state-lab__note">Goal priorities for score deltas.</div>
						<GoalPicker value={goalPrefs} onChange={setGoalPrefs} />
					</section>

					<section className="state-lab__section">
						<h3>Board Tool</h3>
						<div className="state-lab__row">
							<label>Tool</label>
							<select value={editMode} onChange={(e) => setEditMode(e.target.value as EditMode)}>
								{mode === 'path' && <option value="path">path lanes</option>}
								{mode === 'hex' && <option value="hex">hex tiles</option>}
								<option value="origin">origins</option>
							</select>
						</div>
						{editMode === 'hex' && (
							<>
								<div className="state-lab__row">
									<label>Hex tool</label>
									<select value={hexTool} onChange={(e) => setHexTool(e.target.value as HexTool)}>
										<option value="add">add color</option>
										<option value="remove">remove color</option>
										<option value="clear">clear tile</option>
										<option value="rotate">set rotation</option>
									</select>
								</div>
								<div className="state-lab__row">
									<label>Color</label>
									<ColorPicker value={selectedColor} onChange={setSelectedColor} />
								</div>
								{hexTool === 'rotate' && (
									<div className="state-lab__row">
										<label>Rotation</label>
										<input
											type="number"
											min={0}
											max={5}
											value={rotationValue}
											onChange={(e) => setRotationValue(Number(e.target.value) || 0)}
										/>
									</div>
								)}
							</>
						)}
						{editMode === 'path' && (
							<>
								<div className="state-lab__row">
									<label>Path tool</label>
									<select value={pathTool} onChange={(e) => setPathTool(e.target.value as PathTool)}>
										<option value="add">add lane</option>
										<option value="remove">remove lane</option>
									</select>
								</div>
								<div className="state-lab__row">
									<label>Color</label>
									<ColorPicker value={selectedColor} onChange={setSelectedColor} />
								</div>
								{pendingSource && (
									<div className="state-lab__note">Source set: ({pendingSource.q},{pendingSource.r}) → click destination</div>
								)}
							</>
						)}
						{editMode === 'origin' && (
							<div className="state-lab__note">Click to toggle origin coordinates.</div>
						)}
						<div className="state-lab__row state-lab__row--actions">
							<button
								onClick={() => {
									setG((prev) => ({ ...prev, board: {}, lanes: [] }));
									setPendingSource(null);
								}}
							>
								Clear Board
							</button>
							<button
								onClick={() => setG((prev) => ({ ...prev, origins: [] }))}
							>
								Clear Origins
							</button>
						</div>
					</section>

					<section className="state-lab__section">
						<h3>Hand</h3>
						<div className="state-lab__stack">
							{hand.map((card, i) => (
								<div key={`hand-${i}`} className="state-lab__row">
									<input
										value={card.colors.join('')}
										onChange={(e) => {
											const next = [...hand];
											next[i] = { colors: parseColors(e.target.value) };
											updateHand(next);
										}}
									/>
									<button
										onClick={() => {
											const next = [...hand];
											next.splice(i, 1);
											updateHand(next);
										}}
									>
										Remove
									</button>
								</div>
							))}
							<button onClick={() => updateHand([...hand, { colors: ['B'] }])}>Add Card</button>
						</div>
					</section>

					<section className="state-lab__section">
						<h3>Treasure</h3>
						<div className="state-lab__stack">
							{G.treasure.map((card, i) => (
								<div key={`treasure-${i}`} className="state-lab__row">
									<input
										value={card.colors.join('')}
										onChange={(e) => {
											const next = [...G.treasure];
											next[i] = { colors: parseColors(e.target.value) };
											updateTreasure(next);
										}}
									/>
									<button
										onClick={() => {
											const next = [...G.treasure];
											next.splice(i, 1);
											updateTreasure(next);
										}}
									>
										Remove
									</button>
								</div>
							))}
							<button onClick={() => updateTreasure([...G.treasure, { colors: ['R'] }])}>Add Treasure</button>
						</div>
					</section>

					<section className="state-lab__section">
						<h3>Allowed (Enumerated)</h3>
						<div className="state-lab__row state-lab__row--actions">
							<button onClick={() => setExcludedAllowed(new Set())}>Include All</button>
							<button onClick={() => setExcludedAllowed(new Set(actionKeys))}>Exclude All</button>
						</div>
						<div className="state-lab__list">
							{actions.map((a) => {
								const keyValue = actionKey(a);
								const delta = scoreDeltaByAction[keyValue];
								return (
									<label key={keyValue} className="state-lab__item">
										<input
											type="checkbox"
											checked={!excludedAllowed.has(keyValue)}
											onChange={() => {
												setExcludedAllowed((prev) => {
													const next = new Set(prev);
													if (next.has(keyValue)) next.delete(keyValue);
													else next.add(keyValue);
													return next;
												});
											}}
										/>
										<span>{actionToLabel(a)}</span>
										<span className="state-lab__score-chip">Δ {delta ?? 0}</span>
										<input
											className="state-lab__score-input"
											type="number"
											placeholder="expect"
											value={expectedScores[keyValue] ?? ''}
											onChange={(e) => {
												const nextValue = e.target.value;
												setExpectedScores((prev) => {
													const next = { ...prev };
													if (nextValue === '') delete next[keyValue];
													else next[keyValue] = Number(nextValue);
													return next;
												});
											}}
										/>
									</label>
								);
							})}
						</div>
					</section>

					<section className="state-lab__section">
						<h3>Additional Allowed</h3>
						<div className="state-lab__stack">
							<div className="state-lab__row">
								<label>Type</label>
								<select
									value={allowedForm.type}
									onChange={(e) => {
										const nextType = e.target.value as AllowedForm['type'];
										if (nextType === 'endTurnAndRefill') {
											setAllowedForm({ type: 'endTurnAndRefill' });
										} else if (nextType === 'takeFromTreasure') {
											setAllowedForm({ type: 'takeFromTreasure', index: 0 });
										} else if (nextType === 'stashToTreasure') {
											setAllowedForm({ type: 'stashToTreasure', handIndex: 0 });
										} else if (nextType === 'rotateTile') {
											setAllowedForm({ type: 'rotateTile', handIndex: 0, coord: '0,0', rotation: 1 });
										} else {
											setAllowedForm({ type: 'playCard', handIndex: 0, pick: 'B', coord: '0,0', source: '0,0' });
										}
									}}
								>
									<option value="playCard">playCard</option>
									<option value="rotateTile">rotateTile</option>
									<option value="stashToTreasure">stashToTreasure</option>
									<option value="takeFromTreasure">takeFromTreasure</option>
									<option value="endTurnAndRefill">endTurnAndRefill</option>
								</select>
							</div>
							{allowedForm.type === 'playCard' && (
								<>
									<div className="state-lab__row">
										<label>Hand</label>
										<input
											type="number"
											value={allowedForm.handIndex}
											onChange={(e) => setAllowedForm({ ...allowedForm, handIndex: Number(e.target.value) })}
										/>
									</div>
									<div className="state-lab__row">
										<label>Pick</label>
										<ColorPicker
											value={allowedForm.pick}
											onChange={(pick) => setAllowedForm({ ...allowedForm, pick })}
										/>
									</div>
									{mode === 'path' && (
										<div className="state-lab__row">
											<label>Source</label>
											<input
												value={allowedForm.source}
												onChange={(e) => setAllowedForm({ ...allowedForm, source: e.target.value })}
											/>
										</div>
									)}
									<div className="state-lab__row">
										<label>Coord</label>
										<input
											value={allowedForm.coord}
											onChange={(e) => setAllowedForm({ ...allowedForm, coord: e.target.value })}
										/>
									</div>
								</>
							)}
							{allowedForm.type === 'rotateTile' && (
								<>
									<div className="state-lab__row">
										<label>Hand</label>
										<input
											type="number"
											value={allowedForm.handIndex}
											onChange={(e) => setAllowedForm({ ...allowedForm, handIndex: Number(e.target.value) })}
										/>
									</div>
									<div className="state-lab__row">
										<label>Coord</label>
										<input
											value={allowedForm.coord}
											onChange={(e) => setAllowedForm({ ...allowedForm, coord: e.target.value })}
										/>
									</div>
									<div className="state-lab__row">
										<label>Rotation</label>
										<input
											type="number"
											min={1}
											max={5}
											value={allowedForm.rotation}
											onChange={(e) => setAllowedForm({ ...allowedForm, rotation: Number(e.target.value) })}
										/>
									</div>
								</>
							)}
							{allowedForm.type === 'stashToTreasure' && (
								<div className="state-lab__row">
									<label>Hand</label>
									<input
										type="number"
										value={allowedForm.handIndex}
										onChange={(e) => setAllowedForm({ ...allowedForm, handIndex: Number(e.target.value) })}
									/>
								</div>
							)}
							{allowedForm.type === 'takeFromTreasure' && (
								<div className="state-lab__row">
									<label>Index</label>
									<input
										type="number"
										value={allowedForm.index}
										onChange={(e) => setAllowedForm({ ...allowedForm, index: Number(e.target.value) })}
									/>
								</div>
							)}
							<button
								onClick={() => {
									const built = buildActionKey(allowedForm);
									if (!built) return;
									setExtraAllowed((prev) => [...prev, built]);
								}}
							>
								Add Allowed
							</button>
							{extraAllowed.length > 0 && (
								<div className="state-lab__list">
									{extraAllowed.map((item, i) => (
										<div key={`${item}-${i}`} className="state-lab__item state-lab__item--inline">
											<span>{item}</span>
											<input
												className="state-lab__score-input"
												type="number"
												placeholder="expect"
												value={expectedScores[item] ?? ''}
												onChange={(e) => {
													const nextValue = e.target.value;
													setExpectedScores((prev) => {
														const next = { ...prev };
														if (nextValue === '') delete next[item];
														else next[item] = Number(nextValue);
														return next;
													});
												}}
											/>
											<button
												onClick={() => setExtraAllowed((prev) => prev.filter((_, idx) => idx !== i))}
											>
												Remove
											</button>
										</div>
									))}
								</div>
							)}
						</div>
					</section>

					<section className="state-lab__section">
						<h3>Expected Illegal</h3>
						<div className="state-lab__stack">
							<div className="state-lab__row">
								<label>Type</label>
								<select
									value={illegalForm.type}
									onChange={(e) => {
										const nextType = e.target.value as IllegalForm['type'];
										if (nextType === 'endTurnAndRefill') {
											setIllegalForm({ type: 'endTurnAndRefill' });
										} else if (nextType === 'takeFromTreasure') {
											setIllegalForm({ type: 'takeFromTreasure', index: 0 });
										} else if (nextType === 'stashToTreasure') {
											setIllegalForm({ type: 'stashToTreasure', handIndex: 0 });
										} else if (nextType === 'rotateTile') {
											setIllegalForm({ type: 'rotateTile', handIndex: 0, coord: '0,0', rotation: 1 });
										} else {
											setIllegalForm({ type: 'playCard', handIndex: 0, pick: 'B', coord: '0,0', source: '0,0' });
										}
									}}
								>
									<option value="playCard">playCard</option>
									<option value="rotateTile">rotateTile</option>
									<option value="stashToTreasure">stashToTreasure</option>
									<option value="takeFromTreasure">takeFromTreasure</option>
									<option value="endTurnAndRefill">endTurnAndRefill</option>
								</select>
							</div>
							{illegalForm.type === 'playCard' && (
								<>
									<div className="state-lab__row">
										<label>Hand</label>
										<input
											type="number"
											value={illegalForm.handIndex}
											onChange={(e) => setIllegalForm({ ...illegalForm, handIndex: Number(e.target.value) })}
										/>
									</div>
									<div className="state-lab__row">
										<label>Pick</label>
										<ColorPicker
											value={illegalForm.pick}
											onChange={(pick) => setIllegalForm({ ...illegalForm, pick })}
										/>
									</div>
									{mode === 'path' && (
										<div className="state-lab__row">
											<label>Source</label>
											<input
												value={illegalForm.source}
												onChange={(e) => setIllegalForm({ ...illegalForm, source: e.target.value })}
											/>
										</div>
									)}
									<div className="state-lab__row">
										<label>Coord</label>
										<input
											value={illegalForm.coord}
											onChange={(e) => setIllegalForm({ ...illegalForm, coord: e.target.value })}
										/>
									</div>
								</>
							)}
							{illegalForm.type === 'rotateTile' && (
								<>
									<div className="state-lab__row">
										<label>Hand</label>
										<input
											type="number"
											value={illegalForm.handIndex}
											onChange={(e) => setIllegalForm({ ...illegalForm, handIndex: Number(e.target.value) })}
										/>
									</div>
									<div className="state-lab__row">
										<label>Coord</label>
										<input
											value={illegalForm.coord}
											onChange={(e) => setIllegalForm({ ...illegalForm, coord: e.target.value })}
										/>
									</div>
									<div className="state-lab__row">
										<label>Rotation</label>
										<input
											type="number"
											min={1}
											max={5}
											value={illegalForm.rotation}
											onChange={(e) => setIllegalForm({ ...illegalForm, rotation: Number(e.target.value) })}
										/>
									</div>
								</>
							)}
							{illegalForm.type === 'stashToTreasure' && (
								<div className="state-lab__row">
									<label>Hand</label>
									<input
										type="number"
										value={illegalForm.handIndex}
										onChange={(e) => setIllegalForm({ ...illegalForm, handIndex: Number(e.target.value) })}
									/>
								</div>
							)}
							{illegalForm.type === 'takeFromTreasure' && (
								<div className="state-lab__row">
									<label>Index</label>
									<input
										type="number"
										value={illegalForm.index}
										onChange={(e) => setIllegalForm({ ...illegalForm, index: Number(e.target.value) })}
									/>
								</div>
							)}
							<button
								onClick={() => {
									const built = buildActionKey(illegalForm);
									if (!built) return;
									setExpectedIllegal((prev) => [...prev, built]);
								}}
							>
								Add Illegal
							</button>
							{expectedIllegal.length > 0 && (
								<div className="state-lab__list">
									{expectedIllegal.map((item, i) => (
										<div key={`${item}-${i}`} className="state-lab__item state-lab__item--inline">
											<span>{item}</span>
											<button
												onClick={() => setExpectedIllegal((prev) => prev.filter((_, idx) => idx !== i))}
											>
												Remove
											</button>
										</div>
									))}
								</div>
							)}
						</div>
					</section>

					<section className="state-lab__section">
						<h3>Test Output</h3>
						<div className="state-lab__note">Create will ask for a folder. Choose src/game/.</div>
						<div className="state-lab__row state-lab__row--actions">
							<button onClick={() => navigator.clipboard.writeText(exportTest)}>Copy</button>
							<button onClick={createTestFile} disabled={createStatus === 'saving'}>
								{createStatus === 'saving' ? 'Creating...' : 'Create'}
							</button>
						</div>
						{createMessage && <div className="state-lab__note">{createMessage}</div>}
						<pre className="state-lab__code">
							<code>{exportTest}</code>
						</pre>
					</section>
				</aside>

				<main className="state-lab__board">
					<Board
						rules={rules}
						board={G.board}
						lanes={G.lanes}
						radius={G.radius}
						onHexClick={onHexClick}
						showRing
						showCoords
						highlightCoords={highlightCoords}
						highlightColor="#8b5cf6"
						origins={G.origins}
						selectedColor={mode === 'path' ? selectedColor : null}
						selectedSourceDot={pendingSource}
					/>
				</main>
			</div>
		</div>
	);
};
