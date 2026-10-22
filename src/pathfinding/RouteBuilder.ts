import type { CampusData, NavNode, RouteResult, RouteStep } from "../types/campus";
import { edgeCover, type Traversal } from "./RoutePolicy.js";

/** Presentation is independent of graph search and preserves explicit directional instructions. */
export class RouteBuilder {
  private floorNames = new Map<string, string>();
  constructor(private data: CampusData) {
    for (const b of data.buildings) for (const f of b.floors)
      this.floorNames.set(`${b.id}/${f.level}`, `${b.name} ${f.label}`);
  }
  build(pathNodes: NavNode[], links: Traversal[], routingCost: number): RouteResult {
    const distanceUnit = this.data.coordinateUnit ?? "meters";
    const floorChanges = links.reduce((sum, l) => sum + l.floorChanges, 0);
    const totalDistance = links.reduce((sum, l) => sum + l.length, 0);
    const verticalMovements = {
      stairs: links.filter(l => l.edge.type === "stairs").length,
      elevators: links.filter(l => l.edge.type === "elevator").length,
      unmeasured: links.reduce((sum, l) => sum + l.unmeasuredVertical, 0),
    };
    const first = pathNodes[0];
    const steps: RouteStep[] = [{ stepNumber: 1,
      instruction: links.length ? `「${first.name}」から出発` : `「${first.name}」に到着しています`,
      nodeId: first.id, position: first.position, floor: first.floor, buildingId: first.buildingId, distance: 0 }];
    links.forEach((link, i) => {
      const from = pathNodes[i], to = pathNodes[i + 1];
      const floor = this.floorNames.get(`${to.buildingId}/${to.floor}`) ?? to.name;
      let instruction = link.reversed ? link.edge.reverseInstruction : link.edge.instruction;
      if (!instruction) {
        if (link.edge.type === "stairs" || link.edge.type === "elevator")
          instruction = `${link.edge.type === "stairs" ? "階段" : "EV"}で「${floor}」へ移動`;
        else if (from.buildingId && !to.buildingId) instruction = `「${from.name}」から屋外へ出る`;
        else if (!from.buildingId && to.buildingId) instruction = `${floor} の「${to.name}」から建物に入る`;
        else if (from.buildingId !== to.buildingId) instruction = `${edgeCover(link.edge) === "covered" ? "屋根付き連絡通路" : "連絡通路"}で ${floor} の「${to.name}」へ移動`;
        else instruction = i === links.length - 1 ? `「${to.name}」に到着` : `${to.name} へ進む`;
      }
      steps.push({ stepNumber: i + 2, instruction, nodeId: to.id, position: to.position,
        floor: to.floor, buildingId: to.buildingId, edgeType: link.edge.type, cover: edgeCover(link.edge),
        distance: distanceUnit === "meters" ? Math.round(link.length * 10) / 10 : 0 });
    });
    return { pathNodes, totalDistance: Math.round(totalDistance * 10) / 10, floorChanges,
      estimatedMinutes: distanceUnit === "meters" && links.length
        ? Math.round((totalDistance / 80 + (floorChanges + verticalMovements.unmeasured) * .5) * 10) / 10 : 0,
      steps, distanceUnit, routingCost, verticalMovements,
      inferredConnections: links.filter(l => l.edge.verification !== "verified").length };
  }
}
