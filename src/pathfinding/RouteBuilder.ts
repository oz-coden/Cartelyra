import type { CampusData, NavNode, RouteResult, RouteStep } from "../types/campus";
import { edgeCover, type Traversal } from "./RoutePolicy.js";

/** Presentation is independent of graph search and preserves explicit directional instructions. */
export class RouteBuilder {
  private floorNames = new Map<string, string>();
  private nodeNames: Map<string, string>;
  private outdoorLayers: Map<string, string | undefined>;
  constructor(private data: CampusData) {
    this.nodeNames = new Map(data.navigation.nodes.map(n => [n.id, n.name]));
    this.outdoorLayers = new Map(data.navigation.nodes.map(n => [n.id, n.outdoorLayer]));
    for (const b of data.buildings) for (const f of b.floors)
      this.floorNames.set(`${b.id}/${f.level}`, `${b.name} ${f.label}`);
  }
  build(pathNodes: NavNode[], links: Traversal[], routingCost: number): RouteResult {
    const distanceUnit = this.data.coordinateUnit ?? "meters";
    const floorChanges = links.reduce((sum, l) => sum + l.floorChanges, 0);
    const totalDistance = links.reduce((sum, l) => sum + l.length, 0);
    const verticalMovements = {
      stairs: links.filter(l => l.edge.type === "stairs").length,
      ramps: links.filter(l => l.edge.type === "ramp").length,
      elevators: links.filter(l => l.edge.type === "elevator").length,
      unmeasured: links.reduce((sum, l) => sum + l.unmeasuredVertical, 0),
    };
    const first = pathNodes[0];
    const steps: RouteStep[] = [{ stepNumber: 1,
      instruction: links.length ? `${first.name}から出発` : `${first.name}に到着`,
      nodeId: first.id, position: first.position, floor: first.floor, buildingId: first.buildingId, distance: 0 }];
    links.forEach((link, i) => {
      const from = pathNodes[i], to = pathNodes[i + 1];
      const floor = this.floorNames.get(`${to.buildingId}/${to.floor}`) ?? to.name;
      let instruction = link.reversed ? link.edge.reverseInstruction : link.edge.instruction;
      if (!instruction) {
        if (link.edge.type === "stairs" || link.edge.type === "ramp" || link.edge.type === "elevator")
          instruction = `${link.edge.type === "stairs" ? "階段" : link.edge.type === "ramp" ? "スロープ" : "EV"}で${floor}へ`;
        else if (from.buildingId && !to.buildingId) instruction = "屋外へ出る";
        else if (!from.buildingId && to.buildingId) instruction = `${floor}へ入る`;
        else if (from.buildingId !== to.buildingId) instruction = `${edgeCover(link.edge) === "covered" ? "屋根付き連絡通路" : "連絡通路"}で${floor}へ`;
        else instruction = i === links.length - 1 ? `${to.name}に到着` : `${to.name}へ`;
      }
      steps.push({ stepNumber: i + 2, instruction, nodeId: to.id, position: to.position,
        floor: to.floor, buildingId: to.buildingId, edgeType: link.edge.type, cover: edgeCover(link.edge),
        distance: distanceUnit === "meters" ? Math.round(link.length * 10) / 10 : 0 });
    });
    return { pathNodes, totalDistance: Math.round(totalDistance * 10) / 10, floorChanges,
      estimatedMinutes: distanceUnit === "meters" && links.length
        ? Math.round((totalDistance / 80 + (floorChanges + verticalMovements.unmeasured) * .5) * 10) / 10 : 0,
      steps: this.compactSteps(steps, links), distanceUnit, routingCost, verticalMovements,
      inferredConnections: links.filter(l => l.edge.verification !== "verified").length };
  }
  private compactSteps(steps: RouteStep[], links: Traversal[]): RouteStep[] {
    const result = [steps[0]];
    let carryDistance = 0;
    const localWalk = (i: number) => {
      const link = links[i - 1], from = steps[i - 1], to = steps[i];
      return link?.edge.type === "walk" && !link.edge.instruction && !link.edge.reverseInstruction &&
        from.buildingId === to.buildingId && from.floor === to.floor;
    };
    const straightOutside = (i: number) => {
      const [a, b, c] = [steps[i - 1], steps[i], steps[i + 1]];
      if (!c || [a, b, c].some(s => s.buildingId) || b.edgeType !== "outdoor" || c.edgeType !== "outdoor" || b.cover !== c.cover) return false;
      // Authored landmarks and directional instructions must remain individual guide cards.
      if ([links[i - 1], links[i]].some(link => link.edge.instruction || link.edge.reverseInstruction)) return false;
      if (this.outdoorLayers.get(a.nodeId) !== this.outdoorLayers.get(b.nodeId) || this.outdoorLayers.get(b.nodeId) !== this.outdoorLayers.get(c.nodeId)) return false;
      const ab = [b.position[0] - a.position[0], b.position[2] - a.position[2]], bc = [c.position[0] - b.position[0], c.position[2] - b.position[2]];
      const length = Math.hypot(...ab) * Math.hypot(...bc);
      return length > 1e-8 && (ab[0] * bc[0] + ab[1] * bc[1]) / length > .995;
    };
    for (let i = 1; i < steps.length; i++) {
      let end = i, distance = steps[i].distance;
      if (localWalk(i)) {
        while (end + 1 < steps.length && localWalk(end + 1) && steps[end + 1].cover === steps[i].cover) {
          end++; distance += steps[end].distance;
        }
        // Routing junctions remain in pathNodes; the guide uses the next named landmark.
        if (distance === 0 && end < steps.length - 1 && /^(通路(の分岐)?|廊下|分岐|連絡通路[東西南北]側)$/.test(this.nodeName(steps[end].nodeId))) {
          carryDistance += distance; i = end; continue;
        }
      } else {
        while (straightOutside(end)) { end++; distance += steps[end].distance; }
      }
      const step = { ...steps[end], distance: Math.round((distance + carryDistance) * 10) / 10 };
      if (localWalk(i) && end < steps.length - 1) step.instruction = this.nodeName(step.nodeId) === "通路の分岐" ? "通路を進む" : `${this.nodeName(step.nodeId)}へ`;
      result.push(step); carryDistance = 0; i = end;
    }
    return result.map((step, i) => ({ ...step, stepNumber: i + 1 }));
  }
  private nodeName(id: string) { return this.nodeNames.get(id) ?? "通路"; }
}
