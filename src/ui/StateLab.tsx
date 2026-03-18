import React from 'react';
import type { PlayerID } from 'boardgame.io';
import type { Action } from '../game/ai';
import { applyMicroAction, enumerateActions } from '../game/ai';
import type { Card, Co, Color, GState, PathLane, Rules } from '../game/types';
import { MODE_RULESETS, BASE_DIRECTIONS, buildColorToDir } from '../game/rulesConfig';
import { Board } from './Board';
import { asVisibleColor, key, neighbors } from '../game/helpers';
import { computeScoresRaw } from '../game/scoring';
import { makeCard } from '../game/cardFactory';
import { getNightmareByName } from '../game/nightmares';
import { initActionState } from '../game/effects';

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

/* ─── SVG Icons ─── */

const IconFile: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9 1z" />
		<path d="M9 1v4h4" />
	</svg>
);

const IconUpload: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
		<polyline points="4 5 8 1 12 5" />
		<line x1="8" y1="1" x2="8" y2="11" />
	</svg>
);

const IconDownload: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
		<polyline points="4 7 8 11 12 7" />
		<line x1="8" y1="11" x2="8" y2="1" />
	</svg>
);

const IconCopy: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<rect x="5" y="5" width="9" height="9" rx="1" />
		<path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" />
	</svg>
);

const IconSave: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<path d="M13 15H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h7l4 4v9a1 1 0 0 1-1 1z" />
		<path d="M11 15V9H5v6" />
		<path d="M5 1v4h4" />
	</svg>
);

const IconX: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<line x1="3" y1="3" x2="13" y2="13" />
		<line x1="13" y1="3" x2="3" y2="13" />
	</svg>
);

const IconPlus: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
		<line x1="8" y1="2" x2="8" y2="14" />
		<line x1="2" y1="8" x2="14" y2="8" />
	</svg>
);

const IconMinus: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
		<line x1="2" y1="8" x2="14" y2="8" />
	</svg>
);

const IconTrash: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<path d="M2 4h12" />
		<path d="M5 4V2h6v2" />
		<path d="M13 4l-1 10H4L3 4" />
	</svg>
);

const IconRotate: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<path d="M1 4v4h4" />
		<path d="M1 8C2 4.5 5 2 8.5 2 12 2 14.5 5 14.5 8S12 14 8.5 14c-2 0-3.8-1-5-2.5" />
	</svg>
);

const IconOrigin: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<circle cx="8" cy="8" r="3" />
		<line x1="8" y1="1" x2="8" y2="4" />
		<line x1="8" y1="12" x2="8" y2="15" />
		<line x1="1" y1="8" x2="4" y2="8" />
		<line x1="12" y1="8" x2="15" y2="8" />
	</svg>
);

const IconPath: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<circle cx="3" cy="13" r="2" />
		<circle cx="13" cy="3" r="2" />
		<path d="M5 11C6 7 10 9 11 5" />
	</svg>
);

const IconHex: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
		<polygon points="8,1 14,4.5 14,11.5 8,15 2,11.5 2,4.5" />
	</svg>
);

const IconEye: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
		<circle cx="8" cy="8" r="2" />
	</svg>
);

const IconEyeOff: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<path d="M6.5 6.5a2 2 0 0 0 3 3" />
		<path d="M2 2l12 12" />
		<path d="M10 12.5C9.4 12.8 8.7 13 8 13c-4 0-7-5-7-5s1.2-2 3.2-3.4" />
		<path d="M13 10.5c1-1 1.7-2 2-2.5 0 0-3-5-7-5-.6 0-1.2.1-1.7.3" />
	</svg>
);

const IconCheck: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<polyline points="3 8 6.5 12 13 4" />
	</svg>
);

const IconCheckAll: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<polyline points="1.5 8 5 12 12.5 4" />
		<polyline points="5 8 8.5 12 15 4" />
	</svg>
);

const IconUncheckAll: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<rect x="2" y="2" width="12" height="12" rx="2" />
		<line x1="5" y1="5" x2="11" y2="11" />
		<line x1="11" y1="5" x2="5" y2="11" />
	</svg>
);

const IconChevron: React.FC<{ size?: number }> = ({ size = 10 }) => (
	<svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<polyline points="3 4 5 6.5 7 4" />
	</svg>
);

const IconBan: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<circle cx="8" cy="8" r="6" />
		<line x1="3.5" y1="3.5" x2="12.5" y2="12.5" />
	</svg>
);

const IconSettings: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
		<circle cx="8" cy="8" r="2.5" />
		<path d="M13.3 10a1.2 1.2 0 0 0 .2 1.3l.1.1a1.4 1.4 0 1 1-2 2l-.1-.1a1.2 1.2 0 0 0-2 .9v.1a1.4 1.4 0 1 1-2.8 0v-.1A1.2 1.2 0 0 0 5.4 13l-.1.1a1.4 1.4 0 1 1-2-2l.1-.1a1.2 1.2 0 0 0-.9-2H2.4a1.4 1.4 0 0 1 0-2.8h.1a1.2 1.2 0 0 0 1.1-1.3L3.5 5a1.4 1.4 0 1 1 2-2l.1.1A1.2 1.2 0 0 0 7 2.3V2.2a1.4 1.4 0 0 1 2.8 0v.1a1.2 1.2 0 0 0 2 .9l.1-.1a1.4 1.4 0 1 1 2 2l-.1.1a1.2 1.2 0 0 0 .9 2h.1a1.4 1.4 0 0 1 0 2.8h-.1a1.2 1.2 0 0 0-1.3.2z" />
	</svg>
);

