import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/extension', { recursive: true });
await cp('extension', 'dist/extension', { recursive: true });
await build({ entryPoints: ['src/background.js', 'src/popup.js', 'src/content.js'], outdir: 'dist/extension', bundle: true, format: 'iife', target: 'chrome120', legalComments: 'none' });
console.log('Load dist/extension in Chrome or Edge.');
