#!/usr/bin/env node
/**
 * Concatenates src/*.js (sorted by filename — the numeric prefixes define
 * the order) into dist/pub-overview-plugin.js. No transpilation, no
 * minification: the deployed file stays debuggable in the browser console.
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const outFile = path.join(__dirname, 'dist', 'pub-overview-plugin.js');

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
if (!files.length) {
  console.error('No source files found in src/');
  process.exit(1);
}

const parts = files.map((f) => fs.readFileSync(path.join(srcDir, f), 'utf8'));
const output = parts.join('\n');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, output);

console.log(`Built ${path.relative(__dirname, outFile)} from ${files.length} files (${(output.length / 1024).toFixed(1)} KB)`);
