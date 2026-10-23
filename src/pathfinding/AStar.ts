import type { CampusData, NavNode, RouteFilterType, RouteResult } from "../types/campus";
import { RoutePolicy, type SearchCost, type Traversal } from "./RoutePolicy.js";
import { RouteBuilder } from "./RouteBuilder.js";

/** Exact non-negative search with h=0, including lexicographic reference-map preferences. */
export class AStarPathfinder {
  private nodes = new Map<string, NavNode>();
  private adjacency = new Map<string, Traversal[]>();
  private policy: RoutePolicy;
  private builder: RouteBuilder;
  constructor(data: CampusData) {
    this.policy = new RoutePolicy(data);
    this.builder = new RouteBuilder(data);
    for (const node of data.navigation.nodes) {
      if (this.nodes.has(node.id)) throw new Error(`Duplicate navigation node: ${node.id}`);
      this.nodes.set(node.id, node); this.adjacency.set(node.id, []);
    }
    for (const edge of data.navigation.edges) {
      const a = this.nodes.get(edge.from), b = this.nodes.get(edge.to);
      if (!a || !b) throw new Error(`Unknown edge endpoint: ${edge.from} -> ${edge.to}`);
      const link = this.policy.traversal(edge, a, b);
      if (edge.blocked) continue;
      this.adjacency.get(a.id)!.push(link);
      if (edge.bidirectional !== false) this.adjacency.get(b.id)!.push({ ...link, targetId: a.id, reversed: true });
    }
  }
  public getNode(id: string) { return this.nodes.get(id); }
  public getAllNodes() { return [...this.nodes.values()]; }
  public findPath(startId: string, goalId: string, filter: RouteFilterType = "shortest", allowInferred = true): RouteResult | null {
    const start = this.nodes.get(startId), goal = this.nodes.get(goalId);
    if (!start || !goal) return null;
    const compare = this.policy.comparator(start, goal);
    const floorDetours = this.policy.floorDetourCounter(start, goal);
    const open = new Set([startId]);
    const costs = new Map<string, SearchCost>([[startId, { vertical: 0, floorDetours: 0, boundaries: 0, cost: 0 }]]);
    const previous = new Map<string, { from: string; link: Traversal }>();
    while (open.size) {
      const current = [...open].reduce((a, b) => compare(costs.get(b)!, costs.get(a)!) < 0 ? b : a);
      open.delete(current);
      if (current === goalId) {
        const path = [goal], links: Traversal[] = [];
        for (let id = goalId; id !== startId;) {
          const p = previous.get(id)!; links.unshift(p.link); id = p.from; path.unshift(this.nodes.get(id)!);
        }
        return this.builder.build(path, links, costs.get(goalId)!.cost);
      }
      for (const link of this.adjacency.get(current)!) {
        if (!this.policy.permitted(link.edge, filter, allowInferred)) continue;
        const cost = costs.get(current)!;
        const next = { vertical: cost.vertical + link.floorChanges + link.unmeasuredVertical,
          floorDetours: cost.floorDetours + floorDetours(link),
          boundaries: cost.boundaries + link.boundaryChanges, cost: cost.cost + this.policy.cost(link, filter) };
        if (!costs.has(link.targetId) || compare(next, costs.get(link.targetId)!) < 0) {
          costs.set(link.targetId, next); previous.set(link.targetId, { from: current, link }); open.add(link.targetId);
        }
      }
    }
    return null;
  }
}
