import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function absolute(relativePath) {
  return join(root, relativePath);
}

export function readBytes(relativePath) {
  return readFileSync(absolute(relativePath));
}

export function readText(relativePath) {
  const bytes = readBytes(relativePath);

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString('utf16le');
  }

  return bytes.toString('utf8').replace(/^\uFEFF/, '');
}

export function listFiles(directory = root) {
  const ignoredDirectories = new Set(['.git', 'node_modules']);
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }

  return files;
}
