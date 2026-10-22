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

function horizontalIntervals(polygon: Point2[], y: number): Array<[number, number]> {
  const xs: number[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if ((a[1] > y) !== (b[1] > y))
      xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  });
  xs.sort((a, b) => a - b);
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xs.length; i += 2) intervals.push([xs[i], xs[i + 1]]);
  return intervals;
}

/** Points shared by two closed segments, including endpoints of collinear overlap. */
export function segmentIntersections(a: Point2, b: Point2, c: Point2, d: Point2): Point2[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], ex = d[0] - c[0], ey = d[1] - c[1];
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) > 1e-10) {
    const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / denominator;
    const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / denominator;
    return t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8
      ? [[a[0] + t * dx, a[1] + t * dy]] : [];
  }
  const on = (p: Point2, a: Point2, b: Point2) =>
    Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) < 1e-8 &&
    p[0] >= Math.min(a[0], b[0]) - 1e-8 && p[0] <= Math.max(a[0], b[0]) + 1e-8 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-8 && p[1] <= Math.max(a[1], b[1]) + 1e-8;
  return [a, b, c, d].filter((p, i, all) => on(p, a, b) && on(p, c, d) &&
    !all.slice(0, i).some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-8));
}

export function polygonArea(polygon: Point2[]): number {
  return Math.abs(polygon.reduce((area, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return area + a[0] * b[1] - b[0] * a[1];
  }, 0)) / 2;
}

/** Integrate intersecting scanline intervals between vertices and edge crossings. */
export function polygonOverlapArea(a: Point2[], b: Point2[]): number {
  const ys = [...a, ...b].map(p => p[1]);
  a.forEach((p, i) => b.forEach((q, j) => {
    ys.push(...segmentIntersections(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length]).map(p => p[1]));
  }));
  const cuts = [...new Set(ys)].sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < cuts.length; i++) {
    const y = (cuts[i - 1] + cuts[i]) / 2;
    for (const [left, right] of horizontalIntervals(a, y))
      for (const [otherLeft, otherRight] of horizontalIntervals(b, y))
        area += Math.max(0, Math.min(right, otherRight) - Math.max(left, otherLeft)) * (cuts[i] - cuts[i - 1]);
  }
  return area;
}

/** Keep labels and selection anchors inside concave rooms as well as rectangles. */
export function interiorPoint(polygon: Point2[]): Point2 {
  const box = bounds(polygon), center: Point2 = [box.x, box.z];
  if (pointInInterior(center, polygon)) return center;
  const ys = [...new Set(polygon.map(p => p[1]))].sort((a, b) => a - b);
  let best: Point2 | undefined, clearance = -1;
  for (let i = 1; i < ys.length; i++) {
    const y = (ys[i - 1] + ys[i]) / 2;
    for (const [left, right] of horizontalIntervals(polygon, y)) {
      const p: Point2 = [(left + right) / 2, y];
      const distance = Math.min(...polygon.map((a, i) => {
        const b = polygon[(i + 1) % polygon.length], dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
      }));
      if (distance > clearance) { clearance = distance; best = p; }
    }
  }
  if (!best) throw new Error("Cannot place a label inside a zero-area polygon");
  return best;
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
