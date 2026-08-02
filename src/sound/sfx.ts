/**
 * Sound-effect manager over the generated pack in public/sounds/
 * (see scripts/generate-sounds.mjs — swap the .wav files to reskin).
 *
 * Uses Web Audio (not HTMLAudioElement) deliberately: iOS only allows an
 * <audio> element to play if IT was started inside a user gesture, which
 * silenced sounds triggered by OPPONENT moves arriving over the socket.
 * With Web Audio, resuming the single AudioContext on the first tap
 * unlocks all future playback, whatever triggers it.
 */

export type SfxName =
	| 'place'
	| 'rotate'
	| 'block'
	| 'action'
	| 'ability'
	| 'turn-end'
	| 'your-turn'
	| 'game-start'
	| 'game-over'
	| 'cancel'
	| 'undo';

const ALL_SOUNDS: SfxName[] = [
	'place', 'rotate', 'block', 'action', 'ability', 'turn-end',
	'your-turn', 'game-start', 'game-over', 'cancel', 'undo',
];

const VOLUMES: Record<SfxName, number> = {
	place: 0.45,
	rotate: 0.4,
	block: 0.5,
	action: 0.45,
	ability: 0.5,
	'turn-end': 0.55,
	'your-turn': 0.5,
	'game-start': 0.55,
	'game-over': 0.55,
	cancel: 0.5,
	undo: 0.35,
};

let audioCtx: AudioContext | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
const loading = new Set<SfxName>();
let muted = false;
let primed = false;

const ensureCtx = (): AudioContext | null => {
	if (typeof window === 'undefined') return null;
	if (!audioCtx) {
		const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return null;
		audioCtx = new Ctor();
	}
	return audioCtx;
};

const load = async (name: SfxName): Promise<void> => {
	if (buffers.has(name) || loading.has(name)) return;
	const ctx = ensureCtx();
	if (!ctx) return;
	loading.add(name);
	try {
		const res = await fetch(`/sounds/${name}.wav`);
		const data = await res.arrayBuffer();
		buffers.set(name, await ctx.decodeAudioData(data));
	} catch {
		/* missing/undecodable sound — stay silent */
	} finally {
		loading.delete(name);
	}
};

const playBuffer = (ctx: AudioContext, buffer: AudioBuffer, volume: number): void => {
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	const gain = ctx.createGain();
	gain.gain.value = volume;
	source.connect(gain);
	gain.connect(ctx.destination);
	source.start();
};

export const setSfxMuted = (value: boolean): void => {
	muted = value;
};

export const playSfx = (name: SfxName): void => {
	if (muted) return;
	const ctx = ensureCtx();
	if (!ctx) return;
	if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
	const buffer = buffers.get(name);
	if (buffer) {
		playBuffer(ctx, buffer, VOLUMES[name]);
		return;
	}
	// Not loaded yet (e.g. sound fired before the first prime) — best effort.
	void load(name).then(() => {
		const late = buffers.get(name);
		if (late && !muted) playBuffer(ctx, late, VOLUMES[name]);
	});
};

/** Unlock the audio context and preload the pack on the first user gesture. */
export const primeSfx = (): void => {
	if (primed || typeof window === 'undefined') return;
	primed = true;
	const unlock = (): void => {
		const ctx = ensureCtx();
		if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
		for (const name of ALL_SOUNDS) void load(name);
	};
	window.addEventListener('pointerdown', unlock, { once: true });
};
