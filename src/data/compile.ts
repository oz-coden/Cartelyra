import type { CampusData, Floor, NavNode, NavEdge } from '../types/campus';
import type { BuildingSource, CampusSource, FloorSource } from './schema';
import { bounds, localToWorld } from './geometry.js';

/** Authoring data remains local to each floor. Only this boundary creates world coordinates. */
export function compileCampus(manifest: CampusSource, buildings: BuildingSource[], floors: FloorSource[]): CampusData {
  const nodes: NavNode[] = [], edges: NavEdge[] = [];
  const runtimeBuildings = manifest.buildingIds.map(id => {
    const source = buildings.find(b => b.id === id);
    if (!source) throw new Error(`Unknown building: ${id}`);
    const runtimeFloors: Floor[] = source.floorIds.map(floorId => {
      const floor = floors.find(f => f.id === floorId && f.buildingId === source.id);
      if (!floor) throw new Error(`Unknown floor: ${floorId}`);
      const qualify = (nodeId: string) => `${source.id}/${floor.id}/${nodeId}`;
      for (const node of floor.navigation.nodes) {
        nodes.push({ ...node, id: qualify(node.id), buildingId: source.id, floor: floor.level,
          position: localToWorld(source, node.position, floor.elevation) });
      }
      for (const edge of floor.navigation.edges) edges.push({ ...edge, from: qualify(edge.from), to: qualify(edge.to) });
      return { ...floor, slab: bounds(floor.outline), rooms: floor.rooms.map(room => ({
        ...room, buildingId: source.id, floorLevel: floor.level, box: { ...bounds(room.polygon), h: 4 },
        entranceNodeId: room.entrance ? qualify(room.entrance) : undefined, verification: 'diagram'
      })) };
    });
    edges.push(...source.connections);
    return { ...source, floors: runtimeFloors };
  });
  return { campusName: manifest.campusName, coordinateUnit: manifest.coordinateUnit,
    buildings: runtimeBuildings, navigation: { nodes, edges } };
}
