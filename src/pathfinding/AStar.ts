import { CampusData, NavNode, NavEdge, RouteFilterType, RouteResult, RouteStep } from '../types/campus';

interface GraphEdge {
  targetId: string;
  weight: number;
  originalEdge: NavEdge;
}

export class AStarPathfinder {
  private nodes: Map<string, NavNode> = new Map();
  private adjList: Map<string, GraphEdge[]> = new Map();

  constructor(campusData: CampusData) {
    this.buildGraph(campusData);
  }

  private buildGraph(data: CampusData) {
    this.nodes.clear();
    this.adjList.clear();

    for (const node of data.navigation.nodes) {
      this.nodes.set(node.id, node);
      this.adjList.set(node.id, []);
    }

    for (const edge of data.navigation.edges) {
      const u = this.nodes.get(edge.from);
      const v = this.nodes.get(edge.to);
      if (!u || !v) continue;

      const physicalDistance = edge.distance ?? this.calculateDistance(u.position, v.position);

      // Add bi-directional edges
      this.adjList.get(edge.from)?.push({
        targetId: edge.to,
        weight: physicalDistance,
        originalEdge: edge
      });

      this.adjList.get(edge.to)?.push({
        targetId: edge.from,
        weight: physicalDistance,
        originalEdge: edge
      });
    }
  }

