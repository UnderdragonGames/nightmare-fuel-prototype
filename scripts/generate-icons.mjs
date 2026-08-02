// Generates the PWA icon set (public/icons/*.png) without any image library:
// pixels are drawn into a buffer and encoded as PNG via node:zlib. Rerun after
// changing the artwork; commit the PNGs (the build doesn't run this).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_DIR = resolve(new URL('..', import.meta.url).pathname, 'public', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

const crcTable = (() => {
	const t = new Int32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c;
	}
	return t;
})();

const crc32 = (buf) => {
	let c = 0xffffffff;
	for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
};

const encodePng = (size, pixels /* RGBA Uint8Array */) => {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	// filter 0 per scanline
	const raw = Buffer.alloc(size * (size * 4 + 1));
	for (let y = 0; y < size; y += 1) {
		raw[y * (size * 4 + 1)] = 0;
		pixels.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => {
			raw[y * (size * 4 + 1) + 1 + i] = v;
		});
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	]);
};

// ── Artwork: dark rounded square, purple hex outline, colored path dots ──
const BG = [0x12, 0x12, 0x1b, 255];
const HEX = [0x8b, 0x5c, 0xf6, 255];
const DOTS = [
	[0xdd, 0x55, 0x66], // R
	[0xf9, 0x73, 0x16], // O
	[0xff, 0xee, 0x55], // Y
];

const drawIcon = (size) => {
	const px = new Uint8Array(size * size * 4);
	const set = (x, y, [r, g, b, a = 255]) => {
		if (x < 0 || y < 0 || x >= size || y >= size) return;
		const i = (y * size + x) * 4;
		px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
	};
	const c = size / 2;
	const corner = size * 0.18;

	// Rounded-square background
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const dx = Math.max(corner - x, x - (size - 1 - corner), 0);
			const dy = Math.max(corner - y, y - (size - 1 - corner), 0);
			if (Math.hypot(dx, dy) <= corner) set(x, y, BG);
		}
	}

	// Hexagon outline (flat-topped), thick relative to size
	const R = size * 0.34;
	const verts = Array.from({ length: 6 }, (_, i) => {
		const a = (Math.PI / 180) * (60 * i);
		return [c + R * Math.cos(a), c + R * Math.sin(a)];
	});
	const thick = Math.max(2, size * 0.045);
	for (let i = 0; i < 6; i += 1) {
		const [x1, y1] = verts[i];
		const [x2, y2] = verts[(i + 1) % 6];
		const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2);
		for (let s = 0; s <= steps; s += 1) {
			const x = x1 + ((x2 - x1) * s) / steps;
			const y = y1 + ((y2 - y1) * s) / steps;
			for (let oy = -thick; oy <= thick; oy += 1) {
				for (let ox = -thick; ox <= thick; ox += 1) {
					if (ox * ox + oy * oy <= thick * thick) set(Math.round(x + ox), Math.round(y + oy), HEX);
				}
			}
		}
	}

	// Three colored path dots across the middle
	const dotR = size * 0.07;
	DOTS.forEach(([r, g, b], i) => {
		const dx = c + (i - 1) * size * 0.17;
		for (let oy = -dotR; oy <= dotR; oy += 1) {
			for (let ox = -dotR; ox <= dotR; ox += 1) {
				if (ox * ox + oy * oy <= dotR * dotR) set(Math.round(dx + ox), Math.round(c + oy), [r, g, b, 255]);
			}
		}
	});

	return encodePng(size, px);
};

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
	writeFileSync(resolve(OUT_DIR, name), drawIcon(size));
	console.log(`wrote public/icons/${name}`);
}
