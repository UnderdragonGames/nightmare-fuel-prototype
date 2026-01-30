import type { Card, Color } from './types';

export const makeCard = (colors: Color[], overrides: Partial<Omit<Card, 'colors'>> = {}): Card => {
	const stats = overrides.stats ?? {};
	const synergies = overrides.synergies ?? [];
	const text = overrides.text ?? null;

	return {
		id: overrides.id ?? 0,
		name: overrides.name ?? 'Custom Card',
		colors: [...colors],
		stats,
		text,
		isAction: overrides.isAction ?? Boolean(text),
		synergies,
		synergyCount: overrides.synergyCount ?? synergies.length,
		flags: overrides.flags ?? { needsNewPrint: false, needsDuplicate: false },
	};
};
