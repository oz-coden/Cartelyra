import type { Building, Point2, RoomBox } from '../types/campus';

export function bounds(polygon: Point2[]): RoomBox {
  const xs = polygon.map(p => p[0]);
  const zs = polygon.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ };
}

export function localToWorld(building: Pick<Building, 'origin' | 'rotation'>, point: Point2, elevation: number): [number, number, number] {
  const angle = building.rotation ?? 0, c = Math.cos(angle), s = Math.sin(angle);
  return [building.origin[0] + c * point[0] + s * point[1], building.origin[1] + elevation,
    building.origin[2] - s * point[0] + c * point[1]];
}

export function worldToLocal(building: Pick<Building, 'origin' | 'rotation'>, position: [number, number, number]): Point2 {
  const x = position[0] - building.origin[0], z = position[2] - building.origin[2];
  const angle = building.rotation ?? 0, c = Math.cos(angle), s = Math.sin(angle);
  return [c * x - s * z, s * x + c * z];
}

// Boundary points count as inside, allowing entrances on room walls.
export function pointInPolygon(point: Point2, polygon: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < 1e-7 && point[0] >= Math.min(a[0], b[0]) && point[0] <= Math.max(a[0], b[0]) &&
      point[1] >= Math.min(a[1], b[1]) && point[1] <= Math.max(a[1], b[1])) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function pointInInterior(point: Point2, polygon: Point2[]): boolean {
  if (!pointInPolygon(point, polygon)) return false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < 1e-7 && point[0] >= Math.min(a[0], b[0]) - 1e-7 && point[0] <= Math.max(a[0], b[0]) + 1e-7 &&
      point[1] >= Math.min(a[1], b[1]) - 1e-7 && point[1] <= Math.max(a[1], b[1]) + 1e-7) return false;
  }
  return true;
}

/** Test every interval cut by polygon edges, so narrow obstacles cannot be skipped. */
export function segmentIsWalkable(a: Point2, b: Point2, outline: Point2[], obstacles: Point2[][]): boolean {
  const cuts = [0, 1], dx = b[0] - a[0], dz = b[1] - a[1];
  for (const polygon of [outline, ...obstacles]) {
    for (let i = 0; i < polygon.length; i++) {
      const c = polygon[i], d = polygon[(i + 1) % polygon.length];
      const ex = d[0] - c[0], ez = d[1] - c[1], denominator = dx * ez - dz * ex;
      if (Math.abs(denominator) < 1e-10) continue;
      const t = ((c[0] - a[0]) * ez - (c[1] - a[1]) * ex) / denominator;
      const u = ((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / denominator;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
    }
  }
  cuts.sort((x, y) => x - y);
  const samples = [0, 1, ...cuts.slice(1).map((t, i) => (cuts[i] + t) / 2)];
  return samples.every(t => {
    const p: Point2 = [a[0] + dx * t, a[1] + dz * t];
    return pointInPolygon(p, outline) && !obstacles.some(polygon => pointInInterior(p, polygon));
  });
}
