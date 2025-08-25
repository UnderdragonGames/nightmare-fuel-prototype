import React from 'react';
import type { PlayerPrefs } from '../game/types';
import { RULES } from '../game/rulesConfig';

type Props = {
	currentPlayer: string;
	deckCount: number;
	discardCount: number;
	onEndTurn: () => void;
	onStash: () => void;
	prefs: PlayerPrefs;
	onChangePrefs: (prefs: PlayerPrefs) => void;
	onScoreNow: () => void;
	bot: 'None' | 'Random';
	onBotChange: (b: 'None' | 'Random') => void;
	onBotPlay: () => void;
};

export const Controls: React.FC<Props> = ({ currentPlayer, deckCount, discardCount, onEndTurn, onStash, prefs, onChangePrefs, onScoreNow, bot, onBotChange, onBotPlay }) => {
	return (
		<div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
			<div><strong>Player</strong>: {currentPlayer}</div>
			<div><strong>Deck</strong>: {deckCount}</div>
			<div><strong>Discard</strong>: {discardCount}</div>
			<button onClick={onStash}>Stash</button>
			<button onClick={onEndTurn}>End Turn & Refill</button>
			<button onClick={onScoreNow}>Score Now</button>
			<div>
				<label>Bot: </label>
				<select value={bot} onChange={(e) => onBotChange(e.target.value as any)}>
					<option>None</option>
					<option>Random</option>
				</select>
				<button onClick={onBotPlay} disabled={bot === 'None'}>Let Bot Play</button>
			</div>
			<div style={{ display: 'flex', gap: 6 }}>
				<select value={prefs.primary} onChange={(e) => onChangePrefs({ ...prefs, primary: e.target.value as any })}>
					{RULES.COLORS.map((c) => <option key={`p-${c}`}>{c}</option>)}
				</select>
				<select value={prefs.secondary} onChange={(e) => onChangePrefs({ ...prefs, secondary: e.target.value as any })}>
					{RULES.COLORS.map((c) => <option key={`s-${c}`}>{c}</option>)}
				</select>
				<select value={prefs.tertiary} onChange={(e) => onChangePrefs({ ...prefs, tertiary: e.target.value as any })}>
					{RULES.COLORS.map((c) => <option key={`t-${c}`}>{c}</option>)}
				</select>
			</div>
		</div>
	);
};


