import manifestJson from './campus.json';
import { compileCampus } from './compile';
import type { BuildingSource, CampusSource, FloorSource } from './schema';

const buildings = Object.values(import.meta.glob<BuildingSource>('./buildings/*/building.json', { eager: true, import: 'default' }));
const floors = Object.values(import.meta.glob<FloorSource>('./buildings/*/floors/*.json', { eager: true, import: 'default' }));
export const campusData = compileCampus(manifestJson as unknown as CampusSource, buildings, floors);