const IconEraser: React.FC<{ size?: number }> = ({ size = 14 }) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
		<path d="M14 14H6l-4-4 8-8 6 6-4 4" />
		<path d="M2 10l6 6" />
	</svg>
);

/* ─── Menu Dropdown Component ─── */

const MenuDropdown: React.FC<{
	label: string;
	children: React.ReactNode;
}> = ({ label, children }) => {
	const [open, setOpen] = React.useState(false);
	const ref = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		if (open) document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [open]);

	return (
		<div className="sl-menu" ref={ref}>
			<button
				className={`sl-menu__trigger ${open ? 'sl-menu__trigger--active' : ''}`}
				onClick={() => setOpen(!open)}
			>
				{label}
			</button>
			{open && (
				<div className="sl-menu__dropdown" onClick={() => setOpen(false)}>
					{children}
				</div>
			)}
		</div>
	);
};

const MenuItem: React.FC<{
	icon?: React.ReactNode;
	label: string;
	shortcut?: string;
	onClick: () => void;
	disabled?: boolean;
}> = ({ icon, label, shortcut, onClick, disabled }) => (
	<button
		className="sl-menu__item"
		onClick={onClick}
		disabled={disabled}
	>
		<span className="sl-menu__item-icon">{icon}</span>
		<span className="sl-menu__item-label">{label}</span>
		{shortcut && <span className="sl-menu__item-shortcut">{shortcut}</span>}
	</button>
);

const MenuSeparator: React.FC = () => <div className="sl-menu__separator" />;

/* ─── Toolbar Icon Button ─── */

const ToolButton: React.FC<{
	icon: React.ReactNode;
	label: string;
	active?: boolean;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
}> = ({ icon, label, active, onClick, disabled, danger }) => (
	<button
		className={`sl-tool-btn ${active ? 'sl-tool-btn--active' : ''} ${danger ? 'sl-tool-btn--danger' : ''}`}
		onClick={onClick}
		disabled={disabled}
		title={label}
		aria-label={label}
	>
		{icon}
	</button>
);

/* ─── Reused sub-components ─── */

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

const parseLiteral = <T,>(value: string, scope: Record<string, unknown> = {}): T => {
	const keys = Object.keys(scope);
	const values = Object.values(scope);
	return new Function(...keys, `return (${value});`)(...values) as T;
};

const extractMatch = (source: string, pattern: RegExp): string | null => {
	const match = source.match(pattern);
	return match?.[1] ?? null;
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
			return `rotate:${a.args.handIndices.join('+')}:${a.args.coord.q},${a.args.coord.r}:${a.args.rotation}`;
		case 'blockTile':
			return `block:${a.args.handIndices.join('+')}:${a.args.coord.q},${a.args.coord.r}`;
		case 'stashToTreasure':
			return `stash:${a.args.handIndex}`;
		case 'takeFromTreasure':
			return `take:${a.args.index}`;
		case 'endTurnAndRefill':
			return 'end';
	}
};

const DIR_LABELS = ['N', 'NE', 'E', 'SE', 'SW', 'NW'] as const;
const DIR_ARROWS = ['↑', '↗', '→', '↘', '↙', '↖'] as const;
const DIR_META = BASE_DIRECTIONS.map((dir, i) => ({
	...dir,
	label: DIR_LABELS[i],
	arrow: DIR_ARROWS[i],
}));

const directionFromTo = (from: Co, to: Co): { label: string; arrow: string } | null => {
	const dq = to.q - from.q;
	const dr = to.r - from.r;
	const match = DIR_META.find((dir) => dir.q === dq && dir.r === dr);
	return match ? { label: match.label, arrow: match.arrow } : null;
};

const InlineColorDot: React.FC<{ color: Color }> = ({ color }) => (
	<span className="state-lab__inline-dot" style={{ background: asVisibleColor(color) }} title={color} aria-label={color} />
);

