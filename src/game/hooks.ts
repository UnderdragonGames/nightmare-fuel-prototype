import type { GState, GameEvent, HookDef, HookSideEffect } from './types';

export type EmitResult = { blocked: boolean; firedHookIds: string[] };

const matchesFilters = (hook: HookDef, event: GameEvent): boolean => {
	if (hook.event !== event.type) return false;
	if (hook.targetPlayerId !== undefined && 'playerId' in event && event.playerId !== hook.targetPlayerId) return false;
	if (hook.stat !== undefined && 'stat' in event && event.stat !== hook.stat) return false;
	return true;
};

const applySideEffect = (G: GState, effect: HookSideEffect): void => {
	switch (effect.type) {
		case 'discardSourceCard': {
			const idx = G.action.attachedCards.findIndex((a) => a.card.id === effect.sourceCardId);
			if (idx >= 0) {
				const [attached] = G.action.attachedCards.splice(idx, 1);
				if (attached) G.discard.push(attached.card);
			}
			break;
		}
		case 'moveFaceUpToDiscard': {
			const idx = G.action.faceUpDrawPile.findIndex((c) => c.id === effect.sourceCardId);
			if (idx >= 0) {
				const [card] = G.action.faceUpDrawPile.splice(idx, 1);
				if (card) G.discard.push(card);
			}
			break;
		}
	}
};

export const emitEvent = (G: GState, event: GameEvent): EmitResult => {
	const matching = G.action.hooks.filter((h) => matchesFilters(h, event));
	if (matching.length === 0) return { blocked: false, firedHookIds: [] };

	// Sort: block → modify → observe
	const order: Record<HookDef['behavior'], number> = { block: 0, modify: 1, observe: 2 };
	matching.sort((a, b) => order[a.behavior] - order[b.behavior]);

	// Deduplicate by behavior type — only fire one hook per behavior
	const firedBehaviors = new Set<string>();
	const firedHookIds: string[] = [];
	let blocked = false;

	for (const hook of matching) {
		if (firedBehaviors.has(hook.behavior)) continue;
		firedBehaviors.add(hook.behavior);

		if (hook.behavior === 'block') blocked = true;

		for (const effect of hook.sideEffects) {
			applySideEffect(G, effect);
		}

		firedHookIds.push(hook.id);

		if (hook.oneShot) {
			const idx = G.action.hooks.indexOf(hook);
			if (idx >= 0) G.action.hooks.splice(idx, 1);
		}
	}

	return { blocked, firedHookIds };
};

export const registerHook = (G: GState, hook: HookDef): void => {
	G.action.hooks.push(hook);
};

export const removeHooksBySource = (G: GState, sourceCardId: number): void => {
	G.action.hooks = G.action.hooks.filter((h) => h.sourceCardId !== sourceCardId);
};
