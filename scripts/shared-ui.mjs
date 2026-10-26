import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const repository = 'oz-coden/oz-coden.com-ui-web';
const paths = { 'ui.css': 'assets/ui.css', LICENSE: 'LICENSE' };
const hash = content => createHash('sha256').update(content).digest('hex');
const destination = new URL('public/vendor/ui/', root);
const manifestURL = new URL('shared-ui.json', root);

if (process.argv[2] === '--update') {
  const commit = process.argv[3];
  if (!/^[a-f0-9]{40}$/.test(commit ?? ''))
    throw new Error('Usage: npm run sync:ui -- <40-character-commit-sha>');
  // Download every file before replacing the pinned local copy.
  const files = await Promise.all(Object.entries(paths).map(async ([name, path]) => {
    const response = await fetch(`https://raw.githubusercontent.com/${repository}/${commit}/${path}`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return [name, Buffer.from(await response.arrayBuffer())];
  }));
  await mkdir(destination, { recursive: true });
  for (const [name, content] of files) await writeFile(new URL(name, destination), content);
  await writeFile(manifestURL, JSON.stringify({ repository, commit,
    files: Object.fromEntries(files.map(([name, content]) => [name, hash(content)])),
  }, null, 2) + '\n');
  console.log(`Updated shared UI from ${repository}@${commit}`);
} else if (process.argv[2] === '--check') {
  const manifest = JSON.parse(await readFile(manifestURL, 'utf8'));
  if (manifest.repository !== repository || !/^[a-f0-9]{40}$/.test(manifest.commit))
    throw new Error('Invalid shared-ui.json source');
  for (const name of Object.keys(paths)) {
    const content = await readFile(new URL(name, destination));
    if (hash(content) !== manifest.files[name])
      throw new Error(`Shared UI checksum mismatch: ${name}. Restore or sync the pinned copy.`);
  }
  console.log(`Verified shared UI ${manifest.commit}`);
} else {
  throw new Error('Use --check or --update <40-character-commit-sha>');
}
