import React from 'react';

type Zone = 'hand' | 'treasure' | 'discard';

type Props = {
	expandedZone: Zone | null;
	onZoneToggle: (zone: Zone) => void;
	handCount: number;
	treasureCount: number;
	discardCount: number;
};

export const ZoneTabBar: React.FC<Props> = ({
	expandedZone,
	onZoneToggle,
	handCount,
	treasureCount,
	discardCount,
}) => {
	const tabs: { zone: Zone; label: string; count: number }[] = [
		{ zone: 'hand', label: 'Hand', count: handCount },
		{ zone: 'treasure', label: 'Treasure', count: treasureCount },
		{ zone: 'discard', label: 'Discard', count: discardCount },
	];

	return (
		<div className="zone-tab-bar">
			{tabs.map(({ zone, label, count }) => (
				<button
					key={zone}
					className={`zone-tab-bar__tab ${expandedZone === zone ? 'zone-tab-bar__tab--active' : ''}`}
					onClick={() => onZoneToggle(zone)}
				>
					<span className="zone-tab-bar__label">{label}</span>
					<span className="zone-tab-bar__count">{count}</span>
				</button>
			))}
		</div>
	);
};
