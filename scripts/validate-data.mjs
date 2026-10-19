import { readData } from './read-data.mjs';
import { validateSources } from '../.checks/data/validate.js';
try {
  const d = await readData();
  const errors = validateSources(d.manifest, d.buildings, d.floors, d.sources, d.overview);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`Validated ${d.buildings.length} building, ${d.floors.length} floors, ${d.floors.reduce((n, f) => n + f.rooms.length, 0)} rooms.`);
} catch (error) { console.error(`Invalid campus data: ${error.message}`); process.exitCode = 1; }
