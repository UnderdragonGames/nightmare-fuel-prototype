import React from 'react';

type Props = {
	scores: Record<string, number> | null;
};

export const ScorePanel: React.FC<Props> = ({ scores }) => {
	if (!scores) return null;
	return (
		<div style={{ border: '1px solid #cbd5e1', padding: 8, borderRadius: 6 }}>
			<strong>Scores</strong>
			<ul>
				{Object.entries(scores).map(([pid, s]) => (
					<li key={pid}>P{pid}: {s}</li>
				))}
			</ul>
		</div>
	);
};