  private calculateDistance(p1: [number, number, number], p2: [number, number, number]): number {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    const dz = p1[2] - p2[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  public getNode(id: string): NavNode | undefined {
    return this.nodes.get(id);
  }

  public getAllNodes(): NavNode[] {
    return Array.from(this.nodes.values());
  }

  public findPath(
    startNodeId: string,
    goalNodeId: string,
    filter: RouteFilterType = 'shortest'
  ): RouteResult | null {
    const startNode = this.nodes.get(startNodeId);
    const goalNode = this.nodes.get(goalNodeId);

    if (!startNode || !goalNode) return null;
    if (startNodeId === goalNodeId) {
      return {
        pathNodes: [startNode],
        totalDistance: 0,
        estimatedMinutes: 0,
        floorChanges: 0,
        steps: [
          {
            stepNumber: 1,
            instruction: `目的地「${goalNode.name}」に到着しました`,
            nodeId: goalNode.id,
            position: goalNode.position,
            floor: goalNode.floor,
            distance: 0
          }
        ]
      };
    }

    // A* algorithm
    const openSet = new Set<string>([startNodeId]);
    const cameFrom = new Map<string, { prevId: string; edge: NavEdge; stepDist: number }>();

    const gScore = new Map<string, number>();
    gScore.set(startNodeId, 0);

    const fScore = new Map<string, number>();
    fScore.set(startNodeId, this.calculateDistance(startNode.position, goalNode.position));

    while (openSet.size > 0) {
      // Get node in openSet with lowest fScore
      let currentId = '';
      let lowestF = Infinity;
      for (const id of openSet) {
        const score = fScore.get(id) ?? Infinity;
        if (score < lowestF) {
          lowestF = score;
          currentId = id;
        }
      }

      if (currentId === goalNodeId) {
        return this.reconstructPath(cameFrom, currentId, startNode);
      }

      openSet.delete(currentId);
      const neighbors = this.adjList.get(currentId) || [];

      for (const neighbor of neighbors) {
        const edge = neighbor.originalEdge;

        // Filter: Accessible mode ignores non-accessible edges (stairs)
        if (filter === 'accessible' && !edge.isAccessible) {
          continue;
        }

        // Calculate custom edge cost based on filter and human physical burden
        let edgeCost = neighbor.weight;

        // 1. Vertical Circulation Burden:
        // Stairs and Elevators require significant human effort / wait time compared to flat walking.
        // A single floor change (~4.5m height) corresponds to roughly 18-22m of flat walking effort.
        // This naturally prioritizes horizontal plane movement (such as 2F Sky-Bridge)
        // and prevents wasteful down-and-up detour routes!
        if (edge.type === 'stairs') {
          edgeCost += 20.0;
        } else if (edge.type === 'elevator') {
          edgeCost += 24.0;
        } else if (edge.type === 'outdoor') {
          // Slight penalty for outdoor weather exposure, preferring indoor connections
          edgeCost += 6.0;
        }

        // 2. Filter-specific adjustments
        if (filter === 'indoor' && !edge.isIndoor) {
          // Heavy penalty for outdoor edges when raining/indoor prioritized
          edgeCost *= 4.5;
        } else if (filter === 'stairs' && edge.type === 'elevator') {
          // Penalty for elevator wait time when stairs prioritized
          edgeCost += 35.0;
        } else if (filter === 'accessible' && edge.type === 'elevator') {
          // Bonus for elevator in accessible mode
          edgeCost *= 0.8;
        }

        const tentativeG = (gScore.get(currentId) ?? Infinity) + edgeCost;
        const currentNeighborG = gScore.get(neighbor.targetId) ?? Infinity;

        if (tentativeG < currentNeighborG) {
          cameFrom.set(neighbor.targetId, {
            prevId: currentId,
            edge: edge,
            stepDist: neighbor.weight
          });
          gScore.set(neighbor.targetId, tentativeG);

          const neighborNode = this.nodes.get(neighbor.targetId)!;
          const h = this.calculateDistance(neighborNode.position, goalNode.position);
          fScore.set(neighbor.targetId, tentativeG + h);

          openSet.add(neighbor.targetId);
        }
      }
    }

    return null; // Path not found
  }

  private reconstructPath(
    cameFrom: Map<string, { prevId: string; edge: NavEdge; stepDist: number }>,
    currentId: string,
    startNode: NavNode
  ): RouteResult {
    const pathNodes: NavNode[] = [];
    const usedEdges: Array<{ edge: NavEdge; dist: number }> = [];

    let curr = currentId;
    while (curr) {
      const node = this.nodes.get(curr);
      if (node) pathNodes.unshift(node);

      const link = cameFrom.get(curr);
      if (!link) break;
      usedEdges.unshift({ edge: link.edge, dist: link.stepDist });
      curr = link.prevId;
    }

    let totalPhysicalDistance = 0;
    for (const item of usedEdges) {
      totalPhysicalDistance += item.dist;
    }

    // Floor changes count
    let floorChanges = 0;
    for (let i = 1; i < pathNodes.length; i++) {
      if (pathNodes[i].floor !== pathNodes[i - 1].floor) {
        floorChanges += Math.abs(pathNodes[i].floor - pathNodes[i - 1].floor);
      }
    }

    // 80 meters per minute average walking speed + 30s per floor change
    const estimatedMinutes = Math.max(1, Math.round((totalPhysicalDistance / 80 + (floorChanges * 0.5)) * 10) / 10);

    // Generate descriptive textual steps
    const steps: RouteStep[] = [];
    let stepNumber = 1;

    // Initial step
    steps.push({
      stepNumber: stepNumber++,
      instruction: `「${startNode.name}」から出発`,
      nodeId: startNode.id,
      position: startNode.position,
      floor: startNode.floor,
      distance: 0
    });

    for (let i = 0; i < usedEdges.length; i++) {
      const { edge, dist } = usedEdges[i];
      const nextNode = pathNodes[i + 1];
      const prevNode = pathNodes[i];

      let instruction = edge.instruction;
      if (!instruction) {
        if (edge.type === 'stairs') {
          const dir = nextNode.floor > prevNode.floor ? '上がる' : '下りる';
          instruction = `階段で ${nextNode.floor}F へ${dir}`;
        } else if (edge.type === 'elevator') {
          instruction = `エレベーターで ${nextNode.floor}F へ移動`;
        } else if (edge.type === 'bridge') {
          instruction = `2F 連絡スカイブリッジを渡る`;
        } else if (i === usedEdges.length - 1) {
          instruction = `「${nextNode.name}」へ到着`;
        } else {
          instruction = `${nextNode.name} 方面へ進む (${Math.round(dist)}m)`;
        }
      }

      steps.push({
        stepNumber: stepNumber++,
        instruction,
        nodeId: nextNode.id,
        position: nextNode.position,
        floor: nextNode.floor,
        edgeType: edge.type,
        distance: Math.round(dist * 10) / 10
      });
    }

    return {
      pathNodes,
      totalDistance: Math.round(totalPhysicalDistance * 10) / 10,
      estimatedMinutes,
      floorChanges,
      steps
    };
  }
}
