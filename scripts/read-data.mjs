import { readFile, readdir } from 'node:fs/promises';
const base = new URL('../src/data/', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, base), 'utf8'));
export async function readData() {
  const directories = (await readdir(new URL('buildings/', base), { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
  const buildings = await Promise.all(directories.map(dir => read(`buildings/${dir}/building.json`)));
  const floors = (await Promise.all(directories.map(async dir => {
    const names = (await readdir(new URL(`buildings/${dir}/floors/`, base))).filter(name => name.endsWith('.json'));
    return Promise.all(names.map(name => read(`buildings/${dir}/floors/${name}`)));
  }))).flat();
  return { manifest: await read('campus.json'), buildings, floors, sources: await read('sources.json'), overview: await read('overview.json') };
}
