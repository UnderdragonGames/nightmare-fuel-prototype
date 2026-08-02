/**
 * Tiny sound-effect manager over the generated pack in public/sounds/
 * (see scripts/generate-sounds.mjs — swap the .wav files to reskin).
 *
 * - Overlapping plays are allowed (each play clones the cached element).
 * - iOS/Safari require a user gesture before audio: primeSfx() preloads on
 *   the first pointerdown, and play failures are silently ignored.
 */

export type SfxName =
	| 'place'
	| 'rotate'
	| 'block'
	| 'action'
	| 'ability'
	| 'your-turn'
	| 'game-start'
	| 'game-over'
	| 'cancel'
	| 'undo';

const ALL_SOUNDS: SfxName[] = [
	'place', 'rotate', 'block', 'action', 'ability',
	'your-turn', 'game-start', 'game-over', 'cancel', 'undo',
];

const VOLUMES: Record<SfxName, number> = {
	place: 0.45,
	rotate: 0.4,
	block: 0.5,
	action: 0.45,
	ability: 0.5,
	'your-turn': 0.5,
	'game-start': 0.55,
	'game-over': 0.55,
	cancel: 0.5,
	undo: 0.35,
};

const cache = new Map<SfxName, HTMLAudioElement>();
let muted = false;
let primed = false;

const ensure = (name: SfxName): HTMLAudioElement => {
	let audio = cache.get(name);
	if (!audio) {
		audio = new Audio(`/sounds/${name}.wav`);
		audio.preload = 'auto';
		cache.set(name, audio);
	}
	return audio;
};

export const setSfxMuted = (value: boolean): void => {
	muted = value;
};

export const playSfx = (name: SfxName): void => {
	if (muted || typeof window === 'undefined') return;
	try {
		const clone = ensure(name).cloneNode(true) as HTMLAudioElement;
		clone.volume = VOLUMES[name];
		void clone.play().catch(() => {
			/* autoplay blocked before first gesture — fine */
		});
	} catch {
		/* no audio support */
	}
};

/** Preload the pack on the first user gesture (also unlocks iOS audio). */
export const primeSfx = (): void => {
	if (primed || typeof window === 'undefined') return;
	primed = true;
	const unlock = (): void => {
		for (const name of ALL_SOUNDS) ensure(name);
	};
	window.addEventListener('pointerdown', unlock, { once: true });
};
