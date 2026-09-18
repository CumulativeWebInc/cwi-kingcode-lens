#!/usr/bin/env node
/**
 * tools/build-demo.mjs — Emits the Pages demo's web bundle.
 *
 * Uses MetaDisplayAdapter.emitWebBundle() (the backend that targets the
 * 600x600 additive display) to copy the adapter-agnostic src/*.js modules
 * into docs/vendor/src/, so the simulator runs the SAME code the conformance
 * suite tests. Run: npm run build:demo
 */
import { MetaDisplayAdapter } from '../src/adapters.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const emitted = await MetaDisplayAdapter.emitWebBundle(
  path.join(root, 'src'),
  path.join(root, 'docs', 'vendor', 'src'),
);
console.log(`demo bundle: ${emitted.length} modules -> docs/vendor/src/`);
for (const f of emitted) console.log('  ' + path.basename(f));
