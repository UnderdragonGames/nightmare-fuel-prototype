import React from 'react';
import type { PlayerID } from 'boardgame.io';
import { asVisibleColor } from '../game/helpers';
import type { Color } from '../game/types';

type Props = {
	players: PlayerID[];
	currentPlayer: PlayerID;
	scores: Record<PlayerID, number>;
	goalsByPlayer: Record<PlayerID, { primary: Color; secondary: Color; tertiary: Color }>;
	botByPlayer: Record<PlayerID, boolean>;
	onToggleBot: (pid: PlayerID, isBot: boolean) => void;
};

export const Players: React.FC<Props> = ({ players, currentPlayer, scores, goalsByPlayer, botByPlayer, onToggleBot }) => {
	return (
		<div style={{ color: '#111827' }}>
			<h4>Players</h4>
			<ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
				{players.map((pid) => {
					const isTurn = pid === currentPlayer;
					const goals = goalsByPlayer[pid]!;
					return (
						<li key={pid} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, background: isTurn ? '#f0fdf4' : 'white', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8, color: '#111827' }}>
							<span style={{ fontWeight: 600 }}>P{pid}</span>
							<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
								<span title="Score">{scores[pid] ?? 0}</span>
								<span title="Goals" style={{ display: 'inline-flex', gap: 4 }}>
									<span style={{ background: asVisibleColor(goals.primary), width: 10, height: 10, borderRadius: 2, display: 'inline-block' }} />
									<span style={{ background: asVisibleColor(goals.secondary), width: 10, height: 10, borderRadius: 2, display: 'inline-block' }} />
									<span style={{ background: asVisibleColor(goals.tertiary), width: 10, height: 10, borderRadius: 2, display: 'inline-block' }} />
								</span>
							</div>
							<label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
								<input type="checkbox" checked={!!botByPlayer[pid]} onChange={(e) => onToggleBot(pid, e.target.checked)} /> Bot
							</label>
						</li>
					);
				})}
			</ul>
		</div>
	);
};


