import React from 'react';

type Zone = 'hand' | 'treasure' | 'discard';

type Props = {
	expandedZone: Zone | null;
	onZoneToggle: (zone: Zone) => void;
	handCount: number;
	treasureCount: number;
	discardCount: number;
	/** True when a hand card is selected (or discard picks are staged) while the panel is closed. */
	hasHandSelection?: boolean;
	/** CSS color of the selected card's chosen color; null shows a neutral dot. */
	handSelectionColor?: string | null;
};

export const ZoneTabBar: React.FC<Props> = ({
	expandedZone,
	onZoneToggle,
	handCount,
	treasureCount,
	discardCount,
	hasHandSelection = false,
	handSelectionColor = null,
}) => {
	const tabs: { zone: Zone; label: string; count: number }[] = [
		{ zone: 'hand', label: 'Hand', count: handCount },
		{ zone: 'treasure', label: 'Treasure', count: treasureCount },
		{ zone: 'discard', label: 'Discard', count: discardCount },
	];

	return (
		<div className="zone-tab-bar">
			{tabs.map(({ zone, label, count }) => {
				const showSelection = zone === 'hand' && hasHandSelection;
				return (
					<button
						key={zone}
						className={`zone-tab-bar__tab ${expandedZone === zone ? 'zone-tab-bar__tab--active' : ''} ${showSelection ? 'zone-tab-bar__tab--has-selection' : ''}`}
						onClick={() => onZoneToggle(zone)}
					>
						{showSelection && (
							<span
								className="zone-tab-bar__selection-dot"
								style={handSelectionColor ? { background: handSelectionColor, boxShadow: `0 0 6px ${handSelectionColor}` } : undefined}
							/>
						)}
						<span className="zone-tab-bar__label">{label}</span>
						<span className="zone-tab-bar__count">{count}</span>
					</button>
				);
			})}
		</div>
	);
};
