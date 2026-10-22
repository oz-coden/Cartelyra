import type { CampusOverview } from "./schema";
import type { Point2 } from "../types/campus";
import { bounds, interiorPoint, horizontalIntervals, segmentIsWalkable } from "./geometry.js";

// Drawing units, not measured road widths. Validation reserves space beyond both strokes.
export const OVERVIEW_ROAD_WIDTH = 1.1;
export const OVERVIEW_ROAD_GAP = 0.5;

export function overviewPoints(overview: CampusOverview): Point2[] {
  return [...overview.buildings.flatMap(b => b.polygon), ...overview.gates.map(g => g.position),
    ...(overview.contextRoads ?? []).flatMap(r => r.points)];
}

/** Fit names inside footprints, following diagonal blocks and wrapping narrow vertical ones. */
export function overviewBuildingLabel(polygon: Point2[], name: string) {
  const position = interiorPoint(polygon);
  let angle = 0, length = 0;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length], size = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (size > length) { length = size; angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; }
  });
  while (angle > 90) angle -= 180;
  while (angle < -90) angle += 180;
  const project = (p: Point2, degrees: number): Point2 => {
    const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
  };
  let local = polygon.map(p => project(p, angle)), box = bounds(local);
  if (Math.abs(angle) > 50 || box.w < box.d * 2.2) { angle = 0; local = polygon; box = bounds(local); }
  const lines = angle === 0 && box.d > box.w * 1.8 && /^\d+号館$/.test(name)
    ? [name.slice(0, -2), "号館"] : [name];
  // Conservative glyph bounds include padding; the whole label must fit, not only its anchor.
  const textWidth = Math.max(...lines.map(line => Array.from(line).reduce((n, c) => n + (/^[0-9A-Za-z]$/.test(c) ? 0.65 : 1), 0))) + 0.4;
  const textHeight = lines.length * 1.2 + 0.1;
  const rectangle = (p: Point2, size: number): Point2[] => {
    const w = textWidth * size / 2, h = size * textHeight / 2;
    return [[p[0] - w, p[1] - h], [p[0] + w, p[1] - h],
      [p[0] + w, p[1] + h], [p[0] - w, p[1] + h]];
  };
  const ys = [...new Set(local.map(p => p[1]))].sort((a, b) => a - b);
  const center = project(position, angle), candidates: Point2[] = [center];
  for (const y of [box.z, ...ys.slice(1).map((v, i) => (ys[i] + v) / 2)])
    for (const [left, right] of horizontalIntervals(local, y)) candidates.push([(left + right) / 2, y]);
  let best = center, fontSize = 0, score = -1;
  for (const p of candidates) {
    let low = 0, high = Math.min(2.1, box.w / textWidth, box.d / textHeight);
    for (let i = 0; i < 10; i++) {
      const size = (low + high) / 2, rect = rectangle(p, size);
      if (rect.every((a, i) => segmentIsWalkable(a, rect[(i + 1) % rect.length], local, []))) low = size;
      else high = size;
    }
    const value = low / (1 + Math.hypot(p[0] - center[0], p[1] - center[1]) / Math.min(box.w, box.d));
    if (value > score) { score = value; best = p; fontSize = low; }
  }
  return { position: project(best, -angle), angle, fontSize, lines };
}
