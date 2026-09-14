#!/usr/bin/env node
// Design-token guard: fail on forbidden legacy colors / radii / shadows in frontend/src.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const HEX = ['#2a2e35', '#0ea5e9', '#38bdf8', '#06b6d4', '#3b82f6', '#6366f1'];
// ponytail: substring matching; no word-boundary regex — Tailwind class names are unique prefixes so no false hits (rounded-full never contains these).
const RADIUS = ['rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-4xl'];
const SHADOW = ['shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl'];
const GRADIENT = ['linear-gradient', 'radial-gradient', 'conic-gradient', '<lineargradient', '<radialgradient'];

const exts = new Set(['.css', '.ts', '.tsx']);

function* walk(dir) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = `${dir}/${e.name}`;
		if (e.isDirectory()) yield* walk(p);
		else if (exts.has(e.name.slice(e.name.lastIndexOf('.')))) yield p;
	}
}

const violations = [];
for (const file of walk(SRC)) {
	const lines = readFileSync(file, 'utf8').split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].toLowerCase();
		for (const pat of HEX) if (line.includes(pat)) violations.push(`${file}:${i + 1}: forbidden hex color ${pat}`);
		const orig = lines[i];
		for (const pat of RADIUS) if (orig.includes(pat)) violations.push(`${file}:${i + 1}: forbidden radius class ${pat}`);
		for (const pat of SHADOW) if (orig.includes(pat)) violations.push(`${file}:${i + 1}: forbidden shadow class ${pat}`);
		for (const pat of GRADIENT) if (line.includes(pat)) violations.push(`${file}:${i + 1}: forbidden gradient ${pat}`);
	}
}

if (violations.length) {
	console.error(`check:design FAIL (${violations.length} violations)\n` + violations.join('\n'));
	process.exit(1);
}
console.log('check:design OK');