const actionToLabel = (a: Action): React.ReactNode => {
	switch (a.type) {
		case 'playCard':
			if ('source' in a.args) {
				const dir = directionFromTo(a.args.source, a.args.coord);
				return (
					<span className="state-lab__action-label">
						card {a.args.handIndex} as <InlineColorDot color={a.args.pick} /> from ({a.args.source.q},{a.args.source.r}) to ({a.args.coord.q},{a.args.coord.r})
						{dir && (
							<span className="state-lab__action-dir">
								, {dir.label} <span className="state-lab__dir-arrow" aria-hidden="true">{dir.arrow}</span>
							</span>
						)}
					</span>
				);
			}
			return (
				<span className="state-lab__action-label">
					card {a.args.handIndex} as <InlineColorDot color={a.args.pick} /> at ({a.args.coord.q},{a.args.coord.r})
				</span>
			);
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

const parsePlayLaneKey = (keyValue: string): { handIndex: number; lane: PathLane } | null => {
	const match = keyValue.match(/^play:(\d+):([A-Z]):(-?\d+),(-?\d+)->(-?\d+),(-?\d+)$/);
	if (!match) return null;
	const handIndex = Number(match[1]);
	const color = match[2] as Color;
	return {
		handIndex,
		lane: {
			from: { q: Number(match[3]), r: Number(match[4]) },
			to: { q: Number(match[5]), r: Number(match[6]) },
			color,
		},
	};
};

const serializeBoard = (board: Record<string, { colors: Color[]; rotation: number; dead?: boolean }>): string => {
	const entries = Object.entries(board);
	if (entries.length === 0) return '{}';
	const lines = entries.map(([k, tile]) =>
		`\t\t"${k}": { colors: [${tile.colors.map((c) => `'${c}'`).join(', ')}], rotation: ${tile.rotation}, dead: ${tile.dead ?? false} }`
	);
	return `{\n${lines.join(',\n')}\n\t}`;
};

const serializeCoords = (coords: Co[]): string =>
	`[${coords.map((c) => `{ q: ${c.q}, r: ${c.r} }`).join(', ')}]`;

const serializeCards = (cards: Card[]): string =>
	`[${cards.map((c) => `makeCard([${c.colors.map((col) => `'${col}'`).join(', ')}])`).join(', ')}]`;

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

/* ─── Collapsible Section ─── */

const CollapsibleSection: React.FC<{
	title: string;
	icon?: React.ReactNode;
	defaultOpen?: boolean;
	badge?: string | number;
	children: React.ReactNode;
}> = ({ title, icon, defaultOpen = true, badge, children }) => {
	const [open, setOpen] = React.useState(defaultOpen);
	return (
		<section className="sl-section">
			<button className="sl-section__header" onClick={() => setOpen(!open)}>
				<span className={`sl-section__chevron ${open ? 'sl-section__chevron--open' : ''}`}>
					<IconChevron />
				</span>
				{icon && <span className="sl-section__icon">{icon}</span>}
				<span className="sl-section__title">{title}</span>
				{badge !== undefined && <span className="sl-section__badge">{badge}</span>}
			</button>
			{open && <div className="sl-section__body">{children}</div>}
		</section>
	);
};

/* ─── Main Component ─── */

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
	const [showMovesHandIndex, setShowMovesHandIndex] = React.useState<number | null>(null);
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
	const [loadText, setLoadText] = React.useState('');
	const [loadStatus, setLoadStatus] = React.useState<string | null>(null);
	const [loadStateText, setLoadStateText] = React.useState('');
	const [loadStateStatus, setLoadStateStatus] = React.useState<string | null>(null);
	const [pendingExpected, setPendingExpected] = React.useState<string[] | null>(null);
	const [pendingForbidden, setPendingForbidden] = React.useState<string[] | null>(null);
	const [createStatus, setCreateStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const [createMessage, setCreateMessage] = React.useState<string | null>(null);
	const [projectRootHandle, setProjectRootHandle] = React.useState<FileSystemDirectoryHandle | null>(null);
	const [showLoadPanel, setShowLoadPanel] = React.useState(false);
	const [showLoadStateDialog, setShowLoadStateDialog] = React.useState(false);
	const [hoveredActionKey, setHoveredActionKey] = React.useState<string | null>(null);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	const rules = React.useMemo(() => buildRules(mode, radius, edgeColors), [mode, radius, edgeColors]);

	const [G, setG] = React.useState<GState>(() => ({
		rules,
		radius: rules.RADIUS,
		board: {},
		lanes: [],
		deck: [],
		discard: [],
		hands: { '0': [makeCard(['B', 'O'])] },
		treasure: [],
		prefs: {},
		nightmares: {},
		nightmareState: {},
		stats: { placements: 0 },
		meta: { deckExhaustionCycle: null, stashBonus: {}, actionPlaysThisTurn: {} },
		origins: [{ q: 0, r: 0 }],
		action: initActionState(['0']),
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

	React.useEffect(() => {
		if (showMovesHandIndex !== null && showMovesHandIndex >= hand.length) {
			setShowMovesHandIndex(null);
		}
	}, [hand.length, showMovesHandIndex]);

	const highlightCoords = React.useMemo(() => {
		if (mode !== 'path' || editMode !== 'path' || !pendingSource) return [];
		return neighbors(pendingSource);
	}, [mode, editMode, pendingSource]);

	const hoveredLane = React.useMemo((): PathLane | null => {
		if (!hoveredActionKey) return null;
		const parsed = parsePlayLaneKey(hoveredActionKey);
		return parsed?.lane ?? null;
	}, [hoveredActionKey]);

	const hoveredHighlightCoords = React.useMemo((): Co[] => {
		if (!hoveredLane) return [];
		return [hoveredLane.from, hoveredLane.to];
	}, [hoveredLane]);

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
				nextBoard[k] = { colors, rotation: tile?.rotation ?? 0, dead: tile?.dead ?? false };
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
				for (let i = nextLanes.length - 1; i >= 0; i -= 1) {
					const lane = nextLanes[i];
					const fwd = lane.from.q === pendingSource.q && lane.from.r === pendingSource.r
						&& lane.to.q === coord.q && lane.to.r === coord.r;
					const rev = lane.from.q === coord.q && lane.from.r === coord.r
						&& lane.to.q === pendingSource.q && lane.to.r === pendingSource.r;
					if ((fwd || rev) && lane.color === selectedColor) {
						nextLanes.splice(i, 1);
						break;
					}
				}
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
	const allowedKeys = React.useMemo(
		() => new Set(actionKeys.filter((k) => !excludedAllowed.has(k)).concat(extraAllowed)),
		[actionKeys, excludedAllowed, extraAllowed]
	);
	const allowedActions = React.useMemo(
		() => actions.filter((a) => allowedKeys.has(actionKey(a))),
		[actions, allowedKeys]
	);
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

	const phantomLanes = React.useMemo(() => {
		if (mode !== 'path' || showMovesHandIndex === null) return [];
		const lanes: PathLane[] = [];

		for (const action of allowedActions) {
			if (action.type !== 'playCard') continue;
			const args = action.args;
			if (!('source' in args)) continue;
			if (args.handIndex !== showMovesHandIndex) continue;
			lanes.push({ from: args.source, to: args.coord, color: args.pick });
		}

		for (const keyValue of extraAllowed) {
			const parsed = parsePlayLaneKey(keyValue);
			if (!parsed) continue;
			if (parsed.handIndex !== showMovesHandIndex) continue;
			lanes.push(parsed.lane);
		}

		return lanes;
	}, [mode, showMovesHandIndex, allowedActions, extraAllowed]);

	React.useEffect(() => {
		if (!pendingExpected) return;
		const expectedSet = new Set(pendingExpected);
		setExcludedAllowed(new Set(actionKeys.filter((k) => !expectedSet.has(k))));
		setExtraAllowed(pendingExpected.filter((k) => !actionKeys.includes(k)));
		if (pendingForbidden) setExpectedIllegal(pendingForbidden);
		setPendingExpected(null);
		setPendingForbidden(null);
	}, [actionKeys, pendingExpected, pendingForbidden]);

	const loadTestFromText = (raw: string) => {
		const modeMatch = extractMatch(raw, /MODE_RULESETS\.(path|hex)/);
		const radiusMatch = extractMatch(raw, /RADIUS:\s*(\d+)/);
		const edgeMatch = extractMatch(raw, /const EDGE_COLORS\s*=\s*(\[[\s\S]*?\])\s*(?:as const)?/);
		const gMatch = extractMatch(raw, /const\s+G(?::\s*GState)?\s*=\s*({[\s\S]*?})\s*;/);
		const expectedMatch = extractMatch(raw, /const expected\s*=\s*(\[[\s\S]*?\]);/);
		const forbiddenMatch = extractMatch(raw, /const forbidden\s*=\s*(\[[\s\S]*?\]);/);
		const expectedScoresMatch = extractMatch(raw, /const expectedScores\s*=\s*({[\s\S]*?});/);
		const titleMatch = extractMatch(raw, /describe\('([^']+)'/);
		const playerMatch = extractMatch(raw, /enumerateActions\(G,\s*'([^']+)'\)/) ?? extractMatch(raw, /enumerateActions\(G,\s*"([^"]+)"\)/);

		if (!modeMatch || !radiusMatch || !edgeMatch || !gMatch) {
			throw new Error('Unable to parse test file. Expected EDGE_COLORS, rules.MODE, rules.RADIUS, and const G.');
		}

		const parsedMode = modeMatch as 'path' | 'hex';
		const parsedRadius = Number(radiusMatch);
		const parsedEdge = parseLiteral<Color[]>(edgeMatch);
		const nextRules = buildRules(parsedMode, parsedRadius, parsedEdge.join(''));
		const normalizedG = gMatch
			.replace(/\brules\.RADIUS\b/g, String(parsedRadius))
			.replace(/\brules\b/g, '__RULES__');
		const parsedG = parseLiteral<GState>(normalizedG, { __RULES__: nextRules });
		const parsedExpected = expectedMatch ? parseLiteral<string[]>(expectedMatch) : [];
		const parsedForbidden = forbiddenMatch ? parseLiteral<string[]>(forbiddenMatch) : [];
		const parsedExpectedScores = expectedScoresMatch ? parseLiteral<Record<string, number>>(expectedScoresMatch) : {};
		const nextPlayerID = (playerMatch ?? Object.keys(parsedG.hands ?? {})[0] ?? '0') as PlayerID;
		const nextTitle = titleMatch ?? 'enumerate-actions';
		const nightmareName = parsedG.nightmares?.[nextPlayerID];
		const nightmare = getNightmareByName(nightmareName);
		const nextPrefs = nightmare
			? { primary: nightmare.priorities.primary, secondary: nightmare.priorities.secondary, tertiary: nightmare.priorities.tertiary }
			: (parsedG.prefs?.[nextPlayerID] ?? { primary: 'R', secondary: 'O', tertiary: 'Y' });

		setMode(parsedMode);
		setRadius(parsedRadius);
		setEdgeColors(parsedEdge.join(''));
		setTitle(nextTitle);
		setPlayerID(nextPlayerID);
		setGoalPrefs(nextPrefs);
		setG({
			...parsedG,
			rules: nextRules,
			radius: nextRules.RADIUS,
			prefs: { ...parsedG.prefs, [nextPlayerID]: nextPrefs },
			nightmares: parsedG.nightmares ?? {},
			nightmareState: parsedG.nightmareState ?? {},
			action: parsedG.action ?? initActionState([nextPlayerID]),
		});
		setExpectedScores(parsedExpectedScores);
		setPendingExpected(parsedExpected);
		setPendingForbidden(parsedForbidden);
		setShowMovesHandIndex(null);
		setPendingSource(null);
	};

	const loadStateFromJSON = (raw: string) => {
		const parsed = JSON.parse(raw) as GState;
		if (!parsed.rules || !parsed.board) {
			throw new Error('Invalid state JSON. Expected a GState object with rules, board, etc.');
		}
		const parsedMode = parsed.rules.MODE;
		const parsedRadius = parsed.rules.RADIUS;
		const parsedEdge = (parsed.rules.EDGE_COLORS as Color[]).join('');
		const nextRules = buildRules(parsedMode, parsedRadius, parsedEdge);
		const nextPlayerID = (Object.keys(parsed.hands ?? {})[0] ?? '0') as PlayerID;
		const nextPrefs = parsed.prefs?.[nextPlayerID] ?? { primary: 'R', secondary: 'O', tertiary: 'Y' };

		setMode(parsedMode);
		setRadius(parsedRadius);
		setEdgeColors(parsedEdge);
		setTitle('imported-state');
		setPlayerID(nextPlayerID);
		setGoalPrefs(nextPrefs);
		setG({
			...parsed,
			rules: nextRules,
			radius: nextRules.RADIUS,
			prefs: { ...parsed.prefs, [nextPlayerID]: nextPrefs },
		});
		setExpectedScores({});
		setPendingExpected(null);
		setPendingForbidden(null);
		setShowMovesHandIndex(null);
		setPendingSource(null);
	};

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
					args: { handIndices: [form.handIndex], coord, rotation: form.rotation },
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
import { enumerateActions, type Action, applyMicroAction } from '../game/ai';
import type { GState } from '../game/types';
import { makeCard } from '../game/cardFactory';
import { MODE_RULESETS, buildColorToDir } from '../game/rulesConfig';
import { computeScoresRaw } from '../game/scoring';

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
\tnightmares: {},
\tnightmareState: {},
\tstats: { placements: 0 },
\tmeta: { deckExhaustionCycle: null, stashBonus: {}, actionPlaysThisTurn: {} },
\torigins: ${originsLiteral},
\taction: initActionState(['${playerID}']),
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
\t\t\treturn \`rotate:\${a.args.handIndices.join('+')}:\${a.args.coord.q},\${a.args.coord.r}:\${a.args.rotation}\`;
\t\tcase 'blockTile':
\t\t\treturn \`block:\${a.args.handIndices.join('+')}:\${a.args.coord.q},\${a.args.coord.r}\`;
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

	const ensureProjectRoot = async (): Promise<FileSystemDirectoryHandle | null> => {
		if (projectRootHandle) return projectRootHandle;
		if (!('showDirectoryPicker' in window) || !window.isSecureContext) return null;
		const handle = await (window as Window & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
		setProjectRootHandle(handle);
		return handle;
	};

	const downloadTestFile = (filename: string, contents: string) => {
		const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	};

	const createTestViaDevServer = async (filename: string, contents: string): Promise<boolean> => {
		try {
			const response = await fetch('/__lab/create-test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename, contents }),
			});
			return response.ok;
		} catch {
			return false;
		}
	};

	const createTestFile = async () => {
		setCreateStatus('saving');
		setCreateMessage(null);
		try {
			const filename = `${slugify(title)}.test.ts`;
			const rootHandle = await ensureProjectRoot();
			if (!rootHandle) {
				const written = await createTestViaDevServer(filename, exportTest);
				if (written) {
					setCreateStatus('saved');
					setCreateMessage(`Saved ${filename} in src/tests via dev server.`);
					return;
				}
				downloadTestFile(filename, exportTest);
				setCreateStatus('saved');
				setCreateMessage(`Downloaded ${filename}. Move it into src/tests.`);
				return;
			}
			const srcHandle = await rootHandle.getDirectoryHandle('src', { create: false });
			const testsHandle = await srcHandle.getDirectoryHandle('tests', { create: true });
			const fileHandle = await testsHandle.getFileHandle(filename, { create: true });
			const writable = await fileHandle.createWritable();
			await writable.write(exportTest);
			await writable.close();
			setCreateStatus('saved');
			setCreateMessage(`Saved ${filename} in src/tests.`);
		} catch (err) {
			setCreateStatus('error');
			setCreateMessage(err instanceof Error ? err.message : 'Failed to create file.');
		}
	};

	/* Hidden file input for Load File menu item */
	const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = String(reader.result ?? '');
			setLoadText(text);
			try {
				loadTestFromText(text);
				setLoadStatus('Loaded test from file.');
				setShowLoadPanel(false);
			} catch (err) {
				setLoadStatus(err instanceof Error ? err.message : 'Failed to load test.');
				setShowLoadPanel(true);
			}
		};
		reader.readAsText(file);
		// reset so the same file can be loaded again
		e.target.value = '';
	};

	return (
		<div className="state-lab">
			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				accept=".ts,.tsx,.js"
				style={{ display: 'none' }}
				onChange={handleFileLoad}
			/>

			{/* ─── Menu Bar ─── */}
			<header className="sl-menubar">
				<div className="sl-menubar__left">
					<div className="sl-menubar__brand">
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
							<rect x="1" y="1" width="14" height="14" rx="3" stroke="var(--accent-primary)" strokeWidth="1.5" />
							<circle cx="8" cy="8" r="3" fill="var(--accent-primary)" opacity="0.6" />
							<circle cx="8" cy="8" r="1.5" fill="var(--accent-primary)" />
						</svg>
						<span>State Lab</span>
					</div>

					<MenuDropdown label="File">
						<MenuItem icon={<IconUpload />} label="Load Test File..." onClick={() => fileInputRef.current?.click()} />
						<MenuItem icon={<IconFile />} label="Load from Clipboard..." onClick={() => setShowLoadPanel(true)} />
						<MenuItem icon={<IconDownload />} label="Load State..." onClick={() => setShowLoadStateDialog(true)} />
						<MenuSeparator />
						<MenuItem icon={<IconCopy />} label="Copy Test to Clipboard" onClick={() => navigator.clipboard.writeText(exportTest)} />
						<MenuItem
							icon={<IconSave />}
							label="Create Test File"
							onClick={createTestFile}
							disabled={createStatus === 'saving'}
						/>
						<MenuItem icon={<IconDownload />} label="Download Test" onClick={() => downloadTestFile(`${slugify(title)}.test.ts`, exportTest)} />
						<MenuSeparator />
						<MenuItem icon={<IconX />} label="Exit Lab" onClick={onExit} />
					</MenuDropdown>

					<MenuDropdown label="Edit">
						<MenuItem icon={<IconTrash />} label="Clear Board" onClick={() => { setG((prev) => ({ ...prev, board: {}, lanes: [] })); setPendingSource(null); }} />
						<MenuItem icon={<IconOrigin />} label="Clear Origins" onClick={() => setG((prev) => ({ ...prev, origins: [] }))} />
						<MenuSeparator />
						<MenuItem icon={<IconCheckAll />} label="Include All Actions" onClick={() => setExcludedAllowed(new Set())} />
						<MenuItem icon={<IconUncheckAll />} label="Exclude All Actions" onClick={() => setExcludedAllowed(new Set(actionKeys))} />
					</MenuDropdown>
				</div>

				<div className="sl-menubar__center">
					<input
						className="sl-menubar__title-input"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="test title..."
					/>
				</div>

				<div className="sl-menubar__right">
					{createMessage && (
						<span className={`sl-menubar__status ${createStatus === 'error' ? 'sl-menubar__status--error' : ''}`}>
							{createMessage}
						</span>
					)}
					<button className="sl-menubar__exit" onClick={onExit} title="Exit Lab">
						<IconX size={12} />
					</button>
				</div>
			</header>

			{/* ─── Toolbar ─── */}
			<div className="sl-toolbar">
				<div className="sl-toolbar__group">
					<span className="sl-toolbar__label">Mode</span>
					<div className="sl-toolbar__toggle">
						<button
							className={`sl-toolbar__toggle-btn ${mode === 'path' ? 'sl-toolbar__toggle-btn--active' : ''}`}
							onClick={() => setMode('path')}
						>
							<IconPath size={12} /> Path
						</button>
						<button
							className={`sl-toolbar__toggle-btn ${mode === 'hex' ? 'sl-toolbar__toggle-btn--active' : ''}`}
							onClick={() => setMode('hex')}
						>
							<IconHex size={12} /> Hex
						</button>
					</div>
				</div>

				<div className="sl-toolbar__sep" />

				<div className="sl-toolbar__group">
					<span className="sl-toolbar__label">Tool</span>
					{mode === 'path' && (
						<>
							<ToolButton
								icon={<IconPath />}
								label="Path Lanes"
								active={editMode === 'path'}
								onClick={() => setEditMode('path')}
							/>
						</>
					)}
					{mode === 'hex' && (
						<ToolButton
							icon={<IconHex />}
							label="Hex Tiles"
							active={editMode === 'hex'}
							onClick={() => setEditMode('hex')}
						/>
					)}
					<ToolButton
						icon={<IconOrigin />}
						label="Origins"
						active={editMode === 'origin'}
						onClick={() => setEditMode('origin')}
					/>
				</div>

				{editMode === 'hex' && (
					<>
						<div className="sl-toolbar__sep" />
						<div className="sl-toolbar__group">
							<ToolButton icon={<IconPlus />} label="Add Color" active={hexTool === 'add'} onClick={() => setHexTool('add')} />
							<ToolButton icon={<IconMinus />} label="Remove Color" active={hexTool === 'remove'} onClick={() => setHexTool('remove')} />
							<ToolButton icon={<IconEraser />} label="Clear Tile" active={hexTool === 'clear'} onClick={() => setHexTool('clear')} />
							<ToolButton icon={<IconRotate />} label="Set Rotation" active={hexTool === 'rotate'} onClick={() => setHexTool('rotate')} />
						</div>
						{hexTool === 'rotate' && (
							<div className="sl-toolbar__group">
								<span className="sl-toolbar__label">Rot</span>
								<input
									className="sl-toolbar__mini-input"
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
						<div className="sl-toolbar__sep" />
						<div className="sl-toolbar__group">
							<ToolButton icon={<IconPlus />} label="Add Lane" active={pathTool === 'add'} onClick={() => setPathTool('add')} />
							<ToolButton icon={<IconMinus />} label="Remove Lane" active={pathTool === 'remove'} onClick={() => setPathTool('remove')} />
						</div>
					</>
				)}

				{(editMode === 'hex' || editMode === 'path') && (
					<>
						<div className="sl-toolbar__sep" />
						<div className="sl-toolbar__group">
							<span className="sl-toolbar__label">Color</span>
							<ColorPicker value={selectedColor} onChange={setSelectedColor} />
						</div>
					</>
				)}

				{pendingSource && editMode === 'path' && (
					<div className="sl-toolbar__group">
						<span className="sl-toolbar__hint">
							Source: ({pendingSource.q},{pendingSource.r}) -- click destination
						</span>
					</div>
				)}
			</div>

			{/* ─── Body ─── */}
			<div className="state-lab__body">
				<aside className="state-lab__sidebar">
					{/* Load Panel (shown via File menu) */}
					{showLoadPanel && (
						<CollapsibleSection title="Load Test" icon={<IconUpload size={12} />} defaultOpen={true}>
							<div className="state-lab__note">Paste a generated test file. Loads trusted input only.</div>
							<div className="sl-field">
								<textarea
									rows={6}
									value={loadText}
									onChange={(e) => setLoadText(e.target.value)}
									placeholder="Paste test contents here..."
									className="sl-textarea"
								/>
							</div>
							<div className="sl-button-row">
								<button
									className="sl-btn sl-btn--primary"
									onClick={() => {
										try {
											loadTestFromText(loadText);
											setLoadStatus('Loaded test into lab.');
											setShowLoadPanel(false);
										} catch (err) {
											setLoadStatus(err instanceof Error ? err.message : 'Failed to load test.');
										}
									}}
									disabled={!loadText.trim()}
								>
									<IconUpload size={12} /> Load
								</button>
								<button className="sl-btn" onClick={() => fileInputRef.current?.click()}>
									<IconFile size={12} /> Browse...
								</button>
								<button className="sl-btn" onClick={() => setShowLoadPanel(false)}>
									Cancel
								</button>
							</div>
							{loadStatus && <div className="state-lab__note">{loadStatus}</div>}
						</CollapsibleSection>
					)}

					{/* Ruleset */}
					<CollapsibleSection title="Ruleset" icon={<IconSettings size={12} />}>
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
						<div className="state-lab__row">
							<label>Player ID</label>
							<input value={playerID} onChange={(e) => setPlayerID(e.target.value as PlayerID)} />
						</div>
					</CollapsibleSection>

					{/* Scoring */}
					<CollapsibleSection title="Scoring" icon={
						<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="1 12 5 4 9 8 15 1" />
						</svg>
					}>
						<div className="state-lab__note">Goal priorities for score deltas.</div>
						<GoalPicker value={goalPrefs} onChange={setGoalPrefs} />
					</CollapsibleSection>

					{/* Hand */}
					<CollapsibleSection title="Hand" icon={
						<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<rect x="2" y="1" width="12" height="14" rx="2" />
							<line x1="5" y1="5" x2="11" y2="5" />
							<line x1="5" y1="8" x2="9" y2="8" />
						</svg>
					} badge={hand.length}>
						<div className="state-lab__stack">
							{hand.map((card, i) => (
								<div key={`hand-${i}`} className="sl-card-row">
									<input
										className="sl-card-row__input"
										value={card.colors.join('')}
										onChange={(e) => {
											const next = [...hand];
											next[i] = makeCard(parseColors(e.target.value));
											updateHand(next);
										}}
									/>
									<ToolButton
										icon={<IconTrash size={12} />}
										label="Remove card"
										onClick={() => {
											const next = [...hand];
											next.splice(i, 1);
											updateHand(next);
										}}
									/>
									<ToolButton
										icon={showMovesHandIndex === i ? <IconEyeOff size={12} /> : <IconEye size={12} />}
										label={showMovesHandIndex === i ? 'Hide Moves' : 'Show Moves'}
										active={showMovesHandIndex === i}
										disabled={mode !== 'path'}
										onClick={() => setShowMovesHandIndex((prev) => (prev === i ? null : i))}
									/>
								</div>
							))}
							<button className="sl-btn sl-btn--sm" onClick={() => updateHand([...hand, makeCard(['B'])])}>
								<IconPlus size={11} /> Add Card
							</button>
						</div>
					</CollapsibleSection>

					{/* Treasure */}
					<CollapsibleSection title="Treasure" icon={
						<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M1 6h14v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6z" />
							<path d="M3 6V4a5 5 0 0 1 10 0v2" />
							<line x1="8" y1="9" x2="8" y2="12" />
						</svg>
					} badge={G.treasure.length}>
						<div className="state-lab__stack">
							{G.treasure.map((card, i) => (
								<div key={`treasure-${i}`} className="sl-card-row">
									<input
										className="sl-card-row__input"
										value={card.colors.join('')}
										onChange={(e) => {
											const next = [...G.treasure];
											next[i] = makeCard(parseColors(e.target.value));
											updateTreasure(next);
										}}
									/>
									<ToolButton
										icon={<IconTrash size={12} />}
										label="Remove treasure"
										onClick={() => {
											const next = [...G.treasure];
											next.splice(i, 1);
											updateTreasure(next);
										}}
									/>
								</div>
							))}
							<button className="sl-btn sl-btn--sm" onClick={() => updateTreasure([...G.treasure, makeCard(['R'])])}>
								<IconPlus size={11} /> Add Treasure
							</button>
						</div>
					</CollapsibleSection>

					{/* Allowed (Enumerated) */}
					<CollapsibleSection
						title="Allowed Actions"
						icon={<IconCheck size={12} />}
						badge={`${actionKeys.length - excludedAllowed.size + extraAllowed.length}/${actionKeys.length + extraAllowed.length}`}
					>
						<div className="sl-button-row" style={{ marginBottom: 8 }}>
							<button className="sl-btn sl-btn--sm" onClick={() => setExcludedAllowed(new Set())}>
								<IconCheckAll size={11} /> All
							</button>
							<button className="sl-btn sl-btn--sm" onClick={() => setExcludedAllowed(new Set(actionKeys))}>
								<IconUncheckAll size={11} /> None
							</button>
						</div>
						<div className="state-lab__list">
							{actions.map((a) => {
								const keyValue = actionKey(a);
								const delta = scoreDeltaByAction[keyValue];
								return (
									<label
										key={keyValue}
										className={`state-lab__item state-lab__item--hoverable${hoveredActionKey === keyValue ? ' state-lab__item--hovered' : ''}`}
										onMouseEnter={() => setHoveredActionKey(keyValue)}
										onMouseLeave={() => setHoveredActionKey(null)}
									>
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
										<span className="state-lab__score-chip">{delta ?? 0}</span>
										<input
											className="state-lab__score-input"
											type="number"
											placeholder="exp"
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
					</CollapsibleSection>

					{/* Additional Allowed */}
					<CollapsibleSection title="Additional Allowed" icon={<IconPlus size={12} />} defaultOpen={false}>
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
								className="sl-btn sl-btn--sm"
								onClick={() => {
									const built = buildActionKey(allowedForm);
									if (!built) return;
									setExtraAllowed((prev) => [...prev, built]);
								}}
							>
								<IconPlus size={11} /> Add Allowed
							</button>
							{extraAllowed.length > 0 && (
								<div className="state-lab__list">
									{extraAllowed.map((item, i) => (
										<div
											key={`${item}-${i}`}
											className={`state-lab__item state-lab__item--inline state-lab__item--hoverable${hoveredActionKey === item ? ' state-lab__item--hovered' : ''}`}
											onMouseEnter={() => setHoveredActionKey(item)}
											onMouseLeave={() => setHoveredActionKey(null)}
										>
											<span>{item}</span>
											<input
												className="state-lab__score-input"
												type="number"
												placeholder="exp"
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
											<ToolButton
												icon={<IconTrash size={12} />}
												label="Remove"
												onClick={() => setExtraAllowed((prev) => prev.filter((_, idx) => idx !== i))}
											/>
										</div>
									))}
								</div>
							)}
						</div>
					</CollapsibleSection>

					{/* Expected Illegal */}
					<CollapsibleSection title="Expected Illegal" icon={<IconBan size={12} />} defaultOpen={false} badge={expectedIllegal.length || undefined}>
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
								className="sl-btn sl-btn--sm"
								onClick={() => {
									const built = buildActionKey(illegalForm);
									if (!built) return;
									setExpectedIllegal((prev) => [...prev, built]);
								}}
							>
								<IconBan size={11} /> Add Illegal
							</button>
							{expectedIllegal.length > 0 && (
								<div className="state-lab__list">
									{expectedIllegal.map((item, i) => (
										<div
											key={`${item}-${i}`}
											className={`state-lab__item state-lab__item--inline state-lab__item--hoverable${hoveredActionKey === item ? ' state-lab__item--hovered' : ''}`}
											onMouseEnter={() => setHoveredActionKey(item)}
											onMouseLeave={() => setHoveredActionKey(null)}
										>
											<span>{item}</span>
											<ToolButton
												icon={<IconTrash size={12} />}
												label="Remove"
												onClick={() => setExpectedIllegal((prev) => prev.filter((_, idx) => idx !== i))}
											/>
										</div>
									))}
								</div>
							)}
						</div>
					</CollapsibleSection>

					{/* Test Output */}
					<CollapsibleSection title="Test Output" icon={<IconFile size={12} />} defaultOpen={false}>
						<div className="state-lab__note">Outputs generated test code. Use File menu to save or copy.</div>
						<div className="sl-button-row" style={{ marginBottom: 8 }}>
							<button className="sl-btn sl-btn--sm" onClick={() => navigator.clipboard.writeText(exportTest)}>
								<IconCopy size={11} /> Copy
							</button>
							<button className="sl-btn sl-btn--sm sl-btn--primary" onClick={createTestFile} disabled={createStatus === 'saving'}>
								<IconSave size={11} /> {createStatus === 'saving' ? 'Creating...' : 'Create'}
							</button>
						</div>
						<pre className="state-lab__code">
							<code>{exportTest}</code>
						</pre>
					</CollapsibleSection>
				</aside>

				<main className="state-lab__board">
					<Board
						rules={rules}
						board={G.board}
						lanes={G.lanes}
						phantomLanes={hoveredLane ? [hoveredLane] : phantomLanes}
						phantomOpacity={hoveredLane ? 0.8 : 0.35}
						phantomDash={hoveredLane ? '0' : '6,4'}
						radius={G.radius}
						onHexClick={onHexClick}
						showCoords
						highlightCoords={hoveredHighlightCoords.length > 0 ? hoveredHighlightCoords : highlightCoords}
						highlightColor={hoveredLane ? '#f59e0b' : '#8b5cf6'}
						origins={G.origins}
						selectedColor={mode === 'path' ? selectedColor : null}
						selectedSourceDot={pendingSource}
					/>
				</main>
			</div>

			{/* Load State Dialog */}
			{showLoadStateDialog && (
				<div className="sl-dialog-overlay" onClick={() => setShowLoadStateDialog(false)}>
					<div className="sl-dialog" onClick={(e) => e.stopPropagation()}>
						<div className="sl-dialog__header">
							<h3>Load State</h3>
							<button className="sl-dialog__close" onClick={() => setShowLoadStateDialog(false)}>
								<IconX size={14} />
							</button>
						</div>
						<div className="sl-dialog__body">
							<div className="state-lab__note">Paste exported game state JSON (from the gear button in-game).</div>
							<textarea
								rows={8}
								value={loadStateText}
								onChange={(e) => setLoadStateText(e.target.value)}
								placeholder='Paste game state JSON here...'
								className="sl-textarea"
								autoFocus
							/>
						</div>
						<div className="sl-dialog__footer">
							{loadStateStatus && <span className={`sl-dialog__status ${loadStateStatus.startsWith('Failed') ? 'sl-dialog__status--error' : ''}`}>{loadStateStatus}</span>}
							<button className="sl-btn" onClick={() => setShowLoadStateDialog(false)}>Cancel</button>
							<button
								className="sl-btn sl-btn--primary"
								onClick={() => {
									try {
										loadStateFromJSON(loadStateText);
										setLoadStateStatus('Loaded state into lab.');
										setShowLoadStateDialog(false);
									} catch (err) {
										setLoadStateStatus(err instanceof Error ? err.message : 'Failed to load state.');
									}
								}}
								disabled={!loadStateText.trim()}
							>
								Load
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
