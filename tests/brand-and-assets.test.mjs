import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { absolute, listFiles, readBytes, readText, root } from './helpers.mjs';

const index = readText('index.html');
const legacyBrand = ['vimi', 'cx'].join('');
const legacyDomain = `${legacyBrand}.com`;

test('repository contains no legacy brand text in text or binary files', () => {
  const offenders = [];

  for (const file of listFiles()) {
    const bytes = readFileSync(file);
    const relativePath = relative(root, file);
    const latinText = bytes.toString('latin1').toLowerCase();
    const utf16Text =
      bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe
        ? bytes.subarray(2).toString('utf16le').toLowerCase()
        : '';

    if (latinText.includes(legacyBrand) || utf16Text.includes(legacyBrand)) {
      offenders.push(relativePath);
    }
  }

  assert.deepEqual(offenders, []);
});

test('repository contains no legacy brand filenames', () => {
  const offenders = listFiles()
    .map((file) => relative(root, file))
    .filter((file) => file.toLowerCase().includes(legacyBrand));

  assert.deepEqual(offenders, []);
});

test('homepage brand, primary domain, and social metadata use Vimix', () => {
  assert.match(index, /<title>Vimix<\/title>/);
  assert.match(index, /\bVIMIX\b/);
  assert.match(index, /property="og:title" content="Vimix /);
  assert.match(index, /property="og:url" content="https:\/\/vimix\.us"/);
  assert.match(index, /name="twitter:title" content="Vimix /);
  assert.doesNotMatch(index.toLowerCase(), new RegExp(legacyDomain.replace('.', '\\.')));
});

test('organization structured data is valid and uses the primary brand/domain', () => {
  const match = index.match(
    /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/,
  );
  assert.ok(match, 'Organization JSON-LD block is missing');

  const organization = JSON.parse(match[1]);
  assert.equal(organization['@context'], 'https://schema.org');
  assert.equal(organization['@type'], 'Organization');
  assert.equal(organization.name, 'Vimix');
  assert.equal(organization.url, 'https://vimix.us');
  assert.match(organization.description, /^Vimix /);
});

test('AI-readable site summary uses the current brand and domain', () => {
  const llms = readText('llms.txt');
  assert.match(llms, /^# Vimix$/m);
  assert.match(llms, /Website URL\*\*: https:\/\/vimix\.us/);
  assert.doesNotMatch(llms.toLowerCase(), new RegExp(legacyBrand));
});

test('all static relative assets referenced by index.html exist', () => {
  const missing = [];
  const referencePattern = /\b(?:src|href)="([^"]+)"/g;
  const activeMarkup = index.replace(/<!--[\s\S]*?-->/g, '');

  for (const [, rawReference] of activeMarkup.matchAll(referencePattern)) {
    if (
      rawReference.startsWith('http://') ||
      rawReference.startsWith('https://') ||
      rawReference.startsWith('#') ||
      rawReference.startsWith('mailto:') ||
      rawReference.startsWith('tel:') ||
      rawReference.startsWith('data:')
    ) {
      continue;
    }

    const cleanReference = decodeURIComponent(rawReference.split(/[?#]/, 1)[0]);
    if (cleanReference && !existsSync(absolute(cleanReference))) {
      missing.push(cleanReference);
    }
  }

  assert.deepEqual(missing, []);
});

test('renamed logo is a valid PNG and every logo reference uses it', () => {
  const logoPath = 'img/VimixLogoTransparentPNG.png';
  const signature = readBytes(logoPath).subarray(0, 8);

  assert.deepEqual(
    [...signature],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  assert.equal((index.match(/img\/VimixLogoTransparentPNG\.png/g) ?? []).length, 3);
});

test('public JavaScript namespace is consistently migrated to window.vimix', () => {
  const runtimeSources = [
    readText('index.html'),
    readText('main.js'),
    ...listFiles(absolute('dev'))
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFileSync(file, 'utf8')),
  ].join('\n');

  assert.doesNotMatch(runtimeSources.toLowerCase(), new RegExp(`window\\.${legacyBrand}`));
  assert.match(runtimeSources, /window\.vimixEditorLogs/);
  assert.match(runtimeSources, /window\.vimixScreenLayout/);
  assert.match(runtimeSources, /window\.vimixCameraPath/);
  assert.match(runtimeSources, /window\.vimixTextConfig/);
});

test('UTF-16 legacy sources retain their byte-order marks', () => {
  for (const relativePath of ['history.txt', 'initial_main.js']) {
    const bytes = readBytes(relativePath);
    assert.equal(bytes[0], 0xff, `${relativePath} lost its UTF-16 LE BOM`);
    assert.equal(bytes[1], 0xfe, `${relativePath} lost its UTF-16 LE BOM`);
    assert.match(readText(relativePath), /Vimix/i);
  }
});

test('binary STL remains structurally valid after its header rename', () => {
  const stl = readBytes('3d assets/terrain_wireframe.stl');
  const header = stl.subarray(0, 80).toString('ascii').replace(/\0+$/, '');
  const triangleCount = stl.readUInt32LE(80);

  assert.match(header, /^Vimix Terrain Wireframe STL/);
  assert.equal(stl.length, 84 + triangleCount * 50);
});

test('all runtime JavaScript files pass Node syntax checking', () => {
  const runtimeFiles = [
    absolute('main.js'),
    absolute('supabase.js'),
    ...listFiles(absolute('dev')).filter((file) => file.endsWith('.js')),
  ];

  for (const file of runtimeFiles) {
    const result = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `${relative(root, file)} failed syntax checking:\n${result.stderr}`,
    );
  }
});

test('robots.txt permits Google and general web crawling', () => {
  const robots = readText('robots.txt');
  assert.match(robots, /User-agent: \*\s+Allow: \//);
  assert.match(robots, /User-agent: Googlebot\s+Allow: \//);
});

test('Vercel applies immutable caching only to screen media', () => {
  const config = JSON.parse(readText('vercel.json'));
  assert.deepEqual(config.headers, [
    {
      source: '/img/screen-media/(.*)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
  ]);
});
