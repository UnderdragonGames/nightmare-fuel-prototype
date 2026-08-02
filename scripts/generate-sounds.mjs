/**
 * Generates the game's sound pack as 16-bit mono WAV files in public/sounds/.
 *
 * The sounds are synthesized (envelopes + harmonics + shaped noise), so the
 * pack is self-owned with no licensing concerns. To swap in recorded samples
 * later (e.g. Kenney CC0 packs), replace the files keeping the same names.
 *
 *   node scripts/generate-sounds.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 44100;
const OUT = new URL('../public/sounds/', import.meta.url).pathname;

const render = (seconds, fn) => {
	const n = Math.floor(seconds * RATE);
	const data = new Float32Array(n);
	for (let i = 0; i < n; i += 1) data[i] = fn(i / RATE, i / n);
	return data;
};

// t: seconds, p: progress 0..1
const env = (p, attack = 0.02, curve = 2.2) =>
	p < attack ? p / attack : Math.pow(1 - (p - attack) / (1 - attack), curve);

const tone = (t, freq, harmonics = [1, 0.35, 0.12]) =>
	harmonics.reduce((sum, amp, i) => sum + amp * Math.sin(2 * Math.PI * freq * (i + 1) * t), 0);

let noiseState = 12345;
const noise = () => {
	noiseState = (noiseState * 1103515245 + 12345) & 0x7fffffff;
	return (noiseState / 0x3fffffff) - 1;
};

const mix = (...layers) => {
	const n = Math.max(...layers.map((l) => l.length));
	const out = new Float32Array(n);
	for (const l of layers) for (let i = 0; i < l.length; i += 1) out[i] += l[i];
	return out;
};

const note = (freq, dur, { delay = 0, vol = 1, harmonics, attack, curve } = {}) => {
	const pad = Math.floor(delay * RATE);
	const body = render(dur, (t, p) => vol * env(p, attack, curve) * tone(t, freq, harmonics));
	const out = new Float32Array(pad + body.length);
	out.set(body, pad);
	return out;
};

const wav = (samples) => {
	// normalize to 0.82 peak
	let peak = 0;
	for (const s of samples) peak = Math.max(peak, Math.abs(s));
	const gain = peak > 0 ? 0.82 / peak : 1;
	const n = samples.length;
	const buf = Buffer.alloc(44 + n * 2);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * 2, 4);
	buf.write('WAVEfmt ', 8);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20); // PCM
	buf.writeUInt16LE(1, 22); // mono
	buf.writeUInt32LE(RATE, 24);
	buf.writeUInt32LE(RATE * 2, 28);
	buf.writeUInt16LE(2, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * 2, 40);
	for (let i = 0; i < n; i += 1) {
		buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), 44 + i * 2);
	}
	return buf;
};

const A4 = 440;
const st = (semis) => A4 * Math.pow(2, semis / 12);

const sounds = {
	// Soft pluck with a slight pitch drop — a piece landing.
	place: render(0.14, (t, p) => env(p, 0.005, 3) * tone(t, st(7) * (1 - 0.08 * p), [1, 0.4, 0.15])),

	// Airy upward sweep — a piece turning.
	rotate: render(0.16, (t, p) => {
		const sweep = tone(t, 500 + 900 * p, [1, 0.2]);
		return env(p, 0.03, 2) * (0.65 * sweep + 0.25 * noise() * (1 - p));
	}),

	// Low thud with a noise transient — blocking a tile.
	block: mix(
		render(0.2, (t, p) => env(p, 0.004, 3.5) * tone(t, 95 * (1 - 0.25 * p), [1, 0.5, 0.2])),
		render(0.05, (t, p) => 0.35 * (1 - p) * noise()),
	),

	// Quick 3-note sparkle — an action card resolving.
	action: mix(
		note(st(4), 0.1, { vol: 0.8 }),
		note(st(9), 0.1, { delay: 0.07, vol: 0.8 }),
		note(st(16), 0.16, { delay: 0.14, vol: 0.9 }),
	),

	// Detuned shimmer — a nightmare ability.
	ability: render(0.34, (t, p) => {
		const a = tone(t, st(14), [1, 0.3]);
		const b = tone(t, st(14) * 1.01, [1, 0.3]);
		const c = tone(t, st(21), [0.5]);
		return env(p, 0.04, 1.8) * (0.4 * a + 0.4 * b + 0.3 * c);
	}),

	// Two-note rising chime — your turn.
	'your-turn': mix(
		note(st(-2), 0.16, { vol: 0.75 }),
		note(st(5), 0.28, { delay: 0.12, vol: 0.95, curve: 1.8 }),
	),

	// Ascending arpeggio — game start.
	'game-start': mix(
		note(st(-7), 0.16, { vol: 0.7 }),
		note(st(-3), 0.16, { delay: 0.11, vol: 0.8 }),
		note(st(0), 0.16, { delay: 0.22, vol: 0.85 }),
		note(st(5), 0.3, { delay: 0.33, vol: 1, curve: 1.6 }),
	),

	// Settling descent — game over.
	'game-over': mix(
		note(st(5), 0.22, { vol: 0.85 }),
		note(st(0), 0.22, { delay: 0.16, vol: 0.85 }),
		note(st(-7), 0.45, { delay: 0.32, vol: 1, curve: 1.4 }),
	),

	// Low double-buzz — match cancelled.
	cancel: mix(
		render(0.12, (t, p) => env(p, 0.01, 2) * tone(t, 130, [1, 0.6, 0.3])),
		(() => {
			const second = render(0.18, (t, p) => env(p, 0.01, 2) * tone(t, 98, [1, 0.6, 0.3]));
			const out = new Float32Array(Math.floor(0.15 * RATE) + second.length);
			out.set(second, Math.floor(0.15 * RATE));
			return out;
		})(),
	),

	// Reverse blip — undo.
	undo: render(0.13, (t, p) => env(1 - p, 0.15, 2) * tone(t, st(12) - 300 * p, [1, 0.3]) * 0.9),
};

mkdirSync(OUT, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
	const file = join(OUT, `${name}.wav`);
	writeFileSync(file, wav(samples));
	console.log(`${name}.wav — ${(samples.length / RATE).toFixed(2)}s`);
}
console.log(`\nwrote ${Object.keys(sounds).length} sounds to public/sounds/`);
