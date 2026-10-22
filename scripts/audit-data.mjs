import { writeFile } from 'node:fs/promises';
import { readData } from './read-data.mjs';
import { validateSources } from '../.checks/data/validate.js';
import { compileCampus } from '../.checks/data/compile.js';
import { auditGeometry, auditRoutes } from '../.checks/data/audit.js';

try {
  const args = process.argv.slice(2);
  let jsonPath, mode = 'shortest';
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (flag === '--json' && value) jsonPath = value;
    else if (flag === '--mode' && ['shortest', 'accessible', 'indoor', 'stairs'].includes(value)) mode = value;
    else throw new Error('Usage: npm run audit:data -- [--json report.json] [--mode shortest|accessible|indoor|stairs]');
  }
  const source = await readData();
  const errors = validateSources(source.manifest, source.buildings, source.floors, source.sources, source.overview);
  if (errors.length) throw new Error(errors.join('\n'));
  const routes = auditRoutes(compileCampus(source.manifest, source.buildings, source.floors), mode);
  const findings = [...auditGeometry(source.floors), ...routes.findings];
  const report = { buildings: source.buildings.length, floors: source.floors.length,
    rooms: source.floors.reduce((sum, f) => sum + f.rooms.length, 0),
    checkedPairs: routes.checkedPairs, mode, findings };
  console.log(`Audited ${report.buildings} buildings, ${report.floors} floors, ${report.rooms} rooms and ${report.checkedPairs} room pairs (${mode}).`);
  console.log('Findings are review candidates, not validation failures; intentional room containment is allowed.');
  const counts = new Map();
  for (const finding of findings) counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
  for (const [code, count] of counts) console.log(`${code}: ${count}`);
  for (const finding of findings.slice(0, 12)) console.log(`[${finding.code}] ${finding.buildingId}/${finding.floorId ?? '*'} ${finding.roomIds?.join(', ') ?? ''}: ${finding.detail}`);
  if (findings.length > 12) console.log(`${findings.length - 12} additional findings; use --json to inspect all records.`);
  if (!findings.length) console.log('No review candidates found.');
  if (jsonPath) { await writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n'); console.log(`Report: ${jsonPath}`); }
} catch (error) { console.error(`Cannot audit campus data: ${error.message}`); process.exitCode = 1; }
