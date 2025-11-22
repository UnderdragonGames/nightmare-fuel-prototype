import React from 'react';
import type { PlayerID } from 'boardgame.io';
import type { Card, Color, PlayerPrefs } from '../game/types';
import { asVisibleColor, serializeCard } from '../game/helpers';
import { RULES } from '../game/rulesConfig';

type Props = {
	currentPlayer: PlayerID;
	viewer: PlayerID;
	numPlayers: number;
	onSelectViewer: (pid: PlayerID) => void;
	onAddPlayer: () => void;
	onRemovePlayer: () => void;
	deckCount: number;
	discardCount: number;
	onEndTurn: () => void;
	onStash: () => void;
	botByPlayer: Record<PlayerID, 'None' | 'Random'>;
	onBotChange: (pid: PlayerID, b: 'None' | 'Random') => void;
	onBotPlay: (pid: PlayerID) => void;
	revealHands: boolean;
	onToggleRevealHands: (v: boolean) => void;
	hands: Record<PlayerID, Card[]>;
	prefs: Record<PlayerID, PlayerPrefs>;
  canStash?: boolean;
  canEndTurn?: boolean;
};

export const Sidebar: React.FC<Props> = ({ currentPlayer, viewer, numPlayers, onSelectViewer, onAddPlayer, onRemovePlayer, deckCount, discardCount, onEndTurn, onStash, botByPlayer, onBotChange, onBotPlay, revealHands, onToggleRevealHands, hands, prefs, canStash = true, canEndTurn = true }) => {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<strong>Players</strong>
				<button onClick={onAddPlayer} title="Add player">+</button>
				<button onClick={onRemovePlayer} title="Remove player" disabled={numPlayers <= 2}>-</button>
			</div>
			<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
				<label>Viewer:</label>
				<select value={viewer} onChange={(e) => onSelectViewer(e.target.value as PlayerID)}>
					{Array.from({ length: numPlayers }).map((_, i) => (
						<option key={i} value={String(i)}>{`P${i}`}</option>
					))}
				</select>
			</div>
			<ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
				{Array.from({ length: numPlayers }).map((_, i) => {
					const pid = String(i) as PlayerID;
					const isTurn = pid === currentPlayer;
					return (
						<li key={pid} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
								<span style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1', background: 'white' }}>P{pid}</span>
								{isTurn && <span style={{ color: '#16a34a', fontSize: 12 }}>● Turn</span>}
							</div>
							<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
								<select value={botByPlayer[pid] ?? 'None'} onChange={(e) => onBotChange(pid, e.target.value as 'None' | 'Random')}>
									<option>None</option>
									<option>Random</option>
								</select>
								<button onClick={() => onBotPlay(pid)} disabled={!isTurn}>Play until stuck</button>
								<span title="Goals" style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4 }}>
									{(RULES.COLORS as Color[])
										.filter((col) => {
											const p = prefs[pid];
											return !!p && (p.primary === col || p.secondary === col || p.tertiary === col);
										})
										.map((col) => (
											<span key={col} style={{ background: asVisibleColor(col), width: 10, height: 10, borderRadius: 2, display: 'inline-block', opacity: 0.9 }} />
										))}
								</span>
							</div>
						</li>
					);
				})}
			</ul>
			<div style={{ height: 1, background: '#e5e7eb', margin: '8px 0' }} />
			<div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
				<div><strong>Deck</strong>: {deckCount}</div>
				<div><strong>Discard</strong>: {discardCount}</div>
			</div>
			<div style={{ display: 'flex', gap: 8 }}>
				<button onClick={onStash} disabled={!canStash}>Stash</button>
				<button onClick={onEndTurn} disabled={!canEndTurn}>End Turn & Refill</button>
			</div>
			<div style={{ height: 1, background: '#e5e7eb', margin: '8px 0' }} />
			<label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
				<input type="checkbox" checked={revealHands} onChange={(e) => onToggleRevealHands(e.target.checked)} /> Reveal hands
			</label>
			{revealHands && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{Array.from({ length: numPlayers }).map((_, i) => {
						const pid = String(i) as PlayerID;
						const cards = hands[pid] ?? [];
						return (
							<div key={`hand-${pid}`} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 6 }}>
								<div style={{ marginBottom: 4 }}><strong>P{pid}</strong> hand ({cards.length})</div>
								<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
									{cards.map((c, idx) => (
										<div key={`${serializeCard(c)}-${idx}`} style={{ display: 'flex', gap: 4 }}>
											{[...c.colors]
												.sort((a, b) => (RULES.COLORS as Color[]).indexOf(a) - (RULES.COLORS as Color[]).indexOf(b))
												.map((col) => (
													<span key={col} title={col} style={{ background: asVisibleColor(col), width: 10, height: 10, borderRadius: 2, display: 'inline-block' }} />
												))}
										</div>
									))}
								{cards.length === 0 && <div style={{ color: '#64748b' }}>Empty</div>}
							</div>
						</div>
					);
					})}
				</div>
			)}
		</div>
	);
};


